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
## 2026-09-10 · Mohamed's side · Claude

**Auxiliary panels (LCP / KWHM) now appear in the Selectivity table.**

The Selectivity coordination table used to skip every auxiliary cell; now the real aux panels — LCP and KWHM — are
listed alongside the ordinary panels. Only the pure "Spare parts" parts-list cell is still left out, since it has no
breakers to coordinate. Say the word if you want that one in too.

## 2026-09-10 · Mohamed's side · Claude

**Changing a "Default rate" (USD/EUR/Safety/Copper) now shows up in "Check for updates".**

When you change any of the default rates on the price list and press Save & publish, the change is now recorded in the
"Check for updates" changelog — e.g. "Default rate — Copper (EGP/kg) 800 → 815", or "Default rate — Safety factor 2% →
3%". Only rates that actually moved are listed (unchanged ones re-saved alongside are ignored), so there's no noise. No
database change — it reuses the same audit/publish machinery as an ordinary price edit.

## 2026-09-10 · Mohamed's side · Claude

**Draft quotations now pick up the latest copper price.**

When you open a Draft, its copper price is refreshed to the current "Default rates" copper value — so an in-progress
quotation always quotes on today's copper, not whatever it was created with. Only Drafts do this (submitted / approved /
cancelled stay frozen, so nothing already sent to a customer changes), only the copper rate follows (USD / EUR / safety
still freeze per quotation), and only the quotation's owner writes it. The change saves automatically. If we want the
other rates to follow drafts too, that's an easy extension — say the word.

## 2026-09-10 · Mohamed's side · Claude

**Price list → "Default rates for new quotations" now has a Copper (EGP/KG) field.**

On the /pricing screen, the "Default rates for new quotations" box now includes a Copper (EGP/KG) field, right after
Safety Factor. Set it and press Save & publish and new quotations start from that copper price (quotations already saved
keep the copper price they were built with, like the other rates). Verified end to end: changed it, saved, reloaded, and
the new value carried through to what new quotations use. No back-end change was needed — copper was already a standard
rate; it was just missing from the form.

## 2026-09-10 · Mohamed's side · Claude

**Removed the "Sizing Review" tab.**

The Sizing Review tab is gone from every quotation's tab strip (it now goes straight from Selectivity to Summary). A
quotation that happened to be left open on that tab now opens on Project instead. The change is surgical — nothing else
in the configurator is affected, and any sizing-review notes already saved on existing quotations are left untouched,
just no longer shown.

## 2026-09-10 · Mohamed's side · Claude

**In a panel, "Panel cost (live)" now collapses together with "Panel details" (one toggle for both).**

The Panel cost card lost its own collapse arrow. It now follows the Panel details toggle — collapse or expand Panel
details and Panel cost does the same, so the two always show together or hide together.

## 2026-09-10 · Mohamed's side · Claude

**The quotation top bar now minimizes fully with an arrow beside the QTN number.**

The "Minimize" text link is replaced by a small arrow right next to the QTN number. Clicking it now collapses the WHOLE
top bar — the project name, the price line, the status/timer and every action button (Undo/Redo, Send for approval,
Share, Copy link, ERP CSV, Check for updates) all hide, leaving just "← My QTNs" and the QTN number with the arrow.
Click the arrow again to bring it all back. The arrow points down when open, right when collapsed, and the choice is
remembered per browser.

## 2026-09-10 · Mohamed's side · Claude

**Form 3a/3b/4a/4b on SR-Basic / Unikit / Local is now a soft WARNING, not a block (supersedes the earlier version).**

Earlier today this was a hard rule (the forms were greyed out / the families were hidden). By request it's now a
gentle warning instead: forms and enclosure families are all freely selectable again, and if you end up pairing a
sheet-metal family (SR-Basic / Unikit / Local) with Form 3a/3b/4a/4b — in EITHER order (pick the form then the family, or
the family then the form) — a pop-up asks "Form 3A, 3B, 4A, and 4B are not available for the selected panel types:
SR-Basic / Unikit / Local — Do you want to proceed anyway?" with **Proceed Anyway** and **Cancel**. Proceed Anyway keeps
the choice (it's allowed now — no offer is blocked); Cancel undoes just the change that triggered the warning. The old
hard offer/export block for this rule was removed.

## 2026-09-10 · Mohamed's side · Claude

**A new panel no longer pre-picks SR-Basic — the enclosure family now starts on "Choose Enclosure Type..".**

When you switch a panel to Panels mode, the Enclosure family box now shows a greyed "Choose Enclosure Type.." and you
pick the family yourself (SR-Basic / Unikit / Local / Minicenter / Primo…); the size search stays empty until you do, so
a size can't be chosen before the family. Spare / LCP / KWHM cells still start on a concrete family (KWHM = Local, the
rest = SR-Basic) because they auto-size against it, and existing quotations keep whatever family they were saved with —
only newly added panels start on the placeholder. If a panel is left in Panels mode with no family, the export check now
says "no enclosure family chosen" instead of the old misleading "busbar weight is 0".

## 2026-09-10 · Mohamed's side · Claude

**"Top Busway" incoming cables now offers to feed the incoming C.B from the busway.**

When you set a panel's INCOMING CABLES to "Top Busway", a pop-up now asks "Do you need the incoming C.B to be fed from
the Busway?" with two buttons, Apply It and Cancel. Apply It writes "Busway" in the Notes column of the incoming C.B
only (the Main-Incoming breaker) — nothing else is touched; Cancel leaves the notes alone (the field still shows Top
Busway). Writing "Busway" there also adds the busway copper on that breaker's row automatically (the price already reads
that note), and it won't ask again if the note already says Busway.

## 2026-09-10 · Mohamed's side · Claude

**Forms 3a / 3b / 4a / 4b are now forbidden on SR-Basic, Unikit and Local (Sheet Metal) panels.**

Those three are sheet-metal enclosures that cannot physically achieve the higher forms of separation, so the app now
prevents that combination. On a panel built in one of those families the Form dropdown greys out 3a / 3b / 4a / 4b (they
show "n/a") so they can't be picked. If a panel is already set to one of them — e.g. an older quotation, or the
enclosure system was changed afterwards — the Form field turns red with a clear message and the panel blocks every offer
(Technical / Commercial / Material and the PDF export) until it's changed, so the invalid combination can't reach a
customer. The rule ignores cell-based panels (Pro-E / IS2 / PLP), the modular systems, and spare / LCP / KWHM cells.

## 2026-09-10 · Mohamed's side · Claude

**"Check for updates" no longer shows Access Center changes — only real price-list changes.**

The "What changed in the price list" screen was listing permission and role changes (e.g. "so-and-so → qtn.viewAll",
"role Custom → Powerline") mixed in with the actual price changes. That's because the app keeps its permission/role
history in the same audit log as the price list, and this screen was reading the whole log instead of just the
price-list part. It now shows only genuine price-list changes (components, enclosures, combinations, price settings)
and skips the access/permission entries. The little red "unread" number on the button is fixed the same way — it was
counting those permission entries too. The access history isn't lost; it still lives in the Access Center's own history.

## 2026-09-09 · Mohamed's side · Claude

**The REAL reason Mayar couldn't reorder panels in QTN-26-01827 — the saved order had drifted from what's on screen.**

QTN-26-01827 has no co-worker now, but it was co-worked in the past. Back then a shared quotation could end up with its
panels STORED in a different order than they're shown on screen (on screen they're grouped; the saved list underneath had
drifted out of that order), and nothing re-aligned the two when the quotation opened. So when Mayar dragged a panel, the
app moved the panel sitting at that spot in the *saved* list — not the one she grabbed on screen — so the wrong panel
moved and it looked like her drag did nothing / snapped back. Ordinary quotations (never drifted) worked, which is why it
looked specific to her.

Fix, two layers: (1) opening a quotation now lines up the saved panel order with what's shown — an invisible correction
that permanently heals an affected quotation the first time it's opened (the on-screen order doesn't change); (2) a drag
now always acts on the panels as shown, never the raw saved list, so the panel you grab is the one that moves. Verified by
recreating the exact "saved order ≠ screen" case: the drag moved the right panel and stuck after a reload. 4 new tests.
**For Mayar: reopen QTN-26-01827 once it's live and reordering will work — it self-corrects on open.**

## 2026-09-09 · Mohamed's side · Claude

**Shared quotations: the OWNER's panel order now sticks (co-workers' auto-saves were quietly undoing it).**

Reported as "Mayar can't reorder panels in QTN-26-01827, but anyone else can." Mayar owns that (draft) quotation, so
nothing was blocking her — her arrangement was being *undone*. In a shared quotation every teammate's app auto-saves
constantly (whenever they price one of their own panels), and each of those saves was re-sending that person's view of
the whole panel order. So Mayar would drag the panels into place, it saved, and a few seconds later a co-worker's routine
auto-save arrived carrying the *old* order and overwrote hers — it snapped back. Co-workers' own reorders only seemed to
"work" because they happened to save last.

Fix: panel **order now belongs to the quotation's owner**, the same way the owner already owns the Project/Pricing/Terms
tabs. A co-worker's save can no longer move panels — it only updates the contents of that co-worker's own panels (adds,
edits, deletes still work). Co-workers see the owner's order (it syncs to them within ~15s). **Heads-up / behavior change:**
co-workers no longer have the drag handle on the panel list — their reordering was never being saved anyway and was the
very thing causing the conflict. If we decide co-workers *should* be able to arrange the shared list, that needs a
different approach — say so and I'll do it. Guarded by 9 new backend tests proving a co-worker's stale save can't revert
the owner's order.

## 2026-09-09 · Mohamed's side · Claude

**Panel drag-reorder now works once panels are in groups (it used to snap back).**

The earlier report blamed shared/co-work quotations, but the real cause was groups. As soon as panels were placed in
groups, the orange group-header strips (and the small "Ungrouped" label) sat between the panel cards, so the rows were
no longer evenly spaced. The drag was working out where you dropped a panel by assuming even spacing — with those strips
in the way it under-measured the move, decided you hadn't moved far enough, and snapped the panel back. A plain flat
list (no groups) stayed evenly spaced, so it worked there — which is why it looked like "some can, some can't". The drag
now follows your actual pointer position over the rows instead of assuming a fixed row height, so it drops exactly where
you release, no matter how many group headers or differently-sized rows are in between. Verified on a grouped list:
dragged a panel across the gap, it landed where dropped and stayed there after a reload.

## 2026-09-09 · Mohamed's side · Claude

**Shared (Co-Work) quotations: co-workers can now drag-reorder the panels too.**

Before, only the primary owner could reorder panels — for a co-worker the drag lifted the row but snapped back
(reordering was treated as a shared change reserved for the owner). Now any collaborator can reorder. It's safe: the
server keeps whatever order the saver sends and still protects everyone else's panel content. Reordering stays frozen
for everyone on a submitted/cancelled quotation, and normal (non-shared) quotations are unchanged.

## 2026-09-09 · Mohamed's side · Claude

**Component list: dragging to reorder now feels like the panel list (smooth), and the dragged row is solid.**

The component drag was the browser's native drag-and-drop (a faint ghost image). It's now the same smooth pointer
drag the panels use: the row lifts and follows your cursor with a solid white background, the drop spot highlights,
and it auto-scrolls when you drag near the top/bottom edge. Reordering within a section, moving a component to
another section (drop it on that section's header/tab), and combinations all work exactly as before — only the feel
changed. (One difference from panels: the drop spot highlights instead of neighbours sliding aside, which is more
reliable with the component list's combinations and stacked sections.)

## 2026-09-09 · Mohamed's side · Claude

**Paste combination now drops into the section you're viewing, not the one it was copied from.**

Copy a combination, switch to another section (e.g. Outgoings), and "Paste combination" now pastes it into that
section — before, it went back to the section the combination was copied from (e.g. Main Incoming). It still falls
back to the copied-from section only when you paste into a different panel that doesn't have the active section.

## 2026-09-09 · Mohamed's side · Claude

**Copper Tool formula bar: it now keeps the formula, so you can select it and Ctrl+C (the copy button stays too).**

The formula bar now keeps showing a cell's formula after you click out of the cell, and one click on the formula
selects the whole thing — so you can copy it with Ctrl+C. The copy button is still there too, so either way works.

## 2026-09-09 · Mohamed's side · Claude

**Copper Tool: a formula bar above the table, with a copy button.**

Above the Copper Tool table there's now a formula bar (like a spreadsheet). Click into any length cell and the bar
shows which cell it is (e.g. "630 A · Phase L") and its full formula/value — handy when a long formula like
=1000+1000+500 doesn't fit in the narrow cell. A copy button on the bar copies that formula/value to the clipboard
(with a ✓ confirmation) without disturbing the cell you're editing.

## 2026-09-09 · Mohamed's side · Claude

**Panel list: click anywhere in a panel's card to open it.**

You no longer have to click exactly on the panel name — clicking anywhere in a panel's card now opens (selects) that
panel. The drag handle and the row's icons (jump / edit / duplicate / remove) still do their own thing.

## 2026-09-09 · Mohamed's side · Claude

**Inside a QTN: the "Offers" sidebar icon no longer looks selected, and "← All QTNs" is now "← My QTNs".**

Two small navigation tweaks when a quotation is open: (1) the left sidebar's "Offers" icon no longer shows as
highlighted while you're inside a quotation — it only highlights on the offer-history list itself; (2) the "← All
QTNs" back-link at the top-left is now "← My QTNs" and takes you to your home page instead of the all-QTNs list.

## 2026-09-09 · Mohamed's side · Claude

**Copper Tool: the length cells now remember the formula you type (and copy the formula, not the value).**

Like the QTY column, the Copper Tool's Phase L / Neutral L / Earth L cells now accept a formula (e.g. =350+350 →
shows 700 and the weight uses 700). Click back into a cell and it shows the formula again — and because the formula
is selected, copying the cell copies the formula, not the computed value. Plain numbers behave exactly as before;
the weight math is unchanged, and existing copper values are untouched.

## 2026-09-09 · Mohamed's side · Claude

**Adding components: the cursor now returns to the search box every time.**

When adding components one after another, the cursor was supposed to jump back to the search box so you can type
the next one — but from the second component on it sometimes landed in the QTY column instead. The search box now
reliably takes the cursor back after every add (it waits for the screen to settle so it wins), and a guard stops
the QTY Enter-key navigation from ever jumping to the first row's quantity. NOTE: this is a timing-sensitive focus
fix that couldn't be replayed in the offline test window — worth a quick check on the live site.

## 2026-09-09 · Mohamed's side · Claude

**Offer cover product links now point to askpowerline.com.**

The five product boxes on the offer cover (Technical & Commercial, and the RMU cover) now link to the new site:
LV Enclosures → askpowerline.com/low-voltage · Transformers → /products/dry-type-transformers · Secondary
Switchgear → /secondary-switchgear · Primary Switchgear → /primary-switchgear · Kiosk → /compact-substation.
Clicking the icon or the title opens the page (on screen and in the downloaded PDF). The small "Website" globe icon
at the bottom still points to powerlinei.com — left as-is for now.

## 2026-09-09 · Mohamed's side · Claude

**Fixed: clicking a field in the P.F.C pop-up closed it and showed "Nothing selected".**

Opening any field inside the P.F.C pop-up (and other pop-ups) was being mistaken for a click on the empty space
next to the panel list, which deselects the active panel — that tore down the editor and closed the pop-up. Pop-ups
open in a top layer (portal); their clicks are no longer treated as "empty space" clicks, so the pop-up stays open
and the panel stays selected. The "Nothing selected" card is unchanged; it just no longer appears wrongly here.

## 2026-09-09 · Mohamed's side · Claude

**Fixed: the "Send to…" list opened behind the approval pop-up (looked greyed/locked).**

When you clicked "Reply & send for approval" inside the approval conversation pop-up, the list of people to send
to was opening BEHIND the pop-up's dim background — so it looked greyed out and clicking a name did nothing (the
click hit the dim background instead). The list now opens on top of the pop-up, so you can pick a person and it
sends. Pure display-layering fix.

## 2026-09-09 · Mohamed's side · Claude

**A returned quotation can now be re-sent for approval by a co-worker or an admin, not only its creator.**

When a quotation was "Returned for revision", only the exact person who first created it could send it back for
approval — so a co-worker (Co-Work) or an admin handling it was stuck: they could read the reviewer's comments but
"Reply & send for approval" was refused. Now the owner, a co-worker, OR an admin can send (or re-send) a quotation
for approval. Same fix applied to RMU offers (owner or admin). No screen change — the button was already there; the
server was rejecting it.

## 2026-09-09 · Mohamed's side · Claude

**Admins can now approve their own QTNs (and RMU offers).**

Before, an admin held every permission EXCEPT "approve your own QTN" — and there was no way to switch that on
for an admin, so an admin could never approve a quotation they created (the server always said "another approver
must review it"). Now admins (both owner accounts) can approve their own QTNs and RMU offers. Engineers are
unchanged: for them, "Approve their own QTNs" is still a separate tick you grant per person in the Access Center.
⚠️ HEADS-UP: this relaxes the previous separation-of-duties rule for admins — an admin no longer needs a second
person to approve their own work.

## 2026-09-09 · Mohamed's side · Claude

**Panels editor: brought back the "Nothing selected" placeholder card.**

Reverted the earlier removal — when no panel is selected, the editor area shows the "Nothing selected. Click a
panel to edit it — or press + Add panel" card again, as before. (The owner asked to undo the previous change.)

## 2026-09-09 · Mohamed's side · Claude

**Panels editor: dropped the "Nothing selected" placeholder card.**

When no panel is selected, the big editor area used to show a placeholder card ("Nothing selected. Click a
panel to edit it — or press + Add panel"). The owner asked to remove it, so that space is now simply empty
until a panel is clicked. The separate hint shown while a group is active (explaining that + Add panel adds
into the group) is kept, since it's a different state.

## 2026-09-09 · Mohamed's side · Claude

**Offer cover links now open from phones and WhatsApp too.**

The links on the offer cover (products, ISO certificates, address, email, phone, website, Facebook, LinkedIn)
were already being placed into the downloaded PDF — but their clickable boxes were being written upside-down.
Adobe Reader and Chrome quietly correct that, so the links worked there; phone PDF viewers and WhatsApp's
built-in viewer do not, and they dropped the "backwards" links — which is exactly how customers open the file,
so the cover links looked dead. Fixed how the clickable areas are written (same spot, same size, just the right
way up), so every viewer now treats them as real links. Applies to both the Technical and Commercial offer covers.

## 2026-09-09 · Mohamed's side · Claude

**Panel list: hold-and-drag now scrolls AND selects a long list.**

When you make a group and there are more panels than fit on screen, you press the first panel's checkbox,
hold, and drag down (or up) to sweep-select a range. Before, if you dragged toward the top or bottom edge
the list would just stop there — it wouldn't scroll to reveal the panels off-screen, so you couldn't reach
them. Now, while you're holding and dragging, if the cursor gets near the top or bottom edge the list (or
the page, whichever one scrolls on your screen) auto-scrolls in that direction — faster the closer you push
to the edge — and every row that scrolls into view under your cursor gets added to the selection, even when
you hold the mouse still. It stops the moment you let go. This is the same scroll behaviour already used when
you drag to reorder panels, so it feels the same. Nothing else changed.

## 2026-09-09 · Mohamed's side · Claude

**Panels "No. of poles": an MCCB summary in the Outgoings block.**

When a panel has outgoing MCCBs, the Outgoings side of the "No. of poles" card now lists them counted by
frame (XT1…XT7, and T-series) with a "Total: N MCCB" line — e.g. 3 XT1 / 2 XT4 / 1 XT7 / Total: 6 MCCB.
Quantities are summed, and it only shows when there are MCCBs. MCCBs aren't DIN-rail items, so the pole
counts are unchanged.

## 2026-09-08 · Mohamed's side · Claude

**Panel pricing table: reworked totals + a target-price helper.**

Several changes on the Pricing Settings "Panel pricing" table:
- Removed the grey help sentence at the top.
- The totals row now shows the **total qty** (in the Qty column) and the **final factor** (total cost ÷
  total selling) in the New Factor column.
- "Total selling" is split into two columns: **excl. VAT** and a new **incl. VAT** (= excl × (1 + VAT)).
- **Factor colours** everywhere a factor is shown: ≤0.9 green, 0.9–0.95 yellow, 0.95–1 red, above 1 dark
  red with a ✕ (selling below cost).
- New **"Do you have a target price? Click here"** below the table → a pop-up where you type the total
  price you want and it works out the factor (**cost ÷ price**). You choose **Excl. / Incl. VAT** (incl.
  is divided by 1+VAT first), can **Record the result** into a list under the table, and **Copy** that
  list to the clipboard.

## 2026-09-08 · Mohamed's side · Claude

**Approval conversation is now a button that opens the chat in a pop-up.**

The "Approval conversation · N messages" block no longer sits open on the page taking up space. It's a
button now — click it and the whole back-and-forth opens in a centred pop-up chat (reviewer on the left,
you on the right), with the reply box inside it. Close with ✕ or Escape. Same for LV and RMU offers.

## 2026-09-08 · Mohamed's side · Claude

**Custom Commercial Offer: an optional "Alternative offer" second page.**

The Custom Commercial Offer tab has a new "Alternative offer" toggle next to "Offer lines". Off by
default (offer unchanged). Turn it on and a second offer-lines table appears — it prints as its own page
titled "Alternative offer" after the main one, and the first page is then titled "Main offer". Same line
format (description · qty · unit price · total, drag to reorder). The PDF export prints the extra page too.

## 2026-09-08 · Mohamed's side · Claude

**Replace component: "Select all" / "Unselect all" links for the panel picker.**

In the "⇄ Replace component" window, when you choose "Selected panels" there are now **Select all** and
**Unselect all** links next to the toggles. "Unselect all" clears every ticked panel; "Select all" ticks
every panel that actually uses the component (it skips the ones marked "not used").

## 2026-09-08 · Mohamed's side · Claude

**Click a group to select it — the next "+ Add panel" then adds into that group.**

Clicking a group's name now selects the group on its own: any open panel is deselected, the group's
header gets a highlight, and the editor shows "Group … is selected". Pressing "+ Add panel" while a
group is selected adds the new panel into it. (The little arrow still expands/collapses the group;
clicking a panel selects the panel as before; clicking outside the list deselects everything.)

## 2026-09-08 · Mohamed's side · Claude

**Clicking outside the panel list now deselects — so the next "+ Add panel" adds outside any group.**

Following on from the contextual "+ Add panel": you no longer have to find an empty spot inside the list
to deselect. Clicking the empty area around/below the panel list now clears the active panel (the editor
shows "Nothing selected"), and the next "+ Add panel" adds ungrouped. Clicking the editor keeps the panel
open (so editing isn't interrupted), and clicking a panel selects it as before.

## 2026-09-08 · Mohamed's side · Claude

**"+ Add panel" now adds into the active group, or ungrouped when nothing is selected.**

If you're working inside a group (a panel in it is open), pressing "+ Add panel" adds the new panel
**into that group**. If you click an empty spot in the panel list to deselect everything (the editor then
shows "Nothing selected"), "+ Add panel" adds the panel **ungrouped, after the last group/panel**.
Selecting an ungrouped panel and adding also adds ungrouped. No prices change.

## 2026-09-08 · Mohamed's side · Claude

**Component QTY cells now accept equations (like Excel).**

In a panel's component table you can type an equation in the QTY column — e.g. **=5+3** — and when you
confirm it (Enter or click away) the cell shows the result **8**. Click back into the cell and it shows
the equation again so you can change it. Supports + − × (*) ÷ (/), brackets and %. Plain numbers work as
before; the result is what drives the quantity/cost, and the equation is saved with the quotation (so
teammates see it too). Works on the normal QTY and the combination per-unit QTY cells.

## 2026-09-08 · Mohamed's side · Claude

**Selectivity: the help sentence is replaced with a search bar.**

The line of grey text under the Selectivity heading ("One row per panel — … Use the Fed From filter…")
is gone. In its place is a **search box** that filters the table as you type — matching a panel's name,
its Main Incoming breaker, or its Fed From. It has a clear (✕) button, works together with the Fed From
dropdown, and is screen-only (nothing saved).

## 2026-09-08 · Mohamed's side · Claude

**Deleting a panel group now uses the PowerLine dialog, not the browser's grey box.**

The "Delete the group … and its N panels?" confirmation was the browser's own popup (the ugly
"localhost says" / "powerline-chi.vercel.app says" box). It's now the app's themed dialog — follows the
light/dark theme, has a red bar for the can't-be-undone action, and buttons named **Cancel** / **Delete
group** instead of OK/Cancel. Same as the other confirmations in the app.

## 2026-09-08 · Mohamed's side · Claude

**KWHM / LCP panels now show a 4-field header in the Technical Offer.**

KWHM and LCP auxiliary panels used to print only their item bar (name + qty) with no spec header. They
now show a compact 4-field header: **Panel Type · IP · Mounting · Rating**. Panel Type / IP / Mounting
come from the enclosure family the panel is auto-sized into; Rating follows the panel's rating (blank for
these aux panels, which carry no busbar rating). Normal panels are unchanged (full header). RAL and Amb.
Temp. are not shown for KWHM/LCP.

## 2026-09-08 · Mohamed's side · Claude

**Selectivity: a jump arrow beside each panel name opens that panel in the Panels tab.**

Each row in the Selectivity table now has a small ↗ arrow next to the Panel Name. Clicking it jumps
straight to that panel in the Panels tab, opened in the editor — so you can go from the coordination
table to the exact panel you're working on in one click.

## 2026-09-08 · Mohamed's side · Claude

**Selectivity: the "Fed From" filter is now remembered when you leave the tab and come back.**

Picking a source in the Selectivity tab's "Fed From" filter used to reset to "All" whenever you
switched to another tab and returned. It now stays on your last choice (saved per quotation, and it
even survives a page reload). Panel names and Fed From edits were always saved — only the filter reset
before. If the source you filtered by later disappears, the filter quietly goes back to "All".

## 2026-09-08 · Mohamed's side · Claude

**Panel editor: the component row under the mouse now goes bold.**

Moving the mouse over any component in a panel's component list highlights that row — it turns bold
with a faint tint — so you can see which component is under the cursor. Purely visual; nothing about
the component or its price changes.

## 2026-09-08 · Mohamed's side · Claude

**Panels: a "move out of group" button on each grouped panel.**

Every panel that sits inside a group now has a small "move out of the group" arrow on its row (the
first of the row's icons). Clicking it pops just that one panel back to the Ungrouped area, leaving
the rest of the group untouched — a quick alternative to ticking it and using "Move to → Ungrouped".
The button only shows on panels that are actually in a group.

## 2026-09-08 · Mohamed's side · Claude

**Panels: click outside the panel list to drop the selection and leave select mode.**

While ticking panels to group them, clicking anywhere outside the panel list (the panel form, empty
space, another tab) now clears the ticks and leaves select mode — no need to hit Cancel. The group-name
popup is unaffected: clicking inside it doesn't cancel your selection.

## 2026-09-08 · Mohamed's side · Claude

**Panels: press a panel's tick box and drag over the rows to select a whole range.**

In the panel list's group-select mode you can now press one panel's checkbox, hold, and drag up or
down over the other panels to select everything in between — the same press-and-drag you already have
in the components list. A plain single click still ticks just that one panel, and grabbing the dotted
reorder grip still reorders the panel (it doesn't start a selection).

## 2026-09-08 · Mohamed's side · Claude

**Panels: reorder groups by dragging the dotted handle, instead of the ↑/↓ arrows.**

The little up/down arrows on each group's orange header are gone. Instead every group header now
has the same dotted grip on its left that the panels have — grab it and drag the whole group up or
down to reorder it, and a coloured line shows where it will land. Renaming, duplicating, ungrouping
and deleting a group are unchanged. Only the display order changes; no prices or panels are touched.

## 2026-09-08 · Mohamed's side · Claude

**Panels: the Group / Move-to buttons now sit in the panel list, not in a floating bar.**

When you tick panels to group them, the **Group** button (and the **Move to…** dropdown, if the
quotation already has groups) now appears right at the top of the panel list, under the "…selected"
count — instead of floating in a little bar at the bottom-centre of the page. Same actions, same
"name your group" popup; only the place they show up moved, so they're next to the panels you ticked.

## 2026-09-08 · Mohamed's side · Claude

**Material List Excel export now includes the Market Price (%) column.**

The "Export to Excel" file now carries a **Market Price (%)** column right after **Discount (%)**, matching
the on-screen table. For each item the sheet shows its discount as a number (0 if it has none) and its
market-price markup as a number (0 if it has none) — never both, since a component can only carry one.
Verified the two columns land side by side with the right values; build green, all 81 tests pass.

## 2026-09-08 · Mohamed's side · Claude

**Material List: new "Market Price (%)" column that raises a component's cost.**

Next to the per-item **Discount (%)** column (which lowers a component's cost) there is now a **Market
Price (%)** column that **raises** it — e.g. a component that costs 100 with a 20% market price now costs
120. A cell with a **discount** shows **red**, a cell with a **market price** shows **green**, and you can
only use ONE of the two on any component (entering one disables the other). Existing discounts and every
saved quotation are unaffected — a market price is handled as the mirror image of a discount, so the cost
formula itself did not change. (The Excel export still shows the discount column only for now.) Verified
the numbers (100 → 120 with 20% market price) and the on-screen behaviour; build green.

## 2026-09-08 · Mohamed's side · Claude

**Amending a quotation now dates the new revision today, not the old date.**

When you cancel-and-amend a quotation, the new revision is a fresh document, so its offer **date** now
shows the day you created the amendment instead of copying the original's old date. The revision number
still bumps as before; only the date refreshes. Verified: an original dated 2020-01-01, amended, came out
dated today. Build green.

## 2026-09-07 · Mohamed's side · Claude

**The scratch pad is now saved WITH the quotation, so teammates see it.**

The scratch-pad tables in the Technical Offer used to be saved only in your own browser. Now the
**content** you type is saved with the quotation itself, so anyone who opens that quotation — a teammate,
or you from another computer — sees the same calculations. Each person's own **size/position** for the
pad stays local (a per-viewer preference). For someone who can only view the quotation (or it's
submitted/approved/locked, or they are a co-owner not the editor), the pad is **read-only** — they see
it but can't change it. No database change (it rides along in the quotation's saved data). Verified that
typed content saves to the quotation and reloads from it with the browser cache cleared; build green.

## 2026-09-07 · Mohamed's side · Claude

**New: a calculation "scratch pad" beside every panel in the Technical Offer.**

Each panel in the Technical Offer (the "A4 pages" view) now has a small editable table to its left, next
to the panel's "Main Incoming" list, for doing side-calculations while you review the offer. It behaves
like a tiny spreadsheet:

- Columns **A–D** and numbered rows, with a **formula bar** above the grid.
- Cells accept **equations** and **cell references** — e.g. `=A1+B1`, `=C1*2`, `10+5%*200`. Click a
  formula cell → the value shows in the cell, the equation shows in the bar.
- **Build formulas by pointing:** type `=` then press the arrow keys (or click cells) to insert their
  references. Arrows / clicking also just move between cells; Enter moves down.
- **Drag a cell's corner (fill handle) down** to copy its equation with the references shifted per row
  (`=A1+B1` → `=A2+B2` → …).
- **Drag across cells** to select a block, then **Σ Sum / Delete / Copy** it.
- **Drag the title bar to move it, the bottom-right corner to resize it**; toggle it on/off with the
  "🧮 Scratch pad" button.

It is **completely private and never part of the offer** — not printed, not in the PDF, and saved only
in this browser (per panel). Build green.

## 2026-09-07 · Mohamed's side · Claude

**"Go to ERP" now includes the revision (e.g. QTN-26-00399-3).**

The "Go to ERP" button was opening the quotation by its plain number and leaving the revision off, so
a revised quotation (e.g. QTN-26-01831-**1**) opened the wrong record in the ERP. It now includes the
revision — revision 00 stays plain (…/QTN-26-01831), revision 01/02/03… add the suffix
(…/QTN-26-01831-1, …-2, …-3). Verified on a revision-3 quotation; build green.

## 2026-09-07 · Mohamed's side · Claude

**A cancelled quotation no longer keeps counting "active working time".**

Opening a **Cancelled** quotation kept the ⏱ working-time timer running (and saving time to it). A
cancelled quotation is finished, so it's now treated as read-only the moment it opens — the timer stays
off, the same as a submitted or approved one. Normal draft quotations still count their time as before.
Verified on a cancelled quotation (timer off) and a draft (timer on); build green.

## 2026-09-07 · Mohamed's side · Claude

**The "＋ Page" and "↗ Panel" buttons in the A4 view now match the Edit view.**

Two tidy-ups on the Technical Offer's "A4 pages" view: the **"＋ Page"** button is now a clean dashed
pill — the grey bar that sat behind it is gone (it was accidentally picking up the "floating sheet" look
the preview gives every page). And the **"↗ Panel"** button now sits neatly in the white space at the
top-right of the panel — below the header, above the table — instead of overlapping the first table row,
and uses the same arrow icon as the Edit view. Screen-only; the printed PDF is unchanged. Build green.

## 2026-09-07 · Mohamed's side · Claude

**Approval comments are now a two-way chat — the creator can reply when re-sending.**

When a reviewer returns a quotation (or an RMU offer) with comments, the person who made it now sees a
**conversation** instead of a single red note: the reviewer's comments and the creator's replies as chat
bubbles (reviewer on the left, creator on the right), each with who wrote it and when. On a returned item
the creator gets a **"Your reply"** box and a **"Reply & send for approval"** button — they read the
comments, type a reply, choose who to send it to, and it goes back with the reply saved. The reviewer then
sees the whole conversation, including the reply, before approving or returning again.

One thing had to change on the server for this to work: when you re-sent for approval, the system was
replacing your typed reply with "Sent to <name> for approval", so the reply was lost — it now keeps your
reply (and shows it in the approver's notification). No change to the database, to prices, or to any
existing quotation. Works on both LV quotations and RMU offers. Verified end-to-end on both; build green.

## 2026-09-07 · Mohamed's side · Claude

**P.F.C: you must now pick a circuit breaker before generating the combination.**

On the "Existing / known P.F.C" tab, the **Generate combination** button now stays disabled until you
select a real circuit breaker (a red note explains why). Before, typing a number in "C.B rating" was
enough — but that produced a generic, un-priced breaker line. The breaker is now required, and editing the
C.B rating no longer clears the breaker you picked. Verified; build green.

## 2026-09-07 · Mohamed's side · Claude

**The "＋ Page" and "↗ Panel" buttons now show in the A4-pages view too, not only in Edit.**

In the Technical Offer, the small toolbar above each panel — **＋ Page** (insert a divider page before that
panel) and **↗ Panel** (jump back to that panel in the Panels list) — now appears in the "A4 pages" view as
well as "Edit". They never appear on the printed PDF. Verified: ↗ Panel lands on the right panel (MDB→MDB,
LP→LP) and ＋ Page inserts a divider; build green.

## 2026-09-07 · Mohamed's side · Claude

**Fixed for real: the panel ↗ arrow now lands on that panel in the Technical Offer, not the top.**

The first attempt didn't work because of how the offer is drawn: the A4 preview you see is built as
separate pages, while the copy that carried the panel markers is a HIDDEN duplicate (the app keeps it
to build the pages and the PDF). The jump was scrolling to the hidden copy, whose position reads as 0,
so it always went to the start. Now each panel's first A4 page is labelled with the panel, and the jump
scrolls to whichever copy is actually on screen. Verified: MDB's arrow lands on MDB's page, LP's arrow
on LP's page. Build green.

## 2026-09-07 · Mohamed's side · Claude

**"Go to ERP" jump, and the panel ↔ Technical-Offer jumps behave properly.**

- After you press **Copy link** on a quotation, a **"↗ Go to ERP"** button appears next to it. It
  opens that quotation in the ERP — `https://pl.powerline.com.eg/app/quotation/QTN-<number>`, built
  from the quotation's own number (so QTN-26-01831 → …/QTN-26-01831).
- Clicking a panel's **↗** arrow (Panels list) now jumps to **that panel** on the Technical Offer,
  not the top of it. It used to scroll before the offer pages finished drawing, so it landed at the
  start; now it waits for the panel's page and re-scrolls once the pages settle.
- The **"↗ Panel"** button on each offer page (back to that panel) is now **pinned** at the top-right
  while you scroll, so the jump back is always in reach instead of scrolling away.

## 2026-09-07 · Mohamed's side · Claude

**Pricing Settings → Panel pricing: clearer columns; and the panel's ÷ factor reads bigger.**

Two small display tweaks (no numbers changed):
- The "Total cost" column in the Panel pricing table is renamed to **"Unit cost"** — it always showed
  the per-panel unit cost, so the label now matches it — and a new **"Total cost"** column (unit cost ×
  quantity) is added just before "Total selling", with both totals summed in the footer row.
- On a panel's cost breakdown, the small "÷ factor 0.7289" line under Unit Selling (EGP) is now larger
  and sits at the bottom of the card instead of tucked right under the number.

## 2026-09-07 · Mohamed's side · Claude

**Follow-up fix: an enclosure row uploaded with a code that an old component already uses now adds the enclosure.**

Right after the enclosure-import change went live, adding "Local (Sheet Metal) · L1800×800×300" from
Excel still came out as a *component* and didn't appear in the enclosure search. Cause: a component
with the same code (`Local-1800.800.300`) had been added earlier — back when only components could be
imported — and the upload matched that existing component by code first. Now a row marked (or inferred)
as an Enclosure is matched ONLY against enclosures, never a component that happens to share the code, so
re-uploading adds the enclosure. The leftover component then shows up as a normal "to remove" item, so
ticking removals on a full-list upload retires it. Verified. Build green, 311 backend tests pass.

## 2026-09-07 · Mohamed's side · Claude

**The price-list Excel is now the source of truth for ENCLOSURES too — add / retire / edit by download-edit-upload.**

The download-edit-upload flow on the Price list already handled components (add new, change
price/description, and retire an item you delete from the sheet). It now does the same for
**enclosures**:

- **Download Current Excel** now gives the **active** items only — components AND enclosures — and
  adds a **"Kind"** column ("Component"/"Enclosure") so a re-upload knows which list each row belongs
  to. Retired items are no longer included (they stay archived, out of the sheet).
- **Add an enclosure**: type a new row (Kind = Enclosure, family in the Type column, e.g. "Local
  (Sheet Metal)", the size as the description, a code and a price) and upload — it's created as a
  real enclosure and is immediately available as a box when building a panel of that family. This is
  the piece that was missing: before, any new row you added always became a *component*, so a new
  enclosure never showed up in the panel box list.
- **Edit an enclosure's price or description**, and **retire an enclosure** by deleting its row —
  all the same as components. Retiring is reversible and never changes quotations already made.
- The **preview before applying** now shows the split — added components / added enclosures, retired
  components / retired enclosures, price changes and description changes — and each enclosure row is
  tagged. Removals are still opt-in with a confirm, so a partial upload can't wipe the list.

Old quotations are unaffected — each one keeps the exact item, description and price it was made
with. Verified end to end: adding "Local (Sheet Metal) · L1800×800×300 @ 16,500" via upload made it
live in the catalogue and available in the panel box list; price and description edits were detected.
No database change. Build green, 311 backend + 81 frontend tests pass.

Not built yet (say if wanted): a dedicated screen to browse/download the retired-items archive.

## 2026-09-06 · Mohamed's side · Claude

**Panel-group header no longer shows a price.** Dropped the rolled-up selling total from the group
header strip in the sidebar — it now shows just the group name, the panel count, and the action
buttons. (Grouping stays organisational only; nothing else changed.)

## 2026-09-06 · Mohamed's side · Claude

**Panels can now be grouped in the quotation sidebar (e.g. SMDB-1 + SMDB-2 under "SMDB").**

A new optional layer for organising a quotation: put related panels — main or auxiliary — under a
named group. It's purely organisational; it changes no price, sizing or total. In the Panels tab
sidebar, groups show first (an orange header with a collapse arrow, the group name, how many
panels, and their combined selling total, plus rename / duplicate / ungroup / delete and up/down to
reorder groups), their panels indented under an orange rail, then an "Ungrouped" list. To make a
group: click "New group", tick the panels, then "Group" (the name box pre-fills with the shared
start of the names, e.g. "SMDB"); or drag a panel into a group's rows. Duplicate deep-copies the
panels; ungroup keeps them; delete asks first and removes the group and its panels. Panels are
still numbered 1…N straight through, groups don't restart the count. The group name prints as a
heading on the Technical and Commercial offer PDFs. Old quotations open exactly as before, and
imported panels arrive ungrouped. No database change. Build green, 81 frontend tests pass.

Note on Excel: the group heading is on the two offer PDFs, not the Excel exports — the Material
List Excel is an aggregated parts list (no per-panel rows) and the ERP CSV is a strict import file,
so a coloured group band doesn't fit either. A dedicated per-panel Excel with group bands can be
added if wanted.

## 2026-09-06 · Mohamed's side · Claude

**New quotations pre-fill the Sales Support Engineer with the creator's own name.**

When you start a new quotation, the "Sales Support Engineer" field now defaults to your own account
name instead of "— select —", so the mandatory field is usually already filled. It stays fully
editable from the dropdown, and if your name isn't in the registered support-engineer list it's
added as a selectable option so it still shows. Only affects newly created quotations.

## 2026-09-06 · Mohamed's side · Claude

**The "P.F.C" combinations Excel now DRIVES the P.F.C combination — like MCC does.**

Until now the P.F.C sheet on the Combinations tab was only a reference copy: editing it changed
nothing, because the app built the capacitor bank from parts written into the code. Now the sheet
is a PARTS MAP the app actually reads. Each row is: the ROLE (column A), the EXACT price-list name
of the item to use (column B), and a number (column C) — fuses/bases per step, a controller's
largest step count, or a ventilation quantity. The roles are: the 25-kVAR capacitor, the fuse and
contactor for a 25-kVAR and for a 50-kVAR step, the fuse base, the power-factor controllers, and
the fan/filter/thermostat. Download the "P.F.C" file from the Combinations tab to get the sheet
already filled in with today's parts, change a name or number, and load it back — the change shows
up the next time a P.F.C combination is generated. Anything you leave out keeps the app's built-in
default, so a half-filled sheet is safe. A name that isn't on the price list is flagged when you
load the file.

The app still works out HOW MANY of each part from the kVAR and the number of steps — the sheet
only sets WHICH item plays each role. Nothing changes until you upload a new sheet: the built-in
parts (including the RTR "Capacitor 25 kVAR @ 400V") are the starting point. Verified end to end:
loading a sheet with a different capacitor made the generated P.F.C bank use that capacitor.
Frontend + backend build green; 81 frontend and 311 backend tests pass (5 new P.F.C tests).

## 2026-09-06 · Mohamed's side · Claude

**P.F.C combination now uses the RTR 25-kVAR capacitor, not the old Hitachi one.**

When you build a Power-Factor-Correction combination, the capacitor line was always coming out as
"Hitachi Capacitor 25 kVAR @ 400V" even after the price list was changed to the RTR capacitor
("Capacitor 25 kVAR @ 400V", brand RTR). Reason: the P.F.C builder looked the capacitor up by the
loose text "25 KVAR" and picked whichever 25-kVAR capacitor sat first in the price list — the old
Hitachi one. It now asks for the exact price-list name "Capacitor 25 kVAR @ 400V", so it resolves
to the RTR row (with its price and reference). Verified by generating a P.F.C bank: the capacitor
now reads "Capacitor 25 kVAR @ 400V -RTR" and is priced. Build green, P.F.C tests pass.

Note for whoever changes capacitors again: the P.F.C combination's parts are defined in the app's
code (`frontend/src/lv/combos.ts`), and the "P.F.C" Excel on the Combinations tab is only a
reference copy that the app does NOT read when building — unlike MCC, which is driven by its
uploaded sheet. So to swap the P.F.C capacitor, either keep the price-list name
"Capacitor 25 kVAR @ 400V" (and just edit its price/brand), or ask for a code change.

## 2026-09-06 · Mohamed's side · Claude

**Quantity column moved to the front of the panel components table.**

In the panel's component list, the "Qty" column now sits at the very start — right after the drag
handle and before the description — instead of being between the reference and the adjustment
columns. The header, every component row and the combination header rows all moved together so the
numbers still line up. On a combination's header row the "Combination qty" wording now reads first,
followed by its number box and then the combination name (before, that wording was stranded to the
right of the name). Nothing else changed — same icons, colours, prices and totals — and the printed
Technical Offer and the Excel/ERP export are untouched. Build green.

## 2026-09-06 · Mohamed's side · Claude

**Undo now reaches much further back.**

Undo/Redo only remembered the last 60 changes, and because typing in a box records one step per
keystroke, that was used up after a few words — so undo felt short-lived. Raised the memory to
the last 1000 changes (about 16× more). It costs almost no extra memory because each step shares
the unchanged parts of the one before it. Verified: undo/redo still steps through edits correctly
and returns to the starting point. Build green, 76 tests pass.

## 2026-09-06 · Mohamed's side · Claude

**Active-time now stops once a quotation is sent for approval or submitted.**

The "active working time" counter should only add up real editing time. It already stopped on
screen once a quotation was locked (waiting for approval / approved / submitted), but the server
would still accept a stray time update from a lingering page. Now the server refuses them too: a
quotation that is Waiting for approval, Approved or Submitted accrues no more time — only Draft /
Returned quotations do. Same rule applied to RMU offers. Verified: sending 50 seconds to a
Waiting and to a Submitted quotation added nothing; drafts are unaffected. Build green, 311 tests
pass.

## 2026-09-06 · Mohamed's side · Claude

**Incoming / Outgoings: a component you add now goes ABOVE the combinations, not below.**

In the Main Incoming and Outgoings sections, the loose individual items belong before the
combinations (Source 1/2, starters, …). Adding a component used to drop it at the bottom of the
section, under the combinations. Now, if the section has a combination, the new component is
inserted just before the first one — so the plain items stay together at the top and the
combinations follow. Applies to a single add, a bulk paste, and the auto-added neutral sensor;
other sections are unchanged (still add to the end). Verified: on a Main Incoming with Source 1/2,
a newly added "Selector" landed above Source 1. Build green, 76 tests pass.

## 2026-09-06 · Mohamed's side · Claude

**LCP / KWHM: a one-time reminder to re-check the size after you change the defaults.**

The enclosure size for an LCP or KWHM panel is worked out automatically from the number of
groups / meters — not from the actual component rows. So if you hand-edit the auto-filled
components (add / change / remove one, or change a quantity), the auto-size may no longer be
right. Now the first time you make such a change on a panel, a small pop-up says "Re-check the
panel size" pointing you to the Sizing box. It shows **once per panel** (a remembered mark, so it
won't nag on every later change or after a reload). Changing the count / family / layout still
re-sizes on its own and never warns. No database column (the mark lives in the quotation's saved
data). Verified on a real LCP panel: the pop-up showed on the first quantity change and did NOT
show on the second. Build green, 76 tests pass.

## 2026-09-06 · Mohamed's side · Claude

**P.F.C fix: a fixed-only capacitor bank no longer gets a Power Factor Controller.**

Building a P.F.C combination with only **fixed** steps (no variable steps) was wrongly adding a
"Power Factor Controller 12 step RVC-12" line. A controller switches the *variable* steps in and
out — a fixed bank has nothing to switch, so it needs none. The rule now is: no variable steps →
no controller; 1–6 variable steps → RVC-6; 7–12 → RVC-12; more than 12 → both. (The old code had
`else if (var steps ≤ 12)`, which also caught *zero* steps and added an RVC-12 to every fixed-only
bank.) Added tests for all four cases. Verified: a 1 × 50 kVAR fixed bank now builds 7 items with
no controller; 4 variable steps → RVC-6, 8 → RVC-12. Build green, 76 tests pass.

## 2026-09-06 · Mohamed's side · Claude

**Revision No. and OPTY No. are now required fields.**

On the Project tab, **Revision No.** and **OPTY No.** now carry the same red ✱ as Project name,
Customer, QTN No. and Sales support engineer — the box shows a red outline until it's filled. And
like those fields, an offer can't be generated until both are entered: the Technical / Commercial /
Material tabs show "Revision No. is required" / "OPTY No. is required" until they're filled on the
Project tab. Nothing else changes — you can still open and edit the quotation; it only blocks
producing an offer with them blank. Verified: the red outline shows when empty and clears when
filled, and the offer unblocks once both are in. Build green, 72 tests pass.

## 2026-09-03 · Mohamed's side · Claude

**New quotation type: "Custom Commercial Offer" — you write the offer lines yourself.**

On the Home dashboard, **+ New QTN** now has a fifth card: **Custom Commercial Offer**.
It asks for a quotation number exactly like the others, then opens a workspace with
**only two tabs — Project and Commercial Offer**.

### Why only two tabs

This type configures nothing. There are no panels, so Panels, Pricing Settings,
Technical Offer, Material List, Selectivity, Sizing Review and Summary would all be
empty screens. They are hidden rather than shown blank.

### What you do on the Commercial tab

Type your own lines: a description, a quantity and a unit price. Add lines, delete
them, move them up and down. The total, the VAT and the grand total are worked out for
you, and the USD/EGP switch works the same as everywhere else.

Because there is no Pricing Settings tab on this type, the **VAT %** and the **EGP per
USD** rate are edited on the Commercial tab itself — otherwise the total on its only
screen could not be made correct.

### The customer's document does not change

Deliberately identical to every other quotation: the same branded cover page, the same
price table layout, and the same **General Terms & Conditions** in English and Arabic,
still editable and still resettable. Only where the rows come from is different.

### For whoever picks this up next

- The type is a new `kind` on `LvState`, called `"custom"`, alongside `panels`, `edms`
  and `spare`. If you add another kind, **you must list it in the normaliser in
  `qtns.ts`** — a kind missing from that list is silently turned back into `"panels"`
  the next time the quotation loads, and every check against it stops matching. The
  code says so; I hit nothing because of it, but it is the trap in that file.
- Prices are stored in **EGP**, like every other price in the state, and converted for
  display. That is what makes the currency switch convert the offer rather than re-read
  the same numbers as a different currency.
- The lines are summed inside `grandTotals()`, so the history list, the dashboard
  figures and the saved summary all pick the total up without knowing this type exists.
  Nothing on those pages was changed.

Checked end to end on a real quotation: created it, typed two lines, confirmed
$32,148 appeared in Offer History, switched currency, reloaded the page and confirmed
both the two-tab layout and the typed lines survived. No console errors. 71 tests pass,
typecheck clean, build green.


## 2026-08-30 · Mohamed's side · Claude

**The product coding guide is now a screen in the app — "Coding guide" in the sidebar.**

Mohamed had a separate web page the engineers wrote ("Powerline – Product Coding Systems",
revision R1 by Yasser El-Sayed) explaining how our product codes are put together. It was a
loose file on his computer that nobody else could reach. It is now part of the app, in our
own colours and layout, and it works in dark mode like every other screen.

### What you can do with it

Open **Coding guide** in the sidebar. There are four tabs:

- **Ring main units** (PSEC, PRAL) — tick the options and the code writes itself. It also
  tells you whether that exact code is one of the **864 the engineers have signed off**, and
  lets you search that approved list.
- **Transformers** (PDTR, POTR)
- **MV switchgear** (PLGear)
- **Read a code** — paste any code you already have and it explains it part by part.

### Three things worth knowing

**1. It cannot drift away from the app.** The old page carried its own copy of the rules, so
if the app ever changed, the guide would quietly start teaching the wrong thing. Now the
rules sit in one tested file, and there is an automatic check that rebuilds **all 864
approved codes** and fails if a single one stops working. Nobody has to remember to check.

**2. It tells you when a code cannot be trusted.** The old page had warnings buried in
paragraphs. Now they appear next to the code itself:

- **63 kVA cannot be written exactly.** The rating field is kVA divided by ten, so 63
  becomes `006`, which reads back as **60 kVA**. Anyone reading that code alone gets the
  wrong number — the real rating has to come from the paperwork. The screen says so.
- **Reserved and unknown values are flagged** instead of being shown as if they were fine.

**3. ⚠️ HEADS-UP — a real gap between the guide and the app.** The app can put **CHINT**
(supplier code `CH`) on a PRAL ring main unit, and it does — that is a genuine product code.
But the engineers' guide has no CHINT row, so if you paste one of those codes into the guide
it will say "unknown supplier". The code is not wrong; the guide is incomplete.

❓ QUESTION FOR MOHAMED: please ask the engineers for the CHINT wording (the equivalent of
"ABB, Air LBS, NAL") so the guide can explain those codes too. Adding it is one line — but
the wording has to be theirs, not invented by us.

Two smaller gaps in their data are shown honestly rather than hidden: specification `30` has
no description yet (shown as "Reserved — not in use yet"), and the JGGY and GRL SF6 model
numbers were left as `###` in their document (shown as "model not stated yet").

### Nothing else was touched

Only three files changed outside the new folder: the sidebar button, the route, and the new
page. No existing screen, price, or quotation was affected. The guide is downloaded only
when someone opens it, so it does not slow the app down for everyone else.

## 2026-08-25 · Mohamed's side · Claude

**✅ New "Sizing Review" tab — a calculation pad for checking a panel's sizing.**

Every quotation now has a **Sizing Review** tab (next to Selectivity). It's a worksheet for the
person reviewing the sizing:
- On the left it lists each panel's real figures straight from the quotation — how many items in
  each section (Main Incoming, Outgoings, Metering, …) and the busbar rating — so you check your
  numbers against what's actually there.
- On the right you add calculation lines: type a label ("Outgoings") and a calculation ("8*3 + 2")
  and it shows the result instantly (supports + − × ÷ and brackets), with a running **Total**, plus
  a Conclusion/notes box.
- It **saves automatically** and is shared with everyone who opens the quotation, and — importantly
  — it can be filled in **even while the quotation is locked for approval**, so the reviewer can
  record their sizing check right there (it saves through its own channel, so it never touches the
  frozen prices).

Verified: figures pulled correctly, "8*3+2" gave 26 with a matching total, it saved and reloaded,
and it saved fine on a quotation that was Waiting for approval. No database column added (it lives
in the quotation's saved data). Builds green, 292 + 38 tests pass.

## 2026-08-25 · Mohamed's side · Claude

**✅ Dragging an item into another combination now puts it under that combination's header.**

If you duplicated an item inside a combination and dragged the copy into a different one, it kept
the first combination's heading instead of joining the second. Cause: only "loose" (un-grouped)
rows were allowed to adopt a combination by where you dropped them — a row that already belonged
to a combination was left alone. Now a row dropped inside a different combination joins it: it
takes that combination's name (and its ×N when it's a scalable combination). Verified: a YU copy
duplicated in "Source 1" and dragged into "Source 2" ended up under Source 2. Build green, 38
tests pass.

## 2026-08-25 · Mohamed's side · Claude

**✅ "Move to" (on selected rows) now offers both another section AND another combination.**

When you select rows in a panel, the floating bar's **Move to** menu used to list only sections.
It now has two groups: **Other section** (as before) and **Other combination** — the existing
combinations in that panel (e.g. "Source 1 · Main Incoming"). Picking a combination moves the
selected rows into it: they take that combination's section and name, sit right after its current
members, and adopt its ×N if it's a scalable combination. Verified: two Metering rows moved into
"Source 1" landed inside that combination and left Metering empty; undo restored it. Build green,
38 tests pass.

## 2026-08-25 · Mohamed's side · Claude

**✅ Copy/Paste of a combination now lands in the right section.**

The 📋 Copy on a combination (e.g. "Source 1" under Main Incoming) and "Paste combination"
was dropping the copy into whatever section happened to be active last — so a Main-Incoming
breaker combination could land in the P.F.C. capacitor section, which makes no sense. Now Paste
puts the combination back into the section it was copied from — in the same panel or a different
one — and only falls back to the section you're working in if that panel has no matching section.
The paste button's tooltip shows exactly where it will go, and a duplicate keeps a unique name
("Source 1 (2)"). Verified: with P.F.C. active, pasting a copied "Source 1" correctly landed in
Main Incoming as "Source 1 (2)". Build green, 38 tests pass.

## 2026-08-25 · Mohamed's side · Claude

**✅ Removing items from the price list now actually takes effect and they disappear from view.**

Follow-up to the full-sync removals: two things were making removed items look like they "still
exist". Fixed both:

1. **Removals now apply automatically when you upload your whole list.** The "remove missing
   items" tick is pre-checked whenever the file clearly IS the full price list (it recognised at
   least as many items as it would remove), so a normal Download → edit → upload → Apply removes
   the deleted rows without a separate step. A *part* of the list still leaves it unticked (so it
   can never wipe the catalogue), and you can always tick/untick it yourself.
2. **Removed items are now hidden from the price list.** The search used to still show retired
   items, so a removed product looked like it was never removed. They're hidden by default now;
   tick the new **Show removed** box to see them (struck through) and Restore any. The
   "Download current" export is unchanged (it still includes everything).

Verified end-to-end: retiring an item hides it from the default search and it reappears under
"Show removed"; a full-list-minus-one upload pre-ticks the removal, a 2-item upload does not.
Backend + frontend build green, 291 + 38 tests pass.

## 2026-08-25 · Mohamed's side · Claude

**✅ The Excel price update can now REMOVE items that are no longer in your sheet — a true full sync.**

Before, uploading an Excel only updated prices/data and added new items; anything you had
deleted from the sheet stayed in the catalogue. Now the review screen ("Review before applying")
also shows an **Items to remove** count and a **To remove** tab listing every catalogue item that
your file leaves out. Removing is opt-in and safe:

- You must tick a clearly-worded box ("N catalogue items are not in this file — tick to remove
  them") before any removal happens — so uploading a *part* of the list can never wipe the rest by
  accident. Nothing is removed unless you both tick it and press Apply.
- "Remove" means the item stops being offered and drops out of new quotations. Offers already sent
  keep their prices, and a removal can be undone any time from the price list (it's a soft delete —
  the row and its history stay). Items that never had an item code (Space-for-MCB, CTs) and the
  enclosures/cells are left alone — only coded components are synced this way.

Verified end-to-end on the real catalogue: the review correctly flagged exactly the missing item,
did nothing when the box was unticked, retired it when ticked, and restoring it worked. Backend +
frontend build green, 291 + 38 tests pass.

## 2026-08-25 · Mohamed's side · Claude

**✅ You can now insert a page break at any row of the Technical Offer, to balance the pages.**

The offer fills each A4 page automatically, which sometimes left an ugly near-empty page (e.g.
a single "Contactor for capacitor" alone on the last page). Now, in the Technical Offer's
**✎ Edit** view, hovering a component row shows a small "✂ break" button — click it to start a
new A4 page at that row. The break carries the row's section/group heading with it (so, say,
the whole P.F.C. section jumps to the next page together, header and all), and it shows as a
dashed "✂ Page break" line you can click again to remove. It applies to both the on-screen
**🗎 A4 pages** view and the exported PDF (they share one layout engine), and it's saved with
the quotation. No effect unless you add one; old quotations are untouched. Build green,
38 tests pass. Verified on QTN-26-01479: a break before P.F.C. moved the whole section onto
its own full page instead of stranding one item.

## 2026-08-25 · Mohamed's side · Claude

**✅ The Technical Offer now displays as real A4 pages on screen — exactly what the PDF produces.**

Before: on screen a panel with a long component list showed as one tall sheet (it only split
into A4 pages inside the exported PDF), so the preview didn't match the printed document. Now
the Technical Offer tab has a small switch at the top-left: **🗎 A4 pages** (the default) lays
the offer out as true A4 pages — cover, notes, and each panel's components flowing across
pages with a repeated header and "Page X of Y" — page-for-page identical to the PDF, because
it runs the exact same page builder. **✎ Edit** brings back the continuous view for adding or
changing notes and divider pages. The PDF export and printing are unchanged. Verified live:
a big 40-panel quotation lays out to 47 clean A4 pages, and normal offers are instant.

## 2026-08-25 · Mohamed's side · Claude

**✅ A quotation sent for approval is now frozen for its creator — no more editing under the reviewer's feet.**

Before: after an estimator sent a QTN for approval, they could keep editing it while the
reviewer was revising it, so the reviewer was chasing a moving target. Cause: the estimator's
own "Tendering" role carries the `edit-waiting` permission, and both the screen and the server
treated that permission as a licence to keep saving a waiting quotation.

Now: once a quotation is **Waiting for approval** (or Approved / Submitted) it is read-only for
its creator and co-workers — every field is locked and nothing autosaves. The **only** way the
creator gets editing back is to **Withdraw** it (it drops back to Draft), or for the reviewer to
**Return** it with comments (it becomes Returned and editable again). Withdraw shows only while
it is Waiting/Approved; the moment the reviewer Returns it, Withdraw is gone. A reviewer can
still open the read-only "compare" sandbox as before — nothing they touch there is ever saved.
Enforced on the server too (a locked quotation refuses saves with a clear message), not just in
the browser. No data or price change. Builds green, 291 + 38 tests pass.

## 2026-08-25 · Mohamed's side · Claude

**✅ Technical Offer now prints each item exactly where it sits in the panel.**

A panel's "Main Incoming" had one EXT under Source 1 and one under Source 2, but the printed
Technical Offer showed BOTH EXTs under Source 1 and none under Source 2. Cause: the offer table
grouped components by group *name*, which quietly pulled every loose (un-grouped) row up next to
the first loose row — so the Source 2 EXT jumped up under Source 1. The offer now walks the
components in order, exactly like the panels editor does, and only draws a "Source 1 / Source 2"
sub-header when the combination actually changes. Loose rows stay put, so the printed offer now
matches the panel item-for-item. No price or data change. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ The status on a notification is now a coloured pill.**

Follow-up to the notification card: the status line is a coloured pill instead of bold text —
the same colours used everywhere else (e.g. red for "Returned", amber for "Waiting", green for
"Approved"), so you can tell a notification's stage at a glance. Build green.

## 2026-08-24 · Mohamed's side · Claude

**✅ Notifications are now short and readable — QTN, who, project, sales, status.**

Each notification used to be two long sentences. Now it's a compact card:
the quotation number and the sales-support (owner) name in bold, the project name and the sales
person underneath in grey, then the status in bold — plus the "x ago" time. New notifications
carry this snapshot; older ones still show their original wording. Works for both LV quotations
and RMU offers. Adds one small defaulted column (Notification.detailsJson) — safe for the deploy's
db push. Verified live. Backend 291 tests + frontend 38 tests green.

## 2026-08-24 · Mohamed's side · Claude

**✅ "Check for updates" now shows a red notification count you can tick off as you read them.**

The little sentence under the button ("Up to date — version 51 · 4 added…") is gone. In its place,
the button carries a red circle with how many price changes you haven't looked at yet — like a
notifications badge. Open it and each change has a "Read" button; marking one read drops the count
by one (4 → 3 → …), and there's a "Mark all read" to clear them all at once. What you've read is
remembered on your computer, and a fresh price-list upload brings the count back for the new items.
Build green, 38 tests pass.

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
