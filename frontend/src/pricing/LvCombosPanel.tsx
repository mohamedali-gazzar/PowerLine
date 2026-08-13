// Owner-only editor for the circuit-combination templates.
//
// These decide WHAT GOES INTO a quoted combination — the contactors in an MCC
// starter, the parts of an ATS template — so an edit here changes what customers
// are charged, not just what a label says. That is why the tab is gated on
// access.manage rather than the price-admin permission, and why every save reports
// back any part description that no longer matches a component: the builders find
// their parts by description text, and one that stops matching becomes a silently
// unpriced row on the offer.
//
// The five sections have five genuinely different shapes, so each gets the editor
// that suits it rather than one generic tree view.

import { useEffect, useRef, useState } from "react";
import { api, getToken, type LvComboSection } from "../api";
import { refreshCatalog } from "../lv/catalogSource";

type Row = Record<string, unknown>;

/** Columns shown for each flat table, in order. `lines` renders a string[] as a
 *  one-per-line textarea, which is far easier to paste into than a single field. */
const TABLES: Record<string, { path: string; title: string; cols: { key: string; label: string; kind?: "number" | "lines" }[] }[]> = {
  mcc: [
    { path: "combos", title: "Starters", cols: [
      { key: "kind", label: "Starter" },
      { key: "kw", label: "kW" },
      { key: "type", label: "Type", kind: "number" },
      { key: "parts", label: "Parts (one per line)", kind: "lines" },
    ] },
    { path: "control", title: "Control parts (added to every starter)", cols: [
      { key: "qty", label: "Qty", kind: "number" },
      { key: "desc", label: "Description" },
    ] },
  ],
  photocell: [
    { path: "ratings", title: "Ratings", cols: [
      { key: "a", label: "Amps", kind: "number" },
      { key: "contactor", label: "Contactor" },
      { key: "aux", label: "Auxiliary contact" },
    ] },
    { path: "fixed", title: "Fixed parts (added to every photocell)", cols: [
      { key: "qty", label: "Qty", kind: "number" },
      { key: "desc", label: "Description" },
    ] },
  ],
  wd: [
    { path: "", title: "Withdrawable kits", cols: [
      { key: "frame", label: "Frame" },
      { key: "poles", label: "Poles" },
      { key: "fp", label: "Fixed part" },
      { key: "mp", label: "Moving part" },
    ] },
  ],
};

const get = (obj: unknown, path: string): Row[] =>
  (path ? ((obj as Record<string, unknown>)?.[path] as Row[]) : (obj as Row[])) ?? [];

function setAt(obj: unknown, path: string, rows: Row[]): unknown {
  if (!path) return rows;
  return { ...(obj as object), [path]: rows };
}

/** Editable table for one flat array of objects. */
function TableEditor({
  rows, cols, onChange,
}: {
  rows: Row[];
  cols: { key: string; label: string; kind?: "number" | "lines" }[];
  onChange: (rows: Row[]) => void;
}) {
  const edit = (i: number, key: string, raw: string, kind?: string) => {
    const value = kind === "number" ? Number(raw) : kind === "lines" ? raw.split("\n").map((s) => s.trim()).filter(Boolean) : raw;
    onChange(rows.map((r, n) => (n === i ? { ...r, [key]: value } : r)));
  };
  const blank = () => Object.fromEntries(cols.map((c) => [c.key, c.kind === "number" ? 0 : c.kind === "lines" ? [] : ""]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
            {cols.map((c) => <th key={c.key} className="px-2 py-1.5 font-semibold">{c.label}</th>)}
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b align-top hover:bg-brand-tint/20">
              {cols.map((c) => (
                <td key={c.key} className="px-2 py-1">
                  {c.kind === "lines" ? (
                    <textarea
                      className="input min-h-[4.5rem] w-full font-mono text-xs"
                      value={((r[c.key] as string[]) ?? []).join("\n")}
                      onChange={(e) => edit(i, c.key, e.target.value, c.kind)}
                    />
                  ) : (
                    <input
                      className="input w-full"
                      type={c.kind === "number" ? "number" : "text"}
                      value={String(r[c.key] ?? "")}
                      onChange={(e) => edit(i, c.key, e.target.value, c.kind)}
                    />
                  )}
                </td>
              ))}
              <td className="px-1 py-1">
                <button
                  className="rounded px-2 py-1 text-lg leading-none text-red-600 hover:bg-red-50"
                  title="Remove this row"
                  onClick={() => onChange(rows.filter((_, n) => n !== i))}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-ghost mt-2" onClick={() => onChange([...rows, blank()])}>
        + Add a row
      </button>
      <span className="ml-3 text-xs text-muted">{rows.length} rows</span>
    </div>
  );
}

/** ATS: type → frame → groups of items. Drilled down rather than shown at once —
 *  there are 2 types × 11 frames × 4 groups of parts. */
function AtsEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const data = (value ?? {}) as Record<string, Record<string, { group: string; items: { qty: number; desc: string }[] }[]>>;
  const types = Object.keys(data);
  const [type, setType] = useState(types[0] ?? "");
  const frames = Object.keys(data[type] ?? {});
  const [frame, setFrame] = useState(frames[0] ?? "");
  const groups = data[type]?.[frame] ?? [];

  const update = (next: typeof groups) =>
    onChange({ ...data, [type]: { ...data[type], [frame]: next } });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-ink">Type</label>
        <select className="input w-32" value={type} onChange={(e) => { setType(e.target.value); setFrame(Object.keys(data[e.target.value] ?? {})[0] ?? ""); }}>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="text-sm font-semibold text-ink">Frame</label>
        <select className="input w-32" value={frame} onChange={(e) => setFrame(e.target.value)}>
          {frames.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      {groups.map((g, gi) => (
        <div key={gi} className="card mb-2 p-3">
          <input
            className="input mb-2 font-semibold"
            value={g.group}
            onChange={(e) => update(groups.map((x, n) => (n === gi ? { ...x, group: e.target.value } : x)))}
          />
          <TableEditor
            rows={g.items as unknown as Row[]}
            cols={[{ key: "qty", label: "Qty", kind: "number" }, { key: "desc", label: "Description" }]}
            onChange={(items) => update(groups.map((x, n) => (n === gi ? { ...x, items: items as unknown as { qty: number; desc: string }[] } : x)))}
          />
        </div>
      ))}
    </div>
  );
}

/** Motorized: frame → list of part descriptions. */
function MotorizedEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const data = (value ?? {}) as Record<string, string[]>;
  return (
    <div className="space-y-3">
      {Object.keys(data).map((frame) => (
        <div key={frame} className="card p-3">
          <div className="mb-1 font-semibold text-ink">{frame}</div>
          <textarea
            className="input min-h-[8rem] w-full font-mono text-xs"
            value={(data[frame] ?? []).join("\n")}
            onChange={(e) =>
              onChange({ ...data, [frame]: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })
            }
          />
          <div className="mt-1 text-xs text-muted">{(data[frame] ?? []).length} parts — one per line</div>
        </div>
      ))}
    </div>
  );
}

export default function LvCombosPanel() {
  const [sections, setSections] = useState<LvComboSection[]>([]);
  const [active, setActive] = useState("");
  const [draft, setDraft] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api.pricing
      .lvCombos()
      .then((r) => {
        setSections(r.sections);
        setActive((a) => a || r.sections[0]?.section || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the combinations."));

  useEffect(() => { void load(); }, []);

  const current = sections.find((s) => s.section === active);
  // The draft is only set once the section is opened, so switching tabs without
  // editing never marks anything dirty.
  const value = draft ?? current?.value ?? null;
  const dirty = draft !== null;

  const pick = (section: string) => { setActive(section); setDraft(null); setWarnings([]); setDone(""); setError(""); };

  const save = async () => {
    if (!current || draft === null) return;
    setBusy("Saving…"); setError(""); setDone(""); setWarnings([]);
    try {
      const r = await api.pricing.lvComboSave(current.section, draft);
      setDraft(null);
      setDone(`Saved and published — ${r.summary}. It is live now.`);
      setWarnings(r.warnings ?? []);
      await load();
      // The save publishes, so this session's catalogue is a version behind.
      void refreshCatalog(getToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy("");
    }
  };

  const downloadAll = () => {
    const out: Record<string, unknown> = {};
    for (const s of sections) out[s.section] = s.section === active && draft !== null ? draft : s.value;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "combos.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !current) return;
    setError(""); setDone(""); setWarnings([]);
    try {
      const parsed = JSON.parse(await f.text());
      // Accept either a whole combos.json or just this section's part of it.
      const next = parsed && typeof parsed === "object" && current.section in parsed
        ? (parsed as Record<string, unknown>)[current.section]
        : parsed;
      setDraft(next);
      setDone(`Loaded "${f.name}" into ${current.label}. Check it, then press Save.`);
    } catch {
      setError("That file is not valid JSON.");
    }
  };

  const resetAll = async () => {
    setBusy("Resetting…"); setError(""); setDone(""); setWarnings([]);
    try {
      await api.pricing.lvCombosReset();
      setDraft(null);
      setDone("All combinations are back to the version shipped with the app.");
      await load();
      void refreshCatalog(getToken());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <div className="card mb-3 p-3">
        <p className="text-sm text-muted">
          These decide what goes <b className="text-ink">inside</b> a combination when someone adds
          one to a panel — the contactors in a starter, the parts of an ATS. A change here affects
          what customers are charged, and it goes live the moment you save.
          Quotations already saved keep the parts they were built with.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {sections.map((s) => (
          <button
            key={s.section}
            onClick={() => pick(s.section)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active === s.section ? "bg-brand text-white" : "bg-brand-tint/60 text-brand-dark hover:bg-brand-tint"
            }`}
          >
            {s.label}
            <span className={`ml-2 text-xs font-normal ${active === s.section ? "text-white/80" : "text-muted"}`}>{s.summary}</span>
          </button>
        ))}
      </div>

      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <button className="btn-primary" disabled={!dirty || !!busy} onClick={save}>
          {busy || (dirty ? "Save & publish" : "Saved")}
        </button>
        <button className="btn-ghost" disabled={!!busy} onClick={() => fileRef.current?.click()}>⬆ Load from file</button>
        <button className="btn-ghost" disabled={!!busy} onClick={downloadAll}>⬇ Download combos.json</button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={onFile} />
        <div className="grow" />
        {dirty && <span className="text-sm font-semibold text-amber-700">Unsaved changes</span>}
        <button className="btn-ghost text-red-700" disabled={!!busy} onClick={resetAll}>
          Reset all to the app's version
        </button>
      </div>

      {error && <div className="card mb-3 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {done && <div className="card mb-3 border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">{done}</div>}
      {warnings.length > 0 && (
        <div className="card mb-3 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>{warnings.length} part{warnings.length === 1 ? "" : "s"} did not match anything in the component database.</b>
          <p className="mt-1">
            Combinations find their parts by description, so these will come out as rows with no price.
            Either correct the spelling or add the component to the price list.
          </p>
          <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 font-mono text-xs">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {current && (
        <div className="card p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="sec-head">{current.label}</h3>
            <span className="text-xs text-muted">
              {current.updatedBy ? `last changed by ${current.updatedBy}` : "not changed yet"}
            </span>
          </div>

          {TABLES[current.section] ? (
            TABLES[current.section].map((t) => (
              <div key={t.path} className="mb-4">
                {t.title && <div className="mb-1 text-sm font-semibold text-ink">{t.title}</div>}
                <TableEditor
                  rows={get(value, t.path)}
                  cols={t.cols}
                  onChange={(rows) => setDraft(setAt(value, t.path, rows))}
                />
              </div>
            ))
          ) : current.section === "ats" ? (
            <AtsEditor value={value} onChange={setDraft} />
          ) : current.section === "motorized" ? (
            <MotorizedEditor value={value} onChange={setDraft} />
          ) : (
            <p className="text-sm text-muted">No editor for this section yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
