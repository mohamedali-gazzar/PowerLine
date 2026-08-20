import type { ReactNode } from "react";

// ── Shared branded offer cover (Technical & Commercial) ──────────────────────
// The same branded title page the LV configurator shows on screen and the
// server-side RMU PDF draws. Kept prop-driven (no LvState) so any offer type can
// render it — the RMU offer page reuses it so its Technical tab shows the cover
// exactly like the LV section does.

const TRED = "#F16722"; // brand orange — accent bar, title, rules
const ORANGE = "#F16722";
const PANEL_LAMPS = ["#2FA84F", "#D64545", "#E8B93A"]; // green / red / yellow door lamps

function fmtDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
const coverTel = (phone: string) => {
  const d = phone.replace(/[^\d+]/g, "");
  return d.startsWith("+") ? `tel:${d}` : `tel:+20${d.replace(/^0/, "")}`;
};
const CoverPhoneI = () => (
  <svg viewBox="0 0 24 24" className="mr-1 inline-block h-3 w-3 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
const CoverMailI = () => (
  <svg viewBox="0 0 24 24" className="mr-1 inline-block h-3 w-3 align-[-2px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
  </svg>
);

/** The product range printed on the offer covers — the same strip on Technical &
 *  Commercial. `href` makes the icon + title a link to that product's page. */
const COVER_RANGE: { title: string; items: string[]; icon: ReactNode; href?: string }[] = [
  {
    title: "LV Enclosures",
    items: ["PLP MAX", "PLP CORE", "PLP MINI"],
    href: "https://www.powerlinei.com/low-voltage",
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.25"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5.5" y="2.5" width="21" height="27" rx="1.2" fill="rgba(88,88,89,0.06)" />
        {[
          { x: 8, tip: -1.15 },
          { x: 13.5, tip: 0 },
          { x: 19, tip: 1.15 },
        ].map(({ x, tip }) => (
          <g key={x}>
            <rect x={x} y="6.9" width="5" height="4.2" rx="0.5" fill="rgba(88,88,89,0.5)" stroke="none" />
            <line x1={x + 2.5} y1="10.2" x2={x + 2.5 + tip} y2="8.3" stroke="#fff" strokeWidth="0.9" />
          </g>
        ))}
        {PANEL_LAMPS.map((c, i) => (
          <circle key={c} cx={11 + i * 5} cy="15.4" r="1.5" fill={c} stroke="none" />
        ))}
        <circle cx="16" cy="21.9" r="2.5" fill={ORANGE} stroke="none" />
        <line x1="16" y1="21.9" x2="16" y2="20.2" stroke="#fff" strokeWidth="1.1" />
      </svg>
    ),
  },
  {
    title: "Transformers",
    items: ["PDTR"],
    href: "https://www.powerlinei.com/products/dry-type-transformers",
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.06"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <g transform="translate(-2.865 -2.57) scale(1.179)">
          <rect x="3.6" y="4.3" width="24.8" height="2.9" rx="0.5" fill="rgba(88,88,89,0.55)" stroke="none" />
          <rect x="12.4" y="5.1" width="7.2" height="1.3" rx="0.25" fill="rgba(255,255,255,0.9)" stroke="none" />
          {[5.4, 13.2, 21].map((x) => (
            <g key={x}>
              <rect x={x} y="8.1" width="5.6" height="14.8" rx="2.4" fill={ORANGE} stroke="none" />
              <rect x={x + 1.7} y="7.2" width="2.2" height="1.5" rx="0.3" fill="rgba(88,88,89,0.7)" stroke="none" />
            </g>
          ))}
          <g stroke="#585859" strokeWidth="1.19">
            <line x1="8.2" y1="11" x2="16" y2="20" />
            <line x1="16" y1="11" x2="23.8" y2="20" />
            <line x1="23.8" y1="11" x2="8.2" y2="20" />
          </g>
          {[8.2, 16, 23.8].flatMap((cx) => [11, 20].map((cy) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="rgba(88,88,89,0.9)" stroke="none" />
          )))}
          <rect x="3.6" y="23" width="24.8" height="2.7" rx="0.5" fill="rgba(88,88,89,0.55)" stroke="none" />
          <rect x="6.6" y="25.7" width="4.4" height="1.5" rx="0.3" fill="rgba(88,88,89,0.35)" stroke="none" />
          <rect x="21" y="25.7" width="4.4" height="1.5" rx="0.3" fill="rgba(88,88,89,0.35)" stroke="none" />
        </g>
      </svg>
    ),
  },
  {
    title: "Secondary Switchgear",
    items: ["PRAL", "PSEC", "AEGIS PLUS"],
    href: "https://www.powerlinei.com/secondary-switchgear",
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.157"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <g transform="translate(-1.28 -1.172) scale(1.08)">
          <rect x="4.2" y="3.4" width="23.6" height="25" rx="1" fill="rgba(88,88,89,0.06)" />
          {[8.13, 16, 23.87].map((cx) => (
            <rect key={`m${cx}`} x={cx - 1.7} y="5.6" width="3.4" height="2.7" rx="0.4"
              fill="rgba(88,88,89,0.5)" stroke="none" />
          ))}
          <rect x="4.2" y="10.6" width="23.6" height="5.6" fill={ORANGE} stroke="none" />
          {[8.13, 16, 23.87].map((cx) => (
            <g key={`s${cx}`} stroke="#fff" strokeWidth="0.787">
              <circle cx={cx} cy="12.6" r="0.85" />
              <line x1={cx} y1="13.45" x2={cx} y2="14.9" />
            </g>
          ))}
          <line x1="12.07" y1="16.2" x2="12.07" y2="26.6" />
          <line x1="19.93" y1="16.2" x2="19.93" y2="26.6" />
          {[8.13, 16, 23.87].map((cx) => (
            <rect key={`w${cx}`} x={cx - 1.5} y="17.6" width="3" height="1.7" rx="0.3"
              fill="rgba(88,88,89,0.55)" stroke="none" />
          ))}
          <rect x="4.2" y="26.6" width="23.6" height="1.8" rx="0.3" fill="rgba(88,88,89,0.5)" stroke="none" />
        </g>
      </svg>
    ),
  },
  {
    title: "Primary Switchgear",
    items: ["PLGEAR"],
    href: "https://www.powerlinei.com/primary-switchgear",
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.25"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5.5" y="2.5" width="21" height="27" rx="1.2" fill="rgba(88,88,89,0.06)" />
        <rect x="7.6" y="4.6" width="16.8" height="5" rx="0.7" fill="rgba(88,88,89,0.12)" />
        <rect x="9" y="6.1" width="3.4" height="2" rx="0.4" fill={ORANGE} stroke="none" />
        <rect x="13.8" y="6.1" width="3.4" height="2" rx="0.4" fill={ORANGE} stroke="none" />
        <rect x="18.6" y="6.1" width="3.4" height="2" rx="0.4" fill={ORANGE} stroke="none" />
        <rect x="8.6" y="12" width="14.8" height="9" rx="0.8" fill="rgba(88,88,89,0.82)" stroke="none" />
        <circle cx="16" cy="15.4" r="1.5" stroke="#fff" strokeWidth="1" />
        <line x1="16" y1="16.9" x2="16" y2="18.9" stroke="#fff" strokeWidth="1" />
        <rect x="7.6" y="23.4" width="16.8" height="4.6" rx="0.7" fill="rgba(88,88,89,0.12)" />
        <rect x="13.6" y="24.9" width="4.8" height="1.8" rx="0.3" fill="rgba(88,88,89,0.45)" stroke="none" />
      </svg>
    ),
  },
  {
    title: "Kiosk",
    items: ["PCSS"],
    href: "https://www.powerlinei.com/products/pcss",
    icon: (
      <svg viewBox="0 0 32 32" className="h-[35px] w-[35px]" fill="none" stroke="#585859" strokeWidth="1.088"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <g transform="translate(-2.383 -2.785) scale(1.149)">
          <path d="M3.8 10.6 L16 4.6 L28.2 10.6 Z" fill="rgba(88,88,89,0.12)" />
          <rect x="12.6" y="7.6" width="6.8" height="2.1" rx="0.35" fill={ORANGE} stroke="none" />
          <rect x="5.4" y="10.6" width="21.2" height="15.2" rx="0.6" fill="rgba(88,88,89,0.06)" />
          <line x1="16" y1="10.6" x2="16" y2="25.8" />
          <rect x="15.2" y="16.6" width="1.6" height="3" rx="0.4" fill="rgba(88,88,89,0.6)" stroke="none" />
          <line x1="14.6" y1="13.4" x2="17.4" y2="13.4" strokeWidth="0.87" />
          <line x1="14.6" y1="22.6" x2="17.4" y2="22.6" strokeWidth="0.87" />
          <rect x="4.6" y="25.8" width="22.8" height="2.3" rx="0.4" fill="rgba(88,88,89,0.5)" stroke="none" />
        </g>
      </svg>
    ),
  },
];

export interface OfferCoverContact {
  role: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface OfferCoverProps {
  kind: "Technical" | "Commercial";
  /** ISO date (yyyy-mm-dd); shown as a DD/MM/YYYY pill. */
  date?: string;
  /** Quotation reference shown in orange (e.g. "QTN-26-0001"). */
  qtnRef?: string;
  optyNo?: string | null;
  projectName?: string | null;
  customer?: string | null;
  contacts?: OfferCoverContact[];
}

/** Branded A4 title page shared by the LV and RMU offers. */
export default function OfferCover({
  kind,
  date = "",
  qtnRef = "",
  optyNo,
  projectName,
  customer,
  contacts = [],
}: OfferCoverProps) {
  const coverContacts = contacts.filter((c) => c.name);
  return (
    <section data-pdf-cover className="a4-sheet flex flex-col overflow-hidden" style={{ breakAfter: "page" }}>
      <div className="absolute inset-y-0 left-0 w-[10px]" style={{ background: TRED }} />
      <div className="flex flex-1 flex-col px-12 pb-14 pt-12">
        <div className="flex items-center justify-between">
          <img src="/brand/logo-horizontal.png" alt="PowerLine" className="h-32" />
          {date && (
            <span className="rounded-full bg-surface px-5 py-2 text-sm font-bold tracking-wide text-charcoal">{fmtDate(date)}</span>
          )}
        </div>
        <div className="mt-8">
          <div className="font-display text-7xl font-extrabold leading-[1.04] tracking-tight text-ink">{kind}</div>
          <div className="font-display text-7xl font-extrabold leading-[1.04] tracking-tight" style={{ color: TRED }}>Offer</div>
          <div className="mt-5 h-[6px] w-28 rounded-full" style={{ background: TRED }} />
          <p className="mt-6 text-xl text-muted">Egyptian electrification solutions · ABB-certified assembler</p>
          {(qtnRef || projectName) && (
            <div className="mt-6 space-y-0.5">
              {qtnRef && <div className="text-[18px] font-bold" style={{ color: TRED }}>{qtnRef}</div>}
              {optyNo && <div className="mb-2 text-[14px] font-semibold text-muted">{optyNo}</div>}
              {projectName && <div className="text-base text-ink">{projectName}</div>}
              {customer && <div className="mb-3 text-base text-muted">{customer}</div>}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-evenly">
          {coverContacts.length > 0 && (
            <div className="grid w-fit grid-cols-[4rem_auto_auto_auto] items-baseline gap-x-4 gap-y-1 text-left text-[12px] text-muted">
              {coverContacts.map((c) => (
                <div key={c.role} className="contents">
                  <span className="inline-block w-16 text-[12px] font-semibold text-ink">{c.role}:</span>
                  <span className="whitespace-nowrap">{c.name}</span>
                  <span className="whitespace-nowrap">{c.phone && <a href={coverTel(c.phone)} className="text-inherit no-underline"><CoverPhoneI />{c.phone}</a>}</span>
                  <span className="whitespace-nowrap">{c.email && <a href={`mailto:${c.email}`} className="text-inherit no-underline"><CoverMailI />{c.email}</a>}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-5">
            {COVER_RANGE.map((col, i) => (
              <div key={col.title} className={`px-4 ${i === 0 ? "pl-0" : "border-l border-line"}`}>
                {(() => {
                  const head = (
                    <>
                      <div className="mb-2.5">{col.icon}</div>
                      <div className="flex h-[25px] items-end font-display text-[10px] font-bold uppercase leading-tight tracking-[0.13em] text-charcoal">
                        <span>{col.title}</span>
                      </div>
                    </>
                  );
                  return col.href ? (
                    <a href={col.href} target="_blank" rel="noopener noreferrer" data-pdf-link={col.href}
                      className="block text-inherit no-underline" title={`Open ${col.title} on powerlinei.com`}>
                      {head}
                    </a>
                  ) : head;
                })()}
                <div className="mt-2 mb-3 h-[2px] w-7 rounded-full" style={{ background: TRED }} />
                <ul className="space-y-1.5">
                  {col.items.map((it) => (
                    <li key={it} className="text-[13px] font-medium leading-tight text-charcoal">{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div data-cover-footer>
          <div className="h-[3px] w-[calc(100%+3rem)] rounded" style={{ background: TRED }} />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {[
              { name: "ISO 9001", url: "https://drive.google.com/file/d/1D2GThbsl9FDr7rnhdFl7jsnWKXyOc8KY/view" },
              { name: "ISO 14001", url: "https://drive.google.com/file/d/1yqz35dDFJDZ18X2fURFwufHtzg7c50rZ/view" },
              { name: "ISO 45001", url: "https://drive.google.com/file/d/1nzbbwg3CLKqUkYY6RBXhcFTI0PJpToMG/view" },
            ].map((b) => (
              <a key={b.name} href={b.url} target="_blank" rel="noopener noreferrer"
                className="rounded-full bg-surface px-5 py-2 text-sm font-bold text-charcoal transition-colors hover:bg-brand-light hover:text-brand-darker">
                {b.name}
              </a>
            ))}
            <a href="https://drive.google.com/file/d/16I86eVMca56UUUiMsLusKEb1G4R6iYD6/view" target="_blank" rel="noopener noreferrer"
              className="rounded-full px-5 py-2 text-sm font-extrabold transition-opacity hover:opacity-80" style={{ background: "#FEF3ED", color: TRED }}>ABB CERTIFIED</a>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-muted">
              <a href="https://maps.app.goo.gl/kqZBxFo286ps7qBP8" target="_blank" rel="noopener noreferrer" className="text-inherit no-underline hover:text-brand">20 Ammar Ibn Yasser, Heliopolis, Cairo</a>
              {" · "}
              <a href="tel:+202262215022" className="text-inherit no-underline hover:text-brand">+2 02262215022</a>
              {" · "}
              <a href="mailto:info@powerline.com.eg" className="text-inherit no-underline hover:text-brand">info@powerline.com.eg</a>
            </p>
            <div className="flex items-center gap-2.5">
              {[
                { label: "Website", url: "https://powerlinei.com/", icon: (
                  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><line x1="3" y1="12" x2="21" y2="12" />
                    <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
                  </svg>
                ) },
                { label: "Facebook", url: "https://www.facebook.com/Powerline.ABB", icon: (
                  <svg viewBox="0 0 320 512" className="h-[18px] w-[18px]" fill="currentColor">
                    <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-49.84 52.24-49.84h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
                  </svg>
                ) },
                { label: "LinkedIn", url: "https://www.linkedin.com/login/?session_redirect=%2Fcompany%2F9288669", icon: (
                  <svg viewBox="0 0 448 512" className="h-[18px] w-[18px]" fill="currentColor">
                    <path d="M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z" />
                  </svg>
                ) },
              ].map((sl) => (
                <a key={sl.label} href={sl.url} target="_blank" rel="noopener noreferrer" aria-label={sl.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-opacity hover:opacity-85" style={{ background: TRED }}>
                  {sl.icon}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
