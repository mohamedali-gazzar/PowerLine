# Deploying PowerLine to Vercel

The app is one Vercel project: the **frontend** (Vite/React) is served as static
files and the **backend** (Express) runs as a serverless function under `/api/*`.
They share one origin, so no CORS or API-URL config is needed.

The database is **PostgreSQL on Neon** (SQLite cannot run on Vercel — its
filesystem is read-only/ephemeral).

---

## 1. Create the database (Neon)

1. Go to <https://neon.tech> and sign up (free tier is fine).
2. Create a project, e.g. **powerline**.
3. Open **Connection Details** and copy two strings:
   - **Pooled** connection (toggle *Pooled connection* ON — host contains
     `-pooler`) → this is **`DATABASE_URL`**.
   - **Direct** connection (toggle OFF) → this is **`DIRECT_URL`**.

   Both look like:
   `postgresql://user:pass@ep-xxxx[-pooler].region.aws.neon.tech/neondb?sslmode=require`

## 2. Create the tables (one-time)

On your machine:

```bash
cd backend
cp .env.example .env          # then paste your two Neon URLs into .env
npx prisma db push            # creates the Offer / RmuConfig tables in Neon
```

(Local dev — `npm run dev` — now also talks to Neon using the same `.env`.)

## 3. Import the repo into Vercel

1. Go to <https://vercel.com> and sign up with **GitHub**.
2. **Add New… → Project** → import `mohamedali-gazzar/PowerLine`.
3. Leave **Root Directory** as the repo root and the framework as **Other** —
   `vercel.json` drives the whole build, so you don't set a build command or
   output directory.
4. Expand **Environment Variables** and add:

   | Name           | Value                          |
   | -------------- | ------------------------------ |
   | `DATABASE_URL` | your Neon **pooled** URL        |
   | `DIRECT_URL`   | your Neon **direct** URL        |

5. Click **Deploy**.

Vercel will build the frontend, bundle the Express function (running
`prisma generate` via the backend `postinstall`), and give you a live URL.

---

## Notes / troubleshooting

- **Redeploys:** every `git push` to `main` triggers a new deployment.
- **Schema changes:** edit `backend/prisma/schema.prisma`, then run
  `npx prisma db push` again (with your `.env` pointing at Neon).
- **Arabic in the commercial PDF:** rendered with the bundled Amiri font
  (`backend/src/assets/fonts/`), so it works on Vercel's Linux runtime where
  Windows Arial is unavailable.
- **Prisma "query engine not found" at runtime:** the `rhel-openssl-3.0.x`
  binary target (in `schema.prisma`) and `includeFiles` (in `vercel.json`)
  cover this; make sure the build ran `prisma generate` (it does, via
  `postinstall`).
