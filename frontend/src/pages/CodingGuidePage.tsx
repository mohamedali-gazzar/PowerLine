// Coding guide — how a Powerline product code is put together, and what one means.
//
// Rebuilt from the engineers' standalone page ("Powerline – Product Coding Systems",
// R0/R1 by Yasser El-Sayed). The reference data is theirs, extracted rather than retyped
// (src/coding/data.ts); the rules are pure and tested (src/coding/codes.ts + codes.test.ts).
// This file is only the screen — it holds no coding rules of its own, so the guide and the
// tests can never drift apart.

import { useMemo, useState } from "react";
import { Field, NumberInput, Segmented } from "../components/fields";
import {
  buildRmuCode,
  decodeRmu,
  rmuLayout,
  rmuClassText,
  isApprovedRmu,
  rmuRangeCoverage,
  ratingCode,
  ratingIsExact,
  ratingSharedWith,
  buildTrCode,
  decodeTr,
  buildGearCode,
  decodeGear,
  decodeAny,
  type Decoded,
} from "../coding/codes";
import {
  RMU_FAMILIES,
  RMU_SPECS,
  RMU_CLASSES,
  RMU_RANGES,
  RMU_HISTORY,
  TR_HISTORY,
  GEAR_HISTORY,
  RMU_RINGS,
  RMU_TRANS,
  RMU_MEAS,
  RMU_VOLTS,
  TR_KVA,
  TR_VOLTS,
  TR_IPS,
  TR_IP_ACUD,
  TR_CORE,
  TR_ACC,
  TR_LEGACY,
  GEAR_VOLTS,
  GEAR_COUPLERS,
  GEAR_ADAPT,
} from "../coding/data";

type Tab = "rmu" | "transformer" | "gear" | "read";

type Rev = { v: string; by: string; on: string };
const latest = (h: Rev[]): Rev | undefined => h[h.length - 1];

// Each system is its own document with its own author and revision. "Read a code"
// spans all three, so it shows none.
const TABS: { id: Tab; label: string; hint: string; rev?: Rev }[] = [
  { id: "rmu", label: "Ring main units", hint: "PSEC · PRAL", rev: latest(RMU_HISTORY) },
  { id: "transformer", label: "Transformers", hint: "PDTR · POTR", rev: latest(TR_HISTORY) },
  { id: "gear", label: "MV switchgear", hint: "PLGear", rev: latest(GEAR_HISTORY) },
  { id: "read", label: "Read a code", hint: "paste anything" },
];

/**
 * The last digit of a transformer or switchgear code is fixed at 0.
 *
 * A code identifies a product, not an individual unit coming off the line, so there is
 * nothing for the digit to count. Leaving it editable invited people to invent a number
 * that meant nothing and then differed between two papers for the same product.
 */
const SERIAL = 0;

// ── small shared pieces ──────────────────────────────────────────────────────

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost text-xs"
      onClick={() => {
        // Clipboard access can be refused (insecure origin, permissions). Nothing here
        // depends on it, so a failure just leaves the button alone rather than throwing.
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          },
          () => undefined,
        );
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

/** The big orange code, with every character grouped under the field it belongs to. */
function CodeDisplay({ decoded }: { decoded: Decoded }) {
  if (!decoded.ok) {
    return (
      <div className="rounded-xl2 border border-line bg-surface p-4">
        <p className="font-mono text-lg font-bold text-muted">{decoded.code || "—"}</p>
        <p className="mt-2 text-sm text-muted">{decoded.error}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl2 border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-1">
        {decoded.segments.map((s, i) => (
          <div key={i} className="text-center">
            <span
              className={`block font-mono text-2xl font-bold leading-none tracking-tight ${
                s.problem ? "text-brand-darker" : "text-ink"
              }`}
            >
              {s.chars}
            </span>
            <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted">
              {s.field}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <span className="code-chip">{decoded.code}</span>
        <Copy text={decoded.code} />
      </div>
    </div>
  );
}

/** What each part means, and anything that is outside the documented range. */
function Breakdown({ decoded }: { decoded: Decoded }) {
  if (!decoded.ok) return null;
  const problems = decoded.segments.filter((s) => s.problem);
  return (
    <div className="mt-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="pb-2 font-semibold">Part</th>
            <th className="pb-2 font-semibold">Field</th>
            <th className="pb-2 font-semibold">Means</th>
          </tr>
        </thead>
        <tbody>
          {decoded.segments.map((s, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              <td className="py-2 pr-3 font-mono font-bold text-brand-darker">{s.chars}</td>
              <td className="py-2 pr-3 text-muted">{s.field}</td>
              <td className="py-2 text-ink">
                {readable(s.meaning)}
                {s.note && <span className="ml-1 text-muted">— {s.note}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {problems.length > 0 && (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand-tint p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-darker">
            Check this code
          </p>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {problems.map((s, i) => (
              <li key={i}>
                <span className="font-mono font-bold">{s.chars}</span> — {s.problem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-sm text-muted">{readable(decoded.summary)}</p>
    </div>
  );
}

/**
 * Two placeholders survive in the engineers' own reference data, and both would read as
 * corrupted text on screen. The data is left exactly as they wrote it (it is the source of
 * truth); only the wording shown here is tidied, so the gap still reads as a gap.
 */
function readable(text: string): string {
  // "JGGY, SF6, LBS, ###" — the supplier's model number was never filled in.
  return text.replace(/#{2,}/g, "model not stated yet");
}

/** A labelled row of buttons — used where the choices carry their own wording. */
function Choice({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([code, text]) => (
        <button
          key={code}
          type="button"
          onClick={() => onChange(code)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
            code === value
              ? "border-brand bg-brand text-white shadow-soft"
              : "border-line bg-surface text-muted hover:border-brand/50 hover:text-brand-dark"
          }`}
        >
          <span className="mr-1.5 font-mono text-xs opacity-70">{code}</span>
          {text}
        </button>
      ))}
    </div>
  );
}

// ── RMU ──────────────────────────────────────────────────────────────────────

function RmuTab() {
  const [family, setFamily] = useState("PSEC");
  const [spec, setSpec] = useState("10");
  const [cls, setCls] = useState("AB");
  const [volt, setVolt] = useState<string>("24");
  const [ring, setRing] = useState<string>("2");
  const [trans, setTrans] = useState<string>("1");
  const [meas, setMeas] = useState<string>("M");
  const [search, setSearch] = useState("");

  const code = buildRmuCode({ family, spec, cls, volt, ring, trans, meas });
  const decoded = decodeRmu(code);
  const approved = isApprovedRmu(code);
  const coverage = rmuRangeCoverage();

  // The approved list, narrowed by whatever is typed. Capped so 864 rows never
  // land on the page at once.
  const CAP = 60;
  const matches = useMemo(() => {
    const q = search.trim().toUpperCase();
    return RMU_RANGES.filter(([c, layout]) => !q || c.includes(q) || layout.includes(q));
  }, [search]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Build */}
      <div className="card p-5">
        <h2 className="sec-head">Build a code</h2>
        <div className="space-y-4">
          <Field label="Family" hint="PSEC uses an SF6 load break switch, PRAL uses air.">
            <Choice
              value={family}
              onChange={setFamily}
              options={RMU_FAMILIES.map((f) => [f.code, f.en] as const)}
            />
          </Field>

          <Field label="Client and type" hint="First digit is the client, second is the type.">
            <Choice
              value={spec}
              onChange={setSpec}
              // Reserved specs have no wording yet, so say that rather than show the blank.
              options={RMU_SPECS.map(
                (s) => [s.code, s.reserved ? "Reserved — not in use yet" : s.en] as const,
              )}
            />
          </Field>

          <Field label="Load break switch supplier">
            <Choice
              value={cls}
              onChange={setCls}
              options={RMU_CLASSES.map((c) => [c.code, readable(rmuClassText(c.code, family))] as const)}
            />
            <p className="mt-2 text-xs text-muted/80">
              These five are the suppliers this guide documents. The offer engine can also stamp{" "}
              <span className="font-mono font-semibold">CH</span> for CHINT on a PRAL unit — that
              code is real but has no wording here yet, so reading one shows an unknown-supplier
              warning until the engineers add the row.
            </p>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Voltage">
              <Segmented
                value={volt}
                onChange={setVolt}
                options={RMU_VOLTS}
                renderLabel={(v) => `${v} kV`}
              />
            </Field>
            <Field label="Measuring cell">
              <Segmented
                value={meas}
                onChange={setMeas}
                options={RMU_MEAS}
                renderLabel={(v) => (v === "M" ? "With (M)" : "Without (W)")}
              />
            </Field>
            <Field label="Ring feeders">
              <Segmented value={ring} onChange={setRing} options={RMU_RINGS} renderLabel={(v) => v} />
            </Field>
            <Field label="Transformer feeders">
              <Segmented value={trans} onChange={setTrans} options={RMU_TRANS} renderLabel={(v) => v} />
            </Field>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="space-y-4">
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="sec-head mb-0 pb-0">Your code</h2>
            <div className="flex items-center gap-2">
              <span className="chip bg-surface text-muted">
                Layout {rmuLayout({ ring, trans, meas })}
              </span>
              <span
                className={`chip ${
                  approved ? "bg-brand-tint text-brand-darker" : "bg-surface text-muted"
                }`}
                title={
                  approved
                    ? "This exact code is in the engineers' approved range."
                    : "The shape is valid, but nobody has signed this combination off."
                }
              >
                {approved ? "In the approved range" : "Not in the approved range"}
              </span>
            </div>
          </div>
          <CodeDisplay decoded={decoded} />
          <Breakdown decoded={decoded} />
        </div>

        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="sec-head mb-0 pb-0">Approved range</h2>
            <p className="text-xs text-muted">
              {coverage.approved} codes signed off, out of {coverage.possible} the shape allows
            </p>
          </div>
          <input
            className="input"
            placeholder="Search a code or a layout, e.g. PSEC19 or 3+1+M"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <tbody>
                {matches.slice(0, CAP).map(([c, layout]) => (
                  <tr
                    key={c}
                    className={`border-b border-line/60 last:border-0 ${
                      c === code ? "bg-brand-tint" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono text-xs font-semibold text-ink">{c}</td>
                    <td className="px-3 py-1.5 text-right text-xs text-muted">{layout}</td>
                  </tr>
                ))}
                {matches.length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-sm text-muted">Nothing matches that.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {matches.length > CAP && (
            <p className="mt-2 text-xs text-muted">
              Showing the first {CAP} of {matches.length}. Type more to narrow it down.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Transformers ─────────────────────────────────────────────────────────────

function TransformerTab() {
  const [prefix, setPrefix] = useState<"PDTR" | "POTR">("PDTR");
  const [volt, setVolt] = useState("22");
  const [kva, setKva] = useState(630);
  const [core, setCore] = useState("1");
  const [ip, setIp] = useState("21");
  const [acc, setAcc] = useState("0");

  const code = buildTrCode({ prefix, volt, kva, core, ip, acc, serial: SERIAL });
  const decoded = decodeTr(code);
  const exact = ratingIsExact(kva);
  const shared = ratingSharedWith(kva);
  const legacy = TR_LEGACY[kva];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="card p-5">
        <h2 className="sec-head">Build a code</h2>
        <div className="space-y-4">
          <Field label="Type">
            <Segmented
              value={prefix}
              onChange={setPrefix}
              options={["PDTR", "POTR"] as const}
              renderLabel={(v) => (v === "PDTR" ? "Dry (PDTR)" : "Oil-immersed (POTR)")}
            />
          </Field>

          <Field label="Primary voltage">
            <Choice value={volt} onChange={setVolt} options={TR_VOLTS} />
          </Field>

          <Field label="Rating">
            <div className="flex flex-wrap gap-1.5">
              {TR_KVA.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKva(k)}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition-colors ${
                    k === kva
                      ? "border-brand bg-brand text-white shadow-soft"
                      : "border-line bg-surface text-muted hover:border-brand/50 hover:text-brand-dark"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted/80">
              The code carries kVA divided by ten, in three digits — {kva} kVA is written{" "}
              <span className="font-mono font-semibold">{ratingCode(kva)}</span>
              {legacy ? ` · old SCBL reference ${legacy}` : ""}
            </p>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Winding">
              <Segmented
                value={core}
                onChange={setCore}
                options={Object.keys(TR_CORE)}
                renderLabel={(v) => TR_CORE[v].replace(" winding", "")}
              />
            </Field>
            <Field label="Accessories">
              <Segmented
                value={acc}
                onChange={setAcc}
                options={Object.keys(TR_ACC)}
                renderLabel={(v) => (v === "0" ? "None" : "Fitted")}
              />
            </Field>
          </div>

          <Field label="Enclosure protection" hint="Written as two digits — the letters IP are never in the code.">
            <div className="space-y-1.5">
              {TR_IPS.map(([c, meaning, , appliesTo]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setIp(c)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                    c === ip
                      ? "border-brand bg-brand-tint"
                      : "border-line bg-surface hover:border-brand/50"
                  }`}
                >
                  <span className="font-mono text-sm font-bold text-brand-darker">{c}</span>
                  <span className="text-sm text-ink">
                    {meaning}
                    {appliesTo && (
                      <span className="ml-1 text-xs text-muted">— {appliesTo}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
            {ip === TR_IP_ACUD && (
              <p className="mt-2 text-xs text-muted/80">
                This class is used for the New Capital (ACUD) projects.
              </p>
            )}
          </Field>

          <p className="text-xs text-muted/80">
            The last digit is always <span className="font-mono font-semibold">0</span>. A code
            names a product, not one unit off the line, so there is nothing for it to count.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="sec-head">Your code</h2>
          <CodeDisplay decoded={decoded} />
          <Breakdown decoded={decoded} />
        </div>

        {(!exact || shared.length > 0) && (
          <div className="card border-brand/40 p-5">
            <h2 className="sec-head">Why this rating needs care</h2>
            {!exact && (
              <p className="text-sm text-ink">
                {kva} kVA does not divide by ten, so it cannot be written exactly. The code carries{" "}
                <span className="font-mono font-semibold">{ratingCode(kva)}</span>, which reads back
                as <span className="font-semibold">{Number(ratingCode(kva)) * 10} kVA</span>. Anyone
                reading the code alone will get the wrong number — the rating has to come from the
                paperwork.
              </p>
            )}
            {shared.length > 0 && (
              <p className="mt-2 text-sm text-ink">
                {shared.join(" and ")} kVA produce the same rating field, so this code does not
                identify one unit on its own.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MV switchgear ────────────────────────────────────────────────────────────

function GearTab() {
  const [volt, setVolt] = useState("2");
  const [incoming, setIncoming] = useState(1);
  const [outgoing, setOutgoing] = useState(4);
  const [couplers, setCouplers] = useState("0");
  const [adapt, setAdapt] = useState("0");

  const code = buildGearCode({ volt, incoming, outgoing, couplers, adapt, serial: SERIAL });
  const decoded = decodeGear(code);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="card p-5">
        <h2 className="sec-head">Build a code</h2>
        <div className="space-y-4">
          <Field label="Voltage">
            <Choice
              value={volt}
              onChange={setVolt}
              options={GEAR_VOLTS.map(([c, l]) => [c, `${l} kV`] as const)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Incoming panels">
              <NumberInput value={incoming} onChange={setIncoming} min={0} step={1} />
            </Field>
            <Field label="Outgoing panels">
              <NumberInput value={outgoing} onChange={setOutgoing} min={0} step={1} />
            </Field>
          </div>
          <Field label="Bus couplers">
            <Choice value={couplers} onChange={setCouplers} options={GEAR_COUPLERS} />
          </Field>
          <Field label="Service panel">
            <Choice value={adapt} onChange={setAdapt} options={GEAR_ADAPT} />
          </Field>
          <p className="text-xs text-muted/80">
            The last digit is always <span className="font-mono font-semibold">0</span>. A code
            names a product, not one unit off the line, so there is nothing for it to count.
          </p>
          <p className="text-xs text-muted/80">
            This code uses letters as separators — I for incoming, O for outgoing, C for couplers,
            S for the service panel — so it is read by its pattern rather than by counting
            character positions.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="sec-head">Your code</h2>
        <CodeDisplay decoded={decoded} />
        <Breakdown decoded={decoded} />
      </div>
    </div>
  );
}

// ── Read any code ────────────────────────────────────────────────────────────

const SAMPLES = ["PSEC10AB24R2T1M", "PDTR2206312101", "PLG2I1O04C0S01"];

function ReadTab() {
  const [raw, setRaw] = useState("");
  const decoded = useMemo(() => decodeAny(raw), [raw]);
  const typed = raw.trim().length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="card p-5">
        <h2 className="sec-head">Paste a code</h2>
        <input
          className="input font-mono"
          placeholder="PSEC10AB24R2T1M"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <p className="mt-3 text-sm text-muted">
          Any of the three systems. Ring main units start with PSEC or PRAL, transformers with
          PDTR or POTR, switchgear with PLG.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRaw(s)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs font-semibold text-muted hover:border-brand/50 hover:text-brand-dark"
            >
              {s}
            </button>
          ))}
        </div>

        {typed && decoded.ok && decoded.system === "rmu" && (
          <p className="mt-4 text-sm">
            {isApprovedRmu(raw) ? (
              <span className="chip bg-brand-tint text-brand-darker">In the approved range</span>
            ) : (
              <span className="chip bg-surface text-muted">Not in the approved range</span>
            )}
          </p>
        )}
      </div>

      <div className="card p-5">
        <h2 className="sec-head">What it means</h2>
        {typed ? (
          <>
            <CodeDisplay decoded={decoded} />
            <Breakdown decoded={decoded} />
          </>
        ) : (
          <p className="text-sm text-muted">Type or paste a code to read it back.</p>
        )}
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function CodingGuidePage() {
  const [tab, setTab] = useState<Tab>("rmu");
  const rev = TABS.find((t) => t.id === tab)?.rev;

  return (
    <div className="animate-fade-up space-y-4">
      <header className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-title">Reference</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Product coding guide</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              How a Powerline product code is built, and what an existing one means. Pick the
              options and the code writes itself — or paste a code you already have and it will be
              read back to you part by part.
            </p>
          </div>
          {rev && (
            <span className="chip bg-surface text-muted">
              Rev {rev.v} · {rev.by} · {rev.on}
            </span>
          )}
        </div>

        <nav className="mt-5 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg border px-3.5 py-2 text-left transition-colors ${
                t.id === tab
                  ? "border-brand bg-brand text-white shadow-soft"
                  : "border-line bg-surface text-muted hover:border-brand/50 hover:text-brand-dark"
              }`}
            >
              <span className="block text-sm font-semibold">{t.label}</span>
              <span className={`block text-[11px] ${t.id === tab ? "text-white/80" : "text-muted/70"}`}>
                {t.hint}
              </span>
            </button>
          ))}
        </nav>
      </header>

      {tab === "rmu" && <RmuTab />}
      {tab === "transformer" && <TransformerTab />}
      {tab === "gear" && <GearTab />}
      {tab === "read" && <ReadTab />}
    </div>
  );
}
