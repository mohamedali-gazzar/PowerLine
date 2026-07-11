# PowerLine Pricing Masters

All prices in the app are managed from this folder. **Edit the Excel files, run
the import, rebuild — done.** No developer needed for a price change.

| File | Covers | Feeds |
|------|--------|-------|
| **`RMU-Pricing.xlsx`** | RMU panel floor prices (PRAL / PSEC / Murge), Lucy AEGIS PLUS configs, Smart/RTU add-ons, Outdoor enclosure, VAT % | `backend/src/data/rmu-pricing.json` |
| **`LV-Pricing.xlsx`** | Component prices (2,121 items), enclosure prices (253), global factors (EUR rate, copper, selling factor, discounts, VAT) | `frontend/src/lv/data/{components,enclosures,factors}.json` |

## How to change prices

1. Open the Excel file and edit the **price columns only**
   (`Price USD`, `Price EUR`, `Price EGP`, factor `Value`s).
2. From the `PowerLine` folder run:

   ```
   node tools/pricing-import.cjs all      (or: rmu | lv)
   ```

   The import prints every price change it applies (audit trail) and validates
   the data (bad keys, both-currency rows, out-of-range VAT → warnings/errors).
3. Commit + push to `main` — Vercel deploys, and the new prices are live.
   (LV prices are baked into the frontend build; RMU prices load from the
   backend JSON. Both need the deploy.)

To regenerate the Excel files from the app's current data (e.g. after a git
pull), run `node tools/pricing-export.cjs all`.

## Rules that keep you safe

- **Never edit the `ID`, `Description`, `Name`, or `Reference` columns** in
  LV-Pricing.xlsx. Descriptions are lookup keys for the ATS/MCC/Photocell
  combination builders — the import verifies them and **skips any row whose
  identity was edited** (with a warning), so you can't silently corrupt data.
- **EUR vs EGP** (LV): each item is priced in *one* currency. If `Price EUR`
  > 0 it wins (converted at the `euro` factor); set it to `0` to price the item
  directly in EGP. The import warns on rows that have both.
- **New RMU panels**: you can add rows to *RMU Panels* — the `Price Key` must
  follow the pattern `P-RAL12N2F1M1-With Fuse` style (`P-RAL`/`P-SEC`/`P-SEC.M`
  + kV + `N`ring + `F`transformer + optional `M1` + optional `-With Fuse`).
- **Factors** (LV): `factor` is the selling divisor (sell = cost ÷ factor);
  `abbDiscount`, `operations`, `vat` are fractions (0.14 = 14 %). Saved QTNs
  keep the factors they were created with — new factors affect **new** QTNs.
- Sorting/filtering rows in Excel is fine — the import matches by the `ID`
  column, not by row position.

## Future: ERP integration

The app never reads prices from code — every lookup goes through one interface:

- **RMU:** [`backend/src/domain/pricing-data.ts`](../backend/src/domain/pricing-data.ts)
  — `panelPrice()`, `lucyConfigPrice()`, `rtuPrice()`, `addOnPrice()`, `VAT_PCT`.
  Today these read `backend/src/data/rmu-pricing.json`.
- **LV:** the three JSON files under `frontend/src/lv/data/`.

To connect the company ERP, pick either:

1. **Sync job (recommended, zero app changes):** a scheduled script pulls
   prices from the ERP API and regenerates the same JSON files this import
   produces, then commits/deploys. The Excel workflow keeps working as a
   manual override/fallback.
2. **Live adapter (RMU only):** replace the function bodies in
   `pricing-data.ts` with ERP API calls (+ caching). The rest of the backend is
   untouched — `priceList.ts`, the commercial builder, and the PDFs all consume
   this interface already.

The ERP's item identifiers should be mapped to: RMU **price keys** (e.g.
`P-SEC24N2F1M1`), Lucy **config keys** (`2+1+M`), and LV **references**
(manufacturer part numbers in the `Reference` column).
