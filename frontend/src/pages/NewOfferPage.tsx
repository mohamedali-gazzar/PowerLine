import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, QTN_STATUS_STYLE, type QtnStatus } from "../api";
import {
  Field,
  TextInput,
  NumberInput,
  Select,
  Segmented,
  Toggle,
} from "../components/fields";
import OfferView from "../components/OfferView";
import OfferCover from "../components/OfferCover";
import { useStaff, findPerson, SALES_MANAGER } from "../staff";
import {
  RTU_TYPES,
  BRANDS_BY_FAMILY,
  AVAILABLE_BRANDS_BY_FAMILY,
  CLIENT_SPECS,
  AVAILABLE_CLIENT_SPECS,
} from "../options";
import type { GeneratedOffer, Offer, OfferInput, RmuConfigInput, StoredRmu, LbsBrand } from "../types";

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

// Map a stored RMU (the DB relation, with its extra id/configCode) back to the
// editable config shape. Defaults fill anything an older row might be missing.
function storedToConfig(r: StoredRmu): RmuConfigInput {
  return {
    ...initialRmu,
    productType: r.productType,
    lbsBrand: r.lbsBrand ?? "ABB",
    clientSpec: r.clientSpec ?? "EECH",
    voltageKv: r.voltageKv,
    nalCount: r.nalCount,
    nalfCount: r.nalfCount,
    hasMetering: r.hasMetering,
    rtuType: r.rtuType,
    installation: r.installation,
    busbarCurrentA: r.busbarCurrentA,
    fuseRatingA: r.fuseRatingA ?? null,
    meteringCtPrimaryA: r.meteringCtPrimaryA ?? null,
    ctClass: r.ctClass ?? null,
    vtCores: r.vtCores ?? 1,
    vtBurdenVa: r.vtBurdenVa ?? null,
    vtClass: r.vtClass ?? null,
    meteringWithFuse: r.meteringWithFuse ?? false,
  };
}

// Parse Offer.rmusJson (a JSON string of the frozen multi-RMU lines) back into the
// editable rows. Returns null for a single-RMU offer (column unset/empty/corrupt),
// so the caller falls back to the single `rmu` relation.
function parseRmusJson(
  s: string | null | undefined
): { config: RmuConfigInput; unitPrice: number; quantity: number }[] | null {
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr) && arr.length) {
      return arr.map((l) => ({
        config: { ...initialRmu, ...(l.config ?? {}) } as RmuConfigInput,
        unitPrice: Number(l.unitPrice) || 0,
        quantity: Number(l.quantity) || 1,
      }));
    }
  } catch {
    /* corrupt snapshot → treat as single-RMU */
  }
  return null;
}

// Tabbed workflow, mirroring the LV section (Project → Panel → Technical → Commercial).
type Tab = "project" | "settings" | "panel" | "technical" | "commercial";
const TABS: { key: Tab; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "settings", label: "Settings" },
  { key: "panel", label: "RMU" },
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
  const { id: editId } = useParams(); // present on /offers/:id/edit → edit an existing draft
  const editing = !!editId;
  const [tab, setTab] = useState<Tab>("project");

  // Edit-mode: load + hydrate gate, the offer's live workflow status, and autosave state.
  const [hydrated, setHydrated] = useState(!editing); // create mode is "hydrated" immediately
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [offerNumber, setOfferNumber] = useState("");
  const [offerStatus, setOfferStatus] = useState<QtnStatus>("DRAFT");
  const [statusLabel, setStatusLabel] = useState("Draft");
  const [returnReason, setReturnReason] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [busy, setBusy] = useState(false); // send-for-approval in flight
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const lastSavedSig = useRef<string>("");

  const [projectName, setProjectName] = useState("");
  const [customer, setCustomer] = useState("");
  const [currency, setCurrency] = useState<"USD" | "EGP">("USD");
  const [usdRate, setUsdRate] = useState(0); // USD→EGP rate (used when currency = EGP)
  const [rateLoading, setRateLoading] = useState(false);
  const [discountPct, setDiscountPct] = useState(0);
  const [validityDays, setValidityDays] = useState(3);
  const [deliveryWeeks, setDeliveryWeeks] = useState(12);
  const [paymentTerms, setPaymentTerms] = useState("50% advance, 50% before delivery");
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  // An offer can hold more than one RMU. Each row is a full RMU: its config plus
  // its OWN unit price + quantity (the commercial offer lists one line per RMU and
  // sums them; discount / VAT / terms stay offer-level). `rmu` is the currently
  // selected config — the RMU-tab form, its live preview and its chip all act on it.
  type RmuRow = { config: RmuConfigInput; unitPrice: number; quantity: number; priceTouched: boolean };
  const newRow = (): RmuRow => ({ config: { ...initialRmu }, unitPrice: 0, quantity: 1, priceTouched: false });
  const [rows, setRows] = useState<RmuRow[]>([newRow()]);
  const [sel, setSel] = useState(0);
  const selIdx = Math.min(sel, rows.length - 1);
  const cur = rows[selIdx] ?? rows[0];
  const rmu = cur.config;
  const setR = <K extends keyof RmuConfigInput>(k: K, v: RmuConfigInput[K]) =>
    setRows((arr) => arr.map((r, i) => (i === selIdx ? { ...r, config: { ...r.config, [k]: v } } : r)));
  const setRowPrice = (i: number, patch: Partial<RmuRow>) =>
    setRows((arr) => arr.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRmu = () => { setRows((arr) => [...arr, newRow()]); setSel(rows.length); };
  const removeRmu = (i: number) => {
    if (rows.length <= 1) return; // always keep at least one RMU
    setRows((arr) => arr.filter((_, j) => j !== i));
    setSel((s) => Math.max(0, Math.min(s >= i ? s - 1 : s, rows.length - 2)));
  };
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

  // Auto-generate the QTN number when the form opens without one (i.e. it wasn't
  // seeded from the New-QTN dialog's ?qtn=…). Suggestion only — still editable, and
  // still required before generating.
  useEffect(() => {
    if (editing) return; // edit mode hydrates the QTN from the loaded offer
    if (team.quotationNo.trim()) return;
    let alive = true;
    api.nextRmuQtn()
      .then((r) => { if (alive && r?.suggestion) upTeam({ quotationNo: r.suggestion }); })
      .catch(() => { /* offline — leave it blank for the user to fill */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the brand to one we actually have data for (PSEC: ABB/Murge, PRAL: ABB)
  // — reset to ABB if the current brand isn't available for the family.
  useEffect(() => {
    if (rmu.productType === "LUCY") return; // Lucy has no LBS brand
    const available = AVAILABLE_BRANDS_BY_FAMILY[rmu.productType];
    if (rmu.lbsBrand && !available.includes(rmu.lbsBrand)) {
      setR("lbsBrand", "ABB");
    }
  }, [rmu.productType, rmu.lbsBrand]);

  // Client spec: only EECH has data — reset to EECH if KAHRABA somehow set.
  useEffect(() => {
    if (rmu.clientSpec && !AVAILABLE_CLIENT_SPECS.includes(rmu.clientSpec)) {
      setR("clientSpec", "EECH");
    }
  }, [rmu.clientSpec]);

  // PRAL has no smart option — force it off (standard) whenever PRAL is selected.
  useEffect(() => {
    if (rmu.productType === "PRAL" && rmu.rtuType !== "NONE") {
      setR("rtuType", "NONE");
    }
  }, [rmu.productType, rmu.rtuType]);

  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; offerNumber: string; items: string[] } | null>(null);
  // Reuse a created offer across per-tab downloads until an input changes.
  const [created, setCreated] = useState<{ id: string; offerNumber: string; sig: string } | null>(null);

  // Per-RMU technical previews, cached by config signature: identical configs fetch
  // once, and adding/removing/reordering RMUs never re-fetches the unchanged ones.
  const [previewCache, setPreviewCache] = useState<Record<string, GeneratedOffer>>({});
  const cfgSig = (c: RmuConfigInput) => JSON.stringify(c);
  const previewCacheRef = useRef(previewCache);
  previewCacheRef.current = previewCache;
  const previewOf = (c: RmuConfigInput): GeneratedOffer | null => previewCache[cfgSig(c)] ?? null;
  const preview = previewOf(rmu); // the selected RMU's preview (drives the RMU-tab chips)

  const code = useMemo(
    () =>
      `${rmu.productType}${rmu.voltageKv}(${rmu.nalCount}+${rmu.nalfCount}${
        rmu.hasMetering ? "+M" : ""
      })`,
    [rmu]
  );
  const panelCode = preview?.panelCode || preview?.configCode || "…";
  const rate = currency === "EGP" ? usdRate || 1 : 1;
  const vatPct = previewOf(rows[0].config)?.vatPct ?? 14; // one VAT rate for the whole offer

  // One commercial line per RMU: base (floor) price, effective unit price (the
  // typed price if any, else the base), add-ons and subtotals — selected currency.
  const lines = rows.map((r) => {
    const p = previewOf(r.config);
    const baseUsd = p?.listPricing?.basePrice ?? null;
    const base = baseUsd == null ? null : baseUsd * rate;
    const eff = r.priceTouched && r.unitPrice > 0 ? r.unitPrice : base ?? 0;
    const addOns = p?.listPricing?.addOns ?? [];
    const addUnit = addOns.reduce((s, a) => s + a.price, 0) * rate;
    const qty = r.quantity || 1;
    return { row: r, preview: p, base, eff, addOns, addUnit, qty, panelSub: eff * qty, addSub: addUnit * qty };
  });
  const subtotalAll = lines.reduce((s, l) => s + l.panelSub + l.addSub, 0);
  const discountAll = subtotalAll * (discountPct / 100);
  const exVatAll = subtotalAll - discountAll;
  const vatAll = exVatAll * (vatPct / 100);
  const totals = { subtotal: subtotalAll, discount: discountAll, exVat: exVatAll, vat: vatAll, incVat: exVatAll + vatAll };
  // An RMU with no catalogue price AND no manual price blocks the Commercial PDF.
  const priceMissing = lines.some((l) => l.base == null && !(l.row.priceTouched && l.row.unitPrice > 0));

  // Fetch previews for every DISTINCT config currently in the list (debounced).
  const sigsKey = rows.map((r) => cfgSig(r.config)).join("§");
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const uniq = Array.from(new Set(rows.map((r) => cfgSig(r.config))));
      const need = uniq.filter((s) => !previewCacheRef.current[s]);
      if (!need.length) return;
      try {
        const fetched = await Promise.all(
          need.map(async (s) => [s, await api.previewConfig(JSON.parse(s) as RmuConfigInput)] as const)
        );
        if (cancelled) return;
        setPreviewCache((c) => ({ ...c, ...Object.fromEntries(fetched) }));
        setPreviewErr(null);
      } catch (e) {
        if (!cancelled) setPreviewErr((e as Error).message);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigsKey]);

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

  function buildPayload(): OfferInput {
    // The full RMU list, each with its effective unit price (manual or base) and
    // quantity. rmus[0] also mirrors into the legacy single-RMU fields.
    const rmusOut = rows.map((r, i) => ({
      config: r.config,
      unitPrice: lines[i].eff,
      quantity: r.quantity || 1,
    }));
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
      unitPrice: rmusOut[0].unitPrice,
      quantity: rmusOut[0].quantity,
      discountPct,
      validityDays,
      deliveryWeeks,
      paymentTerms: paymentTerms || null,
      warrantyMonths,
      offerDate: date || null,
      rmu: rmusOut[0].config,
      rmus: rmusOut,
    };
  }

  // ── Edit mode: load → hydrate → autosave → approval ──────────────────────
  /** Fill every editable field from a loaded offer. */
  function hydrateFrom(o: Offer) {
    setProjectName(o.projectName || "");
    setCustomer(o.customer || "");
    setCurrency((o.currency as "USD" | "EGP") || "USD");
    setUsdRate(o.usdToEgpRate || 0);
    setDiscountPct(o.discountPct || 0);
    setValidityDays(o.validityDays || 3);
    setDeliveryWeeks(o.deliveryWeeks ?? 12);
    setPaymentTerms(o.paymentTerms || "");
    setWarrantyMonths(o.warrantyMonths ?? 12);
    setDate(o.offerDate || o.createdAt?.slice(0, 10) || date);
    setTeam({
      quotationNo: o.quotationNo || "",
      opportunityNo: o.opportunityNo || "",
      salesName: o.salesName || "", salesMobile: o.salesMobile || "", salesEmail: o.salesEmail || "",
      salesManagerName: o.salesManagerName || "", salesManagerMobile: o.salesManagerMobile || "", salesManagerEmail: o.salesManagerEmail || "",
      supportName: o.supportName || "", supportMobile: o.supportMobile || "", supportEmail: o.supportEmail || "",
    });
    const multi = parseRmusJson(o.rmusJson);
    if (multi && multi.length) {
      setRows(multi.map((l) => ({ config: l.config, unitPrice: l.unitPrice, quantity: l.quantity, priceTouched: l.unitPrice > 0 })));
    } else {
      setRows([{ config: storedToConfig(o.rmu), unitPrice: o.unitPrice || 0, quantity: o.quantity || 1, priceTouched: (o.unitPrice || 0) > 0 }]);
    }
    setSel(0);
  }

  /** Reflect an offer's workflow status; returns true if it's still editable here. */
  function applyStatus(o: Offer): boolean {
    const st = (o.status || "DRAFT") as QtnStatus;
    setOfferNumber(o.offerNumber || "");
    setOfferStatus(st);
    setStatusLabel(o.statusLabel ?? st);
    setReturnReason(o.returnReason ?? "");
    return st === "DRAFT" || st === "RETURNED";
  }

  // Load the offer once in edit mode. A locked offer (past Draft/Returned) is not
  // editable here → bounce to its read-only detail page. Hydrate BEFORE opening the
  // autosave gate so the first save can never overwrite the draft with blank state.
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    api.getOffer(editId)
      .then((o) => {
        if (!alive) return;
        if (!applyStatus(o)) { navigate(`/offers/${editId}`, { replace: true }); return; }
        hydrateFrom(o);
        lastSavedSig.current = ""; // the first real edit will persist
        setHydrated(true);
      })
      .catch((e) => { if (alive) setLoadErr((e as Error).message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Autosave (debounced) once hydrated and while the draft is still editable. The
  // signature guard skips no-op saves. buildPayload() always sends status:"DRAFT"
  // but updateOffer ignores status/ownership, so a RETURNED draft keeps its status.
  const editable = offerStatus === "DRAFT" || offerStatus === "RETURNED";
  const autosaveSig = editing && hydrated ? JSON.stringify(buildPayload()) : "";
  useEffect(() => {
    if (!editing || !hydrated || !editable || !editId) return;
    if (!autosaveSig || autosaveSig === lastSavedSig.current) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api.updateOffer(editId, JSON.parse(autosaveSig) as OfferInput);
        lastSavedSig.current = autosaveSig;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveSig, editing, hydrated, editable, editId]);

  /** Send the draft for approval (flush the latest edits first), then open the
   *  read-only detail page with the approval bar — exactly like an LV quotation. */
  async function sendForApproval() {
    if (!editId) return;
    if (!projectName.trim() || !customer.trim() || !team.quotationNo.trim()) {
      setError("Project name, customer and QTN number are required before sending for approval.");
      setTab("project");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = buildPayload();
      await api.updateOffer(editId, payload); // flush the latest state
      lastSavedSig.current = JSON.stringify(payload);
      await api.transitionOffer(editId, "WAITING_APPROVAL");
      navigate(`/offers/${editId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  /** Re-check the server: pick up any status change (e.g. an approver returned it)
   *  and re-price against the current list. A draft re-prices on every save, so this
   *  is mostly a status refresh — the LV "Check for updates" analogue. */
  async function checkForUpdates() {
    if (!editId) return;
    setChecking(true);
    setCheckMsg(null);
    try {
      const o = await api.getOffer(editId);
      if (!applyStatus(o)) { navigate(`/offers/${editId}`, { replace: true }); return; }
      setPreviewCache({}); // re-pull previews → current catalogue prices
      setCheckMsg("Up to date.");
    } catch (e) {
      setCheckMsg((e as Error).message);
    } finally {
      setChecking(false);
    }
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
    if (!projectName.trim() || !customer.trim() || !team.quotationNo.trim()) {
      setError("Project name, customer and QTN number are required — fill them on the Project tab first.");
      setTab("project");
      return;
    }
    if (outputs.includes("Commercial") && priceMissing) {
      const miss = lines.findIndex((l) => l.base == null && !(l.row.priceTouched && l.row.unitPrice > 0));
      setError(`RMU ${miss + 1} has no catalogue price — enter its unit price on the Settings tab.`);
      setTab("settings");
      return;
    }
    setSubmitting(true);
    setError(null);
    setDone(null);
    try {
      const payload = buildPayload();
      // Edit mode: the offer already exists — flush the latest edits and reuse it,
      // so the PDF always reflects the current draft. Create mode: make it once.
      let rec: { id: string; offerNumber: string };
      if (editing && editId) {
        await api.updateOffer(editId, payload);
        lastSavedSig.current = JSON.stringify(payload);
        rec = { id: editId, offerNumber: offerNumber || team.quotationNo.trim() };
      } else {
        rec = await ensureOffer(payload, JSON.stringify(payload));
      }
      const jobs: { url: string; name: string; label: string }[] = [];
      // Name exports like the LV section: "TO-<QTN> Rev 00" / "CO-<QTN> Rev 00".
      const nameQtn = team.quotationNo.trim() || rec.offerNumber;
      if (outputs.includes("Technical"))
        jobs.push({ url: api.pdfUrl(rec.id, true), name: `TO-${nameQtn} Rev 00.pdf`, label: "Technical" });
      if (outputs.includes("Commercial"))
        jobs.push({ url: api.commercialPdfUrl(rec.id, true), name: `CO-${nameQtn} Rev 00.pdf`, label: "Commercial" });
      jobs.forEach((j, i) => setTimeout(() => downloadFile(j.url, j.name), i * 700));
      // Show the QTN number in the confirmation (fall back to the internal PL-… only
      // if there's no QTN yet), never the internal offer number when a QTN exists.
      setDone({ id: rec.id, offerNumber: nameQtn, items: jobs.map((j) => j.label) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const generateAll = () => download(priceMissing ? ["Technical"] : ["Technical", "Commercial"]);

  // Edit mode: show a skeleton until the draft is loaded. The autosave gate already
  // prevents saving before hydration; this just avoids flashing an empty form.
  if (editing && !hydrated) {
    return loadErr ? (
      <div className="card border-red-200 bg-red-50 p-4 text-red-700">{loadErr}</div>
    ) : (
      <div className="space-y-3">
        <div className="skeleton h-20" />
        <div className="skeleton h-64" />
      </div>
    );
  }

  const saveText =
    saveState === "saving" ? "Saving…" :
    saveState === "saved" ? "✓ Saved" :
    saveState === "error" ? "⚠ Save failed" : "";

  return (
    <div>
      {editing ? (
        /* LV-style draft header: QTN · RMU Quotation · total · status  |  actions */
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl2 border border-line bg-white p-4 shadow-soft animate-fade-up">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-extrabold tracking-tight">{team.quotationNo || offerNumber || "RMU Offer"}</h1>
              <span className="text-sm font-semibold text-muted">RMU Quotation</span>
              <span className="rounded-md bg-brand-tint px-2 py-1 text-sm font-bold text-brand-dark">
                {totals.exVat.toLocaleString(undefined, { maximumFractionDigits: 0 })} {currency} excl. VAT
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${QTN_STATUS_STYLE[offerStatus] ?? "bg-slate-100 text-slate-600"}`}>
                {statusLabel}
              </span>
            </div>
            <p className="mt-1 truncate text-sm text-muted">
              {projectName || "—"} · {customer || "—"}
              {offerStatus === "RETURNED" && returnReason && (
                <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Returned: {returnReason}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saveText && (
              <span className={`text-xs font-semibold ${saveState === "error" ? "text-red-600" : "text-muted"}`}>{saveText}</span>
            )}
            <button type="button" className="btn-ghost" onClick={checkForUpdates} disabled={checking}>
              {checking ? "Checking…" : "↻ Check for updates"}
            </button>
            {editable && (
              <button type="button" className="btn-primary" disabled={busy} onClick={sendForApproval}>
                {busy ? "Sending…" : "Send for approval"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between animate-fade-up">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">New RMU Offer</h1>
            <p className="text-sm text-muted">Configure the RMU — the offer builds itself.</p>
          </div>
          <button type="button" className="btn-primary" disabled={submitting} onClick={generateAll}>
            {submitting ? "Generating…" : "Generate & Download →"}
          </button>
        </div>
      )}

      {/* Tab bar (sticky), like the LV section */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 bg-surface/85 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition-all ${
                tab === t.key
                  ? "bg-brand text-white shadow-soft"
                  : "bg-white text-muted ring-1 ring-line hover:ring-brand/40"
              }`}
            >
              {t.label}
            </button>
          ))}
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

      {checkMsg && (
        <div className="card mb-4 border-sky-200 bg-sky-50 p-3 text-sm text-sky-700 animate-fade-in">
          {checkMsg}
        </div>
      )}

      {/* ── Project tab — mirrors the LV Project tab (Revision removed) ──── */}
      {tab === "project" && (
        <div className="grid max-w-4xl gap-5 animate-fade-up">
          <div className="card p-5">
            <h2 className="sec-head">Project</h2>
            <p className="mb-3 text-xs text-muted">Used to generate the Technical &amp; Commercial offer cover pages.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><L>Project name <span className="text-red-500">*</span></L><input className={`input ${projectName.trim() ? "" : "ring-1 ring-red-400"}`} value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
              <div><L>Customer <span className="text-red-500">*</span></L><input className={`input ${customer.trim() ? "" : "ring-1 ring-red-400"}`} value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
              <div><L>QTN No. <span className="text-red-500">*</span></L><input className={`input ${team.quotationNo.trim() ? "" : "ring-1 ring-red-400"}`} value={team.quotationNo} onChange={(e) => upTeam({ quotationNo: e.target.value })} /></div>
              <div><L>OPTY No.</L><input className="input" value={team.opportunityNo} onChange={(e) => upTeam({ opportunityNo: e.target.value })} /></div>
              <div>
                <L>Sales support engineer</L>
                <select className="input cursor-pointer" value={team.supportName} onChange={(e) => pickSupport(e.target.value)}>
                  <option value="">— select —</option>
                  {staff.supportEngineers.map((p) => <option key={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div><L>Date</L><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="grid content-start gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><L>Sales manager</L><input className="input bg-surface" value={manager.name} readOnly /></div>
                  <div><L>Phone no.</L><input className="input bg-surface" value={manager.mobile} readOnly /></div>
                </div>
                <div><L>Manager email</L><input className="input bg-surface" value={manager.email} readOnly /></div>
              </div>
              <div className="grid content-start gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <L>Sales person</L>
                    <select className="input cursor-pointer" value={team.salesName} onChange={(e) => pickSales(e.target.value)}>
                      <option value="">— select —</option>
                      {staff.salesPeople.filter((p) => p.name !== SALES_MANAGER).map((p) => <option key={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div><L>Phone no.</L><input className="input bg-surface" value={team.salesMobile} readOnly /></div>
                </div>
                <div><L>Sales person email</L><input className="input bg-surface" value={team.salesEmail} readOnly /></div>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="sec-head">Staff lists</h2>
            <p className="mb-3 text-xs text-muted">Editable — <b>shared with the LV section</b>. Add or remove names.</p>
            <L>Sales people</L>
            <div className="mb-2 max-h-44 overflow-auto rounded-lg border border-line">
              {staff.salesPeople.map((p) => (
                <div key={p.name} className="flex items-center justify-between border-b border-line/60 px-3 py-1 text-sm last:border-0">
                  <span>{p.name} <span className="text-[11px] text-muted">{p.mobile} · {p.email}</span></span>
                  <button type="button" className="text-red-500 hover:underline" onClick={() => removeSalesPerson(p.name)}>remove</button>
                </div>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <input className="input h-9 w-36" placeholder="Name" value={newSales.name} onChange={(e) => setNewSales({ ...newSales, name: e.target.value })} />
              <input className="input h-9 w-36" placeholder="Mobile" value={newSales.mobile} onChange={(e) => setNewSales({ ...newSales, mobile: e.target.value })} />
              <input className="input h-9 w-48" placeholder="Email" value={newSales.email} onChange={(e) => setNewSales({ ...newSales, email: e.target.value })} />
              <button type="button" className="btn-ghost h-9" onClick={addSalesPerson}>+ Add</button>
            </div>
            <L>Sales support engineers</L>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {staff.supportEngineers.map((eng) => (
                <span key={eng.name} className="chip bg-surface text-ink">
                  {eng.name}
                  <button type="button" className="ml-1.5 text-red-500" onClick={() => removeEngineer(eng.name)}>×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input h-9 w-56" placeholder="New engineer name" value={newEng} onChange={(e) => setNewEng(e.target.value)} />
              <button type="button" className="btn-ghost h-9" onClick={addEngineer}>+ Add</button>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => setTab("settings")}>Next: Settings →</button>
          </div>
        </div>
      )}

      {/* ── Panel tab ───────────────────────────────────────────────────── */}
      {tab === "panel" && (
        <div className="grid items-start gap-5 lg:grid-cols-[220px_1fr]">
          {/* RMUs in this offer — add / select / remove (like the LV panels list) */}
          <div className="card p-3 lg:sticky lg:top-16">
            <div className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wide text-muted">RMUs in this offer</div>
            {rows.map((r, i) => {
              const active = i === sel;
              const c = r.config;
              const codeI = `${c.productType}${c.voltageKv}(${c.nalCount}+${c.nalfCount}${c.hasMetering ? "+M" : ""})`;
              return (
                <div key={i} className={`mb-1.5 flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${active ? "border-brand bg-brand-light" : "border-line bg-white hover:bg-brand-tint"}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${active ? "bg-brand text-white" : "bg-surface text-muted"}`}>{i + 1}</span>
                  <button type="button" onClick={() => setSel(i)} className="min-w-0 flex-1 text-left">
                    <div className={`truncate text-sm font-bold ${active ? "text-brand-dark" : "text-ink"}`}>RMU {i + 1}</div>
                    <div className="truncate text-[10px] text-muted">{codeI}</div>
                  </button>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRmu(i)} title="Remove this RMU" className="shrink-0 rounded p-0.5 text-sm text-red-500 transition-colors hover:bg-white">✕</button>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={addRmu} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-tint">
              <span className="text-sm leading-none">＋</span> Add RMU
            </button>
          </div>
          <div className="space-y-5">
          {/* Two columns: the panel card (half width) on the left, Metering and
              Smart/RTU on the right. `items-start` keeps every card at its natural
              height — the left card's rows are tightened so the two sides come out
              close without stretching a card into empty white space. */}
          <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* Tighter vertical rhythm than the other cards (py-3 + 5px row gaps) so
              this half-width column finishes level with Metering + Smart/RTU on the
              right instead of running past them. */}
          <section className="card px-5 py-3 animate-fade-up">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="sec-head !mb-0 !pb-0 after:hidden">RMU Code</h2>
              <div className="text-right">
                <span key={panelCode} className="code-chip animate-pop">{panelCode}</span>
                <div className="mt-1 text-xs text-muted">{code}</div>
              </div>
            </div>

            <div className="space-y-[5px]">
              <Field label="Product type">
                <Segmented
                  value={rmu.productType}
                  onChange={(v) => setR("productType", v)}
                  options={["PRAL", "PSEC", "LUCY"] as const}
                  renderLabel={(v) =>
                    v === "PRAL" ? "PRAL · Air" : v === "PSEC" ? "PSEC · SF6" : "LUCY · GIS"
                  }
                />
              </Field>

              {/* Lucy has no LBS brand or client specification — hidden for it. */}
              {!isLucy && (
                <>
                  <Field
                    label="LBS brand / type"
                    hint={
                      rmu.productType === "PSEC"
                        ? "ABB · Murge available · Schneider locked (no data)"
                        : "ABB available · Chint locked (no data)"
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
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Rated voltage">
                  <Segmented
                    value={String(rmu.voltageKv) as "12" | "24"}
                    onChange={(v) => setR("voltageKv", Number(v) as 12 | 24)}
                    options={["12", "24"] as const}
                    renderLabel={(v) => `${v} kV`}
                  />
                </Field>
                <Field label="Installation" hint="Outdoor adds an enclosure (priced in the commercial offer)">
                  <Segmented
                    value={rmu.installation}
                    onChange={(v) => setR("installation", v)}
                    options={["INDOOR", "OUTDOOR"] as const}
                    renderLabel={(v) => (v === "INDOOR" ? "Indoor" : "Outdoor")}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={isLucy ? "Feeders (R)" : "Ring feeders (R)"}
                  hint={isLucy ? "Load-break switches (L)" : "NAL — R0 to R5"}
                >
                  <NumberInput value={rmu.nalCount} min={0} onChange={(v) => setR("nalCount", v)} />
                </Field>
                <Field
                  label={isLucy ? "Transformer feeders (T)" : "Transformer feeders (T)"}
                  hint={isLucy ? "Circuit breakers (V)" : "NALF — T0 to T2"}
                >
                  <NumberInput value={rmu.nalfCount} min={0} onChange={(v) => setR("nalfCount", v)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Busbar current">
                  <NumberInput value={rmu.busbarCurrentA} suffix="A" onChange={(v) => setR("busbarCurrentA", v)} />
                </Field>
                {/* Lucy has no fuse (transformer feeders are circuit breakers). */}
                {!isLucy && (
                  <Field label="Fuse rating" hint="Blank = catalogue max ('up to')">
                    <NumberInput
                      value={rmu.fuseRatingA ?? NaN}
                      suffix="A"
                      placeholder="standard"
                      onChange={(v) => setR("fuseRatingA", Number.isNaN(v) ? null : v)}
                    />
                  </Field>
                )}
              </div>

            </div>
          </section>

          <div className="flex flex-col gap-5">
          {/* Metering — a toggle for every type; CT/VT options for PRAL/PSEC only.
              Cards keep their natural height and pack from the top, so Smart/RTU
              sits directly under Metering instead of a card being stretched into
              a tall empty white box to force the columns to match. */}
          <section className="card p-5 animate-fade-up">
            <Toggle
              checked={rmu.hasMetering}
              onChange={(v) => setR("hasMetering", v)}
              label="Include Metering cubicle (+M)"
            />
            {rmu.hasMetering && isLucy && (
              <p className="mt-2 text-xs text-muted">
                Lucy metering is a fixed Air-Insulated Metering Unit (100/5A CT, 50 VA VT) — no extra options.
              </p>
            )}
            {rmu.hasMetering && !isLucy && (
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
                <Field label="Voltage transformer" hint="Two core → with fuse · single core → without fuse">
                  <Segmented
                    value={String(rmu.vtCores ?? 1) as "1" | "2"}
                    onChange={(v) => {
                      const cores = Number(v);
                      setR("vtCores", cores);
                      // Fuse follows the core count: two core = with fuse, single = without.
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
              </div>
            )}
          </section>

          {/* Smart / RTU — optional, PSEC & Lucy only (PRAL has no smart). Works
              like the metering toggle: turn it on, then pick the level. */}
          {rmu.productType !== "PRAL" && (
            <section className="card p-5 animate-fade-up">
              <Toggle
                checked={rmu.rtuType !== "NONE"}
                onChange={(on) => setR("rtuType", on ? "READY1" : "NONE")}
                label="Smart / RTU (optional)"
              />
              {rmu.rtuType !== "NONE" && (
                <div className="mt-4 sm:max-w-md animate-fade-up">
                  <Field label="Smart level" hint="Priced as a separate line in the commercial offer">
                    <Select value={rmu.rtuType} onChange={(v) => setR("rtuType", v)} options={RTU_TYPES} />
                  </Field>
                </div>
              )}
            </section>
          )}
          </div>
          </div>

          <div className="flex justify-between">
            <button type="button" className="btn-ghost" onClick={() => setTab("settings")}>← Settings</button>
            <button type="button" className="btn-primary" onClick={() => setTab("technical")}>
              Next: Technical Offer →
            </button>
          </div>
        </div>
        </div>
      )}

      {/* ── Technical Offer tab ─────────────────────────────────────────── */}
      {tab === "technical" && (
        <div className="space-y-4 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Live technical offer
            </div>
            <button type="button" className="btn-primary" disabled={submitting} onClick={() => download(["Technical"])}>
              {submitting ? "Generating…" : "⬇ Download Technical PDF"}
            </button>
          </div>
          {previewErr && (
            <p className="rounded bg-red-50 p-2 text-sm text-red-600">{previewErr}</p>
          )}
          {/* Branded cover — the same title page the PDF prints and the LV section shows. */}
          <OfferCover
            kind="Technical"
            date={date}
            qtnRef={team.quotationNo}
            optyNo={team.opportunityNo}
            projectName={projectName}
            customer={customer}
            contacts={[
              { role: "Sales", name: team.salesName, phone: team.salesMobile, email: team.salesEmail },
              { role: "Manager", name: manager.name, phone: manager.mobile, email: manager.email },
              { role: "Support", name: team.supportName, phone: team.supportMobile, email: team.supportEmail },
            ]}
          />
          {/* One technical section per RMU, each an A4 page like the printed PDF. */}
          <div className="space-y-5">
            {rows.map((r, i) => {
              const g = previewOf(r.config);
              const c = r.config;
              const codeI = `${c.productType}${c.voltageKv}(${c.nalCount}+${c.nalfCount}${c.hasMetering ? "+M" : ""})`;
              return (
                <div key={i} className="a4-sheet px-12 py-10">
                  {rows.length > 1 && (
                    <div className="mb-4 flex items-center gap-2 border-b border-line pb-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                      <span className="text-sm font-extrabold text-ink">RMU {i + 1} of {rows.length}</span>
                      <span className="code-chip ml-auto">{g?.panelCode || codeI}</span>
                    </div>
                  )}
                  {g ? (
                    <OfferView g={g} />
                  ) : (
                    <div className="space-y-3">
                      <div className="skeleton h-24" />
                      <div className="skeleton h-32" />
                      <div className="skeleton h-40" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between">
            <button type="button" className="btn-ghost" onClick={() => setTab("panel")}>← RMU</button>
            <button type="button" className="btn-primary" onClick={() => setTab("commercial")}>
              Next: Commercial Offer →
            </button>
          </div>
        </div>
      )}

      {/* ── Settings tab — offer-level commercial settings + per-RMU pricing ── */}
      {tab === "settings" && (
        <div className="space-y-4 animate-fade-up">
          {/* Offer-level commercial settings — shared by every RMU on the offer. */}
          <section className="card p-5">
            <h2 className="sec-head">Commercial settings</h2>
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
              <div className="sm:col-span-3">
                <Field label="Payment terms">
                  <TextInput value={paymentTerms} onChange={setPaymentTerms} placeholder="50% advance, 50% before delivery" />
                </Field>
              </div>
            </div>
          </section>

          {/* Price per RMU — one priced line per RMU, exactly what the Commercial offer prints. */}
          <section className="card p-5">
            <h2 className="sec-head">Price per RMU</h2>
            <div className="space-y-3">
              {rows.map((r, i) => {
                const l = lines[i];
                const c = r.config;
                const codeI = l.preview?.panelCode || `${c.productType}${c.voltageKv}(${c.nalCount}+${c.nalfCount}${c.hasMetering ? "+M" : ""})`;
                const lineTotal = l.panelSub + l.addSub;
                return (
                  <div key={i} className="rounded-lg border border-line p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
                      <span className="text-sm font-bold text-ink">RMU {i + 1}</span>
                      <span className="code-chip ml-1">{codeI}</span>
                      {l.base != null ? (
                        <span className="ml-auto chip bg-brand-light text-brand-dark">List (min): {currency} {l.base.toLocaleString()}</span>
                      ) : (
                        <span className="ml-auto chip bg-amber-100 text-amber-700">No catalogue price — enter unit price</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Field
                        label={l.base == null ? "Unit price *" : "Unit price"}
                        hint={l.base != null ? "From price list — editable" : "Required — no catalogue price"}
                      >
                        <NumberInput
                          value={r.priceTouched ? (r.unitPrice || NaN) : (l.base ?? NaN)}
                          step={0.01}
                          placeholder={l.base != null ? String(l.base) : "0"}
                          onChange={(v) => setRowPrice(i, { priceTouched: true, unitPrice: Number.isNaN(v) ? 0 : v })}
                        />
                      </Field>
                      <Field label="Quantity">
                        <NumberInput value={r.quantity} min={1} suffix="pcs" onChange={(v) => setRowPrice(i, { quantity: Number.isNaN(v) ? 1 : v })} />
                      </Field>
                      <Field label="Line total">
                        <div className="flex h-[38px] items-center px-1 text-sm font-extrabold text-ink">
                          {currency} {lineTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                      </Field>
                    </div>
                    {l.addOns.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted">+ {l.addOns.map((a) => a.name).join(", ")} (each priced into the line above)</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Combined totals across all RMUs */}
            <div className="mt-4 rounded-lg bg-brand-tint p-4 text-sm">
              <div className="flex justify-between text-muted">
                <span>Subtotal · {rows.length} RMU{rows.length > 1 ? "s" : ""}</span>
                <span>{currency} {totals.subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Discount ({discountPct}%)</span>
                  <span>− {currency} {totals.discount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              )}
              <div className="flex justify-between text-muted">
                <span>VAT ({vatPct}%)</span>
                <span>{currency} {totals.vat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="mt-1 flex justify-between text-lg font-extrabold text-brand-dark">
                <span>Total (incl. VAT)</span>
                <span>{currency} {totals.incVat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </section>

          <div className="flex items-center justify-between">
            <button type="button" className="btn-ghost" onClick={() => setTab("project")}>← Project</button>
            <button type="button" className="btn-primary" onClick={() => setTab("panel")}>Next: RMU →</button>
          </div>
        </div>
      )}

      {/* ── Commercial Offer tab — the priced offer document, like the printed PDF ── */}
      {tab === "commercial" && (
        <div className="space-y-4 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Live commercial offer
            </div>
            <button type="button" className="btn-primary" disabled={submitting} onClick={() => download(["Commercial"])}>
              {submitting ? "Generating…" : "⬇ Download Commercial PDF"}
            </button>
          </div>
          {/* Branded cover — the same title page the Commercial PDF prints. */}
          <OfferCover
            kind="Commercial"
            date={date}
            qtnRef={team.quotationNo}
            optyNo={team.opportunityNo}
            projectName={projectName}
            customer={customer}
            contacts={[
              { role: "Sales", name: team.salesName, phone: team.salesMobile, email: team.salesEmail },
              { role: "Manager", name: manager.name, phone: manager.mobile, email: manager.email },
              { role: "Support", name: team.supportName, phone: team.supportMobile, email: team.supportEmail },
            ]}
          />
          {/* Main Offer — the priced line-item document (A4), exactly what the PDF prints. */}
          <div className="a4-sheet px-12 py-10 text-ink">
            <h2 className="mb-5 text-3xl font-extrabold" style={{ color: "#F16722" }}>Main Offer</h2>
            <div className="grid grid-cols-[2rem_1fr_3rem_6.5rem_6.5rem] gap-x-3 border-b-2 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted" style={{ borderColor: "#F16722" }}>
              <span>Item</span>
              <span>Description</span>
              <span className="text-center">Qty</span>
              <span className="text-right">Unit ({currency})</span>
              <span className="text-right">Total ({currency})</span>
            </div>
            {(() => {
              const items: { desc: string; qty: number; unit: number; total: number }[] = [];
              lines.forEach((l) => {
                const desc = l.preview?.commercialDescription || `${l.preview?.panelCode || "RMU"} — Ring Main Unit`;
                items.push({ desc, qty: l.qty, unit: l.eff, total: l.panelSub });
                l.addOns.forEach((a) => items.push({ desc: a.name, qty: l.qty, unit: a.price * rate, total: a.price * rate * l.qty }));
              });
              return items.map((it, i) => (
                <div key={i} className="grid grid-cols-[2rem_1fr_3rem_6.5rem_6.5rem] gap-x-3 border-b border-line py-3 text-sm">
                  <span className="text-muted">{i + 1}</span>
                  <span className="font-bold">{it.desc}</span>
                  <span className="text-center">{it.qty}</span>
                  <span className="text-right">{it.unit > 0 ? it.unit.toLocaleString(undefined, { maximumFractionDigits: 0 }) : <span className="font-bold text-amber-600">POA</span>}</span>
                  <span className="text-right font-bold">{it.unit > 0 ? it.total.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "POA"}</span>
                </div>
              ));
            })()}
            <div className="mt-6 flex justify-end">
              <div className="w-72 text-sm">
                <div className="flex justify-between py-1 text-muted">
                  <span>Subtotal (excl. VAT)</span>
                  <span>{currency} {totals.exVat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                {discountPct > 0 && (
                  <div className="flex justify-between py-1 text-muted">
                    <span>Discount ({discountPct}%)</span>
                    <span>− {currency} {totals.discount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 text-muted">
                  <span>VAT ({vatPct}%)</span>
                  <span>{currency} {totals.vat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="mt-1 flex justify-between border-t-2 pt-2 text-lg font-extrabold" style={{ borderColor: "#F16722" }}>
                  <span>Total ({currency})</span>
                  <span style={{ color: "#F16722" }}>{currency} {totals.incVat.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>

            {/* Terms — mirrors the PDF's Terms block. */}
            <h3 className="mb-3 mt-8 text-xl font-extrabold" style={{ color: "#F16722" }}>Terms</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex gap-2"><span className="w-20 font-bold text-muted">Validity:</span><span>{validityDays} days</span></div>
              <div className="flex gap-2"><span className="w-20 font-bold text-muted">Delivery:</span><span>{deliveryWeeks ? `${deliveryWeeks} weeks` : "To be confirmed"}</span></div>
              <div className="flex gap-2"><span className="w-20 font-bold text-muted">Payment:</span><span>{paymentTerms || "To be agreed"}</span></div>
              <div className="flex gap-2"><span className="w-20 font-bold text-muted">Warranty:</span><span>{warrantyMonths ? `${warrantyMonths} months` : "Standard"}</span></div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button type="button" className="btn-ghost" onClick={() => setTab("technical")}>← Technical Offer</button>
            <button type="button" className="btn-primary" disabled={submitting} onClick={() => download(["Commercial"])}>
              {submitting ? "Generating…" : "⬇ Download Commercial PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Small field label, matching the LV section's Project tab.
function L({ children }: { children: ReactNode }) {
  return <label className="label">{children}</label>;
}
