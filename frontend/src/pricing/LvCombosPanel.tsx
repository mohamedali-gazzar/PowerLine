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
// set back as a workbook OF THE SAME SHAPE it accepts, and can fall back to the
// version shipped with the app. Every save is checked against the price list and
// reports any part that no longer resolves, because the builders find their parts
// by description.
//
// The download used to be combos.json. It is Excel now because the people who use
// this screen do not open .json files: a download that cannot be edited in the tool
// they already use, and cannot be loaded back without being converted first, is a
// dead end. The one thing Excel cannot carry is named on screen every time, so a
// download is never mistaken for a complete backup.

import { useEffect, useRef, useState } from "react";
import { api, getToken, type LvComboSection } from "../api";
import { refreshCatalog } from "../lv/catalogSource";
import { buildCombosWorkbook, combosWorkbookOmissions, parseCombosWorkbook } from "./combosExcel";

/** Today as 2026-08-16, so a folder of downloads sorts itself and two of them
 *  taken on different days do not overwrite each other. */
const stamp = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "a", "a and b", "a, b and c" — this goes into a sentence, not a list. */
const andList = (xs: string[]): string =>
  xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export default function LvCombosPanel() {
  const [sections, setSections] = useState<LvComboSection[]>([]);
  const [active, setActive] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [note, setNote] = useState("");
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

  // Whatever is loaded that Excel has no shape for. Worked out from what is
  // actually on the screen rather than hardcoded, so the sentence stays true if
  // the sections ever change.
  const omitted = combosWorkbookOmissions(sections);

  const downloadAll = () => {
    setError(""); setDone(""); setNote("");
    try {
      const name = `Combinations Database - from PowerLine ${stamp()}.xlsx`;
      const a = document.createElement("a");
      // The anchor has to be IN the document and the URL must outlive the click:
      // revoking in the same tick can hand back a truncated or empty file while the
      // success message still appears. The other downloads in this app do it this way.
      const url = URL.createObjectURL(buildCombosWorkbook(sections));
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(
        `Saved "${name}" to your downloads — one tab per list, and it loads straight back into this screen. ` +
          `If you edit a tab, change only the words in the cells: leaving a description or a quantity cell EMPTY ` +
          `is read as "this row is a heading", which drops that row and the ones under it.`,
      );
      if (omitted.length) {
        setNote(
          `That file does not include ${andList(omitted)} — it is not kept in Excel anywhere, so no workbook can carry it. Treat the download as a copy of everything else, not as a complete backup. Nothing is lost: it stays exactly as it is in the app, and loading this file back will not touch it.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Excel file could not be made.");
    }
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
    setError(""); setDone(""); setNote(""); setWarnings([]); setBusy("Reading…");
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
    setBusy("Resetting…"); setError(""); setDone(""); setNote(""); setWarnings([]);
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
        <p className="mt-2 text-sm text-muted">
          <b className="text-ink">Download gives you the same kind of workbook back</b> — an Excel
          file holding everything the app is using right now, one tab per list, with the same tab
          names and columns as the files above. Open it in Excel, change what you need, and load that
          same file back here. Use it to see exactly what is live, or to keep a copy before loading
          something new.
        </p>
        {omitted.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            <b className="text-ink">One thing the download cannot carry:</b> {andList(omitted)}. It is
            not kept in Excel anywhere, so the downloaded file is a copy of everything else and not a
            complete backup. It is not at risk — it stays as it is in the app, and loading the file
            back will not touch it.
          </p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {sections.map((s) => (
          <button
            key={s.section}
            onClick={() => { setActive(s.section); setDone(""); setNote(""); setError(""); setWarnings([]); }}
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
        <button className="btn-ghost" disabled={!!busy || !sections.length} onClick={downloadAll}>
          ⬇ Download the current workbook
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={onFile} />
        <span className="text-xs text-muted">
          Excel in, Excel out — the file you download loads straight back. A combos.json saved from
          here still works too.
        </span>
        <div className="grow" />
        <button className="btn-ghost text-red-700" disabled={!!busy} onClick={resetAll}>
          Reset all to the app's version
        </button>
      </div>

      {error && <div className="card mb-3 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {done && <div className="card mb-3 border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">{done}</div>}
      {note && <div className="card mb-3 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{note}</div>}
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
          {/* Asked of the exporter rather than hardcoded, so this cannot drift
              away from what the download actually contains. */}
          <p className="mt-2 text-xs text-muted">
            {combosWorkbookOmissions([current]).length
              ? "No workbook covers this one, so it is loaded from a combos.json file — and it is the one list the Excel download leaves out. It is not affected by anything you load or download here."
              : "Maintained in the combinations workbook. To change it, download the workbook above, edit it, and load it back — or load the engineers' own file."}
          </p>
        </div>
      )}
    </div>
  );
}
