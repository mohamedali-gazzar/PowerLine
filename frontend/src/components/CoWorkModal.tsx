import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listAssignees } from "../lv/qtns";

type Person = { id: string; email: string; name: string };

/**
 * CoWorkModal — choose who builds a quotation together with its owner, split by panel.
 * Any number of colleagues can be added: each one edits only their own panels, while
 * the shared tabs (Project / Pricing / Specs / Terms) stay with the owner. Ticking the
 * list and saving REPLACES the current set; clearing it ends co-work. The list comes
 * from /qtns/assignees, and the server enforces who may actually change it.
 */
export default function CoWorkModal({
  open,
  qtnNumber,
  current,
  onCancel,
  onSet,
}: {
  open: boolean;
  qtnNumber: string;
  /** Who is on it right now (excluding the owner). */
  current: Person[];
  onCancel: () => void;
  onSet: (coOwnerIds: string[], note: string) => Promise<void> | void;
}) {
  const [users, setUsers] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Seed the form ONCE per opening. This must not depend on `onCancel` (the parent
  // passes a fresh arrow every render) or on `current`: re-running it on a parent
  // re-render would wipe the ticks and the error message mid-edit.
  const seedRef = useRef(current);
  seedRef.current = current;
  useEffect(() => {
    if (!open) return;
    setPicked(seedRef.current.map((p) => p.id));
    setNote(""); setErr(""); setBusy(false); setUsers(null);
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

  const toggle = (id: string) =>
    setPicked((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));

  const currentIds = current.map((p) => p.id).sort().join(",");
  const unchanged = [...picked].sort().join(",") === currentIds;

  const submit = async () => {
    if (busy || unchanged) return;
    setBusy(true); setErr("");
    try {
      await onSet(picked, note.trim());
    } catch (e) {
      setErr((e as Error).message || "Couldn't update co-work. Please try again.");
    } finally {
      // Always clear, even when onSet resolves without closing the modal — otherwise
      // the button sticks on "Saving…" forever with no way back.
      setBusy(false);
    }
  };

  const label = (u: Person) => (u.name ? `${u.name} (${u.email})` : u.email);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onCancel} />
      <div role="dialog" aria-modal="true" aria-label="Co-Work on quotation"
        className="relative flex w-full max-w-md flex-col gap-4 rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="sec-head !mb-0">Co-Work</h2>
            <p className="-mt-1 text-xs text-muted">
              Pick who builds <b className="text-ink">{qtnNumber}</b> with you. Each person edits
              only their own panels; the shared tabs stay with you (the owner).
            </p>
          </div>
          <button onClick={onCancel} className="btn-ghost shrink-0" title="Close (Esc)">✕</button>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="block text-xs font-semibold text-muted">CO-WORKING WITH</label>
            <span className="text-[11px] text-muted">
              {picked.length ? `${picked.length} selected` : "no one — co-work off"}
            </span>
          </div>
          {users === null ? (
            <div className="skeleton h-24 rounded-lg" />
          ) : users.length === 0 ? (
            <p className="text-[11px] text-muted">No other users to co-work with.</p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
              {users.map((u) => (
                <label key={u.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-line/60 px-3 py-2 text-sm last:border-b-0 hover:bg-brand-tint">
                  <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-brand))]"
                    checked={picked.includes(u.id)} onChange={() => toggle(u.id)} />
                  <span className="min-w-0 truncate">{label(u)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">NOTE (optional)</label>
          <textarea className="input min-h-[72px]" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="What you'd like them to work on — e.g. please build the MDB panels." />
          <p className="mt-1 text-[11px] text-muted">Only people newly added are notified.</p>
        </div>

        {err && <p className="text-xs font-semibold text-red-600">⚠ {err}</p>}

        <div className="flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={submit} disabled={busy || unchanged} className="btn-primary disabled:opacity-50">
            {busy ? "Saving…" : picked.length ? "Save co-workers" : "End co-work"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
