import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listAssignees } from "../lv/qtns";

/**
 * CoWorkModal — add a second sales-support to a quotation so two people can build it
 * together, split by panel. Each co-owner edits only their own panels; the shared
 * tabs (Project / Pricing / Specs / Terms) stay with the primary owner. Picking a
 * user sets the co-owner; "Remove" clears it. The list comes from /qtns/assignees;
 * the server enforces who may actually set a co-owner (the primary or a manager).
 */
export default function CoWorkModal({
  open,
  qtnNumber,
  currentCoOwnerId,
  currentCoOwnerLabel,
  onCancel,
  onSet,
}: {
  open: boolean;
  qtnNumber: string;
  currentCoOwnerId?: string;
  currentCoOwnerLabel?: string;
  onCancel: () => void;
  onSet: (coOwnerId: string | null, note: string) => Promise<void> | void;
}) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[] | null>(null);
  const [coOwnerId, setCoOwnerId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "set" | "remove">(null);
  const [err, setErr] = useState("");

  // Seed the form ONCE per opening. This must not depend on `onCancel` (the parent
  // passes a fresh arrow every render) or on `currentCoOwnerId`: re-running it on a
  // parent re-render used to snap the dropdown back to the current co-worker and wipe
  // the error message mid-edit, so changing the co-worker looked impossible.
  const seedRef = useRef(currentCoOwnerId);
  seedRef.current = currentCoOwnerId;
  useEffect(() => {
    if (!open) return;
    setCoOwnerId(seedRef.current ?? ""); setNote(""); setErr(""); setBusy(null); setUsers(null);
    listAssignees().then(setUsers).catch(() => setUsers([]));
  }, [open]);

  // Escape closes. Separate effect: re-subscribing on every parent render is harmless.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const run = async (id: string | null, which: "set" | "remove") => {
    if (busy) return;
    setBusy(which); setErr("");
    try {
      await onSet(id, note.trim());
    } catch (e) {
      setErr((e as Error).message || "Couldn't update co-work. Please try again.");
    } finally {
      // Always clear, even when onSet resolves without closing the modal — otherwise
      // the button sticks on "Saving…" forever with no way back.
      setBusy(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-label="Co-Work on quotation"
        className="relative flex w-full max-w-md flex-col gap-4 rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="sec-head !mb-0">Co-Work</h2>
            <p className="-mt-1 text-xs text-muted">
              Add a second sales-support to <b className="text-ink">{qtnNumber}</b>. Each of you edits
              only your own panels; the shared tabs stay with you (the primary owner).
            </p>
          </div>
          <button onClick={onCancel} className="btn-ghost shrink-0" title="Close (Esc)">✕</button>
        </div>

        {currentCoOwnerId && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-tint/60 px-3 py-2 text-sm">
            <span>Currently co-working with <b className="text-ink">{currentCoOwnerLabel || "another user"}</b>.</span>
            <button onClick={() => run(null, "remove")} disabled={!!busy}
              className="btn-ghost shrink-0 text-red-600 disabled:opacity-50">
              {busy === "remove" ? "Removing…" : "Remove"}
            </button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">
            {currentCoOwnerId ? "CHANGE CO-WORKER" : "CO-WORK WITH"} <span className="text-brand">*</span>
          </label>
          {users === null ? (
            <div className="skeleton h-9 rounded-lg" />
          ) : (
            <select className="input" value={coOwnerId} onChange={(e) => setCoOwnerId(e.target.value)} autoFocus>
              <option value="">— select a user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
              ))}
            </select>
          )}
          {users?.length === 0 && <p className="mt-1 text-[11px] text-muted">No other users to co-work with.</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">NOTE (optional)</label>
          <textarea className="input min-h-[72px]" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What you'd like them to work on — e.g. please build the MDB panels." />
        </div>

        {err && <p className="text-xs font-semibold text-red-600">⚠ {err}</p>}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={() => run(coOwnerId, "set")} disabled={!coOwnerId || coOwnerId === currentCoOwnerId || !!busy}
            className="btn-primary disabled:opacity-50">
            {busy === "set" ? "Saving…" : currentCoOwnerId ? "Change co-worker" : "Start co-work"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
