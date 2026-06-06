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

console.log("[db-push] Vercel build — syncing schema to Neon (prisma db push)...");
execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
