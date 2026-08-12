# PowerLine — start here

> **For the two people who own this project.** Neither of us writes code. This file is
> written to be read by a person, not a programmer. Your Claude does the technical work;
> this tells you what the project is, how to start it, and how the two of us stay in step.
>
> Last rewritten **13 August 2026**. The version before this one was two months and about
> 130 commits out of date, which is why it was replaced.

---

## 1. What PowerLine is

An internal web app that **writes our quotations for us**. An engineer picks the options
and the app produces the finished **Technical Offer**, **Commercial Offer**, **Single-Line
Diagram** and **Material List**, ready to send. It replaced a pile of Excel configurators.

It has four parts:

| Part | Where in the app | What it does |
| --- | --- | --- |
| **LV panels** | `/lv` | Low-voltage panel and switchboard quotations. **The busiest part.** Built around numbered quotations (QTN-26-0001…) with an approval process. |
| **RMU / MV** | `/rmu` | Medium-voltage Ring Main Units — P-RAL, P-SEC and Lucy AEGIS PLUS. Produces three PDFs including the wiring diagram. |
| **P-CSS kiosks** | `/kiosks` | A 7-step selector that recommends a compact-substation design and checks everything physically fits. A tool only — it does not save or produce a document yet. |
| **Price list** | `/pricing` | Where prices are edited. Press **"Update price list & database"** and the new prices are live immediately — no waiting, no deploy. |

Plus **accounts** (everyone signs in), **permissions** (who may approve, edit prices,
see other people's quotations) and an **audit trail** of who did what.

- **Live site:** <https://powerline-chi.vercel.app>
- **Code:** <https://github.com/mohamedali-gazzar/PowerLine>

---

## 2. Getting set up on a new computer

You need three things installed: **Node.js** (version 20 or newer), **Git**, and
**Claude Code**. Then open Claude Code and say:

> *"Clone https://github.com/mohamedali-gazzar/PowerLine, set it up, and start it."*

It will do the rest. If you would rather see the commands, they are in `CLAUDE.md` §8.

**To be able to save your work back**, Mohamed must add your GitHub account as a
collaborator on the repository — GitHub → the repo → Settings → Collaborators.

Once set up, **everything works offline.** The local copy uses its own small database
on your machine and needs no passwords and no internet.

---

## 3. The one thing to understand about publishing

**Saving your work to GitHub updates the live website automatically.** There is no
separate "publish" button and no password needed. Within a couple of minutes of your
Claude pushing a change, <https://powerline-chi.vercel.app> is running it.

That is convenient and it is also the risk: a mistake reaches real users quickly. Your
Claude is instructed to build and check every change first, and to stop and ask you
before anything that could destroy data.

---

## 4. How the two of us stay in step

Our two Claude sessions cannot see each other. So we use a file: **`TEAM-LOG.md`**.

- Every time either side finishes work, their Claude writes a short plain-language note
  at the top of it and saves it to GitHub.
- Every time either side starts work, their Claude reads it first and tells you what the
  other side has been doing.

**You do not have to write in it yourself.** Just start a session by asking:

> *"What's new from the other side?"*

and end one by asking:

> *"Update the team log and push it."*

Watch for three markers in that file: **❓ QUESTION FOR …** (a decision someone needs to
make), **⛔ BLOCKED** (work that is stuck waiting on a person), and **⚠️ HEADS-UP**
(something that could affect a customer or the live site).

---

## 5. Which file is for what

You only ever need this one. The rest are for Claude.

| File | Who reads it | What it is |
| --- | --- | --- |
| **`HANDOFF.md`** | **You** | This file. |
| **`TEAM-LOG.md`** | **You** and Claude | What each side has been doing, newest first. |
| `CLAUDE.md` | Claude, automatically | The working rules — how to behave, what never to break. Same for both of us, so we get the same behaviour. |
| `ARCHITECTURE.md` | Claude | The full technical write-up of how the app works, from reading all 40,000 lines of it. **Tell your Claude to read this rather than exploring the code** — it saves about an hour every time. |
| `OPEN-ISSUES.md` | Claude, and you if curious | Known problems, worst first. |
| `DEPLOY.md` | Claude | Hosting and database setup details. |

---

## 6. Passwords and keys

There is a single file, **`HANDOFF.secrets.md`**, holding the few credentials this
project uses. It is deliberately **kept out of GitHub** so it cannot leak, which means it
does **not** arrive when you download the code.

**To get it:** ask Mohamed to hand it over directly — a USB stick, or a password manager.
**Do not** send it by e-mail or chat, and **do not** paste its contents into a message to
Claude. Keep your copy in a folder *outside* the project.

**You will probably never need it.** Normal work — running the app, changing it,
publishing it — needs no passwords at all. It only matters for looking directly at the
production database or the hosting dashboard.

---

## 7. Where the project stands (13 August 2026)

**Working and in daily use:** LV quotations with the full approval process, the Access
Center for permissions, the price list with instant publishing, RMU offers and their
three PDFs, the P-CSS selector, the ERP export, notification e-mails.

**Known faults, already diagnosed and written up** (in `CLAUDE.md` §7 — a Claude can fix
these on request without investigating again):

1. **KWHM panels are priced but print no components** on the Technical Offer, so those
   offers understate what we are supplying. *We still need to find out whether any went
   to a customer* — see the blocked item in `TEAM-LOG.md`.
2. **Some quotations open as a blank white page** instead of an error message.
3. Several money-related faults on printed offers: the commercial PDF's totals do not add
   up when a discount is applied; if the exchange-rate lookup fails, US-dollar figures can
   be printed labelled as Egyptian pounds; the wiring diagram produces a wrong drawing for
   P-RAL and Lucy products.
4. **22 items in the price list have no pole count**, so their copper costs nothing. Every
   quotation priced on the live site is slightly under-costed.

**Two things about the live site:**

- **`APP_URL` is missing** in the hosting settings. Harmless except that the "Open the
  quotation" button inside notification e-mails depends on it. Add it in Vercel →
  Settings → Environment Variables: name `APP_URL`, value exactly
  `https://powerline-chi.vercel.app` with no slash at the end.
- The Google app password used for sending e-mail **was once pasted into a chat**. It
  should be replaced: <https://myaccount.google.com/apppasswords> → delete and reissue →
  then update `SMTP_PASS` in Vercel and redeploy. **If you reissue it without updating
  Vercel, all e-mail stops.**

**Decisions waiting on us.** The audit produced 90 questions that only we can answer —
things like *is there a maximum discount before an offer needs approval*, *should the
offer include or exclude VAT*, *which exchange rate is contractual*. They are listed in
`ARCHITECTURE.md` section 12, grouped by area. Nothing is blocked on them, but each one
answered makes the app more correct.

---

## 8. Things that are easy to get wrong

- **The code on GitHub is the real project, not the folder on your computer.** In August
  one machine was found 130 commits behind — an entire month of work missing locally.
  Your Claude checks this at the start of every session.
- **Prices are frozen into each quotation on purpose.** Changing the price list does not
  change quotations already made. That is correct and deliberate — it stops a price edit
  from rewriting offers already sent to customers.
- **The Excel price sheets are gone** (12 August 2026). They had stopped affecting
  customers and had drifted two weeks behind, so editing them changed nothing. Prices are
  edited **only** on the Price list screen in the app.
- **There are no automated tests.** Every change is checked by hand, which is why the
  instruction to your Claude is always: build it, run it, look at it, then report.
