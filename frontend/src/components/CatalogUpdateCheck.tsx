import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogs } from "./ConfirmModal";
import { getToken, api, type CatalogChanges, type CatalogChangeItem } from "../api";
import { checkCatalogUpdates, catalogVersion } from "../lv/catalogSource";

// Brand orange — the "Added / Removed / Restored" label in the changelog.
const TRED = "#F16722";

/**
 * "Check for updates" — the price list is edited centrally and published, so an
 * offer can be started on a catalogue that has since moved. This re-reads the
 * published catalogue and says what changed: prices, brands, descriptions, new
 * items. Available to every role — it only swaps what this browser quotes from
 * and never writes to the price list, unlike the price-admin catalogue tools.
 */
/** Audit field name → how it reads in the changelog. */
const CHANGE_FIELD_LABEL: Record<string, string> = {
  price: "price", brand: "brand", description: "description", type: "type",
  family: "family", rating: "rating", poles: "poles", stock: "stock",
  "weight/panel/pole": "copper weight", "weight/cell/pole": "copper weight",
  __created: "added", __retired: "removed", __restored: "restored",
};

// ── Changelog formatting ─────────────────────────────────────────────────────
// Audit values are stored as text ("0 EUR / 3248 EGP"). Read the money back out
// so a price can be shown in the ONE currency it is actually priced in, rounded,
// and with the percentage move — "3,248 EGP → 978 EGP (−70%)".
const parseMoney = (v: string | null): { eur: number; egp: number } | null => {
  const m = String(v ?? "").match(/(-?[\d.]+)\s*EUR\s*\/\s*(-?[\d.]+)\s*EGP/i);
  if (!m) return null;
  return { eur: parseFloat(m[1]) || 0, egp: parseFloat(m[2]) || 0 };
};
/** EGP whole, EUR to 2dp — rounding a €2.29 list price to €2 would be worse than
 *  the float tail it is meant to hide. */
const money1 = (m: { eur: number; egp: number } | null): string => {
  if (!m) return "—";
  if (m.eur > 0) return `${Number(m.eur.toFixed(2)).toLocaleString("en-US")} EUR`;
  return `${Math.round(m.egp).toLocaleString("en-US")} EGP`;
};
const moneyValue = (m: { eur: number; egp: number } | null): number => (m ? (m.eur > 0 ? m.eur : m.egp) : 0);
const pctMove = (from: number, to: number): string =>
  from > 0 ? `${to >= from ? "+" : "−"}${Math.abs(((to - from) / from) * 100).toFixed(0)}%` : "";
/** The ABB discount reaches an item only when it is ABB-branded AND priced in EUR. */
const discountable = (brand: string | undefined, eur: number | undefined) =>
  (brand ?? "").trim() === "ABB" && (eur ?? 0) > 0;
const numOrText = (v: string | null) => {
  const n = Number(v);
  if (v != null && v !== "" && Number.isFinite(n)) return Number(n.toFixed(3)).toLocaleString("en-US");
  return v && v.trim() ? v : "—";
};

export default function CatalogUpdateCheck({ onApply }: { onApply?: () => { changed: number; removed: number } }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [warn, setWarn] = useState(false);
  const [changes, setChanges] = useState<CatalogChanges | null>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setBusy(true);
    setMsg("");
    setChanges(null);
    setOpen(false);
    const before = catalogVersion();
    const u = await checkCatalogUpdates(getToken());
    if (!u.ok) {
      setBusy(false);
      setWarn(true);
      setMsg("Couldn’t reach the price list — still quoting on the catalogue already loaded.");
      return;
    }
    setWarn(false);
    // Ask what actually changed. Behind → everything since; already current → the
    // most recent upload, so "what came in last time?" is always answerable.
    let c: CatalogChanges | null = null;
    try {
      c = await api.catalog.lvChanges(before || undefined);
    } catch {
      /* changelog is a nicety — the refresh above already did the important part */
    }
    setBusy(false);
    setChanges(c);
    const headline = u.changed ? `Updated to version ${u.version}` : `Up to date — version ${u.version}`;
    if (!c || !c.total) {
      setMsg(`${headline}. No item changes recorded.`);
      return;
    }
    const parts = Object.entries(c.counts)
      .sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `${n} ${CHANGE_FIELD_LABEL[f] ?? f}${n === 1 ? "" : "s"}`);
    setMsg(`${headline} · ${parts.join(" · ")}`);
  };

  return (
    <div className="flex flex-col items-end gap-1 no-print">
      <button onClick={run} disabled={busy}
        title="Re-read the published price list and show what changed in the latest upload"
        className="btn-ghost disabled:opacity-60">
        {busy ? "Checking…" : "⟳ Check for updates"}
      </button>
      {msg && (
        <span className={`max-w-[26rem] text-right text-[11px] leading-snug ${warn ? "font-semibold text-red-700" : "text-muted"}`}>
          {msg}
          {!!changes?.total && (
            <>
              {" "}
              <button onClick={() => setOpen(true)} className="font-semibold text-brand-dark underline underline-offset-2">
                see {changes.total} change{changes.total === 1 ? "" : "s"}
              </button>
            </>
          )}
        </span>
      )}
      {open && changes && <ChangeLogDialog changes={changes} onApply={onApply} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** The changelog, as its own dismissible panel rather than a dropdown under the button. */
function ChangeLogDialog({ changes, onApply, onClose }: { changes: CatalogChanges; onApply?: () => { changed: number; removed: number }; onClose: () => void }) {
  const { confirm, dialogs } = useDialogs();
  const [applied, setApplied] = useState<{ changed: number; removed: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doApply = async () => {
    if (!onApply) return;
    if (
      !(await confirm({
        title: "Update to the current price list",
        message:
          "Component and cell prices are brought up to today's list, and any item discontinued from the list is removed.\n" +
          "Your quantities, per-line adjustments and notes are kept, and you can Undo this afterwards.",
        confirmLabel: "Update prices",
      }))
    )
      return;
    setApplied(onApply());
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      {dialogs}
      <div role="dialog" aria-modal="true"
        className="relative flex max-h-[86vh] w-full max-w-3xl flex-col rounded-xl2 border border-line bg-white p-5 shadow-lift animate-pop">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="sec-head">What changed in the price list</h2>
            <p className="-mt-1 text-xs text-muted">
              Version {changes.version}
              {changes.from < changes.version - 1 ? ` (since version ${changes.from})` : ""}
              {changes.publishedBy ? ` · ${changes.publishedBy}` : ""}
              {changes.note ? ` · ${changes.note}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onApply && applied === null && (
              <button onClick={doApply} className="btn-primary"
                title="Update this quotation's component & cell prices to the current list">
                Apply changes
              </button>
            )}
            {applied !== null && (
              <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-300">
                ✓ {applied.changed === 0 && applied.removed === 0
                  ? "Already up to date"
                  : [
                      applied.changed > 0 ? `${applied.changed} price${applied.changed === 1 ? "" : "s"} updated` : "",
                      applied.removed > 0 ? `${applied.removed} discontinued removed` : "",
                    ].filter(Boolean).join(" · ")}
              </span>
            )}
            <button onClick={onClose} className="btn-ghost" title="Close (Esc)">✕ Close</button>
          </div>
        </div>

        <div className="mt-3 flex-1 overflow-auto rounded-lg border border-line">
          <ul className="divide-y divide-line">
            {changes.items.map((it, i) => <ChangeRow key={i} it={it} />)}
          </ul>
        </div>
        {changes.total > changes.items.length && (
          <p className="mt-1 text-[11px] text-muted/80">
            Showing the {changes.items.length} most recent of {changes.total} changes.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One changelog entry, described according to what actually changed. */
function ChangeRow({ it }: { it: CatalogChangeItem }) {
  const d = it.detail ?? undefined;
  const name = it.label || d?.d || d?.name || d?.ref || "item";
  const Head = (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-[13px] font-semibold text-ink">{name}</span>
      {d?.ref && <span className="font-mono text-[10px] text-muted">{d.ref}</span>}
    </div>
  );

  // Added / removed / restored → describe the whole item, not one field.
  if (it.field === "__created" || it.field === "__retired" || it.field === "__restored") {
    const verb = it.field === "__created" ? "Added" : it.field === "__retired" ? "Removed" : "Restored";
    const spec: [string, string][] = d
      ? ([
          ["Reference", d.ref || "—"],
          ["Description", d.d || d.name || "—"],
          ["Type", d.t || "—"], ["Family", d.f || d.fam || "—"], ["Rating", d.r || "—"],
          ["Brand", d.brand || "—"], ["Poles", d.poles != null ? String(d.poles) : "—"],
          ["Price", money1({ eur: d.eur ?? 0, egp: d.egp ?? 0 })],
          ["ABB discount", discountable(d.brand, d.eur) ? "Yes" : "No"],
          ["Weight/Panel/Pole", d.cuP ? String(d.cuP) : "—"],
          ["Weight/Cell/Pole", d.cuC ? String(d.cuC) : "—"],
          ["Stock", d.stock || "—"],
          ["IP", d.ip || "—"], ["Mounting", d.mount || "—"], ["RAL", d.ral || "—"],
        ].filter(([, v]) => v !== "—" || true) as [string, string][])
      : [];
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: TRED }}>{verb}</div>
        {!!spec.length && (
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 sm:grid-cols-3">
            {spec.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-muted">{k}</span>
                <span className="text-right font-medium text-ink">{v}</span>
              </div>
            ))}
          </div>
        )}
      </li>
    );
  }

  // Price → one currency, rounded, with the percentage move.
  if (it.field === "price") {
    const a = parseMoney(it.oldValue);
    const b = parseMoney(it.newValue);
    const pct = pctMove(moneyValue(a), moneyValue(b));
    const up = moneyValue(b) >= moneyValue(a);
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span className="text-muted">Price</span>
          <span className="text-muted line-through">{money1(a)}</span>
          <span className="font-bold text-ink">→ {money1(b)}</span>
          {pct && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${up ? "bg-amber-100 text-amber-800" : "bg-surface text-muted"}`}>
              {pct}
            </span>
          )}
        </div>
      </li>
    );
  }

  // Brand → also say whether it turned the ABB discount on or off.
  if (it.field === "brand") {
    const was = discountable(it.oldValue ?? "", d?.eur);
    const now = discountable(it.newValue ?? "", d?.eur);
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
          <span className="text-muted">Brand</span>
          <span className="text-muted line-through">{it.oldValue || "—"}</span>
          <span className="font-bold text-ink">→ {it.newValue || "—"}</span>
        </div>
        {was !== now && (
          <div className="mt-0.5 text-[11px]">
            <span className="text-muted">ABB discount</span>{" "}
            <span className="text-muted line-through">{was ? "Yes" : "No"}</span>{" "}
            <span className="font-bold text-ink">→ {now ? "Yes" : "No"}</span>
          </div>
        )}
      </li>
    );
  }

  // Description → the full text, before and after.
  if (it.field === "description") {
    return (
      <li className="px-3 py-2">
        {Head}
        <div className="mt-0.5 text-[12px]">
          <div className="text-muted line-through">{it.oldValue || "—"}</div>
          <div className="font-bold text-ink">→ {it.newValue || "—"}</div>
        </div>
      </li>
    );
  }

  // Anything else → the field, before and after.
  return (
    <li className="px-3 py-2">
      {Head}
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px]">
        <span className="text-muted">{CHANGE_FIELD_LABEL[it.field] ?? it.field}</span>
        <span className="text-muted line-through">{numOrText(it.oldValue)}</span>
        <span className="font-bold text-ink">→ {numOrText(it.newValue)}</span>
      </div>
    </li>
  );
}
