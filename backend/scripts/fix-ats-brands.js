// One-off maintenance fix (safe to run once, against any environment's DATABASE_URL):
//
//   1. TruONE / Compact ATS rows shipped with poles = 0, which zeroed their Cu
//      connection (copper = cuP/cuC x poles). Give each its pole count from the
//      name (3p -> 3, 4p -> 4). Copper-per-pole is left as-is, so 630/800 A count
//      in panels + cells and 1000-1600 A in cells only.
//   2. Rebrand the P.F.C capacitors + capacitor-contactors from ABB to Hitachi.
//
// Every other field (prices, `active`, etc.) is left untouched — this is a
// surgical update, NOT a re-seed.
//
//   node scripts/fix-ats-brands.js        (uses this backend's DATABASE_URL)
//
// Afterwards, click "Update price list & database" in Pricing Admin to publish
// the snapshot the app serves.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const searchText = (...p) => p.join(" ").toLowerCase();

async function main() {
  let poleUpdates = 0;
  for (const c of await prisma.lvComponent.findMany({ where: { t: "TruOne" } })) {
    const m = (c.n || "").match(/(\d)\s*p\b/i);
    const poles = m ? +m[1] : (/4p/i.test(c.n) ? 4 : 3);
    if (c.poles !== poles) {
      await prisma.lvComponent.update({ where: { id: c.id }, data: { poles } });
      poleUpdates++;
    }
  }

  let brandUpdates = 0;
  for (const c of await prisma.lvComponent.findMany({ where: { t: "P.F.C" } })) {
    const nm = c.n || c.d || "";
    if (/capacitor/i.test(nm) && /kvar/i.test(nm) && c.brand !== "Hitachi") {
      await prisma.lvComponent.update({
        where: { id: c.id },
        data: { brand: "Hitachi", search: searchText(c.t, c.f, c.r, c.d, c.n, c.ref, "Hitachi") },
      });
      brandUpdates++;
    }
  }

  console.log(`ATS pole counts set: ${poleUpdates}. Capacitor brands set to Hitachi: ${brandUpdates}.`);
  console.log('Now click "Update price list & database" in Pricing Admin to publish.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
