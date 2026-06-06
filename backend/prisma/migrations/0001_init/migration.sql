-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerNumber" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unitPrice" REAL NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "discountPct" REAL NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "deliveryWeeks" INTEGER,
    "paymentTerms" TEXT,
    "warrantyMonths" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RmuConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "voltageKv" INTEGER NOT NULL,
    "nalCount" INTEGER NOT NULL DEFAULT 2,
    "nalfCount" INTEGER NOT NULL DEFAULT 1,
    "hasMetering" BOOLEAN NOT NULL DEFAULT false,
    "rtuType" TEXT NOT NULL DEFAULT 'NONE',
    "installation" TEXT NOT NULL DEFAULT 'INDOOR',
    "busbarCurrentA" INTEGER NOT NULL DEFAULT 630,
    "fuseRatingA" INTEGER,
    "configCode" TEXT NOT NULL,
    CONSTRAINT "RmuConfig_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_offerNumber_key" ON "Offer"("offerNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RmuConfig_offerId_key" ON "RmuConfig"("offerId");

