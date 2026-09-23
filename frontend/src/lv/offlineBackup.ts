// A copy of the quotation kept on this device, so losing the network cannot lose the work.
//
// WHY THIS EXISTS. Autosave writes to the server and nowhere else, so an unsaved quotation
// lived only in the browser tab's memory. On 23 September 2026 an estimator worked for about
// six hours with the internet down: every save failed, the failure was swallowed silently,
// and when the tab was closed the work was gone. The server had never received any of it.
//
// A warning light alone would not have saved that work — it only tells you the bad news
// sooner. What saves it is writing the state to disk on this device, so it survives an
// offline spell, a closed tab, a reload, and a browser crash, and can be restored when the
// quotation is opened again.
//
// This is a SAFETY NET, never the source of truth. The server is always authoritative; a
// backup is offered back to the user and only becomes real when they accept it.

const PREFIX = "pl-qtn-backup:";

export interface Backup {
  /** When this device last wrote the backup (epoch ms). */
  savedAt: number;
  /** The quotation state, already serialized — compared as a string, never re-ordered. */
  state: string;
  /** Who was signed in. A shared machine must not offer one person's work to another. */
  userId: string;
}

const keyOf = (qtnId: string) => PREFIX + qtnId;

/**
 * Everything here is wrapped: localStorage throws in private mode, when the origin's
 * storage is blocked, and when the quota is full. A backup failing must never break the
 * editor — it is a safety net, and a net that tears is still better than no net.
 */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Drop every other quotation's backup. Called when one refuses to fit. */
function pruneOthers(keepQtnId: string): void {
  safe(() => {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k !== keyOf(keepQtnId)) doomed.push(k);
    }
    for (const k of doomed) localStorage.removeItem(k);
  }, undefined);
}

/**
 * Write the backup. Returns false when it could not be stored, so the caller can tell the
 * user the net is not there rather than implying a safety that does not exist.
 *
 * A real quotation is hundreds of kilobytes and the quota is a few megabytes, so a full
 * store is a genuine possibility. On quota failure every OTHER quotation's backup is
 * dropped and the write retried — the one open on screen is the one that matters.
 */
export function writeBackup(qtnId: string, state: string, userId: string): boolean {
  const record: Backup = { savedAt: Date.now(), state, userId };
  const body = safe(() => JSON.stringify(record), "");
  if (body === "") return false;
  const put = () => {
    localStorage.setItem(keyOf(qtnId), body);
    return true;
  };
  if (safe(put, false)) return true;
  pruneOthers(qtnId);
  return safe(put, false);
}

export function readBackup(qtnId: string): Backup | null {
  return safe(() => {
    const raw = localStorage.getItem(keyOf(qtnId));
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<Backup>;
    if (typeof b?.state !== "string" || typeof b?.savedAt !== "number") return null;
    return { state: b.state, savedAt: b.savedAt, userId: String(b.userId ?? "") };
  }, null);
}

/** Called once the SERVER has confirmed it holds this exact payload. */
export function clearBackup(qtnId: string): void {
  safe(() => localStorage.removeItem(keyOf(qtnId)), undefined);
}

/**
 * Is there work on this device the server does not have?
 *
 * `serverState` is the payload the server returned. If the backup matches it, the server
 * already has this work and the backup is just a stale copy — nothing to offer. Anything
 * else means this device holds edits that never arrived, which is exactly the six-hour
 * case above.
 *
 * A backup written by a different signed-in user is ignored: on a shared machine their
 * unsaved work is not ours to restore.
 */
export function unsavedWork(
  qtnId: string,
  serverState: string,
  userId: string,
): Backup | null {
  const b = readBackup(qtnId);
  if (!b) return null;
  if (b.userId !== "" && userId !== "" && b.userId !== userId) return null;
  if (b.state === serverState) {
    clearBackup(qtnId);
    return null;
  }
  return b;
}
