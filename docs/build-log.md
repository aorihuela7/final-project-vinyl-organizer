# Build log · v1 overnight run

Branch: `v1-build`. Plan: `docs/build-plan.md`. Times are local (CST).

## Kickoff answers

Ale answered these on 2026-11-14 before the run. Numbers match the kickoff questions.

1. **Calibration ("This is the first record in this compartment") in v1:** yes. Build it only after phases 1 to 6 are Done.
2. **"Where does this record go?" in v1:** yes, after calibration.
3. **Formats:** Ale wants vinyl and CDs handled separately. Interpretation (Ale didn't object): every shelf (furniture) has a `media` field, `vinyl` or `cd`. Vinyl records flow only through vinyl shelves and CDs only through CD shelves, each group with its own traversal and map, using the same sort settings. A user with only vinyl shelves is effectively in "vinyl mode". Other formats (cassette, box set without vinyl or CD, file…) are imported but not placed; the app shows how many there are. Default capacity of a cube holding CDs: 60 (unmeasured). A separate sort order per media is a v2 idea.
4. **Furniture templates:** the six in CLAUDE.md (Kallax 4×4, Kallax 5×5, low unit 2×4, tower 1×5, crates in a row, custom). No others.
5. **Capacity and slack:** 80 records per cube (Kallax, low unit, tower), 70 per crate, 10% global slack. All unmeasured, all editable.
6. **Demo source and spike user:** Discogs user `aorihuelar` (public collection, 1,704 items on 2026-11-14). The demo uses only part of it: the 1,000 most recently added records (10 pages of 100, sorted by date added, newest first), imported through the same path as any username import, with a page cap. The Phase 1 spike uses the same username. The Phase 3 count check imports the full collection for a regular test user (expect 1,704) and checks the demo separately (expect 1,000).
7. **No login wall (option A):** the app opens without asking for a session. "Try the demo" works fully without an account: shelf setup, map generation, search, calibration, and "Where does this record go?" all run in the browser with the same algorithm, with a "Sign up to save" banner; on sign-up, what the user built is saved to their account. "Import from Discogs" lets the user type their username without an account, then asks them to sign up right before the import starts, because the resumable import lives in the database. Sign in / Sign up buttons sit at the top without blocking anything. Out of v1: CSV import and manual entry (v2). In v1, single records are added through "Where does this record go?" + Add.
8. **Default sort order for new users:** Artist only (fixed tiebreakers make it artist → year → title), with "Ignore articles" on by default.
9. **Clerk sign-in:** email + password, no email verification. Ale also left Google enabled in the Clerk dashboard, so it stays.
10. **Clerk test users:** allowed. Create them in the development instance with `+clerk_test` emails and keep them; list them here.
11. **Dependencies:** the full list was approved (see below).
12. **App name:** keep "Record Organizer" for now, in a single constant.
13. **Design:** neutral warm-gray background, burnt-orange accent `#C2410C`, Inter. All in one design-tokens file.
14. **Writing to CLAUDE.md:** allowed: fill in the Decisions log and the demo placeholders on `v1-build`.
15. **Discogs non-affiliation notice (exact text, from Ale):** "This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs. 'Discogs' is a trademark of Zink Media, LLC."
16. **"Data provided by Discogs":** a link to the release page on every record card, search result, and neighbor; one line per screen on the map and the compartment view.
17. **Stale data during re-sync:** show the data with an "Updating…" notice while the re-sync runs.
18. **Records added through "Where does this record go?":** the end-of-sync sweep never deletes them; each re-sync refreshes them with `/releases/{id}` so they also meet the 6-hour rule.
19. **Inactive users' data:** no automatic purge tonight; explain it in the README and log it as a v2 idea.
20. **Screenshots:** keep them local in `docs/screenshots/`, ignored by git (the repo is public and screenshots would contain copies of covers).

Setup confirmed by Ale before the run:

- Supabase CLI 3.1.0 installed and logged in; `supabase init` and `supabase link --project-ref qgykrierhdpmpyeoxquw` done; `supabase db push --linked --dry-run` ran without a password ("Remote database is up to date"). `--linked` is deprecated, so the run uses `--remote`.
- Clerk ↔ Supabase third-party auth connected; Data API checked.
- Clerk: development instance; email + password without verification; Google enabled.
- All seven environment variables are set (checked by Ale; values never shown).
- `.claude/settings.local.json` created with allow rules for `npx tsx --env-file=.env.local scripts/*` and `supabase migration list*`.
- Charger connected; this session kept open; `caffeinate -i -w <claude pid>` running.

## Approved dependencies

- Runtime: `next`, `react`, `react-dom`, `@clerk/nextjs`, `@supabase/supabase-js`, `zod`.
- Dev: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `eslint`, `eslint-config-next`, `vitest`, `tsx`, `@playwright/test`, `@clerk/testing`.
- Not used on purpose: `@supabase/ssr` (Clerk owns the session), dotenv (Node's `--env-file`), component or icon libraries, the Supabase CLI as an npm package (it's installed with Homebrew).

## Status board

| Phase | Status | Evidence |
| --- | --- | --- |
| 1 · Discogs spike | Done | `npx tsx --env-file=.env.local scripts/discogs-spike.ts` → exit 0: 1,704 items in 18 pages, limit 60 with token / 25 without, covers load without auth (200 image/jpeg), search returned 1,053 results. Notes in `docs/discogs-notes.md`. |
| 2 · Skeleton | Done | `npm run build` → exit 0 (Next 16.4.6, Cache Components on). `npm run dev` + `npx playwright test e2e/smoke.spec.ts` → 4 passed (home shows pitch, "Try the demo collection", and the Discogs notice; `/sign-up` renders Clerk's email + password form; desktop and mobile). `curl /api/cron/keepalive` without the secret → 401. |
| 3 · Schema, RLS, and import | Done | Migration `20261115012019_init_schema.sql` applied with `supabase db push --remote --yes` (exit 0). `npm run test:rls` → 16/16 PASS with two Clerk test users and real session tokens (B can't read, update, delete, spoof, or reference A's rows; anon can't read tables). `npm run check:import` (dev server running) → PASS full import 1,704 stored = 1,704 reported by Discogs (26 s); PASS demo 1,000 = 1,000 (13 s); PASS resume returns the same active job at next_page 3; PASS re-sync idempotent (1,704). In the browser (`npx playwright test e2e/flows.spec.ts`, all PASS): an import resumes after the tab is closed and finishes at 1,704; data older than 6 hours shows \"Updating from Discogs…\" and `last_synced_at` is refreshed. Progress UI shown during the import in `e2e/core-task.spec.ts`. |
| 4 · Layout algorithm | Done | `npm run test` → exit 0, 54 tests in 6 files (sort key, normalization, traversal, initial layout with both invariants for 0–60 records, slack reduced, overflow, vinyl/CD/other, cascade across three compartments, overflow off the end, 200 random insertions, calibration, position, neighbors, ranges, and 3,000 records in 40 compartments under 100 ms). `docs/algorithm.md` written, with a 10-record worked example generated by the real code. |
| 5 · Shelf configurator and sort order | Done | `e2e/core-task.spec.ts` (PASS): a new user builds shelves from the suggested Kallax templates, blocks a compartment by tapping it, switches one shelf to columns, picks genre → artist, and generates the map with a confirmation. `npx tsx --env-file=.env.local scripts/db-check.ts` afterwards: that user has 3 shelves, 48 compartments, 1 blocked, 1,698 placements (1,704 records minus 6 cassettes/files), and one `initial` layout event. A demo user gets "Living room" (Kallax 4×4, 2 blocked) and "Studio" (tower 1×5, CDs) automatically: 998 placements, `initial:998`. Changing an existing map asks for confirmation with the number of records that change compartment (`e2e/flows.spec.ts`). |
| 6 · Map, compartment view, record card, search | Done | `e2e/demo.spec.ts` (PASS, desktop and mobile): with the demo, searching a known record shows shelf, row, column, "% from the left", two neighbors on each side with covers, the "Data provided by Discogs" link to the release; "Show on the map" highlights the compartment; tapping it shows the spines left to right. Covers load from `i.discogs.com` with `<img loading="lazy">` (checked `naturalWidth > 0`). Screenshots in `docs/screenshots/` (local only). |
| 7 · If-time features | Done | Both were marked yes. Calibration: `e2e/core-task.spec.ts` (PASS) opens a compartment, picks the last record of the previous one through search, and the count goes up by one; event `calibrate:1` stored. "Where does this record go?": Discogs search through `/api/discogs/search` (debounced 450 ms, 30 per minute per user, 15 per IP without an account), shows compartment, neighbors, and whether it fits, with the list of moves if it doesn't; "Add" saves the record (`origin = added`), its placement, and an `insert` event (`insert:1` in the DB check); after a reload the search finds it on the shelf. |
| 8 · Self-test as a new user | Done | `npx playwright test` → 15 passed, 5 skipped on purpose (heavy flows run on one size only), exit 0. Desktop: sign up from the landing page's username form, import 1,704 records, build the shelf from templates (block a compartment, columns traversal, genre → artist), generate the map, search "Faith George Michael" and see shelf, row, column, %, neighbors; reload keeps the map. Desktop and mobile: sign up, load the demo into the account, calibrate, add Kind of Blue. Plus: demo without an account, saving it on sign-up, resume after closing the tab, 6-hour re-sync, and a mistyped username (mobile). Sign-up uses `@clerk/testing` (testing token) and `+clerk_test` emails. Screenshots in `docs/screenshots/` (local, git-ignored). Stuck points below. |
| 9 · Hardening and polish | Done | States: loading, onboarding (with the import error and the username filled in), import progress, error with retry, empty compartments, no search results, no shelves, records that don't fit, an `error.tsx` for the app screen, and a `not-found.tsx`. Accessibility: every input labeled, focus kept inside dialogs (Tab cycles, Escape closes, focus returns), view switcher with `aria-pressed`, map cells with full `aria-label`s, `ink-faint` darkened from 3.45:1 to 6.17:1 (all text tokens ≥ 4.5:1, computed). Security self-review below; fixes applied and covered by `npm run test:rls` (17/17 PASS). README complete. After the changes: `npm run test` exit 0, `npm run lint` exit 0, `npm run build` exit 0, `npx playwright test` (clean run, dev server alone) → 15 passed, 5 skipped on purpose, exit 0. |
| 10 · Morning summary | Done | "Morning summary" below; final message to Ale in Spanish. Last commit on `v1-build`: `npm run test` exit 0 (64 tests), `npm run build` exit 0. |

## Assumptions and questions for Ale

Format: question · what I chose · why · how hard it is to change.

- **Media of the demo shelves.** Ale's collection is 1,367 vinyl and 327 CDs. Q: which demo shelf holds CDs? · Chose: "Living room" Kallax 4×4 holds vinyl, "Studio" tower 1×5 holds CDs, so the demo shows both maps. · Why: CLAUDE.md fixes the two demo shelves, and this way the 1,000-record demo places almost everything. · Easy to change: one field in the demo seed.
- **Which format decides the shelf.** Q: how to classify box sets and vinyl+CD editions? · Chose: the first format named Vinyl/Shellac/Flexi-disc → vinyl; the first named CD/CDr → CD; otherwise not placed. · Why: matches what is physically in the sleeve in most cases. · Easy: one function.
- **Records without a year (210 of 1,704).** Chose: they sort after all known years and show "—". · Easy.

- **Tailwind integration package.** The approved list named `@tailwindcss/postcss`, but `create-next-app` 16.4.6 now scaffolds `@tailwindcss/turbopack` (same Tailwind, loaded by Turbopack instead of PostCSS). · Chose: keep the scaffold default. · Why: it's the supported default for this Next version; no new capability. · Easy: swap the package and the `turbopack.rules` entry in `next.config.ts`.
- **`@types/node` version.** Vitest 5 needs `@types/node` ≥ 22, so it's `^24` (matches Node 24) instead of the scaffold's `^20`. · Trivial.
- **Cache Components.** Next 16.4 turns on `cacheComponents` by default. · Chose: keep it; pages are static shells, and session-dependent UI is client-side (Clerk hooks) or in route handlers. · Why: avoids fighting the framework default. · Medium to change.
- **Clerk Core 3.** `<SignedIn>`/`<SignedOut>` were removed in `@clerk/nextjs` 7; the header uses the `useAuth()` hook in a client component instead of the server `<Show>` (which would make every page dynamic). · Easy.
- **Header buttons open Clerk in a modal**; the `/sign-in` and `/sign-up` pages also exist for direct links. · Easy.

- **`supabase db push` needs `--yes` in agent mode.** The CLI refuses to apply migrations without an interactive confirmation and suggests `--yes`. · Chose: use `--yes`, because the plan (rule 9) approves applying migrations to this project. · Not a permission workaround: it's the CLI's own confirmation flag.
- **Demo for visitors without an account is cached on the server** (`/api/demo`, `use cache`, revalidate 1 h, expire 2 h) so the shared Discogs limit survives a busy demo. The browser refetches when its copy is older than 6 hours. · Why: 10 Discogs requests per anonymous visit would drain the 60/min limit at the fair. · Easy to change in `src/app/api/demo/route.ts`. Terms question for Ale: is a ≤ 2 h server cache acceptable under "don't store longer than necessary"? I think yes, since the 6-hour freshness rule still holds.
- **Import order.** A full import reads the collection sorted by date added, ascending, so records added mid-import land at the end and don't shift earlier pages. The demo reads newest first. · Easy.
- **Test users created in Clerk (development instance):** `rls-a+clerk_test@example.com`, `rls-b+clerk_test@example.com`, `import-check+clerk_test@example.com`, `demo-check+clerk_test@example.com`, `replace-check+clerk_test@example.com` (no passwords; sessions come from the Backend API), plus one `e2e-…+clerk_test@example.com` user per Playwright run (about 25 tonight). Their rows in Supabase are test data. All can be deleted from the Clerk dashboard (Users, filter by "clerk_test").

- **Articles apply to artist and title, not to label or genre.** · Why: that's how most shelves file "The Beatles" and "The Wall". · Easy: one line in `sort.ts`.
- **Article list:** The, A, An, El, La, Los, Las, Le, Les, L' (CLAUDE.md's list plus the French elision). Not added: Die, Der, Das, Il, I, O, Un, Una, because they collide with real names ("I Am Kloot", "O Rappa"). · Easy: `DEFAULT_ARTICLES` in `normalize.ts`.
- **Range labels** cut each end to the shortest prefix that differs from the neighboring compartment; a compartment inside one first-level group shows the group ("Jazz · M – N"). · Easy.
- **Calibration only accepts a record from the compartment or the one right before it** (anything else would move more than one boundary). · Medium: a more general calibration is a v2 idea.
- **When the collection fits only by eating the slack**, the layout spreads proportionally to the real capacity and tells the user the slack was reduced. · Easy.

- **Supabase CLI and stdin.** `supabase migration new` waits for SQL on stdin when it isn't a terminal and hung once; every CLI call now runs with `</dev/null`. No effect on the database.
- **Placement removals.** A second migration (`20261115013717_placements_removals.sql`) lets `apply_placements` also remove placements (a record pushed off the end of the shelf).
- **Switching from the demo to your own collection** (or any re-sync where most records are new and there's room) lays the shelf out again instead of inserting 1,700 records one by one; a collection that simply doesn't fit never triggers it, so calibrations aren't thrown away. · Medium.
- **New records after a re-sync** are placed with the naive insertion; a record whose insertion would push another off the shelf is left unplaced and reported instead. · Easy.
- **Spines are horizontal strips stacked top to bottom (reading "left → right")** instead of vertical strips, because 60–80 vertical spines don't fit on a phone. · Easy to change in `compartment-sheet.tsx`.
- **Search covers artist, title, label, and year**, accent- and case-insensitive. · Easy.

### Where a new person would get stuck (Phase 8), most severe first

1. **Fixed: a failed import left you on an empty shelf.** A mistyped username or a private collection ended on "Build your shelf · 0 records imported" with no way to retry. Now you go back to the start screen with the reason ("We couldn't find the Discogs user…", or how to make the collection public) and the username filled in. Covered by an e2e test.
2. **Fixed: a demo user whose shelves weren't built yet skipped the 6-hour re-sync.** Covered by an e2e test.
3. **Logged: there's no "change my Discogs username" button after a successful import.** It works by typing a new username in the landing page form while signed in (it imports and lays the shelf out again), but nobody will find that. Proposed: a small "Collection" section in "Shelves & order". Needs your call.
4. **Logged: capacities are unmeasured (80 per cube, 70 per crate, 60 CDs).** Until someone calibrates, the map can drift from the real shelf. The calibration entry point is the button "The first record here is different…" inside a compartment; worth watching in user tests whether people find it.
5. **Logged: compartment labels are small (11 px) on phones with 4+ columns**, and long genres ("Folk, World, & Country") get cut after three lines. Readable, but tight.
6. **Fixed: the sort summary showed internal names** ("genre → artist"); now "Genre → Artist".
7. **Logged: "Sign in" / "Sign up" appear in the header only after Clerk loads** (under a second); the space is empty before.
8. **Logged: a record that isn't on Discogs can't be added** (no manual entry in v1).
9. **Logged: Google sign-in is enabled in Clerk but not covered by the automated tests.**
10. **Dev only:** the Next.js dev indicator (bottom-left "N") overlaps content in screenshots; it doesn't exist in production builds.

### Security self-review (Phase 9), diff `main...v1-build`

Checked:

- **Secrets.** No `.env*` or key files are tracked; `git grep` finds no key values. Server secrets (`CLERK_SECRET_KEY`, `DISCOGS_TOKEN`, `DISCOGS_USER_AGENT`, `CRON_SECRET`) are read only in route handlers and server modules; `src/lib/discogs/client.ts` throws if it's ever bundled for the browser. The built client chunks contain no key values (they only mention variable names inside library code).
- **Public variables.** Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, all public by design.
- **RLS.** Enabled on all 8 tables, with explicit grants (anon: none; authenticated: CRUD limited by policies on `(select auth.jwt()->>'sub') = user_id`). Composite foreign keys stop a row from pointing at another user's rows. All functions are `security invoker` with an empty `search_path`, and `execute` is revoked from `public`. Proven by `npm run test:rls`.
- **Input validation.** zod on every route with input: import start (username regex), import step (uuid), Discogs search (2–120 chars), release (positive integer). `/api/demo` takes no input; the cron route checks `CRON_SECRET` with a timing-safe comparison.
- **Rate limits on routes that call Discogs.** Search and release: 30/min per user, 15/min per IP without an account. Demo: 20/min per IP, plus a server cache. Import: 10 starts/min and 120 steps/min per user. Every Discogs call reads `X-Discogs-Ratelimit-Remaining` and backs off on 429.

Fixed tonight:

- A user could store a `javascript:` link or a tracking-pixel "cover" in a record they add by hand (self-XSS only, since RLS keeps it in their own account). Now the database rejects non-Discogs links and covers (migration `20261115020557_record_data_checks.sql`, checked by the RLS test), and release links are built from the release id.
- Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`; the `X-Powered-By` header is off.

Open, for Ale (not fixed):

1. **Anonymous routes use the shared Discogs token** (`/api/demo`, `/api/discogs/search`, `/api/discogs/release`). Per-IP limits and the cache soften it, but many IPs at once could drain the app's 60/min. If that's a worry for the fair, "Where does this record go?" could require an account.
2. **The rate limits live in memory, per server instance.** Good enough for a class project; a shared store would mean a new service (not allowed in v1).
3. **No Content-Security-Policy.** Clerk's scripts need a tuned policy; worth doing in v2 with Clerk's CSP guide.
4. **Deleting a Clerk account doesn't delete its Supabase rows.** Needs a Clerk webhook (v2).
5. **Some database error messages reach the browser** on import failures. Minor information leak.

- **Dev-server note:** running `npm run build` while `npm run dev` is running made the dev page reload in a loop once; the e2e test that hit it passed on a rerun. Run e2e tests with the dev server alone.

- **Records added by hand in the browser demo are carried into the account on sign-up:** they're inserted first (as `origin = added`), then the shelves, sort order, calibrations, and placements are saved in one transaction. If the save fails halfway, those added records stay in the account without a placement and get placed by insertion on the next visit.

### Independent code review (after Phase 9)

A separate reviewer read the state machine, the import service, the RPCs, and the algorithm without my notes. It found 10 issues; all are fixed and covered by tests:

1. **High:** several insertions in a row could send the same record twice to `apply_placements`, which Postgres rejects, and the app could get stuck in an error on every load. Fixed: moves are collapsed per record (`collapseMoves`, unit-tested), the RPC gets one row per record from the final placement, and a failure placing new records after a sync shows a notice instead of blocking the app.
2. **High:** in the browser demo, the 6-hour refresh could overwrite a calibration or an added record made while it was fetching. Fixed: the refresh merges into what's saved at that moment.
3. **Medium:** records added in the browser demo were dropped at sign-up. Fixed (see above), covered by `e2e/flows.spec.ts`.
4. **Medium:** leaving the page mid-import could build the demo shelves from a partial import. Fixed: shelves are built only after a job that finished.
5. **Medium:** if saving a new record's placement failed, the record stayed without a placement, and Add again made a duplicate. Fixed: the row is removed on failure.
6. **Low-medium:** a new first record could push one off the shelf while an earlier compartment was empty. Fixed in `insert.ts`: it uses an empty compartment between prev's and next's (or before next's for a new first record). Unit-tested; `docs/algorithm.md` updated; the worked example gives the same numbers.
7. **Low-medium:** if a record was removed on Discogs mid-import, later records could shift into an already-read page and be swept by mistake. Fixed: the sweep runs only when the job saw at least as many records as Discogs reports.
8. **Low:** typing a new username while another import was active was ignored. Fixed: a different collection retires the active job (`npm run check:import` now checks it: PASS).
9. **Low:** a failed calibration showed no message. Fixed.
10. **Low:** generating the map right after a background sync could fail with a raw foreign-key error. Fixed: it reloads the records first.

After the fixes: `npm run test` → 64 tests in 8 files, exit 0; `npm run lint` exit 0; `npm run test:rls` 17/17 PASS; `npm run check:import` 5/5 PASS; `npx playwright test` → 15 passed, 5 skipped on purpose, exit 0.

## Blocked: needs Ale

Nothing is blocked. Everything that needed Ale was done before the run (CLI logins, linking, Clerk ↔ Supabase). What's left for Ale is in the morning summary: review, `/security-review`, and connecting Vercel.

## Ideas for v2

- Minimum-move insertion (the v2 algorithm), measured against tonight's naive method with the `layout_events` baseline and a purchase simulator.
- A "Collection" section to change the Discogs username or go back to the demo (stuck point 3).
- A separate sort order per media (vinyl vs. CDs).
- A more general calibration (any record, any compartment) and calibration by count ("74 fit here").
- Automatic purge of Discogs data for users who haven't opened the app in N days; delete Supabase rows when a Clerk account is deleted (Clerk webhook).
- A Content-Security-Policy tuned for Clerk; rate limits in a shared store.
- CSV import and manual entry.

## Timeline

- 2026-11-14 19:09 · Kickoff. Branch `v1-build` created from `main` (7308bc4). Log created with Ale's answers.

- 2026-11-14 19:12 · Phase 1 Done. Spike ran against `aorihuelar`; notes written.
- 2026-11-14 19:18 · Phase 2 Done. Next.js skeleton, Clerk, landing page, footer notice, keepalive cron, tokens, Vitest, Playwright smoke test, README.
- 2026-11-14 19:28 · Phase 3 backend done: schema, RLS, grants, RPCs, import routes, demo route. RLS and import checks pass.
- 2026-11-14 19:30 · Phase 4 started: tests first.
- 2026-11-14 19:36 · Phase 4 Done. 54 tests pass; `docs/algorithm.md` written.
- 2026-11-14 19:59 · Phases 3, 5, 6, 7 Done: app shell, configurator, map, compartment view, record card, search, calibration, add-record. All e2e tests pass on desktop and mobile.
- 2026-11-14 20:04 · Phase 8 Done. 15 e2e tests pass; stuck points listed; two of them fixed.
- 2026-11-14 20:16 · Phase 9 Done: states, accessibility, security review and fixes, README.
- 2026-11-14 20:32 · Independent review: 10 findings, all fixed with tests. Demo-added records now carry over on sign-up.
- 2026-11-14 22:09 · Phase 10 Done: morning summary written; PR description synced.

## Morning summary

### 1. What works end to end

All ten phases are Done. A new person can, without help:

- open the app with no login wall and try the demo (1,000 real records on "Living room", a Kallax 4×4 with two blocked cubes, and "Studio", a 1×5 tower for CDs), then sign up to save it;
- or type a Discogs username, sign up (email + password, no verification; Google also on), and watch the import run in steps (1,704 records in about 25 s; it resumes if the tab closes);
- build shelves from the six templates (rows, columns, blocked compartments by tapping, capacity per shelf and per compartment, rows or columns, vinyl or CDs, several shelves reordered with arrows) and pick up to three sort levels, articles, and slack;
- see the map (ranges like "A – Bea", fill bars, blocked cubes shaded), open a compartment (spines left to right, colored by the first level), open a record card (cover, data, "Data provided by Discogs");
- search a record and see shelf, row, column, "% from the left", and the two neighbors on each side;
- calibrate ("The first record here is different…") and ask "Where does this record go?" with Discogs search, the moves, and Add.

Data older than 6 hours is refreshed with "Updating from Discogs…". RLS is proven with two accounts.

Try it locally:

```bash
cd ~/final-project-vinyl-organizer
git checkout v1-build
npm install
npm run dev                 # open http://localhost:3000 → "Try the demo collection"
npm run test                # 64 unit tests
npm run test:rls            # 17 RLS checks with two Clerk test users
npm run check:import        # with npm run dev running: full import, demo, resume, re-sync, job replacement
npx playwright test         # with npm run dev running: 15 end-to-end tests, desktop and mobile
```

### 2. Blocked, and what Ale must do

Nothing is blocked. In order:

1. Review the draft PR (#1) and run `/security-review` on `v1-build` against `main`.
2. Connect Vercel (section 4) and try the deployed demo on your phone.
3. Answer the questions in section 3 (all have a working default).
4. Optional: delete the `…+clerk_test@example.com` users in the Clerk dashboard.
5. Measure a real cube (records per Kallax cube, per crate, CDs per cube) and update the defaults in `src/lib/shelf/templates.ts` and CLAUDE.md.

### 3. Questions for Ale (assumption taken · how hard to change)

1. **Vinyl and CDs:** each shelf holds vinyl or CDs, and both use the same sort order. · Medium.
2. **Demo shelves:** "Studio" (tower 1×5) holds the demo's CDs. · Easy.
3. **Discogs terms:** the anonymous demo is cached on the server for at most 2 hours and kept in the browser up to 6 hours. Is that "not longer than necessary"? · Easy.
4. **Anonymous "Where does this record go?"** uses the app's Discogs token (limited per IP). Should it require an account for the fair? · Easy.
5. **Change collection:** there's no visible way to switch Discogs username after importing. Add a "Collection" section? · Easy.
6. **Insertion edge cases:** besides CLAUDE.md's rule, an empty compartment between the neighbors (or before the first one) takes the new record instead of cascading. OK to keep in the naive baseline? · Easy.
7. **Articles:** The, A, An, El, La, Los, Las, Le, Les, L', applied to artist and title only. · Easy.
8. **Spines:** horizontal strips stacked "left → right", because vertical ones don't fit on a phone. · Easy.
9. **Calibration:** only with a record from that compartment or the previous one. · Medium.
10. **Re-sync with mostly new records** (e.g., demo → own collection) lays the shelf out again instead of inserting one by one. · Medium.
11. **Tailwind package:** `@tailwindcss/turbopack` (scaffold default) instead of the approved `@tailwindcss/postcss`. · Easy.

### 4. Connect Vercel

1. Go to https://vercel.com/new → **Import Git Repository** → `aorihuela7/final-project-vinyl-organizer` (allow the GitHub app if asked).
2. **Framework Preset: Next.js** (auto-detected). Root Directory `./`. Leave Build, Install, and Output at their defaults.
3. **Environment Variables** (Production and Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DISCOGS_TOKEN`, `DISCOGS_USER_AGENT`, `CRON_SECRET`.
4. **Deploy.** Production builds from `main`, so until the PR is merged, `v1-build` gets a Preview URL (Deployments tab). Merge the PR when you're happy for the production URL.
5. Settings → General → **Node.js Version: 24.x**.
6. Settings → **Cron Jobs**: `/api/cron/keepalive` should appear, daily (it runs on production deployments only).
7. Check: open the URL → "Try the demo collection"; sign up; then `curl -H "Authorization: Bearer <your CRON_SECRET>" https://<your-app>.vercel.app/api/cron/keepalive` should answer `{"ok":true,…}`.

Clerk's development instance works on `*.vercel.app`, with a "Development mode" badge and dev limits. That's fine for class. A Clerk production instance needs your own domain. Supabase needs no change.

### 5. What to review first in the PR

1. `src/lib/layout/` (`initial.ts`, `insert.ts`, `calibrate.ts`) with **`docs/algorithm.md`**. This is what you defend in class; the worked 10-record example is generated by the real code.
2. `supabase/migrations/`: RLS, explicit grants, composite foreign keys, the `save_setup` / `apply_placements` functions, and the URL checks.
3. `src/lib/import/service.ts` and `src/lib/discogs/client.ts`: resumable import, sweep, freshness, rate limits.
4. `src/components/app/use-shelf-app.ts`: the state machine (browser demo vs. account).
5. `docs/build-log.md`: decisions, stuck points, the security review, and the independent review.
6. `CLAUDE.md` diff: Decisions log filled in, `furniture.media`, and core task step 1 (no login wall).

### 6. Final results

- `npm run test` → exit 0 (64 tests in 8 files).
- `npm run build` → exit 0.
- Also: `npm run lint` exit 0; `npm run test:rls` 17/17 PASS; `npm run check:import` 5/5 PASS; `npx playwright test` 15 passed, 5 skipped on purpose, exit 0.
- Draft PR: https://github.com/aorihuela7/final-project-vinyl-organizer/pull/1

## Follow-up: Ale's answers (Nov 15)

Answers to the questions in the morning summary, and what changed:

- **Demo without an account (Q4):** keep it open; "Where does this record go?" doesn't require an account. No change.
- **Switching collections (Q5):** one collection per user. "Shelves & order" now has a Collection panel to import your own Discogs collection instead of the demo, or another username. The collection keeps its source until the new import finishes, so a typo or a private collection changes nothing (warning, demo intact). When it finishes, every record it didn't see (added ones too) and the shelves are deleted, and the user goes to "Build your shelf" with suggested templates (Ale chose this over keeping the demo shelves). Evidence: `e2e/flows.spec.ts` "a demo account imports its own Discogs collection…" PASS (typo → 2 shelves kept; aorihuelar → source discogs, 0 shelves, 1,704 records); `npm run check:import` 5/5 PASS.
- **Empty compartment between neighbors (Q6):** keep it. No change.
- **Articles (Q7):** "ignore articles" is now off by default ("The Beatles" under T). Names that differ only by a leading article, case, or accents are one artist and sort together under the spelling with the article. Inserting "The X" when the shelf has records by "X" moves those records with the same insertion rule and lists the moves. Known limit: if a re-sync deletes the only "The X", the remaining "X" records keep their place until the next full layout. Neither case appears in the 1,000 demo records (0 artists written both ways). Tests: 3 in `sort.test.ts`, 2 in `insert.test.ts`. `docs/algorithm.md` updated. The database default of `shelf_settings.ignore_articles` is still `true`; the app always writes the value, so it was left alone instead of adding a migration.
- **Spines (Q8):** vertical spines side by side as on the real shelf, each one record's share of the capacity wide (free space on the right). Color: the group's palette color (first sort level) darkened by a stable per-record shade, so neighbors look different. Ale also offered the cover's main color, but reading cover pixels in the browser means fetching every cover of the compartment and processing Discogs images, which the terms don't clearly cover, so it wasn't done without asking. Hover or keyboard focus shows artist and title in a rounded bubble; click opens the record card with the cover; arrow keys move between spines; the last record looked at is outlined. Phones keep the strips until the mobile version is designed.
- **Calibration rule (Q9) and full relayout on a mostly new re-sync (Q10):** keep both. No change.
- **Tailwind plugin (Q11):** nothing to do.
