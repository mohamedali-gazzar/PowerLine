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
