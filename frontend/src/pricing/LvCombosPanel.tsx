// Owner-only view of the circuit-combination templates.
//
// READ-ONLY ON PURPOSE. These are maintained in the engineers' own workbooks
// ("Combinations Database - MCC.xlsx", "- ATS.xlsx"), and that is the reference.
// When they change, an admin uploads a new version here rather than editing rows
// in the app — one source of truth, and no risk of the two drifting apart.
//
// What it still does: shows what is loaded, takes a new file, hands the current
// set back as a download, and can fall back to the version shipped with the app.
// Every save is checked against the price list and reports any part that no longer
// resolves, because the builders find their parts by description.

import { useEffect, useRef, useState } from "react";
import { api, getToken, type LvComboSection } from "../api";
import { refreshCatalog } from "../lv/catalogSource";

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

  /** Takes a whole combos.json, or one section's worth of it. */
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !current) return;
    setError(""); setDone(""); setWarnings([]); setBusy("Loading…");
    try {
      const parsed = JSON.parse(await f.text());
      const whole = parsed && typeof parsed === "object" && !Array.isArray(parsed);
      const keys = whole ? Object.keys(parsed) : [];
      const known = sections.map((s) => s.section);
      // A file holding several sections replaces each of them in turn.
      const targets = whole && keys.some((k) => known.includes(k))
        ? keys.filter((k) => known.includes(k)).map((k) => [k, (parsed as Record<string, unknown>)[k]] as const)
        : [[current.section, parsed] as const];

      const allWarnings: string[] = [];
      for (const [section, value] of targets) {
        setBusy(`Saving ${section}…`);
        const r = await api.pricing.lvComboSave(section, value);
        allWarnings.push(...(r.warnings ?? []));
      }
      setDone(`Loaded "${f.name}" — ${targets.map(([k]) => k).join(", ")} updated and live now.`);
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
          {busy || "⬆ Load a new version"}
        </button>
        <button className="btn-ghost" disabled={!!busy} onClick={downloadAll}>⬇ Download current</button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={onFile} />
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
            Maintained in the combinations workbook. To change it, load a new version above.
          </p>
        </div>
      )}
    </div>
  );
}
