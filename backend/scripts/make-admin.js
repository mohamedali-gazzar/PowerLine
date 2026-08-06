/**
 * Give someone full Admin access — the way out of the chicken-and-egg problem.
 *
 *   node scripts/make-admin.js someone@powerline.com.eg
 *   node scripts/make-admin.js --list
 *
 * Only an Admin can open the Access Center, so if nobody is one yet (or the only
 * Admin locked themselves out) there is no route back in through the app. This
 * writes straight to the database.
 *
 * Runs against whatever DATABASE_URL is set — local SQLite by default, or set
 * DATABASE_URL to the production connection string to fix the live site.
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const arg = process.argv[2];

  if (!arg || arg === "--list") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { email: true, name: true, role: true, tier: true, perms: true },
    });
    console.log(`\n${users.length} account(s):\n`);
    for (const u of users) {
      // An unmigrated user's power still comes from the legacy role, so show what
      // they EFFECTIVELY are rather than an empty tier that looks like no access.
      const effective = u.tier || (u.role === "OWNER" ? "ADMIN (via legacy role)" : "ENGINEER");
      console.log(`  ${u.email.padEnd(36)} ${String(effective).padEnd(26)} legacy role=${u.role}`);
    }
    if (!arg) console.log("\nTo promote someone:  node scripts/make-admin.js their@email\n");
    await prisma.$disconnect();
    return;
  }

  const email = arg.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`\nNo account for "${email}".`);
    console.error("Run  node scripts/make-admin.js --list  to see the exact addresses.\n");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    // tier ADMIN implies every permission, so perms is left as-is rather than
    // being filled in — it only applies to engineers.
    data: { tier: "ADMIN" },
  });

  // Same audit row the Access Center writes, so a promotion made here is not
  // invisible in the history.
  await prisma.priceChange.create({
    data: {
      domain: "LV",
      entity: "User",
      entityId: user.id,
      label: user.email,
      field: "tier",
      oldValue: user.tier || `(legacy ${user.role})`,
      newValue: "ADMIN",
      actorEmail: "scripts/make-admin.js",
    },
  });

  console.log(`\n${user.email} is now an Admin.`);
  console.log("They can open the Access Center on their next page load — no restart needed.\n");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("\nFailed:", e.message, "\n");
  await prisma.$disconnect();
  process.exit(1);
});
