-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerNumber" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'RMU',
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
INSERT INTO "new_Offer" ("createdAt", "currency", "customer", "deliveryWeeks", "discountPct", "id", "location", "notes", "offerNumber", "paymentTerms", "projectName", "quantity", "status", "unitPrice", "updatedAt", "validityDays", "warrantyMonths") SELECT "createdAt", "currency", "customer", "deliveryWeeks", "discountPct", "id", "location", "notes", "offerNumber", "paymentTerms", "projectName", "quantity", "status", "unitPrice", "updatedAt", "validityDays", "warrantyMonths" FROM "Offer";
DROP TABLE "Offer";
ALTER TABLE "new_Offer" RENAME TO "Offer";
CREATE UNIQUE INDEX "Offer_offerNumber_key" ON "Offer"("offerNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

