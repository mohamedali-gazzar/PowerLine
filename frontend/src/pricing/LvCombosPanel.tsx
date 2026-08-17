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

  // A row can be downloaded when its combination has an Excel shape AND holds data
  // (P.F.C before it has ever been loaded has none, so its download stays disabled).
  const canDownloadSection = (s: LvComboSection) => sectionHasWorkbook(s.section) && s.value != null;

  /** Hand back ONE combination's workbook. */
  const downloadSection = (s: LvComboSection) => {
    setError(""); setDone(""); setNote("");
    if (!canDownloadSection(s)) return;
    try {
      // Built first: if this combination cannot be laid out, the reason is shown
      // and no half-made file ever reaches the downloads folder.
      const blob = buildSectionWorkbook(s.section, s.value);
      const name = sectionWorkbookFilename(s.section);
      const a = document.createElement("a");
      // The anchor has to be IN the document and the URL must outlive the click:
      // revoking in the same tick can hand back a truncated file while "Saved" shows.
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone(`Saved "${name}" — it holds ${s.label} and nothing else. Edit its cells and load the same file back to update this list.`);
      if (s.section.toLowerCase() !== "wd") {
        setNote(`The withdrawable kits are not in that file — they have their own "Combinations Database - WD.xlsx", the only file that changes them.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Excel file could not be made.");
    }
  };

  /** Upload a workbook for a row. A loaded file still says for itself which sections
   *  it fills; setting `active` only helps a JSON that carries a single bare section. */
  const uploadFor = (section: string) => {
    setActive(section);
    setError(""); setDone(""); setNote(""); setWarnings([]);
    fileRef.current?.click();
  };

  /** The last time a person loaded this list — null for the app's shipped defaults
   *  (seeded) and for a list never loaded, which the table shows as "—". */
  const lastUploaded = (s: LvComboSection): string | null => {
    if (!s.updatedAt || !s.updatedBy || s.updatedBy === "seed") return null;
    const d = new Date(s.updatedAt);
    return isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
      {/* One hidden picker — a row's Upload opens it. A loaded file says for itself
          which sections it fills, so it need not match the row it was opened from. */}
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.json" className="hidden" onChange={onFile} />

      {busy && <div className="mb-3 text-sm font-semibold text-brand-dark">{busy}</div>}
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

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand-tint text-left text-[11px] uppercase tracking-wide text-brand-dark">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Download</th>
              <th className="px-4 py-3">Upload</th>
              <th className="px-4 py-3">Last uploaded</th>
            </tr>
          </thead>
          <tbody>
            {sections.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">Loading…</td></tr>
            )}
            {sections.map((s) => {
              const dl = canDownloadSection(s);
              const when = lastUploaded(s);
              return (
                <tr key={s.section} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{s.label}</div>
                    <div className="text-[11px] text-muted">{s.summary}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="rounded-full border border-brand bg-white px-3 py-1 text-xs font-bold text-brand-dark hover:bg-brand-light disabled:opacity-40"
                      disabled={!!busy || !dl}
                      onClick={() => downloadSection(s)}
                      title={dl ? `Download "${sectionWorkbookFilename(s.section)}"` : "Nothing to download yet — load a workbook first."}
                    >
                      ⬇ Download
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white hover:bg-brand-dark disabled:opacity-50"
                      disabled={!!busy}
                      onClick={() => uploadFor(s.section)}
                    >
                      ⬆ Upload
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {when ? (
                      <>
                        {when}
                        {s.updatedBy ? <div className="text-[10px]">by {s.updatedBy}</div> : null}
                      </>
                    ) : (
                      <span title="Never loaded — using the version shipped with the app">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
