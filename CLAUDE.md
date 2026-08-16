# Instructions for Claude working on PowerLine

This file is read automatically at the start of every session. Follow it exactly.
It is the same for everyone on this project, so all of us work the same way.

---

## 1. Who you are working for

**Two owners, neither of whom writes code:** Mohamed El-Gazzar (owner) and one
colleague. They are electrical engineers, not developers. This changes how you work:

- **Explain in plain words.** No jargon. Never say "the Zod schema rejects it" — say
  "the app refuses to save it, and here is why".
- **Never hand them a task you can do yourself.** Do not ask them to run a command,
  check a file, open dev-tools, or "verify in the browser". Run it, check it, and
  report what you found.
- **Only ask them for things only they can give:** a business decision (what SHOULD
  the app do), or a password/credential you must never handle yourself.
- **Solve problems rather than listing them.** If something is broken and the fix is
  clear and safe, fix it. Report afterwards.
- **Never show them a wall of options.** Recommend one thing and say why.

---

## 2. Where everything is

| What | Where |
| --- | --- |
| GitHub (the source of truth) | <https://github.com/mohamedali-gazzar/PowerLine> — branch `main` |
| Live site | <https://powerline-chi.vercel.app> |
| Deep technical reference | [`ARCHITECTURE.md`](ARCHITECTURE.md) — read this before changing anything |
| Known problems | [`OPEN-ISSUES.md`](OPEN-ISSUES.md) |
| Daily notes between the team | [`TEAM-LOG.md`](TEAM-LOG.md) — see §3 |
| Plain-language project guide | [`HANDOFF.md`](HANDOFF.md) |

**GitHub is the source of truth, never the local folder.** Always `git fetch` and
compare before you assume the local copy is current. In August 2026 a local clone was
found 130 commits behind.

`ARCHITECTURE.md` is the result of a full audit of all ~40,000 lines. **Read the
sections relevant to your task instead of re-exploring the codebase.** Section 12 lists
90 open questions that only the owners can answer — check it before inventing an answer.

---

## 3. The daily log — how the team stays in touch

Two people work on this project with separate Claude sessions that cannot see each
other. `TEAM-LOG.md` is how they stay in sync.

**At the START of every session:**
1. `git fetch` and check whether `origin/main` is ahead. If it is, pull.
2. Read `TEAM-LOG.md` (newest entry is at the top).
3. Tell your owner in one or two sentences what the other side did since last time.

**At the END of every session where you changed anything:**
1. Add a new entry at the TOP of the log, under the `<!-- NEW ENTRIES GO HERE -->`
   marker, using the template already in the file.
2. Commit and push it together with your work.

Write log entries **for a non-developer**. "Fixed the KWHM panels so the components now
appear on the printed offer" — not "patched section resolution in LcpEditor".

If the other side left a **QUESTION** or **BLOCKED** line in the log, deal with it or
answer it in your entry.

---

## 4. Hard rules — breaking these breaks the live site

1. **`backend/prisma/schema.prisma` must be committed with `provider = "sqlite"`.**
   The build swaps it to `postgresql` on Vercel automatically. Check before every commit:
   the file must say `sqlite`.
2. **Every deploy runs `prisma db push --accept-data-loss` against the real database,
   with no migrations and no backups.** Therefore:
   - any new column must be **nullable or have a default**;
   - **deleting a column deletes live customer data** — never do it without saying so
     first, in plain words, and getting a "yes";
   - never add `@default` to `LvQtn.status` (it would reset live submitted quotations
     to Draft), and never remove `LvQtn.coOwnerId` or the `submitted`/`submittedAt`
     mirror columns.
3. **A green build is the minimum bar before you claim anything is done:**
   ```
   cd backend  && npm run build     # tsc
   cd frontend && npm run build     # tsc -b && vite build
   ```
   TypeScript is strict — an unused import is an error.
4. **Never open a visible terminal window** on their machine. Run dev servers hidden
   in the background. Do not launch `start-app.bat` for them.
5. **Never print or commit a secret.** Credentials live in `HANDOFF.secrets.md`, which
   is gitignored and hand-carried between machines. Never paste one into chat, a
   commit, or a document.
6. **End every reply with:**
   `🔗 Local: http://localhost:5173 · Online: https://powerline-chi.vercel.app`

---

## 5. Pushing and deploying

**Pushing to `main` deploys to the live site automatically** — this is verified and
working. There is no separate deploy step and no token needed.

Push after each finished, building increment so the owners can see it live. Pause and
ask first only when the change could destroy data or is hard to undo (deleting a
column, deleting quotations, anything touching money already sent to a customer).

Confirm a deploy landed by comparing the live bundle against a local build:
```
curl -s https://powerline-chi.vercel.app/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js'
```
That filename must match the one in `frontend/dist/assets/` after `npm run build`.

---

## 6. Traps that have already cost someone a day

- **`frontend/src/pages/LvConfiguratorPage.tsx` contains a NUL byte at offset 363835.**
  `ripgrep` (and the Grep tool) silently stop searching there, so roughly everything
  past line 2900 in the project's biggest file is invisible to normal search. Use
  PowerShell `Select-String`, or `rg --text`, on that file.
- **Permissions and quotation status are the server's job, never the client's.**
  `accessOf()` in `backend/src/middleware/roles.ts` reads the database on every request.
  `statusWrite()` in `backend/src/domain/qtnStatus.ts` is the *only* thing allowed to
  write `status`, `submitted` or `submittedAt`.
- **Never gate the UI on `user.role`.** That column is ignored for any user the Access
  Center has touched; use the permission list.
- **Async middleware without `try/catch` hangs the request forever** under Express 4 —
  it does not return a 500. Wrap every one.
- **`LvComponent.sortIndex` order and `LvEnclosure.name` are load-bearing.** The
  combination builders find parts by description text and take the first match, so
  catalogue order is append-only and renaming an enclosure silently produces an
  unpriced row.
- **Anything `position: fixed` inside a configurator tab must be portalled to
  `document.body`**, or it is clipped.
- **Prices are frozen per quotation on purpose.** RMU offers freeze `snap*` columns;
  LV quotations copy prices into their saved state. Do not "fix" a saved quotation to
  match today's price list — that rewrites offers already sent to customers.
- **The Excel price masters were deleted on 2026-08-12.** Prices are edited only on the
  `/pricing` screen. `backend/src/data/rmu-pricing.json` is a cold-start fallback only,
  and it is behind the live price book.

---

## 7. Known bugs, already diagnosed, not yet fixed

Do not re-investigate these. Fix them when asked.

1. **KWHM panels print no components on the Technical Offer, but are still charged
   for.** A KWHM panel is created with `sections: ["KWHM"]`
   (`frontend/src/lv/store.ts:418`), but its editor creates every component with the
   section hardcoded to `"LCP"` (`LvConfiguratorPage.tsx:3501` and `:3510`). The offer
   table only renders sections that match, so it falls through to "No components."
   (`:2669`), while the cost and Material List read the components directly.
   *Root fix:* use the panel's own section instead of the literal `"LCP"`. *Also* make
   the offer table fall back to showing components when no section matches, so
   quotations already saved are repaired without a migration.
2. ~~A quotation whose saved state has no `factors` key opens as a blank white page.~~
   **FIXED 13 Aug 2026.** `normalize()` now fills the structural keys from
   `initialState()` before anything reads them — and it was wider than `factors`:
   `state.panels.forEach` and `state.project.name` threw the same way, so patching
   only `factors` would have moved the crash rather than removed it. The server is
   deliberately lenient (it stores `state ?? {}` and returns `{}` for a row it cannot
   parse), so the client copes with any of them missing. Verified against a quotation
   whose state is literally `{}`: it opens with every tab and no errors.

`OPEN-ISSUES.md` and `ARCHITECTURE.md` §10–11 carry the rest, including several that
affect money on customer paper.

---

## 8. Running it locally

Node 20+ (24.x is what it is built on) and npm.

```
cd backend  && npm install && npx prisma db push && npm run dev    # → :4000
cd frontend && npm install && npm run dev                          # → :5173
```

Local development is fully offline on SQLite (`backend/prisma/dev.db`) and needs no
passwords. Copy `backend/.env.example` to `backend/.env` on a new machine.

There is a **"Skip sign in (dev only)"** button on the login screen in development. It
signs you in as the oldest account and is stripped from the production build.

If port 4000 is stuck: kill stray `node` processes and start exactly one backend.
