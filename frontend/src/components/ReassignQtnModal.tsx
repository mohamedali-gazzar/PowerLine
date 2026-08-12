import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { listAssignees } from "../lv/qtns";

/**
 * ReassignQtnModal — hand a quotation to another user. Pick a colleague (+ an optional
 * note) and transfer ownership so they can continue it. The list of users is fetched
 * from /qtns/assignees; the server enforces who is actually allowed to reassign.
 */
export default function ReassignQtnModal({
  open,
  qtnNumber,
  onCancel,
  onReassign,
}: {
  open: boolean;
  qtnNumber: string;
  onCancel: () => void;
  onReassign: (toUserId: string, note: string) => Promise<void> | void;
}) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[] | null>(null);
  const [toUserId, setToUserId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Seed ONCE per opening. `onCancel` is a fresh arrow on every parent render, so
  // keeping it in these deps re-ran the reset mid-edit — clearing the picked user and
  // any error message. Keep the reset keyed on `open` alone.
  useEffect(() => {
    if (!open) return;
    setToUserId(""); setNote(""); setErr(""); setBusy(false); setUsers(null);
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

  const submit = async () => {
    if (!toUserId || busy) return;
    setBusy(true); setErr("");
    try {
      await onReassign(toUserId, note.trim());
    } catch (e) {
      setErr((e as Error).message || "Couldn't hand it over. Please try again.");
    } finally {
      setBusy(false); // never leave the button stuck on "Handing over…"
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-label="Hand over quotation"
        className="relative flex w-full max-w-md flex-col gap-4 rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="sec-head !mb-0">Hand over</h2>
            <p className="-mt-1 text-xs text-muted">Give <b className="text-ink">{qtnNumber}</b> to another user so they can continue it.</p>
          </div>
          <button onClick={onCancel} className="btn-ghost shrink-0" title="Close (Esc)">✕</button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">HAND OVER TO <span className="text-brand">*</span></label>
          {users === null ? (
            <div className="skeleton h-9 rounded-lg" />
          ) : (
            <select className="input" value={toUserId} onChange={(e) => setToUserId(e.target.value)} autoFocus>
              <option value="">— select a user —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
              ))}
            </select>
          )}
          {users?.length === 0 && <p className="mt-1 text-[11px] text-muted">No other users to hand over to.</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">NOTE (optional)</label>
          <textarea className="input min-h-[72px]" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Why you're handing it over — e.g. on leave, please continue." />
        </div>

        {err && <p className="text-xs font-semibold text-red-600">⚠ {err}</p>}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={submit} disabled={!toUserId || busy} className="btn-primary disabled:opacity-50">
            {busy ? "Handing over…" : "Hand over"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
