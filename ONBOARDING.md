# PowerLine — Developer Onboarding & Handover

> **You're the new developer joining this project. Read this whole file first.**
> If you use Claude/Claude Code, point it at this file before doing anything — the
> section **"For your AI assistant (Claude)"** tells it exactly how we work here.
>
> Deeper technical detail lives in [`HANDOFF.md`](HANDOFF.md) (architecture) and
> [`DEPLOY.md`](DEPLOY.md) (Vercel). This file is the fast on-ramp + the current state.

---

## 1. What PowerLine is

An **internal offer-configurator web app** for PowerLine (electrical switchgear / panel
builder). A sales/technical engineer picks options and the app generates a complete
**Technical Offer**, **Commercial Offer**, **Single-Line Diagram (SLD)** and **Material
List** — ready to print/PDF.

It has **three sections**:

| Section | Route | What it is | Status |
|--------|-------|------------|--------|
| **RMU / MV** | `/` | Medium-voltage Ring Main Unit configurator (server-backed) | Live |
| **Kiosk** | `/kiosks` | Packaged substation/kiosk | Coming soon / partial |
| **LV** | `/lv` | Low-voltage panel builder (QTN → Panels → Technical/Commercial/Material) | Live — most active area |

The **LV section** is where almost all recent work happened (see §6). It is a fully
**client-side** tool — all data lives in the browser's `localStorage`, so it needs **no
backend and no internet** once loaded.

---

## 2. Tech stack

- **Frontend:** React 18 + Vite 5 + TypeScript + Tailwind CSS 3 → `frontend/`
- **Backend:** Node + Express + TypeScript + Prisma ORM → `backend/`
- **Database:** **SQLite** locally (`backend/prisma/dev.db`) · **PostgreSQL (Neon)** in production
- **Hosting:** **Vercel** — one project serves the static frontend **and** the backend as a
  serverless function. Pushing to `main` on GitHub **auto-deploys**.
- **Node:** v24.x, **npm** v11.x (what the project was built/tested on).

```
PowerLine/                 ← the git repo (this folder)
├─ frontend/               ← React app (the UI)
│  └─ src/
│     ├─ pages/            ← top-level screens (LvConfiguratorPage.tsx, NewOfferPage.tsx, …)
│     ├─ lv/               ← LV logic: store.ts, catalog.ts, combos.ts, copper.ts
│     ├─ staff.ts options.ts types.ts App.tsx …
├─ backend/                ← Express + Prisma API
│  ├─ src/                 ← domain/ (standards.ts, assembly.ts), validation/, routes
│  ├─ prisma/              ← schema.prisma (KEEP provider = sqlite), seed.ts, dev.db
│  ├─ api/index.ts         ← Vercel serverless entry
│  └─ scripts/             ← db-setup.js, db-push-vercel.js
├─ vercel.json             ← Vercel build/routes config
├─ HANDOFF.md DEPLOY.md README.md   ← docs
└─ start-app.bat stop-app.bat       ← one-click run/stop (Windows)
```

---

## 3. Get the code & set up an offline working folder

You need internet **once** (to clone + install dependencies). After that you can work
fully offline.

### 3.1 Clone from GitHub

```bash
# pick where your offline folder lives, e.g. Desktop
cd ~/Desktop
git clone https://github.com/mohamedali-gazzar/PowerLine.git
cd PowerLine
```

> **GitHub access:** to **push** you must be added as a **collaborator** on the repo.
> Ask the owner (Mohamed) to add your GitHub username under *Settings → Collaborators*.
> Until then you can clone/read but not push. (Or use a Personal Access Token the owner
> issues you.)

### 3.2 Install dependencies (needs internet, once)

```bash
cd backend  && npm install
cd ../frontend && npm install
```

### 3.3 Initialise the local database (SQLite — offline)

```bash
cd backend
npx prisma generate
npx prisma migrate dev      # or: npx prisma db push   (creates dev.db)
npm run seed                # optional: loads sample/reference data
```

### 3.4 Done — you now have a self-contained offline copy

Everything below runs on your machine with **no internet**:
- LV section → pure browser, SQLite not even required.
- RMU section → local Express + local SQLite.

---

## 4. Run it locally

### Easiest (Windows): one click
- Double-click **`start-app.bat`** → starts backend + frontend.
- Double-click **`stop-app.bat`** → stops them.

### Manual (two terminals)
```bash
# terminal 1 — backend on http://localhost:4000
cd backend && npm run dev

# terminal 2 — frontend on http://localhost:5173
cd frontend && npm run dev
```

Open **http://localhost:5173**. LV is at **/lv**, RMU at **/**.

---

## 5. For your AI assistant (Claude) — **how we work here**

> Paste this section to your Claude at the start, or just keep this file open. These are
> the **standing rules** the project owner expects. They matter — follow them exactly.

**Workflow**
1. **Work locally. Push/deploy ONLY when the owner explicitly says so.** Never `git push`
   or trigger a Vercel deploy on your own initiative.
2. **Build before you claim done.** Backend: `cd backend && npm run build` (`tsc`).
   Frontend: `cd frontend && npm run build` (`tsc -b && vite build`). TypeScript is strict
   (`noUnusedLocals` — unused imports/vars are **errors**). A green build is the minimum bar.
3. **Verify UI changes for real** — don't ask the owner to check manually. The pattern used
   here: a headless **puppeteer-core** script (Chrome at
   `C:\Program Files\Google\Chrome\Application\chrome.exe`) drives the running dev server,
   asserts the new behaviour, and reports pass/fail. Recreate small throwaway scripts as
   needed (see the `_verify/` examples on the owner's machine).
4. **Never spawn visible terminal/PowerShell windows** on the user's machine. Run dev
   servers **hidden** / in the background.
5. **End every reply** with this exact footer:
   `🔗 Local: http://localhost:5173 · Online: https://powerline-chi.vercel.app`
6. **Secrets never get printed** in output, and never get committed. See §8.

**Code style**
- Match the surrounding code — comment density, naming, Tailwind class idiom.
- LV business rules trace to the **RPT-1,2,3,4** spec docs; keep the `RPT-#:` code comments
  when you touch that logic so the rationale stays attached.

**Database / Prisma — the one rule that breaks deploys if ignored**
- **`backend/prisma/schema.prisma` MUST be committed with `provider = "sqlite"`.**
  The build script `backend/scripts/db-setup.js` rewrites it to `postgresql` on Vercel.
  If you ever commit it as `postgresql`, **local dev breaks**. Check before every commit:
  ```bash
  grep 'provider = ' backend/prisma/schema.prisma   # must say sqlite
  ```

---

## 6. Current state — what was done in the most recent sessions

The app already shipped the **RMU/MV** flow and the full **LV Phase-1 spec** (8 batches:
project-tab fields, USD/EGP currency, mandatory panel name/rating, cost-above-panels +
dynamic material numbering, technical-offer ATS headers + Notes column, PFC/MCC/Photocell
combinations, Panel-type + Copper Tool, keyboard/undo/Draft).

On top of that, the latest round of refinements (all **LV**, all live in production):

- **Smart RTU options** (replaced the old RTU toggle): *Ready to be smart type 1/2*,
  *Smart type 1 (monitor only)*, *Smart type 2 (monitor & control)*; SLD option locked.
- **Fixed Sales Manager** = *Ali Kamal* (read-only, with his contact shown); sales-person
  list excludes him. SLD labels now *Sales Order* / *Work Order*.
- **VT metering:** "with fuse / without fuse" only appears when **Double core** is selected.
- **Location** input removed everywhere; **QTN No.** no longer re-asked (entered at creation).
- **Panel list**: per-panel **duplicate** (⧉) and **delete** (✕) icons; duplicating a panel
  auto-increments the name (`PANEL 4` → `PANEL 4-1`, `4-2`, …) — no "copy" suffix.
- **Sticky top tab bar** (Project / Pricing / Panels / Technical / Commercial / Material).
- **Responsive width** — the layout adapts to any monitor (`max-w-[1800px]`).
- **Components card**: reorder sections (↑/↓); **rename/remove only user-added** sections
  (defaults are fixed); **Panel type** card moved **below** Components.
- **Re-select a component in place** (✎ "Change component"): opens the full Component
  Database in original order with the current item **highlighted in position**; picking a
  new one updates **all technical + pricing data** (keeps qty/adj/comment/note/section).
- **Photocell & P.F.C**: choose the **circuit breaker from the catalogue**; the rating is
  auto-derived from the breaker (e.g. `MCCB XT4N 160A` → 160 A), with a manual fallback.
- **Copper Tool**: rounds **UP** to the next standard rating (315→400, 625→630); colour
  highlight Phase = red / Neutral = black / Earth = green with P/N/E badges + a
  recommendation summary; units shown as length **(mm)** and **CSA (mm²)**.

**Key LV files to know:**
- [`frontend/src/pages/LvConfiguratorPage.tsx`](frontend/src/pages/LvConfiguratorPage.tsx) — the whole LV UI (large; the central file).
- [`frontend/src/lv/store.ts`](frontend/src/lv/store.ts) — LV state, panels, localStorage persistence, duplicate-naming.
- [`frontend/src/lv/catalog.ts`](frontend/src/lv/catalog.ts) — component database + constants (`SALES_MANAGER`).
- [`frontend/src/lv/combos.ts`](frontend/src/lv/combos.ts) — ATS / Photocell / MCC / PFC / WD combination builders.
- [`frontend/src/lv/copper.ts`](frontend/src/lv/copper.ts) — copper weight + round-up rating helpers.
- [`frontend/src/staff.ts`](frontend/src/staff.ts) — shared staff registry (sales people / managers).

**Copper formula** (don't "fix" it): `weight(kg) = length(mm) × CSA(mm²) × 0.000009`
(0.000009 = copper density in kg/mm³, so length is in **mm**).

---

## 7. Deploy (Vercel)

**Normal path — you usually do nothing special:** Git auto-deploy is connected. When the
owner approves a push to `main`, Vercel builds automatically:
1. `db-setup.js` swaps the Prisma provider to `postgresql`.
2. `db-push-vercel.js` runs `npx prisma db push --skip-generate --accept-data-loss`
   (the `--accept-data-loss` flag is **required** — without it, any schema change that
   drops a column aborts the whole deploy).
3. Frontend builds to static assets; backend deploys as a serverless function.

**Check a deploy:** open the Vercel dashboard, or use the API token (see §8) to poll the
deployment status for your commit. Confirm the live site afterwards:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://powerline-chi.vercel.app/            # 200
curl -s -o /dev/null -w '%{http_code}\n' https://powerline-chi.vercel.app/api/health  # 200
```

**Vercel project facts:** project `powerline`, team `team_d6sWJ5oTSYuVB70PvMvzfS9D`,
config in [`vercel.json`](vercel.json). Full detail in [`DEPLOY.md`](DEPLOY.md).

---

## 8. Secrets & access — **read carefully**

Secrets are **never** committed to git and **never** pasted into chat/docs. They live in a
single gitignored file: **`HANDOFF.secrets.md`**, kept on the owner's Desktop **one level
above the repo** (it's listed in [`.gitignore`](.gitignore) so it can't be pushed).

It contains:
- the **Vercel API token** (for checking/triggering deploys via the API/CLI),
- the **Neon PostgreSQL** connection string(s) (production DB).

**To get them:** ask the owner (Mohamed) to hand you `HANDOFF.secrets.md` **directly** —
USB stick, password manager, or an encrypted channel. **Do not** request it by email/chat in
plaintext, and **do not** add it to the repo. Place your copy **outside** the repo folder.

> You may not actually need the token: because Git auto-deploy is on, pushing to `main`
> deploys without any token. The token is only for **manual** deploys or reading deploy
> status via the Vercel API/CLI.

**GitHub push access:** get added as a repo collaborator (or use a PAT the owner issues).

---

## 9. Gotchas (things that have bitten us)

- **`schema.prisma` must be `sqlite` when committed.** (§5) The #1 way to break things.
- **Destructive schema changes** (dropping a column) need `--accept-data-loss` on the Vercel
  `prisma db push` — already wired in `db-push-vercel.js`; don't remove it.
- **Port 4000 "EADDRINUSE"** on backend restart = a stray `node` is still holding it. Kill
  node processes, wait, start exactly one backend, then poll `http://localhost:4000`.
- **Frontend build is strict** — an unused import/var fails `tsc`. Clean them up.
- **`tsc -b && vite build`** is the local frontend build; Vercel uses `vite build`
  (`vercel-build`). Both must pass.
- **Windows / PowerShell quirks:** if a shell loses Node on its PATH, prepend it:
  `$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path`.

---

## 10. First-day checklist

- [ ] Cloned the repo, `npm install` in `backend/` and `frontend/`.
- [ ] `npx prisma generate` + `db push`/`migrate`, optional `npm run seed`.
- [ ] App runs: `/lv` and `/` both load at http://localhost:5173.
- [ ] Got `HANDOFF.secrets.md` from the owner (stored **outside** the repo).
- [ ] Added as GitHub collaborator (can push) — confirm with a tiny doc commit **only when
      the owner says it's OK**.
- [ ] Read §5 (working conventions) and pointed your Claude at this file.

Welcome aboard — when in doubt, **build, verify, and ask before pushing**.

🔗 Local: http://localhost:5173 · Online: https://powerline-chi.vercel.app
