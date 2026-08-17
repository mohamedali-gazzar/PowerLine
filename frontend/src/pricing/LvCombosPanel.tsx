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
import { useDialogs } from "../components/ConfirmModal";
import {
  buildSectionWorkbook,
  parseCombosWorkbook,
  sectionHasWorkbook,
  sectionWorkbookFilename,
} from "./combosExcel";

/** "a", "a and b", "a, b and c" — for a sentence, not a bullet list. */
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
  const { confirm, dialogs } = useDialogs();

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
      // A workbook says for itself which sections it fills, and the file is the new
      // source of truth for each — rows can be added, changed or removed. It still
      // refuses a file that is not a combinations workbook or has a malformed tab.
      let targets: (readonly [string, unknown])[];
      if (/\.xlsx?$/i.test(f.name)) {
        const { sections: parsed, removals } = await parseCombosWorkbook(f);
        // A whole ATS arrangement or withdrawable-kit block left out of the file is
        // allowed, but it takes that option out of the app for new work — so confirm
        // it once rather than doing it silently. Everything else applies straight away.
        if (removals.length) {
          setBusy("");
          const ok = await confirm({
            title: "This file leaves some combinations out",
            message:
              `Loading "${f.name}" will remove ${andList(removals)} from the app. Quotations already ` +
              "saved keep what they were built with — this only changes what is offered for new work. Load it anyway?",
            confirmLabel: "Load it",
            tone: "danger",
          });
          if (!ok) return;
          setBusy("Reading…");
        }
        targets = parsed.map((s) => [s.section, s.value] as const);
      } else {
        targets = targetsFromJson(await f.text());
      }

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

  return (
    <div>
      {dialogs}
      {/* One hidden picker for the whole panel — the primary action in the content
          area opens it. A loaded file still says for itself which sections it fills. */}
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={onFile} />

      {/* Left category list + right content panel. Orange is an accent only: the
          selected category (tint + left rule) and the one primary action. */}
      <div className="card grid grid-cols-[220px_1fr] overflow-hidden p-0">
        <div className="border-r border-line bg-surface/60 p-2.5">
          {sections.length === 0 && <div className="px-2 py-1 text-xs text-muted">Loading…</div>}
          {sections.map((s) => {
            const on = s.section === active;
            return (
              <button
                key={s.section}
                onClick={() => { setActive(s.section); setDone(""); setNote(""); setError(""); setWarnings([]); }}
                className={`mb-0.5 block w-full rounded-lg border-l-2 px-3 py-2.5 text-left transition ${
                  on ? "border-brand bg-brand-tint" : "border-transparent hover:bg-brand-tint/40"
                }`}
              >
                <div className={`text-[13px] text-ink ${on ? "font-bold" : "font-medium"}`}>{s.label}</div>
                <div className="mt-0.5 text-[11px] text-muted">{s.summary}</div>
              </button>
            );
          })}
        </div>

        <div className="min-w-0 p-5">
          {current ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-base font-bold text-ink">{current.label}</h3>
                <span className="shrink-0 text-right text-[11px] leading-relaxed text-muted">
                  {current.summary}
                  <br />
                  {current.updatedBy ? `last loaded by ${current.updatedBy}` : "as shipped with the app"}
                </span>
              </div>

              {/* Taken from the exporter, never hardcoded, so it cannot drift from
                  what the download actually contains. */}
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted">
                {canDownload
                  ? `Maintained in "${downloadName}". To change it: download the file, edit it in Excel, and load the same file back — or load your own copy. Loading carries this combination only; every other one is left alone.`
                  : "No workbook covers this one anywhere, so there is no file to download and none to load. It came from a combos.json file and stays exactly as it is — nothing here changes it."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button className="btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                  {busy || "⬆ Load workbook"}
                </button>
                <button
                  className="btn-ghost"
                  disabled={!!busy || !canDownload}
                  onClick={downloadCurrent}
                  title={
                    canDownload
                      ? `Saves "${downloadName}". It holds this one combination and nothing else.`
                      : `${noFileFor} is not kept in Excel anywhere, so there is no file to give you.`
                  }
                >
                  {canDownload ? `⬇ Download "${downloadName}"` : `⬇ ${noFileFor || "This combination"} has no Excel file`}
                </button>
              </div>

              {error && <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
              {done && <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">{done}</div>}
              {note && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{note}</div>}
              {warnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
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

              <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
                {noFileFor
                  ? `${noFileFor} is not kept in Excel anywhere — nothing you load or download here touches it.`
                  : "One file per combination. The file you download loads straight back and changes only the combination it holds. A combos.json saved from here still works too."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Loading combinations…</p>
          )}
        </div>
      </div>
    </div>
  );
}
