// Owner-only view of the circuit-combination templates.
//
// READ-ONLY ON PURPOSE. These are maintained in the engineers' own workbooks
// ("Combinations Database - MCC.xlsx", "- ATS.xlsx"), and that is the reference.
// When they change, an admin uploads a new version here rather than editing rows
// in the app — one source of truth, and no risk of the two drifting apart.
//
// The workbooks are loaded DIRECTLY: combosExcel.ts works out which one it has
// been handed and reads it into the sections it fills, so nobody has to convert
// a file first. A previously downloaded .json is still accepted, unchanged.
//
// What it still does: shows what is loaded, takes a new file, hands the current
// set back as a download, and can fall back to the version shipped with the app.
// Every save is checked against the price list and reports any part that no longer
// resolves, because the builders find their parts by description.

import { useEffect, useRef, useState } from "react";
import { api, getToken, type LvComboSection } from "../api";
import { refreshCatalog } from "../lv/catalogSource";
import { parseCombosWorkbook } from "./combosExcel";

export default function LvCombosPanel() {
  const [sections, setSections] = useState<LvComboSection[]>([]);
  const [active, setActive] = useState("");
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

  const downloadAll = () => {
    const out: Record<string, unknown> = {};
    for (const s of sections) out[s.section] = s.value;
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "combos.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const labelOf = (section: string) => sections.find((s) => s.section === section)?.label ?? section;

  /** One section's worth of an uploaded combos.json, or a whole one. */
  const targetsFromJson = (text: string): (readonly [string, unknown])[] => {
    const parsed = JSON.parse(text);
    const whole = parsed && typeof parsed === "object" && !Array.isArray(parsed);
    const keys = whole ? Object.keys(parsed) : [];
    const known = sections.map((s) => s.section);
    // A file holding several sections replaces each of them in turn.
    if (whole && keys.some((k) => known.includes(k))) {
      return keys.filter((k) => known.includes(k)).map((k) => [k, (parsed as Record<string, unknown>)[k]] as const);
    }
    // Anything else is taken as the section currently on screen.
    if (!current) throw new Error("The combinations are still loading — try again in a moment.");
    return [[current.section, parsed] as const];
  };

  /** Takes a combinations workbook (.xlsx) or a combos.json. */
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(""); setDone(""); setWarnings([]); setBusy("Reading…");
    try {
      // A workbook says for itself which sections it fills — an MCC, ATS or
      // photocell file also carries the withdrawable-kit tab, so one upload can
      // update two sections. It refuses anything it cannot read faithfully.
      const targets = /\.xlsx?$/i.test(f.name)
        ? (await parseCombosWorkbook(f)).map((s) => [s.section, s.value] as const)
        : targetsFromJson(await f.text());

      const allWarnings: string[] = [];
      const saved: string[] = [];
      for (const [section, value] of targets) {
        setBusy(`Saving ${labelOf(section)}…`);
        const r = await api.pricing.lvComboSave(section, value);
        allWarnings.push(...(r.warnings ?? []));
        // The server's own count of what it stored — the quickest way to spot a
        // workbook that arrived with rows missing.
        saved.push(`${labelOf(section)} (${r.summary})`);
      }
      setDone(`Loaded "${f.name}" — ${saved.join(", ")}. Live now.`);
      setWarnings([...new Set(allWarnings)]);
      await load();
      void refreshCatalog(getToken()); // saving publishes; this session must catch up
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "That file could not be read.");
    } finally {
      setBusy("");
    }
  };

  const resetAll = async () => {
    setBusy("Resetting…"); setError(""); setDone(""); setWarnings([]);
    try {
      await api.pricing.lvCombosReset();
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
          one to a panel — the contactors in a starter, the parts of an ATS. They are maintained in
          the combinations workbooks and loaded here, so the workbook stays the single reference.
          A change goes live the moment it is loaded. Quotations already saved keep the parts they
          were built with.
        </p>
        <p className="mt-2 text-sm text-muted">
          <b className="text-ink">Load the Excel workbook itself</b> — "Combinations Database - MCC.xlsx",
          "- ATS.xlsx", "- photocell.xlsx". Nothing needs converting first. Each one also carries the
          withdrawable-kit tab, so it updates that at the same time. If a workbook is missing
          something the app needs, it is refused and nothing changes. Power-factor correction is not
          on this list: the app works the capacitor bank out for itself.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {sections.map((s) => (
          <button
            key={s.section}
            onClick={() => { setActive(s.section); setDone(""); setError(""); setWarnings([]); }}
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
        <button className="btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy || "⬆ Load a combinations workbook"}
        </button>
        <button className="btn-ghost" disabled={!!busy} onClick={downloadAll}>⬇ Download current</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={onFile} />
        <span className="text-xs text-muted">Excel (.xlsx) — or a combos.json saved from here.</span>
        <div className="grow" />
        <button className="btn-ghost text-red-700" disabled={!!busy} onClick={resetAll}>
          Reset all to the app's version
        </button>
      </div>

      {error && <div className="card mb-3 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {done && <div className="card mb-3 border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">{done}</div>}
      {warnings.length > 0 && (
        <div className="card mb-3 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <b>{warnings.length} part{warnings.length === 1 ? "" : "s"} did not match anything in the price list.</b>
          <p className="mt-1">
            Combinations find their parts by description, so these would come out as rows with no
            price. Either correct the wording in the workbook or add the component to the price list.
          </p>
          <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 font-mono text-xs">
            {warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      {current && (
        <div className="card p-3">
          <div className="flex items-baseline justify-between">
            <h3 className="sec-head mb-0">{current.label}</h3>
            <span className="text-xs text-muted">
              {current.summary}
              {current.updatedBy ? ` · last loaded by ${current.updatedBy}` : " · as shipped with the app"}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {current.section === "motorized"
              ? "No workbook covers the motorized breaker yet, so this one is loaded from a combos.json file."
              : "Maintained in the combinations workbook. To change it, load the workbook above."}
          </p>
        </div>
      )}
    </div>
  );
}
