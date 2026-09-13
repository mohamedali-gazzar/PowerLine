import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getToken, api, type CatalogChanges, type CatalogChangeItem } from "../api";
import { checkCatalogUpdates, catalogVersion } from "../lv/catalogSource";

/**
 * "What changed in this update" — the price list / settings / catalogue are edited centrally and
 * published, so a quotation can be started on a catalogue that has since moved. This re-reads the
 * published catalogue and shows what changed across the Prices / General settings / Components tabs,
 * with per-row read/unread so the
 * modal is a "seen it once" list. It only swaps what THIS browser quotes from and never writes to
 * the price list; "Apply changes" re-prices the open quotation to the current list.
 */

// ── Money formatting ─────────────────────────────────────────────────────────
// Audit prices are stored as text ("0 EUR / 3248 EGP"); read the money back out so a price shows
// in the one currency it is actually priced in, rounded, with the percentage move.
const parseMoney = (v: string | null): { eur: number; egp: number } | null => {
  const m = String(v ?? "").match(/(-?[\d.]+)\s*EUR\s*\/\s*(-?[\d.]+)\s*EGP/i);
  if (!m) return null;
  return { eur: parseFloat(m[1]) || 0, egp: parseFloat(m[2]) || 0 };
};
const money1 = (m: { eur: number; egp: number } | null): string => {
  if (!m) return "—";
  if (m.eur > 0) return `${Number(m.eur.toFixed(2)).toLocaleString("en-US")} EUR`;
  return `${Math.round(m.egp).toLocaleString("en-US")} EGP`;
};
const moneyValue = (m: { eur: number; egp: number } | null): number => (m ? (m.eur > 0 ? m.eur : m.egp) : 0);

// ── Read/unread store (per browser) ──────────────────────────────────────────
// Keyed so a fresh publish (new version) shows again while already-read rows stay dismissed.
const READ_STORE = "lvCatalogReadChanges";
const loadReadChanges = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(READ_STORE) || "[]") as string[]); } catch { return new Set(); }
};
const saveReadChanges = (s: Set<string>) => {
  try { localStorage.setItem(READ_STORE, JSON.stringify([...s].slice(-2000))); } catch { /* ignore */ }
};
const changeKey = (version: number, it: CatalogChangeItem): string =>
  `${version}|${it.field}|${it.label || it.detail?.ref || it.detail?.d || ""}|${it.oldValue ?? ""}|${it.newValue ?? ""}`;

export default function CatalogUpdateCheck({ onApply, autoOpen = false }: { onApply?: () => { changed: number; removed: number }; autoOpen?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<CatalogChanges | null>(null);
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState<Set<string>>(() => loadReadChanges());
  const autoOpenedRef = useRef(false);

  // On mount, load the changelog so the red notification count appears without a click. When
  // `autoOpen` is set (an editable quotation), first REFRESH from the server — so changes
  // published while this quotation sat open, with no reload, are seen too.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (autoOpen) {
        const before = catalogVersion();
        let ok = false;
        try { ok = (await checkCatalogUpdates(getToken())).ok; } catch { /* offline → use what we have */ }
        if (!alive) return;
        try { const c = await api.catalog.lvChanges((ok ? before : catalogVersion()) || undefined); if (alive) setChanges(c); } catch { /* keep */ }
      } else {
        try { const c = await api.catalog.lvChanges(catalogVersion() || undefined); if (alive) setChanges(c); } catch { /* ignore */ }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const run = async () => {
    setBusy(true);
    const before = catalogVersion();
    const u = await checkCatalogUpdates(getToken());
    try {
      const c = await api.catalog.lvChanges((u.ok ? before : catalogVersion()) || undefined);
      setChanges(c);
    } catch { /* offline → keep whatever the badge already loaded */ }
    setBusy(false);
    setOpen(true);
  };

  const version = changes?.version ?? 0;
  const items = useMemo(() => changes?.items ?? [], [changes]);

  // Every readable thing has a key — a catalogue change (changeKey).
  const allKeys = useMemo(
    () => items.map((it) => changeKey(version, it)),
    [items, version],
  );
  const unreadCount = allKeys.filter((k) => !read.has(k)).length;

  // Open the modal by itself, once, when an editable quotation has unread updates — so a
  // price/rate change can't be missed even if the person never presses the button.
  useEffect(() => {
    if (autoOpen && !autoOpenedRef.current && changes && unreadCount > 0) {
      autoOpenedRef.current = true;
      setOpen(true);
    }
  }, [autoOpen, changes, unreadCount]);

  const isRead = (key: string) => read.has(key);
  const markKeys = (keys: string[]) => {
    const next = new Set(read);
    keys.forEach((k) => next.add(k));
    setRead(next); saveReadChanges(next);
  };

  return (
    <div className="flex flex-col items-end no-print">
      <div className="relative">
        <button onClick={run} disabled={busy}
          title="See what changed in the latest published update"
          className="btn-ghost disabled:opacity-60">
          {busy ? "Checking…" : "⟳ Check for updates"}
        </button>
        {unreadCount > 0 && (
          <span aria-label={`${unreadCount} unread updates`}
            className="pointer-events-none absolute -right-2 -top-2 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-extrabold leading-none text-white ring-2 ring-white">
            {unreadCount}
          </span>
        )}
      </div>
      {open && changes && (
        <WhatChangedModal changes={changes} version={version} onApply={onApply}
          isRead={isRead} markKeys={markKeys} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── Row chips ────────────────────────────────────────────────────────────────
const Chip = ({ read }: { read: boolean }) =>
  read
    ? <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-600 dark:bg-green-500/15 dark:text-green-300">✓ Read</span>
    : <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-bold text-brand">● New</span>;

/** A flat white row: orange rail + "● New" when unread, greyed + "✓ Read" when read. Clicking it
 *  marks read. `right` is the row's own content (prices / values); `main` is the left side. */
function Row({ read, onRead, main, right }: { read: boolean; onRead: () => void; main: ReactNode; right?: ReactNode }) {
  return (
    <div onClick={read ? undefined : onRead}
      className={`relative flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${read ? "" : "cursor-pointer"}`}>
      {!read && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand" />}
      <div className="min-w-0 flex-1">{main}</div>
      {right}
      <Chip read={read} />
    </div>
  );
}

interface ModalProps {
  changes: CatalogChanges; version: number;
  onApply?: () => { changed: number; removed: number };
  isRead: (key: string) => boolean; markKeys: (keys: string[]) => void; onClose: () => void;
}

function WhatChangedModal({ changes, version, onApply, isRead, markKeys, onClose }: ModalProps) {
  const items = changes.items;
  const ck = (it: CatalogChangeItem) => changeKey(version, it);

  // ── Categorise the published changes into the four tabs ──
  const prices = useMemo(() => {
    const move = (it: CatalogChangeItem) => {
      const a = moneyValue(parseMoney(it.oldValue)), b = moneyValue(parseMoney(it.newValue));
      return a > 0 ? ((b - a) / a) * 100 : 0;
    };
    return items.filter((it) => it.field === "price").sort((x, y) => move(y) - move(x)); // increases first
  }, [items]);
  const settings = useMemo(() => items.filter((it) => it.entity === "PriceSetting"), [items]);
  const added = useMemo(() => items.filter((it) => it.field === "__created"), [items]);
  const removed = useMemo(() => items.filter((it) => it.field === "__retired"), [items]);
  const edited = useMemo(() => items.filter((it) => it.field === "description"), [items]);

  const componentRows = [...added, ...removed, ...edited];
  const tabs = [
    { id: "prices", label: "Prices", keys: prices.map(ck) },
    { id: "settings", label: "General settings", keys: settings.map(ck) },
    { id: "components", label: "Components", keys: componentRows.map(ck) },
  ].filter((t) => t.keys.length > 0);

  const unread = (t: { keys: string[] }) => t.keys.filter((k) => !isRead(k)).length;

  const [active, setActive] = useState(() => (tabs.find((t) => unread(t) > 0) ?? tabs[0])?.id ?? "prices");
  const [showAllPrices, setShowAllPrices] = useState(false);
  const [showAllEdited, setShowAllEdited] = useState(false);
  const [applied, setApplied] = useState<{ changed: number; removed: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];
  const activeUnread = activeTab ? unread(activeTab) : 0;

  const doApply = () => {
    if (!onApply) return;
    setApplied(onApply());
    // Apply acts on Prices and General settings — mark those read (Components are already live).
    markKeys([...prices.map(ck), ...settings.map(ck)]);
  };

  const dateStr = changes.publishedAt ? new Date(changes.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
      <div className="fixed inset-0 bg-ink/40 animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal="true"
        className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl2 border border-line bg-white shadow-lift animate-pop dark:bg-surface">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <h2 className="sec-head mb-0">What changed in this update</h2>
          <div className="flex shrink-0 items-center gap-2">
            {onApply && applied === null && (
              <button onClick={doApply} className="btn-primary"
                title="Bring this quotation’s prices and settings up to the current list">Apply changes</button>
            )}
            {applied !== null && (
              <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700 dark:bg-green-500/15 dark:text-green-300">
                ✓ {applied.changed === 0 && applied.removed === 0
                  ? "Already up to date"
                  : [applied.changed > 0 ? `${applied.changed} price${applied.changed === 1 ? "" : "s"} updated` : "",
                     applied.removed > 0 ? `${applied.removed} discontinued removed` : ""].filter(Boolean).join(" · ")}
              </span>
            )}
            <button onClick={onClose} className="btn-ghost" title="Close (Esc)">✕ Close</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto px-5 pb-3 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const u = unread(t);
            const on = t.id === active;
            return (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  on ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand/40 dark:bg-surface"}`}>
                <span>{t.label}</span>
                {u > 0 ? (
                  <>
                    <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-extrabold tabular-nums ${on ? "bg-white text-brand" : "bg-surface text-muted"}`}>{u}</span>
                    <span className={`h-[7px] w-[7px] rounded-full ${on ? "bg-white" : "bg-brand"}`} />
                  </>
                ) : (
                  <span className={`text-xs font-extrabold ${on ? "text-white" : "text-green-600"}`}>✓</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Status bar */}
        {activeTab && (
          <div className="flex items-center justify-between gap-3 border-y border-line bg-surface px-5 py-2.5">
            <span className={`text-xs font-bold tracking-wide ${activeUnread === 0 ? "text-green-600" : "text-muted"}`}>
              {activeUnread === 0 ? `All ${activeTab.keys.length} read` : `${activeUnread} unread of ${activeTab.keys.length}`}
            </span>
            <button disabled={activeUnread === 0} onClick={() => markKeys(activeTab.keys)}
              className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-brand transition-colors hover:border-brand hover:bg-brand-tint disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-muted/50">
              Mark this tab as read
            </button>
          </div>
        )}

        {/* Body */}
        <div className="min-h-[8rem] flex-1 overflow-y-auto">
          {tabs.length === 0 && (
            <div className="grid h-full min-h-[8rem] place-items-center p-8 text-center text-sm text-muted">
              Nothing has changed since this quotation — you’re up to date.
            </div>
          )}
          {active === "prices" && (
            <PricesTab items={prices} isRead={isRead} mark={(it) => markKeys([ck(it)])} ck={ck} showAll={showAllPrices} onShowAll={() => setShowAllPrices(true)} />
          )}
          {active === "settings" && settings.map((it, i) => (
            <Row key={i} read={isRead(ck(it))} onRead={() => markKeys([ck(it)])}
              main={<div className={`text-sm font-bold ${isRead(ck(it)) ? "text-muted" : "text-ink"}`}>{it.label || it.field}</div>}
              right={<span className="whitespace-nowrap text-[13px]"><span className="text-muted/70 line-through">{it.oldValue ?? "—"}</span> <span className="font-extrabold text-ink">→ {it.newValue ?? "—"}</span></span>} />
          ))}
          {active === "components" && (
            <ComponentsTab added={added} removed={removed} edited={edited} isRead={isRead} mark={(it) => markKeys([ck(it)])} ck={ck} showAllEdited={showAllEdited} onShowAllEdited={() => setShowAllEdited(true)} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-line bg-surface px-5 py-3">
          <div className="min-w-0">
            <div className="text-xs text-ink">Applying updates your prices and settings. Saved quotations are not changed.</div>
            <div className="mt-0.5 truncate text-[11px] text-muted/70">
              Version {changes.version}{changes.publishedBy ? ` · published by ${changes.publishedBy}` : ""}{dateStr ? ` · ${dateStr}` : ""}
            </div>
          </div>
          <button onClick={() => markKeys(items.map(ck))}
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs font-bold text-brand transition-colors hover:border-brand hover:bg-brand-tint">
            Mark all as read
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Tab 1: Prices ─────────────────────────────────────────────────────────────
function PricesTab({ items, isRead, mark, ck, showAll, onShowAll }: {
  items: CatalogChangeItem[]; isRead: (k: string) => boolean; mark: (it: CatalogChangeItem) => void;
  ck: (it: CatalogChangeItem) => string; showAll: boolean; onShowAll: () => void;
}) {
  const shown = showAll ? items : items.slice(0, 8);
  return (
    <>
      {shown.map((it, i) => {
        const a = parseMoney(it.oldValue), b = parseMoney(it.newValue);
        const av = moneyValue(a), bv = moneyValue(b);
        const pct = av > 0 ? ((bv - av) / av) * 100 : 0;
        const up = bv >= av;
        const rd = isRead(ck(it));
        return (
          <Row key={i} read={rd} onRead={() => mark(it)}
            main={<div className={`truncate text-sm font-bold ${rd ? "text-muted" : "text-ink"}`}>{it.label || it.detail?.d || it.detail?.ref || "item"}</div>}
            right={<span className="flex items-center gap-2 whitespace-nowrap text-[13px]">
              <span className="text-muted/70 line-through">{money1(a)}</span>
              <span className="font-extrabold text-ink">→ {money1(b)}</span>
              {av > 0 && (
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${up ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300" : "bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-300"}`}>
                  {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
                </span>
              )}
            </span>} />
        );
      })}
      {!showAll && items.length > 8 && (
        <button onClick={onShowAll} className="w-full border-t border-line py-3 text-center text-[13px] font-bold text-brand hover:bg-brand-tint">
          Show all {items.length} changed prices
        </button>
      )}
    </>
  );
}

// ── Tab 3: Components ─────────────────────────────────────────────────────────
function specStrip(it: CatalogChangeItem): string {
  const d = it.detail ?? {};
  if (it.entity === "LvEnclosure") return ["Enclosure", d.ip, d.mount, d.ral].filter(Boolean).join(" · ");
  return [d.t, d.brand, d.r, d.poles ? `${d.poles}P` : "", "pc"].filter(Boolean).join(" · ");
}
const compRef = (it: CatalogChangeItem) => it.detail?.ref || it.detail?.fam || "—";
const compName = (it: CatalogChangeItem) => it.entity === "LvEnclosure"
  ? `${it.detail?.fam ?? ""} · ${it.detail?.name ?? ""}`.replace(/^ · | · $/g, "")
  : (it.detail?.d || it.label || "");

function CompLine({ it, kind, read, onRead }: { it: CatalogChangeItem; kind: "add" | "rem"; read: boolean; onRead: () => void }) {
  const price = money1({ eur: it.detail?.eur ?? 0, egp: it.detail?.egp ?? 0 });
  return (
    <div onClick={read ? undefined : onRead}
      className={`relative flex items-center gap-2.5 border-b border-line/70 px-4 py-2.5 last:border-b-0 ${read ? "opacity-60" : "cursor-pointer"} ${kind === "rem" ? "opacity-60" : ""}`}>
      {!read && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand" />}
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${kind === "add" ? "bg-green-500" : "bg-red-500"}`} />
      <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold text-ink">{compRef(it)} <span className="font-semibold text-muted">— {compName(it)}</span></span>
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{kind === "rem" ? "discontinued" : specStrip(it)}</span>
      {kind === "add" && <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold tabular-nums text-ink">{price}</span>}
      <Chip read={read} />
    </div>
  );
}

function ComponentsTab({ added, removed, edited, isRead, mark, ck, showAllEdited, onShowAllEdited }: {
  added: CatalogChangeItem[]; removed: CatalogChangeItem[]; edited: CatalogChangeItem[];
  isRead: (k: string) => boolean; mark: (it: CatalogChangeItem) => void; ck: (it: CatalogChangeItem) => string;
  showAllEdited: boolean; onShowAllEdited: () => void;
}) {
  const editedShown = showAllEdited ? edited : edited.slice(0, 3);
  const Block = ({ title, count, expl, children }: { title: string; count: number; expl: string; children: ReactNode }) => (
    <div className="border-b border-line last:border-b-0">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[17px] font-extrabold text-ink">{title}</h3>
          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-extrabold text-muted tabular-nums">{count}</span>
        </div>
        <p className="mt-0.5 mb-1 text-xs text-muted">{expl}</p>
      </div>
      {children}
    </div>
  );
  return (
    <>
      {added.length > 0 && (
        <Block title="Added" count={added.length} expl="New components now available to add to panels.">
          {added.map((it, i) => <CompLine key={i} it={it} kind="add" read={isRead(ck(it))} onRead={() => mark(it)} />)}
        </Block>
      )}
      {removed.length > 0 && (
        <Block title="Removed" count={removed.length} expl="Discontinued — kept on saved quotations, no longer offered for new ones.">
          {removed.map((it, i) => <CompLine key={i} it={it} kind="rem" read={isRead(ck(it))} onRead={() => mark(it)} />)}
        </Block>
      )}
      {edited.length > 0 && (
        <Block title="Edited" count={edited.length} expl="The description text changed — the price and part are the same.">
          {editedShown.map((it, i) => {
            const rd = isRead(ck(it));
            return (
              <div key={i} onClick={rd ? undefined : () => mark(it)}
                className={`relative border-b border-line/70 px-4 py-3 last:border-b-0 ${rd ? "" : "cursor-pointer"}`}>
                {!rd && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-brand" />}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-extrabold text-ink">{compRef(it)}</span>
                    <span className="rounded bg-surface px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Description</span>
                  </div>
                  <Chip read={rd} />
                </div>
                <div className="mt-1.5 grid grid-cols-[3.2rem_1fr] gap-x-2.5 gap-y-1 text-[13px] leading-snug">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted/70">Before</span>
                  <span className="text-muted line-through">{it.oldValue || "—"}</span>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-muted/70">After</span>
                  <span className={`font-semibold ${rd ? "text-muted" : "text-ink"}`}>{it.newValue || "—"}</span>
                </div>
              </div>
            );
          })}
          {!showAllEdited && edited.length > 3 && (
            <button onClick={onShowAllEdited} className="w-full border-t border-line/70 py-2.5 text-center text-[13px] font-bold text-brand hover:bg-brand-tint">
              Show {edited.length - 3} more edited description{edited.length - 3 > 1 ? "s" : ""}
            </button>
          )}
        </Block>
      )}
    </>
  );
}
