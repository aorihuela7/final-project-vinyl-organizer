# Overnight build plan · v1

This file is the source of truth for the unattended overnight run. **Re-read this file and `docs/build-log.md` at the start of every turn and after any context compaction.** CLAUDE.md still applies; where the two conflict, this file wins for this run only.

## Overrides to "How we work" in CLAUDE.md (this run only)

- Don't wait for approval before each task: the owner (Ale) approved this plan and answered the kickoff questions before going to sleep. His answers are in `docs/build-log.md` under "Kickoff answers".
- Use a single branch, `v1-build`, for all work tonight, instead of one branch per session. Don't merge it.
- Write the log in English (it lives in the repo). Write the final morning message in Spanish.

## Ground rules

1. **Never stop to ask.** When a decision comes up, pick the most reversible option that fits CLAUDE.md and the kickoff answers. Write it under "Assumptions and questions for Ale" in the log: the question you would have asked, what you chose, why, and how hard it is to change. Then keep going.
2. **Needs Ale = log and move on.** If something requires the owner (an expired login, a missing environment variable, a dashboard step, an account, a payment), try once, then log it under "Blocked: needs Ale" with the exact steps he must take, and move to the next task that doesn't depend on it.
3. **Never work around a permission block.** If auto mode or a deny rule blocks an action, don't retry it and don't rephrase it to get past the block. Log it and continue with other work.
4. **Git.** Work only on `v1-build`. Never commit to `main`, push to `main`, merge a PR, force push, or rewrite pushed history. Push `v1-build` after each completed slice so the work is backed up. After the first push, open a draft PR from `v1-build` to `main` with `gh pr create --draft`, and keep its description in sync with the status board.
5. **Slices.** Small commits. `npm run test` and `npm run build` must pass before each commit. If you must save broken work, prefix the commit message with `WIP:` and log why.
6. **Secrets.** Never read or edit `.env*`, never print a secret, never write one to a file. Scripts load variables with `--env-file=.env.local`.
7. **Scope.** Build only what CLAUDE.md lists as in v1. Anything else goes under "Ideas for v2" in the log.
8. **Dependencies.** Use only the ones approved in the kickoff ("Approved dependencies" in the log). If something else seems essential, prefer a small local implementation; if it's truly needed, add it and log why.
9. **Database.** Ale approved applying migrations to the linked Supabase dev project with `supabase db push`. It's a new, empty class project with no real users. Never reset or drop the database or delete anything in the dashboard; every schema change goes through a new migration file.
10. **No deploys tonight.** Vercel isn't connected yet. Don't run the Vercel CLI. Prepare the morning instructions instead.
11. **Don't end a turn to report progress.** The log is the report. Update it after every slice, with a timestamp from `date`.
12. **Stuck rule.** If a task makes no progress for about 45 minutes, log what you tried and what you suspect, mark it Blocked, and move on.

## Phases

Work in this order. Mark each one in the log's status board as Todo, Doing, Done, or Blocked, with the evidence for Done (command and result).

### Phase 1 · Discogs spike

- `scripts/discogs-spike.ts`, run with `npx tsx --env-file=.env.local scripts/discogs-spike.ts`, against the Discogs username given in the kickoff answers. It fetches page 1 of the public collection (per_page=100), prints counts and pages, prints for 3 records the artists, title, year, labels, genres, styles, formats, cover_image, thumb, instance_id, and date_added, prints the rate-limit headers, runs one `/database/search` query, and repeats the collection call without a token to compare. It never prints the token.
- Write the findings to `docs/discogs-notes.md`: the fields we'll use for the sort key, edge cases seen (artist suffixes like "(2)", multiple artists, missing genre or cover), whether image URLs arrive without auth, and the import risks.
- **Done when:** the script runs and the notes file exists.

### Phase 2 · Skeleton

- Next.js (current stable, App Router, strict TypeScript, Tailwind) in the repo root. The folder isn't empty, so scaffold without deleting or overwriting `CLAUDE.md`, `.claude/`, `docs/`, or `.gitignore` (merge `.gitignore` entries instead of replacing it).
- Clerk auth and Supabase clients exactly as the "Auth" section of CLAUDE.md says.
- Landing page: the one-line pitch, "Sign up", and "Try the demo collection".
- Footer with the Discogs non-affiliation notice, copied verbatim from the API Terms of Use. If you can't fetch the terms page, leave a clearly marked TODO, log it as Blocked, and don't invent the wording.
- `/api/cron/keepalive` protected with `CRON_SECRET`, plus `vercel.json` with a daily cron.
- Design tokens file, Vitest with the `test` script, and a README (what it is, how to run it, how to try the demo, the Discogs notice).
- **Done when:** `npm run build` passes, and with `npm run dev` the home page and the sign-up page render (check with curl or Playwright).

### Phase 3 · Schema, RLS, and import

- Migrations for the data model in CLAUDE.md, with Clerk user IDs (text, defaulting to `auth.jwt()->>'sub'`), RLS on every table, and whatever grants the Data API needs on this new project. Apply them with `supabase db push`.
- Prove that one user can't read or change another user's rows. Prefer an automated test (for example, two Clerk test users, or SQL with simulated JWT claims). If that isn't feasible tonight, write the manual test steps for Ale in the log and mark this item Blocked.
- Import as described in "Import and freshness" in CLAUDE.md: the username form (zod), `import_jobs`, the step route, the progress UI, resume after closing the tab, the sweep, re-sync after 6 hours, the rate-limit handling, and one active job per user. The demo goes through the same path, with the source from the kickoff answers.
- **Done when:** importing the demo source finishes, and the record count matches the count Discogs reports (log both numbers).

### Phase 4 · Layout algorithm

- `src/lib/layout`, pure TypeScript. Write the Vitest tests first, one or more per rule and invariant in CLAUDE.md, including: "The Beatles" with and without ignoring articles, "Nirvana (2)", a record with two artists, a record with no genre, a Kallax 4×4 with two blocked compartments traversed by rows and by columns, a three-compartment overflow cascade, a calibration, a collection that doesn't fit, and a timing test (3,000 records in 40 compartments in under 100 ms). Then write the code until they pass.
- `docs/algorithm.md`: a plain explanation of the initial layout, insertion, and calibration, with a worked 10-record example. Ale has to defend this in class, so write it for him.
- **Done when:** all tests pass and the doc exists.

### Phase 5 · Shelf configurator and sort order

- A form with a live preview (no drag and drop): template, name, rows, columns, default capacity, traversal by rows or columns; tapping a compartment in the preview toggles blocked. Multiple shelves, reordered with arrows. Sort order with up to 3 levels, an "Ignore articles" checkbox, and slack in %.
- "Generate map" runs the initial layout, persists `placements`, and records a `layout_event`. If a map already exists, it asks for confirmation and says how many records change compartment.
- The demo gets the prebuilt shelves from CLAUDE.md with no setup.
- Mobile first.
- **Done when:** you can create a shelf in the UI, generate a map, and see the placements in the database; and a demo user gets the prebuilt shelves automatically.

### Phase 6 · Map, compartment view, record card, search

- Map: each shelf as a grid; each compartment shows its abbreviated range and a fill bar; blocked compartments are shaded.
- Compartment view: spines in order, as typographic strips (see "Covers and design" in CLAUDE.md). Tapping a spine opens the record card: cover, artist, title, year, format, label, and "Data provided by Discogs" linking to the release.
- Instant search over the user's collection, ignoring accents and case. The result shows the shelf, row, column, and "% from the left", two neighbors on each side with covers, and highlights the compartment on the map.
- Covers use `<img loading="lazy">` straight from the Discogs URL, with the placeholder when a cover is missing.
- **Done when:** with the demo collection, searching a known record shows its location and its neighbors.

### Phase 7 · If-time features

Only the ones marked "yes" in the Decisions log of CLAUDE.md, in this order:

- Calibration: "This is the first record in this compartment", choosing the record through search.
- "Where does this record go?": Discogs search through a server route (debounced, rate-limited per user). It shows the compartment, the neighbors, and whether it fits; if it doesn't fit, the list of moves from the naive method. "Add" saves the record, its placement, and a `layout_event`.

### Phase 8 · Self-test as a new user

- Playwright end-to-end test of the core task on the local dev server: sign up, load the demo, set up a shelf (or use the demo shelves), search for a record, see its location. Run it at desktop and mobile sizes. For sign-up, use Clerk's documented testing approach for development instances rather than a real inbox.
- Save a few screenshots to `docs/screenshots/`.
- Write a list of every place a new person would get stuck, ordered by severity, in the log. Fix the small ones; log the rest.

### Phase 9 · Hardening and polish

Only after phases 1 to 8 are Done or Blocked:

- Empty, loading, and error states on every screen; basic accessibility (labels, focus order, contrast); mobile layout.
- A security self-review of the whole diff between `main` and `v1-build`: secrets, `NEXT_PUBLIC_` variables, RLS, input validation, rate limits on routes that call Discogs. Write the findings in the log and fix what you can. This doesn't replace the `/security-review` Ale will run in the morning.
- README complete.

### Phase 10 · Morning summary

Fill in "Morning summary" in the log and end with a final message in Spanish, using the format below.

## Morning summary format

1. What works end to end, and the exact commands to try it locally.
2. What's blocked and what Ale must do, in order, with exact steps.
3. Questions waiting for Ale, numbered, each with the assumption you took and how hard it is to change.
4. Steps to connect Vercel: what to click, the framework preset, and the list of environment variable names (never their values).
5. What to review first in the PR (files and why), and where the algorithm explanation is.
6. Final results of `npm run test` and `npm run build`, and the PR link.

## `docs/build-log.md` template

Create it during the kickoff with these sections:

- Kickoff answers
- Approved dependencies
- Status board (phases 1 to 10, with status and evidence)
- Assumptions and questions for Ale
- Blocked: needs Ale
- Ideas for v2
- Timeline (timestamped entries)
- Morning summary
