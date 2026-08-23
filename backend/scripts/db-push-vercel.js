// On Vercel only, sync the Prisma schema to the Neon database during the build,
// so tables are created/updated automatically on every deploy. No-op locally
// (local uses SQLite and never needs this).
const { execSync } = require("child_process");

if (!process.env.VERCEL) {
  console.log("[db-push] local build — skipping prisma db push");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.warn(
    "[db-push] DATABASE_URL not set — skipping schema sync. " +
      "Add DATABASE_URL + DIRECT_URL in the Vercel project and redeploy to create the tables."
  );
  process.exit(0);
}

// DATABASE_URL should be the POOLED endpoint (its host contains "-pooler") so the running
// app shares connections — a serverless function opens a new one per instance otherwise,
// and that overhead is part of what exhausted the transfer quota on 23 Aug 2026.
//
// But schema changes must NOT go through a transaction-mode pooler: Prisma runs DDL over
// `directUrl` for exactly that reason, and scripts/db-setup.js writes
// `directUrl = env("DIRECT_URL")` into the postgres datasource. So if DATABASE_URL is
// pooled and DIRECT_URL is missing, `db push` would silently fall back to the pooler.
// Fail loudly and say what to fix instead of finding out later.
const pooled = /-pooler\./.test(process.env.DATABASE_URL);
if (pooled && !process.env.DIRECT_URL) {
  console.error(
    "[db-push] DATABASE_URL is the POOLED endpoint but DIRECT_URL is not set. " +
      "Schema changes must use the direct endpoint — set DIRECT_URL to the Neon connection " +
      "string WITHOUT \"-pooler\" in the host, then redeploy."
  );
  process.exit(1);
}
if (!pooled) {
  console.warn(
    "[db-push] DATABASE_URL is the DIRECT endpoint. The app will open its own connection " +
      "per serverless instance. Prefer the POOLED string (host contains \"-pooler\") for " +
      "DATABASE_URL and keep the direct one in DIRECT_URL."
  );
}

console.log("[db-push] Vercel build — syncing schema to Neon (prisma db push)...");
// --accept-data-loss lets the build apply intended destructive changes (e.g. the
// dropped `location` column). Without it, `prisma db push` aborts the whole deploy
// whenever the schema drops/renames a column.
execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit" });
