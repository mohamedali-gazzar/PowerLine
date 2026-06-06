# PowerLine

Web app for producing **technical & commercial offers** for electrical panels —
starting with **RMU (Ring Main Unit)**, with **LV panels** and **kiosks** planned next.

An engineer enters the RMU **code** through a guided form; the app assembles the
full technical offer (general data, electrical data, cubicle lineup) from the
EEHC standards, shows a **live preview**, and produces a downloadable **PDF**.

## RMU coding system

The form is driven by the Powerline/EEHC code, e.g. `PRAL12(2+1+M)`:

| Token | Meaning |
|-------|---------|
| `PRAL` / `PSEC` | Air-insulated / SF6 (GIS) |
| `12` / `24` | Rated voltage in kV |
| first number | **NAL** cubicles — LBS without fuse (QPSC) |
| second number | **NALF** cubicles — LBS with fuse (QPSF) |
| `+M` | Metering cubicle (PMC) |
| RTU Type 1 / 2 | Monitor only / Monitor & Control (motorized) |
| indoor / outdoor | Standard / weatherproof enclosure |

Ratings auto-fill from the standards table; counts are free (`3+1`, `2+2+M`, …).
The standards and assembly rules live in
[`backend/src/domain/standards.ts`](backend/src/domain/standards.ts) and
[`backend/src/domain/assembly.ts`](backend/src/domain/assembly.ts).

## Architecture

| Part | Stack | Folder |
|------|-------|--------|
| Backend API | Node.js + Express + TypeScript, Prisma ORM, PDFKit | [`backend/`](backend) |
| Frontend | React + Vite + TypeScript + Tailwind CSS | [`frontend/`](frontend) |
| Database | SQLite now (file-based, zero-config) → PostgreSQL in production | `backend/prisma` |

Both dev servers **hot-reload** on save: Express restarts via nodemon, React
updates instantly via Vite. The frontend proxies `/api` to the backend, so you
only open one URL while developing.

## Prerequisites

- Node.js 18+ (tested on 20)
- npm

## Quick start (Windows — one click)

Double-click **`start-app.bat`** in the `PowerLine` folder. It installs
dependencies and sets up the database on first run, starts both servers in two
windows, and opens http://localhost:5173 in your browser.
To stop: close those two windows, or double-click **`stop-app.bat`**.

## Run it (two terminals)

**1. Backend** — http://localhost:4000
```bash
cd backend
npm install            # first time only
npm run prisma:migrate # first time only: create the SQLite DB
npm run db:seed        # optional: insert one sample offer
npm run dev
```

**2. Frontend** — http://localhost:5173
```bash
cd frontend
npm install            # first time only
npm run dev
```

Open http://localhost:5173, click **New RMU Offer**, set the code (type,
voltage, NAL/NALF, metering, RTU, indoor/outdoor, fuse), watch the **live
preview**, then **Generate Offer** and **Download PDF** on the detail page.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/meta/rmu` | Option lists + standards table |
| POST | `/api/offers/preview` | Assemble an offer from a code **without saving** (live preview) |
| GET | `/api/offers` | List offers |
| POST | `/api/offers` | Create an offer (validated with Zod) |
| GET | `/api/offers/:id` | Get one offer (with assembled technical content) |
| DELETE | `/api/offers/:id` | Delete an offer |
| GET | `/api/offers/:id/pdf` | Download the offer PDF |

## Data model

`Offer` → `RmuConfig` (1:1). The `RmuConfig` stores only the code inputs; the
full technical content is derived by the assembly engine. See
[`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

## Roadmap

- [ ] LV panel and kiosk product types (sibling configs under `Offer`)
- [ ] Authentication & user accounts (real users)
- [ ] Switch SQLite → PostgreSQL for production
- [ ] Read product/pricing data from the company **ERP**
- [ ] Deploy with CI/CD (auto-update on push)

> The standards values are transcribed from the approved EEHC technical offers.
> Refine them in `backend/src/domain/standards.ts` and the assembly wording in
> `backend/src/domain/assembly.ts` as the product team confirms requirements.
