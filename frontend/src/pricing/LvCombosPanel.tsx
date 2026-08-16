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
// dead end.
//
// ONE FILE PER COMBINATION — the owner's decision, and it replaced a single
// download that handed back every list at once:
//     "when i download any excel of combination it download all combinations,
//      i need every combination to be independent"
//
// So the button hands back the ONE combination whose chip is selected, saved under
// the same name he already keeps on disk — "Combinations Database - MCC.xlsx" and
// so on — and it says which file that is before he presses it, so a download is
// never a surprise. The motorised table is not kept in Excel anywhere: on that chip
// the download is switched off and says why, rather than handing over a file that
// quietly lacks it.
//
// The withdrawable kits are said out loud too. The engineers' own MCC, ATS and
// photocell files each repeat the WD tab, but the files this screen writes do not —
// otherwise loading an MCC file downloaded an hour ago would put an older copy of
// the kits back without a word. Reading is unchanged: their files still refresh the
// kits exactly as before.

import { useEffect, useRef, useState } from "react";
import { api, getToken, type LvComboSection } from "../api";
import { refreshCatalog } from "../lv/catalogSource";
import {
  buildSectionWorkbook,
  combosWorkbookOmissions,
  parseCombosWorkbook,
  sectionHasWorkbook,
  sectionWorkbookFilename,
} from "./combosExcel";

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

  // Asked of the exporter, never assumed here: it owns the list of combinations
  // that have a file, so the button cannot promise one the app cannot write.
  const canDownload = Boolean(current && sectionHasWorkbook(current.section));
  const downloadName = current && canDownload ? sectionWorkbookFilename(current.section) : "";
  /** The name of the selected list when it has no file at all — empty both when a
   *  file exists and while the screen is still loading, so "no Excel file" is only
   *  ever said about a list that really has none. */
  const noFileFor = current && !canDownload ? current.label : "";
  const isWd = current ? current.section.toLowerCase() === "wd" : false;

  /** Hands back ONLY the combination whose chip is selected. */
  const downloadCurrent = () => {
    setError(""); setDone(""); setNote("");
    if (!current || !canDownload) return;
    try {
      // Built first: if this combination cannot be laid out, the reason is shown
      // and no half-made file ever reaches the downloads folder.
      const blob = buildSectionWorkbook(current.section, current.value);
      const name = sectionWorkbookFilename(current.section);
      const a = document.createElement("a");
      // The anchor has to be IN the document and the URL must outlive the click:
      // revoking in the same tick can hand back a truncated or empty file while the
      // success message still appears. The other downloads in this app do it this way.
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(
        `Saved "${name}" to your downloads. It holds ${current.label} and nothing else — loading it back ` +
          `changes only this list, and every other combination stays exactly as it is. If you edit a tab, ` +
          `change only the words in the cells: leaving a description or a quantity cell EMPTY is read as ` +
          `"this row is a heading", which drops that row and the ones under it.`,
      );
      if (!isWd) {
        setNote(
          `The withdrawable kits are not in that file. They have one of their own, ` +
            `"Combinations Database - WD.xlsx", and it is the only file that changes them. That is on ` +
            `purpose: it means loading an older "${name}" can never put yesterday's kits back over today's ` +
            `without telling you.`,
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
          "- ATS.xlsx", "- photocell.xlsx", or a "- WD.xlsx" that carries all three blocks of kits
          (MCCB-3P, MCCB-4P and Air-3P — the WD file this screen gives you does; your own one stops
          after the two MCCB blocks and is refused, because loading it would take the E1.2 kit out of
          the app). Nothing needs converting first, and if a workbook is missing something the app
          needs it is refused and nothing changes. Power-factor correction is not on this list: the
          app works the capacitor bank out for itself.
        </p>
        <p className="mt-2 text-sm text-muted">
          <b className="text-ink">Download gives you one combination at a time</b> — whichever one is
          selected below, on its own, saved under the name you already keep it under: "Combinations
          Database - MCC.xlsx", "- ATS.xlsx", "- photocell.xlsx", "- WD.xlsx". It holds that
          combination and nothing else, with the same tab names and columns as your files, so you can
          open it in Excel, change what you need, and load that same file straight back. Loading it
          changes only that one list — every other one stays exactly as it is.
        </p>
        <p className="mt-2 text-sm text-muted">
          <b className="text-ink">The withdrawable kits are only in the WD file.</b> Your own MCC, ATS
          and photocell workbooks each repeat the kits, and loading any of them still updates them —
          that has not changed. The files this screen hands back do not, so an MCC file you saved last
          week can never quietly put last week's kits back over today's.
        </p>
        {omitted.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            <b className="text-ink">
              {omitted.length === 1 ? "One list has" : `${omitted.length} lists have`} no Excel file at
              all:
            </b>{" "}
            {andList(omitted)}. Not kept in Excel anywhere, so there is nothing to download and
            nothing you load here can change it. Not at risk either — it stays exactly as it is in the
            app.
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
        {/* Named, not generic: the button says which of his own files it is about
            to give him, and it is switched off for the one list that has none. */}
        <button
          className="btn-ghost"
          disabled={!!busy || !canDownload}
          onClick={downloadCurrent}
          title={
            canDownload
              ? `Saves "${downloadName}". It holds this one combination and nothing else.`
              : noFileFor
                ? `${noFileFor} is not kept in Excel anywhere, so there is no file to give you.`
                : "Choose a combination first."
          }
        >
          {canDownload
            ? `⬇ Download "${downloadName}"`
            : noFileFor
              ? `⬇ ${noFileFor} has no Excel file`
              : "⬇ Download this combination"}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={onFile} />
        <span className="text-xs text-muted">
          {noFileFor ? (
            <>
              {noFileFor} is not kept in Excel anywhere — no workbook has ever carried it — so the app
              cannot make you one, and a file that quietly left it out would look like a backup
              without being one. Nothing you load or download here touches it. Pick another
              combination above to download that one.
            </>
          ) : (
            <>
              Excel in, Excel out — one file per combination. The file you download loads straight
              back, and it changes only the combination it holds. A combos.json saved from here still
              works too.
            </>
          )}
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
            {canDownload
              ? `Maintained in "${downloadName}". To change it: download that file above, edit it in Excel, and load the same file back — or load your own copy. It carries this combination only, so loading it leaves every other one alone.`
              : "No workbook covers this one anywhere, so there is no file to download and none to load. It came from a combos.json file and stays exactly as it is — nothing you do on this screen changes it."}
          </p>
        </div>
      )}
    </div>
  );
}
