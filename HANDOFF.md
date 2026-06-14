# PowerLine — Project Handoff

> Complete reference for picking up this project on a new machine / account.
> Read this top-to-bottom once; everything needed to run, edit, and deploy is here.
> Secrets (Vercel token, DB URLs) are **not** in this file — see
> [§15 Secrets](#15-secrets) and the separate `HANDOFF.secrets.md`.

---

## 0. TL;DR quick start

```bash
git clone https://github.com/mohamedali-gazzar/PowerLine.git
cd PowerLine

# backend (Express API + Prisma/SQLite) — terminal 1
cd backend
npm install                       # postinstall sets SQLite + generates Prisma client
npx prisma migrate deploy         # creates backend/prisma/dev.db (first run only)
npx prisma generate
npm run db:seed                   # optional sample data
npm run dev                       # http://localhost:4000

# frontend (React + Vite + Tailwind) — terminal 2
cd ../frontend
npm install
npm run dev                       # http://localhost:5173
```

On Windows you can instead just double-click **`start-app.bat`** (does all of the
above and opens the browser). **`stop-app.bat`** stops it.

- **Local app:** http://localhost:5173
- **Backend API:** http://localhost:4000/api
- **Live (production):** https://powerline-chi.vercel.app

---

## 1. What this project is

**PowerLine** is an internal web tool for an electrical switchgear company
(powerline.com.eg) that **generates Technical & Commercial offers** (quotations)
for three product families. It replaces a set of Excel "configurator" files.

| Section | Route | Status | What it does |
|---|---|---|---|
| **RMU** | `/` | full, backend-backed | Ring Main Units (PRAL air-insulated / PSEC SF6). Generates Technical PDF, Commercial PDF (bilingual EN/AR), and SLD (single-line-diagram) PDF. Saves offers to a database. |
| **Kiosk** | `/kiosks` | full, client-side | PCSS (Packaged Compact Secondary Substation) **selector** — pick RMU + config + power range + LV panel + breakers → recommends compatible P-CSS enclosure designs with live space validation. |
| **LV** | `/lv` | full, client-side | **LV panel configurator** organised as **QTNs** (quotations). Each QTN holds Project / Pricing / Panels / Technical Offer / Commercial Offer / Material List. Built from a 2,124-item ABB component database. Exports offers via print-to-PDF. |

The RMU section is the most mature (it has a real backend + DB + 3 PDF types).
Kiosk and LV are **frontend-only** (all logic + data in the browser bundle;
LV quotations persist in the browser's `localStorage`).

---

## 2. Repository & access

- **GitHub:** https://github.com/mohamedali-gazzar/PowerLine  (branch: `main`)
- **Hosting:** Vercel (one project serves frontend static + backend serverless).
- **Database:** Neon Postgres (production only). Local dev uses SQLite.

To work on the new machine you need:
1. Git access to the repo above (clone). If it's private, add the new GitHub
   account as a collaborator.
2. Node.js 20.x and npm.
3. (Only to deploy) the Vercel token + team id from `HANDOFF.secrets.md`.

---

## 3. Tech stack

**Backend** (`backend/`)
- Node + Express 4 + TypeScript
- Prisma 5 ORM — SQLite locally, PostgreSQL (Neon) in prod
- PDFKit for PDF generation (+ bundled Amiri font for Arabic)
- Zod for validation
- Dev server: `nodemon` (ts-node)

**Frontend** (`frontend/`)
- React 18 + Vite 5 + TypeScript
- React Router 6
- Tailwind CSS 3 (custom "Powerline orange" theme)
- No component library — hand-rolled components in `src/components/fields.tsx`
- State: React `useState` + `localStorage` (Kiosk/LV have no backend yet)

**Deploy:** Vercel (`@vercel/static-build` for frontend, `@vercel/node` for the
Express app as a serverless function). Config in `vercel.json`.

---

## 4. Run it locally (Windows specifics)

- The dev machine is **Windows 11 + PowerShell**. Inside this Claude Code
  session the *PowerShell tool* was unavailable, so everything was driven through
  the **Bash tool** (Git Bash) and `node`. `unzip` is available (used to read
  xlsx/docx, which are zip files).
- **`nodemon` can be flaky** on Windows — if the backend won't restart, kill node
  and restart: `taskkill //F //IM node.exe` then `npm run dev`.
- **`start-app.bat`** is the easy button: installs deps if missing, creates the
  SQLite DB on first run, launches both servers in separate windows, opens the
  browser. **`stop-app.bat`** kills them.
- Local dev is **fully offline** — SQLite, no cloud needed.

`launch.json` (`.claude/launch.json`) defines the two dev servers for the
in-editor preview: `backend` (cwd `backend`, port 4000) and `frontend`
(cwd `frontend`, port 5173).

---

## 5. Folder / file map (full)

```
PowerLine/
├─ README.md                     # short readme
├─ HANDOFF.md                    # ← this file
├─ HANDOFF.secrets.md            # secrets (gitignored — copy manually between PCs)
├─ DEPLOY.md                     # Vercel + Neon deploy notes
├─ vercel.json                   # Vercel build/route config (frontend static + backend fn)
├─ start-app.bat / stop-app.bat  # Windows local launcher
├─ .gitignore
├─ tools/
│  ├─ pl-deploy.cjs              # REST-API Vercel deploy (CLI-free); needs VERCEL_TOKEN+VERCEL_TEAM
│  └─ docx_extract.py            # helper to read .docx (not always used)
│
├─ backend/                      # Express API + Prisma + PDF generation (RMU)
│  ├─ package.json               # scripts incl. postinstall db-setup
│  ├─ nodemon.json
│  ├─ tsconfig.json
│  ├─ .env.example               # DATABASE_URL etc. (copy to .env locally)
│  ├─ render-pdf.mjs             # mupdf helper: render a PDF page → PNG (debug/verify)
│  ├─ prisma/
│  │  ├─ schema.prisma           # Offer + RmuConfig models; datasource auto-swapped
│  │  └─ seed.ts
│  ├─ scripts/
│  │  ├─ db-setup.js             # picks sqlite (local) vs postgresql (Vercel) provider
│  │  └─ db-push-vercel.js       # `prisma db push` to Neon during Vercel build only
│  ├─ api/
│  │  └─ index.ts                # Vercel serverless entry: `export default createApp()`
│  └─ src/
│     ├─ index.ts                # local server entry (listens on PORT)
│     ├─ app.ts                  # createApp(): CORS+JSON, /api/health, /api/meta/rmu, mounts offers router
│     ├─ lib/prisma.ts           # PrismaClient singleton (survives hot reload)
│     ├─ routes/offers.routes.ts # /api/offers router
│     ├─ controllers/offers.controller.ts  # list/create/preview/get/delete/pdf handlers
│     ├─ services/
│     │  ├─ offer.service.ts            # CRUD + decorate (assemble+price+commercial)
│     │  ├─ pricing.ts                  # qty/discount/VAT math
│     │  ├─ commercial.service.ts       # builds commercial line items + VAT (14%)
│     │  ├─ pdf.service.ts              # Technical offer PDF (A4)
│     │  ├─ pdf-commercial.service.ts   # Commercial PDF, bilingual EN/AR (Amiri font)
│     │  └─ pdf-sld.service.ts          # Single-line-diagram PDF (A3 landscape, PSEC)
│     ├─ domain/
│     │  ├─ standards.ts          # product profiles, electrical ratings tables
│     │  ├─ assembly.ts           # ★ RMU assembly engine + coding system (see §9a)
│     │  ├─ priceList.ts          # RMU price list + lookup
│     │  └─ commercialContent.ts  # bilingual EN/AR offer terms text
│     ├─ validation/offer.schema.ts  # Zod schemas (create/preview)
│     └─ assets/                  # logo.png, product images, Amiri-*.ttf (Arabic font)
│
└─ frontend/                     # React app — all three sections
   ├─ package.json               # scripts: dev / build (tsc -b && vite build) / vercel-build
   ├─ vite.config.ts             # dev proxy: /api → http://localhost:4000
   ├─ tailwind.config.js         # ★ theme tokens + custom animations (see §10)
   ├─ postcss.config.js
   ├─ tsconfig.json
   ├─ index.html
   ├─ scripts/
   │  └─ lv-import.cjs           # ★ converts LV master xlsx/docx → src/lv/data/*.json
   └─ src/
      ├─ main.tsx                # router: all routes registered here
      ├─ App.tsx                 # layout: left sidebar nav (RMU | Kiosks | LV), NEW badges
      ├─ index.css               # Tailwind layers + component classes + PRINT css
      ├─ api.ts                  # fetch wrapper for the backend (RMU only)
      ├─ types.ts                # shared TS types (RMU/offer)
      ├─ options.ts              # PRODUCT_CATEGORIES + RMU dropdown option lists + labels
      ├─ components/
      │  ├─ fields.tsx           # Field/TextInput/NumberInput/Select/Segmented/Toggle/Checkbox
      │  ├─ OfferView.tsx        # RMU technical offer renderer
      │  └─ CommercialView.tsx   # RMU commercial offer renderer
      ├─ pages/
      │  ├─ OffersListPage.tsx       # RMU: list of saved offers  (route "/")
      │  ├─ NewOfferPage.tsx         # RMU: create form + live preview  (route "/offers/new")
      │  ├─ OfferDetailPage.tsx      # RMU: view offer + PDF links  (route "/offers/:id")
      │  ├─ ComingSoonPage.tsx       # generic "coming soon" (now unused — both sections built)
      │  ├─ KioskSelectorPage.tsx    # Kiosk PCSS selector  (route "/kiosks")
      │  ├─ LvQtnListPage.tsx        # LV: list of QTNs  (route "/lv")
      │  └─ LvConfiguratorPage.tsx   # LV: one QTN workspace  (route "/lv/qtn/:id")
      ├─ kiosk/
      │  ├─ catalog.ts           # PCSS designs + RMU/TR/LV/breaker tables (from Excel)
      │  └─ engine.ts            # compatibility + LV gating + space-validation logic
      └─ lv/
         ├─ catalog.ts           # loads data JSONs + RPT-01 option lists + pricing helpers
         ├─ store.ts             # LV state model, calc engine, Material-List builder
         ├─ qtns.ts              # QTN registry (localStorage), auto numbers QTN-YY-####
         ├─ combos.ts            # ATS / Photocell / MCC / PFC / WD combination generators
         ├─ cells.ts             # Pro-E / IS2 / PLP cell-table rules (RPT-02)
         └─ data/                # generated by lv-import.cjs — DO NOT hand-edit
            ├─ components.json   # 2,124 ABB components (type/family/rating/ref/€/poles/Cu/brand/stock)
            ├─ enclosures.json   # 259 enclosures (all 10 families)
            ├─ enclosures-extra.json # Pro-E/IS2/PLP/Pillars/Coffree seed (merged into enclosures.json)
            ├─ factors.json      # pricing factors defaults (rates, copper, ops, factor, ABB disc, VAT, forms)
            └─ combos.json       # ATS templates, photocell map, MCC matrix, WD kits
```

---

## 6. Architecture overview

### Same-origin full-stack on Vercel
One Vercel project builds **both** halves (see `vercel.json`):
- `frontend/` → static site (`@vercel/static-build`, distDir `dist`), mounted so
  that `/(.*)` falls back to `/frontend/index.html` (SPA) and `/*.ext` maps to
  `/frontend/*`.
- `backend/api/index.ts` → serverless function at `/api/*` (`@vercel/node`).
- Because it's same-origin, the frontend just calls `/api/...` — no CORS/API-URL.

### RMU data flow (the backend-backed path)
1. User fills the form in `NewOfferPage.tsx` → debounced `POST /api/offers/preview`.
2. Backend validates (Zod), runs `assembleOffer(config)` (domain/assembly.ts) to
   derive the full technical content, and `priceForConfig(config)` for pricing.
3. On save (`POST /api/offers`) the inputs are stored (Offer + RmuConfig);
   everything else is **derived on read** (the DB only holds inputs).
4. PDFs are generated on demand: `GET /api/offers/:id/pdf` (technical),
   `/commercial-pdf`, `/sld-pdf`.

### Kiosk & LV data flow (client-side)
No backend. All catalog data is bundled JSON / TS. Kiosk computes recommendations
in `kiosk/engine.ts`. LV stores QTNs in `localStorage` (`lv/qtns.ts`) and computes
prices/material lists in `lv/store.ts`. "PDF" = browser print of a styled
`.print-area` (see the print CSS in `index.css`).

---

## 7. Database & dual-DB (SQLite local / Neon Postgres prod)

**You never run a DB command by hand for prod.** The same repo runs on two DBs:

- **Local:** SQLite (`backend/prisma/dev.db`). The committed `schema.prisma` has
  `datasource { provider = "sqlite" }`.
- **Vercel:** PostgreSQL (Neon). Vercel sets `process.env.VERCEL`, and:
  - `backend/scripts/db-setup.js` (runs on `postinstall`) **rewrites** the
    datasource block to `postgresql` when on Vercel (or with `DB_PROVIDER` /
    explicit arg), and rewrites it back to the identical SQLite block locally
    (so there's no git churn). **Always commit the schema with `sqlite`.**
  - `backend/scripts/db-push-vercel.js` runs `prisma db push` against Neon during
    the Vercel build only — so tables are created/updated on every deploy.
  - `schema.prisma` generator has `binaryTargets = ["native","rhel-openssl-3.0.x"]`
    (the second is for Vercel's Linux Lambda) and `vercel.json` `includeFiles`
    bundles the Prisma client.

**Models** (`backend/prisma/schema.prisma`):
- `Offer` — offerNumber (unique, `PL-YYYY-####`), category (RMU|KIOSK|LV, only RMU
  used), project/customer/status, sales/order numbers, commercial fields
  (currency/unitPrice/qty/discount/validity/delivery/payment/warranty/notes),
  `rmu RmuConfig?`, timestamps.
- `RmuConfig` — the RMU inputs (productType, lbsBrand, clientSpec, voltageKv,
  nalCount, nalfCount, hasMetering, rtuType, installation, busbarCurrentA,
  fuseRatingA, metering options vtCores/vtBurdenVa/vtClass/meteringWithFuse,
  cached `configCode`).

SQLite has no enums, so enum-like fields are `String` validated by Zod in the API.

> **Important:** the Kiosk and LV sections do **NOT** use the database at all.
> LV QTNs live in each browser's `localStorage` (key `powerline-lv-qtns-v1`), so
> they don't sync across devices/users. Moving LV QTNs to the backend DB is the
> main "Phase 2" item (see §14).

---

## 8. Deployment (Vercel)

### Live
- Production URL: **https://powerline-chi.vercel.app**
- Vercel **team id:** `team_d6sWJ5oTSYuVB70PvMvzfS9D` (also in secrets file).
- Env vars set in the Vercel project (Settings → Environment Variables):
  `DATABASE_URL` = Neon **pooled** URL, `DIRECT_URL` = Neon **direct** URL.

### Two ways to deploy

**A) Git auto-deploy (recommended — set up once).**
In the Vercel dashboard → Project → Settings → **Git**, connect the
`mohamedali-gazzar/PowerLine` repo. After that, **every `git push` to `main`
auto-builds and redeploys.** This is the normal flow and avoids tokens entirely.
*(As of this handoff this was NOT yet connected — pushes did not auto-deploy.)*

**B) Manual deploy via REST API (`tools/pl-deploy.cjs`).**
Used because the Vercel **CLI was broken on the original Windows machine**
("Cannot find native binding" — an npm optional-deps bug). The script uploads all
git-tracked files and creates a production build:

```bash
# from the repo root, after committing your changes
VERCEL_TOKEN="<token>" VERCEL_TEAM="team_d6sWJ5oTSYuVB70PvMvzfS9D" node tools/pl-deploy.cjs
```

(token in `HANDOFF.secrets.md`). On a machine where the CLI works, just
`npm i -g vercel` then `vercel --prod` is simpler.

### The standard "ship a change" sequence used in this project
```bash
# 1. make + verify changes locally (build must pass)
cd frontend && npm run build      # tsc -b && vite build — must be clean
cd ..

# 2. confirm schema is committed as SQLite (NOT postgresql)
grep 'provider' backend/prisma/schema.prisma   # → provider = "sqlite"

# 3. commit + push
git add -A
git commit -m "..."
git push origin main

# 4. deploy (if Git auto-deploy not connected)
VERCEL_TOKEN="..." VERCEL_TEAM="team_d6sWJ5oTSYuVB70PvMvzfS9D" node tools/pl-deploy.cjs

# 5. verify prod has the change (grep the built bundle)
curl -s https://powerline-chi.vercel.app/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js'
#   then curl that JS and grep for a string you added.
```

### Deploy gotchas
- **Commit `schema.prisma` with `sqlite`** — db-setup.js flips it to postgresql on
  Vercel. If you accidentally commit `postgresql`, local dev breaks.
- **Destructive schema changes** (drop/rename column) make Vercel's `prisma db
  push` stop to avoid data loss. Run `npx prisma db push --accept-data-loss`
  against Neon once, then redeploy.
- **Arabic PDF** uses bundled `backend/src/assets/Amiri-*.ttf` (Windows Arial is
  absent on Vercel's Linux). All Arabic text MUST use the Amiri font handles or it
  renders as garbled Latin.

---

## 9. The three product sections

### 9a. RMU — coding system + assembly engine

The heart is **`backend/src/domain/assembly.ts`**. One config drives everything:

- **`RmuConfigInput`** — the inputs (productType PRAL|PSEC, lbsBrand, clientSpec,
  voltageKv 12|24, nalCount 2–5 = ring feeders "R", nalfCount 0–2 = transformer
  feeders "T", hasMetering, rtuType NONE|TYPE1|TYPE2, installation, busbar, fuse,
  metering options).
- **New coding system** — `buildProductCode(c)` → e.g. **`PSEC10AB12R3T1M`**:
  `{family}{client}{type}{brand}{kV}R{rings}T{transformers}{M|W}`
  - family = PSEC|PRAL; client = EECH→1 / KAHRABA→2; type = Smart(any RTU)→9 /
    Standard→0; brand code AB/MG/SH/GY/GL; M=metering / W=without.
- **Old code** — `buildPanelCode` → `P-RAL12N3F1M1` style, kept ONLY as the
  **price-list lookup key** (`buildPriceKey` → `PRICE_LIST` in `priceList.ts`).
- **Data-availability gating** — we only generate offers for brand/spec combos we
  actually have technical + price data for. Implemented in BOTH the UI (locked
  options, shown greyed with 🔒) and the backend (Zod refine → 400):
  - `AVAILABLE_BRANDS_BY_FAMILY` = `{ PSEC: [ABB, MURGE], PRAL: [ABB] }`
    (Schneider/JGGY/GRL are defined but **locked** — no data).
  - `AVAILABLE_CLIENT_SPECS` = `["EECH"]` (KAHRABA **locked** — no tech offer).
  - **Principle:** never fabricate one brand/spec's data from another's.
- `assembleOffer(config)` returns the full technical content (general + electrical
  data rows, cubicle lineup, notes, communication, summary). The PDF/UI just render
  this — no logic in the view.

PDFs: `pdf.service.ts` (technical A4), `pdf-commercial.service.ts` (bilingual
EN/AR, VAT 14%, terms from `commercialContent.ts`), `pdf-sld.service.ts` (A3
landscape single-line diagram, PSEC only).

### 9b. Kiosk — PCSS design selector

Client-side. **`frontend/src/kiosk/`**:
- `catalog.ts` — 9 P-CSS designs (5ST-A/B/C, 10ST-I/J/K, 16ST-U/V/W) with
  outer/inner dims, TR depth, weight, and the RMU↔design compatibility matrix;
  the 6 "most-used" designs drive the selector. Plus RMU types, **PCSS power
  ranges** (0–500 / 500–1000 / 1000–2000 kVA — these were "TR power" originally;
  labels say PCSS, ids stay 500/1000/1500 so logic is unchanged), LV panels
  (175/210/230 cm with usable mm), breakers XT1–XT7 (XT7=210 mm), IEC gap 60 mm.
- `engine.ts` — `getAllowedLvPanels`, `checkDesignCompatibility`, `spaceInfo`,
  `evaluate` (ported faithfully from the client's validated `PCSS SELECTION.html`).
- `KioskSelectorPage.tsx` — 6-step wizard + live output: compatible design cards,
  breaker **space bar** (two of them — one in the breaker step, one in the output
  pane), and a tiered **"Special Kiosk"** warning when the breaker layout exceeds
  the panel width (offers "upgrade to next range" except at the top tier).
- Source data: `PCSS Designs.xlsx` (catalog) + `PCSS SELECTION.html` (workflow).

### 9c. LV — panel configurator (QTN workflow)  ← newest / largest

Client-side, organised like the original Excel configurator (`Configurator-V0-001
(2).html`), driven by master workbooks (`QTN-26-0000 V15.3.xlsx`, `Combinations
Database.xlsx`) and four requirement docs (`RPT-01..04`).

**Flow:** `/lv` is a **list of QTNs**. "+ New QTN" creates a numbered quotation
(`QTN-26-0001`, auto-increment) and opens **`/lv/qtn/:id`** — a workspace with
tabs:

| Tab | File section | Purpose |
|---|---|---|
| Project | `ProjectTab` | cover-page data; sales-person dropdown auto-fills mobile/email; editable staff lists (RPT-01) |
| Pricing Settings | `PricingTab` | EUR/USD/copper rates, operations, selling factor, **ABB-only discount**, VAT |
| Panels | `PanelsTab` + `PanelEditor` | the configurator (details, **Panel type**, **Circuit combinations**, **Components**) |
| Technical Offer | `TechnicalTab` | generated document, **one page per panel** (red item bar + spec grid + Qty/Description/Reference/Brand/Poles table) → print to PDF (all panels in one PDF) |
| Commercial Offer | `CommercialTab` | per-panel prices, subtotal, VAT, total → print to PDF |
| Material List | `MaterialTab` | 7 aggregated tables + **ABB-only / Full** toggle (RPT-04) |

**Inside a panel (order matters):**
1. **Panel details** — name, fed from, qty, incoming C.B rating (A), amb temp,
   neutral/earth, copper, in/out cables, form, main busbar Cu, designation.
   *(Enclosure family/sizing were removed from here — they live in Panel type.)*
2. **Panel type** (`SizingCard`, was "Sizing & Copper") — choose **Panels** or
   **Cells**, then **select ONE item** (single selection, replace-on-pick):
   - Panels: Single layout = 1 enclosure; Double layout = 2 slots (#1 + #2,
     SR-Basic/Unikit only, 2nd width 60/80) — RPT-02.
   - Cells: Pro-E (depth 70/90, thickness 1.5/2 mm, IP65/IP31 — **IP31 locked at
     90 cm + 2 mm**; IP/2M item-naming rules), IS2 (60/80), PLP (70/90/110).
   - The **800 A rule**: incoming C.B > 800 A → Panels disabled, cells only.
3. **Circuit combinations** (`CombosCard`) — predefined assemblies generated from
   the database, then fully editable:
   - **ATS** (1oo2 / 2oo3; 2oo4 locked = no template data) — pick C.B(1), the rest
     auto-fill with the same breaker (editable); frame detected from breaker family;
     pulls the full BOM (source accessories, interlock, control circuit) per
     `combos.json`.
   - **Photocell** — pick C.B rating → contactor + aux auto-selected; fixed
     components added.
   - **MCC** — DOL-3Ph/DOL-1Ph/Star-Delta × kW × Type → parts; optional control acc.
   - **PFC** — kVAR + fixed/var steps (Phase-1: 400 V, 25/50 kVAR only) → capacitors,
     fuses, bases, contactors, controller.
   - **WD** — withdrawable fixed-part + moving-part kit per frame/poles.
   - Each combination previews, then "Add N items" drops them into the active
     section, tagged with the combo name, still editable (qty/Adj/Comment/Note/remove).
4. **Components** (`ComponentsCard`) — search the 2,124-item DB (name/ref/type/
   rating) → add to the active section. Sections are tabs (Main Incoming /
   Outgoings / Metering / Other + custom). Per-row: Qty, **Adj.** (adjustable
   rating), **Comment**, **Note**, move up/down (order shows in the Technical
   offer), remove (all RPT-01).

**Pricing/calc** (`lv/store.ts` `calcPanel`): componentCost + enclosureCost +
copperConn (cuWeight×copperRate) + busbar + kits (enclosure×(0.02+formFactor),
0 for Minicenter/Primo); ×(1+operations); ÷factor = selling; ×panel qty.
ABB discount applies to ABB-brand items only.

**Material List** (`buildMaterialList`): aggregates every component across all
panels × panel qty, groups by reference, splits into 7 tables: ABB Products /
Other Suppliers / PLP Cells / ABB Enclosures / IS2 / Copper (total kg) / Pro-E.

---

## 10. Design system (Tailwind)

Theme in **`frontend/tailwind.config.js`** (Powerline orange on a warm palette):
- Colors: `brand` (#ff6600) + `brand-dark/darker/light/tint`, `accent`, `ink`
  (text), `muted`, `line` (borders), `surface` (bg), `sidebar` (dark).
- Radius `xl2` (14px); shadows `soft/lift/glow`.
- Animations: `fade-up`, `fade-in`, `slide-in`, `pop`, `bar-grow`, `shimmer`,
  **`blink`** (used for the "NEW" nav badge).

Component classes in **`frontend/src/index.css`** (`@layer components`):
`.label .input .btn .btn-primary .btn-ghost .card .section-title .sec-head .chip
.code-chip .nav-item .nav-item-active`, plus `.skeleton`, and the **print CSS**
(`@media print` → only `.print-area` is visible; `.no-print` and the sidebar are
hidden) that powers the LV/RMU "PDF / Print" export.

Reusable inputs: **`frontend/src/components/fields.tsx`** (`Field`, `TextInput`,
`NumberInput`, `Select`, `Segmented`, `Toggle`, `Checkbox`) — `Select`/`Segmented`
support `disabledOptions` (greyed + 🔒), used for the data-availability locks.

Match this theme for any new UI. When adding a section to the nav, edit
`options.ts` `PRODUCT_CATEGORIES` (key/label/ready/blurb) and `App.tsx` (icon +
the blinking NEW badge condition).

---

## 11. Data importers & source files

**LV importer:** `frontend/scripts/lv-import.cjs` converts the master workbooks
into `frontend/src/lv/data/*.json`. Re-run when a new QTN/Combinations version
arrives:

```bash
cd frontend
node scripts/lv-import.cjs "<path>/QTN-26-0000 Vxx.xlsx" "<path>/Combinations Database.xlsx"
```

It reads xlsx with a tiny built-in parser (needs `unzip` on PATH; xlsx = zip).
**Data-quality fixes baked into the importer** (don't lose these on a rewrite):
- Excel mixes NBSP (U+00A0) and normal spaces — normalised in `decode()`.
- "Control" rows are hand-priced EGP lumps typed in the euro column (Photocell 200,
  Control Circuit 1oo2 13 000…) → moved euro→egp.
- The `poles` column carries stray codes on non-breaker rows → clamped to 1–4.
- Cell-system enclosures (Pro-E/IS2/PLP/Pillars/Coffree) aren't in "Panels Data";
  they're seeded from `enclosures-extra.json` and merged.

**Source files** (these live in `C:\Users\eldeeb\Downloads\` on the original PC —
they are **NOT in the repo**; the imported JSON is). To re-import on the new PC,
copy these alongside:
- LV: `QTN-26-0000 V15.3.xlsx`, `Combinations Database.xlsx`,
  `Configurator-V0-001 (2).html` (sample UI — study only),
  `RPT-01 (Fields).docx`, `RPT-02 (Panels).docx`,
  `RPT-03 (Circuit Combination).docx`, `RPT-04 (Material List).docx`.
- Kiosk: `PCSS Designs.xlsx`, `PCSS SELECTION.html`.
- RMU: `RMU Codes.xlsx`, `RMU Coding System.pdf` (defined the new code format).

If you only need to edit behaviour/UI, you don't need the source files — the
committed JSON is the working data.

**PDF inspection (debug):** `backend/render-pdf.mjs` renders a PDF page to PNG via
mupdf — `node render-pdf.mjs <pdf> <page> <scale> <out.png> [cropX cropY cropW cropH]`.

---

## 12. Conventions & workflow rules

- **Work locally; push/deploy only when explicitly told.** (Standing rule from the
  owner. The new Claude should NOT push or deploy unless asked.)
- **Always finish a change with a clean build** before committing:
  `cd frontend && npm run build` (runs `tsc -b && vite build`).
- **Commit `schema.prisma` as `sqlite`** (see §7/§8).
- After responses, the owner likes a quick **localhost link** to try it
  (http://localhost:5173/...).
- Data-availability gating principle (RMU): never fabricate one brand/spec from
  another; lock what has no data in BOTH UI and backend.
- Keep new code in the existing style (Tailwind classes, the `fields.tsx`
  primitives, file naming `XxxPage.tsx`, domain logic in `*/engine.ts` or
  `*/store.ts`, data in `*/data/*.json`).

---

## 13. Known gotchas / environment quirks

- **Vercel CLI was broken** on the original Windows machine → use
  `tools/pl-deploy.cjs` (or set up Git auto-deploy). On a healthy machine the CLI
  is fine.
- **PowerShell tool unavailable** in the original Claude session → used Bash/node.
- **nodemon flaky on Windows** → kill node + restart.
- **HMR transient errors**: while editing, Vite HMR can momentarily render a broken
  intermediate file and log a React error to the console with an OLD `?t=…`
  timestamp. A fresh full reload of the final code is clean — don't chase these if
  the production build passes and a reloaded page renders fine.
- **Git warns "LF will be replaced by CRLF"** on Windows — harmless.
- **Vite bundle >500 kB warning** — the LV component DB (~485 kB JSON) is bundled,
  so the chunk is large. Fine for now; code-split later if desired.
- **localStorage keys:** LV QTNs `powerline-lv-qtns-v1` (older single-state
  `powerline-lv-v1` auto-migrates to QTN #1 on first load).
- When editing with an AI tool: if a file was changed by a script, re-read it
  before editing (stale edit-cache).

---

## 14. Roadmap / likely next steps

- **LV → backend persistence:** move QTNs from `localStorage` into the database
  (new `Quotation`/`LvPanel` Prisma models + API) so they sync across devices/users
  and can be listed like RMU offers. Biggest pending item.
- **LV Technical/Commercial PDFs server-side** (like RMU) for pixel-perfect output
  matching the company's reference offer format, instead of browser print.
- **LV pricing Phase 2:** PFC beyond 400 V / 25–50 kVAR; busbar auto-sizing from
  the QTN "Copper Tool" sheet; Pro-E/IS2 part-level BOM explosion.
- **Kiosk → offers:** turn a selected P-CSS design into a saved offer + PDF + price.
- **ATS Phase 3:** 2-out-of-4 and mixed-breaker ATS combinations (templates pending).
- **Connect Git auto-deploy** on Vercel so pushes deploy automatically.

---

## 15. Secrets

Secrets are **not** committed. They are in **`HANDOFF.secrets.md`** (gitignored).
**Copy that file manually** to the new machine (USB / password manager / paste),
it does not travel with `git clone`.

It contains:
- Vercel **token** (for `tools/pl-deploy.cjs`) — *verify it's still valid; if
  revoked, generate a new one at vercel.com → Settings → Tokens.*
- Vercel **team id** (`team_d6sWJ5oTSYuVB70PvMvzfS9D`).
- Notes on the **Neon** database (the connection URLs are stored as env vars in the
  Vercel project — you normally don't need them locally; local dev is SQLite).

> If you can't find `HANDOFF.secrets.md`, you can still **develop and build**
> everything locally without any secrets (local is fully offline). You only need
> the token to run a *manual* deploy — and Git auto-deploy removes even that.
