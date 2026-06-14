import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.offer.findFirst();
  if (existing) {
    console.log("Database already has offers — skipping seed.");
    return;
  }

  await prisma.offer.create({
    data: {
      offerNumber: "PL-2026-0001",
      projectName: "Sample Substation — Feeder Upgrade",
      customer: "Acme Power Co.",
      status: "DRAFT",
      currency: "USD",
      unitPrice: 0,
      quantity: 1,
      notes: "Sample PRAL 12kV (2+1). Edit or delete freely.",
      rmu: {
        create: {
          productType: "PRAL",
          voltageKv: 12,
          nalCount: 2,
          nalfCount: 1,
          hasMetering: false,
          rtuType: "NONE",
          installation: "INDOOR",
          busbarCurrentA: 630,
          fuseRatingA: null,
          configCode: "PRAL12(2+1)",
        },
      },
    },
  });
  console.log("Seeded sample offer PL-2026-0001 — PRAL12(2+1).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
