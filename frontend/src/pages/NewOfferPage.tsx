import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import OfferView from "../components/OfferView";
import { useStaff, findPerson, SALES_MANAGER } from "../staff";
import {
  RTU_TYPES,
  BRANDS_BY_FAMILY,
  AVAILABLE_BRANDS_BY_FAMILY,
  CLIENT_SPECS,
  AVAILABLE_CLIENT_SPECS,
  label as toLabel,
} from "../options";
import type { GeneratedOffer, OfferInput, RmuConfigInput, LbsBrand } from "../types";
import "../styles/offer-configurator.css";

const initialRmu: RmuConfigInput = {
  productType: "PRAL",
  lbsBrand: "ABB",
  clientSpec: "EECH",
  voltageKv: 12,
  nalCount: 2,
  nalfCount: 1,
  hasMetering: false,
  rtuType: "NONE",
  installation: "INDOOR",
  busbarCurrentA: 630,
  fuseRatingA: null,
  meteringCtPrimaryA: null,
  ctClass: null,
  vtCores: 1,
  vtBurdenVa: null,
  vtClass: null,
  meteringWithFuse: false,
};

// Tabbed workflow, mirroring the LV section (Project → Panel → Technical → Commercial).
type Tab = "project" | "panel" | "technical" | "commercial";
const TABS: { key: Tab; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "panel", label: "Panel" },
  { key: "technical", label: "Technical Offer" },
  { key: "commercial", label: "Commercial Offer" },
];

/** Trigger a browser download of a same-origin file with a chosen filename. */
function downloadFile(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function NewOfferPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("project");

  const [projectName, setProjectName] = useState("");
  const [customer, setCustomer] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EGP">("USD");
  const [usdRate, setUsdRate] = useState(0); // USD→EGP rate (used when currency = EGP)
  const [rateLoading, setRateLoading] = useState(false);
  const [unitPrice, setUnitPrice] = useState(0);
  const [priceTouched, setPriceTouched] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [discountPct, setDiscountPct] = useState(0);
  const [validityDays, setValidityDays] = useState(7);
  const [deliveryWeeks, setDeliveryWeeks] = useState(12);
  const [paymentTerms, setPaymentTerms] = useState("50% advance, 50% before delivery");
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [rmu, setRmu] = useState<RmuConfigInput>(initialRmu);
  const setR = <K extends keyof RmuConfigInput>(k: K, v: RmuConfigInput[K]) =>
    setRmu((c) => ({ ...c, [k]: v }));
  const isLucy = rmu.productType === "LUCY";

  // Offer cover-page team — sales lists are the SHARED registry (also used by LV)
  const [staff, setStaff] = useStaff();
  const [newSales, setNewSales] = useState({ name: "", mobile: "", email: "" });
  const [newEng, setNewEng] = useState("");
  // Pre-fill the QTN from the New-QTN dialog (RMU → /offers/new?qtn=QTN-26-…).
  const [params] = useSearchParams();
  const [team, setTeam] = useState({
    quotationNo: params.get("qtn") || "", opportunityNo: "",
    salesName: "", salesMobile: "", salesEmail: "",
    salesManagerName: "", salesManagerMobile: "", salesManagerEmail: "",
    supportName: "", supportMobile: "", supportEmail: "",
  });
  const upTeam = (patch: Partial<typeof team>) => setTeam((t) => ({ ...t, ...patch }));
  const pickSales = (name: string) => {
    const p = findPerson(staff.salesPeople, name);
    upTeam({ salesName: name, salesMobile: p?.mobile ?? "", salesEmail: p?.email ?? "" });
  };
  // Sales manager is fixed (Ali Kamal); his contact comes from the shared registry.
  const manager = findPerson(staff.salesManagers, SALES_MANAGER)
    ?? findPerson(staff.salesPeople, SALES_MANAGER)
    ?? { name: SALES_MANAGER, mobile: "", email: "" };
  const pickSupport = (name: string) => {
    const p = findPerson(staff.supportEngineers, name);
    upTeam({ supportName: name, supportMobile: p?.mobile ?? "", supportEmail: p?.email ?? "" });
  };
  const addSalesPerson = () => {
    if (!newSales.name.trim()) return;
    setStaff({ ...staff, salesPeople: [...staff.salesPeople, { ...newSales, name: newSales.name.trim() }] });
    setNewSales({ name: "", mobile: "", email: "" });
  };
  const removeSalesPerson = (name: string) =>
    setStaff({ ...staff, salesPeople: staff.salesPeople.filter((x) => x.name !== name) });
  const addEngineer = () => {
    if (!newEng.trim()) return;
    setStaff({ ...staff, supportEngineers: [...staff.supportEngineers, { name: newEng.trim(), mobile: "", email: "" }] });
    setNewEng("");
  };
  const removeEngineer = (name: string) =>
    setStaff({ ...staff, supportEngineers: staff.supportEngineers.filter((x) => x.name !== name) });

  // Keep the brand to one we actually have data for (PSEC: ABB/Murge, PRAL: ABB)
  // — reset to ABB if the current brand isn't available for the family.
  useEffect(() => {
    if (rmu.productType === "LUCY") return; // Lucy has no LBS brand
    const available = AVAILABLE_BRANDS_BY_FAMILY[rmu.productType];
    if (rmu.lbsBrand && !available.includes(rmu.lbsBrand)) {
      setRmu((c) => ({ ...c, lbsBrand: "ABB" }));
    }
  }, [rmu.productType, rmu.lbsBrand]);

  // Client spec: only EECH has data — reset to EECH if KAHRABA somehow set.
  useEffect(() => {
    if (rmu.clientSpec && !AVAILABLE_CLIENT_SPECS.includes(rmu.clientSpec)) {
      setRmu((c) => ({ ...c, clientSpec: "EECH" }));
    }
  }, [rmu.clientSpec]);

  // PRAL has no smart option — force it off (standard) whenever PRAL is selected.
  useEffect(() => {
    if (rmu.productType === "PRAL" && rmu.rtuType !== "NONE") {
      setRmu((c) => ({ ...c, rtuType: "NONE" }));
    }
  }, [rmu.productType, rmu.rtuType]);

  const [preview, setPreview] = useState<GeneratedOffer | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; offerNumber: string; items: string[] } | null>(null);
  // Reuse a created offer across per-tab downloads until an input changes.
  const [created, setCreated] = useState<{ id: string; offerNumber: string; sig: string } | null>(null);

  const code = useMemo(
    () =>
      `${rmu.productType}${rmu.voltageKv}(${rmu.nalCount}+${rmu.nalfCount}${
        rmu.hasMetering ? "+M" : ""
      })`,
    [rmu]
  );
  const panelCode = preview?.panelCode || preview?.configCode || "…";
  const basePriceUsd = preview?.listPricing?.basePrice ?? null;
  const addOns = preview?.listPricing?.addOns ?? [];
  const rate = currency === "EGP" ? usdRate || 1 : 1;
  const basePrice = basePriceUsd == null ? null : basePriceUsd * rate; // in the selected currency
  const effUnit = unitPrice > 0 ? unitPrice : basePrice ?? 0;
  const addOnsUnit = addOns.reduce((s, a) => s + a.price, 0) * rate;
  const vatPct = preview?.vatPct ?? 14; // from the pricing master via the preview
  const totals = useMemo(() => {
    const qty = quantity || 0;
    const panelSubtotal = effUnit * qty;
    const addOnsTotal = addOnsUnit * qty;
    const subtotal = panelSubtotal + addOnsTotal;
    const discount = subtotal * (discountPct / 100);
    const exVat = subtotal - discount;
    const vat = exVat * (vatPct / 100);
    return { panelSubtotal, addOnsTotal, subtotal, discount, exVat, vat, incVat: exVat + vat };
  }, [effUnit, addOnsUnit, quantity, discountPct, vatPct]);

  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        setPreview(await api.previewConfig(rmu));
        setPreviewErr(null);
      } catch (e) {
        setPreviewErr((e as Error).message);
      }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [rmu]);

  // Default the unit price from the price-list DB; once the user edits it we stop
  // auto-filling so their manual value sticks.
  useEffect(() => {
    if (!priceTouched) setUnitPrice(basePrice ?? 0);
  }, [basePrice, priceTouched]);

  // USD→EGP exchange rate — auto-fetched when EGP is selected, but editable.
  async function fetchRate() {
    setRateLoading(true);
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await res.json();
      const egp = j?.rates?.EGP;
      if (egp) setUsdRate(Math.round(egp * 100) / 100);
    } catch {
      /* offline / blocked — keep the manual value */
    } finally {
      setRateLoading(false);
    }
  }
  useEffect(() => {
    if (currency === "EGP" && !usdRate) fetchRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  // No catalogue price for this config and no manual price entered.
  const priceMissing = basePrice == null && unitPrice <= 0;

  function buildPayload(): OfferInput {
    return {
      category: "RMU",
      salesNumber: null,
      orderNumber: null,
      quotationNo: team.quotationNo || null,
      opportunityNo: team.opportunityNo || null,
      salesName: team.salesName || null,
      salesMobile: team.salesMobile || null,
      salesEmail: team.salesEmail || null,
      salesManagerName: manager.name || null,
      salesManagerMobile: manager.mobile || null,
      salesManagerEmail: manager.email || null,
      supportName: team.supportName || null,
      supportMobile: team.supportMobile || null,
      supportEmail: team.supportEmail || null,
      projectName,
      customer,
      status: "DRAFT",
      notes: null,
      currency,
      usdToEgpRate: currency === "EGP" ? usdRate || null : null,
      unitPrice,
      quantity,
      discountPct,
      validityDays,
      deliveryWeeks,
      paymentTerms: paymentTerms || null,
      warrantyMonths,
      offerDate: date || null,
      rmu,
    };
  }

  /** Create the offer once and reuse it while inputs are unchanged. */
  async function ensureOffer(payload: OfferInput, sig: string) {
    if (created && created.sig === sig) return created;
    const c = await api.createOffer(payload);
    const rec = { id: c.id, offerNumber: c.offerNumber, sig };
    setCreated(rec);
    return rec;
  }

  /** Generate + download the requested PDFs (Technical / Commercial). */
  async function download(outputs: ("Technical" | "Commercial")[]) {
    if (!projectName.trim() || !customer.trim()) {
      setError("Enter a project name and customer on the Project tab first.");
      setTab("project");
      return;
    }
    if (outputs.includes("Commercial") && priceMissing) {
      setError(`No catalogue price for ${panelCode} — enter a unit price on the Commercial tab.`);
      setTab("commercial");
      return;
    }
    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      const payload = buildPayload();
      const rec = await ensureOffer(payload, JSON.stringify(payload));
      const jobs: { url: string; name: string; label: string }[] = [];
      if (outputs.includes("Technical"))
        jobs.push({ url: api.pdfUrl(rec.id, true), name: `${rec.offerNumber}-Technical.pdf`, label: "Technical" });
      if (outputs.includes("Commercial"))
        jobs.push({ url: api.commercialPdfUrl(rec.id, true), name: `${rec.offerNumber}-Commercial.pdf`, label: "Commercial" });
      jobs.forEach((j, i) => setTimeout(() => downloadFile(j.url, j.name), i * 700));
      setDone({ id: rec.id, offerNumber: rec.offerNumber, items: jobs.map((j) => j.label) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const generateAll = () => download(priceMissing ? ["Technical"] : ["Technical", "Commercial"]);

  const ti = TABS.findIndex((t) => t.key === tab);
  const prevTab = TABS[ti - 1];
  const nextTab = TABS[ti + 1];

  return (
    <div className="oc animate-fade-up">
      {/* ── Page top bar: identity + live code ──────────────────────────── */}
      <div className="topbar">
        <div className="topbar-in">
          <span className="wordmark"><i />New RMU Offer</span>
          <span className="sep" />
          <span className="qtn">QTN&nbsp;<b>{team.quotationNo || "—"}</b></span>
          <span className="qtn">·&nbsp;{projectName || "Untitled project"}</span>
          <span className="spacer" />
          <div className="code-out">
            <span key={panelCode} className="chip mono pop">{panelCode}</span>
            <div className="code-alt">{code}</div>
          </div>
        </div>
      </div>

      {/* ── Stepper ─────────────────────────────────────────────────────── */}
      <div className="steps">
        {TABS.map((t, i) => (
          <button key={t.key} type="button" className={`step${tab === t.key ? " is-current" : ""}`} onClick={() => setTab(t.key)}>
            <span className="n">{i + 1}</span>
            <span className="txt">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="wrap">
        {done && (
          <div className="notice ok">
            <div className="notice-row">
              <div>
                <div className="n-title">✓ Offer {done.offerNumber} generated</div>
                <div>Downloading {done.items.join(" · ")} PDF{done.items.length > 1 ? "s" : ""} — check your Downloads folder.</div>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => navigate(`/offers/${done.id}`)}>View offer →</button>
            </div>
          </div>
        )}
        {error && <div className="notice err">{error}</div>}

        {/* ── Project tab ─────────────────────────────────────────────── */}
        {tab === "project" && (
          <div className="stack">
            <section className="card has-body">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Project</h2>
                  <p className="card-sub">Used to generate the Technical &amp; Commercial offer cover pages.</p>
                </div>
              </div>
              <div className="card-body">
                <div className="grid2">
                  <Cell label="Project name"><Inp value={projectName} onChange={setProjectName} /></Cell>
                  <Cell label="Customer"><Inp value={customer} onChange={setCustomer} /></Cell>
                  <Cell label="QTN No."><Inp value={team.quotationNo} onChange={(v) => upTeam({ quotationNo: v })} /></Cell>
                  <Cell label="OPTY No."><Inp value={team.opportunityNo} onChange={(v) => upTeam({ opportunityNo: v })} /></Cell>
                  <Cell label="Sales support engineer">
                    <div className="inp">
                      <select value={team.supportName} onChange={(e) => pickSupport(e.target.value)}>
                        <option value="">— select —</option>
                        {staff.supportEngineers.map((p) => <option key={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                  </Cell>
                  <Cell label="Date"><Inp type="date" value={date} onChange={setDate} /></Cell>
                  <Cell label="Sales person">
                    <div className="inp">
                      <select value={team.salesName} onChange={(e) => pickSales(e.target.value)}>
                        <option value="">— select —</option>
                        {staff.salesPeople.filter((p) => p.name !== SALES_MANAGER).map((p) => <option key={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                  </Cell>
                  <Cell label="Sales person phone"><Inp value={team.salesMobile} fixed /></Cell>
                  <Cell label="Sales person email" span><Inp value={team.salesEmail} fixed /></Cell>
                  <Cell label="Sales manager"><Inp value={manager.name} fixed /></Cell>
                  <Cell label="Manager phone"><Inp value={manager.mobile} fixed /></Cell>
                  <Cell label="Manager email" span noLine><Inp value={manager.email} fixed /></Cell>
                </div>
              </div>
            </section>

            <section className="card has-body">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Staff lists</h2>
                  <p className="card-sub">Editable — <b>shared with the LV section</b>. Add or remove names.</p>
                </div>
              </div>
              <div className="card-body">
                <span className="lbl">Sales people</span>
                <div className="list" style={{ marginBottom: 10 }}>
                  {staff.salesPeople.map((p) => (
                    <div key={p.name} className="list-row">
                      <span>{p.name} <span className="meta">{p.mobile} · {p.email}</span></span>
                      <button type="button" className="linkbtn" onClick={() => removeSalesPerson(p.name)}>remove</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                  <div className="inp" style={{ width: 150 }}><input placeholder="Name" value={newSales.name} onChange={(e) => setNewSales({ ...newSales, name: e.target.value })} /></div>
                  <div className="inp" style={{ width: 150 }}><input placeholder="Mobile" value={newSales.mobile} onChange={(e) => setNewSales({ ...newSales, mobile: e.target.value })} /></div>
                  <div className="inp" style={{ width: 210 }}><input placeholder="Email" value={newSales.email} onChange={(e) => setNewSales({ ...newSales, email: e.target.value })} /></div>
                  <button type="button" className="btn btn-sm" onClick={addSalesPerson}>+ Add</button>
                </div>
                <span className="lbl">Sales support engineers</span>
                <div className="taglist" style={{ marginBottom: 10 }}>
                  {staff.supportEngineers.map((eng) => (
                    <span key={eng.name} className="tag">{eng.name}<button type="button" className="linkbtn" onClick={() => removeEngineer(eng.name)}>×</button></span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="inp" style={{ width: 240 }}><input placeholder="New engineer name" value={newEng} onChange={(e) => setNewEng(e.target.value)} /></div>
                  <button type="button" className="btn btn-sm" onClick={addEngineer}>+ Add</button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── Panel tab ───────────────────────────────────────────────── */}
        {tab === "panel" && (
          <div className="cols panel-cols">
            <div className="stack">
            <section className="card has-body">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Panel — RMU Code</h2>
                  <p className="card-sub">The code updates live as you configure.</p>
                </div>
                <div className="code-out">
                  <span key={panelCode} className="chip mono pop">{panelCode}</span>
                  <div className="code-alt">{code}</div>
                </div>
              </div>
              <div className="card-body">
                <div className="grid2">
                  <Cell label="Product type" span>
                    <Seg field="product" value={rmu.productType} onChange={(v) => setR("productType", v)}
                      options={["PRAL", "PSEC", "LUCY"] as const}
                      renderLabel={(v) => (v === "PRAL" ? "PRAL · Air" : v === "PSEC" ? "PSEC · SF6" : "LUCY · GIS")} />
                  </Cell>
                  {!isLucy && (
                    <>
                      <Cell label="LBS brand / type" span
                        hint={rmu.productType === "PSEC" ? "ABB · Murge available · Schneider locked (no data)" : "ABB available · Chint locked (no data)"}>
                        <Seg value={(rmu.lbsBrand ?? "ABB") as LbsBrand} onChange={(v) => setR("lbsBrand", v)}
                          options={BRANDS_BY_FAMILY[rmu.productType] as readonly LbsBrand[]}
                          disabledOptions={BRANDS_BY_FAMILY[rmu.productType].filter((b) => !AVAILABLE_BRANDS_BY_FAMILY[rmu.productType].includes(b)) as readonly LbsBrand[]} />
                      </Cell>
                      <Cell label="Client specification" span hint="EECH available · KAHRABA locked (no technical offer)">
                        <Seg value={rmu.clientSpec ?? "EECH"} onChange={(v) => setR("clientSpec", v)}
                          options={CLIENT_SPECS}
                          disabledOptions={CLIENT_SPECS.filter((s) => !AVAILABLE_CLIENT_SPECS.includes(s)) as readonly ("EECH" | "KAHRABA")[]} />
                      </Cell>
                    </>
                  )}
                  <Cell label="Rated voltage">
                    <Seg value={String(rmu.voltageKv) as "12" | "24"} onChange={(v) => setR("voltageKv", Number(v) as 12 | 24)}
                      options={["12", "24"] as const} renderLabel={(v) => `${v} kV`} />
                  </Cell>
                  <Cell label="Installation" hint="Outdoor adds an enclosure (priced in the commercial offer)">
                    <Seg value={rmu.installation} onChange={(v) => setR("installation", v)}
                      options={["INDOOR", "OUTDOOR"] as const} renderLabel={(v) => (v === "INDOOR" ? "Indoor" : "Outdoor")} />
                  </Cell>
                  <Cell label={isLucy ? "Feeders (R)" : "Ring feeders (R)"} hint={isLucy ? "Load-break switches (L)" : "NAL — R0 to R5"}>
                    <Num value={rmu.nalCount} min={0} onChange={(v) => setR("nalCount", Number.isNaN(v) ? 0 : v)} />
                  </Cell>
                  <Cell label="Transformer feeders (T)" hint={isLucy ? "Circuit breakers (V)" : "NALF — T0 to T2"}>
                    <Num value={rmu.nalfCount} min={0} onChange={(v) => setR("nalfCount", Number.isNaN(v) ? 0 : v)} />
                  </Cell>
                  <Cell label="Busbar current">
                    <Inp type="number" unit="A" value={rmu.busbarCurrentA} onChange={(s) => setR("busbarCurrentA", s === "" ? 0 : Number(s))} />
                  </Cell>
                  {!isLucy && (
                    <Cell label="Fuse rating" hint="Blank = catalogue max ('up to')">
                      <Inp type="number" unit="A" placeholder="standard" value={rmu.fuseRatingA ?? ""} onChange={(s) => setR("fuseRatingA", s === "" ? null : Number(s))} />
                    </Cell>
                  )}
                </div>
              </div>
            </section>
            </div>

            <div className="stack">
            {/* Metering */}
            <section className={`card${rmu.hasMetering ? " has-body" : ""}`}>
              <div className="card-head">
                <Sw checked={rmu.hasMetering} onChange={(v) => setR("hasMetering", v)} label="Include Metering cubicle (+M)" />
              </div>
              {rmu.hasMetering && (
                <div className="card-body">
                  {isLucy ? (
                    <p className="hint">Lucy metering is a fixed Air-Insulated Metering Unit (100/5A CT, 50 VA VT) — no extra options.</p>
                  ) : (
                    <div className="grid2">
                      <Cell label="CT primary current" hint="Fills X/5 & Ip — blank keeps 'X'">
                        <Inp type="number" unit="A" placeholder="e.g. 200" value={rmu.meteringCtPrimaryA ?? ""} onChange={(s) => setR("meteringCtPrimaryA", s === "" ? null : Number(s))} />
                      </Cell>
                      <Cell label="CT class (CL)" hint="Metering CT accuracy class">
                        <Seg value={(rmu.ctClass ?? "0.5") as "0.5" | "0.5S" | "0.2"} onChange={(v) => setR("ctClass", v)} options={["0.5", "0.5S", "0.2"] as const} renderLabel={(v) => v} />
                      </Cell>
                      <Cell label="Voltage transformer" span hint="Two core → with fuse · single core → without fuse">
                        <Seg value={String(rmu.vtCores ?? 1) as "1" | "2"} onChange={(v) => { const c = Number(v); setR("vtCores", c); setR("meteringWithFuse", c === 2); }} options={["1", "2"] as const} renderLabel={(v) => (v === "1" ? "Single core" : "Two core")} />
                      </Cell>
                      <Cell label="VT burden (VA)" hint="Fixed"><Inp value="50-100" fixed /></Cell>
                      <Cell label="VT class (CL)" hint="Fixed" noLine><Inp value="0.5" fixed /></Cell>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Smart / RTU — PSEC & Lucy only (PRAL has no smart) */}
            {rmu.productType !== "PRAL" && (
              <section className={`card${rmu.rtuType !== "NONE" ? " has-body" : ""}`}>
                <div className="card-head">
                  <Sw checked={rmu.rtuType !== "NONE"} onChange={(on) => setR("rtuType", on ? "READY1" : "NONE")} label="Smart / RTU (optional)" />
                </div>
                {rmu.rtuType !== "NONE" && (
                  <div className="card-body">
                    <div className="grid2">
                      <Cell label="Smart level" span noLine hint="Priced as a separate line in the commercial offer">
                        <Sel value={rmu.rtuType} onChange={(v) => setR("rtuType", v)} options={RTU_TYPES} />
                      </Cell>
                    </div>
                  </div>
                )}
              </section>
            )}
            <section className="card">
              <div className="card-body" style={{ paddingTop: 16 }}>
                <p className="decode-h">Code breakdown</p>
                <div className="tokens">
                  {decodeTokens(rmu).map((t, i) => (
                    <span key={i} className="tok"><span className="k">{t.k}</span><span className="v">{t.v}</span></span>
                  ))}
                </div>
              </div>
            </section>
            </div>
          </div>
        )}

        {/* ── Technical Offer tab ─────────────────────────────────────── */}
        {tab === "technical" && (
          <div className="stack">
            <div className="notice-row" style={{ marginBottom: 2 }}>
              <span className="qtn" style={{ textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
                <span style={{ color: "#16a34a" }}>●</span>&nbsp;Live technical offer
              </span>
              <button type="button" className="btn btn-primary btn-sm" disabled={submitting} onClick={() => download(["Technical"])}>
                {submitting ? "Generating…" : "⬇ Download Technical PDF"}
              </button>
            </div>
            <section className="card">
              <div className="card-body" style={{ paddingTop: 16 }}>
                {previewErr ? (
                  <div className="notice err" style={{ margin: 0 }}>{previewErr}</div>
                ) : preview ? (
                  <OfferView g={preview} />
                ) : (
                  <div className="stack">
                    <div className="sk" style={{ height: 96 }} />
                    <div className="sk" style={{ height: 128 }} />
                    <div className="sk" style={{ height: 160 }} />
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ── Commercial Offer tab ────────────────────────────────────── */}
        {tab === "commercial" && (
          <div className="stack">
            <section className="card has-body">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Commercial</h2>
                  <p className="card-sub">Pricing, quantity and terms for the commercial offer.</p>
                </div>
                <div className="code-out">
                  {basePrice != null ? (
                    <span className="chip mono">{currency} {basePrice.toLocaleString()}</span>
                  ) : (
                    <span className="chip mono" style={{ background: "#8A5A12" }}>No catalogue price</span>
                  )}
                  <div className="code-alt">{basePrice != null ? "Panel list (min)" : "enter a unit price"}</div>
                </div>
              </div>
              <div className="card-body">
                {basePrice == null && (
                  <div className="notice warn">
                    <b>{panelCode}</b> isn’t in the price list, so it has no automatic price. Enter the <b>unit price</b> manually below.
                  </div>
                )}
                <div className="grid2">
                  <Cell label="Currency"><Seg value={currency} onChange={(v) => setCurrency(v)} options={["USD", "EGP"] as const} renderLabel={(v) => v} /></Cell>
                  {currency === "EGP" && (
                    <Cell label="USD → EGP rate" hint="Auto-fetched daily rate — editable">
                      <div style={{ display: "flex", gap: 8 }}>
                        <Inp type="number" step={0.01} placeholder="rate" value={usdRate || ""} onChange={(s) => setUsdRate(s === "" ? 0 : Number(s))} />
                        <button type="button" className="btn btn-sm" onClick={fetchRate} disabled={rateLoading} style={{ whiteSpace: "nowrap" }}>{rateLoading ? "…" : "↻ Fetch"}</button>
                      </div>
                    </Cell>
                  )}
                  <Cell label={basePrice == null ? "Unit price *" : "Unit price"} hint={basePrice != null ? "From price list — editable" : "Required — no catalogue price"}>
                    <Inp type="number" unit={currency} placeholder={basePrice != null ? String(basePrice) : "0"} value={unitPrice || ""} onChange={(s) => { setPriceTouched(true); setUnitPrice(s === "" ? 0 : Number(s)); }} />
                  </Cell>
                  <Cell label="Quantity"><Num value={quantity} min={1} onChange={(v) => setQuantity(Number.isNaN(v) ? 1 : v)} /></Cell>
                  <Cell label="Discount (%)"><Inp type="number" unit="%" step={0.5} value={discountPct} onChange={(s) => setDiscountPct(s === "" ? 0 : Number(s))} /></Cell>
                  <Cell label="Validity (days)"><Inp type="number" unit="days" value={validityDays} onChange={(s) => setValidityDays(s === "" ? 0 : Number(s))} /></Cell>
                  <Cell label="Delivery (weeks)"><Inp type="number" unit="wks" value={deliveryWeeks} onChange={(s) => setDeliveryWeeks(s === "" ? 0 : Number(s))} /></Cell>
                  <Cell label="Warranty (months)"><Inp type="number" unit="mo" value={warrantyMonths} onChange={(s) => setWarrantyMonths(s === "" ? 0 : Number(s))} /></Cell>
                  <Cell label="Payment terms" span noLine><Inp value={paymentTerms} placeholder="50% advance, 50% before delivery" onChange={setPaymentTerms} /></Cell>
                </div>
                <div className="totals">
                  <div className="totrow"><span>Panel · {quantity} × {currency} {effUnit.toLocaleString()}</span><span>{currency} {totals.panelSubtotal.toLocaleString()}</span></div>
                  {addOns.map((a) => (
                    <div key={a.name} className="totrow"><span>{a.name} · {quantity} × {currency} {(a.price * rate).toLocaleString()}</span><span>{currency} {(a.price * rate * quantity).toLocaleString()}</span></div>
                  ))}
                  {discountPct > 0 && (
                    <div className="totrow"><span>Discount ({discountPct}%)</span><span>− {currency} {totals.discount.toLocaleString()}</span></div>
                  )}
                  <div className="totrow"><span>VAT ({vatPct}%)</span><span>{currency} {totals.vat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                  <div className="totrow grand"><span>Total (incl. VAT)</span><span>{currency} {totals.incVat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                </div>
                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => download(["Commercial"])}>
                    {submitting ? "Generating…" : "⬇ Download Commercial PDF"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* ── Action bar ──────────────────────────────────────────────────── */}
      <div className="actionbar">
        <div className="actionbar-in">
          <div className="ab-code">{panelCode}<small>{code}</small></div>
          <span className="spacer" />
          {prevTab && <button type="button" className="btn" onClick={() => setTab(prevTab.key)}>← {prevTab.label}</button>}
          {nextTab && <button type="button" className="btn" onClick={() => setTab(nextTab.key)}>{nextTab.label} →</button>}
          <button type="button" className="btn btn-primary" disabled={submitting} onClick={generateAll}>
            {submitting ? "Generating…" : "Generate & Download →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── local themed controls ───────────────────────
   These render the offer-configurator theme's markup (.seg/.num/.sw/.inp) and
   live only on this page, so the shared LV field components stay untouched. */

function Cell({ label, hint, span, noLine, children }: { label?: string; hint?: string; span?: boolean; noLine?: boolean; children: ReactNode }) {
  return (
    <div className={`cell${span ? " span2" : ""}${noLine ? " no-line" : ""}`}>
      {label && <span className="lbl">{label}</span>}
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function LockI() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Seg<T extends string>({ value, onChange, options, renderLabel, disabledOptions, field }: {
  value: T; onChange: (v: T) => void; options: readonly T[];
  renderLabel?: (v: T) => ReactNode; disabledOptions?: readonly T[]; field?: string;
}) {
  return (
    <div className="seg" data-field={field}>
      {options.map((o) => {
        const active = o === value;
        const locked = disabledOptions?.includes(o);
        return (
          <button key={o} type="button" aria-checked={active} disabled={locked}
            title={locked ? "No data yet — locked" : undefined}
            onClick={() => !locked && onChange(o)}>
            {locked && <LockI />}
            <span className="t">{renderLabel ? renderLabel(o) : toLabel(o)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Num({ value, onChange, min, step = 1, placeholder }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; placeholder?: string;
}) {
  const cur = Number.isNaN(value) ? NaN : value;
  const base = Number.isNaN(cur) ? (min ?? 0) : cur;
  const atMin = min != null && !Number.isNaN(cur) && cur <= min;
  return (
    <div className="num">
      <button type="button" aria-label="decrease" disabled={atMin}
        onClick={() => { const n = base - step; onChange(min != null ? Math.max(min, n) : n); }}>−</button>
      <input className="val" type="number" min={min} step={step} placeholder={placeholder}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
      <button type="button" aria-label="increase" onClick={() => onChange(base + step)}>+</button>
    </div>
  );
}

function Inp({ value, onChange, type = "text", unit, placeholder, fixed, step }: {
  value: string | number; onChange?: (v: string) => void; type?: string;
  unit?: string; placeholder?: string; fixed?: boolean; step?: number;
}) {
  const editable = !fixed && !!onChange;
  return (
    <div className={`inp${fixed ? " is-fixed" : ""}`}>
      <input type={type} value={value} placeholder={placeholder} step={step} readOnly={!editable}
        onChange={editable ? (e) => onChange!(e.target.value) : undefined} />
      {unit && <span className="unit">{unit}</span>}
    </div>
  );
}

function Sel<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: readonly T[] }) {
  return (
    <div className="inp">
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o} value={o}>{toLabel(o)}</option>)}
      </select>
    </div>
  );
}

function Sw({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="sw-row">
      <span className="sw-label">{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="sw" onClick={() => onChange(!checked)} />
    </div>
  );
}

/** Break the live RMU code into labelled tokens for the "Code breakdown" strip. */
function decodeTokens(rmu: RmuConfigInput): { k: string; v: string }[] {
  const fam = rmu.productType === "PRAL" ? "Air RMU" : rmu.productType === "PSEC" ? "SF6 RMU" : "GIS RMU";
  const t: { k: string; v: string }[] = [
    { k: rmu.productType, v: fam },
    { k: `${rmu.voltageKv}kV`, v: "Rated voltage" },
  ];
  if (rmu.productType !== "LUCY" && rmu.lbsBrand) t.push({ k: rmu.lbsBrand, v: "LBS brand" });
  if (rmu.productType !== "LUCY" && rmu.clientSpec) t.push({ k: rmu.clientSpec, v: "Client spec" });
  t.push({ k: `R${rmu.nalCount}`, v: rmu.productType === "LUCY" ? "Feeders" : "Ring feeders" });
  t.push({ k: `T${rmu.nalfCount}`, v: "Transformer" });
  if (rmu.hasMetering) t.push({ k: "+M", v: "Metering" });
  t.push({ k: rmu.installation === "INDOOR" ? "Indoor" : "Outdoor", v: "Installation" });
  if (rmu.rtuType && rmu.rtuType !== "NONE") t.push({ k: "RTU", v: toLabel(rmu.rtuType) });
  return t;
}
