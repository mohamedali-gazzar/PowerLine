-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RmuConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "lbsBrand" TEXT NOT NULL DEFAULT 'ABB',
    "voltageKv" INTEGER NOT NULL,
    "nalCount" INTEGER NOT NULL DEFAULT 2,
    "nalfCount" INTEGER NOT NULL DEFAULT 1,
    "hasMetering" BOOLEAN NOT NULL DEFAULT false,
    "rtuType" TEXT NOT NULL DEFAULT 'NONE',
    "installation" TEXT NOT NULL DEFAULT 'INDOOR',
    "busbarCurrentA" INTEGER NOT NULL DEFAULT 630,
    "fuseRatingA" INTEGER,
    "meteringCtPrimaryA" INTEGER,
    "vtCores" INTEGER NOT NULL DEFAULT 1,
    "vtBurdenVa" TEXT,
    "vtClass" TEXT,
    "meteringWithFuse" BOOLEAN NOT NULL DEFAULT false,
    "configCode" TEXT NOT NULL,
    CONSTRAINT "RmuConfig_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RmuConfig" ("busbarCurrentA", "configCode", "fuseRatingA", "hasMetering", "id", "installation", "meteringCtPrimaryA", "meteringWithFuse", "nalCount", "nalfCount", "offerId", "productType", "rtuType", "voltageKv", "vtBurdenVa", "vtClass", "vtCores") SELECT "busbarCurrentA", "configCode", "fuseRatingA", "hasMetering", "id", "installation", "meteringCtPrimaryA", "meteringWithFuse", "nalCount", "nalfCount", "offerId", "productType", "rtuType", "voltageKv", "vtBurdenVa", "vtClass", "vtCores" FROM "RmuConfig";
DROP TABLE "RmuConfig";
ALTER TABLE "new_RmuConfig" RENAME TO "RmuConfig";
CREATE UNIQUE INDEX "RmuConfig_offerId_key" ON "RmuConfig"("offerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

