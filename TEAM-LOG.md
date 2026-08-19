# Team log — what changed, and what needs attention

**How to use this file.** Two people work on PowerLine from two different computers.
Neither one's Claude can see the other's. This file is how we stay in touch.

- **Newest entry at the top**, directly under the marker below.
- Written in **plain language** — anyone should understand it without knowing code.
- Read it at the start of a working session; add to it at the end of one.
- Your Claude does this for you automatically. You do not have to write anything here
  yourself. Just ask: *"what's new from the other side?"*

**Lines that need a person:**

- `❓ QUESTION FOR MOHAMED:` / `❓ QUESTION FOR <name>:` — a decision only a person can make.
- `⛔ BLOCKED:` — work that cannot continue until someone does something.
- `⚠️ HEADS-UP:` — something that could affect a customer or the live site.

When you have dealt with one of those, say so in your own next entry so it can be
closed off.

---

<!-- NEW ENTRIES GO HERE -->

## 2026-08-19 · Mohamed's side · Claude

**Combinations screen: "Standard ATS EDMS" is now a Download/Upload database — and the app builds from it.**

- Added a **Standard ATS EDMS** row on the Combinations tab (Price list), beside "Standard LV EDMS":
  Download the current workbook, edit it, Upload it back.
- Unlike Standard LV EDMS (which is just a stored reference), **the Standard ATS builder actually reads
  this file**. Upload a changed "Standard ATS EDMS.xlsx" and the ratings, parts, enclosures and busbar
  copper it builds change straight away — no new app version needed.
- Until the workbook is uploaded once, the ATS standard already built into the app is used, so nothing
  is ever empty; a bad file also falls back to it safely.
- One small gap for now: on upload it does not pre-warn if an edited part name no longer matches the
  price list (the other combinations do). An unmatched part instead shows as an unpriced line on the
  panel, so it is still visible. Can add the up-front warning later.
- No database change (uses the existing combinations store). Verified end to end: stored the real
  12-sheet workbook, the app parsed it back, an edited re-upload changed the result, and the
  download re-parsed cleanly.

## 2026-08-19 · Mohamed's side · Claude

**Standard EDMS: new "Standard ATS" builder beside "Standard Panels".**

- In a Standard EDMS quotation, the Components card now has a toggle at the top:
  **Standard Panel** / **Standard ATS**.
- **Standard ATS** lets you pick a rating (630, 800, 1000, 1250, 1600, 2000, 2500, 3200,
  4000 A) and a breaker (MCCB or ACB, only where both exist), then "Build this ATS" fills
  the whole panel — name, full "1 out of 2" transfer-switch parts list, enclosure and
  busbar copper — from the "Standard ATS EDMS" workbook. 630 A uses an SR-Basic box; the
  rest use PLP.
- The old generic **"+ ATS"** button was removed from the Combinations row in Standard EDMS
  (the proper Standard ATS replaces it). It still appears for normal, non-EDMS panels.
- Checked against the live price list: every ATS part matched a priced catalogue item.

## 2026-08-18 · Mohamed's side · Claude

**RMU Commercial Offer: roomier price-table rows, and validity now defaults to 3 days.**

- The item rows in the RMU commercial pricing table now have a bit more vertical space, so a
  multi-line item reads more comfortably.
- New RMU offers now default to a validity of **3 days** (was 7), matching the standard terms wording.
  It's still editable per offer, and existing offers keep whatever validity they were saved with.

## 2026-08-18 · Mohamed's side · Claude

**RMU Commercial Offer: pricing table + terms now match the LV Commercial Offer's exact look.**

- Comparing the two commercials side by side showed the RMU pricing table had been styled with
  bold orange bars (that's actually the RMU *technical* offer's look, not the LV commercial). Fixed:
  the RMU pricing table is now the LV commercial's understated style — a thin orange underline under
  grey column headings (no filled orange bar), plain numbers, and a totals block that closes with a
  simple "Total" line under an orange rule (no orange grand-total bar). The discount line stays, since
  RMU offers have one, but it's now a plain row.
- Two small Terms details also aligned to the LV: the heading now reads "General Terms & Conditions"
  (Arabic "الشروط والأحكام العامة"), and each section's title is dark like the LV instead of orange.
- Net result: the RMU and LV commercial offers now look like one family across cover, pricing table,
  and terms. Verified from a real generated RMU offer.

## 2026-08-18 · Mohamed's side · Claude

**RMU Commercial Offer now matches the LV Commercial Offer as the standard template.**

- The RMU **Commercial Offer** now follows the LV Commercial Offer exactly: same cover, same
  orange pricing table (# / Description / Qty / Unit / Total), same right-aligned totals block
  ending in the orange "Total (incl. VAT)" bar, and the same short Terms summary
  (Validity / Delivery / Payment / Warranty).
- The **Terms & Conditions** are now the company's standard LV terms — the same 13 sections in
  **English and Arabic** — instead of the old RMU-only wording. The only change is the delivery
  line, which reads "Ring Main Units: as stated in this commercial offer."
- Result: an RMU Commercial Offer and an LV Commercial Offer now look like one family of
  documents, so they can't drift apart. Verified from a real generated offer (5 pages: cover,
  main offer + terms summary, English T&C, Arabic T&C, contacts).

## 2026-08-17 · Mohamed's side · Claude

**RMU offer covers: the Commercial cover now matches the Technical/LV cover, and both show the QTN number.**

- The RMU **Commercial Offer** cover is now the same clean cover as the Technical Offer (just
  titled "Commercial Offer"). Both offers now use one shared cover, so they can't drift apart.
- The orange number on the cover is now the **QTN number** (e.g. QTN-26-0043) instead of the
  internal PL-2026-#### offer number.
- (Still coming: matching the Commercial pricing table and Terms & Conditions to the LV
  Commercial Offer — in progress.)

## 2026-08-17 · Mohamed's side · Claude

**RMU technical PDF: no more single-row orphan page in the structure.**

- On offers with metering, one last row ("Selector 7 position") was spilling onto a nearly
  empty extra page. The Ring Main Unit Structure table is now a little more compact (shorter
  header row, slightly tighter rows), so a full cubicle list fits on its page and that row
  stays with the rest. (A genuinely huge structure can still use a second page.)

## 2026-08-17 · Mohamed's side · Claude

**RMU technical PDF: the orange cubicle-header bars are no longer over-tall.**

- On the Ring Main Unit Structure page, each orange bar (e.g. "QTY 2 Cubical: PCC …") was
  leaving a big empty orange band above/below its one line of text. The bar height was being
  measured with the wrong (bigger) font; it now matches the text, so the bars are tight.

## 2026-08-17 · Mohamed's side · Claude

**RMU exports: LV-style file names, and the technical PDF is re-paged.**

- **File names now match the LV section.** Downloading an RMU offer now saves as
  **`TO-QTN-26-XXXX Rev 00.pdf`** (technical) and **`CO-QTN-26-XXXX Rev 00.pdf`** (commercial),
  using the offer's QTN number — instead of the old `PL-2026-XXXX-Technical.pdf`.
- **Technical PDF re-paged:** page 1 (after the cover) now carries **General Data / Type of
  apparatus, Electrical Data and General Notes**; the **Ring Main Unit Structure** moves to its
  own page 2.

## 2026-08-17 · Mohamed's side · Claude

**RMU cover: the logo and date now match the LV cover.**

- The RMU offer cover now uses the **same PowerLine logo** image as the LV cover (it was a
  slightly different version before), and the **date** now shows as **DD/MM/YYYY** (e.g.
  17/08/2026) in the same light-grey rounded pill — exactly like the LV cover.

## 2026-08-17 · Mohamed's side · Claude

**RMU cover: the Website / Facebook / LinkedIn icons are now the real logos, like the LV cover.**

- The three round social icons at the bottom of the RMU offer cover were plain letters; they
  are now the proper **globe (website), Facebook, and LinkedIn** logos in the orange circles —
  exactly like the LV cover. Their links are unchanged.

## 2026-08-17 · Mohamed's side · Claude

**RMU offer cover is now fully clickable — identical to the LV cover.**

- On the RMU technical-offer **cover page**, everything is now a working link, exactly like
  the LV cover: the **product icons** open their pages on powerlinei.com, the **phone numbers**
  open to call, the **e-mails** open the mail app, the **address** opens Google Maps, and the
  **ISO 9001 / 14001 / 45001 + ABB CERTIFIED** badges open the certificate files (plus the
  Website / Facebook / LinkedIn marks). Same links and URLs as the LV cover.
- Verified on a real offer built through the actual system (21 links, all correct). The two
  covers are now identical in look and behaviour.

## 2026-08-17 · Mohamed's side · Claude

**RMU: the QTN number now fills itself in, and the offer cover's product icons now match the LV cover exactly.**

- **QTN auto-generated:** opening a New RMU Offer now pre-fills the **QTN number** with the
  next number in the RMU series (QTN-YY-####). It's still editable, and still required. If you
  came in from the New-QTN dialog with a number, that number is kept.
- **Cover icons:** the five product-range icons on the RMU technical-offer **cover page** were
  redrawn to look **exactly like the LV offer cover** (the control panel, transformer, secondary
  and primary switchgear, and kiosk) — same style and colours. Only the cover picture changed;
  nothing about the offer's content or numbers.

## 2026-08-17 · Mohamed's side · Claude

**Project name, Customer and QTN number are now required — in both LV and RMU. Plus the RMU "Panel" tab is renamed "RMU".**

- On the **Project tab** of both the **LV quotation** and the **RMU offer**, the **Project
  name**, **Customer** and **QTN number** fields now show a red **`*`** and turn red while
  empty, and you **can't generate the offer until they're filled**:
  - RMU shows *"Project name, customer and QTN number are required…"* and jumps you to the
    Project tab.
  - LV blocks the Technical / Commercial / Material tabs and lists exactly which of the three
    is missing.
- In the **RMU offer**, the middle tab that was called **"Panel"** is now called **"RMU"**
  (the wording underneath and the card heading were updated to match). Nothing about how it
  works changed.

## 2026-08-17 · Mohamed's side · Claude

**Panel step tidy-up — no more empty white box, and the two sides finish level.**

- Fixed a problem where the **Smart / RTU** card was stretched into a tall empty white
  box when it was switched off. Cards now keep their natural size, so **Smart / RTU sits
  directly under Metering** instead of being pushed to the bottom of an empty area.
- The **Panel — RMU Code** card on the left was tightened a little so that, with Metering
  and Smart/RTU both switched on, the left and right sides **finish at the same line**.
- When Metering or Smart/RTU is switched *off* those cards shrink to a small bar, so the
  right side naturally ends higher — that is expected, and is the alternative to putting
  the empty white box back.
- Colours, buttons and everything else look exactly as before; nothing about how the page
  works changed.

## 2026-08-17 · Mohamed's side · Claude

**The Panel step of the New RMU Offer screen is now side-by-side (two columns).**

- On the **Panel** step, the **Panel — RMU Code** card is now **half width, on the left**, and
  **Metering** plus **Smart / RTU** sit on the **right**. The left card's rows were tightened
  slightly so both sides finish at **exactly the same height** (checked for every product type,
  with and without metering/smart).
- **The look did not change at all** — same colours, same buttons, same cards as before. This
  was purely a rearrangement, so nothing about how the page works changed either.
- On a phone or tablet the two columns stack one above the other, as you'd expect.

## 2026-08-17 · Mohamed's side · Claude

**The New RMU Offer screen is back to its original design.**

- After trying the "Offer Configurator" restyle (including a two-column Panel step), the
  screen was returned to its **original look** at Mohamed's request — the restyle is fully
  removed. How it works never changed at any point.
- **The RMU printed-page header change stays** (product code shown top-right on pages 2
  onward). Only the on-screen configurator design was reverted.

## 2026-08-17 · Mohamed's side · Claude

**RMU printed pages now show the product code in the header. (A restyle of the New RMU Offer screen was deployed, then rolled back at Mohamed's request.)**

- **RMU printed pages (2 onward) now show the product code in the top-right header** — e.g.
  `PRAL12ABEECH2R1T1M` over `PRAL12(2+1+M)` — instead of the old "P-Ral 12KV (Indoor) —
  Technical Offer" line. The cover page (page 1) is unchanged. **This is live and stays.**
- **A new look for the New RMU Offer screen was tried and then withdrawn** — the page is back
  to exactly how it was before. Nothing else was affected either way.

## 2026-08-17 · Mohamed's side · Claude

**The RMU (Ring Main Unit) offer now has the same cover page as the LV offer.**

- The first page of an RMU technical offer used to look different from the LV one (it had
  the "Ring Main Unit" title, a product photo and an orange product-code box).
- It now uses the **exact same "Technical Offer" cover as the LV offer**: the big black-and-
  orange "Technical / Offer" title, the orange line, the "Egyptian electrification
  solutions · ABB-certified assembler" line, the offer number / project / customer, the
  Sales / Manager / Support contacts, the five product-range columns, and the ISO + ABB
  footer. So both product lines now hand the customer the same front page.
- Nothing else in the RMU offer changed — the product details still appear from page 2
  onward (General Data, Electrical Data, etc.) exactly as before.
- This was a cover-page-only, backend-only change (the RMU PDF is built on the server).

## 2026-08-17 · Mohamed's side · Claude

**Big change to how the Combinations tab handles Excel — please read before you next upload a combinations file.**

- **A file you upload is now the source of truth.** The app no longer refuses a file for
  "missing" something the previous version had. It loads what is actually in the file and
  applies it: parts you add appear, parts you remove are dropped, parts you change take the
  new value. **So anything you leave out of an uploaded file is removed from the app.**
  (Quotations already saved keep the parts they were built with — nothing sent to a
  customer changes.)
- **One safety check kept:** if a file would drop a *whole* ATS arrangement (1-out-of-2 or
  2-out-of-3) or a *whole* withdrawable-kit block (e.g. the E1.2 air-breaker kit), it asks
  you once "this will remove X — load anyway?" instead of doing it silently. Everything
  smaller loads with no prompt.
- **Motorized breaker is now its own Excel file** — "Combinations Database - Motorized.xlsx".
  Load and download it like the others. The app reads the motorised parts straight from
  the file you load; there is no hidden hard-coded copy.
- **P.F.C is now a section too.** Load / download "Combinations Database - P.F.C.xlsx". It
  is kept as a **reference** — the app still works the capacitor bank out for itself, it
  does not build the quotation from this file. (Cell colours/merged cells aren't stored,
  only the values.)
- **Fixed the P.F.C generator's Fan/Filter.** The "Generate combination" P.F.C tool was
  outputting "Fan 25*25" / "Filter 25*25", which showed "no price"; it now outputs "Fan" /
  "Filter" to match the price list and the P.F.C workbook.
- **Combinations tab looks different:** a list of the combinations down the left, the
  selected one on the right with its Load / Download buttons. Removed the "Reset all to the
  app's version" button and the paragraph of explanation.

⚠️ **HEADS-UP for whoever edits the workbooks:** each download now carries ONLY its own
combination (the MCC file no longer also carries the withdrawable kits, etc.). Load the
file that matches what you want to change, and don't expect one file to carry everything.

## 2026-08-17 · Mohamed's side · Claude

**A batch of history / send / offer tidy-ups.**

- **Missing-item warnings now show when you press "Send for approval."** The same checks
  the offer runs (empty panels, missing copper, no cells, zero price, LCP cables,
  duplicate panel names) pop up first, listing exactly what's missing on which panel.
  You can fix them or choose "Send anyway" — nothing is blocked, you just see it before
  the quotation is locked for review.
- **Offers history keeps a quotation's revisions together.** Same order as before, but
  when a number has been amended, its revisions sit one after the other (newest on top).
- **New "Cancelled (old revisions)" choice in the history Status filter**, so you can
  show just the superseded revisions.
- **Outlook send now fills the recipient and the subject.** It was falling through to the
  Windows share sheet, which had neither. WhatsApp now uses the exact same wording as the
  Outlook e-mail. (Both still download the two PDFs to attach by hand — auto-attaching
  needs the Microsoft 365 setup that's still with IT.)
- **Removed the "Download Data Sheets" button** from the Material List, and the unused
  ABB helper behind it.

## 2026-08-16 · Mohamed's side · Claude

**Three things: no duplicate item names, no duplicate panel names, and Send-to-sales now offers WhatsApp as well as Outlook.**

**1) The price list won't let two items share a name.** The combinations (MCC / ATS /
photocell) find their parts by the item's name and take the first one they find, so two
items with the same name means a quotation can quietly use the wrong one at the wrong
price. Adding a component now refuses a name that's already taken and says which item it
clashes with; capital letters and extra spaces don't count as a difference. An Excel
upload is never rejected as a whole — only the clashing rows are left out, and a row that
clashes still gets its price update.

⚠️ **HEADS-UP for the engineers: the price list already holds 47 names used by two
different items** — both live, both in the pickers, two different ABB order codes. 18 of
them carry two different prices; the worst is "Change over switch 160A 3P" at €81.85
against €179.91, and every quote today takes the cheaper one. Nothing was renamed or
deleted — which of each pair is the real one is a business call. There's a warning at the
top of the Components tab, "47 names are used by more than one item", with a **Show them**
button listing both codes, both prices, and how far apart they are.

**2) Two panels in one quotation can't share a name.** The panel name is what a customer
reads on the offer and the material list. Where the app picks the name (a second LCP/KWHM/
Spare cell, or "Build this panel" twice) it now adds "-1", "-2"…; where a person types a
name that's already used, the field goes red, the panel list flags it, and the offer tabs
stay closed until it's fixed. Two saved quotations already carry a duplicate — draft 21516
and submitted QTN-26-01284 — they were left exactly as they are, with the warning shown so
they can be corrected by hand.

**3) Send-to-sales → choose Outlook or WhatsApp.** On a submitted quotation the "Send to…"
button is now a choice. **Outlook** is as before: e-mail to the sales person, subject like
"QTN-26-01234 (Emaar)", both PDFs attached. **WhatsApp** opens a chat to the sales person's
phone with the QTN number, project name and a message ready, and downloads the two PDFs to
attach (WhatsApp links can't carry files). No phone on file → it says so.

❓ **QUESTION FOR MOHAMED:** what exact wording do you want in the WhatsApp message? Right
now it uses a stand-in ("Please find the Technical and Commercial offers…"). Send me the
text and I'll put it in.

---

## 2026-08-16 · Mohamed's side · Claude

**The Combinations tab now takes the Excel workbooks directly. Nothing to convert first.**

Price list → LV prices → Combinations → **Load a combinations workbook**, and pick
"Combinations Database - MCC.xlsx", "- ATS.xlsx" or "- photocell.xlsx". It works out which
file it has and updates the right sections. Each of those three also carries the
withdrawable-kit tab, so one upload refreshes that at the same time. It goes live
immediately, and quotations already saved keep the parts they were built with.

**Checked against the real files, by running it — not by reading it.** Every workbook was
read back and compared with what the app already holds:

| Workbook | Result |
| --- | --- |
| MCC | 110 starters + 10 control parts — identical |
| ATS | both arrangements, 11 frames each, 440 lines — identical |
| photocell | 19 ratings + 7 fixed parts — identical |
| WD | 13 withdrawable kits — identical |

It was also tried against 14 deliberately damaged copies, and it refuses a bad file rather
than quietly wiping something:

- **P.F.C** — refused, with a note that the app works the capacitor bank out itself.
- **An ATS file with only one arrangement** — refused, because saving it would delete the other.
- **Anything unrecognised** — refused, naming the tabs it expected.

⚠️ **Something for the engineers: `Combinations Database - WD.xlsx` cannot be loaded on its
own, and the app refuses it on purpose.** That file physically stops early — it has the two
MCCB blocks but not the air-breaker one — so loading it would remove the E1.2 withdrawable
kit from the app. The same WD tab inside the MCC, ATS and photocell workbooks is complete
and gives all 13. Either use one of those, or add the missing block to the stand-alone file.

✅ **Closing an earlier question of mine — I had it wrong.** I previously reported that the
ATS sheet had an extra "Mecanical Interlock" part on the 2-out-of-3 E-frames that the app
was missing. It is not a part: it is the *heading* for the group of parts below it. My
earlier check treated a blank quantity as 1 and read the heading as a line item. The sheet
and the app agree, and there was never anything to add.

📌 One section still has no workbook: **motorized breaker**. It still comes from a
`combos.json` file, and the screen says so rather than pointing at a file that does not exist.

📌 One harmless difference: the workbook has re-sorted its starters, so one row
(DOL-3Ph 7.5 kW Type 2) sits in a different position from the copy built into the app. Same
110 starters with the same parts; the drop-downs come out in the same order either way.

---

## 2026-08-16 · Mohamed's side · Claude

**Found why the other side keeps hitting errors — and it was never a real bug.**

Pulled the 27 new commits and the backend refused to build: 13 errors saying things like
*"Property 'lvCombo' does not exist"* and *"'removedAt' does not exist"*. Nothing was
actually wrong. Both schema changes were committed properly; only the **generated database
code on this machine was out of date**. One `npx prisma generate` cleared all 13 at once.

This is a trap, because the errors point at good code and read like someone broke the
project. The danger is a Claude "fixing" perfectly correct code to satisfy a stale file.

Three things done so it cannot keep costing time:

- `CLAUDE.md` has a new **§3a — After every pull**, with the exact re-sync commands and a
  plain instruction: if the backend will not build and the errors mention Prisma, a model
  or a column, regenerate first and never report it as a bug.
- New file **`START-PROMPT.md`** — a ready-made first message to paste into Claude at the
  start of a session. It makes Claude fix its own setup, then study `ARCHITECTURE.md`
  instead of exploring, then work in simple English and handle its own errors.
- Confirmed the state of `main` at `fddca8e`: **frontend builds clean, backend builds clean
  once regenerated.** Nothing is broken on the repository.

👏 Also: both bugs written up in `CLAUDE.md` §7 are now **fixed** on the other side (KWHM
panels printing empty, and the blank page on a damaged quotation) — and the KWHM fix went
further than the write-up by repairing already-saved quotations on load. Good.

❓ QUESTION FOR MOHAMED — still open from earlier: whether any **KWHM quotation was already
sent to a customer** before the fix. Those offers printed no components while still being
charged for. It needs one line pasted into `backend/.env` on your machine
(`PROD_DATABASE_URL="…"`, copied from Vercel) and then it takes a minute to check.

## 2026-08-13 · Mohamed's side · Claude

**Combinations tab is now read-only — the workbooks are the reference.**

The editing tables are gone. The tab shows what is loaded and when, takes a new version,
downloads the current set, or falls back to the version built into the app. One source of
truth instead of two that quietly drift apart.

⚠️ **It still takes `combos.json`, not `.xlsx`.** The Excel reader is not built yet, so a
workbook has to be converted first. That is the next job.

📌 **Groundwork done, for whoever picks it up.** All five workbooks were opened and their
shapes recorded:

| Workbook | Shape | Maps to |
| --- | --- | --- |
| MCC | key column + parts across | `mcc.combos` — 110 starters, already verified identical |
| ATS | matrix, frames across in 3 column blocks | `ats[type][frame]` — 2 differences found and fixed |
| photocell | Rating / DESCRIPTION / PL Description / Aux | `photocell.ratings` |
| WD | matrix, 3P and 4P blocks, FP and MP rows | `wd` |
| **P.F.C** | **a calculator, not a list** | **nothing — see below** |

❓ **QUESTION FOR MOHAMED — the P.F.C workbook does not fit.** It is a sizing calculator
(Volt, Insert KVAR, No. of fixed steps, capacitor size…), not a list of parts like the
others. The app has no stored P.F.C combination at all — it works those out in code as you
choose the kVAR. So there is nothing for an upload to replace. Is that sheet meant to be
the reference for how the app *calculates* P.F.C, or is it just your working sheet?

Two useful things also spotted: the photocell sheet carries **both** wordings side by side
— the template one and the price-list one — which is exactly the translation the app keeps
in code, so an importer could read it straight from the sheet. And the MCC sheet uses a
non-breaking space in "0.06 kW", which silently breaks matching unless it is flattened.

---

## 2026-08-13 · Mohamed's side · Claude

**Fixed: a damaged quotation used to open as a blank white page.**

If a quotation's saved details were incomplete — a save interrupted, an older record,
anything the server could not read back — opening it showed nothing at all. A white
screen, no message, no way in. It looks exactly like the work has been lost, and it has
been on the known-problems list for a while.

It now opens normally: whatever is missing is filled in with the standard starting values,
and everything that did survive is kept.

It turned out to be wider than written up. The note blamed the pricing rates, but the panel
list and the project details failed in the same way — fixing only the rates would have
moved the blank page rather than removed it. All three are now covered.

Checked by deliberately damaging a test quotation until it had no details at all: it opens
with every tab in place and nothing broken.

---

## 2026-08-13 · Mohamed's side · Claude

**The quotation header can now be pinned.**

There is a small **📌 Pin** next to "← All QTNs" at the top of a quotation. Press it and the
number, project, price, status and the action buttons stay put at the top of the screen
while you scroll a long list of panels. Press it again to unpin.

Each browser remembers the choice, so it stays how you leave it. It is **off** by default —
pinned, that bar takes up about 90px on every screen, and not everyone will want that.

The tab strip (Project · Pricing Settings · Panels …) was already pinned. While the header
is pinned the strip lets go of its own pin, so you never get two bars stacked on top of
each other.

---

## 2026-08-13 · Mohamed's side · Claude

**New defaults for new quotations: Safety Factor 2%, USD 51, EUR 59.**

Quotations already saved keep the rates they were built with — these apply to work started
from now on.

⚠️ **A real fault turned up while doing it, and it is worth knowing about.** Pressing
**Update price list & database** had stopped working completely — it failed every time
with a bare "Server error".

The cause: LV and RMU share one version number for the price list, but each writes its own
copy. RMU had got one step ahead (13 against 12), so every publish tried to write a version
that already existed and was refused. Once in that state it could never recover on its
own — no price change, anywhere, could be made live again.

It now steps over a number already in use instead of jamming against it. Publishing works
again, and the new defaults went live as version 14.

📌 **The live site may well be stuck the same way.** The fix ships with this update, so
just press **Update price list & database** there once. If it reports success, it was
either fine already or is now unjammed — either way you are covered.

---

## 2026-08-13 · Mohamed's side · Claude

**ATS corrected against the reference sheet. MCC already agreed.**

Checked both reference workbooks against what the app builds, comparing the actual parts
rather than the wording.

**MCC — nothing to do.** All **110 starters** match the sheet exactly. Only the wording
differs, which is deliberate: the app carries short names for the printed offer and
translates them to the price-list names behind the scenes.

**ATS — three corrections, two applied:**

| | Was | Now |
| --- | --- | --- |
| 2-out-of-3, every frame — monitoring relay | 2 | **3** |
| 2-out-of-3, every frame — green pilot light | 7 | **8** |
| 1-out-of-2, E2.2/E4.2/E6.2 — interlock support | 2 × Type **C** | **1 × Type A,B,D** |

Three monitoring relays for three sources, as the sheet says. The support part was the
wrong type as well as the wrong quantity — the price list carries both, at €224.21 each.

❓ **QUESTION FOR MOHAMED — one I could not apply.** The sheet adds **1 × "Mecanical
Interlock"** to the 2-out-of-3 E-frames (E2.2, E4.2, E6.2). That wording matches nothing
in the price list, and the list holds **nine** different interlocks at different prices —
lever ones around €71–75, cable ones at €89.73. Adding it as written would put a row on
the offer with **no price at all**, so I left it out. Tell me which one it should be and
it takes a minute:

- `Lever interlock E2.2` / `E4.2` / `E6.2 3p` — €74.73 / €74.73 / €71.50
- `Cable interlock B, C, D - HR E2.2...E6.2` — €89.73
- `Cable interlock A - HR E1.2..E6.2-XT7/M` — €89.73

⚠️ Also fixed: the warning under the Combinations tab was reporting **27** ATS parts as
missing when every one of them was fine — it did not know about the app's translation
table, nor that "C.B (1)" is a placeholder for the breaker you pick. It now reports none
across all four sections, so if it ever does warn, it means something.

---

## 2026-08-13 · Mohamed's side · Claude

**CORRECTION — the MCC starters were never mispriced. I was wrong, and I have put it back.**

The entry below says `SK1-11` and `CAL4-11` were being charged at zero in all 110 starters,
worth €19–33 each. **That was not true.** Please ignore it.

The app already handled those two names. `combos.ts` keeps a small translation table
(`MCC_ALIAS`) precisely for parts whose template wording differs from the price list, and
both of these were in it — with a comment saying they are translated **for the price lookup
only, so the offer can keep the clean wording**. Both resolve fine: €12.64 and €6.63.

My check re-implemented that translation step and left out the table, so it reported two
parts as missing when nothing was missing.

**What I had changed, and have now undone.** I rewrote the two descriptions in the starter
templates to the long catalogue names. That template text is what **prints on the offer**,
so the effect was to put `CAL4-11 Auxiliary Contact Block - Side (AF09..96)` on customer
documents in place of the tidy `CAL4-11 (1 N.O+1 N.C) - Side`, and it corrected no price at
all. The wording is back exactly as it was — the files are byte-for-byte identical to
before I touched them, and the database copy is restored.

**The one real problem it uncovered** was in the checker I added yesterday: the warning
under the Combinations tab did not know about that translation table, so it would have
cried wolf about these two parts every time anyone saved. That is fixed, and it now
reports none.

Nothing was ever wrong with the prices, and no quotation was affected at any point — the
only thing that changed was the printed wording, and only between this update and the last.

---

## 2026-08-13 · Mohamed's side · Claude

**MCC starters were missing two parts from their price. Fixed.**

Answering the question left open earlier — Mohamed said to correct them.

**What was wrong.** A combination does not store part numbers. It stores the part's
*description*, and the app looks that text up in the price list when it builds the
starter. Two of the 54 parts an MCC starter names were spelled differently from the price
list, so the app found nothing and charged **zero** for them:

| The starter asked for | The price list actually calls it |
| --- | --- |
| `SK1-11 Signal contact` | `SK1-11 Signaling Contact` — €12.64 |
| `CAL4-11 (1 N.O+1 N.C) - Side` | `CAL4-11 Auxiliary Contact Block - Side (AF09..96)` — €6.63 |

Both parts are in **every one of the 110 starters**, so every MCC starter ever quoted was
short by the cost of a signal contact and one auxiliary block per contactor.

**What changed.** The two descriptions in the starter templates now match the price list
exactly. Nothing about the parts themselves changed, and no price was edited — the app can
simply find them now.

**What it is worth, per starter, parts only:**

| Starter | Was | Now | Recovered |
| --- | --- | --- | --- |
| DOL, 3-phase | €49.42 | €68.68 | **€19.27** |
| Star-Delta (3 contactors) | €94.59 | €127.12 | **€32.53** |

Across all 110 starters that is an average of **€24.81** each, before the panel's own
margin and factors. Every part an MCC starter names now resolves — the checker reports
none missing.

⚠️ **HEADS-UP — one thing to check on the live site after this update.** If nobody has
opened Price list → **Combinations** on the live site yet, this fix arrives on its own and
there is nothing to do. If someone *has* opened it, the site kept its own copy of the old
wording — open that tab and press **"Reset all to the app's version"** once, and it will
pick this up. Saving the MCC section tells you either way: it reports how many parts it
cannot find, and it should say none.

Quotations already saved keep the parts and prices they were built with. Only starters
added from now on are priced correctly.

---

## 2026-08-13 · Mohamed's side · Claude

**Every browser pop-up in the app is now PowerLine's own.**

Following on from the approval dialogs, the remaining **21** have been converted across
the LV configurator, the quotation list, the price list, the RMU offers list and the
P-CSS selector. There is no longer a single grey *"powerline-chi.vercel.app says"* box
anywhere in the app.

That covers three kinds of pop-up, not just one:

- **Questions** — remove a file, delete selected rows, reset the Terms & Conditions,
  build a panel from a standard, retire an item, amend a quotation, and so on.
- **Messages** — "the PDF could not be generated", "that is the last section".
- **Ones that ask for something** — the two file-name boxes for the ERP items CSV and the
  Material List Excel now open a proper field with the suggested name already filled in.

Each one names its action on the button — **Remove**, **Retire it**, **Export**,
**Build it** — rather than **OK**, and anything that cannot be undone is marked in red.
The Arabic Terms & Conditions reset asks in Arabic, buttons included.

Checked in the running app on two different screens, with the browser's own dialogs
disabled to prove they are no longer reached at all.

---

## 2026-08-13 · Mohamed's side · Claude

**The workflow pop-ups are PowerLine's own now, not the browser's.**

The grey box that said *"powerline-chi.vercel.app says…"* with **OK** and **Cancel** has
been replaced by a proper dialog in the app's colours, with the orange bar across the top
and buttons that say what they do.

All five workflow steps went through the same piece of code, so all five changed together
and now read properly:

| Step | Now says |
| --- | --- |
| Send for approval | **Send for approval** — "You won't be able to edit this quotation while it is under review." |
| Approve | **Approve this quotation** — "The creator will be notified that it is ready to submit." |
| Withdraw | **Withdraw from approval** — explains it goes back to draft |
| Submit | **Submit this quotation** — red bar, because it is final |
| Reopen | **Reopen for editing** — notes the offer already sent is not affected |

The **Submit** one is deliberately red: it is the only one that cannot simply be undone.

It follows light and dark mode, closes on Escape or by clicking outside, and Enter only
works while the action button itself is highlighted — so a stray key press cannot approve
a quotation by accident.

Checked on a real quotation waiting for approval: the browser's own dialog is no longer
used at all, the new one shows the right wording and buttons, and Cancel, Escape and
clicking outside all leave the quotation exactly as it was.

---

## 2026-08-13 · Mohamed's side · Claude

**"Show drafts" added to the LV Offers History list** — answering the question in the
entry below, which Mohamed said yes to.

History still opens the way it always has: finished work only, no drafts. Tick **Show
drafts** and work in progress appears alongside it, each row with a **Remove** button.
That is what makes Remove usable — drafts were previously invisible on that screen to
anyone who can see everybody's work.

Checked the whole round trip on the real screen: ticking it took the list from 30 rows to
52, 22 of them removable; removing one asked "Remove df from the lists?", the row went;
**Show removed** brought it back with a **Restore** button; restoring put it back where it
was. The database still holds all 52 quotations — nothing was ever erased — and every step
is in the quotation's history.

The tick box is off by default and appears only for people who can already see all
quotations, so nobody sees anything they could not see before.

---

## 2026-08-13 · Mohamed's side · Claude

**Quotations can be removed from the lists — and brought back.**

The old **Delete** button erased a quotation for good. It is now **Remove**, and it
*hides* the quotation instead: everything is kept, and a **Show removed** tick box (owner
only) lists the hidden ones with a **Restore** button next to each.

Nothing is ever erased, for two reasons: the live database has no backup of any kind, and
a QTN number is only unique per person — so genuinely deleting one would free that number
to be given to a different customer's offer later.

Still only **drafts** and **returned** quotations, as before. Anything approved or
submitted is the record of an offer that went to a customer and cannot be removed. Owners
can now remove anyone's; everyone else only their own, exactly as they always could.
Every removal and restore is written to the quotation's history with who and when.

⚠️ **HEADS-UP — you will not see the button very often, and here is why.** The LV Offers
History list deliberately never shows drafts. So in History the button can only ever
appear on a **returned** quotation, and there are none at the moment. Your own drafts are
removable, but they are not on that screen at all for anyone who can see everybody's work.

❓ **QUESTION FOR MOHAMED:** shall I add a "Show drafts" tick box to the History list, so
your own drafts appear there and can be tidied up in the same place? It is a small change
and it would make Remove actually usable day to day.

---

## 2026-08-13 · Mohamed's side · Claude

**"Configurator Price list 13-8-2026" is now the default catalogue.**

It is **not** a price change — 2,323 items are priced exactly as before and one item moved
down. What it really carries is **pole counts**.

Applied: **189 items updated, 2 added**, published. Prices, the catalogue file and the
database all now match it.

**Why this mattered more than it looked.** The master price list calls its column
**"No.poles"**, and the upload only ever recognised the word **"Poles"** — so *every*
import since the beginning silently threw pole counts away. That is the real reason 22
items ended up costing no connection copper. Both spellings are now accepted, and the
downloaded sheet uses the master's own wording.

**Corrections that went in:** 69 change-over switches moved 3P→4 and 4P→6 (a change-over
has two sets of connections, so it carries more copper than its pole count suggests), plus
the two 6300 A ACBs. These make those items slightly **more expensive** to quote, correctly.

**Held back on your instruction:** 32 breakers in the S203M / S204M "UC" range are written
in the sheet as **1 pole** while their own names say 3P and 4P. They keep 3 and 4. Worth
correcting in the master when you get a chance, or they will come back on the next upload.

⚠️ Two smaller oddities I did **not** hold back, because you did not rule on them —
7 items say 3P but are recorded as 2, and 3 say 2P but are recorded as 3. Tell me if those
are wrong too and I will put them back.

Items missing from the new sheet (58 components, 1 enclosure) were **left offered**, as
agreed — an upload never deletes anything.

📌 **This is the local copy and the app's built-in list. The live site still has its own.**
To bring it across, upload **"Configurator Price list 13-8-2026 (corrected).xlsx"** (next
to the project folder — it is the master with those 32 pole counts held back) on
Price list → LV prices → **Update from Excel**. It will report about 189 changes.

---

## 2026-08-13 · Mohamed's side · Claude

**Pole counts can now be typed straight into the Price list.**

Click the number in the **POLES** column, type, press Enter. It saves and goes live
immediately, the same as any other price change, and it is recorded in History with who
changed it and from what.

Any item that has copper weights but **no** pole count is now **tinted amber**, so the
broken ones can be found by scrolling instead of hunted for. Those are the items being
quoted with no copper cost at all.

Why this was needed on top of the spreadsheet route: an item added straight to the live
site — like `MCCB XT6N 800A-36kA 800 AF TMA 3P` (`1SDA100718R1`), which Mohamed spotted —
is **not in our catalogue file at all**, so no sheet generated from our copy would ever
have reached it. There are likely more of those, and the amber tint will show them.

Prices and copper weights are still read-only here and still come from the Excel upload.
Only the pole count is editable, because it is the one that silently zeroes a cost.

Checked end to end: an item was set back to no-poles on purpose, showed amber with an
explanation, was corrected in the table, and came out saved, recorded in History and
published. Existing saved quotations are untouched — a component keeps the pole count it
was added with.

---

## 2026-08-13 · Mohamed's side · Claude

**The copper-connection under-costing can now be fixed from the Price list screen.**

Connection copper is costed as *copper per pole × number of poles*, so an item recorded
with **zero poles** costs nothing in copper. 22 items are in that state on the live site
(switch fuses, several T4–T7 breakers, the 3200 A change-over). It was corrected in our
own copy weeks ago but the live site keeps its own published price list.

The reason it had been stuck: the spreadsheet upload **always** knew how to set pole
counts, but the **Poles** column was missing from *Download Current Excel* and from the
template — so downloading the list, editing it and uploading it again quietly threw pole
counts away. There was no way to correct them at all.

**Poles is now a column in both**, so the download → edit → upload round trip carries it.

I have also generated a ready-to-upload sheet — **"PowerLine LV - pole counts fix.xlsx"**,
sitting next to the project folder. To apply it:

1. Price list → LV prices → **Update from Excel**
2. Pick that file
3. It shows what it would change — expect around 22 pole counts — press **Apply**

It is safe: every price cell is blank, and a blank cell means "no new information",
never "make it free". Checked against our own already-correct list it reports **zero**
changes, so it can only move the values that are genuinely wrong. Offers already sent are
untouched, and so are saved quotations — a component keeps the pole count it was added
with. Only newly added components pick up the correction.

---

## 2026-08-13 · Mohamed's side · Claude

**New Combinations tab on the Price list — owner only.**

Price list → LV prices → **Combinations**. It holds the templates that decide what goes
*inside* a combination when someone adds one to a panel: ATS, Photocell, MCC starters,
Withdrawable kits and Motorized breaker. Editable as tables, and it takes effect the
moment you save — no waiting for a new version of the app. You can also load a file into
a section, download the whole thing as `combos.json`, and reset everything back to the
version shipped with the app.

Only people with **Manage access** can see or use it — a tighter rule than the rest of
the price list, because these change what a combination *charges for*, not just what it
is called. Quotations already saved keep the parts they were built with.

Until someone opens the tab, nothing changes: the app carries on using its built-in copy.

⚠️ **HEADS-UP — money, and it affects every MCC starter ever quoted.**

The new tab checks each part against the price list, and it found two that have never
matched anything, in **all 110 starters**:

| The template asks for | The price list actually has |
| --- | --- |
| `SK1-11 Signal contact` | `SK1-11 Signaling Contact` — €12.64 |
| `CAL4-11 (1 N.O+1 N.C) - Side` | `CAL4-11 Auxiliary Contact Block - Side (AF09..96)` — €6.63 |

Because the wording does not match, both come out as rows **with no price**, so every MCC
starter has been quoted for less than it costs:

- **DOL (1 or 3 phase)** — about **€19** short per starter
- **Star-Delta** — about **€33** short per starter (it carries three CAL blocks)

❓ **QUESTION FOR MOHAMED:** correcting the two lines in the Combinations tab is a
two-minute job and fixes it from then on — but it does make MCC starters more expensive
to quote, so it is your call, not mine. Say the word and it is done. Offers already sent
are not touched either way.

---

## 2026-08-13 · Mohamed's side · Claude

**Removed the "Empty template" button from the Price list screen.**

It is gone from both the **Components** and the **Enclosures & cells** tabs. The two
remaining buttons — *Update from Excel* and *Download Current Excel* — are unchanged and
still work. Checked in the running app, both tabs, no errors.

⚠️ HEADS-UP: that button was the only way to get a **blank** spreadsheet with the correct
column headings for the *Update from Excel* upload. Anyone who needs a starting sheet now
has to press **Download Current Excel** and delete the rows they do not want — the columns
are identical, so the upload still accepts it. Say so if you would rather have the button
back; putting it back is a two-line change.

---

**Set up the team so nobody has to repeat the audit.**

**For the new joiner — send them this one link:**
<https://claude.ai/claude-code/onboard/RvSDm08AVKiv>
It opens the onboarding guide inside Claude Code, so their Claude starts already knowing
the project and the working rules. Two things still have to come from Mohamed by hand:
GitHub collaborator access (repo → Settings → Collaborators) and the `HANDOFF.secrets.md`
file, handed over on a USB stick or through a password manager — never by e-mail or chat.

- Added this log file, and a `CLAUDE.md` that tells every Claude on this project how to
  work here — same rules for both of us, so we get the same behaviour and the same
  safety checks.
- Added `ARCHITECTURE.md`: the complete write-up of how the app works, produced by
  reading all ~40,000 lines. **Anyone joining should point their Claude at this instead
  of exploring the code again.** It took about an hour of machine time to produce.
- Rewrote `HANDOFF.md` in plain language and marked the old, wrong parts as history.

⚠️ HEADS-UP: **the emergency price switch would serve July prices.** If anyone ever
flips the price list back to the "bundled" source, customers would be quoted July
figures with no warning on screen. The bundled copy needs refreshing from the live
price list. Not urgent, but it should not be forgotten.

❓ QUESTION FOR MOHAMED: the Vercel key you sent works, but it has **no access to the
powerline project** — it can sign in and see nothing. Nothing is broken by this and
normal work does not need it. If you want a working one: Vercel → Settings → Tokens →
Create, and set **Scope** to the *team*, not your personal account. Otherwise ignore it.

⛔ BLOCKED: checking whether any **KWHM quotation was already sent to a customer**
(see the entry below — those offers printed no components). This needs the production
database address, which only you can copy. In Vercel → Settings → Environment
Variables → `DATABASE_URL`, reveal the value, and paste it into `backend/.env` on your
machine as one new line, `PROD_DATABASE_URL="…"`. Do not paste it into a chat message.
Then say "check KWHM" and it takes a minute.

---

## 2026-08-12 · Mohamed's side · Claude

**Recovered the project after the old account was lost, then audited all of it.**

- The local copy on Mohamed's computer was **130 commits behind GitHub** — everything
  built after mid-July (the approval workflow, Access Center, Co-Work sharing, Standard
  EDMS panels, ERP export, the sales e-mail button) was missing from it. Brought it up
  to date. Nothing was lost.
- Confirmed **pushing to GitHub really does update the live site by itself.** The old
  handoff said this was not connected; it is, and it works.
- Confirmed the app builds and runs correctly on Mohamed's machine.

**Retired the Excel price sheets.** Editing `RMU-Pricing.xlsx` or `LV-Pricing.xlsx`
had stopped affecting customers a while ago — prices come from the database now — and
the sheets had drifted two weeks behind. Anyone "updating the prices" there was
changing nothing. The sheets, the import/export scripts and `update-prices.bat` are
gone. **Prices are edited only on the Price list screen in the app.**

⚠️ HEADS-UP: two real faults were found and confirmed, and are written up in
`CLAUDE.md` §7 ready to be fixed:

1. **KWHM panels are charged for but print no components** on the Technical Offer the
   customer receives. So a KWHM offer understates what is being supplied.
2. **Some quotations open as a blank white page** instead of showing an error.

Also corrected a mistake in `OPEN-ISSUES.md`: it says the live site cannot send any
e-mail. That is **wrong** — all six mail settings are present in Vercel. (Whether the
Google app password behind them is still valid was not confirmed.) The only setting
genuinely missing is `APP_URL`, which only affects the "Open the quotation" button
inside notification e-mails.
