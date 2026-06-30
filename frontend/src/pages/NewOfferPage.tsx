import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import {
  Field,
  TextInput,
  NumberInput,
  Select,
  Segmented,
  Toggle,
} from "../components/fields";
import OfferView from "../components/OfferView";
import { useStaff, findPerson, SALES_MANAGER } from "../staff";
import {
  RTU_TYPES,
  BRANDS_BY_FAMILY,
  AVAILABLE_BRANDS_BY_FAMILY,
  CLIENT_SPECS,
  AVAILABLE_CLIENT_SPECS,
} from "../options";
import type { GeneratedOffer, OfferInput, RmuConfigInput, LbsBrand } from "../types";

const initialRmu: RmuConfigInput = {
  productType: "PRAL",
  lbsBrand: "ABB",
  clientSpec: "EECH",
  voltageKv: 12,
  nalCount: 2,
  nalfCount: 1,
  hasMetering: false,
  rtuType: "READY1",
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

  const [rmu, setRmu] = useState<RmuConfigInput>(initialRmu);
  const setR = <K extends keyof RmuConfigInput>(k: K, v: RmuConfigInput[K]) =>
    setRmu((c) => ({ ...c, [k]: v }));

  // What to generate (each is independently selectable — e.g. export Commercial
  // or SLD only, without the Technical offer). At least one must be selected.
  const [wantTechnical, setWantTechnical] = useState(true);
  const [wantCommercial, setWantCommercial] = useState(false);
  const [wantSld, setWantSld] = useState(false);

  // SLD cover fields
  const [salesNumber, setSalesNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [notes, setNotes] = useState("");

  // Offer cover-page team — sales lists are the SHARED registry (also used by LV)
  const [staff, setStaff] = useStaff();
  const [newSales, setNewSales] = useState({ name: "", mobile: "", email: "" });
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

  // Keep the brand to one we actually have data for (PSEC: ABB/Murge, PRAL: ABB)
  // — reset to ABB if the current brand isn't available for the family.
  useEffect(() => {
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

  // SLD is available for PSEC only (for now) — turn it off for PRAL.
  useEffect(() => {
    if (rmu.productType !== "PSEC" && wantSld) setWantSld(false);
  }, [rmu.productType, wantSld]);

  const [preview, setPreview] = useState<GeneratedOffer | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; offerNumber: string; items: string[] } | null>(null);

  const code = useMemo(
    () =>
      `${rmu.productType}${rmu.voltageKv}(${rmu.nalCount}+${rmu.nalfCount}${
        rmu.hasMetering ? "+M" : ""
      })`,
    [rmu]
  );
  const panelCode = preview?.panelCode ?? "…";
  const basePriceUsd = preview?.listPricing?.basePrice ?? null;
  const addOns = preview?.listPricing?.addOns ?? [];
  const rate = currency === "EGP" ? usdRate || 1 : 1;
  const basePrice = basePriceUsd == null ? null : basePriceUsd * rate; // in the selected currency
  const effUnit = unitPrice > 0 ? unitPrice : basePrice ?? 0;
  const addOnsUnit = addOns.reduce((s, a) => s + a.price, 0) * rate;
  const totals = useMemo(() => {
    const qty = quantity || 0;
    const panelSubtotal = effUnit * qty;
    const addOnsTotal = addOnsUnit * qty;
    const subtotal = panelSubtotal + addOnsTotal;
    const discount = subtotal * (discountPct / 100);
    const exVat = subtotal - discount;
    const vat = exVat * 0.14;
    return { panelSubtotal, addOnsTotal, subtotal, discount, exVat, vat, incVat: exVat + vat };
  }, [effUnit, addOnsUnit, quantity, discountPct]);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!wantTechnical && !wantCommercial && !wantSld) {
      setError("Select at least one output to export (Technical, Commercial, or SLD).");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (wantCommercial && priceMissing) {
      setError(
        `No catalogue price for ${panelCode}. Enter a unit price in the Commercial section before generating a commercial offer.`
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      const payload: OfferInput = {
        category: "RMU",
        salesNumber: salesNumber || null,
        orderNumber: orderNumber || null,
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
        notes: notes || null,
        currency,
        usdToEgpRate: currency === "EGP" ? usdRate || null : null,
        unitPrice,
        quantity,
        discountPct,
        validityDays,
        deliveryWeeks,
        paymentTerms: paymentTerms || null,
        warrantyMonths,
        rmu,
      };
      const created = await api.createOffer(payload);
      // Directly download the selected outputs (any combination of Technical /
      // Commercial / SLD — e.g. Commercial or SLD only).
      const num = created.offerNumber;
      const jobs: { url: string; name: string; label: string }[] = [];
      if (wantTechnical)
        jobs.push({ url: `${api.pdfUrl(created.id)}?dl=1`, name: `${num}-Technical.pdf`, label: "Technical" });
      if (wantCommercial)
        jobs.push({ url: `${api.commercialPdfUrl(created.id)}?dl=1`, name: `${num}-Commercial.pdf`, label: "Commercial" });
      if (wantSld)
        jobs.push({ url: `${api.sldPdfUrl(created.id)}?dl=1`, name: `${num}-SLD.pdf`, label: "SLD" });
      // stagger so the browser doesn't block multiple simultaneous downloads
      jobs.forEach((j, i) => setTimeout(() => downloadFile(j.url, j.name), i * 700));
      setDone({ id: created.id, offerNumber: num, items: jobs.map((j) => j.label) });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError((err as Error).message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="mb-5 flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">New RMU Offer</h1>
          <p className="text-sm text-muted">Configure the code — the offer builds itself.</p>
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Generating…" : "Generate & Download →"}
        </button>
      </div>

      {/* What to generate */}
      <div className="card mb-5 p-4 animate-fade-up">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
          What do you want to generate?
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <OutputCard
            active={wantTechnical}
            onClick={() => setWantTechnical((v) => !v)}
            label="Technical Offer"
            desc="Specs & cubicle lineup"
          />
          <OutputCard
            active={wantCommercial}
            onClick={() => setWantCommercial((v) => !v)}
            label="Commercial Offer"
            desc="Pricing, VAT & terms"
          />
          <OutputCard
            active={false}
            disabled
            label="Single-line Diagram"
            desc="🔒 Locked"
          />
        </div>
      </div>

      {done && (
        <div className="card mb-4 border-green-300 bg-green-50 p-4 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-green-800">✓ Offer {done.offerNumber} generated</p>
              <p className="text-sm text-green-700">
                Downloading {done.items.join(" · ")} PDF{done.items.length > 1 ? "s" : ""} — check your Downloads folder.
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setDone(null)}>
                Create another
              </button>
              <button type="button" className="btn-ghost" onClick={() => navigate(`/offers/${done.id}`)}>
                View offer →
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="card mb-4 border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-fade-in">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.02fr_.98fr]">
        {/* LEFT: inputs */}
        <div className="space-y-5">
          <section className="card p-5 animate-fade-up" style={{ animationDelay: "0.04s" }}>
            <h2 className="sec-head">Project &amp; Customer</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Project name *">
                <TextInput value={projectName} onChange={setProjectName} placeholder="Feeder Upgrade" />
              </Field>
              <Field label="Customer *">
                <TextInput value={customer} onChange={setCustomer} placeholder="EEHC" />
              </Field>
            </div>
          </section>

          <section className="card p-5 animate-fade-up" style={{ animationDelay: "0.06s" }}>
            <h2 className="sec-head">Project team &amp; cover</h2>
            <p className="mb-3 text-xs text-muted">
              Shown on the offer cover. The sales / manager / support lists are <b>shared with the LV section</b> —
              add someone here and they appear there too.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Quotation No. (QTN)">
                <TextInput value={team.quotationNo} onChange={(v) => upTeam({ quotationNo: v })} placeholder="QTN-26-0001" />
              </Field>
              <Field label="Opportunity No. (OPTY)">
                <TextInput value={team.opportunityNo} onChange={(v) => upTeam({ opportunityNo: v })} placeholder="OPTY-0001" />
              </Field>
              <Field label="Sales person">
                <select className="input cursor-pointer" value={team.salesName} onChange={(e) => pickSales(e.target.value)}>
                  <option value="">— select —</option>
                  {staff.salesPeople.filter((p) => p.name !== SALES_MANAGER).map((p) => <option key={p.name}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Sales mobile / email" hint="Auto-filled from the sales person">
                <input className="input bg-surface" readOnly value={[team.salesMobile, team.salesEmail].filter(Boolean).join("  ·  ")} />
              </Field>
              <Field label="Sales manager" hint="Fixed">
                <input className="input bg-surface" readOnly value={manager.name} />
              </Field>
              <Field label="Manager mobile / email" hint="Fixed">
                <input className="input bg-surface" readOnly value={[manager.mobile, manager.email].filter(Boolean).join("  ·  ")} />
              </Field>
              <Field label="Sales support">
                <select className="input cursor-pointer" value={team.supportName} onChange={(e) => pickSupport(e.target.value)}>
                  <option value="">— select —</option>
                  {staff.supportEngineers.map((p) => <option key={p.name}>{p.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="text-xs font-semibold text-muted">+ Add sales person:</span>
              <input className="input h-9 w-32" placeholder="Name" value={newSales.name} onChange={(e) => setNewSales({ ...newSales, name: e.target.value })} />
              <input className="input h-9 w-32" placeholder="Mobile" value={newSales.mobile} onChange={(e) => setNewSales({ ...newSales, mobile: e.target.value })} />
              <input className="input h-9 w-44" placeholder="Email" value={newSales.email} onChange={(e) => setNewSales({ ...newSales, email: e.target.value })} />
              <button type="button" className="btn-ghost h-9" onClick={addSalesPerson}>Add</button>
            </div>
          </section>

          <section className="card p-5 animate-fade-up" style={{ animationDelay: "0.08s" }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="sec-head !mb-0 !pb-0 after:hidden">RMU Code</h2>
              <div className="text-right">
                <span key={panelCode} className="code-chip animate-pop">{panelCode}</span>
                <div className="mt-1 text-xs text-muted">{code}</div>
              </div>
            </div>

            <div className="space-y-4">
              <Field label="Product type">
                <Segmented
                  value={rmu.productType}
                  onChange={(v) => setR("productType", v)}
                  options={["PRAL", "PSEC"] as const}
                  renderLabel={(v) => (v === "PRAL" ? "PRAL · Air" : "PSEC · SF6")}
                />
              </Field>

              <Field
                label="LBS brand / type"
                hint={
                  rmu.productType === "PSEC"
                    ? "ABB · Murge available · Schneider locked (no data)"
                    : "ABB available · JGGY · GRL locked (no data)"
                }
              >
                <Segmented
                  value={(rmu.lbsBrand ?? "ABB") as LbsBrand}
                  onChange={(v) => setR("lbsBrand", v)}
                  options={BRANDS_BY_FAMILY[rmu.productType] as readonly LbsBrand[]}
                  disabledOptions={
                    BRANDS_BY_FAMILY[rmu.productType].filter(
                      (b) => !AVAILABLE_BRANDS_BY_FAMILY[rmu.productType].includes(b)
                    ) as readonly LbsBrand[]
                  }
                />
              </Field>

              <Field label="Client specification" hint="EECH available · KAHRABA locked (no technical offer)">
                <Segmented
                  value={rmu.clientSpec ?? "EECH"}
                  onChange={(v) => setR("clientSpec", v)}
                  options={CLIENT_SPECS}
                  disabledOptions={
                    CLIENT_SPECS.filter(
                      (s) => !AVAILABLE_CLIENT_SPECS.includes(s)
                    ) as readonly ("EECH" | "KAHRABA")[]
                  }
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Rated voltage">
                  <Segmented
                    value={String(rmu.voltageKv) as "12" | "24"}
                    onChange={(v) => setR("voltageKv", Number(v) as 12 | 24)}
                    options={["12", "24"] as const}
                    renderLabel={(v) => `${v} kV`}
                  />
                </Field>
                <Field label="Installation">
                  <Segmented
                    value={rmu.installation}
                    onChange={(v) => setR("installation", v)}
                    options={["INDOOR", "OUTDOOR"] as const}
                    renderLabel={(v) => (v === "INDOOR" ? "Indoor" : "Outdoor")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Ring feeders (R)" hint="NAL — R0 to R5">
                  <NumberInput value={rmu.nalCount} min={0} onChange={(v) => setR("nalCount", v)} />
                </Field>
                <Field label="Transformer feeders (T)" hint="NALF — T0 to T2">
                  <NumberInput value={rmu.nalfCount} min={0} onChange={(v) => setR("nalfCount", v)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Busbar current">
                  <NumberInput value={rmu.busbarCurrentA} suffix="A" onChange={(v) => setR("busbarCurrentA", v)} />
                </Field>
                <Field label="Fuse rating" hint="Blank = catalogue max ('up to')">
                  <NumberInput
                    value={rmu.fuseRatingA ?? NaN}
                    suffix="A"
                    placeholder="standard"
                    onChange={(v) => setR("fuseRatingA", Number.isNaN(v) ? null : v)}
                  />
                </Field>
              </div>

              <Field label="Smart" hint="Smart (with RTU) ⇒ spec ·9; Ready-to-be-smart ⇒ spec ·0">
                <Select value={rmu.rtuType} onChange={(v) => setR("rtuType", v)} options={RTU_TYPES} />
              </Field>
            </div>
          </section>

          {/* Metering — toggle reveals CT / VT options */}
          <section className="card p-5 animate-fade-up" style={{ animationDelay: "0.12s" }}>
            <Toggle
              checked={rmu.hasMetering}
              onChange={(v) => setR("hasMetering", v)}
              label="Include Metering cubicle (+M)"
            />
            {rmu.hasMetering && (
              <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg bg-brand-tint p-4 sm:grid-cols-2 animate-fade-up">
                <Field label="CT primary current" hint="Fills X/5 & Ip — blank keeps 'X'">
                  <NumberInput
                    value={rmu.meteringCtPrimaryA ?? NaN}
                    suffix="A"
                    placeholder="e.g. 200"
                    onChange={(v) => setR("meteringCtPrimaryA", Number.isNaN(v) ? null : v)}
                  />
                </Field>
                <Field label="CT class (CL)" hint="Metering CT accuracy class">
                  <Segmented
                    value={(rmu.ctClass ?? "0.5") as "0.5" | "0.5S" | "0.2"}
                    onChange={(v) => setR("ctClass", v)}
                    options={["0.5", "0.5S", "0.2"] as const}
                    renderLabel={(v) => v}
                  />
                </Field>
                <Field label="Voltage transformer">
                  <Segmented
                    value={String(rmu.vtCores ?? 1) as "1" | "2"}
                    onChange={(v) => {
                      const cores = Number(v);
                      setR("vtCores", cores);
                      // Single core has no fuse option; double core defaults to with-fuse.
                      setR("meteringWithFuse", cores === 2);
                    }}
                    options={["1", "2"] as const}
                    renderLabel={(v) => (v === "1" ? "Single core" : "Two core")}
                  />
                </Field>
                <Field label="VT burden (VA)" hint="Fixed (non-editable)">
                  <input className="input bg-surface" value="50-100" readOnly />
                </Field>
                <Field label="VT class (CL)" hint="Fixed (non-editable)">
                  <input className="input bg-surface" value="0.5" readOnly />
                </Field>
                {rmu.vtCores === 2 && (
                  <div className="sm:col-span-2">
                    <Field label="VT protection" hint="Double-core VT only — affects the panel code & price">
                      <Segmented
                        value={rmu.meteringWithFuse ? "with" : "without"}
                        onChange={(v) => setR("meteringWithFuse", v === "with")}
                        options={["without", "with"] as const}
                        renderLabel={(v) => (v === "without" ? "Without fuse" : "With fuse")}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </section>

          {wantCommercial && (
          <section className="card p-5 animate-fade-up" style={{ animationDelay: "0.16s" }}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="sec-head !mb-0 !pb-0 after:hidden">Commercial</h2>
              {basePrice != null ? (
                <span className="chip bg-brand-light text-brand-dark">
                  Panel list (min): {currency} {basePrice.toLocaleString()}
                </span>
              ) : (
                <span className="chip bg-amber-100 text-amber-700">No catalogue price</span>
              )}
            </div>
            {basePrice == null && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ⚠ <b>{panelCode}</b> isn’t in the price list, so it has no automatic price.
                Enter the <b>unit price</b> manually below.
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Currency">
                <Segmented value={currency} onChange={(v) => setCurrency(v)} options={["USD", "EGP"] as const} />
              </Field>
              {currency === "EGP" && (
                <Field label="USD → EGP rate" hint="Auto-fetched daily rate — editable">
                  <div className="flex gap-2">
                    <NumberInput value={usdRate || NaN} step={0.01} placeholder="rate" onChange={(v) => setUsdRate(Number.isNaN(v) ? 0 : v)} />
                    <button type="button" className="btn-ghost shrink-0 whitespace-nowrap" onClick={fetchRate} disabled={rateLoading}>
                      {rateLoading ? "…" : "↻ Fetch"}
                    </button>
                  </div>
                </Field>
              )}
              <Field
                label={basePrice == null ? "Unit price *" : "Unit price"}
                hint={basePrice != null ? "From price list — editable" : "Required — no catalogue price"}
              >
                <NumberInput
                  value={unitPrice || NaN}
                  step={0.01}
                  placeholder={basePrice != null ? String(basePrice) : "0"}
                  onChange={(v) => { setPriceTouched(true); setUnitPrice(Number.isNaN(v) ? 0 : v); }}
                />
              </Field>
              <Field label="Quantity">
                <NumberInput value={quantity} min={1} suffix="pcs" onChange={setQuantity} />
              </Field>
              <Field label="Discount (%)">
                <NumberInput value={discountPct} step={0.5} onChange={setDiscountPct} />
              </Field>
              <Field label="Validity (days)">
                <NumberInput value={validityDays} onChange={setValidityDays} />
              </Field>
              <Field label="Delivery (weeks)">
                <NumberInput value={deliveryWeeks} onChange={setDeliveryWeeks} />
              </Field>
              <Field label="Warranty (months)">
                <NumberInput value={warrantyMonths} onChange={setWarrantyMonths} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Payment terms">
                  <TextInput value={paymentTerms} onChange={setPaymentTerms} placeholder="50% advance, 50% before delivery" />
                </Field>
              </div>
            </div>
            {/* Live commercial totals */}
            <div className="mt-4 rounded-lg bg-brand-tint p-4 text-sm">
              <div className="flex justify-between text-muted">
                <span>Panel · {quantity} × {currency} {effUnit.toLocaleString()}</span>
                <span>{currency} {totals.panelSubtotal.toLocaleString()}</span>
              </div>
              {addOns.map((a) => (
                <div key={a.name} className="flex justify-between text-muted">
                  <span>{a.name} · {quantity} × {currency} {(a.price * rate).toLocaleString()}</span>
                  <span>{currency} {(a.price * rate * quantity).toLocaleString()}</span>
                </div>
              ))}
              {discountPct > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Discount ({discountPct}%)</span>
                  <span>− {currency} {totals.discount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-muted">
                <span>VAT (14%)</span>
                <span>{currency} {totals.vat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="mt-1 flex justify-between text-lg font-extrabold text-brand-dark">
                <span>Total (incl. VAT)</span>
                <span>{currency} {totals.incVat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </section>
          )}

          {wantSld && (
          <section className="card p-5 animate-fade-up" style={{ animationDelay: "0.18s" }}>
            <h2 className="sec-head">Single-line Diagram — Cover</h2>
            <p className="mb-3 text-xs text-muted">
              Item number on the drawings = panel code <b>{panelCode}</b>. Project, customer &amp; QTY come from above.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Sales Order">
                <TextInput value={salesNumber} onChange={setSalesNumber} placeholder="e.g. SO-2026-123" />
              </Field>
              <Field label="Work Order">
                <TextInput value={orderNumber} onChange={setOrderNumber} placeholder="e.g. WO-456" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes (cover)">
                  <textarea
                    className="input h-20"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes shown on the SLD cover page"
                  />
                </Field>
              </div>
            </div>
          </section>
          )}
        </div>

        {/* RIGHT: live preview */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="card max-h-[calc(100vh-7rem)] overflow-y-auto p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Live preview
            </div>
            {previewErr && (
              <p className="rounded bg-red-50 p-2 text-sm text-red-600">{previewErr}</p>
            )}
            {preview ? (
              <OfferView g={preview} />
            ) : (
              !previewErr && (
                <div className="space-y-3">
                  <div className="skeleton h-24" />
                  <div className="skeleton h-32" />
                  <div className="skeleton h-40" />
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => navigate("/")}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Generating…" : "Generate & Download →"}
        </button>
      </div>
    </form>
  );
}

function OutputCard({
  label,
  desc,
  active,
  locked,
  disabled,
  onClick,
}: {
  label: string;
  desc: string;
  active?: boolean;
  locked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled || locked ? undefined : onClick}
      disabled={disabled}
      className={`relative rounded-xl border p-3 text-left transition-all ${
        disabled
          ? "cursor-not-allowed border-line bg-surface opacity-60"
          : active
          ? "border-brand bg-brand-tint shadow-soft"
          : "border-line bg-white hover:border-brand/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-ink">{label}</span>
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
            active ? "border-brand bg-brand text-white" : "border-line text-transparent"
          }`}
        >
          ✓
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">{desc}</p>
      {locked && (
        <span className="absolute right-2 top-8 text-[9px] uppercase tracking-wide text-muted">
          default
        </span>
      )}
    </button>
  );
}
