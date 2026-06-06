# Deploying PowerLine to Vercel

One Vercel project serves both halves: the **frontend** (Vite/React) as static
files and the **backend** (Express) as a serverless function under `/api/*`.
Same origin, so no CORS or API-URL config is needed.

## Database: SQLite local, Postgres in production (automatic)

- **Local dev** runs on **SQLite** (`backend/prisma/dev.db`) — offline, zero
  setup, exactly like before.
- **Vercel** runs on **PostgreSQL (Neon)** — SQLite can't run on Vercel's
  read-only filesystem.

The switch is automatic: `scripts/db-setup.js` (called from `postinstall`) sets
the Prisma provider to `postgresql` when it sees Vercel's `VERCEL` env var, and
`scripts/db-push-vercel.js` creates/updates the Neon tables during each deploy.
**You never run a database command by hand.**

---

## One-time setup

### 1. Create the database (Neon)

1. Sign up at <https://neon.tech> (free) and create a project, e.g. **powerline**.
2. Open **Connection Details** and copy two strings:
   - **Pooled** (toggle *Pooled connection* ON — host contains `-pooler`)
     → this is **`DATABASE_URL`**.
   - **Direct** (toggle OFF) → this is **`DIRECT_URL`**.

### 2. Import the repo into Vercel

1. Sign up at <https://vercel.com> with **GitHub**.
2. **Add New… → Project** → import `mohamedali-gazzar/PowerLine`.
3. Leave **Root Directory** = repo root and framework = **Other**
   (`vercel.json` drives the whole build).
4. Expand **Environment Variables** and add both:

   | Name           | Value                    |
   | -------------- | ------------------------ |
   | `DATABASE_URL` | Neon **pooled** URL      |
   | `DIRECT_URL`   | Neon **direct** URL      |

5. Click **Deploy**. The build creates the Neon tables automatically.

That's it — you get a live URL.

---

## Day-to-day

- **Develop locally** as usual: `npm run dev` in `backend/` and `frontend/`
  (or `start-app.bat`). Local stays on SQLite, offline.
- **Ship a change:** `git push` to `main` → Vercel rebuilds and redeploys,
  re-syncing the Neon schema automatically.

## Notes

- **Arabic in the commercial PDF** is rendered with the bundled Amiri font
  (`backend/src/assets/fonts/`), so it works on Vercel's Linux runtime where
  Windows Arial is unavailable.
- **Destructive schema changes** (dropping/renaming columns) make the build's
  `prisma db push` stop to avoid data loss. If you intend the change, run
  `npx prisma db push --accept-data-loss` against Neon once, then redeploy.
- **Prisma "query engine not found":** covered by the `rhel-openssl-3.0.x`
  binary target in `schema.prisma` + `includeFiles` in `vercel.json`.
