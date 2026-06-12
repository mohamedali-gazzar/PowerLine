import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getQtn, saveQtn } from "../lv/qtns";
import {
  AMB_TEMPS, NEUTRAL_EARTH, COPPER_TYPES, INCOMING_CABLES, OUTGOING_CABLES, FORMS,
  PANEL_SYSTEMS, CELL_SYSTEMS, PANELS_MAX_INCOMER_A, DOUBLE_FAMILIES,
  ENCLOSURES, componentPriceEgp, enclosurePriceEgp, fmtEgp,
  type DbComponent,
} from "../lv/catalog";
import {
  newPanel, duplicatePanel, toPanelComponent, freeComponent, uid,
  calcPanel, grandTotals, buildMaterialList, searchComponents,
  type LvState, type LvPanel, type PanelComponent, type MatRow, type PanelCalc, type PanelTypeItem,
} from "../lv/store";
import {
  ATS_TYPES, atsBreakerPool, frameOf, buildAts,
  PHOTOCELL_RATINGS, buildPhotocell,
  MCC_KINDS, mccKws, mccTypes, buildMcc,
  PFC_DEFAULT, pfcTotalKvar, buildPfc,
  WD_OPTIONS, buildWd,
  type ComboLine, type AtsTypeId,
} from "../lv/combos";
import {
  PRO_E_DEPTHS, PRO_E_THICKNESS, PRO_E_IPS, IS2_DEPTHS, PLP_DEPTHS,
  proEIp31Disabled, retable, defaultCellConfig, type CellType,
} from "../lv/cells";

type Tab = "project" | "pricing" | "panels" | "technical" | "commercial" | "material";

// ── tiny UI atoms (match the app theme) ──────────────────────────────────────
function L({ children }: { children: React.ReactNode }) {
  return <label className="label">{children}</label>;
}
function Sel<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: readonly T[]; className?: string;
}) {
  return (
    <select className={`input cursor-pointer ${className ?? ""}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
/** Searchable dropdown (RPT-01: enclosure family + sizing must be searchable). */
function SearchSelect({ value, placeholder, options, onPick }: {
  value: string; placeholder: string;
  options: { key: string; label: string; hint?: string }[];
  onPick: (key: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = terms.length
      ? options.filter((o) => {
          const hay = (o.label + " " + (o.hint ?? "")).toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
      : options;
    return list.slice(0, 80);
  }, [q, options]);
  const sel = options.find((o) => o.key === value);
  return (
    <div className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={open ? q : sel?.label ?? ""}
        onFocus={() => { setOpen(true); setQ(""); }}
        onClick={() => { if (!open) { setOpen(true); setQ(""); } }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-white shadow-lift">
          {shown.length === 0 && <div className="px-3 py-2 text-xs text-muted">No matches</div>}
          {shown.map((o) => (
            <button key={o.key} type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-brand-tint"
              onMouseDown={() => { onPick(o.key); setOpen(false); }}>
              {o.label}
              {o.hint && <span className="ml-1 text-[11px] text-muted">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// The QTN workspace — one quotation holding project data, pricing settings,
// panels and the generated Technical / Commercial offers + Material List.
export default function LvConfiguratorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [rec] = useState(() => getQtn(id));
  const [s, setS] = useState<LvState>(() => rec?.state ?? null!);
  const [tab, setTab] = useState<Tab>(() => (rec?.state.panels.length ? "panels" : "project"));
  const [matAbbOnly, setMatAbbOnly] = useState(false);

  useEffect(() => {
    if (!rec) navigate("/lv", { replace: true });
  }, [rec, navigate]);
  useEffect(() => {
    if (rec && s) saveQtn(rec.id, s);
  }, [rec, s]);

  const totals = useMemo(() => (s ? grandTotals(s) : { sell: 0, vat: 0, incl: 0 }), [s]);
  if (!rec || !s) return null;
  const sel = s.panels.find((p) => p.id === s.selectedId) ?? null;

  // immutable update helpers
  const up = (patch: Partial<LvState>) => setS((old) => ({ ...old, ...patch }));
  const upPanel = (id: string, patch: Partial<LvPanel>) =>
    setS((old) => ({ ...old, panels: old.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const addPanel = () => {
    const p = newPanel(s.panels.length + 1);
    setS((old) => ({ ...old, panels: [...old.panels, p], selectedId: p.id }));
    setTab("panels");
  };
  const removePanel = (id: string) =>
    setS((old) => {
      const panels = old.panels.filter((p) => p.id !== id);
      return { ...old, panels, selectedId: panels[0]?.id ?? null };
    });
  const clonePanel = (id: string) =>
    setS((old) => {
      const src = old.panels.find((p) => p.id === id);
      if (!src) return old;
      const copy = duplicatePanel(src, 1);
      const i = old.panels.findIndex((p) => p.id === id);
      const panels = [...old.panels];
      panels.splice(i + 1, 0, copy);
      return { ...old, panels, selectedId: copy.id };
    });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up no-print">
        <div>
          <Link to="/lv" className="text-xs font-semibold text-brand hover:underline">← All QTNs</Link>
          <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
            <span className="code-chip">{rec.number}</span>
            {s.project.name || "LV Quotation"}
          </h1>
          <p className="text-sm text-muted">
            {fmtEgp(totals.sell)} EGP excl. VAT
            {totals.sell > 0 && <> · <strong className="text-ink">{fmtEgp(totals.incl)}</strong> incl. {Math.round(s.factors.vat * 100)}% VAT</>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5 animate-fade-up no-print">
        {([["project", "Project"], ["pricing", "Pricing Settings"], ["panels", "Panels"], ["technical", "Technical Offer"], ["commercial", "Commercial Offer"], ["material", "Material List"]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t ? "border-brand bg-brand text-white shadow-soft" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "project" && <ProjectTab s={s} up={up} />}
      {tab === "pricing" && <PricingTab s={s} up={up} />}
      {tab === "panels" && (
        <PanelsTab s={s} sel={sel} up={up} upPanel={upPanel}
          onAdd={addPanel} onDel={removePanel} onClone={clonePanel} />
      )}
      {tab === "technical" && <TechnicalTab s={s} qtnNo={rec.number} />}
      {tab === "commercial" && <CommercialTab s={s} qtnNo={rec.number} />}
      {tab === "material" && <MaterialTab s={s} abbOnly={matAbbOnly} setAbbOnly={setMatAbbOnly} />}
    </div>
  );
}

// ── Offer documents (the configurator's main output) ────────────────────────
function DocHeader({ s, qtnNo, title }: { s: LvState; qtnNo: string; title: string }) {
  const pr = s.project;
  return (
    <div className="border-b-4 border-brand pb-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-2xl font-extrabold tracking-tight text-brand">Power<span className="text-ink">Line</span></div>
          <div className="text-[11px] text-muted">Electrical Industries — powerline.com.eg</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-extrabold">{title}</div>
          <div className="font-mono text-sm font-bold text-brand-dark">{qtnNo}</div>
          <div className="text-xs text-muted">{pr.date}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm sm:grid-cols-3">
        <div><span className="text-muted">Project:</span> <b>{pr.name || "—"}</b></div>
        <div><span className="text-muted">Customer:</span> <b>{pr.customer || "—"}</b></div>
        <div><span className="text-muted">Location:</span> <b>{pr.location || "—"}</b></div>
        <div><span className="text-muted">Sales:</span> <b>{pr.salesPerson || "—"}</b>{pr.salesMobile && <span className="text-xs text-muted"> · {pr.salesMobile}</span>}</div>
        <div><span className="text-muted">Email:</span> <b className="text-xs">{pr.salesEmail || "—"}</b></div>
        <div><span className="text-muted">Support eng.:</span> <b>{pr.supportEngineer || "—"}</b></div>
      </div>
    </div>
  );
}

function PrintBar({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center justify-between no-print">
      <p className="text-xs text-muted">{label}</p>
      <button className="btn-primary" onClick={() => window.print()}>⬇ PDF / Print</button>
    </div>
  );
}

/** Technical Offer — one document page per panel, in the reference layout:
 *  red item bar (Item No. | name | Item Qty.), red-label spec grid, then the
 *  components table (Qty | Description | Reference | Brand | Poles).
 *  Printing exports ALL panels as one PDF, one page each. */
const TRED = "#b03a2e";
function TechnicalTab({ s, qtnNo }: { s: LvState; qtnNo: string }) {
  if (!s.panels.length) {
    return <div className="card p-10 text-center text-sm text-muted animate-fade-up">Add panels first — the Technical Offer is generated from them.</div>;
  }
  const specOf = (p: LvPanel) => {
    if (p.sizingMode === "cells") {
      const cc = p.cellConfig;
      return {
        panelType: `${cc.type} · ${cc.depth} cm${cc.type === "Pro-E" ? ` · ${cc.thickness} mm` : ""}`,
        ip: cc.ip.replace(/^IP/, ""),
        mount: "Floor standing",
        ral: "7035",
      };
    }
    const pItems = p.panelItems ?? [];
    const it = pItems[0];
    const enc = it ? ENCLOSURES.find((e) => e.ref === it.ref && e.name === it.name) : undefined;
    return {
      panelType: it ? `${it.fam} — ${it.name}${pItems.length > 1 ? ` (+${pItems.length - 1})` : ""}` : "—",
      ip: it?.ip || "—",
      mount: enc?.mount || "—",
      ral: enc?.ral || "—",
    };
  };
  const Lbl = ({ children }: { children: React.ReactNode }) => (
    <td className="border px-2 py-1 text-[12.5px] font-bold" style={{ color: TRED, borderColor: "#e7c2bc" }}>{children}</td>
  );
  const Val = ({ children }: { children?: React.ReactNode }) => (
    <td className="border px-2 py-1 text-[12.5px]" style={{ borderColor: "#e7c2bc" }}>{children}</td>
  );
  return (
    <div className="animate-fade-up">
      <PrintBar label={`${s.panels.length} panel${s.panels.length > 1 ? "s" : ""} → ${s.panels.length} technical page${s.panels.length > 1 ? "s" : ""} in one PDF.`} />
      <div className="print-area space-y-6">
        {s.panels.map((p, pi) => {
          const sp = specOf(p);
          return (
            <div key={p.id} className="card overflow-hidden"
              style={pi < s.panels.length - 1 ? { breakAfter: "page" } : undefined}>
              {/* item bar */}
              <table className="w-full border-collapse">
                <tbody>
                  <tr style={{ background: TRED }} className="text-white">
                    <td className="w-44 border-r border-white/40 px-3 py-2 text-sm font-bold">Item No. {pi + 1}</td>
                    <td className="px-3 py-2 text-center text-sm font-bold">{p.name}</td>
                    <td className="w-40 border-l border-white/40 px-3 py-2 text-sm font-bold">Item Qty.</td>
                    <td className="w-24 border-l border-white/40 px-3 py-2 text-center text-sm font-bold">{p.qty}</td>
                  </tr>
                </tbody>
              </table>
              {/* spec grid — 2 label/value pairs per row, like the reference */}
              <table className="w-full border-collapse">
                <tbody>
                  {([
                    ["Panel Type", sp.panelType, "IP", sp.ip],
                    ["Mounting", sp.mount, "Rating", p.ratingA ? `${p.ratingA} A` : ""],
                    ["RAL", sp.ral, "Amb. Temp.", p.ambTemp],
                    ["Copper", p.copperType, "Neutral", p.neutral],
                    ["Incoming Cables", p.incomingCables, "Earth", p.earth],
                    ["Outgoing Cables", p.outgoingCables, "Form", p.form],
                    ["Designation", p.code, "Fed From", p.fedFrom],
                  ] as [string, React.ReactNode, string, React.ReactNode][]).map(([l1, v1, l2, v2]) => (
                    <tr key={l1}>
                      <Lbl>{l1}</Lbl>
                      <Val>{v1}</Val>
                      <Lbl>{l2}</Lbl>
                      <Val>{v2}</Val>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* components table */}
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ background: TRED }} className="text-white">
                    <th className="w-16 px-2 py-1.5 text-left text-[12px] font-bold">Qty</th>
                    <th className="px-2 py-1.5 text-left text-[12px] font-bold">Description</th>
                    <th className="w-44 px-2 py-1.5 text-left text-[12px] font-bold">Reference</th>
                    <th className="w-28 px-2 py-1.5 text-left text-[12px] font-bold">Brand</th>
                    <th className="w-20 px-2 py-1.5 text-right text-[12px] font-bold">Poles</th>
                  </tr>
                </thead>
                <tbody>
                  {p.components.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-5 text-center text-sm text-muted">No components.</td>
                    </tr>
                  ) : (
                    p.components.map((c) => (
                      <tr key={c.id} className="border-b align-top" style={{ borderColor: "#f0d9d5" }}>
                        <td className="px-2 py-1 text-[12.5px] font-semibold">{c.qty}</td>
                        <td className="px-2 py-1 text-[12.5px]">
                          {c.name}
                          {(c.adj || c.comment || c.note) && (
                            <div className="text-[11px] italic text-muted">
                              {[c.adj && `Adj: ${c.adj}`, c.comment, c.note].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1 text-[12px] text-muted">{c.ref}</td>
                        <td className="px-2 py-1 text-[12.5px]">{c.brand}</td>
                        <td className="px-2 py-1 text-right text-[12.5px]">{c.poles || ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div className="px-2 py-1 text-right text-[9px] text-muted">{qtnNo} · Item {pi + 1}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Commercial Offer — panel prices at the current Pricing Settings. */
function CommercialTab({ s, qtnNo }: { s: LvState; qtnNo: string }) {
  if (!s.panels.length) {
    return <div className="card p-10 text-center text-sm text-muted animate-fade-up">Add panels first — the Commercial Offer is generated from them.</div>;
  }
  const calcs: [LvPanel, PanelCalc][] = s.panels.map((p) => [p, calcPanel(p, s.factors)]);
  const subtotal = calcs.reduce((t, [, c]) => t + c.totalSell, 0);
  const vat = subtotal * s.factors.vat;
  return (
    <div className="animate-fade-up">
      <PrintBar label="Prices follow the Pricing Settings tab (rates, ABB discount, factor) live." />
      <div className="card print-area space-y-5 p-6">
        <DocHeader s={s} qtnNo={qtnNo} title="Commercial Offer" />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-brand text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-2 w-10">Item</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2 text-center w-14">Qty</th>
              <th className="py-1.5 pr-2 text-right w-32">Unit price (EGP)</th>
              <th className="py-1.5 text-right w-32">Total (EGP)</th>
            </tr>
          </thead>
          <tbody>
            {calcs.map(([p, c], i) => (
              <tr key={p.id} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-2 font-bold text-muted">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  <b>{p.name}</b>
                  <div className="text-[11px] text-muted">
                    {p.encFam} LV distribution panel{p.ratingA ? ` · ${p.ratingA} A incomer` : ""} · Form {p.form} · {p.components.length} components
                  </div>
                </td>
                <td className="py-1.5 pr-2 text-center font-semibold">{p.qty}</td>
                <td className="py-1.5 pr-2 text-right">{fmtEgp(c.sellUnit)}</td>
                <td className="py-1.5 text-right font-semibold">{fmtEgp(c.totalSell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-72 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted">Subtotal (excl. VAT)</span><b>{fmtEgp(subtotal)}</b></div>
          <div className="flex justify-between"><span className="text-muted">VAT {Math.round(s.factors.vat * 100)}%</span><b>{fmtEgp(vat)}</b></div>
          <div className="flex justify-between border-t-2 border-brand pt-1 text-base"><span className="font-bold">Total (EGP)</span><b className="text-brand-dark">{fmtEgp(subtotal + vat)}</b></div>
        </div>
        <p className="border-t border-line pt-2 text-[10px] text-muted">
          Prices in EGP. Validity per agreement · delivery ex-works PowerLine · {qtnNo}.
        </p>
      </div>
    </div>
  );
}

// ── Project tab (RPT-01) ─────────────────────────────────────────────────────
function ProjectTab({ s, up }: { s: LvState; up: (p: Partial<LvState>) => void }) {
  const pr = s.project;
  const upPr = (patch: Partial<LvState["project"]>) => up({ project: { ...pr, ...patch } });
  const pickSales = (name: string) => {
    const sp = s.salesPeople.find((x) => x.name === name);
    upPr({ salesPerson: name, salesMobile: sp?.mobile ?? "", salesEmail: sp?.email ?? "" });
  };
  const [newSales, setNewSales] = useState({ name: "", mobile: "", email: "" });
  const [newEng, setNewEng] = useState("");

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2 animate-fade-up">
      <div className="card p-5">
        <h2 className="sec-head">Project</h2>
        <p className="mb-3 text-xs text-muted">Used to generate the Technical & Commercial offer cover pages.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><L>Project name</L><input className="input" value={pr.name} onChange={(e) => upPr({ name: e.target.value })} /></div>
          <div><L>Our reference</L><input className="input" value={pr.ref} onChange={(e) => upPr({ ref: e.target.value })} /></div>
          <div><L>Customer</L><input className="input" value={pr.customer} onChange={(e) => upPr({ customer: e.target.value })} /></div>
          <div><L>Location</L><input className="input" value={pr.location} onChange={(e) => upPr({ location: e.target.value })} /></div>
          <div><L>Date</L><input className="input" type="date" value={pr.date} onChange={(e) => upPr({ date: e.target.value })} /></div>
          <div><L>Sales manager (fixed)</L><input className="input bg-surface" value={pr.salesManager} readOnly /></div>
          <div>
            <L>Sales person</L>
            <select className="input cursor-pointer" value={pr.salesPerson} onChange={(e) => pickSales(e.target.value)}>
              <option value="">— select —</option>
              {s.salesPeople.map((p) => <option key={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <L>Sales support engineer</L>
            <select className="input cursor-pointer" value={pr.supportEngineer} onChange={(e) => upPr({ supportEngineer: e.target.value })}>
              <option value="">— select —</option>
              {s.supportEngineers.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div><L>Sales no (auto)</L><input className="input bg-surface" value={pr.salesMobile} readOnly /></div>
          <div><L>Sales email (auto)</L><input className="input bg-surface" value={pr.salesEmail} readOnly /></div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="sec-head">Staff lists</h2>
        <p className="mb-3 text-xs text-muted">Editable — add new names or remove inactive ones (RPT-01).</p>
        <L>Sales people</L>
        <div className="mb-2 max-h-44 overflow-auto rounded-lg border border-line">
          {s.salesPeople.map((p) => (
            <div key={p.name} className="flex items-center justify-between border-b border-line/60 px-3 py-1 text-sm last:border-0">
              <span>{p.name} <span className="text-[11px] text-muted">{p.mobile} · {p.email}</span></span>
              <button className="text-red-500 hover:underline"
                onClick={() => up({ salesPeople: s.salesPeople.filter((x) => x.name !== p.name) })}>remove</button>
            </div>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <input className="input h-9 w-36" placeholder="Name" value={newSales.name} onChange={(e) => setNewSales({ ...newSales, name: e.target.value })} />
          <input className="input h-9 w-36" placeholder="Mobile" value={newSales.mobile} onChange={(e) => setNewSales({ ...newSales, mobile: e.target.value })} />
          <input className="input h-9 w-48" placeholder="Email" value={newSales.email} onChange={(e) => setNewSales({ ...newSales, email: e.target.value })} />
          <button className="btn-ghost h-9" onClick={() => {
            if (!newSales.name.trim()) return;
            up({ salesPeople: [...s.salesPeople, { ...newSales, name: newSales.name.trim() }] });
            setNewSales({ name: "", mobile: "", email: "" });
          }}>+ Add</button>
        </div>
        <L>Sales support engineers</L>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {s.supportEngineers.map((e) => (
            <span key={e} className="chip bg-surface text-ink">
              {e}
              <button className="ml-1.5 text-red-500" onClick={() => up({ supportEngineers: s.supportEngineers.filter((x) => x !== e) })}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input h-9 w-56" placeholder="New engineer name" value={newEng} onChange={(e) => setNewEng(e.target.value)} />
          <button className="btn-ghost h-9" onClick={() => {
            if (newEng.trim()) { up({ supportEngineers: [...s.supportEngineers, newEng.trim()] }); setNewEng(""); }
          }}>+ Add</button>
        </div>
      </div>
    </div>
  );
}

// ── Pricing tab (RPT-01: Pricing Settings replaces "Panels Section") ─────────
function PricingTab({ s, up }: { s: LvState; up: (p: Partial<LvState>) => void }) {
  const f = s.factors;
  const upF = (k: string, v: number) => up({ factors: { ...f, [k]: v } });
  // plain function (NOT a nested component) so inputs keep focus across re-renders
  const num = (k: "euro" | "usd" | "copper" | "sheetMetal" | "operations" | "factor" | "abbDiscount" | "vat",
    label: string, opts?: { step?: number; pct?: boolean; hint?: string }) => (
    <div key={k}>
      <L>{label}</L>
      <input className="input" type="number" step={opts?.step ?? 0.01}
        value={opts?.pct ? Math.round(f[k] * 10000) / 100 : f[k]}
        onChange={(e) => upF(k, opts?.pct ? (parseFloat(e.target.value) || 0) / 100 : parseFloat(e.target.value) || 0)} />
      {opts?.hint && <p className="mt-1 text-[11px] text-muted">{opts.hint}</p>}
    </div>
  );
  return (
    <div className="card max-w-3xl p-5 animate-fade-up">
      <h2 className="sec-head">Pricing Settings</h2>
      <p className="mb-3 text-xs text-muted">
        Exchange rates, material costs, operations and margins — drives the EGP selling price live.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {num("euro", "EUR → EGP")}
        {num("usd", "USD → EGP")}
        {num("copper", "Copper (EGP/kg)", { step: 1 })}
        {num("sheetMetal", "Sheet metal (EGP/kg)", { step: 1 })}
        {num("operations", "Operations (%)", { pct: true })}
        {num("factor", "Selling factor", { hint: "cost ÷ factor = selling price" })}
        {num("abbDiscount", "ABB discount (%)", { pct: true, hint: "Applied to ABB products ONLY (RPT-01)" })}
        {num("vat", "VAT (%)", { pct: true })}
      </div>
    </div>
  );
}

// ── Panels tab ───────────────────────────────────────────────────────────────
function PanelsTab({ s, sel, up, upPanel, onAdd, onDel, onClone }: {
  s: LvState; sel: LvPanel | null;
  up: (p: Partial<LvState>) => void;
  upPanel: (id: string, p: Partial<LvPanel>) => void;
  onAdd: () => void; onDel: (id: string) => void; onClone: (id: string) => void;
}) {
  if (!s.panels.length) {
    return (
      <div className="card p-12 text-center animate-fade-up">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint text-2xl">⚡</div>
        <p className="text-muted">No panels yet.</p>
        <button className="btn-primary mt-4" onClick={onAdd}>+ Add your first panel</button>
      </div>
    );
  }
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[260px_1fr] animate-fade-up">
      {/* panel list */}
      <div className="card p-3 lg:sticky lg:top-6">
        {s.panels.map((p) => {
          const c = calcPanel(p, s.factors);
          const active = p.id === s.selectedId;
          return (
            <button key={p.id} onClick={() => up({ selectedId: p.id })}
              className={`mb-1.5 block w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                active ? "border-brand bg-brand-light" : "border-line bg-white hover:bg-brand-tint"
              }`}>
              <div className={`text-sm font-bold ${active ? "text-brand-dark" : "text-ink"}`}>{p.name}</div>
              <div className="text-[11px] text-muted">{p.encFam}{p.qty > 1 ? ` · ×${p.qty}` : ""} · {fmtEgp(c.totalSell)} EGP</div>
            </button>
          );
        })}
        <button className="btn-ghost mt-1 w-full" onClick={onAdd}>+ Add panel</button>
      </div>

      {/* editor */}
      {sel && <PanelEditor key={sel.id} s={s} p={sel} upPanel={upPanel} onDel={onDel} onClone={onClone} />}
    </div>
  );
}

function PanelEditor({ s, p, upPanel, onDel, onClone }: {
  s: LvState; p: LvPanel;
  upPanel: (id: string, patch: Partial<LvPanel>) => void;
  onDel: (id: string) => void; onClone: (id: string) => void;
}) {
  const u = (patch: Partial<LvPanel>) => upPanel(p.id, patch);
  const calc = calcPanel(p, s.factors);

  return (
    <div className="space-y-4">
      {/* Panel details */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="sec-head mb-0 pb-0 after:hidden">Panel details</h2>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => onClone(p.id)}>⧉ Duplicate</button>
            <button className="btn-ghost text-red-600" onClick={() => onDel(p.id)}>✕ Delete panel</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><L>Panel name</L><input className="input" value={p.name} onChange={(e) => u({ name: e.target.value })} /></div>
          <div><L>Fed from</L><input className="input" value={p.fedFrom} onChange={(e) => u({ fedFrom: e.target.value })} /></div>
          <div><L>Quantity</L><input className="input" type="number" min={1} value={p.qty}
            onChange={(e) => u({ qty: Math.max(1, parseInt(e.target.value) || 1) })} /></div>
          <div><L>Incoming C.B rating (A)</L><input className="input" type="number" min={0} value={p.ratingA || ""}
            placeholder="e.g. 630" onChange={(e) => u({ ratingA: parseInt(e.target.value) || 0 })} /></div>
          <div><L>Amb. temp</L><Sel value={p.ambTemp as any} onChange={(v) => u({ ambTemp: v })} options={AMB_TEMPS} /></div>
          <div><L>Form</L><Sel value={p.form as any} onChange={(v) => u({ form: v })} options={FORMS} /></div>
          <div><L>Neutral</L><Sel value={p.neutral as any} onChange={(v) => u({ neutral: v })} options={NEUTRAL_EARTH} /></div>
          <div><L>Earth</L><Sel value={p.earth as any} onChange={(v) => u({ earth: v })} options={NEUTRAL_EARTH} /></div>
          <div><L>Copper</L><Sel value={p.copperType as any} onChange={(v) => u({ copperType: v })} options={COPPER_TYPES} /></div>
          <div><L>Incoming cables</L><Sel value={p.incomingCables as any} onChange={(v) => u({ incomingCables: v })} options={INCOMING_CABLES} /></div>
          <div><L>Outgoing cables</L><Sel value={p.outgoingCables as any} onChange={(v) => u({ outgoingCables: v })} options={OUTGOING_CABLES} /></div>
          <div>
            <L>Main busbar Cu (kg)</L>
            <input className="input" type="number" min={0} step={0.5} value={p.mainBusbarKg || ""}
              placeholder="0" onChange={(e) => u({ mainBusbarKg: parseFloat(e.target.value) || 0 })} />
            <p className="mt-1 text-[11px] text-muted">auto for panels · manual for cells</p>
          </div>
          <div>
            <L>Designation</L>
            <input className="input" value={p.code} onChange={(e) => u({ code: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Panel type (enclosure sizings as component-like items) */}
      <SizingCard p={p} u={u} factors={s.factors} />

      {/* Circuit combinations */}
      <CombosCard p={p} u={u} />

      {/* Components */}
      <ComponentsCard s={s} p={p} u={u} />

      {/* Cost summary */}
      <div className="card p-5">
        <h2 className="sec-head">Panel cost (live)</h2>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-surface p-2.5">Components<br /><b>{fmtEgp(calc.compCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Enclosure + kits<br /><b>{fmtEgp(calc.enclCost + calc.kits)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Copper ({calc.cuWeight.toFixed(1)} kg + busbar)<br /><b>{fmtEgp(calc.cuConnCost + calc.busbarCost)} EGP</b></div>
          <div className="rounded-lg bg-surface p-2.5">Unit cost + ops<br /><b>{fmtEgp(calc.unitCostOps)} EGP</b></div>
          <div className="rounded-lg bg-brand-light p-2.5 text-brand-dark">Unit selling<br /><b>{fmtEgp(calc.sellUnit)} EGP</b></div>
          <div className="rounded-lg bg-brand p-2.5 text-white">Total ×{p.qty}<br /><b>{fmtEgp(calc.totalSell)} EGP</b></div>
        </div>
      </div>
    </div>
  );
}

// ── Components card ──────────────────────────────────────────────────────────
function ComponentsCard({ s, p, u }: { s: LvState; p: LvPanel; u: (patch: Partial<LvPanel>) => void }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchComponents(q, 40), [q]);
  const [newSection, setNewSection] = useState("");

  const setComp = (id: string, patch: Partial<PanelComponent>) =>
    u({ components: p.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const delComp = (id: string) => u({ components: p.components.filter((c) => c.id !== id) });
  const move = (id: string, dir: -1 | 1) => {
    const arr = [...p.components];
    const i = arr.findIndex((c) => c.id === id);
    // swap with previous/next row in the SAME section (order is reflected in the Technical offer)
    const sec = arr[i].section;
    let j = i + dir;
    while (j >= 0 && j < arr.length && arr[j].section !== sec) j += dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    u({ components: arr });
  };

  const add = (c: DbComponent) => {
    u({ components: [...p.components, toPanelComponent(c, p.activeSection)] });
    setQ("");
  };

  return (
    <div className="card p-5">
      <h2 className="sec-head">Components</h2>

      {/* sections */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {p.sections.map((sec) => (
          <button key={sec} onClick={() => u({ activeSection: sec })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              p.activeSection === sec ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>
            {sec}
          </button>
        ))}
        <input className="input h-8 w-36 text-xs" placeholder="New section…" value={newSection}
          onChange={(e) => setNewSection(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newSection.trim()) {
              u({ sections: [...p.sections, newSection.trim()], activeSection: newSection.trim() });
              setNewSection("");
            }
          }} />
      </div>

      {/* search */}
      <div className="relative mb-3">
        <input className="input" placeholder={`Search 2,124 components (name / reference / type / rating) → adds to “${p.activeSection}”`}
          value={q} onChange={(e) => setQ(e.target.value)} />
        {q && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-white shadow-lift">
            {hits.length === 0 && <div className="px-3 py-2 text-xs text-muted">No matches</div>}
            {hits.map((c) => (
              <button key={c.ref + c.n} type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-brand-tint"
                onMouseDown={() => add(c)}>
                <span>
                  <span className="mr-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-muted">{c.t}</span>
                  {c.n}
                  <span className="ml-1 text-[11px] text-muted">{c.ref} · {c.brand}</span>
                </span>
                <b className="shrink-0 text-brand-dark">{fmtEgp(componentPriceEgp(c, s.factors))}</b>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* table grouped by section */}
      {p.components.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
          No components — search above or use the combination builders below.
        </p>
      ) : (
        p.sections.filter((sec) => p.components.some((c) => c.section === sec)).map((sec) => (
          <div key={sec} className="mb-3">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-brand-dark">{sec}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="py-1 pr-2">Description</th>
                    <th className="py-1 pr-2">Ref</th>
                    <th className="w-16 py-1 pr-2">Qty</th>
                    <th className="w-20 py-1 pr-2">Adj.</th>
                    <th className="w-28 py-1 pr-2">Comment</th>
                    <th className="w-28 py-1 pr-2">Note</th>
                    <th className="py-1 pr-2 text-right">Total</th>
                    <th className="w-20 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {p.components.filter((c) => c.section === sec).map((c) => (
                    <tr key={c.id} className="border-t border-line/70 align-middle">
                      <td className="max-w-[330px] py-1 pr-2">
                        {c.group && <span className="mr-1 rounded bg-brand-light px-1 text-[9px] font-bold text-brand-dark">{c.group}</span>}
                        {c.name}
                      </td>
                      <td className="py-1 pr-2 text-[11px] text-muted">{c.ref}</td>
                      <td className="py-1 pr-2">
                        <input className="input h-7 px-1.5 text-center text-xs" type="number" min={0} value={c.qty}
                          onChange={(e) => setComp(c.id, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} />
                      </td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.adj} placeholder="—"
                        onChange={(e) => setComp(c.id, { adj: e.target.value })} /></td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.comment} placeholder="—"
                        onChange={(e) => setComp(c.id, { comment: e.target.value })} /></td>
                      <td className="py-1 pr-2"><input className="input h-7 px-1.5 text-xs" value={c.note} placeholder="—"
                        onChange={(e) => setComp(c.id, { note: e.target.value })} /></td>
                      <td className="py-1 pr-2 text-right font-semibold">{fmtEgp(componentPriceEgp(c, s.factors) * c.qty)}</td>
                      <td className="py-1 text-right">
                        <button className="px-1 text-muted hover:text-ink" title="Move up" onClick={() => move(c.id, -1)}>↑</button>
                        <button className="px-1 text-muted hover:text-ink" title="Move down" onClick={() => move(c.id, 1)}>↓</button>
                        <button className="px-1 text-red-500" title="Remove" onClick={() => delComp(c.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Combination builders (RPT-03) ────────────────────────────────────────────
function CombosCard({ p, u }: { p: LvPanel; u: (patch: Partial<LvPanel>) => void }) {
  const [kind, setKind] = useState<"ats" | "photocell" | "mcc" | "pfc" | "wd" | null>(null);
  const [preview, setPreview] = useState<ComboLine[]>([]);
  const [tag, setTag] = useState("");

  const commit = () => {
    if (!preview.length) return;
    const items = preview.map((l) =>
      l.comp
        ? toPanelComponent(l.comp, p.activeSection, l.qty, tag)
        : freeComponent(l.desc, p.activeSection, l.qty, tag)
    );
    u({ components: [...p.components, ...items] });
    setPreview([]);
    setKind(null);
  };

  return (
    <div className="card p-5">
      <h2 className="sec-head">Circuit combinations</h2>
      <p className="mb-2 text-xs text-muted">
        Predefined assemblies — generated from the database, then fully editable in the table above (defaults only).
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {([["ats", "ATS"], ["photocell", "Photocell"], ["mcc", "MCC starter"], ["pfc", "P.F.C"], ["wd", "WD kit"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setKind(kind === k ? null : k); setPreview([]); }}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
              kind === k ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>
            + {label}
          </button>
        ))}
      </div>

      {kind === "ats" && <AtsBuilder onPreview={(lines, t) => { setPreview(lines); setTag(t); }} />}
      {kind === "photocell" && <PhotocellBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
      {kind === "mcc" && <MccBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
      {kind === "pfc" && <PfcBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}
      {kind === "wd" && <WdBuilder onPreview={(l, t) => { setPreview(l); setTag(t); }} />}

      {preview.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
          <div className="mb-1.5 text-xs font-bold text-ink">Preview — {preview.length} items ({tag})</div>
          <div className="max-h-52 overflow-auto">
            {preview.map((l, i) => (
              <div key={i} className="flex justify-between gap-3 border-t border-line/60 py-0.5 text-xs first:border-0">
                <span>
                  <span className="mr-1 rounded bg-white px-1 text-[9px] font-bold text-muted">{l.groupLabel}</span>
                  {l.desc}
                  {!l.comp && <span className="ml-1 text-amber-600" title="Not matched in component DB — added without price">⚠ no price</span>}
                </span>
                <span className="shrink-0 font-semibold">×{l.qty}</span>
              </div>
            ))}
          </div>
          <button className="btn-primary mt-2" onClick={commit}>Add {preview.length} items to “{p.activeSection}”</button>
        </div>
      )}
    </div>
  );
}

function BreakerSelect({ label, value, onPick, pool }: {
  label: string; value: DbComponent | null; onPick: (c: DbComponent) => void; pool: DbComponent[];
}) {
  return (
    <div>
      <L>{label}</L>
      <SearchSelect
        value={value ? `${value.ref}|${value.n}` : ""}
        placeholder="Search breaker…"
        options={pool.map((c) => ({ key: `${c.ref}|${c.n}`, label: c.n, hint: `${c.f} · ${c.r}` }))}
        onPick={(k) => {
          const c = pool.find((x) => `${x.ref}|${x.n}` === k);
          if (c) onPick(c);
        }} />
    </div>
  );
}

function AtsBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const pool = useMemo(() => atsBreakerPool(), []);
  const [type, setType] = useState<AtsTypeId>("1oo2");
  const [breakers, setBreakers] = useState<(DbComponent | null)[]>([null, null]);
  const meta = ATS_TYPES.find((t) => t.id === type)!;

  // RPT-03: picking the first breaker auto-fills the rest (each stays editable)
  // RPT-03: picking C.B (1) auto-fills all remaining incomers with the same
  // breaker — each can still be changed independently afterwards.
  const pick = (i: number, c: DbComponent) => {
    setBreakers((old) => {
      const next = [...old];
      next[i] = c;
      if (i === 0) for (let j = 1; j < meta.incomers; j++) next[j] = c;
      return next;
    });
  };
  useEffect(() => {
    setBreakers((old) => Array.from({ length: meta.incomers }, (_, i) => old[i] ?? old[0] ?? null));
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = breakers[0] ? frameOf(breakers[0]) : null;
  const ready = breakers.slice(0, meta.incomers).every(Boolean) && frame;

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ATS_TYPES.map((t) => (
          <button key={t.id} disabled={!t.available}
            title={t.available ? undefined : "Template data pending — Phase 3"}
            onClick={() => t.available && setType(t.id)}
            className={`rounded-md border px-3 py-1 text-xs font-bold ${
              type === t.id ? "border-brand bg-brand-light text-brand-dark"
              : t.available ? "border-line bg-white text-muted" : "cursor-not-allowed border-line bg-surface text-muted/40"
            }`}>
            {!t.available && "🔒 "}{t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: meta.incomers }, (_, i) => (
          <BreakerSelect key={i} label={`C.B (${i + 1})${i > 0 ? " — auto-filled, editable" : ""}`}
            value={breakers[i] ?? null} onPick={(c) => pick(i, c)} pool={pool} />
        ))}
      </div>
      {frame && <p className="mt-2 text-[11px] text-muted">Detected frame: <b>{frame}</b> · identical incomers (Phase 1)</p>}
      <button className="btn-ghost mt-2" disabled={!ready}
        onClick={() => ready && onPreview(buildAts(type, frame!, breakers.filter(Boolean) as DbComponent[]), `ATS ${meta.label}`)}>
        Generate combination
      </button>
    </div>
  );
}

function PhotocellBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const [rating, setRating] = useState<number>(PHOTOCELL_RATINGS[0] ?? 16);
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <L>C.B rating (A)</L>
          <select className="input w-36 cursor-pointer" value={rating} onChange={(e) => setRating(+e.target.value)}>
            {PHOTOCELL_RATINGS.map((r) => <option key={r} value={r}>{r} A</option>)}
          </select>
        </div>
        <button className="btn-ghost" onClick={() => onPreview(buildPhotocell(rating), "Photocell")}>Generate combination</button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Contactor + aux auto-selected from rating; photocell, selector, timer, pushbuttons & lamps are fixed.</p>
    </div>
  );
}

function MccBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const [kind, setKind] = useState(MCC_KINDS[0] ?? "DOL-3Ph");
  const kws = useMemo(() => mccKws(kind), [kind]);
  const [kw, setKw] = useState(kws[0] ?? "");
  useEffect(() => setKw(mccKws(kind)[0] ?? ""), [kind]);
  const types = useMemo(() => mccTypes(kind, kw), [kind, kw]);
  const [type, setType] = useState(1);
  useEffect(() => setType(types[0] ?? 1), [types]);
  const [withCtl, setWithCtl] = useState(true);
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div><L>Starter</L><Sel value={kind as any} onChange={(v) => setKind(v)} options={MCC_KINDS as any} className="w-36" /></div>
        <div><L>Motor (kW)</L><Sel value={kw as any} onChange={(v) => setKw(v)} options={kws as any} className="w-32" /></div>
        <div><L>Type</L><Sel value={String(type) as any} onChange={(v) => setType(+v)} options={types.map(String) as any} className="w-24" /></div>
        <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-ink">
          <input type="checkbox" checked={withCtl} onChange={(e) => setWithCtl(e.target.checked)} /> + control acc.
        </label>
        <button className="btn-ghost" onClick={() => onPreview(buildMcc(kind, kw, type, withCtl), `MCC ${kind} ${kw}`)}>Generate combination</button>
      </div>
    </div>
  );
}

function PfcBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const [i, setI] = useState({ ...PFC_DEFAULT });
  const tot = pfcTotalKvar(i);
  // plain functions (not nested components) so inputs keep focus while typing
  const num = (k: "kvar" | "fixedSteps" | "var1Steps" | "var2Steps", label: string) => (
    <div key={k}>
      <L>{label}</L>
      <input className="input w-28" type="number" min={0} value={i[k]}
        onChange={(e) => setI({ ...i, [k]: parseInt(e.target.value) || 0 })} />
    </div>
  );
  const kvarSel = (k: "fixedKvar" | "var1Kvar" | "var2Kvar", label: string) => (
    <div key={k}>
      <L>{label}</L>
      <select className="input w-28 cursor-pointer" value={i[k]} onChange={(e) => setI({ ...i, [k]: +e.target.value as 25 | 50 })}>
        <option value={25}>25 kVAR</option><option value={50}>50 kVAR</option>
      </select>
    </div>
  );
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="mb-2 text-[11px] text-muted">Phase 1: 400 V systems, 25/50 kVAR steps only (RPT-03).</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {num("kvar", "Required kVAR")}
        {num("fixedSteps", "Fixed steps")}{kvarSel("fixedKvar", "Fixed step kVAR")}
        {num("var1Steps", "Var. steps 1")}{kvarSel("var1Kvar", "Var.1 step kVAR")}
        {num("var2Steps", "Var. steps 2")}{kvarSel("var2Kvar", "Var.2 step kVAR")}
      </div>
      <p className={`mt-2 text-xs font-semibold ${tot >= i.kvar ? "text-green-700" : "text-amber-700"}`}>
        Configured: {tot} kVAR {i.kvar ? `of ${i.kvar} required` : ""} {tot >= i.kvar ? "✓" : "— short by " + (i.kvar - tot)}
      </p>
      <button className="btn-ghost mt-2" onClick={() => onPreview(buildPfc(i), "P.F.C")}>Generate combination</button>
    </div>
  );
}

function WdBuilder({ onPreview }: { onPreview: (l: ComboLine[], tag: string) => void }) {
  const [key, setKey] = useState(WD_OPTIONS[0]?.key ?? "");
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <L>Frame · poles</L>
          <select className="input w-48 cursor-pointer" value={key} onChange={(e) => setKey(e.target.value)}>
            {WD_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <button className="btn-ghost" onClick={() => onPreview(buildWd(key), "WD kit")}>Generate kit</button>
      </div>
      <p className="mt-2 text-[11px] text-muted">Adds the fixed part + moving part kit for the selected withdrawable breaker.</p>
    </div>
  );
}

// ── Panel type (RPT-01 §Sizing + RPT-02) — enclosure sizings added like
//    components: pick → row with qty / remove ─────────────────────────────────
function SizingCard({ p, u, factors }: {
  p: LvPanel; u: (patch: Partial<LvPanel>) => void;
  factors: LvState["factors"];
}) {
  const panelsLocked = p.ratingA > PANELS_MAX_INCOMER_A;
  useEffect(() => {
    if (panelsLocked && p.sizingMode === "panels") u({ sizingMode: "cells" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelsLocked]);

  const ps = p.panelsSizing;
  const cc = p.cellConfig;
  const upCells = (patch: Partial<typeof cc>) => u({ cellConfig: retable({ ...cc, ...patch }) });

  const famOptions = ps.layout === "Double" ? DOUBLE_FAMILIES : PANEL_SYSTEMS;
  const sizing1Pool = ENCLOSURES.filter((e) => e.fam === ps.family);
  const sizing2Pool = sizing1Pool.filter((e) => /^(60|80)0?x/i.test(e.name) || e.W === 600 || e.W === 800);

  const ip31Off = proEIp31Disabled(cc.depth, cc.thickness);

  // single-selection enclosure: one item per slot (Single = slot 1; Double = 1 + 2)
  const items = p.panelItems ?? [];
  const slotItem = (slot: 1 | 2) => items.find((it) => (it.slot ?? 1) === slot) ?? null;
  const setSlot = (slot: 1 | 2, e: (typeof ENCLOSURES)[number] | null) => {
    const others = items.filter((it) => (it.slot ?? 1) !== slot);
    const next: PanelTypeItem[] = e
      ? [...others, { id: uid(), slot, fam: e.fam, name: e.name, ref: e.ref, ip: String(e.ip ?? ""), eur: e.eur, egp: e.egp, qty: 1 }]
      : others;
    u({ panelItems: next.sort((a, b) => (a.slot ?? 1) - (b.slot ?? 1)) });
  };
  const setLayout = (layout: "Single" | "Double") => {
    const family = layout === "Double" && !DOUBLE_FAMILIES.includes(ps.family as any) ? "SR-Basic" : ps.family;
    const trimmed = layout === "Single" ? items.filter((it) => (it.slot ?? 1) === 1) : items;
    u({ panelsSizing: { ...ps, layout, family }, panelItems: trimmed });
  };
  const setFamily = (family: string) => u({ panelsSizing: { ...ps, family }, panelItems: [] });
  const keyOf = (it: PanelTypeItem | null) => (it ? `${it.name}|${it.ref}` : "");

  return (
    <div className="card p-5">
      <h2 className="sec-head">Panel type</h2>
      <div className="mb-3 flex gap-1.5">
        <button disabled={panelsLocked}
          onClick={() => u({ sizingMode: "panels" })}
          title={panelsLocked ? `Incomer > ${PANELS_MAX_INCOMER_A} A — cells only (RPT-01)` : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
            p.sizingMode === "panels" ? "border-brand bg-brand text-white"
            : panelsLocked ? "cursor-not-allowed border-line bg-surface text-muted/40" : "border-line bg-white text-muted"
          }`}>
          {panelsLocked && "🔒 "}Panels
        </button>
        <button onClick={() => u({ sizingMode: "cells" })}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${
            p.sizingMode === "cells" ? "border-brand bg-brand text-white" : "border-line bg-white text-muted"
          }`}>
          Cells
        </button>
        {panelsLocked && (
          <span className="self-center text-[11px] font-semibold text-amber-700">
            Incoming C.B &gt; {PANELS_MAX_INCOMER_A} A → Panels disabled
          </span>
        )}
      </div>

      {p.sizingMode === "panels" ? (
        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <L>Layout</L>
              <div className="flex gap-1.5">
                {(["Single", "Double"] as const).map((l) => (
                  <button key={l} onClick={() => setLayout(l)}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-bold ${
                      ps.layout === l ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                    }`}>{l}</button>
                ))}
              </div>
              {ps.layout === "Double" && <p className="mt-1 text-[11px] text-muted">Double: SR-Basic / Unikit only · 2nd width 60/80 (RPT-02)</p>}
            </div>
            <div>
              <L>Enclosure family</L>
              <Sel value={ps.family as any} onChange={(v) => setFamily(v)} options={famOptions as any} />
            </div>
            <div className={ps.layout === "Double" ? "" : "sm:col-span-2"}>
              <L>{ps.layout === "Double" ? "Sizing (1)" : "Sizing"}</L>
              <SearchSelect value={keyOf(slotItem(1))} placeholder="Search size — one selection…"
                options={sizing1Pool.map((e) => ({
                  key: `${e.name}|${e.ref}`,
                  label: e.name,
                  hint: `${e.ref} · ${fmtEgp(enclosurePriceEgp(e, factors))} EGP`,
                }))}
                onPick={(k) => setSlot(1, sizing1Pool.find((x) => `${x.name}|${x.ref}` === k) ?? null)} />
            </div>
            {ps.layout === "Double" && (
              <div>
                <L>Sizing (2) — width 60/80 only</L>
                <SearchSelect value={keyOf(slotItem(2))} placeholder="Search size — one selection…"
                  options={sizing2Pool.map((e) => ({
                    key: `${e.name}|${e.ref}`,
                    label: e.name,
                    hint: `${e.ref} · ${fmtEgp(enclosurePriceEgp(e, factors))} EGP`,
                  }))}
                  onPick={(k) => setSlot(2, sizing2Pool.find((x) => `${x.name}|${x.ref}` === k) ?? null)} />
              </div>
            )}
          </div>

          {/* the selected enclosure(s) — one per slot */}
          {items.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">
              No panel selected — pick one sizing above.
            </p>
          ) : (
            <table className="mt-3 w-full text-[13px]">
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-line/70">
                    <td className="py-1 pr-2 font-medium">
                      {ps.layout === "Double" && <span className="mr-1 rounded bg-brand-light px-1 text-[10px] font-bold text-brand-dark">#{it.slot ?? 1}</span>}
                      {it.fam} — {it.name}
                    </td>
                    <td className="py-1 pr-2 text-[11px] text-muted">{it.ref}</td>
                    <td className="py-1 pr-2 text-right font-semibold">
                      {fmtEgp(it.eur > 0 ? it.eur * factors.euro : it.egp)}
                    </td>
                    <td className="py-1 text-right">
                      <button className="px-1 text-red-500" title="Clear" onClick={() => setSlot((it.slot ?? 1) as 1 | 2, null)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-3 grid gap-3 sm:grid-cols-4">
            <div>
              <L>Cell type</L>
              <Sel value={cc.type as any} onChange={(v) => {
                const fresh = defaultCellConfig(v as CellType);
                u({ cellConfig: fresh });
              }} options={CELL_SYSTEMS as any} />
            </div>
            <div>
              <L>Cell depth</L>
              <div className="flex gap-1">
                {(cc.type === "Pro-E" ? PRO_E_DEPTHS : cc.type === "IS2" ? IS2_DEPTHS : PLP_DEPTHS).map((d) => (
                  <button key={d} onClick={() => upCells({ depth: d })}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
                      cc.depth === d ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                    }`}>{d} cm</button>
                ))}
              </div>
            </div>
            {cc.type === "Pro-E" && (
              <>
                <div>
                  <L>Sheet thickness</L>
                  <div className="flex gap-1">
                    {PRO_E_THICKNESS.map((t) => (
                      <button key={t} onClick={() => {
                        const ip = proEIp31Disabled(cc.depth, t) && cc.ip === "IP31" ? "IP65" : cc.ip;
                        upCells({ thickness: t, ip });
                      }}
                        className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
                          cc.thickness === t ? "border-brand bg-brand-light text-brand-dark" : "border-line bg-white text-muted"
                        }`}>{t} mm</button>
                    ))}
                  </div>
                </div>
                <div>
                  <L>IP rating</L>
                  <div className="flex gap-1">
                    {PRO_E_IPS.map((ip) => {
                      const off = ip === "IP31" && ip31Off;
                      return (
                        <button key={ip} disabled={off}
                          title={off ? "90 cm + 2 mm → IP65 only (RPT-02)" : undefined}
                          onClick={() => !off && upCells({ ip })}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
                            cc.ip === ip ? "border-brand bg-brand-light text-brand-dark"
                            : off ? "cursor-not-allowed border-line bg-surface text-muted/40" : "border-line bg-white text-muted"
                          }`}>{off && "🔒 "}{ip}</button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            {cc.type !== "Pro-E" && (
              <div className="sm:col-span-2 self-end text-[11px] text-muted">IP54 · 1.5 mm (set automatically for {cc.type})</div>
            )}
          </div>

          <table className="w-full max-w-md text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="py-1">Item</th><th className="w-24 py-1">Qty</th>
              </tr>
            </thead>
            <tbody>
              {cc.rows.map((r, i) => (
                <tr key={r.desc} className="border-t border-line/70">
                  <td className="py-1 font-medium">{r.desc}{r.locked && <span className="ml-1.5 text-[10px] text-muted">(fixed)</span>}</td>
                  <td className="py-1">
                    <input className={`input h-7 w-20 px-1.5 text-center text-xs ${r.locked ? "bg-surface" : ""}`}
                      type="number" min={0} value={r.qty} disabled={r.locked}
                      onChange={(e) => {
                        const rows = cc.rows.map((x, j) => (j === i ? { ...x, qty: Math.max(0, parseInt(e.target.value) || 0) } : x));
                        u({ cellConfig: { ...cc, rows } });
                      }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Material List tab (RPT-04) ───────────────────────────────────────────────
function MatTable({ title, rows, withSupplier, note }: { title: string; rows: MatRow[]; withSupplier?: boolean; note?: string }) {
  if (!rows.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-baseline justify-between bg-brand-tint px-4 py-2">
        <h3 className="text-sm font-bold text-brand-dark">{title}</h3>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
            <th className="px-4 py-1.5">Description</th>
            <th className="px-2 py-1.5">Reference</th>
            {withSupplier && <th className="px-2 py-1.5">Supplier</th>}
            <th className="px-2 py-1.5">Stock</th>
            <th className="px-4 py-1.5 text-right">Qty</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line/70">
              <td className="px-4 py-1">{r.description}</td>
              <td className="px-2 py-1 text-[11px] text-muted">{r.reference || "—"}</td>
              {withSupplier && <td className="px-2 py-1 text-muted">{r.supplier}</td>}
              <td className="px-2 py-1 text-[11px] text-muted">{r.stock || "—"}</td>
              <td className="px-4 py-1 text-right font-bold">{r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialTab({ s, abbOnly, setAbbOnly }: { s: LvState; abbOnly: boolean; setAbbOnly: (v: boolean) => void }) {
  const ml = useMemo(() => buildMaterialList(s), [s]);
  const empty = !s.panels.length || (!ml.abb.length && !ml.other.length && !ml.abbEnclosures.length && !ml.proE.length && !ml.is2.length && !ml.plpCells.length);
  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center gap-2">
        {([["ABB M.L", true], ["Full M.L", false]] as [string, boolean][]).map(([label, v]) => (
          <button key={label} onClick={() => setAbbOnly(v)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold ${
              abbOnly === v ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40"
            }`}>{label}</button>
        ))}
        <span className="text-[11px] text-muted">ABB M.L → for ABB discount · Full M.L → supply chain &amp; stock</span>
      </div>

      {empty ? (
        <div className="card p-10 text-center text-sm text-muted">Configure panels first — the Material List updates automatically.</div>
      ) : (
        <>
          <MatTable title="1 · ABB Products" rows={ml.abb} note={s.factors.abbDiscount > 0 ? `ABB discount ${Math.round(s.factors.abbDiscount * 100)}% applies to this table only` : "ABB discount applies to this table only"} />
          {!abbOnly && <MatTable title="2 · Other Suppliers" rows={ml.other} withSupplier />}
          {!abbOnly && <MatTable title="3 · PLP Cells" rows={ml.plpCells} />}
          <MatTable title="4 · ABB Enclosures" rows={ml.abbEnclosures} />
          {!abbOnly && <MatTable title="5 · IS2" rows={ml.is2} />}
          {!abbOnly && (
            <div className="card flex items-center justify-between p-4">
              <h3 className="text-sm font-bold text-brand-dark">6 · Copper — total project weight</h3>
              <span className="text-lg font-extrabold text-ink">{ml.copperKg.toFixed(1)} kg</span>
            </div>
          )}
          {!abbOnly && <MatTable title="7 · Pro-E" rows={ml.proE} />}
        </>
      )}
    </div>
  );
}
