// LV circuit-combination templates (ATS / photocell / MCC / WD / motorized).
//
// These used to live only in the frontend's bundled `combos.json`, which meant a
// change to a starter or an ATS template needed a code edit and a redeploy. They
// now ride the price book exactly like component prices: edit a section, it is
// audited and published, and every open configurator picks it up on the next
// catalogue refresh — no rebuild.
//
// The bundled JSON stays in the frontend as the cold-start fallback, and a copy
// lives here (src/data/combos.json) purely as the SEED for a fresh database, the
// same arrangement as src/data/rmu-pricing.json.

import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { fail } from "../lib/http";
import { publishCurrentPrices } from "./pricing.controller";
import bundledCombos from "../data/combos.json";

/** Display + payload order. Also the whitelist — anything else is a 400. */
export const COMBO_SECTIONS = ["ats", "photocell", "mcc", "wd", "motorized"] as const;
export type ComboSection = (typeof COMBO_SECTIONS)[number];

export const COMBO_SECTION_LABEL: Record<ComboSection, string> = {
  ats: "ATS — automatic transfer switch",
  photocell: "Photocell",
  mcc: "MCC — motor starters",
  wd: "Withdrawable kits",
  motorized: "Motorized breaker",
};

const qtyDesc = z.object({ qty: z.number(), desc: z.string() });

/**
 * Structural validation only — enough to stop an upload that would break the
 * configurator, not a business-rule check. Parsed output is DISCARDED and the
 * original value is stored verbatim, so a field added later survives a round trip
 * instead of being silently stripped by zod.
 */
const SECTION_SCHEMA: Record<ComboSection, z.ZodTypeAny> = {
  ats: z.record(z.record(z.array(z.object({ group: z.string(), items: z.array(qtyDesc) })))),
  photocell: z.object({
    ratings: z.array(z.object({ a: z.number(), contactor: z.string(), aux: z.string() })),
    fixed: z.array(qtyDesc),
  }),
  mcc: z.object({
    combos: z.array(
      z.object({ kind: z.string(), kw: z.string(), type: z.number(), parts: z.array(z.string()) })
    ),
    control: z.array(qtyDesc),
  }),
  wd: z.array(
    z.object({ frame: z.string(), poles: z.string(), fp: z.string(), mp: z.string() })
  ),
  motorized: z.record(z.array(z.string())),
};

const isSection = (s: string): s is ComboSection =>
  (COMBO_SECTIONS as readonly string[]).includes(s);

// ── EXTRA reference sections (P.F.C, Standard LV EDMS) ───────────────────────
// These are stored, listed, edited and downloaded on the Combinations tab like the
// real combinations, but are deliberately NOT in COMBO_SECTIONS. The app does not
// consume them (P.F.C: the app sizes the bank itself; Standard LV EDMS: the standard
// panels are built in code), and keeping them out of that list leaves
// combosForPayload's completeness guard — and the served catalogue — untouched. Each
// is stored as the workbook's own cells, so none needs a modelled shape.
//   pfc        — one sheet  → { grid: cell[][] }
//   stdlvedms  — many sheets → { sheets: { name, grid: cell[][] }[] }
const grid2d = z.array(z.array(z.any()));
const REFERENCE: Record<string, { label: string; schema: z.ZodTypeAny; summary: (v: unknown) => string }> = {
  pfc: {
    label: "P.F.C — power-factor correction",
    schema: z.object({ grid: grid2d }),
    summary: (v) => {
      const g = (v as { grid?: unknown[] } | null)?.grid;
      return Array.isArray(g) ? `reference sheet · ${g.length} rows` : "reference sheet";
    },
  },
  stdlvedms: {
    label: "Standard LV EDMS",
    schema: z.object({ sheets: z.array(z.object({ name: z.string(), grid: grid2d })) }),
    summary: (v) => {
      const sh = (v as { sheets?: unknown[] } | null)?.sheets;
      return Array.isArray(sh) ? `reference · ${sh.length} sheet${sh.length === 1 ? "" : "s"}` : "reference";
    },
  },
};
const REFERENCE_SECTIONS = Object.keys(REFERENCE);
const isReference = (s: string): boolean => s in REFERENCE;

const isKnownSection = (s: string): boolean => isSection(s) || isReference(s);
const labelOf = (s: string): string =>
  isSection(s) ? COMBO_SECTION_LABEL[s] : REFERENCE[s]?.label ?? s;
const schemaFor = (s: string): z.ZodTypeAny | null =>
  isSection(s) ? SECTION_SCHEMA[s] : REFERENCE[s]?.schema ?? null;
const summariseAny = (s: string, value: unknown): string =>
  isReference(s) ? REFERENCE[s].summary(value) : isSection(s) ? summarise(s, value) : "";
const descriptionsAny = (s: string, value: unknown): string[] =>
  isSection(s) ? descriptionsIn(s, value) : []; // references name no components

/** A one-line summary per section, so the tab can show "110 starters" not "[object]". */
export function summarise(section: ComboSection, value: unknown): string {
  try {
    const v = value as Record<string, unknown>;
    switch (section) {
      case "ats": {
        const types = Object.keys(v);
        const frames = types.length ? Object.keys(v[types[0]] as object).length : 0;
        return `${types.length} types × ${frames} frames`;
      }
      case "photocell":
        return `${(v.ratings as unknown[]).length} ratings, ${(v.fixed as unknown[]).length} fixed parts`;
      case "mcc":
        return `${(v.combos as unknown[]).length} starters, ${(v.control as unknown[]).length} control parts`;
      case "wd":
        return `${(value as unknown[]).length} frames`;
      case "motorized":
        return `${Object.keys(v).length} frames`;
    }
  } catch {
    /* fall through */
  }
  return "";
}

/** Every part description a section refers to — what the pickers must resolve. */
function descriptionsIn(section: ComboSection, value: unknown): string[] {
  const out: string[] = [];
  const v = value as any;
  try {
    if (section === "ats") {
      for (const type of Object.values(v ?? {}))
        for (const frame of Object.values(type as object))
          for (const g of frame as { items: { desc: string }[] }[])
            for (const it of g.items) out.push(it.desc);
    } else if (section === "photocell") {
      for (const r of v.ratings ?? []) out.push(r.contactor, r.aux);
      for (const f of v.fixed ?? []) out.push(f.desc);
    } else if (section === "mcc") {
      for (const c of v.combos ?? []) out.push(...(c.parts ?? []));
      for (const c of v.control ?? []) out.push(c.desc);
    } else if (section === "motorized") {
      for (const parts of Object.values(v ?? {})) out.push(...(parts as string[]));
    }
    // `wd` names enclosure kits by reference text, not component descriptions.
  } catch {
    /* a malformed section is already rejected by the schema */
  }
  return [...new Set(out.map((d) => (d ?? "").trim()).filter(Boolean))];
}

/**
 * Which of those descriptions no longer resolve to a component. NOT a hard failure
 * — the owner may be adding the combination before the part exists — but it is the
 * thing that silently produces an unpriced row, so it is always reported back.
 *
 * This MUST mirror findByName() in frontend/src/lv/catalog.ts, including its four
 * fuzzy fallbacks. An exact-match check here instead reported 45 of the shipped
 * MCC parts as missing when every one of them resolves fine at runtime, which is
 * the kind of false alarm that trains people to ignore the warning entirely.
 * Retired components are deliberately included: they stay in the payload so saved
 * combinations keep resolving.
 */
async function unresolved(descs: string[]): Promise<string[]> {
  if (!descs.length) return [];
  const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const rows = await prisma.lvComponent.findMany({ select: { d: true, n: true } });
  const names = rows.map((r) => norm(r.n));
  const descriptions = rows.map((r) => norm(r.d));

  // Must mirror mccAlias() in combos.ts IN FULL, both branches.
  //
  // MCC_ALIAS comes first there: a handful of template descriptions deliberately
  // differ from the catalogue names, and are translated for the price lookup only
  // so the offer can keep the clean wording. Omitting this map made the checker
  // report those parts as missing when they price perfectly well — a false alarm
  // that led to the template text being "corrected" on customer-facing documents
  // for no reason. Keep this table in step with combos.ts.
  const MCC_ALIAS: Record<string, string> = {
    "SK1-11 Signal contact": "SK1-11 Signaling Contact",
    "CAL4-11 (1 N.O+1 N.C) - Side": "CAL4-11 Auxiliary Contact Block - Side (AF09..96)",
  };
  // ATS does the same thing through ATS_ACCESSORY_ALIAS: the templates carry the
  // engineers' verbose wording and it is translated to the catalogue name for the
  // lookup. Keyed on the flattened text, exactly as combos.ts keys it.
  const ATS_ALIAS_KEYS = new Set(
    [
      "UVR - Under Voltage Release Uncabled 220-240Vac-220-250Vdc- XT1..XT4 F/P",
      "MOD - Motor Operator with Direct Action 220...250V ac/dc- XT1-XT3",
      "MIR-H - Frame unit horizontal interlock- XT1..XT4",
      "MIR-P - Mechanical Interlock plate for- XT1 Fixed",
      "MOE - Stored energy motor operator 220…250Vac/dc- XT2-XT4 F/P/W*",
      "MIR-P - Mechanical Interlock plate- XT2 Fixed",
      "MIR-P - Mechanical Interlock plate for- XT3 Fixed",
      "Plate for mechanical interlock of XT4 F",
      "YU (Under Voltage Release Uncabled) 220-240Vac -220-250Vdc-XT5-XT6 F/P",
      "MOE (Stored Energy Motor Operator) 220-250Vac/dc-XT5",
      "MIR-H XT5 Chassis for interlocking between XT4-XT5 & XT5-XT5",
      "Plate for mechanical interlock of XT5 F with XT5 F",
      "MOE (Stored Energy Motor Operator) 220-250Vac/dc-XT6",
      "MIR-H XT6 Chassis for interlocking between XT5-XT6 & XT6-XT6",
      "YU (Under Voltage Release Uncabled) 220-240Vac/Vdc-XT7-XT7M-E1.2…E6.2",
      "YC - Shunt Closing release Uncabled 220-240 Vac/dc- XT7-XT7M-E1.2..E6.2",
      "AUX 4Q (Aux. Contact Uncabled) 400Vac-4 Op/Cls C/O-XT7-XT7M-E1.2 F/W",
      "M (Spring Charging Motor Operator) 220-250 Vac/dc-XT7M",
      "Cables for mechanical interlock Type A horizontal- XT7-E1.2...E6.2 [Group 1]",
      "Sup. fixed Type A E1.2-XT7/M floor mount",
      "M - Motor operator 220-250 Vac/dc- E1.2",
      "M - Motor operator 220-250 Vac/dc- E2.2...E6.2",
      "Lever for mechanical interlock of fixed circuit-breaker or mobile part- E2.2 3P[Group 2]*",
      "Lever for mechanical interlock of fixed circuit-breaker or mobile part- E4.2 3P [Group 2]*",
    ].map(norm),
  );

  const alias = (raw: string) => {
    const d = raw.trim();
    if (MCC_ALIAS[d]) return MCC_ALIAS[d];
    // "Contactor# AF09-30-10-13" is a template marker; the prefix is stripped
    // before the lookup. Harmless on other sections, which never use it.
    return (/^contactor#\s*(.+)$/i.exec(d)?.[1] ?? d).trim();
  };

  /** Descriptions the builders never look up, so they cannot be "missing":
   *  "C.B (1..3)" are placeholders replaced by the breakers the user picks
   *  (buildAts), and anything in the ATS alias table is translated first. */
  const handledElsewhere = (raw: string) =>
    /^C\.B\s*\(\d\)$/i.test(raw.trim()) || ATS_ALIAS_KEYS.has(norm(raw));

  const resolves = (raw: string): boolean => {
    const want = norm(alias(raw));
    if (!want) return true;
    if (names.includes(want) || descriptions.includes(want)) return true;
    if (names.some((n) => n.includes(want))) return true;
    if (names.some((n) => n.length > 12 && want.includes(n))) return true;
    const head = want.slice(0, 40);
    return names.some((n) => n.startsWith(head));
  };

  return descs.filter((d) => !handledElsewhere(d) && !resolves(d));
}

/** Seed any missing section from the bundled file. Idempotent. */
export async function seedCombosIfMissing(by = "seed"): Promise<number> {
  const have = new Set((await prisma.lvCombo.findMany({ select: { section: true } })).map((r) => r.section));
  let written = 0;
  for (let i = 0; i < COMBO_SECTIONS.length; i++) {
    const section = COMBO_SECTIONS[i];
    if (have.has(section)) continue;
    const value = (bundledCombos as Record<string, unknown>)[section];
    if (value === undefined) continue;
    await prisma.lvCombo.create({
      data: { section, payload: JSON.stringify(value), sortIndex: i, updatedBy: by },
    });
    written++;
  }
  return written;
}

/**
 * The combinations for the published catalogue payload, or `null` when the table
 * has not been seeded — in which case the client keeps using its bundled copy
 * rather than being handed a half-empty set.
 */
export async function combosForPayload(): Promise<Record<string, unknown> | null> {
  const rows = await prisma.lvCombo.findMany({ orderBy: { sortIndex: "asc" } });
  if (rows.length < COMBO_SECTIONS.length) return null;
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.section] = JSON.parse(r.payload);
    } catch {
      return null; // one corrupt row must not ship a broken catalogue
    }
  }
  return out;
}

/** GET /api/pricing/lv/combos — owner only. Every section, with its summary. */
export async function listCombos(_req: Request, res: Response) {
  try {
    await seedCombosIfMissing();
    const rows = await prisma.lvCombo.findMany({ orderBy: { sortIndex: "asc" } });
    type Entry = { section: string; label: string; summary: string; updatedAt: string; updatedBy: string; value: unknown };
    const sections: Entry[] = rows.map((r) => {
      let value: unknown = null;
      try {
        value = JSON.parse(r.payload);
      } catch {
        /* reported as an empty summary below */
      }
      return {
        section: r.section,
        label: labelOf(r.section),
        summary: value == null ? "unreadable" : summariseAny(r.section, value),
        updatedAt: r.updatedAt.toISOString(),
        updatedBy: r.updatedBy,
        value,
      };
    });
    // P.F.C is an extra reference and is not seeded, so offer it here even before it
    // has ever been loaded — otherwise there is no way to load it the first time.
    // Offer each reference section even before it has ever been loaded, so it is
    // selectable the first time — in their declared order, after the real combos.
    for (const ref of REFERENCE_SECTIONS) {
      if (!sections.some((s) => s.section === ref)) {
        sections.push({ section: ref, label: labelOf(ref), summary: "not loaded yet", updatedAt: "", updatedBy: "", value: null });
      }
    }
    res.json({ sections });
  } catch (e) {
    fail(res, e);
  }
}

/**
 * PUT /api/pricing/lv/combos/:section — owner only. Replaces one section.
 *
 * Publishes immediately, like every other price edit, so the change is live on
 * the next catalogue refresh with no redeploy.
 */
export async function putCombo(req: Request, res: Response) {
  try {
    const section = String(req.params.section || "");
    const schema = schemaFor(section);
    if (!isKnownSection(section) || !schema) {
      return res.status(400).json({ error: `Unknown section "${section}".` });
    }
    const value = req.body?.value;
    if (value === undefined || value === null) {
      return res.status(400).json({ error: "No combination data supplied." });
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return res.status(400).json({
        error: `That does not match the shape of the ${section} section — ${first.path.join(".") || "root"}: ${first.message}`,
      });
    }

    const by = req.userEmail ?? "";
    const existing = await prisma.lvCombo.findUnique({ where: { section } });
    const before = existing ? summariseAny(section, JSON.parse(existing.payload)) : "(none)";
    // Store the ORIGINAL, not zod's output — see SECTION_SCHEMA.
    const payload = JSON.stringify(value);
    const after = summariseAny(section, value);

    const row = existing
      ? await prisma.lvCombo.update({ where: { section }, data: { payload, updatedBy: by } })
      : await prisma.lvCombo.create({
          data: {
            section,
            payload,
            // pfc is not in COMBO_SECTIONS, so index it just past them (last).
            sortIndex: isSection(section)
              ? COMBO_SECTIONS.indexOf(section)
              : COMBO_SECTIONS.length + REFERENCE_SECTIONS.indexOf(section),
            updatedBy: by,
          },
        });

    await prisma.priceChange.create({
      data: {
        domain: "LV",
        entity: "LvCombo",
        entityId: row.id,
        label: labelOf(section),
        field: "payload",
        oldValue: before,
        newValue: after,
        actorId: req.userId ?? null,
        actorEmail: by,
      },
    });

    await publishCurrentPrices(by, `Combinations: ${labelOf(section)}`);

    const warnings = await unresolved(descriptionsAny(section, value));
    res.json({ ok: true, section, summary: after, warnings });
  } catch (e) {
    fail(res, e);
  }
}

/** POST /api/pricing/lv/combos/reset — owner only. Back to the bundled file. */
export async function resetCombos(req: Request, res: Response) {
  try {
    const by = req.userEmail ?? "";
    for (let i = 0; i < COMBO_SECTIONS.length; i++) {
      const section = COMBO_SECTIONS[i];
      const value = (bundledCombos as Record<string, unknown>)[section];
      if (value === undefined) continue;
      const payload = JSON.stringify(value);
      await prisma.lvCombo.upsert({
        where: { section },
        create: { section, payload, sortIndex: i, updatedBy: by },
        update: { payload, updatedBy: by },
      });
    }
    await prisma.priceChange.create({
      data: {
        domain: "LV", entity: "LvCombo", entityId: "all",
        label: "All combinations", field: "payload",
        oldValue: "(edited)", newValue: "reset to the version shipped with the app",
        actorId: req.userId ?? null, actorEmail: by,
      },
    });
    await publishCurrentPrices(by, "Combinations reset to the bundled version");
    res.json({ ok: true });
  } catch (e) {
    fail(res, e);
  }
}
