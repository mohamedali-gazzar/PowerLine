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
## 2026-08-24 · Mohamed's side · Claude

**✅ "Check for updates" now looks like the other Home buttons, and drafts can apply the new prices.**

Two tweaks to yesterday's move: the Home "Check for updates" button now uses the same plain button
style as "Access Center" (matching height and look). And the "apply these prices to this quotation"
action is back — but only on a draft (still-editable) quotation: open a draft, press "Check for
updates" in its toolbar, and you can pull its component/cell prices up to the current list. Locked
quotations (waiting/approved/submitted) don't show it. Build green, 38 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ "Pillars" and "Coffree" enclosures are temporarily locked (can't be picked).**

Neither "Pillars" nor "Coffree" appears in the enclosure-family picker any more, so no new panel
can be built on them. Quotations that already use them are unaffected — their prices and the rest
still work exactly as before. It's a one-line switch to turn back on whenever you say. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Spare-parts quotations now export an ERP CSV too.**

A spare-parts quotation now shows the "⬇ ERP CSV" button like a normal one. Its spare-parts line
goes into the file with the Item Code and Item Group both set to "LV Spare Parts"; every other
column is filled the same way as a panel line (priced at its selling price). Normal panel exports
are unchanged. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ "Check for updates" moved from inside a quotation to the Home page.**

The "⟳ Check for updates" button (re-reads the published price list and shows what changed) now
lives on Home next to "Access Center", instead of inside each quotation's toolbar. Anyone can run
it from Home to see whether the price list is current. (The per-quotation "apply these prices to
this quotation" button went with it — tell me if you want that part kept inside quotations too.)
Build green, 38 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ Approvers can now edit a quotation "on scratch" to compare, without changing the estimator's work.**

When a quotation is waiting for approval, a Section Head or Team Leader opening it now gets a
**Review mode**: they can freely swap components and see how the price would change — to weigh
"what if we replace this part" — but **nothing they do is saved**. A yellow banner makes this
clear and shows the original selling total next to the "now" total with the difference, plus a
"Reset to original" button to snap back. When they return it for revision, the estimator gets
their **original quotation back, untouched**, with the approver's comments. It's safe two ways:
the app never saves an approver's scratch edits, and the server refuses their writes anyway.
The estimator (owner) and co-workers are unaffected — their edits are still real and saved.
Verified live end-to-end. Frontend build + 38 tests green.

## 2026-08-24 · Mohamed's side · Claude

**✅ RMU offers now track hands-on time too (same as LV quotations).**

The active-time tracker now also runs on RMU offers: a live "⏱" timer in the RMU editor
header counts the real working time while you build the offer, it's saved on the offer, shown
on the RMU offer's detail page, and it fills the "Active time" column in Offers History (RMU
rows used to show "—"). Same rules as LV — counts while you're active, pauses after ~90s idle
or when you leave, and only the owner adds time. Adds one small defaulted column
(Offer.activeSeconds) — safe for the deploy's db push. Backend 291 tests + frontend 38 tests green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Every LV quotation now tracks the real hands-on time spent on it.**

Each LV quotation now measures the actual working time — the minutes someone is genuinely on it
and active — and adds them up across every session, instead of the calendar gap from creating it
to submitting it. So a quotation opened at 2pm one day and submitted at 2pm the next, but only
worked on for 15 + 9 + 6 + 30 minutes, records **60 minutes**, not a day. A live "⏱" timer shows
in the quotation header (it counts while the page is open and you're active, and pauses after a
minute and a half of no clicking/typing or when you switch away), and the total is saved on the
quotation and shown in a new "Active time" column in the Offers History. Only the people building
it (owner / co-worker) add time; it stops once the quotation is submitted or locked. Adds one
small, defaulted column (activeSeconds) — safe for the deploy's db push. LV only for now (RMU
offers still show "—"). Backend build + 290 tests green; frontend build + 38 tests green.

## 2026-08-24 · Mohamed's side · Claude

**✅ The New-QTN number field now starts empty (was pre-filled with "QTN-26-").**

When you create a quotation, the number box no longer starts with "QTN-26-" typed in — it's
empty, with a faint "QTN-26-00000" hint showing the shape. You type the number and the dashes
fill themselves in as you go. Creating still only accepts a complete number in the QTN-YY-NNNNN
form (a 2-digit year and a 5-digit serial), so nothing incomplete gets through. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Fixed the QTN-number offer link opening the quotation list instead of the offer.**

The by-QTN-number link had put the internal code after a "#", and other apps (like the ERP)
quietly drop everything after the "#" when you save or open a link — so it arrived without the
code and couldn't find the offer, landing on the list. The code now sits in the address itself
(`…/lv/qtn/QTN-26-12354-1/<code>`), which can't be dropped, so the link always opens the right
offer while still showing the quotation number as the name. Old links still work. Build green, 38 tests.

## 2026-08-24 · Mohamed's side · Claude

**✅ The offer link now reads by QTN number, not the internal id.**

The copied link's address now shows the quotation number instead of the long internal code —
e.g. `…/lv/qtn/QTN-26-12354-1#…`. Opening it still lands on the exact same offer: the internal
code rides quietly at the end (after the "#") so there's never any mix-up, even though two
people can have the same quotation number. Links you copied before still open fine. Build
green, 38 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ The copied offer link now carries the QTN number in the web address itself.**

The link that "Copy link" copies now ends with the quotation number (e.g.
`https://…/lv/qtn/…#QTN-26-12354-1`), so you can see which quotation it points to straight
from the address — while it stays a valid link a URL field accepts, and still opens the right
offer when clicked (the number after the "#" is just a label the app ignores). Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Fixed "Copy link" so a URL field in the ERP accepts it ("Invalid URL" error).**

When you pasted the copied offer link into the ERP's URL field it complained "URL must start
with http:// or https://". That was because the plain-text form started with the quotation
name ("QTN-26-… — https://…"). It now copies the plain web address on its own, so a URL field
takes it straight away. Pasting into a notes/rich-text field still shows the tidy clickable
link named after the quotation, exactly as before. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ One-click "Copy link" for pasting an offer into the ERP.**

There's a new "🔗 Copy link" button in the quotation header's action row, beside "⬇ ERP CSV". It
copies a link to this offer that is already named for you — the quotation number with its
revision (e.g. "QTN-26-12354-1"), never typed by hand and always in step with the number/
revision on screen. Paste it into a notes/rich-text field in the ERP and it shows up as a
clickable link that reads as the quotation name (not a long web address); paste into a plain
text field and you get "QTN-26-12354-1 — <link>" instead. Build green, 38 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ Removed the divider line under the logo on the Terms & Conditions pages.**

The thin grey rule beneath the PowerLine logo on the Commercial Offer's Terms & Conditions
pages is gone — on both the English and the Arabic terms. The logo still sits at the top of
every terms page as before; only the line under it is removed. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ The price database can no longer add a component with the on-screen form.**

The "+ Add a component" button on the LV price database is gone. Adding a new item is now
done only the safe way: press "Download Current Excel", add the row in the spreadsheet, then
"Update from Excel" to upload it back. This keeps every addition going through the same
checked import path instead of a quick one-off form. Build green, 38 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ Cleaned up the header spacing on the Commercial Offer priced pages.**

The header on the Commercial Offer's price pages (logo + project + customer/quotation number)
had a thin grey divider rule under it that repeated on every page. That rule is removed — the
price table's own column heading already separates it — and the gap between the header and the
table is now a comfortable, even margin (it had briefly been too tight). Only the Commercial
Offer changed; the Technical Offer header is untouched. Build green, 38 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ Commercial Offer Terms & Conditions now break cleanly, with the logo on every page.**

When the Terms & Conditions ran longer than one page, the exported Commercial PDF used to
slice the sheet straight across at the page edge — cutting a line of text in half — and the
PowerLine logo only showed on the first page. Now the terms are laid out as proper pages:
the logo sits at the top of every page, each page leaves an empty footer margin at the
bottom, and the page always breaks *between* clauses, never through a line. English and
Arabic are handled the same way. Verified on a real offer whose English and Arabic terms
each run two pages: both pages carry the logo, both break cleanly, nothing is cut. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Dragging a panel to reorder now auto-scrolls a long list.**

When a panel list is long enough to scroll, holding a dragged panel near the top or bottom
edge of the list now scrolls it automatically, so you can move a panel all the way across a
40-panel list without letting go. It scrolls the list's own box (or the page on a narrow
screen), and the panel stays glued under the cursor as it scrolls. The lift/settle feel and
touch support are unchanged. Display order only — no pricing touched. Build green, 38 tests.

## 2026-08-24 · Mohamed's side · Claude

**✅ "No. of poles" now also counts the reserved "Space for MCB" rows.**

A "Space for MCB 1P" / "Space for MCB 3P" row reserves rail space for a breaker you'll add
later, but it was being left out of the "No. of poles" total entirely. It now counts by its
poles just like a real breaker — a 1P space = 1 pole, a 3P space = 3 — so a Main-Incoming
with a 3P MCB + a 1P MCB + a "Space for MCB 1P" now reads 5 poles, not 4. Reserved spaces
for panel-mount devices ("Space for MCCB/ACB") stay out, since this summary is DIN-rail
width only. Sizing readout only — no price changes. 38 tests pass (4 new); build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ "No. of poles" now counts each MCB by its real pole count (1P = 1, 3P = 3).**

The panel-width summary counts the space a breaker takes as one module per pole — a 1-pole
MCB is 1 pole of space, a 3-pole MCB is 3, times the quantity. It already did this for
breakers picked from the catalogue; the change makes it read the pole count straight from
the breaker's own rating (the "1P/2P/3P" in its name, or the ABB S20x code), so the space
is still correct for an older saved quotation or a hand-typed row whose stored pole number
was off. This is only the sizing readout that helps choose the enclosure width — it does
not change any price (all 34 tests pass, including every cost test). Frontend build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Re-ordering the panels in the list is smooth now (and only changes their order).**

You could already drag a panel by its dotted handle to change its place in the LV panel
list. It now feels the way it should: grab the handle and the row lifts gently (a soft
shadow, a raised feel) and follows your finger/cursor up and down, while only the one
neighbour it would push past slides aside to open a gap — no jumping, no flashing, no
resizing. Let go and it settles into its new slot, the panels renumber (1, 2, 3…), and
every total updates. It works with touch as well as the mouse, and the panel fields stay
fully clickable — only the handle starts a drag. Dragging changes the display order only;
it never touches any price or cost (all 29 pricing tests still pass). Frontend build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Two approvers can't review the same QTN at once (a "someone is reviewing" lock).**

When an approver opens a quotation/offer that's waiting for approval, it locks to them.
A second approver who opens it sees "🔒 <name> is reviewing this now" with Approve/Return
disabled until the first one finishes. The lock keeps itself alive with a heartbeat and
frees automatically after ~45s if the reviewer's tab is closed or crashes; it also releases
the moment they leave. An Admin gets a "Take over" button to claim it. Works in both LV and
RMU. Adds one small, additive table (ReviewLock) — safe for the deploy's db push; 289 tests.

## 2026-08-24 · Mohamed's side · Claude

**✅ Dragging a component to reorder it is smooth now (was laggy).**

Reordering a component (or moving it to another section) used to stutter because the whole
components list re-rendered on every tiny movement (it was updating React state just to show
the orange "drop here" highlight). Now that highlight is drawn directly on the hovered row/
section without any re-render, so the drag follows the cursor smoothly. The reordering itself
is unchanged.

## 2026-08-24 · Mohamed's side · Claude

**✅ An approver can now withdraw their approval (before the offer is submitted).**

After approving a quotation/offer, an approver (Section Head / Team Leader / Admin) can
press "Withdraw approval" to take the approval back — it returns to "Waiting for approval",
the approval record is cleared, and the owner is notified. Only possible while it hasn't
been submitted yet; once submitted there's no withdraw (only the permissioned Reopen).
Works in both LV and RMU. Backend tests updated (287 pass).

## 2026-08-24 · Mohamed's side · Claude

**✅ Exported Technical / Commercial offers are always light, even in night mode.**

When you worked in dark mode, the exported LV Technical & Commercial PDFs came out dark
because the pages were captured outside the "print-area" that keeps offers on white paper.
The export now renders the pages with the light offer palette regardless of your app theme,
so the customer always gets a clean white document. (RMU offer PDFs are built on the server
and were already light.)

## 2026-08-24 · Mohamed's side · Claude

**✅ LV: you can now Withdraw an approved quotation before submitting it.**

On the LV side the Withdraw button only appeared while a quotation was Waiting for approval —
not after it was Approved. Now the owner can Withdraw at both stages (it goes back to Draft
and the approval is undone), matching the RMU offers. Once the quotation is Submitted there
is still no Withdraw — only a permissioned Reopen for admins, unchanged.

## 2026-08-24 · Mohamed's side · Claude

**✅ Send-for-approval dropdown now also lists Admins (so section heads show up).**

A section head is usually given the **Admin** role, so they weren't appearing in the
approver dropdown (which listed only Section Head + Team Leader). Admins are now included
too, so whoever manages approvals shows up regardless of whether they're set as Admin or
Section Head.

## 2026-08-24 · Mohamed's side · Claude

**✅ Fix: the Send-for-approval dropdown was getting cut off by the toolbar.**

The approver list now floats above everything (rendered at the page level, positioned under
the button) so it's no longer clipped by the surrounding bar. Closes on outside click,
Escape, or scroll.

## 2026-08-24 · Mohamed's side · Claude

**✅ "Send for approval" is now a dropdown of Section Heads & Team Leaders (LV + RMU).**

Instead of a plain button, Send for approval opens a short list of the people who can
approve — only users whose Access-Center role is **Section Head** or **Team Leader**. Pick
one and the quotation/offer goes to them: they get the notification and the history records
"Sent to <name> for approval". (As agreed, any approver can still approve it — the choice
just targets who is notified.) Works the same in the LV configurator, the RMU editor and the
RMU offer page. New `GET /api/qtns/approvers` feeds the list; no database change. If no
Section Head/Team Leader is chosen it falls back to notifying all approvers as before.

## 2026-08-24 · Mohamed's side · Claude

**✅ Panel pricing: reset icon beside Factor + Total selling previews the target.**

- The ↺ reset icon now sits beside the Factor value (not the target box); clicking it
  immediately puts the panel back on the Pricing Settings (project) factor — no Apply needed.
- Typing a Target selling now previews the new Total selling (target × qty) and updates the
  footer total; resetting returns it to the default selling at the project factor. Unit
  selling stays as the current-price reference.

## 2026-08-24 · Mohamed's side · Claude

**✅ Panel pricing table: copy the Total cost column, and collapse/expand the card.**

- A small copy icon in the "Total cost" header copies that whole column as plain numbers,
  one per line (e.g. 2846 / 2846 / 18) — paste straight into Excel.
- The "Panel pricing" card now opens/closes with a ▶ arrow beside its title, like the
  Panel details / Panel cost cards (the open/closed state is remembered).

## 2026-08-24 · Mohamed's side · Claude

**✅ LV Pricing Settings tab: a per-panel "Panel pricing" table + clearer cost steps.**

Reworked the Pricing Settings tab:
- Removed the "Record Results" box; the Pricing Settings and Live Exchange Rates cards are
  now centered, and the new table below is the same width.
- New **Panel pricing** table (like the commercial offer): each panel's Total cost · Factor
  (the project factor) · Unit selling · **Target selling** · **New factor** · Total selling,
  in USD or EGP. Type the price you want to sell a panel at → it shows the **New factor**
  needed (as a preview; your typed value stays put). A ↺ icon beside the box clears it and
  puts the panel back on the project factor. **Apply to Panels & Commercial Offer** commits
  every change at once; a factor above 0.95 (almost no margin) asks first.
- The per-panel **Panel cost (live)** card now shows the calculation in order: cost items →
  **Total Cost** (with operations % + safety % folded in) → ÷ factor → **Unit Selling**
  (EGP & USD). The old editable Factor box and the "Target Price" pop-up were removed
  (pricing now lives in the table).

Prices are unchanged — operations/safety were already in the selling price; this only moves
them into the shown "cost" step so the math reads correctly. Frontend builds; 29 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ LV Panels: "Target Price" tool — solve the selling factor from a price you want.**

New 🎯 Target Price button in the Panel cost (live) card. Type the price you want to sell
the panel at (USD or EGP) and it works out the selling factor that gets you there — e.g.
a panel selling at 610 USD on factor 0.7, want 500 USD → factor 0.854. (The price is
inversely proportional to the factor, so a lower price needs a higher factor.) Apply sets
the panel's factor. If the new factor comes out above 0.95 — almost no margin, price near
cost — it warns and refuses to apply until you confirm ("Apply anyway"). Verified live.

## 2026-08-24 · Mohamed's side · Claude

**✅ QTN number field is now locked to the format QTN-YY-NNNNN (LV and MV).**

The quotation-number field only accepts the serial "QTN-" + 2-digit year + 5-digit number
(e.g. QTN-26-01129). It fills in "QTN-26-" for you, ignores anything that isn't a digit,
adds the dashes automatically, and won't let you create/rename until the 5-digit serial is
complete. Applied to: the New-QTN dialog (LV panels, Standard EDMS, RMU), the RMU editor's
QTN field, and the LV workspace's QTN (rename) field. Existing older numbers still show and
save as they are — only what you newly type is held to the format.

## 2026-08-24 · Mohamed's side · Claude

**✅ Dashboard "My QTN History" no longer shows deleted QTNs.**

The Home dashboard's history was fetching every LV quotation and RMU offer — including
soft-deleted ones — while the main Offer History correctly hides them. Added the same
"not removed" filter to the dashboard's data (`/api/account/history`), so a deleted QTN
never comes back on the dashboard. Verified: created a throwaway offer, deleted it, and it
disappeared from the list immediately. Backend builds; 285 tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ RMU editor polish: QTN in the confirmation, no header PDFs button, New-QTN on Home only.**

Three small follow-ups to the RMU editor:
- The "✓ Offer … generated" confirmation now shows the QTN number (e.g. "Offer 52"),
  not the internal PL-2026-#### number.
- Removed the "⬇ PDFs" button from the editor header (it only had Check-for-updates +
  Send-for-approval left, like LV). PDFs are still downloaded from the Technical /
  Commercial tabs.
- Removed the "+ New" button from an offer's detail page. Creating a new QTN now lives
  on the Home dashboard only.

## 2026-08-24 · Mohamed's side · Claude

**✅ RMU offers now work like LV quotations — a re-editable draft with autosave & approval.**

Picking RMU in "New QTN" now asks for the number + project + customer, creates the draft,
and opens it in an editor with the LV-style header: QTN number · "RMU Quotation" · total
(excl. VAT) · status on the left; Check-for-updates · PDFs · Send-for-approval on the right.
While the offer is a Draft (or Returned for revision) you can keep editing it — every change
saves itself automatically, and it reopens exactly as you left it. Once you Send for
approval it locks and opens read-only, same as LV. Offer-History rows (and Amend/Duplicate)
open a draft RMU straight into this editor; a locked one opens the read-only view.

Backend groundwork (the PUT endpoint) shipped earlier; this is the whole front end.
Undo/Redo and Share/co-work are the next phase (they need new backend). Verified live:
create-from-dialog, hydrate (incl. multi-RMU), autosave persisting server-side, send for
approval, and the lock. Frontend builds; no new backend risk.

## 2026-08-24 · Mohamed's side · Claude

**✅ LV: an MCB incomer now defaults the Busbar Rating to 100 A (really this time).**

An earlier attempt matched the word "MCB", but in the catalogue a miniature C.B's type is
actually "MDRC" (also "MDRC-Himel"/"MDRCs") — so an MCB incomer was never recognised and
the Busbar Rating field just stayed blank. Fixed: the breaker detector now knows the MDRC
type, and when every incoming C.B is an MDRC the Busbar Rating fills with 100 A. If an
MCCB/ACB is also on the incoming side, the frame rule still wins so the bar isn't
undersized. It's a default — you can still type over it. Verified against real catalogue
parts (345 MDRC rows).

## 2026-08-24 · Mohamed's side · Claude

**✅ Offer History shows the revision number (e.g. QTN-26-1129-1).**

An LV quotation with a Revision No. set on the Project tab now shows that suffix in Offer
History (matching what the offer document prints), instead of only the base number. The
revision is denormalized onto a small column on save (the History list can't load the full
state — that once took the site down), and the list appends "-N" when it's > 0. It fills in
on a quotation's next save. Adds an additive `revisionNo` column (default 0, safe).

## 2026-08-24 · Mohamed's side · Claude

**✅ Groundwork: a draft RMU offer can be updated in place (for the coming LV-style editor).**

Added `PUT /api/offers/:id` (+ `updateOffer` service + `api.updateOffer`) so a DRAFT RMU
offer can be edited and re-saved in place — re-freezing its prices exactly like create,
keeping its number/status, and refused once it's past Draft/Returned (same lock as LV).
Not wired into any screen yet; it's the backend half of turning the RMU page into an
LV-style editable draft (Phase 1). Safe on its own — an unused, gated endpoint.

## 2026-08-24 · Mohamed's side · Claude

**✅ Offer History: a quotation can now be removed at any status.**

The Remove (trash) action in Offer History was only available on LV quotations that were
still Draft or Returned — approved/submitted ones couldn't be removed. It can now remove a
quotation at **any** status (RMU offers already allowed this). This is unchanged in spirit:
it's a **soft hide**, not an erase — the row is kept, the number stays reserved, it's
audited, and it comes back with "Show removed". Who can do it is unchanged: your own rows,
or anyone's with admin (access.manage). Backend builds + 284 tests pass; frontend builds.

## 2026-08-24 · Mohamed's side · Claude

**✅ LV: an MCB incomer now defaults the Busbar Rating to 100 A.**

When a panel's incoming breaker is an MCB (every breaker in the Main Incoming section is an
MCB — no MCCB/ACB), the Busbar Rating now auto-fills to **100 A** as soon as the incomer is
added, instead of reading the MCB's small rated current. It's still editable, and an
MCCB/ACB incomer keeps the existing "snap to the breaker's ampere frame" rule. Frontend
builds; tests pass.

## 2026-08-24 · Mohamed's side · Claude

**✅ ERP CSV: the "Item Name" column now shows the panel name (was the item code).**

In the ERP CSV export, the "Item Name" column was filled with the enclosure-family
identifier — the same value as "Item Code" — so it read like a code. It now shows the
panel's own name (what the user typed, e.g. "MSB-ARCADE"). "Item Code" still carries the
enclosure identifier the ERP matches on, so imports are unaffected. Frontend builds; tests pass.

## 2026-08-24 · Mohamed's side · Claude

**Two things: legacy RMU offers no longer pretend to be Submitted, and the owner account is
locked against everyone.**

### 1. The submittedAt fault is fixed

Your postOffer fix was already in — new offers no longer get a submission date. The problem
was the rows created before it. `offerStatus()` fell back to
`submittedAt ? SUBMITTED : DRAFT`, and on Offer that column never meant "went through
approval": the old code stamped it the moment an offer was **generated**, to feed the
dashboard chart. So every pre-workflow offer reported as **Submitted** while Offer History
correctly showed it as **Draft** — which made it undeletable and put it in the wrong place
in the approval queue and the transition rules.

The fallback now reads the **`submitted` mirror** instead, which is safe to trust because
`statusWrite()` is its only writer and always sets `statusAt` alongside it. A row that never
moved through the workflow reads false, so it is a Draft — which is what it is. Same shape
as `qtnStatus()`.

`submittedAt` keeps its own meaning and its own consumers (the weekly chart); it is simply
no longer mistaken for a workflow state. Verified locally: `PL-2026-0006` went from
`status=SUBMITTED locked=true` to `status=DRAFT locked=false` and became deletable, with its
`submittedAt` untouched. 7 new tests pin it.

**No data migration was needed**, which is why this was safe to do without a decision from
Mohamed — nothing was rewritten, only re-read correctly.

### 2. The owner account is locked

Mohamed asked for his account to be untouchable. Locking yourself out of the Access Center
is the one mistake with no way back through the app — the only recovery is a script against
the production database — so this is worth having.

`OWNER_EMAILS` in `backend/src/config.ts` names the owner (defaults to
`mohamed.ali@powerline.com.eg`, overridable by env so ownership can move without a code
change). Three things follow:

- **`accessOf()` grants that account every admin permission whatever the database says.**
  Proven: with the row forced to `role=USER tier=ENGINEER perms=[]`, the server still
  returned tier ADMIN with `access.manage`, and the Access Center still opened. A bad edit,
  or a restore from an older backup, cannot lock the owner out.
- **`setAccess` refuses any change to its role or permissions — 403, for everyone,** another
  admin and the owner alike. E-mail notifications stay editable, because a preference is
  not access.
- **The card is visibly locked:** a red border, a red "🔒 Owner — locked" badge, the role
  shown as a red **Owner** box instead of a dropdown, all 15 permission ticks checked and
  disabled, and a line saying the server refuses the change so it is not merely a hidden
  button. Verified in the browser: 15 permission boxes all disabled, notifications still
  enabled, no dropdown in that card.

Note **Owner is not a role anyone can be assigned** — it is this one account. It does not
appear in the role dropdown, so nobody can be promoted into it by mistake.

One deliberate gap: **"Approve their own QTNs" is still not granted to the owner.** That
stays a separate opt-in by design, and since the owner card is locked it can now only be
changed in the database. Say if you want that included instead.

313 tests passing, both typechecks and builds clean.
## 2026-08-24 · Mohamed's side · Claude

**Fixed: the sidebar "resume draft" shortcut was showing someone else's draft.**

Mohamed's sidebar offered "222" as *his* draft to resume. 222 belongs to Rana Hazem.

Same root cause as the delete bug an hour earlier, which is what makes it worth writing
down as a pattern rather than a one-off: **a personal feature was built from the widened
all-users list.** The shortcut combines two sources —

    api.qtns.list()    // correctly scoped: own + co-worked quotations
    api.listOffers()   // returns EVERY user's offers to a qtn.viewAll holder  <-- leak

— sorts them by last-updated and takes the newest DRAFT. For anyone who can view all
quotations, a colleague's draft could win and be presented as their own work to resume.

`GET /api/offers` now accepts **`?mine=1`**, which returns only the caller's own offers
whatever their permissions, and the sidebar uses it. Verified: the Offer History list still
shows all 6 local offers to an admin, while `?mine=1` returns 0 — correct, because that
user owns none of them. Before the fix that same query is what surfaced 222.

It is also less data: the shortcut no longer downloads the whole company's offers to pick
one row.

### The pattern to watch for

Reads widen for `qtn.viewAll` so approvers can act on work awaiting them — that widening is
correct and deliberate. But anything **personal** must not consume the widened result:
a "resume my draft" shortcut, a "my work" count, a personal dashboard tile. Two bugs today
came from exactly this. If a feature says "my" or "your", scope it explicitly.

LV was already right (`sharedWith(uid)` = own plus co-worked), so only the RMU half leaked.

300 tests passing, both typechecks and builds clean.
## 2026-08-24 · Mohamed's side · Claude

**Fixed: deleting an RMU offer said "Offer not found" and left it in the list.**

Reported on `222` in Offer History. The cause was a mismatch the unified list created:

- the list shows **every user's** RMU offers to anyone with `qtn.viewAll`, so an admin sees
  colleagues' offers and a Delete button next to them;
- but `deleteOfferById` required **ownership**, and answered `404 "Offer not found"` otherwise.

So the button was offered to people it would always refuse, and the refusal described the
wrong problem — the offer existed, it just was not theirs. Nothing was deleted, so the row
stayed after a refresh. Both halves were wrong.

RMU delete now mirrors the LV quotation rules exactly:

| | Before | Now |
| --- | --- | --- |
| Admin removing a colleague's offer | 404 "Offer not found" | **204, removed** |
| Non-admin, someone else's offer | 404 "Offer not found" | **403 "This offer belongs to someone else."** |
| Someone with no visibility at all | 404 | 404 (unchanged — no information leaked) |
| Removing twice | error | 204, idempotent |
| What happens to the offer | **erased** | hidden, and restorable |

**It is now a soft remove**, which also closes an open P1: offers were hard-deleted, and
`nextOfferNumber()` derives the next number from the highest one in use — so deleting the
latest offer made the next one **reuse its `PL-YYYY-####` number**, and two different
documents could reach a customer under the same reference. `Offer` gains `removedAt` and
`removedBy` (both additive and nullable/defaulted, so the deploy cannot damage anything),
and the **Show removed** tick in Offer History now covers RMU offers as well as LV ones —
owner-level only, exactly as it already was for LV.

Verified against the local database, every branch: an admin removing a colleague's offer
returns 204 and it drops out of the list; it comes back with Show removed; a second remove
is a no-op; the row is still in the table with `removedBy` recorded; a non-admin with
`qtn.viewAll` gets the 403 and cannot see removed offers at all. Test data restored
afterwards.

### ⚠️ A worse fault found while doing it — not yet fixed

**`postOffer()` stamps `submittedAt` the moment it attributes an offer to a signed-in
user.** Combined with `offerStatus()` falling back to `submittedAt ? SUBMITTED : DRAFT`
whenever `statusAt` is null — which it is for every offer created before the approval
workflow existed — **every legacy RMU offer reports as Submitted on the server** while
Offer History correctly shows it as Draft.

I found this because I had added a "cannot remove a submitted offer" guard, and it blocked
almost every existing offer. I removed the guard (a soft remove is reversible, so the guard
cost more than it protected) and left the reason in a comment at the call site — but the
underlying fault is still there, and it matters beyond deletion: anything that trusts
`offerStatus()` on a legacy offer sees the wrong state. That includes the approval queue and
the transition rules on the RMU workflow you just built.

Worth fixing at the source: `postOffer` should not set `submittedAt`, and existing rows need
deciding on — they are indistinguishable from genuinely submitted ones by that column alone.
That is a business call, so it needs Mohamed rather than a guess.

299 tests passing, both typechecks and builds clean.
## 2026-08-23 · Mohamed's side · Claude

**✅ LV Commercial PDF: header now repeats on every page and rows are never cut.**

When a commercial offer had enough panels to run past one page, the exported PDF was
snapshotting the whole priced table as one tall picture and slicing it at page height —
so a line item got cut in half at the page break and the header disappeared on the later
pages. The Main Offer table now paginates properly: the logo/project header **and** the
"Item / Description / Qty / Unit / Total" column header repeat on **every** page, the line
items flow across pages **without being cut**, and the totals sit after the last line. The
Terms & Conditions pages are unchanged. Applies to the "Download Commercial PDF" button and
the combined "send to sales" export. Frontend builds; all tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ Return-for-revision comments are now shown as a saved history (LV + RMU).**

Every "Return for revision" was already recorded in the audit trail, but the screen only
ever showed the *latest* comment. Both the LV quotation and the RMU offer now show a
**Revision history** panel listing every return comment — the full text, who returned it,
and when — newest first, and it stays visible after the quotation is re-sent or approved.
Because the data was already being saved, returns from before today show up too. Added a
read-only `/api/offers/:id/events` endpoint for the RMU side (the LV one already existed),
owner/approver-gated. Both halves build; all tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ LV Copper Tool cells now accept formulas (like a spreadsheet).**

In the Copper Tool (cell panels), the Phase L / Neutral L / Earth L boxes now accept a
formula. Type e.g. `=1000+1000+500` and on Enter (or clicking away) it works it out and
writes **2500**. It understands + − × ÷ and brackets (`=2*(3+4)-1` → 13), spaces are fine,
and the leading `=` is optional. Plain numbers still work and update the weight as you
type; anything that isn't a valid sum just becomes 0. No change to the copper-weight
formula itself. Frontend builds; all tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ LV: the per-panel selling Factor box is now freely editable.**

The Factor field on an LV panel (Panels tab, and the LCP/KWHM auxiliary editors) was hard
to type into — as soon as what you typed hit "0" (which happens at "0" and "0." while
typing), it snapped back to the global Pricing-Settings factor, so a value like 0.7156852
was almost impossible to enter. It now holds exactly what you type (partial decimals
included), the live cost updates as you type, and clearing the box goes back to the global
factor. No change to prices or the formula — only how the box behaves while editing.
Frontend builds; all tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ On-screen commercial offer matches the PDF; saved offers now show the cover + A4.**

Follow-up to the on-screen technical work below:
- The on-screen **Commercial** offer (`CommercialView`) now matches the commercial PDF —
  an understated "Main Offer" table (grey column labels over an orange rule, thin lines
  between rows), a plain totals block closed by an orange rule with the Total in orange,
  and the terms summary — instead of the old solid-orange table header and orange total bar.
- The **saved-offer page** (opening a quotation from Offer History) now shows the branded
  **cover** and lays the technical/commercial document out on an **A4 sheet**, the same as the
  create screen and the exported PDF. Previously it showed the bare tables with no cover.

The create screen already showed covers + A4 on both tabs. Frontend builds; all tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ On-screen RMU offer now looks like the exported PDF.**

The RMU technical offer you see while creating/opening a quotation (`OfferView`, used on
the create page and the saved-offer page) was still the old look — a big orange banner with
tags, striped tables and a bullet notes list. It now mirrors the exported PDF: a clean
header (product + system code), the General/Electrical Data as cards with an orange title
bar and a peach label column, numbered white General Notes, and the Ring Main Unit Structure
with an ink title, orange "Qty | Description" header, a shaded cubicle row and grey striped
parts — with every cell's text vertically centred. Frontend builds; all tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ RMU offer: structure table recoloured (grey, ink title) + cubicle wording tidied.**

Matched the structure table to the approved look:
- "Ring Main Unit Structure" title is now dark (was orange); its orange underline stays.
- The row shading changed from the light-orange (peach) to a neutral **grey**, and the
  part descriptions are a slightly softer grey.
- Cubicle part wording tidied to the cleaner form (`assembly.ts`): "Cubical type →
  Cubicle type", "Switch disconnector → switch-disconnector", "mm2 → mm²", "(Single core)
  → (single core)", "230VAC → 230 VAC", "Three position → three-position", "low voltage →
  Low voltage", "(2kA) → (2 kA)". Spelling/format only — no parts, quantities or ratings
  changed. The cubicle NAME line ("Cubical: PCC …") is unchanged.

Also earlier today: General Notes rows made plain white + slightly shorter.

Builds; 270 tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ RMU offer: page header + structure tables restyled to match the approved look.**

Two more visual tweaks to the RMU offer PDF (`pdf.service.ts`, look only):
- **Header** on each content page: bigger PowerLine logo; the system code (e.g.
  PRAL10AB12R2T1W) is now black/bold (was orange); the config code shows with a space,
  "PRAL12 (2+1)"; and the thin line under the logo row is gone, leaving one line under the
  "RMU NO. 1 … QTY 1" row.
- **Structure tables**: now an orange "Qty | Description" header, a shaded row for each
  cubicle ("2  Cubical: PCC …, each consisting of:"), and its parts listed below with
  every-other-row shading — no box around the table.

The "PRAL12 (2+1)" spacing is display-only; the underlying code buildCode() produces is
unchanged. Builds; 270 tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ RMU offer: General Notes restyled + outer frame removed from the data cards.**

Small visual follow-up. The **General Notes** on the RMU offer are now a numbered table
(rounded orange header, "1 / 2 / 3" rows with light lines between them and every other row
lightly shaded) instead of a bullet list. And the **outer border was removed** from the
General/Electrical Data cards — they now show just the orange header, the shaded label
column and the thin row lines, no box around the whole thing. Look only; no content or
numbers changed. Builds; 270 tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ RMU offer "General/Electrical Data" tables redesigned + wording shortened.**

Follow-up to the entry below. Mohamed picked the cleaner table design, so the technical
data tables (General Data, Electrical Data) now render as a bordered card: a rounded orange
header, a shaded (peach) label column on the left with the field names in orange, the values
in a white column to the right, a divider line between the two, and thin lines between rows
(instead of the old alternating-shade rows).

The field wording is now the SHORT form to match, changed in the shared spec text
(`backend/src/domain/standards.ts`) and labels (`backend/src/domain/assembly.ts`): e.g.
"Type of apparatus → Apparatus", "Ambient temperature → Ambient temp.", "Protection index →
Protection", "Switchgear color → Color", "Power frequency withstand voltage → Withstand
(1 min)", and units now have a space ("12 kV", "630 A"). This affects **every** RMU offer's
technical page, on screen and in the PDF.

⚠️ HEADS-UP (closes my earlier question): shortening the text drops a couple of details that
used to print on every offer — most notably the **storage temperature** ("For storage:
-5 °C" is gone; the row now shows only the working range "-5 °C to +40 °C"), and
"Standard IEC 62271-200 → IEC 62271-200" / "…above sea level: under 1,000 m → under 1,000 m".
The numbers themselves are unchanged. Say if you want the storage temperature (or any other
dropped detail) put back — it is a one-line change.

Both halves build; all 270 backend tests pass.

## 2026-08-23 · Mohamed's side · Claude

**✅ RMU Technical Offer PDF restyled to match the reference "asd" offer document.**

Mohamed had a reference PDF of how the RMU technical offer should look, and asked to make
the app's generated PDF match it. Compared the two page-by-page (rendered both to images)
and changed the PDF generator (`backend/src/services/pdf.service.ts`) so a multi-RMU offer
now reads like the reference:

- Each RMU now opens with a **full "RMU 1" / "RMU 2" divider page** (big title, unit code,
  family line) instead of the small "RMU 1 of 2" strip that used to sit on top of the data.
- The data page now starts with a light **"RMU NO. 1 … QTY 1"** line under the header.
- The **General Data / Electrical Data / General Notes** headings are now solid orange bars
  with the field names in orange — the same look the structure tables already had — instead
  of the thin underlined headings.

**Nothing about the numbers, prices or the actual technical wording was changed** — only how
the page looks. The cover and the structure tables were already identical to the reference.
Both halves build; all 270 backend tests still pass.

⚠️ HEADS-UP: one thing still differs from the reference on purpose — the **field wording**.
The app writes the fuller engineering text (e.g. "Ambient temperature — For working: -5 °C to
+40 °C / For storage: -5 °C", "Power frequency withstand voltage"), while the reference uses
short labels ("Ambient temp. — -5 °C to +40 °C", "Withstand (1 min)"). Shortening it would
drop some detail (like the storage temperature) from every customer offer, so I left the
fuller text in. ❓ QUESTION FOR MOHAMED: do you want the shorter labels/values too, or keep
the fuller engineering wording?

## 2026-08-23 · Mohamed's side · Claude

**✅ `DATABASE_URL` is now the POOLED endpoint, confirmed from the database side. Today is
closed out.**

Mohamed switched it in Vercel and redeployed. Verified rather than assumed: I drove six
concurrent requests at the live site that each read the `User` table (all answered 401, so
the database was genuinely involved), then queried `pg_stat_activity` from a direct
connection to see what the database itself saw.

    n=1  state=idle  from=127.0.0.1  app=pgbouncer
    n=1  state=idle  from=::1        app=pgbouncer
    other sessions: 2 of max_connections 901

**Six concurrent requests, two pooled backends, both fronted by pgbouncer, and no direct
connections from Vercel at all.** That is pooling working. Unpooled, each serverless
instance would hold its own backend with a Vercel address.

`DIRECT_URL` was left alone, so schema pushes still use the direct endpoint — which is what
keeps deploys safe, and what the new guard in `db-push-vercel.js` enforces.

### Production, both domains

| | www.powerlinedesigns.com | powerline-chi.vercel.app |
| --- | --- | --- |
| Site | 200 | 200 |
| API | 200 | 200 |
| Database | answering | answering |
| Price-list leak | 401 closed | 401 closed |
| Quotations | 401 guarded | 401 guarded |
| Dev bypass | 404 closed | 404 closed |
| Bundle | matches `main` | matches `main` |

📌 **The real production domain is `www.powerlinedesigns.com`** (plus four more), not the
vercel.app address most of our notes use. That matters for one open item: **`APP_URL` is
still unset**, and it is what the "Open the quotation" button in every notification e-mail
points at. It should almost certainly be `https://www.powerlinedesigns.com`.

### The Vercel token question is settled: stop making them

Three tokens were tried and all failed the same way. The cause was not the scope — it was
`limited: true` on the token itself. A limited token authenticates and can list deployments,
but cannot see the project or its settings. The scope was right all along
(`team_d6sWJ5oTSYuVB70PvMvzfS9D` is the Hobby account's backing id).

A token is only ever needed to read build logs from a terminal. Deploys work on `git push`.
All three exposed tokens should be deleted.

### Still open, in the order I would take them

1. **Turn on Neon point-in-time restore.** Still no backup of 143 quotations, while every
   deploy runs a schema sync that can drop data. Today ended well; it did not have to.
2. **Set `APP_URL`** to the real production domain.
3. **Rotate the database password** — it was pasted into a chat. Update BOTH Vercel
   variables together, then redeploy.
4. The audit's remaining items: the silent autosave failure indicator, Co-Work's unguarded
   read-modify-write, the ~60,000-round-trip spreadsheet import, offers being hard-deleted,
   and the third blank-page crash on a partially-saved quotation.
## 2026-08-23 · Mohamed's side · Claude

**`DATABASE_URL` should be the POOLED Neon endpoint. Verified the pooled endpoint first, and
added a guard so the switch cannot go wrong.**

Right now `DATABASE_URL` is the DIRECT endpoint — the build log shows a host with no
`-pooler`. On serverless that means every function instance opens its own database
connection instead of sharing a pooled one, which is part of what ran the transfer quota out.

**The pooled endpoint is tested and good.** I connected to it with the real credentials and
checked the things that actually matter for Prisma, not just that it answers:

| Check | Direct | Pooled |
| --- | --- | --- |
| Connect | OK | OK |
| Parameterised statement | OK (143 quotations) | OK (143 quotations) |
| Same statement reused | OK | OK |
| 8 concurrent queries | OK | OK |

That last pair matters: a transaction-mode pooler historically broke prepared-statement
reuse, which is exactly how Prisma talks to the database. It does not here.

**The change is safe because `directUrl` is already wired.** `scripts/db-setup.js` writes
`directUrl = env("DIRECT_URL")` into the postgres datasource, so schema pushes keep using the
direct endpoint even once the app is pooled. That separation is the whole reason this is safe
to do — DDL must never go through a pooler.

**New guard in `scripts/db-push-vercel.js`.** If `DATABASE_URL` is pooled and `DIRECT_URL` is
missing, the build now stops with a message naming the fix, instead of silently pushing
schema through the pooler. And while `DATABASE_URL` is still the direct endpoint it prints a
warning, so the build log nudges us until it is changed. Tested all three paths: local build
still skips, pooled-without-direct exits 1, direct warns and proceeds.

⚠️ The value itself has to be pasted by a person — it contains the database password, and
the Vercel token in the secrets file cannot see the project anyway (it lists zero projects).
Copy the pooled string from the Neon dashboard with **Pooled connection** toggled ON, put it
in `DATABASE_URL`, leave `DIRECT_URL` as the one WITHOUT `-pooler`, and redeploy — these are
read once at start-up, so saving alone does nothing.
## 2026-08-23 · Mohamed's side · Claude

**✅ THE SITE IS BACK. Everything that was stuck since 11:14 is now live.**

Mohamed renewed the Neon plan. Verified straight away: the database answers again — 20
tables, **24 users, 143 quotations, 43 offers**, all intact. Nothing was lost.

Production **recovered on its own without a redeploy**, because Prisma reconnects per
request. So sign-in started working the moment the quota lifted.

The deploy still had to be re-triggered by hand — Vercel does not retry a failed build — and
it succeeded. The live bundle now matches what `main` builds exactly, and the code that had
been waiting all day is finally out:

- **the RMU approval workflow** (Draft → Waiting → Returned → Approved → Submitted),
  confirmed present in the live bundle;
- the three data-transfer fixes (quotation lists, attachment caching, autosave);
- the security hardening and the route-coverage test.

Checked on production after the deploy: site 200, API 200, sign-in returns a proper 401,
the price-list leak still returns 401, `/api/qtns` still 401, `dev-login` still 404.

### One thing I got wrong, and fixed

While confirming the new sign-in rate limit was live I ran fifteen failed attempts, saw the
429, and then discovered I had throttled **the office IP** — a different address from the
same machine was refused too.

That was a genuine design fault in what I shipped, not just a testing artefact. The limiter
checked the address and the IP against the **same** budget, and a whole office shares one IP.
Fifteen sign-ins per fifteen minutes across everyone is not much: a dozen people after lunch
with a couple of typos between them would lock the rest out.

The two budgets are now separate, because they defend against different things:

- **per address: 15 per 15 minutes** — this is what actually stops someone guessing one
  person's password, and it stays tight;
- **per IP: 90 per 15 minutes** — this only guards against one host spraying many addresses,
  and it has to be generous because it is shared by the whole office.

⚠️ If anyone sees "Too many sign-in attempts" in the next few minutes, that is my testing,
not a fault. It clears on its own; retrying usually works immediately because each serverless
instance keeps its own count.

### Worth doing next, in order

1. **`DATABASE_URL` in Vercel is the DIRECT url, not the pooled one** — the build log shows a
   host with no `-pooler`, and `DEPLOY.md` says it must be pooled. On serverless the direct
   endpoint means many more connections. Free to change, and it reduces exactly the kind of
   usage that ran the quota out.
2. **Turn on Neon point-in-time restore.** There is still no backup of anything, while every
   deploy runs `prisma db push --accept-data-loss`. Today ended well; it did not have to.
3. The third blank-page crash on a partially-saved quotation (`reading 'trim'`), and the
   remaining open items from the audit.
## 2026-08-23 · Mohamed's side · Claude

**All three data-transfer problems are now fixed. Mohamed is buying a Neon plan and does not
want it eaten, so this is about keeping the bill down permanently, not tidiness.**

### 1. Quotation lists (done earlier today, commit 9215d21)

`GET /api/qtns`, `/api/qtns/all` and `/api/qtns/queue` fetched every scalar column, `state`
included — the whole quotation as JSON — to draw a table row. Now they select exactly the
seventeen columns the table shows. Verified byte-for-byte identical responses.

### 2. Attachments: a repeat view now costs nothing

`downloadAttachment` read the full `data` column (base64, about a third larger than the file,
up to ~4 MB a row) on **every single view**. Opening the same specification five times moved
it out of the database five times.

Attachments are immutable — upload creates, delete removes, nothing ever rewrites the bytes
under an id — so they now carry a strong validator:

- the metadata is fetched first, **without** `data`;
- `ETag: "<id>-<size>"` and `Cache-Control: private, max-age=31536000, immutable`;
- if the browser sends back a matching `If-None-Match`, the answer is **304 with no body and
  the file is never read from the database at all.**

Measured locally on a real upload: first view **200, 6,200 bytes**; second view **304, no
body**; a fresh fetch returns byte-identical content starting `%PDF-1.4`. So the second and
every later view of a spec costs one tiny request instead of megabytes.

`listAttachments` was already lean (metadata only) — no change needed there.

### 3. Autosave: no more writing the whole quotation for nothing

Every save ships the ENTIRE quotation. Two kinds of save were pure waste:

- **Identical payloads.** React hands the effect a new state object for any change at all,
  including ones that alter nothing — a re-render, an undo back to where you started,
  re-picking the same value. Each was a full write. The payload is now compared against what
  the server last accepted, and an unchanged one is not sent.
- **Clicking between panels.** That changes only `selectedId`, and it used to send the whole
  quotation to record which tab you were on. It is **still saved**, so reopening returns you
  to the same panel — but on an 8 second delay, so clicking through ten panels is one write
  instead of ten.

Real edits are untouched: still an 800 ms debounce, so a save lands exactly as quickly as
before.

Measured in the browser, counting actual PUT requests:

| Action | Saves before | Saves now |
| --- | --- | --- |
| Add two panels | 2 | 2 (unchanged — real changes) |
| Click between panels 4 times | 4 (~11 KB each) | **0** |
| One field edit | 1 within 1.2 s | 1 within 1.2 s (unchanged) |
| Three more keystrokes straight after | 1 | 1 (still coalesced) |
| Navigate to a different panel and wait | 1 | 1, at 8 s instead of 0.8 s |

Two robustness improvements came with it: the pending save is now cleared **only when a save
actually succeeds** (a failure keeps it queued instead of forgetting it), and a pending save
is flushed when the tab is hidden — which runs while the page is still alive, so an ordinary
fetch still works, and is what makes the longer navigation delay safe.

**299 tests passing** (270 backend, 29 frontend). Both typechecks and both builds clean.

### ⚠️ A THIRD blank-page crash, found while testing — still open

Opening quotation `QTN-26-9002` renders a blank white page with
`TypeError: Cannot read properties of undefined (reading 'trim')`.

I checked this properly: I stashed my changes and reloaded, and **the committed version fails
identically**, so this is pre-existing and not from anything today. It is the same family as
the one you fixed (`factors`), and your fix does cover `factors` and the panel list — but
something else in a partially-saved `project` object still throws. A brand-new quotation with
a completely empty state `{}` opens fine, so it is specific to a partial one.

Both affected rows are old local test data, so this may not exist in production at all — but
it is the same failure mode, and the fix belongs with the autosave reliability work.

### Still open

Unchanged from the earlier entry: the LV autosave still shows the user nothing when a save
fails (the queueing is fixed, the visible indicator is not), Co-Work still has an unguarded
read-modify-write, the spreadsheet import still does ~60,000 sequential round trips, and
offers are still hard-deleted so their numbers get reused.

⚠️ Everything here is pushed but **cannot deploy until Neon accepts connections again** —
every build still fails at `prisma db push`.
## 2026-08-23 · Mohamed's side · Claude

**Fixed the biggest cause of the data-transfer blowout: quotation lists no longer download
every quotation's content.**

All three list endpoints — `GET /api/qtns`, `/api/qtns/all` (Offer History) and
`/api/qtns/queue` (the approval queue) — used `include: ownerSelect`, which fetches **every
scalar column**, and that includes `state`: the entire quotation as JSON, every panel, every
component, every price. All of it, for every quotation, on every single request — to draw a
**table row** that shows the number, project, customer, panel count and total.

Even against the tiny local test database that is **64 times more data than the endpoint
returns**. Real quotations are hundreds of kilobytes rather than ten, so on production the
multiplier is far worse. This is why the Neon transfer quota ran out and took the site down.

Now each list selects exactly the seventeen columns the table needs, and `state` is not one
of them.

**Proof it changed nothing.** Before touching the code I captured the real JSON from all
five list variants against the local database, including a quotation moved into
WAITING_APPROVAL so the approval queue had content too. After the change all five responses
are **byte-for-byte identical**. Same rows, same order, same fields, same values.

**The compiler now enforces it.** The list mappers take a new `QtnListRow`
(`Omit<QtnRow, "state" | "createdAt">`) instead of the full row, so a list handler that
forgets a column `listItem` needs is a **build error**, not a column that silently renders
blank. That is how the change was validated: TypeScript pointed out precisely which fields
were and were not really used.

New `qtnListSelect.test.ts` guards it permanently — it fails if `state` is ever selected
again, and also fails if any of the seventeen needed columns is dropped.

**299 tests passing** (270 backend, 29 frontend). Both typechecks and both builds clean.

⚠️ **This is pushed but NOT deployed, and cannot be until the database is back.** Every
build still fails at `prisma db push` while Neon refuses connections. Once the quota is
lifted the next build will pick this up automatically, along with the RMU approval workflow
that has been waiting since 11:14.

### Still open from the audit, worst first

The two other transfer-heavy items are untouched and worth doing next:

- **Attachments are stored base64 inside the database** (up to 3 MB each, 30 per quotation)
  and transferred in full on every read. They belong in object storage.
- **The autosave writes the whole quotation on every keystroke** (800 ms debounce), so a
  large quotation is hundreds of kilobytes, continuously, all day.

And unchanged: the LV autosave still discards every failure silently, Co-Work still has an
unguarded read-modify-write, the spreadsheet import still does ~60,000 sequential round
trips, and offers are still hard-deleted so their numbers get reused.
## 2026-08-23 · Mohamed's side · Claude

**⛔ THE LIVE SITE CANNOT REACH ITS DATABASE. Neon data-transfer quota exceeded.**

Do not debug this in code — there is nothing wrong with the code. The exact error, straight
from the database:

    Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.

Evidence: every endpoint that touches the database returns 500 (`login`, `forgot`, `verify`,
`complete`, `reset`); every endpoint that does not is fine (`health`, `meta/rmu`, `me` all
answer correctly). The identical code on a local machine works perfectly against SQLite.
Credentials are fine — `neondb_owner` authenticates and is then refused on quota.

**This is also why deploys have been failing since 11:19.** The Vercel build runs
`prisma db push` against Neon (`backend/scripts/db-push-vercel.js`), that fails with
`P1001: Can't reach database server`, and the whole build aborts. So Mohamed's re-kick
commit and mine both failed for the same reason. **The RMU approval workflow (e200e1e) is
still not live.** Production is serving an older build.

**Nothing is lost.** The data is intact, sitting in Neon behind the quota wall.

**Work locally in the meantime** — it is completely unaffected (SQLite, offline):

    cd backend  && npm run dev
    cd frontend && npm run dev

Use the "Skip sign in (dev only)" button on the login screen.

### Why the quota blew, and what actually prevents it recurring

Upgrading the plan restores service, but the transfer volume has causes, and two of them
are already written up as serious findings in the audit:

1. **Every quotation-list endpoint loads every quotation's FULL state JSON** just to draw a
   table row. A quotation's state is the entire configuration — hundreds of kilobytes.
   Opening Offer History pulls all of them. This is the big one.
2. **Attachments are stored base64 IN the database**, up to 3 MB each and 30 per quotation,
   and are transferred in full on every read.
3. **The autosave writes the whole quotation on every keystroke** (800 ms debounce), so a
   large quotation is hundreds of kilobytes per save, continuously.

Also worth fixing while we are here: **`DATABASE_URL` in Vercel is the DIRECT url, not the
pooled one.** The build log shows the host with no `-pooler`. `DEPLOY.md` says it must be
pooled, and on serverless the direct endpoint means far more connections and more
overhead. Switching it is free and helps.
## 2026-08-23 · Mohamed's side · Claude

**Reviewed your RMU approval workflow. It holds up — and my security fix already covered
your new endpoint.**

Pulled your four commits and ran everything against them. **All 203 existing tests passed
unchanged**, which is the useful part: it means you reused the shared state machine instead
of forking it, and you did not move the LV cost formula, the RMU price keys or the auth
boundary. Both typechecks and both builds are clean.

Three things I specifically checked, because they are where this kind of change goes wrong:

- **Your schema additions are correctly additive** — every new column nullable or
  defaulted, so the next deploy cannot damage existing offers. Exactly right.
- **`offerStatus()` is safe on historical rows.** It requires *both* `statusAt` and a valid
  `status` before trusting the column, and otherwise falls back to
  `submittedAt ? SUBMITTED : DRAFT`. That matters because the new
  `submitted Boolean @default(false)` gets stamped onto every existing offer by
  `db push` — your fallback ignores it, so old offers still read correctly. That is the
  precise trap the `LvQtn.status` comment warns about, and you avoided it.
- **`POST /api/offers/:id/transition` is properly guarded:** ownership through
  `visibleOffer`, target status validated, `canMove` enforced, a permission check, and the
  status and audit row written in one transaction. It is also authenticated for free,
  because the `/api/offers` router moved from `optionalAuth` to `requireAuth` yesterday.

### One gap it exposed in MY work, now fixed

My `authBoundary.test.ts` listed routes **by hand**, so your new endpoint was not in it. It
was safe anyway, but the test would not have noticed if you had mounted it somewhere
without auth. That is a bad property for a security test.

New `backend/src/routeCoverage.test.ts` fixes it properly: it reads the **actual route
table out of the built Express app** and asserts that every `/api` route either appears in
a small `PUBLIC` allowlist — each entry with a written reason — or refuses an anonymous
caller. **85 routes are now checked automatically, including both of your new transition
endpoints.**

What this means for you day to day: **add a route without auth and the test fails.** You
either guard it or you consciously add it to `PUBLIC` with a reason. No one has to remember
to update a list again. It also fails if the allowlist rots (a declared-public route that
no longer exists), and it asserts `/api/meta/rmu` still carries no prices, since that is
the one open route that would become dangerous if prices were ever added to it.

**Total: 294 tests** (265 backend, 29 frontend), all passing on top of your work.

### Still open

The ten items in yesterday's entry are unchanged. The one I would take next is the first:
**the LV autosave discards every failure silently**, and an invalid summary makes it fail
*forever* — no indicator, no retry. That is how someone loses an afternoon, and it is
independent of everything you are building.
## 2026-08-23 · Mohamed's side · Claude

**RMU offers now go through the same approval process as LV quotations.**

- An RMU offer moves through the same five stages as an LV quotation — **Draft → Waiting for approval
  → Returned for revision → Approved → Submitted**. Open an offer (Offer History → the pencil/Amend,
  or the sidebar "resume draft" shortcut) and use its buttons: **Send for approval**, then an approver
  **Approves** or **Returns for revision** (a reason is required), then the owner **Submits**.
- The **same people** approve RMU offers as approve LV quotations (same permission), they get the same
  in-app / e-mail notifications, and an offer is **locked** while it is waiting or approved.
- ⚠️ HEADS-UP: pressing **Generate & Download** no longer marks an RMU offer as "submitted". A new
  offer now starts as a **Draft** and becomes submitted only at the end of the approval flow. Existing
  RMU offers are unchanged (they show as Submitted).
- Offer History shows RMU offers with the same status badges as LV; the sidebar "resume draft"
  shortcut now points at your latest **RMU** draft too.
- ⚠️ DB: this deploy adds several new, empty columns to the offers table (status timestamps, approver,
  return reason). Additive and safe — every existing offer is untouched.

## 2026-08-23 · Mohamed's side · Claude

**History + Project tab: two small cleanups.**

- **Offer History** now shows an RMU offer's **QTN number** (QTN-26-#####) in the QTN column, the same
  as LV rows — instead of the internal PL-YYYY-#### number. (It falls back to the PL number only if no
  QTN was entered.)
- Removed the grey helper line "Editable — shared with the RMU offer form. Add or remove names
  (RPT-01)." under **Staff lists** on the LV Project tab. The lists are unchanged. Frontend-only.

## 2026-08-22 · Mohamed's side · Claude

**Security audit and hardening. Please read the first two boxes before you next pull.**

### ⚠️ DO THIS FIRST after you pull

`package.json` changed on both halves (a test framework was added). Run this once, or you
will get a wall of TypeScript errors in code that is perfectly fine:

    cd backend  && npm install && npx prisma generate && npx prisma db push
    cd frontend && npm install

This is the trap already written up in `CLAUDE.md` §3a. Nothing is broken — it is just a
stale generated client.

### ⚠️ Two things behave differently now

- **Attachments that are not PDFs or images now download instead of previewing** in the
  browser (a `.txt` or `.xlsx` used to open in a tab). That is deliberate — see below.
- **A correct sign-up / reset code now uses one of its six attempts.** The normal flow
  spends two of six, so there is plenty of room.

### The serious one: our price list was readable by anyone on the internet

`POST /api/offers/preview` needed **no login**. Tested against the live site: it returned
real floor prices — base 13,190, outdoor enclosure 2,000, smart RTU 14,000, list 29,190 —
plus the full technical content. Anyone with the URL could step through configurations and
read the whole RMU price list from outside the company.

Cause: the offers routes were mounted with `optionalAuth`, which attaches a user if one is
present but never rejects. The same mount also left `POST /api/offers` open, and because
`Offer.ownerId` is nullable and `createOffer()` runs before ownership is attributed, an
anonymous call created a permanent row nobody can see or delete, while consuming a number
from the `PL-YYYY-####` sequence.

Fixed: `requireAuth`. Nothing legitimate lost access — the app is behind a login wall,
`api.ts` attaches the token to every request, every handler already needed the user id for
its ownership check, and PDF links carry the token as `?t=`.

### Nine more real faults fixed

1. **Configuration failed OPEN.** Five security controls each read `process.env.NODE_ENV`
   directly and every one defaulted to permissive when it was missing: a forgeable
   hardcoded JWT secret, the `dev-login` bypass, one-time codes echoed in API responses,
   `CORS: *`, and mail failures logged with the codes in cleartext but reported as sent.
   One unset variable opened all five. New `backend/src/config.ts` decides it once, and
   also trusts the platform's own `VERCEL` flag, which cannot be forgotten or mistyped.
2. **Stored XSS through attachments.** The uploader's own MIME string was echoed back as
   `Content-Type` with `inline`, on our own origin, with no CSP. Attaching an `.html` ran
   script as whoever opened it, with the 30-day session token and the Outlook Graph token
   both sitting in `localStorage`. Only PDFs and raster images render inline now, plus
   `nosniff`. SVG is deliberately excluded — it can carry script.
3. **Sign-in had no rate limit** — the only credential endpoint without one.
4. **The six-try cap on codes was bypassable** by firing requests in parallel.
5. **One malformed save erased a whole quotation.** The update endpoint accepted anything,
   including `null`, and wrote it over the stored content. Irreversibly.
6. **All three RMU PDF endpoints returned 500 forever** for any offer with an Arabic
   quotation number. The document simply could not be produced.
7. **A declined price publish was invisible** — price saved, snapshot not, endpoint said
   success, quoting carried on at the old price. Now logged with the reason.
8. **A second blank-page crash**, same family as the one you fixed: an enclosure row with
   no name threw inside the cost calculation and blanked the configurator.
9. **`DEPLOY.md` said the opposite of the truth** about data loss — see the risk box below.

### There are now tests. 203 of them, from zero.

Vitest on both halves: `npm test` in `backend/` or `frontend/`.

| Suite | What it protects |
| --- | --- |
| `panelCost` (29) | The LV money formula, term by term, with hand-checkable numbers |
| `rmuCoding` (68) | Price-key derivation, including a round-trip over **all 46 real price keys** |
| `qtnStatus` (29) | The approval state machine — 9 legal moves, all 16 illegal ones |
| `authBoundary` (45) | All 39 protected routes refuse anonymous callers |
| `config` (14) + `schemas` (18) | The new guards and the sign-up domain rule |

**If one of these fails, do not update the test.** They record what the app does today. A
failure means a price, a permission or a workflow rule moved, and that needs Mohamed.

Writing the cost tests is what found fault 8 — they earned their keep immediately.

### ⛔ The biggest risk is not code, and I cannot fix it

**There is no database backup and no restore procedure anywhere in this project**, while
every deploy runs `prisma db push --accept-data-loss`. `DEPLOY.md` previously claimed the
build would stop to protect you; it does the opposite. That section is rewritten with the
rules that actually follow: new columns must be nullable or defaulted, renaming is a drop
plus an add, and `LvQtn.status` must never be given a default or the next deploy resets
live submitted quotations to Draft.

Someone needs to turn on Neon point-in-time restore. Nothing in the repo does it.

### Still to do — please do not duplicate this

A full audit ran across security, scalability, database, error handling, architecture,
performance, background work, configuration and code quality: **206 findings, 18 of them
serious.** Ten are fixed. The ten still open, worst first:

1. **LV autosave discards every failure** — no indicator, no retry, and an invalid summary
   (a negative total, an over-long project name) makes it fail *forever*, silently. This is
   how someone loses an afternoon of work.
2. **Co-Work overwrites.** The per-panel merge is an unguarded read-modify-write, so two
   people editing one quotation silently lose each other's work. Needs an additive
   `stateVersion` column.
3. **Quotation lists load every quotation's full content** just to draw a table row.
4. **The spreadsheet import does around 60,000 sequential database round trips**, in no
   transaction, so a timeout leaves it half applied.
5. Offers are hard-deleted, so `PL-YYYY-####` numbers get reused.
6. `xlsx` sits in the main bundle for two export-only buttons.
7. The two heaviest screens are the only ones not code-split.
8. The SLD drawing covers only the first RMU on a multi-RMU offer.
9. Offers History renders every row with a delay proportional to its position.
10. The eight price-write endpoints still report success on a declined publish (it is now
    logged, but not shown to the user).

**Not attempted on purpose:** splitting up `LvConfiguratorPage.tsx`. It is 7,500 lines and
you pushed 70 commits into it in five days — moving it now would hand you unresolvable
conflicts and prove nothing. Extracting testable pure functions from it is the right first
step, and the audit produced a concrete plan for that.
## 2026-08-20 · Mohamed's side · Claude

**The 47 "duplicate" names: checked properly. Nothing is duplicated, and nothing needs deleting.**

Investigated the duplicate-name warning end to end, grouping by **order code** rather than by name.
The earlier read of this — including mine — was wrong, so here is the checked version:

- **No two items share an ABB order code. Zero.** In the catalogue file *and* in the database. So
  there are **no true duplicates**, and no row should be removed.
- The 5% pairs (TruONE ATS, MCCB XT1 125A) are **not** an old price list left behind. Each pair
  carries **two different ABB codes**, one digit apart — so they are two real part numbers, and which
  one we supply is a business call, not a cleanup.
- All **47** clashes are "same name, two different codes". **18** of them also differ in price.
  Worst: `Change over switch 160A 3P` — **€81.85** (`1SCA105008R1001`) against **€179.91**
  (`1SCA022767R0030`), 120% apart.
- **Enclosures are completely clean** — no repeated codes, no repeated names.

⛔ **DO NOT rename, merge or delete any of these 47 while Mohamed decides.** He has the full list as
an Excel sheet (`PowerLine-price-list-name-clashes.xlsx`, on his Desktop, worst-first with both codes
and both prices) and is choosing which of each pair is real. Nothing in the code or the price list was
changed.

**"Same code must update, not duplicate" — already true, and now proven, not assumed.** Tested live
against a running server:

| Test | Result |
| --- | --- |
| Add an item with an order code already in use | **refused, 409** — "Reference … already exists — edit that item instead." |
| Add an item with a name already in use (new code) | **refused, 409** — names the clashing item and its code |
| Same code twice inside one uploaded sheet | first occurrence wins, second counted as a duplicate |
| Import "add" re-checked at apply time | re-checks the code *and* the name in the database |

Neither test left a row behind. So new clashes cannot be created through the price screen or through a
spreadsheet upload — the 47 are historical, from before those guards existed.

👏 Also confirmed fixed while looking: the **22 items whose copper cost nothing** (no pole count) are
**all corrected** — none remain. No item is priced in two currencies, no `ABB.` brand typos, and only
one item has no price at all.

## 2026-08-23 · Mohamed's side · Claude

**Offer History: a green "online" dot shows which drafts are being worked on right now.**

- In Offer History, a draft that's being actively edited — its autosave fired within the last minute —
  now shows a small pulsing **green dot** next to "Draft". It clears on its own about a minute after
  editing stops. The list already refreshes every 30 seconds, so the dot tracks live activity across
  the team. Frontend-only.

## 2026-08-20 · Mohamed's side · Claude

**Sidebar: a quick "resume draft" shortcut right after Home.**

- The left sidebar now shows, directly under **Home**, a one-click link to the quotation you're
  working on — your most-recently-edited **draft**. Its label is the QTN number; clicking it reopens
  that draft.
- It appears only when you have a draft, and it refreshes as you move around so it always points at
  the latest one. (Draft LV quotations, which autosave as you build them.) Frontend-only.

## 2026-08-20 · Mohamed's side · Claude

**RMU offer reorganised: a new "Settings" tab, and the Commercial tab is now the priced offer document.**

- New **Settings** tab between **Project** and **RMU**. It holds the commercial settings (currency,
  discount, validity, delivery, payment, warranty) and the per-RMU unit price + quantity that used to
  sit on the Commercial tab.
- The **Commercial Offer** tab now shows the actual **priced offer document** on an A4 page — the
  "Main Offer" table (one line per RMU: description, qty, unit price, total), the subtotal / VAT /
  total, and the Terms — matching the downloaded Commercial PDF. There are no input boxes there now.
- Flow is now Project → Settings → RMU → Technical Offer → Commercial Offer. Frontend-only — no
  database or pricing change.

## 2026-08-20 · Mohamed's side · Claude

**RMU offer tabs now show the branded cover page on screen (Technical & Commercial).**

- The RMU offer's **Technical Offer** and **Commercial Offer** tabs now show the branded cover page
  at the top — PowerLine logo, the big "Technical / Commercial Offer" title, the QTN / OPTY / project /
  customer, the contacts, the product-range strip and the ISO / ABB footer — the same cover the LV
  section shows and the PDFs already print. This is on-screen only; the downloaded PDFs were unchanged.
- The **Technical** tab's per-RMU sections and the **Commercial** tab's offer content now render as
  **A4 pages** (real A4 width, like the printed PDF and the LV preview) instead of full-width cards,
  so the on-screen preview matches the document.
- Under the hood the cover is now a shared component drawn by both the LV and RMU pages, so they stay
  identical. The LV page itself is unchanged. Frontend-only — no database or pricing change.

## 2026-08-20 · Mohamed's side · Claude

**RMU offers can now hold more than one RMU — one offer, one combined price, one set of PDFs.**

- On the RMU offer page there is now an **"RMUs in this offer"** list on the RMU tab: **＋ Add RMU**,
  click one to open it, **✕** to remove. Each RMU keeps its own configuration.
- **Technical Offer** shows every RMU one after another, each under a clear **"RMU 1 of 3 …"** heading.
  The downloaded PDF is a single document — one shared cover, then each RMU's full technical pages.
- **Commercial Offer** now has **one price line per RMU** (each with its own unit price — pre-filled
  from the price list — and quantity) and **one combined total** at the bottom. Discount and VAT apply
  to the whole offer. The Commercial PDF prints one line per RMU and one total.
- A normal **single-RMU** offer is completely unchanged — same numbers, same PDFs as before. Prices
  stay **frozen per offer** exactly as they were (changing the price list never rewrites a sent quote).
- It saves as **one** offer in Offer History (with a small "3 RMUs" count).
- ⚠️ HEADS-UP: this deploy added **one new, empty database column** used only by offers that have more
  than one RMU. Every existing offer is untouched — this is a safe, additive change.

## 2026-08-20 · Mohamed's side · Claude

**Panels tab: removed the "Download template" button from the Excel import.**

- The "⬇ Download template" button under "Import panels from Excel" is gone. Importing still works
  exactly as before; only the sample-template download was removed. (The unused template-builder
  code behind it was cleaned up too.)

## 2026-08-20 · Mohamed's side · Claude

**Offer History is now history-only — the "+ New QTN" button was removed from it.**

- The Offer History page no longer has a "+ New QTN" button (header and empty-state both). It is
  purely for browsing/searching saved offers now. Creating a new offer still lives on the **Home**
  page (its "+ New QTN" covers LV and RMU), and the empty-state text points there.

## 2026-08-20 · Mohamed's side · Claude

**One "Offer History" for everything — LV quotations and RMU offers together.**

- The old split (separate "LV Offers" and "RMU Offers" screens) is gone. The sidebar now has a
  single **Offers** entry that opens **Offer History**, listing every LV quotation *and* every RMU
  offer in one table. The old RMU link still works — it lands on the same page. A **Type** column
  (and a Type filter) tells LV and RMU apart.
- **Drafts now show by default** — the "Show drafts" tick is gone. **Show removed** stays (owner-only).
- **Actions are now icons**, and all three appear on every row: **Amend · Duplicate · Delete**.
  - LV: Amend opens a new revision, Duplicate makes an independent copy, Delete hides it (reversible).
  - RMU: Amend opens the offer, Duplicate makes a copy, Delete removes it.
- **RMU duplicate keeps its prices frozen** — a new server-side copy carries the exact prices the
  original was quoted at (never re-priced against today's list), just like LV. A copy always starts
  as a Draft.
- Safety kept as-is: an LV quotation already in the approval flow (submitted/approved/waiting) still
  can't be removed — its Delete icon is shown greyed. Amend/Duplicate still work on it.

## 2026-08-19 · Mohamed's side · Claude

**Panel import: the ENCLOSURE now selects — it was reading the wrong cell for the family.**

- On the real quote workbook the enclosure family (e.g. "SR-Basic") sits in the panel's
  **top-left corner**, while the **"Panel Type"** field beside it holds the switchgear **brand**
  ("ABB"). The import was taking the family from "Panel Type", so it read "ABB" — not a real
  family — and picked **no enclosure**. That's why Enclosure and Kits showed **0 EGP** even though
  the box (1800x800x300) was written in the file.
- Fixed: the family is now read from the corner (any known family / cell type), and the brand in
  "Panel Type" is ignored. Verified on the exact case from the screenshot — SR-Basic 1800x800x300
  Single now imports with the box selected (priced), plus Unikit (double), Primo, and a Pro-E cell
  board with its copper. Enclosure and Kits are no longer zero.

## 2026-08-19 · Mohamed's side · Claude

**Panel import: Primo & Minicenter panels now pick their box (full recheck of every family).**

- Rechecked the Excel import end-to-end across **every enclosure family, Single and Double, plus all
  three cell types** (Pro-E / IS2 / PLP). Everything was already correct except two families:
  **Primo and Minicenter imported with an empty Sizing box.** Those two name their boxes like
  "24 line" / "24 line - 160A RAL 7035" (not by dimensions like SR-Basic/Unikit/Local), and the
  reader only understood dimension names. It now reads and matches those names too, so Primo and
  Minicenter come in with the right box selected.
- Confirmed unchanged & correct: SR-Basic / Unikit / Local (Single **and** Double, with the second
  slot filled), and Pro-E / IS2 / PLP cell **quantities** and **busbar copper** (17.1 kg in the test).
- Note for reference: busbar copper is a **cells-only** figure in the tool — panel-type boards
  (SR-Basic/Unikit/Primo/Minicenter…) have no copper field, so the import correctly fills copper only
  for Pro-E/IS2/PLP. That is by design, not a missing feature.

## 2026-08-19 · Mohamed's side · Claude

**Panel import: PLP/IS2 cell quantities now import, and double panels get their second size.**

- **Cell quantities for PLP/IS2**: those cells are named by their size ("2000x1000x700"), not
  "Cell …", so the import was leaving their quantities blank. It now reads size-named cells too, so
  a PLP panel comes in with the right cell counts (and its busbar copper from the Copper Tool).
- **Double panels**: the second enclosure slot was empty on import. It now mirrors the first box
  into the second slot, so a double panel imports with both sides sized.
- Small polish: the preview's "Sizing" line shows cell panels as e.g. "PLP cells · 70 cm · Single"
  instead of a stray box size.

## 2026-08-19 · Mohamed's side · Claude

**Panel import: the enclosure SIZE is now picked for Local (and SR-Basic) panels.**

- The import was leaving the Sizing box empty for "Local (Sheet Metal)" panels because those box
  sizes are written with an "L" prefix (e.g. "L700x500x200") and the reader only recognised sizes
  that start with a digit. It now accepts that prefix (and SR-Basic's "new" prefix), so the box is
  read and selected. Verified: a Local panel imports as Panels · Local (Sheet Metal) · Single ·
  L700x500x200 with the box filled in.

## 2026-08-19 · Mohamed's side · Claude

**New: import many panels at once from a quote Excel (on the LV Panels tab).**

- On an LV quotation's **Panels** tab there's now **Import panels from Excel** + **Download template**.
  Point it at a quote workbook and it reads **every "Item No." block as one panel** and adds them all,
  after a preview. Existing panels are left alone; Confirm is the go-live (it saves through the backend).
- Each panel comes in pre-filled: name, quantity, panel type + **sizing** (family/box/layout for SR-Basic-
  type boards, or the **cell type, depth and per-cell quantities** for Pro-E/IS2/PLP), rating, amb. temp,
  neutral/earth, form, fed-from, short-circuit — and its **component list** grouped by section
  (Main Incoming / Outgoings …). Components are matched to the price list **by reference**; the busbar
  **copper is read from the workbook's "Copper Tool" sheet** (per-rating phase/neutral/earth lengths) and
  the busbar weight is computed from it.
- The preview shows each panel the way the tool draws it (orange item bar + spec grid + component table),
  a **Sizing** line, and a warning that names **which panels** have components not in the price list (by
  reference; a blank reference is flagged "no reference"). Blocks with no name, and blank "0" template
  cells, are ignored.
- Also: on **localhost only**, the login screen now **auto-skips sign-in** (dev convenience; the live site
  is unchanged — that code is stripped from the production build).
- Frontend only; no database change.

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
