# PowerLine — Architecture Reference

**Authoritative as of 2026-08-12, HEAD `b791f41`.** This document replaces `HANDOFF.md`
(14 Jun 2026), which predates ~130 commits — accounts, the approval workflow, the Access Center,
Co-Work, Standard EDMS panels, the ERP export and the whole DB-backed price book. `HANDOFF.md`,
`README.md`, `ONBOARDING.md`, `pricing/README.md` and `DEPLOY.md:84-86` all contain claims that are
now false; where they disagree with this document, this document was read out of the code.

> ### Changed since this audit was written — read this first
>
> 1. **The Excel price masters are gone** (commit `c98befe`, 2026-08-12). `pricing/RMU-Pricing.xlsx`,
>    `pricing/LV-Pricing.xlsx`, `pricing/README.md`, `tools/pricing-import.cjs`,
>    `tools/pricing-export.cjs` and `update-prices.bat` were deleted. Prices are edited **only** on
>    the `/pricing` screen. Anywhere below that describes the spreadsheet workflow is history.
>    `backend/src/data/rmu-pricing.json` survives as the cold-start / kill-switch fallback **and is
>    behind the live price book** — a `PriceBook.source` flip to `"json"` would serve July prices.
> 2. **`SMTP_*` really is configured in Vercel.** Section 12 and `OPEN-ISSUES.md` item 2 say the live
>    site cannot send e-mail; that was checked against Vercel on 2026-08-12 and all six variables are
>    present for production and preview. Only **`APP_URL`** is genuinely missing. (Whether the Google
>    app password behind `SMTP_PASS` is still valid was not verified.)
> 3. **Vercel git auto-deploy is connected and working** — a push to `main` ships. Verified by matching
>    the live bundle hash against a local build.
>
> Working rules for whoever is editing live in `CLAUDE.md`; plain-language project guide in
> `HANDOFF.md`; what the other side did most recently in `TEAM-LOG.md`.

**Repo root: the folder containing this file.** On the original machine that is
`D:/Eng.Mohamed-Elgazzar/Documents/Desktop/PowerLine`; on a fresh clone it is wherever you cloned to.
File paths below are relative to it. (On the original machine only, a sibling folder
`Desktop/PowerLine App` is a stale scratch copy — never edit or build there.)

There are **no automated tests anywhere in the repository** (no `*.test.ts`, `*.spec.ts`, no test
runner in either `package.json`). Every change is validated by hand.

---

## 1. What the app is, who uses it, and the state of each section

PowerLine is an internal quotation tool for an Egyptian switchgear manufacturer. Sales-support
engineers configure electrical equipment, the app derives a full technical specification and a
price, and it produces the customer-facing PDFs. It runs as one Vite/React SPA plus one Express API,
deployed same-origin on Vercel.

**Users** (all `@powerline.com.eg`, self-signed-up):

| Who | What they do |
|---|---|
| Sales-support engineer / estimator | Builds LV quotations (QTNs) and RMU offers; the bulk of daily use |
| Team leader / section head | Approves or returns QTNs, hands them over, views everyone's work |
| Tendering | Edits a QTN while it waits for approval |
| Price admin (`prices.edit`) | Edits the price book, imports the ABB spreadsheet, publishes |
| Admin (`access.manage`) | Access Center: assigns roles and permissions |

**Section-by-section state:**

| Section | Route | State |
|---|---|---|
| **LV switchgear** (`LvQtn`) | `/lv`, `/lv/qtn/:id` | **Mature and the main money-maker.** Full workspace: project data, pricing factors, specs + attachments, panels/cells, 11 circuit-combination generators, Standard EDMS house panels, auto enclosure sizing for LCP/KWHM, Material List, Technical + Commercial offer PDFs (client-side jsPDF), ERPNext CSV, Outlook draft. Server-side approval workflow, Co-Work, hand-over, audit trail. |
| **RMU / MV** (`Offer` + `RmuConfig`) | `/rmu`, `/offers/new`, `/offers/:id` | **Working but deliberately thin.** One panel per offer, 4-tab form, live server preview, three server-rendered PDFs (technical / commercial EN-AR / A3 SLD). **No approval workflow, no edit, no sharing** — the record is created as a side effect of pressing a download button. `status` is hard-wired `"DRAFT"`. |
| **P-CSS** (packaged substation) | `/kiosks` | **Calculator only.** A 7-step wizard that sizes the LV compartment and picks a blueprint. **No backend calls, no persistence, no pricing, no export** — a refresh loses everything. Shipped Aug 2026 as a rebuild of the owner's standalone HTML tool. |
| **Price book** | `/pricing` | **Live and DB-backed.** Draft → publish → immutable snapshot; a publish reaches quotations within 10 s with no deploy. LV writes auto-publish; RMU writes wait for the button. LV bulk update is an Excel preview/apply flow. Prices/poles/copper weights are **read-only** in the screen — Excel import only. |
| **Accounts & access** | `/access` (Admin only) | **Live.** E-mail + 6-digit code sign-up, 30-day JWT, tier + 14 permission keys, named role presets, in-app notification inbox with best-effort SMTP e-mail, audit trail. **SMTP is not configured on Vercel**, so on the live site sign-up verification, password reset and every workflow e-mail are dead (`OPEN-ISSUES.md §2`). |

Three product families exist for RMU: `PRAL` (air-insulated, ABB NAL/NALF), `PSEC` (SF6, ABB or
Murge G-Sec) and `LUCY` (SF6 circuit-breaker, Lucy Electric AEGIS PLUS, fixed 8-configuration
catalogue).

---

## 2. How to run, build, test and deploy

Windows dev box. Node from `%ProgramFiles%\nodejs`. There is **no root `package.json`** — the two
halves are installed separately.

### 2.1 First run (local)

```
cd backend
copy .env.example .env
npm install                 # postinstall: db-setup.js (sqlite) + prisma generate + db-push-vercel.js (no-op locally)
npx prisma db push          # REQUIRED — creates the SQLite tables
npm run db:seed             # optional; creates one sample RMU offer and nothing else
npm run dev                 # nodemon → ts-node src/index.ts → http://localhost:4000

cd ../frontend
npm install
npm run dev                 # vite → http://localhost:5173, proxies /api → localhost:4000
```

Then sign in and press **"Set up the price list"** on `/pricing` — until you do, the app serves the
bundled JSON price list only (see §7.2).

**`start-app.bat` is broken for a fresh database.** It runs `npx prisma migrate deploy`
(`start-app.bat:24`) and **there is no `backend/prisma/migrations/` directory**, so it creates no
tables and the following `db:seed` fails. Use `npx prisma db push`. It also opens two visible
`cmd /k` windows, contrary to the standing "no pop-up terminals" preference. `stop-app.bat` is
`taskkill /F /IM node.exe` — it kills **every** Node process on the machine.

### 2.2 Commands

| Task | Command | Notes |
|---|---|---|
| Backend dev | `cd backend && npm run dev` | `nodemon.json` watches `src` + `prisma`; editing `schema.prisma` restarts the server but does **not** re-run `prisma generate` — do that by hand |
| Backend build | `cd backend && npm run build` | `tsc -p tsconfig.json` → `dist/`. **`backend/api/index.ts` is outside `rootDir` and is not built** (Vercel compiles it) |
| Backend start (built) | `cd backend && npm start` | `node dist/index.js`. `backend/dist/` is stale (it still contains a removed `support.controller.js`) — always build first |
| Frontend dev | `cd frontend && npm run dev` | port 5173 |
| Frontend build | `cd frontend && npm run build` | `tsc -b && vite build`. **Vercel runs `vercel-build` = `vite build` only, so type errors do not fail a deploy** — run this locally before pushing |
| Schema sync (local) | `cd backend && npx prisma db push` | Never `npm run prisma:migrate` — it would create a `migrations/` folder this project's deploy path does not use |
| Tests | *none exist* | |
| Regenerate Prisma client | `cd backend && npx prisma generate` | after any schema edit |
| First admin | `cd backend && node scripts/make-admin.js someone@powerline.com.eg` | `--list` prints effective access for every account. Writes `tier: "ADMIN"` + the same `PriceChange` audit row the Access Center writes. **The only supported way to create the first Admin** |
| SMTP check | `cd backend && node scripts/test-smtp.js [to@addr]` | verifies connect+login, optionally sends one real message |
| One-off LV data fix | `cd backend && node scripts/fix-ats-brands.js` | TruONE pole counts, P.F.C → Hitachi, timers → Theben. Writes **no** `PriceChange` rows; press "Update price list & database" afterwards |
| PDF visual QA | `node backend/render-pdf.mjs <pdf> <page> <scale> <out.png> [cropX cropY cropW cropH]` | **`mupdf` is not a dependency** — needs an ad-hoc `npm i mupdf`. Crop values are PDF points; page is 1-based |
| Excel price masters | `node tools/pricing-import.cjs [rmu\|lv\|all]` / `pricing-export.cjs` | Requires `frontend/node_modules` (`xlsx` is a frontend dep). **These only change the bundled fallback, not live prices** — see §7.6 |
| One-click Excel update | `update-prices.bat` | import + optional `git add`/`commit`/`push origin main`. The only thing in the repo that pushes to `main` automatically |

### 2.3 Deploy

Normal path: **`git push origin main`** → Vercel auto-deploys. `vercel.json` (`version: 2` +
`builds`) drives everything and the Vercel dashboard's install/build commands are ignored.

1. `@vercel/static-build` on `frontend/package.json` → `vercel-build` (`vite build`) → static files.
2. `@vercel/node` on `backend/api/index.ts`, with
   `includeFiles: ["backend/src/assets/**", "backend/node_modules/.prisma/client/**"]`.
   Dropping the first entry silently blanks every logo, the RMU cover photo, the SLD metering
   bitmap and all Arabic text; dropping the second gives "Prisma query engine not found".
3. `backend` `npm install` → `postinstall`:
   `db-setup.js` (rewrites the `datasource` block to `postgresql` + `directUrl` because `VERCEL` is
   set) → `prisma generate` → `db-push-vercel.js` → `npx prisma db push --skip-generate
   **--accept-data-loss**`.
4. Routes: `/api/(.*)` → the function; `/(.*\.[a-zA-Z0-9]+)` → `frontend/$1`; `/(.*)` →
   `frontend/index.html` (SPA fallback).

**Every `process.env` value is read at module load. Changing an env var in the Vercel dashboard does
nothing until you redeploy.**

Alternative: `node tools/pl-deploy.cjs` (needs `VERCEL_TOKEN` + `VERCEL_TEAM`, values in the
untracked `HANDOFF.secrets.md`). It uploads `git ls-files` paths read from the **working tree** and
always creates a **production** deployment — i.e. it can publish uncommitted changes.

### 2.4 Environment variables (every one the repo reads)

| Variable | Read at | If unset |
|---|---|---|
| `DATABASE_URL` | `schema.prisma:20`, `scripts/db-push-vercel.js:11` | Prisma throws → every route 500s. **In the Vercel build, `db push` is skipped with only a warning and the deploy succeeds with no tables** — the #1 "deployed and everything is broken" cause |
| `DIRECT_URL` | written into the pg datasource by `scripts/db-setup.js:24` | With `provider = postgresql`, Prisma fails to load the schema |
| `DB_PROVIDER` | `scripts/db-setup.js:20` | sqlite locally |
| `VERCEL` | `db-setup.js:20`, `db-push-vercel.js:6` | absent locally (intended) |
| `PORT` | `src/index.ts:4` | 4000 |
| `CORS_ORIGIN` | `app.ts:78-79`, `email.service.ts:149` | dev `*`; **production: cross-origin disabled (`false`)** — fine, the frontend is same-origin |
| `NODE_ENV` | `app.ts:80`, `lib/prisma.ts:13`, `lib/auth.ts:12`, `auth.controller.ts:32`, `email.service.ts:73` | **Not `"production"` ⇒ `POST /api/auth/dev-login` mints a token for the oldest account and one-time codes are echoed in API responses. Never deploy without `NODE_ENV=production`** |
| `JWT_SECRET` | `lib/auth.ts:10` | Production: **throws at module load**, whole API dead. Dev: falls back to `"powerline-dev-secret-change-me"` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | `email.service.ts:11-13` | **All three required**; a partial config counts as unconfigured and logs a loud boot warning. Mail disabled |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_FROM` | `email.service.ts:35,38,50` | 587 / STARTTLS (only the exact string `"true"` enables implicit TLS) / `SMTP_USER` → `no-reply@powerline.com.eg` |
| `APP_URL` | `email.service.ts:149` | Falls back to `CORS_ORIGIN`, then the request's own origin from `x-forwarded-host` — spoofable. **Set it in production** |
| `OTP_TTL_MINUTES` | `auth.controller.ts:28` | 10 minutes |
| `SIGNUP_EMAIL_DOMAIN` | `validation/auth.schema.ts:4` | `powerline.com.eg` |
| `PRICE_BOOK_TTL_MS` | `domain/pricing-data.ts:48` | 10 000 ms |
| `VERCEL_TOKEN` / `VERCEL_TEAM` | `tools/pl-deploy.cjs:17-18` | script exits 1 |
| `VITE_MSAL_CLIENT_ID` / `VITE_MSAL_TENANT` | `frontend/src/lv/outlookGraph.ts` | `graphConfigured()` false → "Send to sales" falls back to Share sheet, then `mailto:` |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | **present in `backend/.env`, read by no code** | Nothing breaks. Dead config from a removed AI support chat — delete and rotate |

`backend/.env` (gitignored, present in the working tree) holds a live Google App Password for
`verification@powerline.com.eg` that `OPEN-ISSUES.md §5` already flags for rotation.

---

## 3. Repository map

### Root

| Path | Purpose |
|---|---|
| `vercel.json` | The whole deploy definition: two builds, `includeFiles`, SPA routes |
| `update-prices.bat` | One-click Excel → JSON price import + optional commit/push to `main` |
| `start-app.bat` / `stop-app.bat` | Owner's launchers. Both broken/blunt — see §2.1 |
| `.claude/launch.json` | Dev-server definitions for the harness Browser pane (backend 4000, frontend 5173) |
| `OPEN-ISSUES.md` | **Current and mostly accurate** (6 Aug 2026). Item 1 (22 zero-pole components) is partly stale — the Excel import *can* now apply `poles` |
| `DEPLOY.md` | Accurate except `:84-86`, which claims destructive schema changes stop the build. They do not — `--accept-data-loss` is unconditional |
| `HANDOFF.md`, `README.md`, `ONBOARDING.md`, `pricing/README.md` | **Stale. Do not trust for prices, workflow, access or accounts.** |

### `backend/`

| Path | Purpose |
|---|---|
| `api/index.ts` | Vercel entry: `createApp()` exported as the handler. Does **not** import `dotenv/config` |
| `src/index.ts` | Local entry: `dotenv/config`, `app.listen(PORT ?? 4000)` |
| `src/app.ts` | `createApp()` — **the single source of truth for the URL surface**. Almost every route is declared inline here (only auth/qtns/offers are route files) |
| `src/lib/prisma.ts` | The one shared `PrismaClient`, cached on `globalThis` when `NODE_ENV !== "production"` |
| `src/lib/auth.ts` | `JWT_SECRET`, `JWT_EXPIRES = "30d"`, `hashPassword` (bcrypt cost **12**), `signToken`, `verifyToken`, `genCode()` (6 digits from `crypto.randomInt`) |
| `src/lib/http.ts` | `pub(user)` — the only user projection sent to a client; `fail(res, err)` — ZodError → 400, everything else → 500 `"Server error."` |
| `src/middleware/auth.ts` | `readToken` (Bearer, or `?t=` **for GET/HEAD only**), `requireAuth`, `optionalAuth` |
| `src/middleware/roles.ts` | The whole permission model: `PERMS`, `TIERS`, `ROLE_PRESETS`, `accessOf()`, `requirePerm()`, `requirePriceViewer/Admin`, `requireOwner` |
| `src/middleware/priceBook.ts` | `withPriceBook` (refresh + `X-PriceBook-*` headers); `requireFreshPriceBook` — **exported and mounted nowhere** (verified by grep) |
| `src/controllers/auth.controller.ts` | register / verify / complete / login / dev-login / forgot / reset / me; in-process rate limit |
| `src/controllers/account.controller.ts` | profile, personal history, weekly stats, estimator evaluation, **stale-price scan** |
| `src/controllers/access.controller.ts` | Access Center: `me`, `catalogue`, `users`, `setAccess`, `history` |
| `src/controllers/notifications.controller.ts` | in-app inbox (list / read / read-all) |
| `src/controllers/qtns.controller.ts` | **916 lines, 20 handlers** — LV quotation CRUD, workflow transitions, Co-Work merge, hand-over, audit, attachments |
| `src/controllers/offers.controller.ts` | RMU offer create/read/delete/preview + the three PDF routes |
| `src/controllers/pricing.controller.ts` | RMU price editing, seeding, **publish**, history, undo, legacy user-role screen |
| `src/controllers/pricing-lv.controller.ts` | LV catalogue rows, facets, settings, chunked seed, `buildLvPayload`, `GET /api/catalog/lv[/changes]` |
| `src/controllers/pricing-lv-import.controller.ts` | Spreadsheet preview → parked batch → apply |
| `src/controllers/abb.controller.ts` | Scrapes `new.abb.com` for a product data sheet and streams the PDF |
| `src/domain/standards.ts` | RMU constant data: `PRODUCTS`, `RATINGS` (per family × kV), `RTU_LABEL`, RTU predicates, `GENERAL`, `GENERAL_NOTES` |
| `src/domain/assembly.ts` | **The RMU engine** — `assembleOffer()`, both code builders, `buildPriceKey`, the bills of material |
| `src/domain/lucy.ts` | The Lucy AEGIS PLUS family: 8 fixed configs, its own assembler |
| `src/domain/priceList.ts` | `priceForConfig()` — base price + add-ons + `found` |
| `src/domain/pricing-data.ts` | **The price provider**: `BUNDLED`, `refreshPriceBook()`, four synchronous getters, `vatPct()` |
| `src/domain/commercialContent.ts` | Bilingual EN/AR commercial boilerplate, transcribed from offer QTN-26-00992. **Arabic must stay in logical order** |
| `src/domain/qtnStatus.ts` | The **LV** approval state machine. Only module allowed to write `status`/`submitted`/`submittedAt` |
| `src/services/offer.service.ts` | Offer persistence, `nextOfferNumber()`, the **price snapshot** freeze, `resolvePricing()`, `decorate()` |
| `src/services/commercial.service.ts` | `buildCommercial()` — line items, discount, VAT |
| `src/services/pricing.ts` | `computePricing()` (qty × unit − discount, **no VAT, no add-ons**), `round2` |
| `src/services/pdf.service.ts` | Technical offer PDF (A4, PDFKit, hand-positioned) |
| `src/services/pdf-commercial.service.ts` | Commercial offer PDF, bilingual, 5 fixed pages, Amiri Arabic |
| `src/services/pdf-sld.service.ts` | **1118 lines** — the A3 single-line-diagram drawing set. The most fragile file in the repo |
| `src/services/price-seed.service.ts` | `buildRmuPayload()`, `diffAgainstBundle()`, `seedRmuFromBundle()` |
| `src/services/email.service.ts` | nodemailer wrapper + branded inline-CSS templates + `appUrl`/`originOf` |
| `src/services/notify.service.ts` | `notify()`, `notifyAll()`, `approverIds()`. The `Notification` row is the record of truth; e-mail is best-effort |
| `src/validation/*.schema.ts` | Zod. `auth` (company-domain rule), `account` (photo data-URL), `qtn` (attachment limits), `offer` (the only RMU gate) |
| `src/data/rmu-pricing.json` | The bundled RMU master (USD, `vatPct: 14`, 46 panel keys). **Generated — do not hand-edit** |
| `src/assets/` | `logo.png`, `logo-footer.png`, `product-rmu.png`, `metering-ref.png` (the whole SLD metering sheet is this bitmap), `Amiri-Regular/Bold.ttf` + OFL |
| `prisma/schema.prisma` | 535 lines, 18 models. **The `datasource` block is machine-written by `scripts/db-setup.js` — never hand-edit it** |
| `prisma/seed.ts` | Creates one sample offer and nothing else. Stale (`rtuType: "READY1"` vs a stale schema comment) |
| `scripts/db-setup.js` | sqlite ⇄ postgresql datasource rewrite, from `postinstall` |
| `scripts/db-push-vercel.js` | On Vercel: `prisma db push --skip-generate --accept-data-loss` |
| `scripts/make-admin.js` | Break-glass admin grant |
| `scripts/test-smtp.js` | SMTP diagnostics with Google-specific hints |
| `scripts/fix-ats-brands.js` | One-off surgical `LvComponent` repair |
| `render-pdf.mjs` | Dev-only PDF → PNG rasteriser (needs an out-of-tree `mupdf`) |

### `frontend/`

| Path | Purpose |
|---|---|
| `index.html` | Pre-paint theme script (must stay in sync with `src/theme.ts`) + the boot splash |
| `vite.config.ts` | Port 5173, `/api` → `http://localhost:4000`. **The only way `/api` works locally** — there is no `VITE_API_URL` |
| `tailwind.config.js` | `darkMode: ["selector", '[data-theme="dark"]']`, brand `#F16722`, radius `xl2 = 14px`, `flash-new 6s` |
| `postcss.config.js`, `tsconfig.json` | tailwind+autoprefixer; `strict`, `noUnusedLocals/Parameters` |
| `src/main.tsx` | Bootstrap + the whole route table + the `Gate` login wall. Calls `installCachedCatalog()` **at module scope before `createRoot`** |
| `src/App.tsx` | Shell: sidebar (3-state pin), nav, `NotificationBell` (60 s poll), theme toggle, profile |
| `src/api.ts` | **The single HTTP client** (677 lines): token storage, `request()`, 401 → clear + reload, `pdfLink()`, every DTO type, every endpoint wrapper |
| `src/auth/AuthContext.tsx` | `AuthProvider`, `useAuth`. `signOut()` only drops the local token — no server logout |
| `src/theme.ts` | `light`/`dark`, `localStorage["powerline-theme"]` |
| `src/index.css` | Design tokens (`--c-*` as RGB triples), component classes, **the print/PDF contract** |
| `src/types.ts` | RMU API shapes, mirroring the backend domain |
| `src/options.ts` | RMU dropdown data + the brand/client-spec availability gates |
| `src/staff.ts` | Shared staff registry, `localStorage["powerline-staff-v1"]`. **Per-browser, never synced** |
| `src/hooks/useAutoRefresh.ts` | Polling hook that never runs on a hidden tab; `useChangedKeys` (6 s flash) |
| `src/components/fields.tsx` | `Field`, `TextInput`, `NumberInput` (**emits `NaN` when empty**), `Select`, `Segmented`, `Toggle`, dead `Checkbox` |
| `src/components/NewQtnPicker.tsx` | Desk-scoped "new quotation" picker (LV panels / EDMS / RMU / P-CSS) |
| `src/components/QtnNumberInput.tsx` | `QTN-YY-` prefixed input (prefix is a hint, not enforced) |
| `src/components/CoWorkModal.tsx`, `ReassignQtnModal.tsx`, `ReturnForRevisionModal.tsx`, `EdmsStandardWarningModal.tsx`, `RedPriceAlert.tsx` | The five shared modals; all portalled to `document.body` |
| `src/components/OfferView.tsx`, `CommercialView.tsx` | RMU technical / commercial renderers |
| `src/pages/AuthPage.tsx` | Login / sign-up / reset. `COMPANY_DOMAIN` is **hardcoded** here |
| `src/pages/HomeDashboard.tsx` | Approval inbox, QTN history, stale-price alarm, performance panel, Access Center button |
| `src/pages/EstimatorEvaluation.tsx` | Four "you vs team median" bar charts |
| `src/pages/AccessCenterPage.tsx` | Role/permission editor + access history. Mirrors `ROLE_PRESETS` client-side |
| `src/pages/LvQtnListPage.tsx` | LV offers history: filters, Amend / Duplicate / Delete |
| `src/pages/LvConfiguratorPage.tsx` | **7568 lines, ~55 module-local components — the QTN workspace.** Contains a literal NUL byte at offset 363835, so ripgrep treats it as binary |
| `src/pages/NewOfferPage.tsx` | RMU 4-tab creation form (780 lines) |
| `src/pages/OffersListPage.tsx`, `OfferDetailPage.tsx` | RMU list and read-only detail |
| `src/pages/PcssSelectorPage.tsx` | The P-CSS wizard (1568 lines) |
| `src/pages/PricingAdminPage.tsx` | Price list screen (908 lines) |
| `src/pages/ComingSoonPage.tsx` | **Dead code** — nothing imports it |
| `src/pricing/LvExcelImport.tsx` | Browser-side workbook parse/export + the preview modal |
| `src/lv/store.ts` | **1331 lines** — the LV state model, `calcPanel()` cost engine, `grandTotals`, Material List, `exportBlockers`, `searchComponents`, LCP/KWHM auto-sizing |
| `src/lv/catalog.ts` | `COMPONENTS`/`ENCLOSURES` (mutated in place), `componentPriceEgp`, `findByName`, cell price index, `externalNeutralCT` |
| `src/lv/catalogSource.ts` | Runtime catalogue swap from `/api/catalog/lv` + `localStorage["powerline-catalog"]` |
| `src/lv/qtns.ts` | QTN data layer + **`normalize()`, every forward-compat migration** |
| `src/lv/combos.ts` | The 11 circuit-combination generators |
| `src/lv/cells.ts` | Pro-E / IS2 / PLP cell tables |
| `src/lv/standardEdms.ts` | The Standard LV EDMS house panels (7 sizes × 4 variants) |
| `src/lv/copper.ts` | Copper Tool maths, CSA ladders, `K = 0.000009` |
| `src/lv/poles.ts` | DIN-rail width summary (`POLE_CM = 1.8`) |
| `src/lv/search.ts` | Generic dropdown ranker |
| `src/lv/technicalPdf.ts` | jsPDF exports driven by `data-pdf-*` DOM hooks |
| `src/lv/materialExcel.ts` | Material List → SheetJS array-of-arrays |
| `src/lv/erpCsv.ts` | ERPNext "Bulk Edit Items" CSV, 56 columns |
| `src/lv/outlookGraph.ts` | MSAL + Graph draft creation (`Mail.ReadWrite`, draft only) |
| `src/lv/data/components.json` | **2133** rows (an `app.ts:148` comment still says 2,121) |
| `src/lv/data/enclosures.json` | **254** rows. **Every row has `H=W=D=0`** — dimensions are parsed out of `name` |
| `src/lv/data/enclosures-extra.json` | 84 hand-authored rows; a build-time input to `lv-import.cjs` only, **not read at runtime** |
| `src/lv/data/factors.json` | The 10 pricing factors + the `forms` map |
| `src/lv/data/combos.json` | `ats`, `photocell`, `mcc`, `wd`, **`motorized`** (the last is absent from the declared type and hand-authored) |
| `src/pcss/data.ts` | The P-CSS catalogue, hand-transcribed from `tools/reference/pcss-selector-source.html` |
| `src/pcss/engine.ts` | `Selection`, width resolver, banding, design compatibility, metering/PF lookups |
| `src/pcss/sizing.ts` | `totalUsedMm`, panel auto-upgrade, `spaceInfo`, `evaluateDesigns` |
| `src/pcss/bom.ts` | Derived (auto) BOM rows — recomputed every render, never stored |
| `scripts/lv-import.cjs` | Original multi-sheet LV importer. **Destructive — see §10** |
| `scripts/lv-import-flat.cjs` | Current single-flat-sheet importer (components + enclosures only) |
| `scripts/lv-import-ats.cjs` | Surgical re-import of `combos.ats` + `combos.wd` only |

### `tools/` and `pricing/`

| Path | Purpose |
|---|---|
| `tools/pricing-export.cjs` | app JSON → `pricing/*.xlsx`. Overwrites unconditionally |
| `tools/pricing-import.cjs` | `pricing/*.xlsx` → app JSON. **Reads RMU sheets by column index** |
| `tools/pl-deploy.cjs` | REST-API Vercel deploy (the CLI was broken on the original dev box) |
| `tools/docx_extract.py` | Word → text/tables, used to transcribe the EEHC offers into `standards.ts` |
| `tools/reference/pcss-selector-source.html` | Provenance for `src/pcss/data.ts`. Not read at build or run time |
| `pricing/RMU-Pricing.xlsx` | 5 sheets. Still consistent with `rmu-pricing.json` |
| `pricing/LV-Pricing.xlsx` | 3 sheets. **Two weeks and 904 identity mismatches behind** the live catalogue |

---

## 4. Data model — every Prisma model, field by field

`backend/prisma/schema.prisma`. Conventions: ids are `String @id @default(cuid())`;
`createdAt @default(now())`, `updatedAt @updatedAt`. **There are no enums** — SQLite has none, so
every enum-like column is a `String` validated only by Zod and the domain code. The house rule,
stated at `schema.prisma:336-338`: every column is nullable or defaulted, because
`prisma db push --accept-data-loss` runs on every deploy with no data step.

### 4.1 `Offer` — one RMU customer offer (`:26-95`)

| Field | Type | Business meaning |
|---|---|---|
| `offerNumber` | String @unique | `PL-{year}-{####}`, max existing + 1 (survives deletions). A duplicate → Prisma `P2002` → HTTP 409 |
| `category` | String = `"RMU"` | `RMU \| KIOSK \| LV`. Only RMU has a configurator |
| `projectName`, `customer` | String | Required, ≤160 chars |
| `status` | String = `"DRAFT"` | `DRAFT \| SENT \| WON \| LOST`. **Set once at create; no update endpoint exists, so `SENT/WON/LOST` are unreachable** |
| `salesNumber`, `orderNumber` | String? | Printed on the SLD title block and drawing cover |
| `quotationNo`, `opportunityNo` | String? | QTN / OPTY numbers on the commercial cover |
| `salesName/Mobile/Email`, `salesManagerName/…`, `supportName/…` | String? | Commercial-cover contact block (nine fields) |
| `currency` | String = `"USD"` | `USD \| EGP` |
| `usdToEgpRate` | Float? | ≤1000. Multiplies USD-sourced numbers only |
| `unitPrice` | Float = 0 | Manual selling price. `> 0` **always wins** over the catalogue price |
| `quantity` | Int = 1 | |
| `discountPct` | Float = 0 | 0-100, applied to the subtotal **including** add-ons |
| `validityDays` | Int = 30 | ≤365. **Never printed** — the PDF uses static boilerplate |
| `deliveryWeeks` | Int? | ≤104. Never printed |
| `paymentTerms` | String? | ≤300. Never printed |
| `warrantyMonths` | Int? | ≤120. Never printed |
| `notes` | String? | ≤2000. Printed only on the SLD cover's Notes rules |
| `offerDate` | **String?** | **Free text, not a date** (max 40 chars). Printed verbatim |
| `ownerId` | String? → User | `onDelete: SetNull`. Set by a **second update** after create, only when a token was present |
| `submittedAt` | DateTime? | RMU offers are "submitted" at creation; feeds the weekly chart |
| `priceBookVersion` | Int? | **Declared, never written, never read.** Dead column |
| `pricedAt` | DateTime? | Set at create. `null` ⇒ legacy row ⇒ **live re-pricing on every read** |
| `pricedFromStale` | Boolean = false | Documented as "priced while the DB was unreachable". **Never written.** Dead column |
| `snapPriceKey` | String? | Frozen price key, e.g. `P-SEC24N2F1M1-With Fuse` |
| `snapBasePriceUsd`, `snapListPriceUsd` | Float? | Frozen floor/list price, **USD, pre-conversion** |
| `snapAddOnsJson` | String? | JSON `[{name, price}]`. A parse failure degrades to `[]`, never a 500 |
| `snapVatPct` | Float? | VAT frozen at creation, so an old offer keeps printing its own rate |
| `snapPriceFound` | Boolean? | Whether the configuration had a price at all. `false` is **permanent POA** |
| `rmu` | RmuConfig? | 1:1, cascade from the child side |

No indexes beyond `id`/`offerNumber`; `listOffers` filters the **unindexed** `ownerId`.

### 4.2 `RmuConfig` — the stored RMU configuration (`:100-127`)

`offerId String @unique`, `onDelete: Cascade`. Only *inputs* are stored; the entire technical offer
is re-derived by `assembly.ts` on every read.

| Field | Type | Meaning |
|---|---|---|
| `productType` | String | `PRAL \| PSEC \| LUCY`. **Schema comment `:105` omits LUCY — stale** |
| `lbsBrand` | String = `"ABB"` | Zod accepts `ABB\|MURGE\|SCHNEIDER\|JGGY\|GRL\|CHINT`, but only `PSEC→ABB\|MURGE` and `PRAL→ABB` pass the refine. **Comment `:106` omits CHINT** |
| `clientSpec` | String = `"EECH"` | `EECH \| KAHRABA`. **Spelled `EECH` although the customer is EEHC — persisted, do not "fix"** |
| `voltageKv` | Int | 12 or 24 only |
| `nalCount` | Int = 2 | Ring feeders, 0-5. **For LUCY this column means *feeders* (L)** |
| `nalfCount` | Int = 1 | Transformer feeders, 0-2. **For LUCY: *transformers* (V)**. `nal + nalf > 0` enforced |
| `hasMetering` | Boolean = false | Adds the metering cubicle (`M`) |
| `rtuType` | String = `"NONE"` | `NONE\|READY1\|READY2\|SMART1\|SMART2`. **Comment `:112` says `TYPE1\|TYPE2` — stale.** Legacy `TYPE1/TYPE2` values are still tolerated by the predicates |
| `installation` | String = `"INDOOR"` | `INDOOR \| OUTDOOR`. Outdoor ⇒ IP54 + the $2000 enclosure add-on |
| `busbarCurrentA` | Int = 630 | ≤2500. Printed in the electrical data and in every cubicle name |
| `fuseRatingA` | Int? | ≤400. `null` ⇒ the standard rating and the words "up to" in the BOM |
| `meteringCtPrimaryA` | Int? | ≤5000. `null` keeps the literal `X` placeholders |
| `ctClass` | String? | Downstream default `"0.5"` |
| `vtCores` | Int = 1 | 1 or 2. A second core adds the `110/3` line and enables the VT fuse |
| `vtBurdenVa`, `vtClass` | String? | **Accepted, stored and ignored** — the BOM hard-codes `50-100 VA` / `CL 0.5` |
| `meteringWithFuse` | Boolean = false | Appends `-With Fuse` to the price key |
| `configCode` | String | Cached human code, e.g. `PRAL12(2+1+M)` |

### 4.3 `User` (`:133-166`)

| Field | Type | Meaning |
|---|---|---|
| `email` | String @unique | Lower-cased by Zod. **Sign-up restricted** to an exact match on the part after the last `@`; login and reset are not restricted |
| `name` | String = `""` | |
| `passwordHash` | String | bcryptjs, cost **12** |
| `photo` | String? | base64 data URL (no writable disk on Vercel); raster only, ≤3,000,000 chars, SVG rejected |
| `emailVerified` | Boolean = false | Set true by `/complete`. **Never checked at login** |
| `role` | String = `"USER"` | **LEGACY** ladder `USER \| PRICE_ADMIN \| OWNER`. Authoritative only while `tier` is NULL |
| `tier` | String? | `ADMIN \| ENGINEER`. **NULL = not migrated → derive perms from `role`** |
| `perms` | String = `"[]"` | **JSON array string** of permission keys (no arrays in SQLite). Corrupt JSON → `[]` (fail closed) |
| `accessRole` | String = `""` | Display-only named role. `""` → `inferRole()` |
| `notifyByEmail` | Boolean = true | Opts out of **e-mail only**; the in-app inbox still fills |
| relations | | `lvQtns`, `coOwnedQtns` (legacy), `coWorkOn`, `offers`, `notifications` |

### 4.4 `EmailCode` (`:170-180`)

`email`, `code` (6 digits), `purpose` (`"signup" \| "reset"`), `attempts Int = 0`, `expiresAt`,
`createdAt`; `@@index([email, purpose])`. TTL 10 min, **6** wrong attempts then the row is deleted.
Not unique per address — `issueCode` deletes prior rows itself. Nothing prunes expired rows.

### 4.5 `LvQtn` — a saved LV quotation (`:185-240`)

| Field | Type | Meaning |
|---|---|---|
| `number` | String | `QTN-26-0007`; revisions are a trailing `-N` |
| `ownerId` | String → User | `onDelete: Cascade` — **deleting a user deletes their quotations** |
| `coOwnerId` | String? → User | **LEGACY single Co-Work slot**, `onDelete: SetNull`. Deliberately not dropped (`:190-196`): `db push` has no data step, so removing it would erase live shares. Read only via `coOwnersOf()`, nulled the next time Co-Work is saved |
| `coOwners` | LvQtnCoOwner[] | The real membership table |
| `state` | String | **The entire `LvState` as JSON.** Not validated server-side (`z.unknown()`) |
| `projectName`, `customer` | String = `""` | Client-computed summary |
| `panelsCount` | Int = 0 | Client-computed summary; also the "panels quoted" metric |
| `totalEgp` | Float = 0 | Client-computed summary — **VAT-INCLUSIVE** (`grandTotals().incl`) |
| `submitted` | Boolean = false | **Mirror column**, written only by `statusWrite()` |
| `submittedAt` | DateTime? | Mirror, and **sticky** — a reopen does not null it |
| `status` | String? | `DRAFT\|WAITING_APPROVAL\|RETURNED\|APPROVED\|SUBMITTED`. **No `@default` on purpose** (`:213-219`): a default would be stamped onto every existing row by `db push` and reset live submitted quotations to Draft. **Always read via `qtnStatus()`** |
| `statusAt` | DateTime? | When the status last moved |
| `submittedForApprovalAt` | DateTime? | Orders the approval queue |
| `approverId` | String? | **No foreign key on purpose** — deleting a user must not break history |
| `approverEmail` | String = `""` | Denormalised approver identity |
| `approvedAt` | DateTime? | |
| `returnReason` | String = `""` | Mandatory on a RETURN. **Cleared only by an APPROVE** |
| constraints | | `@@unique([ownerId, number])` (per-owner, **case-sensitive**), `@@index([ownerId])`, `@@index([status])`, `@@index([status, updatedAt])` |

### 4.6 `LvQtnCoOwner` (`:245-254`)

`@@id([qtnId, userId])`, `addedAt`, both FKs cascade. **The owner is never a row here.** Membership
is replaced wholesale by `POST /api/qtns/:id/cowork`.

### 4.7 `LvAttachment` (`:261-274`)

`qtnId` (cascade), `name`, `mime @default("application/octet-stream")`, `size Int` (decoded byte
length, **recomputed server-side**), `data String` (bare base64, no `data:` prefix),
`byEmail String = ""` (plain text so user deletion never breaks the list), `createdAt`;
`@@index([qtnId])`. Caps **3 MB/file** and **30 files/QTN** (3 MB × 4/3 ≈ 4 MB, under Vercel's
4.5 MB request limit). `duplicate` copies the bytes.

### 4.8 `QtnEvent` — append-only audit trail (`:283-303`)

`qtnId` (**no relation, no cascade on purpose** — a cascade would erase what an audit trail exists to
survive), `qtnNumber`, `ownerId?`, `ownerEmail`, `action`, `fromStatus?`, `toStatus`, `note`,
`actorId?`, `actorEmail`, `createdAt`. Indexes `[qtnId, createdAt]`, `[toStatus, createdAt]`,
`[actorId, createdAt]`, `[createdAt]`. Immutability is convention only.

Actions actually written: `CREATE`, `REQUEST_APPROVAL`, `APPROVE`, `RETURN`, `SUBMIT`, `WITHDRAW`,
`REOPEN`, **`REASSIGN`**, **`COWORK`** — the schema comment at `:289` omits the last two.
`estimatorEval` reads only `APPROVE` and `RETURN`, so renaming an action silently zeroes two charts.

### 4.9 `Notification` (`:308-325`)

`userId` (cascade), `kind`, `title`, `body`, `link`, `qtnId?` (no FK), `readAt?`, `emailedAt?`,
`emailError = ""` (first 400 chars), `createdAt`; `@@index([userId, readAt])`,
`@@index([userId, createdAt])`.
Kinds emitted: `QTN_WAITING`, `QTN_APPROVED`, `QTN_RETURNED`, `QTN_SUBMITTED`, `ACCESS_CHANGED`,
**`QTN_REASSIGNED`**, **`QTN_COWORK`** — the comment at `:312` omits the last two.

### 4.10 `PriceBook` — the single control row (`:341-356`)

| Field | Default | Meaning |
|---|---|---|
| `id` | `"singleton"` | There is exactly one row, always at this id |
| `version` | 0 | **0 = never published** → the bundled JSON is authoritative |
| `publishedAt` / `publishedBy` / `note` | now / `""` / `""` | `note` truncated to 200 chars |
| `source` | `"db"` | **Kill switch.** `"json"` reverts to the bundled file instantly, no redeploy. **No endpoint sets it — you must UPDATE the row by hand** |
| `seedState` | `"EMPTY"` | `EMPTY \| SEEDING \| READY`; drives the first-run UI |
| `seedCursor` | 0 | Written by the LV chunk endpoint, **never read** |
| `seedStage` | `""` | `RMU \| LV_COMPONENTS \| LV_ENCLOSURES`; written, never read |

### 4.11 `PriceSnapshot` — immutable published payload (`:360-370`)

`domain` (`"RMU" \| "LV"`), `version Int`, `payload String` (JSON), `rowCount Int = 0`, `createdAt`;
`@@unique([domain, version])` (Prisma name `domain_version`), `@@index([version])`.
**One row read serves the whole catalogue**, so a cold serverless function never queries thousands of
rows. An LV payload is ~500 KB. Pruned to the newest **15** versions after every publish.

### 4.12 `RmuPrice` — RMU draft rows (`:375-401`)

`kind` (`PANEL\|LUCY\|RTU\|ADDON`), `key`, `priceUsd Float` (must be `> 0` to save),
`label String = ""` (ADDON only — the text printed on the offer), `active Boolean = true` (soft
retire; rows are **never deleted** so saved quotations still resolve), `updatedBy`,
plus derived attribute columns `family` (`P-RAL\|P-SEC\|P-SEC.M`), `voltageKv`, `nalCount`,
`nalfCount`, `hasMetering`, `withFuse`, `productType` (RTU: `PSEC\|LUCY`), `rtuLevel`
(`READY1\|READY2\|SMART1\|SMART2`). `@@unique([kind, key])`, `@@index([kind, active])`.
**`key` is always derived server-side, never typed** (`derivePriceKeyFor`, §7.4). The seeded rows
have every attribute column NULL — only `createRmuPrice` populates them.

### 4.13 `LvComponent` (`:404-437`)

Mirrors `DbComponent` in `frontend/src/lv/catalog.ts` field for field.

| Field | Default | Meaning |
|---|---|---|
| `sortIndex` | **Int @unique** | **Catalogue ORDER, and it is load-bearing**: the combination builders resolve parts by description and take the FIRST match. New rows must only ever be appended |
| `t` / `f` / `r` | `""` | Type (MCB, MCCB, ACB, TruOne, P.F.C, Control…) / Family / Rating |
| `d` | — | Short description — **a combination lookup key** |
| `n` | — | Display name — **also a lookup key**; kept in sync with `d` by the import |
| `ref` | `""` | Manufacturer part number — the identity an Excel import matches on |
| `eur` / `egp` | 0 | Priced in **exactly one** currency; **EUR wins** if both are set |
| `poles` | 0 | Multiplies the copper cost — **a zero here silently zeroes copper** |
| `cuP` / `cuC` | 0 | Copper kg per pole, for panels / for cells |
| `brand` | `"ABB"` | **Only EUR-priced ABB lines get the ABB discount** |
| `stock` | `""` | |
| `active` | true | Soft retire. Retired rows **stay in the published payload** with `active:false` so the builders keep resolving |
| `search` | `""` | Lower-cased haystack. Exists because Prisma's `mode:"insensitive"` is Postgres-only and would make local SQLite and production diverge |
| indexes | | `@@index([active, sortIndex])`, `@@index([t])`, `@@index([ref])` |

### 4.14 `LvEnclosure` (`:441-466`)

`sortIndex Int @unique`, `fam`, **`name` (IDENTITY — cell matching parses dimensions out of it)**,
`ref`, `abb`, `eur`, `egp`, `ip`, `H`/`W`/`D` (Int mm — **all zero in the bundled data**), `mount`,
`ral @default("7035")`, `active = true`, `search`, `updatedBy`;
`@@unique([fam, name])`, `@@index([active, sortIndex])`, `@@index([fam])`.
An Excel import updates an enclosure's **price only** and never its `name`.

### 4.15 `PriceSetting` — scalars (`:471-481`)

`scope`, `key`, `num Float?`, `text String?`, `updatedAt`, `updatedBy`; `@@unique([scope, key])`.
`scope "RMU"` → `vatPct` (num, **14**), `currency` (text, `USD`).
`scope "LV"` → `factor`, `euro`, `usd`, `safetyFactor`, `copper`, `sheetMetal`, `operations`,
`abbDiscount`, `vat`, and the nested `forms.1 … forms.4b` (dotted keys, re-nested by
`buildLvPayload`). **Note the unit mismatch: RMU VAT is `14`, LV VAT is `0.14`.**

### 4.16 `PriceChange` — audit trail + undo source (`:484-503`)

`version Int?` (**null = pending**, stamped at publish by
`updateMany({where:{version:null}})`), `domain`, `entity`, `entityId`, `label`, `field`,
`oldValue?`, `newValue?`, `batchId?`, `actorId?`, `actorEmail`, `createdAt`.
Indexes `[version]`, `[domain, createdAt]`, `[batchId]`, `[entity, entityId]`.

`entity` values actually written: `RmuPrice`, `LvComponent`, `LvEnclosure`, `PriceSetting`,
**`User`** (the Access Center and `make-admin.js`), **`PriceBook`** (the seed marker).
`field` values: `priceUsd`, `price` (LV, formatted `"<eur> EUR / <egp> EGP"`), `__created`,
`__retired`, `__restored`, `__seed`, `role`, `tier`, `perms`, `notifyByEmail`, and from the Excel
import one row per changed column named after the lower-cased human label (`description`, `brand`,
`type`, `family`, `rating`, `poles`, `weight/panel/pole`, `weight/cell/pole`, `stock`).
**`batchId` is declared, indexed, documented — and never written**, so import rows cannot be grouped.

**This one table is reused as three different audit logs.** Anything that filters it must qualify by
`entity`: the Access Center history reads `entity: "User"`; the stale-price scan reads
`domain:"LV", entity:"LvComponent", field:"price"`.

### 4.17 `PriceImportBatch` (`:507-520`)

`domain`, `status = "PENDING"` (`PENDING\|APPLIED\|CANCELLED`), `rows String`, `diff String`
(the full `DiffEntry[]` — the replay works entirely off this), `warnings = "[]"` (first 200),
`actorId?`, `actorEmail`, `createdAt`, `expiresAt`; `@@index([status, expiresAt])`.
TTL **1 hour**; an expired apply flips the row to CANCELLED and returns **410**.
**`rows` stores only `JSON.stringify(rows.length)` — a bare number, not the rows.** Nothing prunes
expired batches.

### 4.18 `LvComboRef` — declared and entirely unused (`:527-534`)

`desc String @unique`, `expectRef`, `expectName`, `source @default("combos.json")`, `updatedAt`.
Its doc comment promises that "publishing is refused if any of them stops resolving or starts
resolving to a different part". **No code references this model** (grep returns only the schema).
The regression guard does not exist; the only protection against a rename orphaning a combination
template is the *warning* the Excel preview prints.

---

## 5. Permission and role model

Two layers coexist. `accessOf(userId)` (`middleware/roles.ts:106-129`) resolves them into one
effective permission set and is **read from the database on every request, never from the JWT** —
which is what makes a revocation take effect immediately even though the token lives 30 days.

```
if (!userId)                                   → { tier:"ENGINEER", perms:{}, role:"USER" }
u = SELECT role, tier, perms WHERE id = userId
if (!u)                                        → same empty Access
role = ROLES.includes(u.role) ? u.role : "USER"
if (!u.tier || !TIERS.includes(u.tier))            // NOT MIGRATED
     → { tier: role === "OWNER" ? "ADMIN" : "ENGINEER", perms: DERIVED[role], role }
granted = safeParsePerms(u.perms)                  // corrupt JSON → [] (fail closed)
if (u.tier === "ADMIN")                        → { perms: ADMIN_PERMS ∪ granted }
else                                           → { tier:"ENGINEER", perms: granted }
```

`DERIVED` (`roles.ts:56-60`) was chosen so the deploy that added `tier`/`perms` changed nobody's
access: `OWNER` → all 13 `ADMIN_PERMS`, `PRICE_ADMIN` → `["prices.view","prices.edit"]`,
`USER` → `[]`. **For a migrated user the legacy `role` column is completely ignored** by `accessOf`;
it is only echoed back in `Access.role` and `pub().role`.

`ADMIN_PERMS = PERMS.filter(p => p !== "qtn.approveOwn")` (`roles.ts:52`) — 13 of the 14.
Self-approval is always an explicit extra grant.

### 5.1 The 14 permission keys and where each is enforced

| Key | Label | Enforced |
|---|---|---|
| `prices.view` | View price list | `requirePriceViewer` on 5 read routes; `canViewPrices()` in `getStatus` |
| `prices.edit` | Edit price list | `requirePriceAdmin` on 14 write routes (implies view) |
| `access.manage` | Manage access | `requireOwner` on the 3 Access-Center admin routes |
| `qtn.viewAll` | View all QTNs | `GET /api/qtns/all`; `visibleQtn()`, `readableQtn()`, `events()` |
| `qtn.approve` | Approve QTNs | `GET /api/qtns/queue`; `transitionDenial` → `APPROVED` and → `RETURNED` |
| `qtn.return` | Return QTNs for revision | `transitionDenial` → `RETURNED` |
| `qtn.editWaiting` | Edit QTNs waiting for approval | `update()` (`qtns.controller.ts:333`) |
| `qtn.submitApproved` | Submit approved QTNs | `transitionDenial` → `SUBMITTED` for a non-owner |
| `qtn.reopen` | Reopen submitted QTNs | `transitionDenial` `SUBMITTED → DRAFT` |
| `qtn.reassign` | Hand over / reassign QTNs | `reassign()` **and** `cowork()` — one key gates both |
| `qtn.amendOwn` | Amend own QTNs | **NEVER checked server-side** — frontend button visibility only |
| `qtn.amendAll` | Amend all QTNs | **NEVER checked server-side**, and cannot work: `duplicate` is owner-only |
| `qtn.audit` | View audit trail | `events()` (`qtns.controller.ts:647`) |
| `qtn.approveOwn` | Approve their own QTNs | `transitionDenial` → `APPROVED` when `isOwner` |

### 5.2 Named role presets (`roles.ts:65-71`)

**Duplicated verbatim in `frontend/src/pages/AccessCenterPage.tsx:18-24`. Change one and you must
change the other.**

| Name | Tier | Explicit perms |
|---|---|---|
| `Admin` | ADMIN | `[]` (tier implies the 13) |
| `Section Head` | ADMIN | `[]` |
| `Team Leader` | ENGINEER | `prices.view`, `qtn.viewAll`, `qtn.reassign`, `qtn.approve`, `qtn.return`, `qtn.amendOwn`, `qtn.amendAll` |
| `Tendering` | ENGINEER | `prices.view`, `qtn.viewAll`, `qtn.editWaiting`, `qtn.amendOwn`, `qtn.amendAll` |
| `Powerline` | ENGINEER | `qtn.viewAll` |

`inferRole(tier, perms)`: `ADMIN` → `"Admin"`; otherwise the engineer preset whose perm set matches
**exactly by length and membership**; otherwise `"Custom"`. Saving "Custom" stores `accessRole = ""`
and forces `tier = "ENGINEER"`.

### 5.3 Guard factories and their misleading names

* `requirePerm(perm)` → 403 with `DENY[perm] ?? "You do not have access to this."`
  Overrides kept verbatim because UI copy depends on them:
  `prices.edit → "You do not have access to price editing."`,
  `access.manage → "Owner access required."`
* `requireAnyPerm(...)` → passes on **any** of them.
* Aliases: `requirePriceViewer = requireAnyPerm("prices.view","prices.edit")`,
  `requirePriceAdmin = requirePerm("prices.edit")`,
  **`requireOwner = requirePerm("access.manage")` — it has nothing to do with the legacy `OWNER`
  role. Read it as "manage access".**
* The `try { … } catch (e) { fail(res, e) }` inside both factories is **load-bearing**: Express 4
  does not catch rejected promises from async middleware, so without it a DB error hangs the request
  forever instead of 500ing.

### 5.4 Who can grant what

Only `access.manage` holders reach `POST /api/access/users/:id`. `setAccess` can set **any** preset
including `Admin`, so an `access.manage` holder can promote themselves or anyone else — there is no
"super admin". The only protection is the self-lockout guard: you cannot move **yourself** to a
non-ADMIN tier (`access.controller.ts:109-113`). You *can* demote another Admin, so two Admins can
lock each other out; recovery is `node backend/scripts/make-admin.js <email>`.

A parallel legacy path still exists — `GET /api/pricing/users` + `POST /api/pricing/users/:id/role`
— also gated by `requireOwner`. It writes **only `User.role`**, which `accessOf` ignores for any
migrated user, so it is a silent no-op in practice. No UI calls it.

### 5.5 The client half

UI gating comes from `GET /api/access/me` → `can(perm) = access.perms.includes(perm)`. It is purely
cosmetic; the server re-checks everything. **Never gate on `AuthUser.role`** — that is the legacy
column. `/access/me` is fetched independently by four components (`App.tsx:65`,
`HomeDashboard.tsx:40`, `LvQtnListPage.tsx:38`, `LvConfiguratorPage.tsx:346`) with no shared context,
so the sidebar keeps whatever permissions it started with until a full reload.

---

## 6. The QTN approval workflow state machine

`backend/src/domain/qtnStatus.ts` is the only module allowed to write `status`, `statusAt`,
`submitted` or `submittedAt`. Statuses (`QTN_STATUSES`, `:12-18`) and their UI labels
(`QTN_STATUS_LABEL`, mirrored in `frontend/src/api.ts:102-108`):

| Value | Label |
|---|---|
| `DRAFT` | Draft |
| `WAITING_APPROVAL` | Waiting for approval |
| `RETURNED` | Returned for revision |
| `APPROVED` | Approved — waiting for submission |
| `SUBMITTED` | Submitted |

`QTN_LOCKED = ["WAITING_APPROVAL","APPROVED","SUBMITTED"]` — **content** is frozen in these three.
`qtnStatus(row)` falls back to `row.submitted ? "SUBMITTED" : "DRAFT"` when `status` is NULL (legacy
and duplicated rows). **Never read `row.status` directly.**

### 6.1 Transition table

Every move goes through `POST /api/qtns/:id/transition {to, note?}`. The row is fetched with
`visibleQtn` (**visible, not writable** — an approver acts on a QTN they do not own). `from === to`
is an idempotent no-op returning `200 {ok:true}` with no audit row. Anything not in the table → 409
`"A <label> quotation cannot be moved to <label>."`

| From | To | Audit action | Who may (else 403 with this message) | Side effects |
|---|---|---|---|---|
| `DRAFT` | `WAITING_APPROVAL` | `REQUEST_APPROVAL` | **owner only** — *"Only the person who created this quotation can send it for approval."* | `submittedForApprovalAt = now`; notify `approverIds()` **minus the owner**, kind `QTN_WAITING` |
| `RETURNED` | `WAITING_APPROVAL` | `REQUEST_APPROVAL` | owner only (same message) | same |
| `WAITING_APPROVAL` | `APPROVED` | `APPROVE` | `qtn.approve` — *"You do not have permission to approve quotations."*; **if `isOwner`, additionally `qtn.approveOwn`** — *"You cannot approve your own quotation — another approver must review it."* | `approverId`/`approverEmail` set, `approvedAt = now`, **`returnReason` cleared**; notify the owner, kind `QTN_APPROVED` |
| `WAITING_APPROVAL` | `RETURNED` | `RETURN` | `qtn.return` **or** `qtn.approve`; **`note` is mandatory** — *"A reason is required when returning a quotation for revision."* | `approverId`/`approverEmail` set, `returnReason = note`; notify the owner, kind `QTN_RETURNED` |
| `WAITING_APPROVAL` | `DRAFT` | `WITHDRAW` | owner only — *"Only the quotation's owner can withdraw it."* | **no notification** |
| `APPROVED` | `SUBMITTED` | `SUBMIT` | owner, or `qtn.submitApproved` — *"Only the quotation's owner can submit it."* | `submitted = true`, `submittedAt = prev ?? now` (**sticky**); notify `approverIds()` **plus the owner**, kind `QTN_SUBMITTED` |
| `APPROVED` | `DRAFT` | `WITHDRAW` | owner only | no notification |
| `RETURNED` | `DRAFT` | `WITHDRAW` | owner only | no notification |
| `SUBMITTED` | `DRAFT` | `REOPEN` | **`qtn.reopen`** — *"You do not have permission to reopen a submitted quotation."* (being the owner is not enough) | `submitted = false`, `submittedAt` **kept**; no notification |

Deliberately **absent**: `DRAFT → SUBMITTED` (no fast path — which is why the legacy
`POST /:id/submit` alias 409s on a draft), `APPROVED → RETURNED` (an approver who changes their mind
must get the owner to withdraw), `SUBMITTED → APPROVED`, and any move out of a locked state other
than to `DRAFT`.

The status update **and** the `QtnEvent` row are written in one `prisma.$transaction`
(`qtns.controller.ts:573-586`) — they move together or not at all. `announce()` runs **outside** the
transaction so a mail failure cannot roll back an approval (but it *is* awaited before the HTTP
response — see §10).

### 6.2 Content locking, editing and deletion

* Server enforcement points: `update` (409), `rename` (**HTTP 200 with `{ok:false, error}`** — the
  client only treats *thrown* errors as failures; do not "fix" this without changing the client),
  `uploadAttachment` (409), `removeAttachment` (409).
* The **only** unlock is `qtn.editWaiting` **and** status exactly `WAITING_APPROVAL`.
* `DELETE` is accepted **only** from `DRAFT` or `RETURNED`, owner only; anything else 409.
* Notification detail rows are always `["QTN"], ["Project"], ["Status"], ["By"], ["When"]`, with
  `When` formatted `toLocaleString("en-GB")` **in the server's timezone**.

### 6.3 "Cancelled" is not a status

A revision shows as **Cancelled** purely because a higher revision of the same base exists —
computed **client-side** by `supersededNumbers()` (`frontend/src/lv/qtns.ts:317-324`) over the
caller's own QTN list, and used to force read-only in the configurator. **The server knows nothing
about it**: a "cancelled" quotation can still be transitioned, submitted and edited through the API.
Revision parsing: `/^(.*\d{3,})-(\d{1,3})$/`, so `QTN-26-01010-2` = base `QTN-26-01010`, rev 2.
**Amend** = `duplicate` + `rename` to `<base>-<maxRev+1>`.

### 6.4 Hand-over and Co-Work

**Hand-over** (`POST /:id/reassign {toUserId, note?}`) — allowed to `qtn.reassign` holders or the
current owner. Updates **`ownerId` only**; status, content, co-workers and per-panel `ownerId`s are
untouched. Guards: same-owner → 400; unknown user → 404; **number clash** (the target already owns a
QTN with that exact number) → 409, because of `@@unique([ownerId, number])`. Writes a `REASSIGN`
event whose `ownerId`/`ownerEmail` are the **new** owner, and notifies them (`QTN_REASSIGNED`).
Works at any status **including SUBMITTED** — only the UI hides the button there.

**Co-Work** (`POST /:id/cowork {coOwnerIds[], note?}`) — same permission. The list **replaces** the
previous membership (max 20); an empty list ends co-work. One transaction deletes all rows, creates
the new ones, nulls the legacy `coOwnerId`, and writes a `COWORK` event. **Only newly added people
are notified.**

The split is **by panel**, and panel ownership lives inside the JSON as `state.panels[].ownerId`
(a panel with no `ownerId` belongs to the QTN owner). `mergeCoWork` (`qtns.controller.ts:296-319`)
is the real guard, and it reads ownership from the **stored** state so a saver can neither reassign
nor edit someone else's panel:

1. Incoming panel with no `id` → passed through untouched (not stamped).
2. `id` not in stored → **new panel, stamped `ownerId: saverId`**.
3. Stored owner ≠ saver → **the STORED panel wins** (someone else's work is authoritative).
4. Stored owner === saver → `{...incoming, ownerId: saverId}`.
5. Every stored panel the saver did not send back whose owner ≠ saver is **re-appended**, so a stale
   client cannot drop anybody's panels.
6. Shared fields: `base = saverId === primaryId ? incoming : stored` — **a co-worker's save never
   changes the shared fields** (project, factors, terms, specs, `kind`, panel order).

Consequences: nobody can delete anybody else's panel, including the owner; the merged panel **order**
follows the *saver's* order with other people's unsent panels appended at the end; and the four
summary columns always come from the saver's payload.

---

## 7. The price book lifecycle, and the stale-price story

### 7.1 The two domains

| Domain | What is priced | Currency in the DB | Consumed by |
|---|---|---|---|
| `RMU` | MV panels (PRAL/PSEC/Lucy), Smart-RTU levels, add-ons, plus the scalars `vatPct` and `currency` | USD | The backend, **synchronously**, on every offer request |
| `LV` | 2,121+ components and 253+ enclosures/cells, plus the LV cost factors | EUR **or** EGP per row | The **browser** — the whole catalogue is shipped to the client |

The design centre: **edit draft rows → publish an immutable snapshot → bump one integer → every
process notices within 10 s.** Three guarantees: nothing half-broken reaches a quotation (publish
blockers); a sent quotation never silently re-prices (RMU freezes `snap*` columns, LV stores its own
component copies inside `LvQtn.state`); recovery never needs a deploy (`PriceBook.source = "json"`).

### 7.2 Bootstrap (how a fresh database is set up)

1. A signed-in user opens `/pricing`; `GET /api/pricing/status` returns `seedState: "EMPTY"`.
2. **"Set up the price list"** → `POST /api/pricing/seed`. **Bootstrap rule: while `version === 0`
   *any* signed-in user may run it, and the runner is promoted to legacy `role: "OWNER"`.**
3. `seedRmuFromBundle()`: upsert every bundled key into `RmuPrice` (with
   `update: { priceUsd, label, active: true }`) and the two `PriceSetting` scalars → **rebuild the
   payload from the DB and deep-compare it with the bundled file** → on any mismatch return
   `ok:false` and publish **nothing** (HTTP 409 with up to 20 mismatches) → otherwise write
   `PriceSnapshot(RMU, 1)`, set `PriceBook{version:1, seedState:"READY", source:"db"}` and log a
   `PriceChange{field:"__seed"}` already stamped with its version.
4. The **browser** then pushes the LV catalogue, because the catalogue JSON lives in the frontend
   bundle, not in the serverless function: `PricingAdminPage.tsx:65-79` posts `COMPONENTS` then
   `ENCLOSURES` in **300-row** chunks to `POST /api/pricing/lv/seed-chunk` (server cap 400), each
   chunk doing `deleteMany({sortIndex: {gte: offset, lt: offset+len}})` + `createMany` inside one
   transaction so a retry can never duplicate. Finally `POST /api/pricing/lv/settings` saves
   `DEFAULT_FACTORS`.
5. This auto-re-runs on a later visit **only if `counts.lvComponents === 0`**.

### 7.3 Draft → publish → live

**RMU edit (the draft model):**
1. `PATCH /api/pricing/rmu/:id` (`requirePriceAdmin`) → validate finite and `> 0`; an identical value
   returns `{ok:true, unchanged:true}` with **no audit row**.
2. Write `RmuPrice.priceUsd` + one `PriceChange` with **`version: null` = pending**. This row is not
   yet visible to any quotation.
3. `GET /api/pricing/pending` (cap 200) lists pending rows; the publish bar lights on
   `pending.length > 0 || behindLive`.
4. `POST /api/pricing/publish`:
   1. `buildRmuPayload()` from the **active** draft rows.
   2. **Blockers** → 400 `{error:"Cannot publish yet.", blockers:[…]}` and nothing is written:
      any `panels[k] <= 0`; any `lucy[k] <= 0`; `addOns.outdoorEnclosure` missing; `vatPct` outside
      0-100.
   3. `version = (book?.version ?? 0) + 1`; write `PriceSnapshot(RMU, version)`.
   4. If `lvComponent.count() > 0`, dynamically import `buildLvPayload()` and write
      `PriceSnapshot(LV, version)` — **the same version number**, so both halves move as one unit.
   5. `PriceBook.update({version, publishedAt, publishedBy, note, source:"db"})` — note this
      **also forces `source` back to `"db"`, silently cancelling the kill switch**.
   6. `priceChange.updateMany({where:{version:null}, data:{version}})` — this is how "what changed in
      version N" stays answerable.
   7. `refreshPriceBook(true)`, then `pruneSnapshots()` (`KEEP_VERSIONS = 15`).

**LV edit (the live model): every LV write publishes itself.** `updateLvPrice` (component and
enclosure), `createLvComponent`, `retireLvItem` (both kinds) and `postLvImportApply` all call
`publishCurrentPrices` / `publishCurrentPricesDetailed` — the same sequence **minus the VAT check**,
and it **never throws** (a price edit that saved must not report failure because the publish half had
a problem; callers get `blockers` instead). RMU edits, `postUndo` and `postLvSettings` do **not**
auto-publish.

**Reaching a consumer:**
* Backend: `withPriceBook` → `refreshPriceBook()`. Inside `TTL_MS` (**10 000 ms**, override
  `PRICE_BOOK_TTL_MS`) it costs zero queries. Otherwise one PK read of `PriceBook`; if the version
  moved, read `PriceSnapshot{domain:"RMU", version}` and `JSON.parse` it into the module-level
  `DATA`. **Never throws** — on error it keeps the last good data and sets `lastError`, which
  surfaces as `X-PriceBook-Stale: 1`. Response headers `X-PriceBook-Version` / `-Source` /
  `-Stale` are the debugging tool for "why did this offer get the old price".
* Frontend: `GET /api/catalog/lv` returns the **published snapshot** (not the draft) and
  `catalogSource.installCatalog` **mutates the exported `COMPONENTS`/`ENCLOSURES` arrays in place**,
  calls `rebuildDerived()` and caches the payload in `localStorage["powerline-catalog"]`. When the
  server answers `source !== "db"`, the cache is **dropped** and the bundled catalogue restored.

**Retire is always soft.** RMU: `active:false` and the row simply stops appearing in the next
snapshot. LV: `buildLvPayload` **keeps** retired rows in the payload with `active:false` because the
combination builders find parts by description — only the pickers filter the flag. `outdoorEnclosure`
**cannot be retired** (outdoor offers apply it automatically and would silently lose $2000).

**Undo** (`POST /api/pricing/changes/:id/undo`) is **RMU-only** (`entity !== "RmuPrice"` → 400) and
is applied as a **new forward `PriceChange`**, never by mutating or deleting the original. It does
not publish.

**Kill switch:** `UPDATE "PriceBook" SET source = 'json' WHERE id = 'singleton'` reverts to the
bundled list on the next refresh with no redeploy. There is no endpoint or UI for it, and the next
publish (including any LV price edit) turns it back off.

### 7.4 Price keys are derived, never typed

`derivePriceKeyFor` (`pricing.controller.ts:265-288`) builds the key with the same builders the
configurator uses, so a row nothing can look up is structurally impossible (the old Excel sheet
accepted typos, which became dead prices):

* `PANEL` → `buildPriceKey({productType: family==="P-RAL"?"PRAL":"PSEC", lbsBrand:
  family==="P-SEC.M"?"MURGE":"ABB", clientSpec:"EECH", voltageKv, nalCount, nalfCount, hasMetering,
  meteringWithFuse: hasMetering && withFuse, rtuType:"NONE", installation:"INDOOR",
  busbarCurrentA:630})` → e.g. `P-SEC.M24N2F1`, `P-RAL12N4F0M1-With Fuse`.
* `LUCY` → `lucyKey({nalCount, nalfCount, hasMetering})` → `"2+1+M"`.
* `RTU` → `` `${productType}:${rtuLevel}` `` → `PSEC:SMART1`.
* `ADDON` → the raw add-on key.

### 7.5 The stale-price story

Prices are **frozen onto a quotation** at the moment a component is added
(`toPanelComponent` copies `eur/egp/brand/poles/cuP/cuC/stock/rating`; cell rows carry `eur/egp`).
Nothing moves them except the estimator explicitly pressing **Apply changes**. So:

1. A publish changes `PriceBook.version` and writes `PriceChange` rows.
2. `GET /api/stats/stale-prices` (`account.controller.ts:130-216`, `requireAuth` only) computes the
   alarm:
   * If `PriceBook` is missing or `version < 1` → empty result.
   * `changeVersion` = the **highest `version`** among `PriceChange` rows with
     `domain:"LV", entity:"LvComponent", field:"price"` — deliberately the last publish that actually
     *moved a component price*, so a later enclosure-only or retire-only publish cannot blank the
     alert.
   * `changedPriceByRef` = today's `eur`/`egp` for the components changed in that version, keyed by
     `ref`; `retiredRefs` = every `LvComponent` with `active:false`.
   * Scan **the caller's** `LvQtn` rows with `submitted: false`, `JSON.parse(state)`, and for each
     `state.panels[].components[]` (skipping `spacer` and ref-less lines) count a line when the ref
     is retired **or** the frozen price differs from today's.
   * `changedCount > 0` → the QTN goes in `items`; otherwise, if
     `Number(state.pricesAppliedVersion) === book.version`, its id goes in `applied`.
3. `HomeDashboard` renders `RedPriceAlert` when `items.length > 0`, with a **"Review QTNs"** action
   that filters the history table; each row shows `⚠ N item(s) to update` or `✓ Prices updated`.
4. In the configurator, **⟳ Check for updates** (`checkCatalogUpdates`) re-reads `/api/catalog/lv`,
   installs the new catalogue, and reports counts of changed prices / brands / descriptions / other
   data / added / removed.
5. **Apply changes** → `repriceToCatalog(state)`: re-stamps every component matched by **`ref`** and
   every cell row matched by **`desc`**, **drops** components whose catalogue row is now
   `active:false`, and preserves qty / adj / comment / note / section / group. It then stamps
   `pricesAppliedVersion = catalogVersion()` **even when nothing moved** (the estimator reviewed
   against this list, so the QTN drops off the alarm).
   **It does not touch `state.factors`** — a re-priced old quotation still uses its original EGP/EUR
   rate, copper rate and ABB discount.

RMU offers have no equivalent: a modern offer's `snap*` columns keep printing the old numbers
forever, and `snapPriceFound = false` is permanent POA. **Legacy offers with `pricedAt == null`
silently re-price to the current list on every read** — there is no backfill.

---

## 8. Section deep dives

### 8.1 RMU — the two coding systems

**Two independent codes come out of the same config. Do not conflate them.**

| | `buildProductCode` (`assembly.ts:201`) | `buildPanelCode` (`assembly.ts:185`) |
|---|---|---|
| Purpose | Customer-facing product identity, printed on the technical + SLD PDFs, returned as **`GeneratedOffer.panelCode`** | **Price-list lookup key only** (legacy catalogue code) |
| Shape | `{FAMILY}{client}{type}{BRAND}{kV}R{nal}T{nalf}{M\|W}` | `{P-RAL\|P-SEC\|P-SEC.M}{kV}N{nal}F{nalf}[M1]` |
| Brand | 2-letter `BRAND_CODE`: `ABB→AB, MURGE→MG, SCHNEIDER→SH, JGGY→GY, GRL→GL, CHINT→CH` | Folded into the family prefix (Murge → `P-SEC.M`) |
| Client spec | `1` EECH / `2` KAHRABA | not encoded |
| Smart | `9` when `rtuHasRtu()`, else `0` (READY* codes as `0`) | not encoded |
| Metering | trailing `M` / `W` | trailing `M1` / nothing |
| VT-with-fuse | not encoded | `buildPriceKey` appends `-With Fuse` |
| LUCY | **`""`** (Lucy has no Powerline code) | unused; the key is `LUCY-{n}+{m}[+M]` |

A third, human code exists: `buildCode(c)` → `` `${type}${kv}(${nal}+${nalf}[+M])` `` e.g.
`PRAL12(3+1+M)`, cached on `RmuConfig.configCode`.

**Worked example** — Murge SF6, 24 kV, 3 ring + 1 transformer + metering, 2-core VT with fuse, Smart
type 2, outdoor:

```
buildCode        → PSEC24(3+1+M)
buildProductCode → PSEC + 1(EECH) + 9(has RTU) + MG + 24 + R3 + T1 + M = PSEC19MG24R3T1M
buildPanelCode   → P-SEC.M24N3F1M1
buildPriceKey    → P-SEC.M24N3F1M1-With Fuse       → panels[…] = 13 642 USD
add-ons          → Outdoor Enclosure 2000 ; "Smart / RTU — Smart — Type 2 (monitor & control)" 14 000
listPrice        → 29 642 USD
title            → "Smart P-Sec 24KV-TYPE 2 (Outdoor)"      protection index → IP54
```

### 8.2 RMU — assembly

`assembleOffer(c)` (`assembly.ts:234-401`) is deterministic: the same config always produces the same
technical content. `productType === "LUCY"` delegates to `assembleLucyOffer` (`lucy.ts:144`).

* `fuseOverride = c.fuseRatingA != null`; `fuseA = c.fuseRatingA ?? defaultFuseRatingA`
  (**100 A at 12 kV, 80 A at 24 kV**; Lucy 0).
* Switch names: PRAL → `NAL` (ring) / `NALF` (fused); PSEC → `G-Sec` for both. `mz(name)` prefixes
  `"Motorized "` when `rtuMotorized(rtuType)` (true for `SMART2`, `READY2`, legacy `TYPE2`).
* Title: `Smart {P-Sec} {kv}KV-TYPE {n}` when an RTU is fitted, else
  `{P-Sec} {kv}KV (Ready to be Smart-TYPE {n})` for READY*, else `{P-Sec} {kv}KV`; then
  `" (Outdoor)"` or `" (Indoor)"` is always appended.
* Outdoor overrides the protection index to **`IP54`** and sets `installationNote`.
* Gas-insulated families add `Pressure indicator for switch disconnector: With Manometer`.
* Cubicles: `PCC` × `nalCount`, `PFC` × `nalfCount`, `PMC` × 1 when `hasMetering`; names embed
  `busbarCurrentA` and the family dims. `totalCubicles = nal + nalf + (metering ? 1 : 0)`.
* Communication kit when `rtuHasRtu`: 1× RTU, 3× Expansion module 16 DI, 1× PSU 24 VDC 10 A, plus
  1× Expansion module 8 DO when motorized. **`READY*` is motorized but has no RTU kit.**
* Metering BOM: `us = serviceVoltageKv * 1000`; CT lines are `X` placeholders unless
  `meteringCtPrimaryA` is given; Core 1 VT secondary `110/√3`; **only when `vtCores >= 2`** a Core 2
  at `110/3` and only then the `MV fuse … for VT protection` line. Always ends with 3× Ammeter CL0.5,
  1× Voltmeter CL0.5, 1× Selector 7 position.
* `RATINGS` is keyed `"{TYPE}-{kV}"` and `getRatings()` **throws** on a miss, so an out-of-range
  voltage is a 500, not a 400 — Zod is the only thing preventing it. The Lucy service/withstand/BIL/
  peak values are marked in the source as **inferred IEC 62271 values, not from Lucy's data sheet**
  (peak = 2.5 × Isc; Isc 21 kA for **3 s**, unlike the 1 s of every other family).

**Gating** (three independent rules, **four copies of the lists** — backend domain, backend Zod,
backend priceList, frontend options): brands `PSEC → ABB|MURGE`, `PRAL → ABB`; `clientSpec` must be
`EECH` unless LUCY. `SCHNEIDER`/`JGGY`/`GRL`/`CHINT` and `KAHRABA` are declared but locked, so the
KAHRABA-only Additional Data rows in `assembly.ts:302-310` are dead code today.

**Money** (`commercial.service.ts:80-155`):
```
rate        = (currency === "EGP" && usdToEgpRate > 0) ? usdToEgpRate : 1   // applies to USD-sourced values only
panelUnit   = offer.unitPrice > 0 ? offer.unitPrice : (basePrice ?? 0)      // unitPrice is NEVER converted
subtotal    = Σ item.total                                                  // panel + one line per add-on, each × qty
discountAmount = subtotal × discountPct/100
totalExclVat   = subtotal − discountAmount
vatAmount      = totalExclVat × vatPctValue/100                             // injected, not read live
totalInclVat   = totalExclVat + vatAmount
```
`vatPct` is **passed in** (`snapVatPct ?? vatPct()`) so an offer issued at 14 % still prints 14 %.
`computePricing()` on `offer.pricing` is a **different** total (qty × unit − discount, no add-ons, no
VAT) — two "totals" in one API response; do not reconcile them without checking every consumer.

Add-on prices (USD): `outdoorEnclosure` **2000** (applied automatically for OUTDOOR),
`shuntTrip` **220** and `auxiliarySwitch` **301** (**priced but never applied by any code path**).
RTU: `PSEC {READY1 6500, READY2 8000, SMART1 12000, SMART2 14000}`,
`LUCY {8500, 10000, 14000, 16000}` — **there is no `PRAL` entry, so a Smart PRAL is quoted with no
smart charge**, and the derive-key UI only offers `PSEC|LUCY` so a PRAL RTU row cannot be added
through the app.

### 8.3 RMU — the three PDFs

All three are **PDFKit 0.15.1**, server-side, hand-positioned in PDF points; no HTML→PDF step, no
headless Chrome, no template engine. Each returns `Promise<Buffer>` streamed straight to the browser.
All are owner-only (`ownerId === req.userId`, else 404), authenticated by `?t=<jwt>`.

| Service | Route | Output |
|---|---|---|
| `pdf.service.ts` (368 lines) | `GET /api/offers/:id/pdf` | Technical offer, EN, A4 portrait 595.28 × 841.89, `MARGIN 50` |
| `pdf-commercial.service.ts` (455) | `…/commercial-pdf` | Commercial offer, bilingual EN/AR, A4, **5 fixed pages** |
| `pdf-sld.service.ts` (1118) | `…/sld-pdf` | Single-line-diagram set, **A3 landscape 1190.55 × 841.89** |

Shared mechanics you must respect:

* **`asset(name)`** tries four candidate paths and returns the first that exists; it is copy-pasted
  into all three services. **`tsc` does not copy `src/assets` into `dist`** — candidate 2
  (`__dirname/../../src/assets`) is what keeps `npm start` working.
* **`__onBreak` is a hand-rolled hook, not a PDFKit event.** Every *deliberate* `addPage()` invokes
  it. Any page PDFKit adds **automatically** (because `doc.text` crossed the bottom margin) gets no
  running header but still gets a numbered footer. Always break via `ensure()` or an explicit
  `addPage() + __onBreak?.()` pair.
* **`pageFooters()` must run after all content and before `doc.end()`**, and needs
  `bufferPages: true`. It writes `Page i of (count-1)` on pages `1..count-1` — the cover is excluded
  from both the numbering and the total.
* **Module-level font state** (`BODY/BOLD/ITALIC/AR/AR_BOLD`) is mutated by `setupFonts` per
  document. Fonts come from `C:/Windows/Fonts/arial*.ttf` on the dev box, and from bundled Amiri on
  Linux; **the same document therefore looks different on the two hosts** (Arial vs Helvetica for
  Latin, different metrics, different pagination). `pdf.service.ts`'s only Unicode fallback is
  `asset("font-regular.ttf")`, **which does not exist in the repo**.
* **Arabic** is handled three ways: font selection; `shapeAr()` pre-reverses every
  `[0-9A-Za-z%][0-9A-Za-z%.\-/]*` run so fontkit's RTL reversal cancels out — **which is why Arabic
  in `commercialContent.ts` must stay in clean logical order and must never be hand-reversed**; and
  the Arabic clause number is written as `` `${arHeading} .${i+1}` `` so RTL puts it on the right.
* `fmt(n)` in the commercial PDF prints **zero decimals**, so the four total rows can look internally
  inconsistent by ±1 unit.

SLD specifics: `frame()` draws the borders, zone numbers 1..8 and letters A..F, then a nine-cell
title block whose raw widths `[124.5, 56.8, 54.9, 55.8, 148.9, 21.6, 200.9, 233.2, 242.0]` were
traced off the reference drawing. Sheets: Cover, General Characteristics, SLD Cubicles, Layout,
Heaters' connection, **one E.F.I sheet per ring feeder beyond the incoming** (`max(0, nalCount-1)`),
Metering Circuits (only when `hasMetering`, and it is **a 378 KB bitmap, not drawn**), Name Plate.
Total = `6 + max(0, nalCount-1) + (hasMetering ? 1 : 0)`.
`buildCubicleList` orders the drawing **NAL…, MET, NALF…** while `assembleOffer` orders the technical
offer **PCC, PFC, PMC** — cubicle *numbers* in the SLD correspond to no list in the technical offer.
Hardcoded: signatories `Gazzar`/`Gazzar`/`""`, rev `R0` / `For Approval`, document-code fallback
`PL-P26-F01`, cover contact `Yasser El-Sayed`, name-plate size `15cm × 8cm`, busbar annotation
`630A-50HZ-…@ 1Sec.`, `"SF6 Type"` in the switch label.

**Product-type support:** the technical and commercial PDFs support all three families. The **SLD is
PSEC-only in practice** — the layout sheet hardcodes PSEC's 1700 × 1070 mm body and 500 mm cubicle
pitch, `switchDisc` always prints `"SF6 Type"`, and Lucy's feeders/transformers are mapped onto
NAL/NALF. The only guard is cosmetic: the button is hidden unless `productType === "PSEC"`.
**The endpoint itself has no product-type check.**

### 8.4 LV — the cost formula, exactly as coded

`calcPanel(p, f, abbDiscounts?)` — `frontend/src/lv/store.ts:1003-1101`. **Normal panel:**

```
for each component c where !isSpacer(c):
    ov    = abbDiscounts[abbKey(c)]                        // percent 0-100 or undefined
    frac  = ov != null ? ov/100
                       : (c.brand === "ABB" && c.eur > 0 ? f.abbDiscount : 0)
    base  = c.eur > 0 ? c.eur * f.euro : c.egp             // EUR list × EGP/EUR, else the EGP price
    compCost += base * (1 - frac) * c.qty
    cuKg   = (sizingMode === "cells") ? cuCellKg : cuPanelKg     // sane(cuC|cuP) × poles
    cuWeight += cuKg(c) * c.qty * buswayCopperMult(c.note)       // ×2 when the NOTE matches /busway/i

enclCost = Σ panelItems: (it.eur > 0 ? it.eur * f.euro : it.egp) × (1 - perItemOverride) × it.qty
           // NO global ABB discount on enclosures, ever; a per-item override still applies
         + Σ cell rows with qty > 0 (frozen r.eur/r.egp, else cellPriceEgp fallback)
sideCost = Σ cell rows where r.locked          // the "Sides" row

cuConnCost = cuWeight * f.copper
busbarKg   = (mainBusbarAuto(p) ?? p.mainBusbarKg) * copperTypeFactor(p.copperType)
busbarCost = busbarKg * f.copper
kits       = max(0, enclCost - sideCost) * kitRate(p)

unitCost    = compCost + enclCost + cuConnCost + busbarCost + kits
unitCostOps = unitCost * (1 + f.operations)
factor      = p.sellFactor > 0 ? p.sellFactor : f.factor        // per-panel override wins
sellUnit    = (factor > 0 ? unitCostOps / factor : unitCostOps) * (1 + (f.safetyFactor || 0))
totalSell   = sellUnit * p.qty                                  // panel qty multiplies the SELL only
```

`grandTotals(s)`: `sell = Σ totalSell`, `vat = sell × f.vat`, `incl = sell + vat`.
The Commercial Offer in USD divides EGP by `f.usd`.

**Factors** (`frontend/src/lv/data/factors.json`, overridable by the published catalogue):
`factor 0.7` (a **divisor**; **EDMS quotations start at 0.6**), `euro 57.5` (EGP/EUR, **cost** side),
`usd 50` (EGP/USD, **selling** side), `safetyFactor 0` (a **markup** `× (1 + x)`, UI-clamped 0-10 %),
`copper 770` EGP/kg, `sheetMetal 115` EGP/kg, `operations 0.05`, `abbDiscount 0`, `vat 0.14`,
`forms {1:0, 2a:.05, 2b:.05, 3a:.1, 3b:.1, 4a:.15, 4b:.15}` — **`forms` is loaded, typed, published
and read by nothing. The panel's `form` field does not affect price at all.**

`kitRate(p)`: `SR-Basic | Unikit | Local (Sheet Metal) | PLP | IS2 → 0.10`; `Pro-E → 0.03`;
`Minicenter | Primo | Pillars | Coffree | none → 0`.
`COPPER_TYPE_FACTORS`: `Bare 1`, `Raychem 1.02`, `Tin-plated 1.05`,
`Silver-Plated Connections 1.15` — applied to the **main busbar weight only**, never to connection
copper, so the KG shown carries the plating premium too.

**Two variant branches:**
* **LCP / KWHM** (`spareKind === "lcp"|"kwhm"`): rows with `type === "Enclosure"` count as enclosure;
  `enclCost = enclComp + lcpEnclosureEgp(p, f)`; `kits = enclCost × 0.10` **hard-coded regardless of
  family**; `cuWeight` always uses `cuP`; `cablesCost = p.cablesEgp || 0`; busbar is 0.
* **Plain Spare-parts cell** (`spareKind === "spare"`): `unitCost = compCost + mainBusbarKg × copper`
  with **no plating factor**, **no kits**, **no connection copper** and **no operations uplift**.

**`factors` live on the quotation.** Each QTN carries the rates it was created with; `normalize()`
merges only *missing* keys, and `repriceToCatalog` does not refresh them.
**`abbItemDiscounts` values are percentages (0-100); `factors.abbDiscount` is a fraction (0-1).**

### 8.5 LV — combinations

`frontend/src/lv/combos.ts`. Every generator returns
`ComboLine { qty, baseQty?, desc, comp?, groupLabel, scalable? }`; `comp === undefined` ⇒ the UI
creates an unpriced `freeComponent` row. Parts are resolved by `findByName(alias(desc))`, a **5-stage
fuzzy match** (exact `n` → exact `d` → `n` contains want → want contains `n` and `n.length > 12` →
`n` startsWith `want.slice(0,40)`) over `COMPONENTS` **in catalogue order — the first match wins**.

| Generator | Inputs / rules |
|---|---|
| `buildAts(type, frame, breakers)` | `type ∈ {"1oo2","2oo3"}` (**`"2oo4"` is declared `available:false`, template data pending**); `frame ∈ XT1..XT7, E1.2, E2.2, E4.2, E6.2`. Template from `COMBOS.ats[type][frame]`; `C.B (n)` placeholders replaced by the picked breakers; group labels normalised to `Source <n>` / `Interlock` / `Control CT`; 24 verbose→catalogue accessory aliases |
| `buildSync(units)` | Dynamic `SyncUnit[] = {kind:"source"|"bus", breaker}`. Per unit: breaker + the ATS `Source (1)` accessory set for its frame + a control module + a fixed accessory set. Identical units collapse into **one scalable group**. Exactly **one** `Selector 3 Position` per panel |
| `buildPhotocell(ratingA, cb?)` | Contactor/aux sized by the **smallest ladder rating ≥ ratingA**, else the largest; plus every fixed line. All four group labels are **stripped by `normalize`**, so the rows render flat |
| `buildMcc(kind, kw, type, withControl, qty)` | `kind ∈ {DOL-3Ph, DOL-1Ph, Star Delta}`. Label `"{kind} {kw} (Type {type})"` — **the multiplier is never in the label**, it is `qty / baseQty`. A `CAL…` side aux block's per-unit qty equals the number of `Contactor#…` parts (Star-Delta ⇒ 3). Star-Delta only gets an extra `CT-ERC.12` time relay right after `Selector 3 Position` |
| `buildPfc(input, cb?)` | **Phase 1 only: 400 V, 25/50 kVAR steps.** Capacitors counted as 25 kVAR units; 3× HRC fuse + 3× fuse base per step; contactors on the **variable** blocks only; controller `RVC-6` (1-6 steps) / `RVC-12` (7-12) / **both** (>12); ventilation always 1× Fan + 2× Filter + 1× Thermostat. P.F.C becomes **its own section**, not a group |
| `buildWd(key, cb?, accessory?)` | 13 kit rows keyed `<frame>-<poles>`. `FLD` and `RHD` have **no XT7 entry** — the accessory is silently skipped. `motorized` splices in the whole `buildMotorized` recipe |
| `buildMotorized(frame, cb?)` | Frames `XT1/XT3, XT2/XT4, XT5, XT6, XT7M, E1.2, E2.2 - E6.2`. **XT7 maps to `XT7M`** — the breaker must be the motorizable variant |
| `buildIndicationLamps()` / `buildPushButtons()` / `buildFire()` | Flat 3-, 2- and 3-line sets. The first two have their group stripped by `normalize`; **`Fire` keeps its group** |
| `lcpGroupComponents(n)` (in `store.ts`) | The fixed per-group LCP set × n: Green + Red pilot, `CP1-10G-10`, `CP1-10R-01`, **2× Terminal Block**. **Unresolved parts are silently dropped** — unlike `standardEdms`, which falls back to `freeComponent` |

Combination membership is a `group` string plus `baseQty` (per-unit qty) and a shared `comboId`.
The multiplier ×N is **derived** as `round(first.qty / (first.baseQty ?? first.qty))`, never stored.
"Scalable" is partly name-based: `/\(Type \d+\)/.test(group)` **or** a member carrying
`comboScalable`. `effectiveGroups()` lets an ungrouped row (or a spacer) inherit a group only when the
same group brackets it on both sides **within the same section**; a cross-section drag therefore
**destroys** combination membership.

### 8.6 LV — sizing

**Main busbar (Panels mode)** — `mainBusbarAutoRaw` (`store.ts:939`):
```
if sizingMode !== "panels"                          → null
if family ∉ {SR-Basic, Unikit, Local (Sheet Metal), Pillars} → null
area   = Pillars ? 500 : busbarBarAreaMm2(p.ratingA)
height = Pillars ? 1000 : the FIRST number in the slot-1 enclosure name
kg     = area × height × (p.busbarPoles || 3) × 0.000009 × (layout === "Double" ? 2 : 1)
```
Bar-section ladder: `≤160 → 100`, `≤250 → 200`, `≤300 → 250`, `≤400 → 300`, `≤630 → 400`,
`≤800 → 500`, **`> 800 → 0`** (Panels mode is not allowed above 800 A). `busbarPoles` is
bar-equivalents and may be fractional — **Pillars is 4.25** (3P + N 100 % + E 25 %).
`mainBusbarAuto` returns `null` once the user confirms `mainBusbarOverride`, and `calcPanel` then
uses the typed `mainBusbarKg`.

**Cells mode** uses the **Copper Tool** instead: `mainBusbarKg = round(copperTotal(type, tool) × 10)/10`,
where `copperTotal` sums `w(p, csa, 3) + w(n, csa, 1) + w(e, csa, 1)` per rating —
**phase lengths count ×3, neutral and earth ×1 each** — with `K = 0.000009` kg/mm³ and separate CSA
ladders for Pro-E and PLP/IS2 (e.g. 4000 A → 3600 vs 2400 mm²).

**LCP enclosure auto-sizing** (`store.ts:522-568`): widths `[400,600,800,1000]` mm give
`2/3/4/5` groups per row; `N = ceil(G / perRow)`; `H = LCP_HEIGHT_BY_ROWS[N]`
(`1→300 … 15→2000`); width snapped up by `lcpMinWidth(H)`; depth from `lcpDepth(H, W)`; every
candidate snapped to a **really stocked** box; **the lowest-priced candidate wins**.
`LCP_MAX_ROWS = 15` ⇒ a hard ceiling of **75 groups**; beyond that the UI only says "split into
multiple panels". **Double layout: the second box is never auto-sized** — the split rule is undefined.

**KWHM auto-sizing** (`store.ts:450-520`): widths `[400,600,800,1000]` give `1/2/3/4` meters per row;
`target = N×400 + cbFixed + cbPerRow×N + 300` mm (40 cm per module row + breaker allowance + 30 cm
clearance), per-content config `KWHM {0,0,minDepth 200}`, `KWHM+MDRC {200,0,250}`,
`KWHM+MOULDED_CASE {0,400,300}`. Special case: `Content === "KWHM"` with ≤1 meter →
a fixed **400 × 300 × 150** box. A width the family does not stock falls back to **SR-Basic for that
width**, and `kwhmAutoSize` returns the winning box's family — so the UI **silently switches
`panelsSizing.family`**. An unknown `Content` returns no box at all.

**Enclosure pricing preference:** reference-picked box → catalogue price of the sized box in the
family (preferring the SKU whose name starts with a digit over a `new …` variant) → **weight-based**
`outerArea(m²) × 2 mm × 7.85 kg/m²/mm × f.sheetMetal`.

**Gating:** Panels mode only up to `PANELS_MAX_INCOMER_A = 800` (above it the UI force-switches to
Cells and **empties `panelItems`** — this fires on mount, so merely opening a legacy panel mutates
it); Double layout only for `SR-Basic|Unikit|Local (Sheet Metal)` with a slot-2 width of 600 or
800 mm whose H and D match slot 1; Pro-E IP31 unavailable at depth 90 + 2 mm; `FIXED_SECTIONS`
(`Main Incoming`, `Outgoings`, `Metering`) cannot be renamed, removed or duplicated.

**Standard LV EDMS** (`standardEdms.ts`, EDMS QTNs only): 7 transformer sizes
(`300, 500, 800, 1000, 1600, 2000, 2500` kVA) × 4 variants (`No|None`, `Yes|None`, `Yes|SWF`,
`Yes|C.B`) = **28 entries**. There is deliberately **no "No P.F.C + outgoings" standard**.
PLP depth is taken from the sheet's family label (70 up to 800 kVA, **90 for 1000-2000**, **110 at
2500**), *not* from box row names. From 1600 kVA up the outgoing way is 400 A, below it 250 A.
`SWF_WAYS` pins **`poles: 3`** on switch fuses (a zero would zero their copper).
`applyStdPanel` rewrites `name`, `ratingA`, `sections`, `components`, `sizingMode: "cells"`,
`cellConfig`, `copperTool` and `mainBusbarKg` **together**, and that combined patch is how the
`EdmsStandardWarningModal` distinguishes "building from the standard" from "editing it".

### 8.7 LV — Material List and exports

`buildMaterialList(s)` aggregates every panel × `p.qty` into six supplier buckets plus `copperKg`.
Keys: components `c|${ref || name}`, enclosures `e|${ref || name}`, cells `cell|<type>|<desc>`.
Same key ⇒ quantities add and **the first occurrence's supplier / description / eur win**.
Bucketing hinges on **`isAbbSupplied(r) = supplier === "ABB" && (r.eur ?? 0) > 0`** — the whole
discount-eligibility rule. Blocks are numbered **1 ·, 2 ·… by visible position**, so hiding a table
renumbers the rest: `ABB Products`, `Other Suppliers`, `PLP Cells`, `ABB Enclosures`, `IS2`,
`Copper — total project weight`, `Pro-E`.

Exports:
* **Technical Offer PDF** — `exportTechnicalPdf` (`lv/technicalPdf.ts`) reads DOM hooks
  `[data-pdf-cover]`, `[data-pdf-header]`, `[data-pdf-notes]`, `[data-pdf-panel]`,
  `[data-pdf-separator]`, `[data-pdf-specblock]`, `[data-pdf-comptable]`, `[data-pdf-head]`
  (keep-with-next), `[data-pdf-link]`, `.pdf-footer`, `.no-print`, under a `[data-pdf-root]` /
  `[data-to-root]` wrapper. **Renaming or moving any of these silently breaks the export.** Pages are
  rasterised with `html-to-image.toJpeg({quality: 0.92, pixelRatio: 2})` and placed at
  `0,0,210,297` mm, then anchors are re-attached as real PDF link annotations. Text is **not
  selectable**.
* **Commercial Offer PDF** — `exportSheetsPdf` over `[data-co-root] > .a4-sheet` blocks; live
  `<input>`/`<textarea>` values are baked into spans first because `cloneNode` loses them.
* **Material List XLSX** — `materialAoa(blocks)` → SheetJS, sheet `"Material List"`, default filename
  `ML-<qtn> Rev NN`.
* **ERPNext CSV** — `buildErpItemsCsv(s)`: `Bulk Edit Items` header, 56 columns, CRLF, **one row per
  panel**. `CODE_STEM = "EG-374674477"`, `TAX_TEMPLATE = "VAT14% - PL"`,
  `WAREHOUSE = "Work In Progress - PL"`. Per-family cost centres; **`PLP` is `noTax: true`**.
  Transaction columns follow `s.offerCurrency` (USD only when set **and** `f.usd > 0`); the
  `base_*` "(Company Currency)" columns are **always EGP**. Skips plain spare-parts cells and any
  family with no ERP mapping — **LCP/KWHM panels do get a row** (their family is SR-Basic/Local).
* **Send to sales** (SUBMITTED only) — flips tabs, waits up to 5 s for each capture root, builds both
  PDFs as blobs, then: Outlook Graph draft (`Mail.ReadWrite`, **draft only, never sent**, no upload
  session so >~3 MB fails) → `navigator.share` files (needs a **fresh** gesture, so a second tap is
  staged) → download + `mailto:`.
* Both PDF paths are gated by `exportBlockers(s)` — **warnings you can accept and proceed**, never a
  hard block: `🖍️ Highlighted panels`, `Zero price`, `No cells selected`, `Missing copper`,
  `LCP cables missing` (**KWHM is not checked**). `NO_BUSBAR_FAMILIES` (`Minicenter`, `Primo`,
  `Coffree`) are exempt from the busbar check because 0 kg is correct for them.

### 8.8 P-CSS

A pure calculator over hand-transcribed tables. `data.ts:1-6` is load-bearing policy: the numbers
were transcribed mechanically from `tools/reference/pcss-selector-source.html` and **data quirks were
kept and flagged rather than fixed — changing a number changes what the factory builds.**

Seven steps, revealed (never navigated): Project data → RMU → switching configuration → smart type →
transformer → LV standard (EEHC or not) → LV breakers. `SMART_ELIGIBLE_RMUS` excludes both PRALs, so
a PRAL job is a **6-step** job with the numbers closed up.

**The sizing maths** (`sizing.ts`):
* Panel usable widths: **1360 / 1710 / 1910 mm** for the 175 / 210 / 230 cm panels; **1400 mm** fixed
  for Incoming Only; `null` for "any".
* `totalUsedMm` measures **two different things on purpose**: in inout + Technical it sums every BOM
  row that is not `excludeFromSizing` via `mccbWidthMm(model, amp)`; otherwise it sums the picked
  breaker quantities + one unit on the PF sizing frame + switch fuses (inout) + the single
  EEHC-recommended incoming breaker (Incoming Only) + custom items.
* **EEHC gaps are added only when `useCatalog && iec === "eehc" && count > 0`**:
  `numGaps = count + 1`, `swGaps = min(switchFuseQty, numGaps)`, `stdGaps = numGaps - swGaps`,
  `total += stdGaps × 60 + swGaps × 20`. So inout **Sizing** and **Incoming Only** never count gaps.
* `lvPanelDecision` applies hard overrides first (`pral24` → 230; `psec50/murge/lucy + 2+1+M` → 230;
  `psec375 + 3+1+M` → 230), then bands the transformer (`≤500 → 5ST/175`, `≤1000 → 10ST/210`,
  `>1000 → 16ST/230`), then **escalates one band while either no blueprint at that chassis passes
  `checkDesignCompatibility` or the width overflows**, capped at 230.
* `spaceInfo` status: `over` if remaining `< 0`; `warn` if remaining `< 10 %` of the panel width; else
  `ok`; `unknown` when `emptyMm === null`.
* **Free space can INCREASE when you add a component** — that is the auto-upgrade escalating to a
  wider chassis, and the amber "⬆ Panel upgraded" banner exists to explain it.

The **main incoming breaker is never a user choice**: `METERING_DATABASE` is looked up as the *first
band ≥ the transformer rating* (so 315 and 2500 are band ceilings, and anything above 2000 clamps to
the 2500/4000 A band), and the brand is forced to **ABB** because the table only names ABB parts.
Power factor: one step = 25 kVAr @525 V = **14.7 kVAr @400 V**; the capacitor bank row takes **no**
panel width (only its protection MCCB does); brackets exist only at 0-800 / 1000-1250 / 1500-1600 /
2000 KVA — **801-999, 1251-1499, 1601-1999 and >2000 have no bracket** and the UI says so.
`SWITCHFUSE_WIDTH`: 160 A → **50 mm** (corrected from the source's 500 mm on the owner's instruction
2026-07-28), 250/400/630 A → 105 mm. Every Technical switch fuse drags a `Fuse Link (Set of 3)`
(qty 3, width 0) and removing the fuse removes them.

---

## 9. Cross-cutting conventions a contributor must follow

**Schema and data**
1. **Every new column must be nullable or defaulted.** `prisma db push --accept-data-loss` runs on
   every deploy with no data step. Never make a column required, never rename one, never drop
   `LvQtn.coOwnerId`, `User.role`, or the `submitted`/`submittedAt` mirrors.
2. **Never give `LvQtn.status` (or any new state column) a `@default`** — `db push` stamps the default
   onto every existing row.
3. **Never hand-edit the `datasource` block** in `schema.prisma`; `scripts/db-setup.js` owns it. Check
   `git diff backend/prisma/schema.prisma` before committing if you ever set `DB_PROVIDER`.
4. **Keep the pre-lowercased `search` columns.** Do not "improve" them to Prisma's
   `mode:"insensitive"` — that is Postgres-only and would make local SQLite and production diverge.
5. **`LvComponent.sortIndex` is semantics, not cosmetics.** Append only; never renumber; never let a
   spreadsheet set it.
6. **`LvEnclosure.name` is an identity** (cell matching parses dimensions out of it, and it is half of
   `@@unique([fam, name])`). Imports must never rewrite it.

**Backend**
7. **Every new async middleware needs `try { … } catch (e) { fail(res, e) }`** — Express 4 does not
   catch rejected promises, and an uncaught rejection hangs the request forever.
8. **Route order is load-bearing** in two places: `/api/notifications/read-all` before `/:id/read`
   (`app.ts:112-113`), and the static QTN paths before `/:id` (`qtns.routes.ts:31-36`).
9. **Never write `LvQtn.status` / `submitted` / `submittedAt` outside `domain/qtnStatus.statusWrite()`**,
   and never read `row.status` directly — always `qtnStatus(row)`.
10. **New permission keys must not be a prefix of an existing key.** `approverIds()` substring-matches
    the perms JSON, so `qtn.approve` already matches `qtn.approveOwn`. Add to `PERMS` **and**
    `PERM_LABEL`, decide about `ROLE_PRESETS`, mirror the presets into `AccessCenterPage.tsx`, then
    enforce it. `ADMIN_PERMS` picks it up automatically.
11. **Notifications go through `notify()` / `notifyAll()`, outside any `prisma.$transaction`**, and
    pass `origin: originOf(req)` so the e-mail link is absolute.
12. **Escape every value you interpolate into an e-mail** — `emailShell(heading, bodyHtml)` escapes the
    heading and **trusts `bodyHtml`**.
13. **The commercial PDF and the JSON API must both go through `resolvePricing()`**, never
    `priceForConfig()` directly, or the screen and the re-downloaded PDF can disagree about money.
14. **Anything that filters `PriceChange` must qualify by `entity`** — the table is three audit logs
      in one.
15. **Prefer `fail(res, err)`** for error responses; it is the only thing that maps ZodError to a 400.
    Prisma `P2002`/`P2025` become a bare 500 unless you handle them (only
    `offers.controller.handleError` does).

**Frontend**
16. **Never gate UI on `AuthUser.role`.** Use `MyAccess.perms` from `/api/access/me`.
17. **All HTTP goes through `request()` in `api.ts`.** Only three call sites legitimately bypass it
    (`catalogSource.ts:142`, `:203`, and the ABB datasheet fetch), and each attaches the token by
    hand; bypassing also bypasses the 401 handling.
18. **Every poller must `.catch()`.** An unhandled rejection can reach the 401 path and
    `window.location.reload()` the app under the user's hands.
19. **The LV catalogue arrays are mutated in place**; React cannot see it. `installCatalog` must call
    `rebuildDerived()`, and anything memoised off `COMPONENTS`/`ENCLOSURES` must key on
    `catalogVersion()`.
20. **`position: fixed` inside a tab is captured by the `animate-fade-up` wrapper's transform.** Every
    overlay must be `createPortal(..., document.body)` **and** tagged `no-print`.
21. **Only `.print-area` prints** (`index.css` hides everything else by `visibility`). There must be
    exactly one visible `.print-area` when `window.print()` runs, and the animation-neutralising rules
    in the print block are essential.
22. **`NumberInput` emits `NaN` for an empty field.** `NaN` serialises to `null` and the server's Zod
    rejects `null` — guard it at every call site.
23. **`lv/qtns.ts normalize()` runs on every load and must stay idempotent.** Any new `LvState` field
    or QTN `kind` must be listed there or it is silently downgraded/undefined (an undefined factor
    NaNs the entire cost chain).
24. **Arabic source text stays in logical order** (both `commercialContent.ts` and the LV Arabic terms).
25. **When you add a client-side mirror of a server constant, note it.** Already duplicated:
    `ROLE_PRESETS`, `QTN_STATUSES`/`QTN_STATUS_LABEL`, `MAX_ATTACHMENT_BYTES`,
    `COMPANY_DOMAIN`, the RMU brand/spec availability lists (four copies), the human `configCode`
    builder, and the commercial totals maths.

---

## 10. Gotchas — merged, de-duplicated, with the consequence of ignoring each

### Deploy, schema and environment

| # | Gotcha | Consequence |
|---|---|---|
| G1 | `prisma db push --accept-data-loss` runs on **every** deploy | A column you delete from the schema is silently dropped in production. A required new column breaks the deploy |
| G2 | A missing `DATABASE_URL` on Vercel only **warns** | Green deploy, no tables, every `/api/*` 500s |
| G3 | Every `process.env` read happens at module load | Editing an env var in the dashboard changes nothing until a redeploy. Rotating `JWT_SECRET` invalidates every 30-day session |
| G4 | `vercel-build` is `vite build` only — no `tsc` | Type errors deploy |
| G5 | `NODE_ENV` not `"production"` in a deploy | `POST /api/auth/dev-login` becomes a full authentication bypass (it mints a token for the **oldest** account) and one-time codes are echoed in API responses |
| G6 | `start-app.bat` runs `prisma migrate deploy`; there are no migrations | A fresh local DB gets no tables and `db:seed` fails. Use `npx prisma db push` |
| G7 | `stop-app.bat` is `taskkill /F /IM node.exe` | Kills unrelated editors and servers |
| G8 | `backend/dist/` is stale (it still holds a removed `support.controller.js`) | `npm start` runs old code. Always `npm run build` first |
| G9 | Body limits disagree: `express.json({limit:"8mb"})` vs Vercel's 4.5 MB request cap | A 5 MB profile photo passes Zod and fails at the platform edge with a non-JSON error |
| G10 | `vercel.json`'s `includeFiles` is the only thing that ships `backend/src/assets/**` | Drop it and every logo/photo silently vanishes (`safeImage` swallows it) and all Arabic renders blank |
| G11 | `tsc` does not copy `src/assets` into `dist`; `backend/api/index.ts` is outside `rootDir` | The `asset()` candidate list and Vercel's own compile are what make both work — do not "tidy" either |

### Auth, access and security

| # | Gotcha | Consequence |
|---|---|---|
| G12 | `accessOf` ignores the legacy `role` column once `tier` is set | Writing `User.role` on a migrated user changes nothing. The legacy price-users screen is a silent no-op |
| G13 | `requireOwner` means `access.manage`, not the `OWNER` role; `requirePriceAdmin` means `prices.edit` | Reading the names literally sends you the wrong way |
| G14 | A permission change is instant; a password change is not | `POST /api/auth/reset` does **not** invalidate outstanding tokens — no `tokenVersion`, no blacklist, no logout endpoint. A stolen token is good for 30 days |
| G15 | `?t=<jwt>` puts a full 30-day bearer token in URLs (every PDF and attachment link) | The token lands in browser history, `Referer`, and every proxy/platform access log |
| G16 | `qtn.approve` is a **prefix** of `qtn.approveOwn`, and `approverIds()` substring-matches the perms JSON | A user granted only `qtn.approveOwn` receives every `QTN_WAITING`/`QTN_SUBMITTED` notification while `requirePerm("qtn.approve")` correctly refuses them the queue |
| G17 | Rate limiting is a per-process `Map`; `/login` and `/reset` have **none** | On Vercel the effective limit is 5 × instance count, and password guessing is throttled only by bcrypt |
| G18 | `originOf(req)` trusts `x-forwarded-host` | With no `APP_URL`/`CORS_ORIGIN`, a spoofed Host header puts an attacker's origin in the "Open the quotation" button of a colleague's e-mail |
| G19 | `GET /api/qtns/assignees` returns every user's id, name and e-mail to any signed-in user | Deliberate today; a hazard the moment external accounts exist |
| G20 | `GET /api/catalog/rmu`, `/api/catalog/lv` and `/api/pricing/verify` expose price data with only `requireAuth`; `POST /api/offers/preview` needs **no auth at all** | Anyone who can reach the API can enumerate the price list by iterating configurations |
| G21 | `POST /api/offers` runs under `optionalAuth` | An anonymous or expired-token caller gets **201** with `ownerId: null`; the offer is unreadable by anyone (including its creator) and its PDFs 404 — which `downloadFile` happily saves as a `.pdf` |
| G22 | `emailShell(heading, bodyHtml)` does not escape `bodyHtml` | A new template that interpolates user text is an HTML-injection hole in an e-mail |

### Price book

| # | Gotcha | Consequence |
|---|---|---|
| G23 | **Publish is not atomic** — four sequential writes | If anything after the first snapshot fails (a serverless timeout on the ~500 KB LV payload is realistic), `PriceSnapshot` for version N exists while `PriceBook.version` is still N-1, and **every later publish retries version N and dies on `@@unique([domain, version])`**. Recovery is manual (delete the orphan snapshot or bump the version) |
| G24 | The kill switch is one-way-fragile: any publish sets `source: "db"`, and **every LV edit auto-publishes** | A single LV price change silently cancels `source = "json"`. While it is on, `getLvCatalog` returns `{source:"bundled", data:null}`, which makes every browser drop its cached catalogue |
| G25 | **RMU edits are drafts; LV edits are live** | The publish bar's copy "Every price change goes live as you make it" is true of the LV half only |
| G26 | Publish blockers are **RMU-side**; there are none for LV | One unpriced RMU panel blocks an LV spreadsheet import from going live (which is exactly why `publishCurrentPricesDetailed` returns `blockers`). A zero-priced LV component publishes freely and then quotes as free |
| G27 | `GET /api/catalog/rmu` serves the **draft**, not the published snapshot | Unpublished RMU edits leak through it. Harmless only because nothing calls it |
| G28 | `refreshPriceBook` re-queries on **every** call while `lastError` is set | A database outage turns the 10 s cache off and hammers the DB with one failed query per request |
| G29 | The cache is per serverless instance | Worst-case visible staleness after a publish is ~`TTL_MS` **per instance**, and two concurrent requests can legitimately see different versions. Use `X-PriceBook-Version` when debugging |
| G30 | `POST /api/pricing/seed` is a self-service OWNER grant while `version === 0`, and re-running it later **rewrites every RMU price with the bundled values and sets `active: true` on every row** *before* it checks | Re-seeding reverts online price edits and un-retires everything; if the check then fails it reports "nothing was published" while the draft has already been rewritten, and the next LV edit publishes those reverted prices |
| G31 | `buildRmuPayload` filters `active: true`; **`buildLvPayload` does not** | Retired LV rows stay in the payload with `active:false` on purpose — the combination builders find parts by description. "Tidying" that breaks them |
| G32 | Re-seeding a chunked LV catalogue only replaces the slices it covers | A shorter new catalogue leaves the previous tail rows as orphans |
| G33 | `getPending` caps at 200 and `getHistory` at 150, unpaged | A large import writes one audit row per changed field, so the pending list shown before publishing is an incomplete sample (the publish still stamps *all* pending rows) |
| G34 | `ETag: "lv-<version>"` is set but `If-None-Match` is never checked | The ~500 KB payload is re-sent on every poll |
| G35 | The ABB datasheet proxy scrapes ABB's HTML with two regexes | Both break silently on any ABB markup change; the symptom is a 404 "No data sheet is published" or a 502. It also sets `Cache-Control: public, max-age=86400` on an authenticated response |

### RMU

| # | Gotcha | Consequence |
|---|---|---|
| G36 | Two codes, one field name: `GeneratedOffer.panelCode` and `ConfigPricing.panelCode` both hold the **product** code, while the price key comes from `buildPanelCode`/`buildPriceKey` | Reading either as "the panel code from the price list" sends you the wrong way |
| G37 | Adding a family/brand/option means touching `famPrefix`, `buildPanelCode`, the JSON keys, `tools/pricing-import.cjs:43`'s regex **and** `derivePriceKeyFor` together | Otherwise new rows are unreachable |
| G38 | **LUCY reuses `nalCount`/`nalfCount` as feeders/transformers** | Any generic code that reasons about "ring ways" is wrong for Lucy |
| G39 | `GeneratedOffer.panelCode` is `""` for Lucy | PDF filenames get a double dash; the RMU list's Code column is blank for every Lucy offer |
| G40 | `-With Fuse` pricing keys off `hasMetering && meteringWithFuse` alone, while the BOM adds the VT fuse only when `vtCores >= 2` | A single-core VT ticked "with fuse" is charged the premium (~+$700-900) with no fuse in the technical offer |
| G41 | `nalfItems()`' `brand` parameter is unused — the fused-cubicle line is hard-coded `ABB` | A Murge PSEC offer prints `Murge` in the PCC block and `ABB` in the PFC block |
| G42 | The engine re-runs on **every read** (`decorate` calls `assembleOffer` per offer, including in the list) | A BOM text change retroactively rewrites the technical content of **every existing offer**. Only money is frozen, not wording |
| G43 | Legacy offers (`pricedAt == null`) re-price on read | The same old offer can print different money after a publish. There is no backfill |
| G44 | `validityDays`, `deliveryWeeks`, `paymentTerms`, `warrantyMonths` **never reach the PDF** | Changing them changes nothing a customer sees; the printed terms are static boilerplate (1 week validity, 3-4 months delivery, 50/50 payment, 12 months warranty, ±15 % variation, 1 %/week storage) |
| G45 | The commercial totals block prints `Total Value (Excluding VAT)` = `totalExclVat` (**already net of discount**) and then the discount as a separate row | On any discounted offer the four visible rows do not add up. `CommercialData.subtotal` exists and is never printed |
| G46 | `√` (U+221A) is emitted by the metering BOM but is not in WinAnsi, and the only Unicode fallback font does not exist | Metering VT rows lose the glyph in production while looking fine on the dev box. The SLD author already worked around it by writing `V3` |
| G47 | The offer is created **by the download button**; the `created`/`sig` cache keys on the entire payload | Any edit between two downloads mints a **new** `PL-YYYY-####` record with `submittedAt` set, inflating the weekly chart and the home history. Nothing deletes the previous one, and nothing in the UI hints at it |
| G48 | `rate = currency === "EGP" ? usdRate || 1 : 1`, and `fetchRate()` swallows every failure | With the rate API down, a $4,828 panel is quoted as "EGP 4,828" on screen **and in the PDF** — ~50× under value, silently |
| G49 | `priceTouched` latches forever once the user edits the unit price | Switching currency afterwards keeps the old figure and re-labels it. Nothing re-converts |
| G50 | The list price is a **floor in name only** | Nothing server-side rejects a unit price below it, and there is no discount cap below 100 % or approval threshold |
| G51 | `Offer.offerDate` is a free-text `String?` | Whatever the user typed is printed on the customer PDF |
| G52 | `nextOfferNumber()` uses the server's `getFullYear()` | Numbering flips year at server-local (UTC on Vercel) midnight, and two concurrent creates race into a `P2002` → 409 |

### SLD drawing set

| # | Gotcha | Consequence |
|---|---|---|
| G53 | The SLD never paginates horizontally: `colW = CW / n`, `railL + span*(i+0.5)/n` | An 8-cubicle unit gets ~142 pt columns and labels drawn at fixed offsets overlap neighbours |
| G54 | Two different cubicle orders exist (`buildCubicleList` vs `assembleOffer`) | SLD cubicle numbers match no list in the technical offer |
| G55 | Designation counters are computed independently per sheet | Heater MCBs `-F1..-Fn` collide with E.F.I MCBs starting at `-F6`; heater terminals `12+i*2` collide with E.F.I terminals `20+idx*2` |
| G56 | `table()` has a fixed 22 pt row height and does not measure text; `generalCharacteristics` hardcodes the spec-row count `13` in `cy2 = CY + 78 + 13*22 + 30` | A long label overflows silently; adding or removing a spec row makes the Climate table overlap or float |
| G57 | `peak = ratedShortCircuitKa * 2.5` in the SLD vs `RATINGS[...].peakCurrentKa` in the technical offer | PSEC-24 prints 62.5 kA on the drawing and 50 kA on the offer for the same unit |
| G58 | The SLD hardcodes `SF6 Type`, `630A`, `50HZ`, `@ 1Sec.`, ABB CT/VT makers, `CL 0.5FS5`, `10VA`, `100VA` and a single-core VT | A PRAL (air) unit is labelled SF6; `busbarCurrentA`, `ratedFrequencyHz`, `shortCircuitDurationS`, `ctClass`, `vtClass` and `vtCores` are all ignored; a `CHINT` unit is drawn as ABB |
| G59 | `safeImage` and the font loaders swallow every failure | A missing asset produces a silently incomplete PDF, never a 500. Check `includeFiles` and the `asset()` candidates first |

### LV workflow and configurator

| # | Gotcha | Consequence |
|---|---|---|
| G60 | **Every save failure is silent**: `saveQtn(...).catch(() => {})` in both the debounce and the unmount flush, with no "saving…" indicator, no retry and no dirty flag | An estimator can type for an hour against a 404/409 and lose everything. Be extremely careful tightening `update`'s guards |
| G61 | **No optimistic concurrency anywhere** — no version, no ETag; `syncFromServer` deliberately never pulls state for a non-co-worked QTN | Two tabs (or two devices) of the same user overwrite each other without warning; two approvers can both approve |
| G62 | `up`/`upPanel` **drop patches silently** when `readOnly` or Co-Work ownership says no, and nothing in the UI is `disabled` for those reasons | On a submitted or cancelled QTN, and for a co-owner, panel details, Selectivity, sticky notes and Material-List discount inputs all look editable and quietly do nothing |
| G63 | `up({selectedId})` goes through `apply` | Selecting a panel enters the undo stack and re-triggers the autosave — on a locked QTN, a `PUT` that 409s invisibly on every click |
| G64 | Keyboard Undo/Redo is registered with `[]` deps, capturing the **first** render's closures where `readOnly === false` | Ctrl+Z mutates state on a locked or cancelled quotation. Locked statuses are saved by the server's 409; a **cancelled DRAFT is not**, so the edit persists |
| G65 | `cancelled` is derived from `listQtns()` — **your own quotations only** — and computed once per `qtnNum` change | A newer revision owned by someone else (after a hand-over or a manager's amend) does not mark the old one cancelled in the configurator, even though the all-users list page shows it |
| G66 | Revision lives in **two** places: the `-N` suffix `amendQtn` writes into the number, and `project.revisionNo` typed on the Project tab | Filling both prints `QTN-26-0001-2-2` on the cover, while the PDF filename says `Rev 00`. Nothing reconciles them |
| G67 | `nextNumber` takes the **trailing** digits of the owner's numbers | An owner holding `QTN-26-0001-12` gets `QTN-26-0013` next. `duplicate` has no retry, so two concurrent duplicates hit `@@unique([ownerId, number])` → 500 |
| G68 | Panel order under Co-Work follows the **saver's** order, with other people's unsent panels appended | A co-worker's save can reshuffle the owner's panels, and panel numbering in the offer follows array order |
| G69 | A primary owner's project-wide Specs change (and `applyCatalogPrices`) rewrites **all** panels, but `mergeCoWork` restores the co-worker's panels from the stored state | Those panels silently keep the old value |
| G70 | `announce()` is **awaited** before the HTTP response and sends mail **sequentially** per recipient (10/10/20 s nodemailer timeouts) | With several approvers and a slow SMTP host the Vercel function limit is exceeded: the transaction already committed, so the state moved but the client sees a failed request |
| G71 | `list`, `listAll` and `queue` fetch the entire `state` JSON for every row and throw it away | Megabytes per request. `listItem` also needs both `status` **and** `submitted` if you add a `select` |
| G72 | Nothing validates content on a transition — the "sales support engineer required" rule and the per-panel checks are **UI-only** | A direct API call can send an incomplete quotation for approval |
| G73 | The stale-price alert filters `submitted: false` only | `WAITING_APPROVAL` and `APPROVED` quotations appear in the alert while `update` refuses the re-price with a 409 |
| G74 | `duplicate` writes **no audit row** and leaves `status` NULL | An amendment (duplicate + rename) leaves no trace in `QtnEvent`, and the copy is indistinguishable from a pre-workflow legacy row |
| G75 | `returnReason`/`approvedAt` are cleared only by an APPROVE | A withdrawn-then-resubmitted quotation still carries the old reason in `workflowOf`; only the UI's `status === "RETURNED"` condition hides it |
| G76 | `rename` answers **HTTP 200 with `{ok:false}`** on every failure | Deliberate — the client only treats thrown errors as failures. Changing it to a 4xx breaks renaming |
| G77 | The legacy aliases mostly no longer work: `POST /:id/submit` on a draft 409s (no `DRAFT → SUBMITTED`), `/unsubmit` now needs `qtn.reopen` | Nothing in the current frontend calls them; `submitQtn`/`unsubmitQtn` are dead exports |
| G78 | `LvConfiguratorPage.tsx` contains a literal NUL byte at offset 363835 | ripgrep classifies it as **binary** and stops after the first match, so `Grep` results for that file are unreliable — read it directly or use `grep -a` |
| G79 | The Summary tab is written to `localStorage` but omitted from the `TABS` restore whitelist | Reopening a QTN always lands on Project |
| G80 | `combineSel` needs ≥2 rows; `deleteSel` confirms **only above 3 rows**; `Delete`/`Backspace` delete whenever a selection exists and focus is not in a field | Backspace on a focused button wipes up to 3 rows with no confirmation |
| G81 | The Qty column means **two** things: with `baseQty` set it edits the **per-unit** qty, and the group's ×N multiplies it | `Σ Qty` sums per-unit quantities while `Σ Total` uses the scaled qty — they do not reconcile by inspection. Editing a member's `qty` directly desynchronises the whole group's ×N |
| G82 | A **cross-section** drag drops combination membership and lands the row at the **end** of the target section | Only a within-section drop can join a combination |
| G83 | `comboId` is **not** an identity — duplicating a combination leaves several groups sharing one | Do not use it to identify a combination |
| G84 | `PanelEditor` writes `ratingA: 0` when the incomer is removed | The panel immediately fails `panelInvalid` and blocks all three output tabs |
| G85 | `SizingCard.setFamily` clears `panelItems` and overwrites `busbarPoles` (3, or 4.25 for Pillars) | Any hand-tuned pole count is lost on a family change |
| G86 | Main Busbar (KG) in Panel details shows the **unplated** kg; the cost card and the breakdown window show the **plated** kg | With any copper type other than `Bare`, two different numbers appear under the same label |
| G87 | `LcpEditor` always writes section `"LCP"`, even on a KWHM cell whose `sections` is `["KWHM"]`, and `TechnicalTab` renders only sections listed on the panel | **A KWHM cell prints "No components." in the Technical Offer and its PDF, while `calcPanel` charges for those rows and the Material List lists them.** LCP works only because the label happens to match the literal. Fix: use `p.activeSection`/`p.sections[0]`, plus a migration for existing KWHM quotations |
| G88 | `applyBox` no-ops entirely in Double layout, but the candidate table still renders a `✓` | Both box sizes must be picked by hand and nothing says so |
| G89 | `MatTable`'s `withSupplier` is never passed `true` | The "Other Suppliers" table shows no suppliers |
| G90 | The Material-List discount **default** is keyed on `supplier` while the **price** is keyed on `brand` | A blank-brand, EUR-priced component shows the global ABB discount as its default but is priced with 0 % |
| G91 | `buildMaterialList` merges rows by `ref \|\| name` and keeps the first row's `eur`/`supplier` | Two panels holding the same ref at different frozen prices aggregate into one row whose discount eligibility comes from whichever panel was first — so the Material List can disagree with `calcPanel` |
| G92 | Material-List table numbering is **positional** | `2 · ABB Enclosures` in ABB mode is `4 · ABB Enclosures` in Full mode, and the Excel export follows the current toggle |
| G93 | `resetAbbDiscounts` clears **every** override, including enclosure and cell overrides the global discount never applied to | Silent loss of deliberate per-item pricing |
| G94 | `spacer` rows are invisible to cost, copper, Material List, poles and export checks — but they are real array entries and participate in group inheritance | Deleting or inserting one changes combination membership |
| G95 | `note` is a **pricing input**: "busway" anywhere in it doubles that row's connection copper | A stray word in a free-text field changes the price |
| G96 | Enclosure `H`/`W`/`D` are always 0; dimensions are parsed from `name`, and `panelHeightMm` takes the **first** number in it | Families named by capacity (Minicenter, Primo, Pro-E, IS2, Pillars "7 Lines") have no parseable size and must be addressed by **reference** |
| G97 | `lcpEnclosureDbPrice` silently falls back to a weight-based price when the size is unpriced in the family | A costed panel can quietly stop using catalogue prices |
| G98 | `findByName` is fuzzy and order-dependent | Renaming a catalogue item can break a combination template with **no error** — the line just becomes an unpriced free row |
| G99 | Combination pools are `useMemo(..., [])` | After a mid-session catalogue swap the ATS/photocell/WD/Motorized pickers still hold the pre-swap component objects |
| G100 | `retable` carries cell quantities **by row index**, not by description | Reordering the width lists would silently move quantities between products |
| G101 | `initialState()` shallow-copies `DEFAULT_FACTORS` | `state.factors.forms` aliases the module object that `installCatalog` mutates. Latent only because `forms` is unpriced |
| G102 | `installCatalog` empties `ENCLOSURES` **before** validating the payload's enclosures, and `installCachedCatalog()` runs at module scope with no try/catch | A malformed payload or corrupt cache leaves the app with **zero enclosures** (all enclosure/cell costs 0), or breaks boot |
| G103 | `staff.ts` is per-browser `localStorage`, shared with the RMU form, never synced; `LvState.salesPeople`/`supportEngineers` are a third copy | Two users see different staff lists, yet the chosen name prints on the offer |
| G104 | `PolesSummary`'s include/exclude ticks and `PrintBar`'s `acked` flag are local state | Both are lost on remount; acknowledging export warnings once lets every later export through until the tab re-mounts |
| G105 | `useLiveRates` calls two third-party origins on every Pricing-tab mount, and the fetched rate becomes the field `min` | If the fetch fails the "must be ≥ live rate" rule silently disappears. VAT and Operations have **no** bounds at all |

### P-CSS

| # | Gotcha | Consequence |
|---|---|---|
| G106 | `mccbWidthMm` matches only `^(XT\d\|HMW\d)`; `MCCB_WIDTH_MAP` has **no Emax entry** | An Emax main incoming occupies **0 mm** on a Technical footprint (a 1000 kVA job under-counts 276 mm, 1600 kVA 384 mm) while the same frame is charged correctly in Incoming Only |
| G107 | `Fuse Link (Set of 3)` rows are 0 mm but `qty 3` and are not `excludeFromSizing`, and `numGaps = count + 1` | Each switch fuse adds 3 phantom EEHC gaps = **180 mm of imaginary width**, pushing jobs into a larger chassis |
| G108 | `selectRmu`/`selectCfg` clear `iec` and `lvConfig` but **not** `qtys`, `customs`, `mccbItems`, `switchFuseItems`, `includePf`; step 6 then silently re-arms `lvConfig: "inout"` | The previous job's breakers — possibly Emax frames only valid on an Incoming Only panel — are counted against the new RMU with no visible cause |
| G109 | `lvPanelDecision` escalates for **either** "no compatible blueprint" or "width overflow" but returns one `escalated` flag | The banner always blames components, even with an empty panel (e.g. `psec50 + 2+1` at ≤500 kVA escalates 175 → 210 because rule 6 excludes `5ST-A`) |
| G110 | `evaluateDesigns` computes **one** `spaceOk` against the *recommended* chassis and applies it to every card | A 175-chassis design is badged "✔ Verified fit" for a footprint only the 210/230 can hold |
| G111 | `DESIGNS` marks `5ST-A` compatible with psec50/psec375/murge/lucy and `16ST-U` with murge/lucy, but `checkDesignCompatibility` excludes them by rule; the two `"2+0"` keys are preserved typos | Table and rules disagree; do not "correct" the typos — that would flip two compatibility cells |
| G112 | `Opt.icon` is sometimes a CSS class and sometimes raw SVG, injected with `dangerouslySetInnerHTML` | Safe only because the data is a compile-time constant. Never feed user or server data through it |
| G113 | `RMUS[].configs` and the `CfgCompat` keys are free-form strings matched by exact equality | A stray space makes a configuration incompatible with everything |
| G114 | `getMeteringForRating` clamps **upward** | A rating above 2000 kVA silently gets the 2500 band (4000 A ACB / Emax 2 E6.2) instead of an error |

### Price-admin screen and tooling

| # | Gotcha | Consequence |
|---|---|---|
| G115 | `loadAll` fetches rows only when `s.canEdit`, but the no-access card requires `!canView && !canEdit` | A `prices.view`-only user (Team Leader, Tendering) sees the full page with a **permanently loading** RMU tab, even though `GET /api/pricing/rmu` would allow them |
| G116 | Nothing in the price screen is gated on `status.canEdit` | Every edit affordance renders for a view-only user and fails with the server's 403 |
| G117 | The RMU price input is uncontrolled (`defaultValue`) and saves on blur | After a rejected value the invalid text stays on screen with **no message** and will not visually revert |
| G118 | `History` offers **Undo** for any `priceUsd`/`__created`/`__retired`/`__restored` row, but `postUndo` rejects anything whose entity is not `RmuPrice` | Undoing an LV add/remove always ends in an alert |
| G119 | `LvPrices` writes never refresh `status`/`pending` | The publish bar and version chip stay stale after an LV remove that has in fact published a new version — undermining the one indicator the owner uses |
| G120 | `importLvCatalogue()` auto-runs on first visit when `counts.lvComponents === 0`, guarded by a ref that resets on remount | ~9 sequential requests fire in the background on a visit |
| G121 | The import modal's backdrop click calls `cancel()` even while `apply()` is in flight | The cancel races the apply on the same batch id and the UI can mis-report |
| G122 | **`pricing-import.cjs` reads the RMU sheets by column index with no header validation** | Insert one Excel column and every price parses as 0 → "no positive price — skipped" → **the key is absent from the rebuilt JSON**. It prints `panel X: REMOVED`, writes the truncated file and **exits 0**, so `update-prices.bat` reports success and offers to push |
| G123 | `pricing-import.cjs all` is not atomic | An LV failure exits 1 *after* the RMU JSON was rewritten, and the batch file then prints "nothing was changed", which is false |
| G124 | A blank/zero RTU cell writes 0, and `priceList.ts` treats 0 as "not offered" | The Smart charge disappears instead of being priced at 0 — and the publish blockers never check RTU |
| G125 | `safetyFactor` is exported to the Factors sheet but is not in the importer's `KNOWN` list | Editing that cell does nothing, forever, with only a warning line |
| G126 | Re-running `lv-import.cjs` rebuilds `combos.json` with only `{ats, photocell, mcc, wd}` | `combos.ts` reads `(COMBOS as any).motorized` at **module scope**, so a missing key throws while the bundle loads — **a white screen for the whole LV section.** It would also reset `vat`/`forms` to literals and revert the FX defaults to `61.48`/`53` |
| G127 | The LV Excel round trip joins **by array index** (`ID` column) | Any insertion or deletion invalidates every later ID. The current master is 904 of 2,127 rows out of identity — the drift starts exactly where a row was dropped on 2026-08-05 |
| G128 | `pricing-export.cjs` overwrites `pricing/*.xlsx` unconditionally | Any user-added column, note, sheet or formatting is destroyed. Excel must be closed or `XLSX.writeFile` throws |
| G129 | `pl-deploy.cjs` reads `git ls-files` paths from the **working tree**, from your cwd | **Uncommitted modifications go to production**, and a tracked-but-deleted file throws an unhandled rejection |
| G130 | `lv-import*.cjs` need `frontend/node_modules`; `lv-import.cjs` needs `unzip` on PATH and returns `""` on failure | The symptom is a misleading `sheet not found:` error, not a missing-tool error |

---

## 11. Known gaps and not-implemented items

**Auth / accounts**
* No logout or token revocation: no refresh tokens, no `tokenVersion`, no blacklist, no session table.
  A password reset does not kill outstanding tokens.
* No `emailVerified` enforcement at login and no re-verification flow.
* No account deletion/deactivation endpoint, no admin-initiated user creation or invitation — the only
  ways in are self sign-up from the company domain and `scripts/make-admin.js`.
* No global error middleware, no 404 handler, no helmet/CSP/HSTS, no request logging, no structured
  logging, request ids, metrics or tracing (diagnostics are `console.*` with hand-written prefixes
  `[forgot] [reset] [email] [notify] [access] [qtn] [db-setup] [db-push]`).
* No distributed rate limiting; none at all on `/login` and `/reset`.
* No e-mail queue or retry — one synchronous attempt, the failure recorded in
  `Notification.emailError` and never surfaced or retried.
* **SMTP is not configured on Vercel**, so on the live site sign-up verification, password reset and
  all workflow e-mail are dead. `APP_URL` is also unset.
* No pagination anywhere in this area; `qtn.amendOwn` / `qtn.amendAll` have **no server-side
  enforcement at all**.

**LV workflow**
* No `CANCELLED`/`SUPERSEDED` status — amend/cancel is client-side numbering only, and the API will
  approve and submit a "cancelled" revision.
* **No audit-trail UI**: `GET /:id/events` and `qtnEvents()` exist and have zero consumers.
* No audit rows for `update`, `rename`, `remove` or `duplicate`; no `DELETE` event.
* No approver assignment, no due dates, SLA, escalation or reminders. The "Approver" dropdown is a
  client-side filter.
* No optimistic locking, no conflict detection, no save-status UI, no `beforeunload` guard.
* No real-time transport — polling only (15 s configurator, 30 s dashboard/list, 60 s bell).
* No server-side validation of `state`, therefore no server-side "complete enough to submit" gate.
* No soft delete/restore, no attachment de-duplication or external blob storage.
* Co-workers cannot read attachments or the audit trail.
* No PDF or ERP export endpoints for QTNs — all client-side.

**RMU**
* **No offer editing** (no `PUT`/`PATCH`), no save-as-draft, no duplicate action.
* No status workflow: `SENT`/`WON`/`LOST` are modelled and colour-coded but unreachable.
* No Co-Work, hand-over or sharing; a colleague literally cannot open your offer (404).
* No attachments, no notes input, no search/filter/sort/pagination on `/rmu`, no stale-price warning.
* No price-floor enforcement, no discount ceiling or approval threshold.
* `shuntTrip` and `auxiliarySwitch` are priced but have no input anywhere.
* No PRAL RTU prices, and the add-form cannot create them.
* No Lucy catalogue validation server-side (`options.ts`'s `LUCY_CONFIGS`/`isLucyConfig` are **dead
  code**), so an off-catalogue Lucy config assembles a complete-looking offer with no price.
* No currency beyond USD/EGP and no server-side FX — the rate is fetched in the browser from
  `open.er-api.com`.
* `Offer.category` accepts `KIOSK`/`LV` but only `RmuConfig` exists.

**PDFs**
* No product-type gating on the SLD endpoint; no Lucy or PRAL drawing set, layout geometry or name
  plate; no RTU/Smart content in the SLD at all.
* The Metering Circuits sheet is a scanned bitmap, so it cannot reflect `ctClass`, `vtCores`,
  `meteringCtPrimaryA`, `meteringWithFuse` or the voltage.
* No revision handling (`R0` / `For Approval` / `Gazzar` are hardcoded, `Approved By` always blank).
* SLD cover contacts are hardcoded and ignore the offer's own sales fields.
* No `subtotal` row in the commercial totals, no decimals, no amount-in-words, no per-item currency
  symbol.
* No caching, no ETag, no `Cache-Control` — every request re-assembles and re-renders.
* No PDF delivery by e-mail (no attachment code in `email.service.ts`/`notify.service.ts`).

**Price book**
* `LvComboRef` (the promised publish-time regression guard), `Offer.priceBookVersion`,
  `Offer.pricedFromStale`, `PriceChange.batchId` and `PriceBook.seedCursor`/`seedStage` are all
  declared and unwired.
* **`requireFreshPriceBook` is exported and mounted nowhere** — an offer can be frozen against the
  bundled fallback list during a DB outage with no record of it.
* No rollback endpoint or UI, despite 15 snapshots being retained; no cleanup job for expired
  `PriceImportBatch` rows; no transaction or advisory lock around a publish.
* No undo for LV changes, `PriceSetting`, VAT or factors (factor changes write no audit row at all).
* No RMU counterpart to the LV Excel import; no `poles`/copper-weight editor (**the direct cause of
  `OPEN-ISSUES.md` item 1**); no LV price editing in the screen (Excel only); no view-only rendering
  path.
* Orphaned endpoints with no UI caller: `GET /api/catalog/rmu`, `/api/pricing/verify`,
  `/api/pricing/version`, `POST /api/pricing/rmu/derive-key`, `POST /api/pricing/rmu`,
  `PATCH /api/pricing/lv/:id`, `GET /api/pricing/users`, `POST /api/pricing/users/:id/role`.
* No round trip from the database back to the repo masters — the bundled fallback drifts behind the
  live price book with every online edit and nothing reconciles them.

**LV engine**
* ATS "2 Out of 4" (declared `available:false`), PFC beyond Phase 1 (400 V, 25/50 kVAR steps only),
  `factors.forms` (stored, published, never priced).
* No auto-sizing for Panels mode; no multi-panel LCP split above 75 groups; no second-box auto-size in
  Double layout; `KWHM+MOULDED_CASE` has only the 40 cm/row rule.
* No selectivity or coordination computation — `SelectivityTab` is data entry with read-only mirrors.
* No cross-panel copper optimisation; nothing consumes `PolesSummary`'s DIN-rail total.
* Retired enclosures are never filtered client-side (`DbEnclosure` has no `active` field), and every
  picker except the search box still offers retired components — which `repriceToCatalog` will later
  **delete** from the quotation.
* No `SummaryTab` project overview (only the sticky board); no note collision handling.
* Outlook attachments >~3 MB fail (no upload session) and the draft is never sent.

**Frontend shell**
* No route-level guards (`/pricing` and `/access` are reachable by URL and render their own
  no-access state; `/pricing` is even linked in the sidebar for everyone).
* No `AccessContext` — `/access/me` is fetched by four components independently.
* No error boundary anywhere, and no error handling for the three lazy chunks (a stale tab
  navigating to `/pricing`, `/kiosks` or `/access` after a deploy stares at a skeleton forever).
* No accessibility focus trap in any modal; no pagination or virtualisation on the home history table
  or the Access Center list.
* The Nexa brand headline font is not shipped (headings fall back to Montserrat).
* Dead code: `pages/ComingSoonPage.tsx`, `Checkbox` in `fields.tsx`, `store.ts`'s
  `loadState`/`saveState`/`pctOf`/`findEnclosure`/`STD_TR_KVA`, `DOUBLE_SECOND_WIDTHS`,
  `options.ts`'s Lucy helpers, and the unused `api.ts` members `auth.verify`, `pricing.verify`,
  `pricing.add`, `pricing.deriveKey`, `pricing.lvSetPrice`, `pricing.users`, `pricing.setRole`,
  `account.weekly`.

**P-CSS**
* **No output at all** (no PDF, Excel, print view, "save to QTN" or clipboard) and **no persistence**
  — a refresh loses the whole configuration. There is no `api.*` call anywhere in the P-CSS code.
* No back/next navigation and no step validation gate; no per-design space check.
* No importer for `pcss/data.ts` — it and the reference HTML can drift with nothing to detect it.

**Tooling**
* No tests, no CI, no dry-run mode anywhere; `pricing-import.cjs` does not validate the header row.
* No ERP import; no scheduled or automated price refresh; no importer for `combos.photocell`,
  `combos.mcc` alone, and **none at all for `combos.motorized`** (hand-authored).

---

## 12. Open questions for the product owner

Grouped by section; each is phrased as a decision.

### Money and commercial policy (highest value — these are on customer paper)

1. **Should the commercial PDF's first totals row be the gross subtotal**, so that
   `subtotal − discount + VAT = total`? As written the four printed rows do not add up on any
   discounted offer (`90,000 / −10,000 / 12,600` printed above a total of `102,600`).
   `CommercialData.subtotal` already exists and is unused.
2. **Which commercial terms are authoritative** — the static bilingual boilerplate (validity ONE week,
   50/50 payment, 3-4 months delivery, 12-month warranty, ±15 % variation) or the per-offer fields the
   form collects (`validityDays`, `paymentTerms`, `deliveryWeeks`, `warrantyMonths`)? If the fields
   win, the Arabic text must become a template; if the boilerplate wins, the fields should be removed
   from the form. Related: the form defaults validity to **7 days** while the server defaults to **30**.
3. **Is there a maximum discount, and a level at which approval is required, before an offer PDF can
   be produced?** Today any user can apply 0-100 % and can price **below** the "minimum" list price
   with no gate, on both RMU and LV.
4. **Is `POA` (unit price 0) allowed to reach a customer-facing PDF?** Today the item prints POA while
   the totals silently treat it as 0 and VAT is charged on the rest.
5. **VAT vs the Taxes term:** the commercial table adds 14 % VAT while General Terms bullet 3 says the
   offer **excludes** VAT. Which is contractually correct?
6. **Which exchange rate is contractual?** The UI fetches mid-market rates from `open.er-api.com` in
   the browser while the offer text promises the *Central Bank* rate. Should the rate come from the
   server (auditable, one rate per day), and should an offer be **blocked** when no rate could be
   fetched? (Today a failed fetch quotes USD magnitudes labelled EGP — a ~50× error.)
7. **Is `offer.unitPrice` always entered in the offer currency** (today's assumption), or should an
   EGP offer's manual unit price also be multiplied by `usdToEgpRate`?
8. **Which figure should management reports use** — the QTN list's VAT-**inclusive** `totalEgp`, or the
   Commercial Offer's VAT-exclusive subtotal? And should the list's USD column divide by the
   quotation's own `factors.usd` rather than the global default?

### LV engine and pricing rules

9. **Should the panel's form of separation (`factors.forms`: 2a/2b +5 %, 3a/3b +10 %, 4a/4b +15 %) add
   its uplift to the price**, and at which stage — before or after the operations uplift? It is
   stored, published and priced nowhere today.
10. **Are LCP/KWHM kits really 10 % regardless of enclosure family** (Panels mode uses 0 % for
    Minicenter/Primo/Pillars and 3 % for Pro-E)?
11. **Should a plain Spare-parts cell get the operations uplift and the copper plating factor?** Today
    it is the only panel type that gets neither.
12. **Should KWHM require a cables cost before export, as LCP does?** Only LCP is checked today.
13. **Is the plating premium a *weight* multiplier or a *price* multiplier?** It currently multiplies
    the weight, so the KG the workshop cuts to and the KG the cost card shows are the same number —
    but Panel details shows the unplated figure under the same label.
14. **Should a Cells-mode panel be allowed to carry a manual `mainBusbarKg` at all?** The Copper Tool
    overwrites it on every keystroke and ignores `mainBusbarOverride`.
15. **Should an under-configured P.F.C bank be blocked from generating**, or is quoting a partial bank
    legitimate? (The summary says "short by N" and Generate still works.) Related: the P.F.C
    calculator collects **voltage and frequency and never uses them** — required on the offer, or
    remove the fields?
16. **Should a retired component or enclosure still be selectable** as an ATS/Sync incomer, a
    photocell/PFC/WD/Motorized breaker, or an enclosure size? Today it is, and `repriceToCatalog`
    later deletes those lines from the quotation.
17. **Confirm the `Pillars` constants**: 500 mm² busbar CSA, 1000 mm height, `busbarPoles 4.25`
    (3P + N 100 % + E 25 %), `kitRate 0`. And confirm the Pro-E vs PLP/IS2 CSA ladders
    (4000 A → 3600 vs 2400 mm²) are both current.
18. **Should the staff registry be a server resource?** It is per-browser `localStorage` today, so
    names added by one estimator are invisible to the rest of the team — yet the chosen name prints on
    the offer. Also: `salesMailBody` prints the internal selling factor (`on factor "0.7"`) in the
    e-mail to the sales person — intended?
19. **Is the "your FX rate must be ≥ the live rate" rule a hard rule?** It is only an input `min` plus
    a warning, and it disappears entirely when the FX fetch fails. Should VAT and Operations be
    bounded the way Safety Factor is (0-10 %), and is `factor = 0` (sell at cost) legitimate?
20. **Two Standard-EDMS questions:** confirm that "no P.F.C with outgoings" (2 of 6 combinations per
    size) is a real business rule and not missing transcription; and confirm `MAIN_AUX` fitting
    `Digital Meter (V,I)` + 3 CTs at **every** size. Also `STD_TR_KVA` still offers `"1500/1600"`,
    which matches no standard — remove it, or does a 1500 kVA standard exist?
21. **Is `Filter  25*25` (two spaces, `standardEdms.ts`) the same catalogue item as `Filter 25*25`
    (one space, `combos.ts`)?** Which spelling is canonical?

### LV workflow, sharing and revisions

22. **Should a co-worker be blocked from approving a quotation they co-authored?** The self-approval
    guard tests strict ownership, so a co-worker with `qtn.approve` can approve half their own work.
23. **Should co-workers see the Specs attachments and the audit trail** of a quotation they are
    working on? Today both 404 for them.
24. **What is `qtn.editWaiting` meant to allow** — the Tendering role editing **anyone's** quotation
    while it waits for approval, or only the owner/co-workers? As built, Tendering (which has no
    ownership) gets a 404 on every save while the UI unlocks the form and swallows the error, so they
    can edit for an hour and lose everything.
25. **On hand-over, what happens to the outgoing owner** — lose access entirely (today), or stay a
    co-worker so their panels remain editable? Today their panels become permanently frozen, and if
    the target was already a co-worker the co-work list becomes unsaveable.
26. **Should hand-over be permitted on a SUBMITTED quotation?** The server allows it; the UI hides it.
27. **Should withdraw and reopen notify the approvers?** Both are silent today, so an approver is
    never told a quotation they approved was reopened and re-edited.
28. **Does a reopened quotation still belong in the weekly submissions chart?** `submittedAt` is
    deliberately sticky, but the chart filters `submitted: true` (so it drops out) while the estimator
    evaluation filters only `submittedAt` (so it stays). The two dashboards disagree.
29. **Which field is the authoritative revision** — the `-N` suffix in the QTN number, or
    `project.revisionNo` on the Project tab? Both render and can double up (`QTN-26-0001-2-2`).
30. **Should a superseded ("cancelled") revision be locked server-side**, and should the app detect a
    newer revision owned by someone else? Today cancellation is client-derived from the caller's own
    list only.
31. **Are QTN numbers meant to be unique per owner or company-wide?** Today two engineers can both
    hold `QTN-26-0001`, and a hand-over can fail with a 409 because of it. Related: should
    `nextNumber` ignore revision suffixes so serials do not jump after an amendment?
32. **Should `qtn.amendOwn`/`qtn.amendAll` be enforced server-side**, and should Amend write an audit
    row and mark the superseded revision on the server? (`qtn.amendAll` can never work today —
    `duplicate` is owner-only.)
33. **Should sending for approval be server-validated** (support engineer, per-panel mandatory fields)
    rather than UI-only? And should the offer tabs be gated on more than name + busbar rating?
34. **Should the stale-price alert hide locked quotations** that cannot be re-priced, and should
    submitting a QTN priced on a superseded list be blocked rather than merely warned?
35. **Is a 30 files / 3 MB attachment budget per QTN enough** for real client specifications, or should
    attachments move to external object storage?
36. **Should deleting a quotation be recorded in the audit trail**, and should an admin ever be able to
    delete a submitted one?
37. **Who should be able to see `GET /api/qtns/all`?** It returns **every** non-draft quotation in the
    company, including `totalEgp`, to anyone with `qtn.viewAll` (which the "Powerline" preset grants).
38. **Have any KWHM quotations already been sent?** Per G87 their components are costed and appear in
    the Material List but are **missing from the Technical Offer PDF**. If KWHM cells have gone to
    customers, those offers understate scope and may need re-issuing.

### RMU

39. **Is `-With Fuse` a VT-with-fuse premium or a two-core premium?** The price key ignores `vtCores`
    while the BOM requires two cores — one of the two is wrong, and the answer changes what a
    single-core "with fuse" offer should cost. Also confirm the UI's hard coupling
    "Two core ⇒ with fuse" is a real engineering constraint.
40. **Should a Smart PRAL carry an RTU charge?** If yes, what are the four PRAL levels worth, and
    should PRAL be added to the RTU add-form? (Today PRAL smart is free, and the UI removes the option
    entirely — is PRAL genuinely never smart, or merely unpriced?)
41. **Is 12 kV P-SEC (non-Murge) genuinely only sold with metering?** There is no `P-SEC12N*F*` price
    without `M1`, so every non-metered 12 kV PSEC quote is POA. Same question for `P-SEC.M12` having
    no non-metered rows and `P-RAL24N4F0M1` being absent while `P-RAL12N4F0M1` exists.
42. **Should `shuntTrip` ($220) and `auxiliarySwitch` ($301) be selectable options?** Priced but
    unreachable.
43. **Should off-catalogue Lucy configurations be rejected**, or is a POA quote for e.g. `4+1`
    legitimate? And confirm the **inferred** Lucy electrical ratings (service voltage, PF withstand,
    BIL, peak = 2.5 × Isc) and the assumption that Lucy prices are USD and identical at 12 and 24 kV.
44. **Which brands/specs unlock next, with what data, and who produces it?** (`SCHNEIDER`, `JGGY`,
    `GRL`, `CHINT`, `KAHRABA` — the lock UI and the KAHRABA flag-relay rows are already written.)
45. **Should offers be editable** (correct a typo, re-issue) rather than delete-and-recreate, and must
    the frozen price survive the edit? Should a re-download after an edit **replace** the previous
    record rather than minting a new `PL-YYYY-####`, and should never-sent offers be prunable?
46. **Should RMU offers get the LV approval workflow and/or Co-Work?** Today a colleague cannot open
    your RMU offer at all, and `SENT`/`WON`/`LOST` are unreachable — should win/loss be tracked?
47. **Should legacy offers with `pricedAt = null` be back-filled** with the prices they were sent at
    (if recoverable), or is re-pricing on read acceptable?
48. **Should `POST /api/offers/preview` require sign-in**, given it exposes list prices and VAT to any
    caller? And should anonymous `POST /api/offers` be refused rather than creating orphan rows?

### PDFs and drawings

49. **Should the SLD be blocked for non-PSEC products** (a clear 409/422) or should PRAL and Lucy
    drawing sets be built? The UI hides the button but the URL works and produces a wrong drawing.
50. **Which peak (dynamic withstand) current is correct** — the SLD's `2.5 × Isc` or the technical
    offer's `peakCurrentKa`? For PSEC-24 that is 62.5 kA vs 50 kA on the same offer.
51. **Which metering device data is the real specification** — the SLD's hardcoded
    `CT-TPU40.13 / CL 0.5FS5 / 10VA` and `VT-TJCH4-CL0.5 / 100VA / ABB`, or the technical BOM's
    `10-15 VA` / `50-100 VA` honouring `ctClass`/`vtClass`/`vtCores`?
52. **PRAL layout geometry:** `standards.ts` says the PRAL cubicle is 654 × 750 × 2220 mm. Is the end
    plate still 27 mm and the metering unit still 750 mm wide for PRAL?
53. **Where does the 110 Vac on the E.F.I sheet come from in a non-metering RMU?** The sheet says
    "feed from voltage transformers", yet one is produced per ring feeder even with no VT cubicle.
54. **Should ring feeders beyond the third be numbered** (`Spare 1`, `Spare 2`)? Index ≥ 2 is always
    `"Ring Feeder - Spare"`.
55. **Should the drawing signatories, revision and document code come from the signed-in user or an
    approval workflow** rather than the hardcoded `Gazzar` / `R0` / `PL-P26-F01`? And is the name
    plate's `15cm × 8cm` the plate itself (fine as a constant) or meant to be the panel's dimensions?
56. **Should QTN/OPTY and the sales contacts appear on the technical PDF cover too?** The Project tab
    tells the user they feed "the Technical & Commercial offer cover pages", but only the commercial
    PDF prints them.

### P-CSS

57. **Should an Emax main incoming consume its physical 210/276/384 mm** in the inout/Technical
    footprint (today 0 mm), and does an ACB incoming even sit in the same panel as the outgoing
    breakers?
58. **Do EEHC gaps apply per physical unit or per BOM line?** Today only fuse links are wrongly counted
    as units (3 phantom gaps = 180 mm per switch fuse). Should the accessory kit and capacitor bank
    earn gaps? And is `count + 1` (a gap on both outer edges) correct, with 20 mm used only *between*
    switch fuses?
59. **When the RMU or configuration changes, should the picked breakers be cleared, kept, or should
    the user be asked?** And should step 6 default the breaker configuration to "Incoming & Outgoing"
    or leave it unset?
60. **Which is authoritative for design compatibility — the `DESIGNS` table or
    `checkDesignCompatibility`'s rules?** They disagree for `5ST-A` (psec50/psec375/murge/lucy) and
    `16ST-U` (murge/lucy).
61. **Should transformer ratings above 2000 kVA be offered at all** (they silently clamp to the 2500
    band), and should ratings with no PF bracket (801-999, 1251-1499, 1601-1999) be blocked from
    turning PF on rather than only warned?
62. **Should `pfSizingFrame` use the Himel frame when `pfBrand === "Himel"`?** It always reads the ABB
    model.
63. **Does P-CSS need an output (PDF / Excel / attach to a QTN) and persistence, and who owns the
    resulting document number?** Today it is explicitly "a tool, not a numbered quote".

### Access, accounts and operations

64. **Should an ADMIN be able to hold `qtn.approveOwn`?** The backend was specifically changed to merge
    explicit grants for admins, but the Access Center renders the tick **disabled** for every ADMIN
    preset, so it is structurally impossible through the UI. Either delete the merge and the checkbox,
    or let a preset be topped up.
65. **Is the legacy price-users screen (`GET/POST /api/pricing/users…`) still wanted?** It writes a
    column nothing reads for migrated users. Delete it, or make it write `tier`/`perms`?
66. **Who creates the first Admin in production, and how?** The only supported path is running
    `scripts/make-admin.js` against the production `DATABASE_URL`. Is that acceptable, or is a
    bootstrap endpoint or invite needed? Related: **is the "any signed-in user may run the first price
    seed and becomes OWNER" bootstrap acceptable on the live site?**
67. **Should signing out or resetting a password invalidate existing tokens**, and is a 30-day session
    correct for a quotation tool given tokens travel in `?t=` URLs? Should PDF links use short-lived
    signed download tokens instead?
68. **May any signed-in engineer see the full RMU and LV price lists** (`/api/catalog/rmu`,
    `/api/catalog/lv`, `/api/pricing/verify`) even without `prices.view`? The configurator needs
    prices to quote, but then `prices.view` gates only the *editor* screen.
69. **What should a `prices.view`-only user see** — the real page with everything disabled (as the code
    comment intends), a read-only variant, or the padlock? Today they get a permanently loading tab
    and buttons that 403. Should the sidebar "Price list" link be hidden from them?
70. **Is `notifyByEmail` meant to be self-service?** Only an `access.manage` holder can set it; a user
    cannot turn their own workflow e-mail off. Should a permission change take effect without a
    reload (the sidebar keeps its start-up permissions)?
71. **What is the sign-up policy for non-`@powerline.com.eg` staff or contractors?**
    `SIGNUP_EMAIL_DOMAIN` accepts exactly one domain, and the sign-up form **hardcodes**
    `powerline.com.eg`, so overriding the env var silently breaks sign-up.
72. **What should happen when SMTP is down?** `Notification.emailError` is written and nothing surfaces
    or retries it. Does someone need an alert? And should workflow e-mail timestamps be localised per
    user (today `en-GB` in the server's timezone)?
73. **Are the four estimator metrics and the "team median + percentile" comparison the agreed
    evaluation model**, and is showing a colleague-relative percentile to every engineer intended?
74. **Is the `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` "Docs & Support chat AI" a planned feature or dead
    config?** No code reads either; the `.env` comment claims the backend does.

### Price book, data pipeline and infrastructure

75. **Is the RMU draft-then-publish gap still wanted?** The gap was removed for LV because it stranded
    the price list, yet RMU edits still require a manual publish. Should RMU auto-publish too — and if
    so, what is the publish bar for? Should `publishCurrentPricesDetailed` also enforce the VAT range
    check the manual publish applies?
76. **Should the LV publish have blockers of its own** — a zero-priced active component, a component
    with `poles = 0` but `cuP/cuC > 0`, a description rename that orphans a combination template?
    (`LvComboRef` suggests this was intended; nothing enforces it.) Should a spreadsheet be allowed to
    rename a description at all?
77. **Should the 22 zero-`poles` components be corrected on production, and how** — a targeted script,
    or adding `poles`/copper weights to the editor? And should already-saved quotations be re-priced or
    stay frozen? (`OPEN-ISSUES.md` item 1; note the Excel import **can** now apply `poles`, so confirm
    whether the fix has been run against production.)
78. **Should offers be blocked when the price book is stale?** `requireFreshPriceBook` exists for
    exactly this; turning it on means `POST /api/offers` returns 503 during a DB blip instead of
    quietly freezing fallback prices.
79. **Are the `pricing/*.xlsx` masters still a supported way to change prices, or should they be
    retired** along with `update-prices.bat` and `pricing/README.md`? They are two weeks and 904
    identity mismatches behind, and editing them changes nothing customers see. If they stay, they
    need a regenerate-from-database step. Related: **when the bundled fallback drifts behind the live
    price book, which is "right" for a cold start or a kill-switch event?** A `source = "json"` flip
    today would serve **July** prices.
80. **Should `pricing-import.cjs` treat a skipped row as "keep the old price" instead of "delete the
    product"?** Today a typo or a shifted column silently removes prices and exits 0.
81. **Is an RTU/Smart price of 0 meant to mean "free" or "not offered"?** The code means "not offered",
    with no guard against it happening by accident.
82. **Where should hand-authored catalogue rows live** so a regenerate cannot lose them? The `Pillars`
    "7 Lines" enclosure and the whole `motorized` combination set exist only as hand edits to
    generated files.
83. **Are the 15 components whose brand is `"ABB."` (trailing dot) supposed to be excluded from the ABB
    discount**, as they are today? And is the export rule `brand === "ABB" && eur > 0` the real
    commercial rule — should the `ABB Discount` column be read back on import instead of ignored?
84. **Is EUR-wins right** when a supplier sheet legitimately carries both an import price and a local
    market price?
85. **Are enclosure H/W/D meant to be used by any sizing rule**, or is name-parsing the permanent
    mechanism? All 254 bundled rows are zero, while `enclosures-extra.json` holds 62 that are not.
86. **Is 15 snapshot versions the intended rollback window** for an auditable price book, given that
    publishing now happens on every LV edit (so 15 versions can be a single afternoon)? And **how long
    must audit and notification data be kept?** Nothing prunes `QtnEvent`, `Notification`,
    `PriceImportBatch` or expired `EmailCode` rows.
87. **Who owns the Neon database and what is the backup/restore policy?** No backup, export or restore
    procedure exists anywhere in the repo, and `db push --accept-data-loss` runs on every deploy.
88. **Does anyone rely on `GET /api/catalog/rmu`** (an external tool, ERP, script)? If not, delete it;
    if yes, it must serve the published snapshot rather than the draft.
89. **ERP direction:** is the ERPNext CSV (one row per panel, `EG-374674477` item-code stem, the fixed
    cost-centre map, `PLP` untaxed) still the agreed interface? Is an ERP → PowerLine price feed
    wanted, and should it write to `RmuPrice`/`LvComponent` and publish rather than regenerating the
    repo JSON? Should ERP rows exist for LCP/KWHM panels (they do) while plain spare-parts cells are
    skipped?
90. **Should `tools/pl-deploy.cjs` still exist** now that git auto-deploy is the normal path? It can
    publish an uncommitted working tree straight to production.

