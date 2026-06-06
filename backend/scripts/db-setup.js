// Selects the Prisma datasource provider for the current environment, so the
// SAME repo runs on SQLite locally (offline, zero setup) and PostgreSQL (Neon)
// on Vercel — without keeping two schema files in sync.
//
//   local dev    -> sqlite      (default; matches the committed schema)
//   Vercel build -> postgresql  (Vercel sets process.env.VERCEL=1)
//   explicit     -> `node scripts/db-setup.js postgresql|sqlite`
//
// Run locally with no args it rewrites the datasource to the SAME sqlite block
// that is committed, so there is no git churn.
const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");

const arg = process.argv[2];
const usePg =
  arg === "postgresql" ||
  (arg !== "sqlite" &&
    (process.env.DB_PROVIDER === "postgresql" || Boolean(process.env.VERCEL)));

const pg = `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}`;

const sqlite = `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`;

let schema = fs.readFileSync(schemaPath, "utf8");
schema = schema.replace(/datasource db \{[\s\S]*?\n\}/, usePg ? pg : sqlite);
fs.writeFileSync(schemaPath, schema);
console.log(`[db-setup] datasource provider = ${usePg ? "postgresql" : "sqlite"}`);
