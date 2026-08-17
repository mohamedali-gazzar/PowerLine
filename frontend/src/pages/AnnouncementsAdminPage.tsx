import { useEffect, useMemo, useState } from "react";
import {
  api,
  type Announcement,
  type AnnouncementType,
  type AnnouncementPriority,
} from "../api";
import { useDialogs } from "../components/ConfirmModal";
import { statusOf, remaining, computeWindow, fmt, type WindowMode } from "../components/announcementUtils";

const TYPES: AnnouncementType[] = ["News", "Maintenance", "Alert"];
const PRIORITIES: AnnouncementPriority[] = ["High", "Medium", "Low"];

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  scheduled: "bg-blue-100 text-blue-700",
  expired: "bg-surface text-muted",
  unpublished: "bg-amber-100 text-amber-700",
};
const STATUS_LABEL: Record<string, string> = {
  active: "Active", scheduled: "Scheduled", expired: "Expired", unpublished: "Hidden (draft)",
};

const pad = (n: number) => String(n).padStart(2, "0");
/** epoch-ms → the string a <input type=datetime-local> wants, in LOCAL time. */
const msToInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const inputToMs = (s: string) => new Date(s).getTime();

interface Draft {
  id?: string;
  type: AnnouncementType;
  priority: AnnouncementPriority;
  title: string;
  body: string;
  startInput: string;
  mode: WindowMode;
  durationValue: number;
  endInput: string;
  published: boolean;
}

const blankDraft = (): Draft => {
  const now = Date.now();
  return {
    type: "News", priority: "Medium", title: "", body: "",
    startInput: msToInput(now), mode: "days", durationValue: 7,
    endInput: msToInput(now + 7 * 24 * 3600e3), published: true,
  };
};

const draftFrom = (a: Announcement): Draft => ({
  id: a.id, type: a.type, priority: a.priority, title: a.title, body: a.body,
  startInput: msToInput(a.start), mode: "custom", durationValue: 7, endInput: msToInput(a.end),
  published: a.published,
});

export default function AnnouncementsAdminPage() {
  const { confirm, notify, dialogs } = useDialogs();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    api.announcements.all()
      .then((r) => setItems(r.announcements))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load announcements."));
  useEffect(() => { void load(); }, []);

  const rows = useMemo(
    () => [...(items ?? [])].sort((a, b) => b.start - a.start),
    [items],
  );

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const windowOf = (d: Draft) => {
    const startMs = inputToMs(d.startInput);
    return d.mode === "custom"
      ? { start: startMs, end: inputToMs(d.endInput) }
      : computeWindow(d.mode, { value: d.durationValue, startMs });
  };

  const save = async () => {
    if (!draft) return;
    setError("");
    if (!draft.title.trim()) { setError("A title is required."); return; }
    const win = windowOf(draft);
    if (!Number.isFinite(win.start) || !Number.isFinite(win.end)) { setError("Enter a valid start and end time."); return; }
    if (win.end <= win.start) { setError("The end time must be after the start time."); return; }
    setBusy(true);
    try {
      const payload = {
        type: draft.type, priority: draft.priority, title: draft.title.trim(), body: draft.body,
        start: win.start, end: win.end, published: draft.published,
      };
      if (draft.id) await api.announcements.update(draft.id, payload);
      else await api.announcements.create(payload);
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the announcement.");
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (a: Announcement) => {
    try {
      await api.announcements.update(a.id, { published: !a.published });
      await load();
    } catch (e) {
      void notify({ title: "Couldn't change it", message: e instanceof Error ? e.message : "Please try again." });
    }
  };

  const remove = async (a: Announcement) => {
    if (!(await confirm({
      title: "Delete this announcement",
      message: `"${a.title}" will be removed for good.`,
      confirmLabel: "Delete", tone: "danger",
    }))) return;
    try {
      await api.announcements.remove(a.id);
      await load();
    } catch (e) {
      void notify({ title: "Couldn't delete it", message: e instanceof Error ? e.message : "Please try again." });
    }
  };

  return (
    <div className="animate-fade-up">
      {dialogs}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted">Posts shown at the top of everyone's Home page while they are published and in date.</p>
        </div>
        {!draft && <button className="btn-primary" onClick={() => setDraft(blankDraft())}>+ New announcement</button>}
      </div>

      {error && <div className="card mb-3 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {draft && (
        <div className="card mb-4 p-4">
          <h2 className="mb-3 text-base font-bold text-ink">{draft.id ? "Edit announcement" : "New announcement"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Title</label>
              <input className="input" value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Planned maintenance this Friday" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Message</label>
              <textarea className="input min-h-[70px]" value={draft.body} onChange={(e) => set("body", e.target.value)} placeholder="Optional detail shown under the title." />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={draft.type} onChange={(e) => set("type", e.target.value as AnnouncementType)}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={draft.priority} onChange={(e) => set("priority", e.target.value as AnnouncementPriority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Starts</label>
              <input type="datetime-local" className="input" value={draft.startInput} onChange={(e) => set("startInput", e.target.value)} />
            </div>
            <div>
              <label className="label">How long</label>
              <div className="flex gap-2">
                <select className="input w-32" value={draft.mode} onChange={(e) => set("mode", e.target.value as WindowMode)}>
                  <option value="hours">For hours</option>
                  <option value="days">For days</option>
                  <option value="custom">Until a date</option>
                </select>
                {draft.mode === "custom" ? (
                  <input type="datetime-local" className="input flex-1" value={draft.endInput} onChange={(e) => set("endInput", e.target.value)} />
                ) : (
                  <input type="number" min={1} className="input w-24" value={draft.durationValue}
                    onChange={(e) => set("durationValue", Math.max(1, Number(e.target.value) || 1))} />
                )}
              </div>
            </div>
            <label className="flex items-center gap-2 md:col-span-2">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={draft.published} onChange={(e) => set("published", e.target.checked)} />
              <span className="text-sm text-ink">Published (unchecked = hidden draft, nobody sees it)</span>
            </label>
          </div>
          <div className="mt-2 text-xs text-muted">
            Will show <b>{fmt(windowOf(draft).start)}</b> → <b>{fmt(windowOf(draft).end)}</b>.
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : draft.id ? "Save changes" : "Create"}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => { setDraft(null); setError(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {items === null ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">No announcements yet. Create one to show it on everyone's Home page.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Window</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const st = statusOf(a);
                return (
                  <tr key={a.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                      {st === "active" && <div className="mt-1 text-[10px] text-muted">{remaining(a).text}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{a.title}</div>
                      {a.body && <div className="max-w-md truncate text-xs text-muted">{a.body}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted">{a.type}</td>
                    <td className="px-4 py-3 text-muted">{a.priority}</td>
                    <td className="px-4 py-3 text-xs text-muted">{fmt(a.start)}<br />→ {fmt(a.end)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">
                        <button onClick={() => togglePublished(a)} className="font-semibold text-brand-dark hover:underline">{a.published ? "Hide" : "Publish"}</button>
                        <button onClick={() => { setDraft(draftFrom(a)); setError(""); }} className="font-semibold text-brand hover:underline">Edit</button>
                        <button onClick={() => remove(a)} className="font-semibold text-red-600 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
