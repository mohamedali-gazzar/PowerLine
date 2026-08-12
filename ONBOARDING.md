# Welcome to PowerLine — day one

> **You are joining a project owned by two electrical engineers, neither of whom writes
> code.** If you are a person: read sections 1–4 and stop. If you are Claude: read all of
> it, then read `CLAUDE.md` and `ARCHITECTURE.md` in the repository.

---

## 1. What you are joining

**PowerLine** is Power Line Egypt's internal quotation app. An engineer picks options and
it produces the finished **Technical Offer**, **Commercial Offer**, **Single-Line Diagram**
and **Material List** — the documents that go to the customer. It replaced a set of Excel
configurators.

Four parts: **LV panels** (the busiest, with a full approval workflow), **RMU / MV**
switchgear, a **P-CSS kiosk** selector, and the **price list** that feeds them all.

- Live: <https://powerline-chi.vercel.app>
- Code: <https://github.com/mohamedali-gazzar/PowerLine>

It is small in people and large in detail: about 40,000 lines, real money on the documents
it prints, and no automated tests.

---

## 2. Getting started (about ten minutes)

Install **Node.js 20+**, **Git**, and **Claude Code**. Then open Claude Code and say:

> *"Clone https://github.com/mohamedali-gazzar/PowerLine, set it up, and start it."*

That is genuinely all. It will install everything, create a local database, start both
halves and open the app at <http://localhost:5173>.

Then say:

> *"Read CLAUDE.md and ARCHITECTURE.md, then tell me what's new in TEAM-LOG.md."*

**Two things you need from Mohamed:**

1. **Access to save your work** — he adds your GitHub username as a collaborator
   (GitHub → repo → Settings → Collaborators). Until then you can read but not publish.
2. **`HANDOFF.secrets.md`** — a small file of passwords, handed over on a USB stick or
   through a password manager, never by e-mail or chat. Keep it *outside* the project
   folder. **You will most likely never need it** — running and changing the app needs no
   passwords.

Once set up, everything works offline.

---

## 3. The two habits that make this work

**Publishing is automatic.** Saving your work to GitHub updates the live site within a
couple of minutes. There is no separate publish step. Convenient, and also why your Claude
is instructed to build and check everything first.

**We talk through a file.** Our Claude sessions cannot see each other, so `TEAM-LOG.md` in
the repository is the channel. Start a session by asking *"what's new from the other
side?"* and finish one by asking *"update the team log and push it."* Your Claude writes
the entries; you just read them.

Watch for **❓ QUESTION FOR …**, **⛔ BLOCKED** and **⚠️ HEADS-UP** markers in that file —
those are the lines that need a person.

---

## 4. Do not audit the codebase — it has been done

On 12 August 2026 the whole project was read end to end and written up in
**`ARCHITECTURE.md`** (about 1,650 lines): how every part works, the complete data model,
the permission rules, the approval workflow, the price-book mechanics, every trap, and 90
questions that need an owner's decision.

**Point your Claude at that file instead of letting it explore.** It saves roughly an hour
of work and it is more accurate than re-derived guesses.

Be aware that some older documents in the repository are wrong. Trust in this order:
**the code** → `ARCHITECTURE.md` → `CLAUDE.md` → `OPEN-ISSUES.md` → `HANDOFF.md` →
everything else. `README.md` and `DEPLOY.md` both contain out-of-date claims.

---

## 5. For Claude — the short version of the rules

The full set is in `CLAUDE.md`, which loads automatically. The ones that matter most:

**Who you are working for.** Two non-developers. Explain in plain words. Never ask them to
run a command, open dev-tools, or verify something in a browser — do it yourself and
report. Only ask them for business decisions and for credentials you must not handle.
Prefer fixing a problem over presenting a list of problems.

**Never break these:**

1. `backend/prisma/schema.prisma` is committed with `provider = "sqlite"`. The build swaps
   it to PostgreSQL on the server automatically.
2. Every deploy runs `prisma db push --accept-data-loss` on the live database, with no
   migrations and no backups. New columns must be nullable or defaulted. **Deleting a
   column deletes live customer data.**
3. A green build is the minimum bar: `npm run build` in both `backend/` and `frontend/`.
   TypeScript is strict — an unused import fails the build.
4. Never open a visible terminal window on their machine.
5. Never print or commit a secret.
6. End every reply with the local and live links.

**Traps that have already cost someone a day:**

- `frontend/src/pages/LvConfiguratorPage.tsx` contains a **NUL byte at offset 363835**, so
  ripgrep silently stops searching there — most of the project's biggest file is invisible
  to normal search. Use PowerShell `Select-String` or `rg --text` on it.
- Permissions and quotation status are enforced **on the server only**
  (`middleware/roles.ts`, `domain/qtnStatus.ts`). Never gate the UI on `user.role`.
- Async middleware without `try/catch` **hangs the request forever** under Express 4.
- Prices are deliberately frozen per quotation. Never "correct" a saved quotation to
  today's price list — that rewrites offers already sent to customers.

**Two known bugs are already diagnosed** in `CLAUDE.md` §7 — KWHM panels printing no
components while still being charged for, and quotations with no `factors` key opening as a
blank page. Fix them when asked; do not re-investigate.

---

## 6. First-day checklist

- [ ] App runs locally — `/lv` and `/rmu` both load at <http://localhost:5173>.
- [ ] Added as a GitHub collaborator, and a trivial push works.
- [ ] `HANDOFF.secrets.md` received and stored outside the project folder.
- [ ] Your Claude has read `CLAUDE.md`, `ARCHITECTURE.md` and `TEAM-LOG.md`.
- [ ] You have read `HANDOFF.md` §7 so you know what is currently broken.

Welcome aboard.

🔗 Local: <http://localhost:5173> · Online: <https://powerline-chi.vercel.app>
