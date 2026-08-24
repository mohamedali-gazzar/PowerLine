import { useEffect, useState } from "react";
import { api, type LockState } from "../api";

const HEARTBEAT_MS = 15_000; // well inside the server's 45s TTL

/**
 * "Someone is reviewing this" lock for approvers. Turn it on (`enabled`) only for an
 * approver viewing something that is Waiting for approval. While on, it acquires the lock,
 * heartbeats to keep it, and releases it when the component unmounts or navigation happens.
 * If another approver already holds a live lock, `mine` is false and `heldBy` names them.
 * A closed tab / crash frees the lock automatically once the heartbeat lapses (server TTL).
 */
export function useReviewLock(id: string | undefined, enabled: boolean) {
  const [state, setState] = useState<LockState>({ mine: false, heldBy: null });

  useEffect(() => {
    if (!id || !enabled) { setState({ mine: false, heldBy: null }); return; }
    let alive = true;
    const ping = (force = false) =>
      api.locks.acquire(id, force).then((s) => { if (alive) setState(s); }).catch(() => {});
    ping();
    const t = setInterval(() => ping(), HEARTBEAT_MS);
    // Best-effort release if the tab is closed (the TTL is the real backstop).
    const onUnload = () => { try { api.locks.release(id); } catch { /* ignore */ } };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("beforeunload", onUnload);
      api.locks.release(id).catch(() => {});
    };
  }, [id, enabled]);

  const takeOver = () => {
    if (id) api.locks.acquire(id, true).then(setState).catch(() => {});
  };
  return { mine: state.mine, heldBy: state.heldBy, takeOver };
}
