# Open issues

Last reviewed: **6 August 2026**

Nothing here is a crash. These are things that are wrong, incomplete, or waiting on
a decision. Ordered by what matters most.

---

## 1. The live price list under-costs copper — 22 items

**Impact: money. Every quotation priced on the live site is affected.**

Switch fuses and several larger breakers are recorded in the price database with a
pole count of zero. Connection copper is costed as *copper per pole × poles*, so
zero poles means the copper costs nothing at all.

| Affected | Copper being missed |
| --- | --- |
| Switch Fuse 630A V / 160A V / 160A & 250A Horizontal | 0.45–1.5 kg per pole |
| T4H / T4S 320, T5H / T5S 400 & 630, T6N 630, T6S 800 | 0.9–2.25 kg per pole |
| T7H / T7S 1000, T7S 1250 | 6.75–9 kg per pole |
| Change over 3200A (3p and 4p) | **27 kg per pole** |
| Motorized Change over switch 100A 4p | 0.75 kg per pole |

Fixed in `components.json` and in the local database (published as price book v28).
**Not fixed on the live site**, which serves its own published copy.

Deploying does NOT fix this — the live site serves its own published price book.

**This is now fixable from the Price List screen** (13 Aug 2026). The importer and
its parser always accepted a **Poles** column and wrote it to the database, but that
column was in neither the export nor the template, so a *Download Current Excel →
edit → Update from Excel* round trip silently dropped pole counts and there was no
way to correct them. `Poles` has been added to both, so the round trip now carries it.

**To fix:** upload a sheet with `Item Code` + `Poles`. Leave the price cells blank —
a blank price means "no new information, never make it free"
(`pricing-lv-import.controller.ts:176`), and the same rule covers data columns, so a
zero or blank can only ever be ignored, never applied. The preview lists every pole
count it would change before anything is written.

A ready-made sheet covering all 1,100 copper-bearing components was generated on
13 Aug 2026 and handed to Mohamed. Checked against the corrected local catalogue it
reports **0 changes**, so it only moves values that are actually wrong.

Existing saved quotations keep their old values (a component stores its pole count
when it is added), so only newly added components pick up the correction.

---

## 2. The live site cannot send any e-mail

**Impact: sign-up, password reset and every workflow notification are dead.**

`SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are not set in Vercel. Note that sign-up
verification was **never** actually sending — the code shown on screen is put there
by the app itself, not delivered by e-mail. This is an old problem now made visible
rather than a new one.

**To fix:** add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, `APP_URL` and confirm `JWT_SECRET` in Vercel → Settings → Environment
Variables, then **redeploy**. Saving alone does nothing: these are read once when
the app starts.

Values and Google Workspace specifics are in `DEPLOY.md`. Verify with
`node backend/scripts/test-smtp.js`.

---

## 3. `APP_URL` is not set in Vercel

The "Open the quotation" button in notification e-mails needs the site's full web
address. The code now works it out from the request, which is correct on Vercel —
but setting `APP_URL` explicitly removes the dependency on proxy headers.

Must include `https://` and have no trailing slash.

---

## 4. The Access Center may not open on the live site

It is Admin-only, and admin status comes from the legacy `role` column
(`OWNER` → Admin). If no account on production is an owner, nobody can open the
Access Center and nobody can promote anyone — there is no way in through the app.

**To fix:** `node backend/scripts/make-admin.js <email>` with `DATABASE_URL`
pointed at production. It writes the same audit row the Access Center does.

---

## 5. Rotate the Google app password

It was pasted into a chat transcript. It can send mail as
`verification@powerline.com.eg` without 2-Step Verification — impersonation of the
company's trusted sender address is the real risk, not mailbox access.

Delete and reissue at <https://myaccount.google.com/apppasswords>, then update
`SMTP_PASS` in Vercel and `backend/.env`, and redeploy.

---

## 6. Not built for high traffic

Comfortable for a team; it would struggle under real load. In the order things
would break:

1. **E-mail is sent inside the request.** Approving waits for every recipient's mail
   to go out, one at a time, with no queue, retry or timeout. A slow mail server
   stalls approvals and eventually exceeds the serverless time limit.
2. **The whole quotation is re-saved on every keystroke** (800 ms debounce). A large
   quotation is hundreds of kilobytes per save.
3. **No paging anywhere.** LV Offers History, the user list and the audit history
   each fetch everything and filter in the browser.
4. **Reset rate limiting is per-process.** Vercel runs many instances, so the real
   limit is 5 × instance count. It blunts casual abuse only.
5. **Attachments are base64 in the database**, capped at 3 MB by Vercel's request
   limit.
6. **Some lookups scan everything** — next QTN number reads all of a user's
   quotations; finding approvers does a substring search over the user table.

The two worth doing first are moving e-mail out of the request and paging the lists.

---

## 7. Deliberate deviations from the specification

- **The audit trail records stage changes only** — created, sent for approval,
  approved, returned, submitted, withdrawn, reopened, each with who and when.
  Individual content edits are **not** logged: the configurator autosaves roughly
  once a second, so per-edit rows would be enormous and near-identical.
  *Owner decision, 6 Aug 2026 — not an oversight.*
- **Self-approval is blocked by default**, with "Approve their own QTNs" as an
  explicit per-user grant.

---

## 8. What has not been verified

- **The live site has never been checked by me.** All testing was against the local
  server and database.
- **The new screens have not been used in a browser.** The Access Center was loaded
  and confirmed to render; the home page, quotation list and notification bell were
  verified by compiling them and testing the endpoints behind them, not by clicking
  through.
