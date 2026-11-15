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
| 3 · Schema, RLS, and import | Doing | Migration `20261115012019_init_schema.sql` applied with `supabase db push --remote --yes` (exit 0). `npm run test:rls` → 16/16 PASS with two Clerk test users and real session tokens (B can't read, update, delete, spoof, or reference A's rows; anon can't read tables). `npm run check:import` (dev server running) → PASS full import 1,704 stored = 1,704 reported by Discogs (26 s); PASS demo 1,000 = 1,000 (13 s); PASS resume returns the same active job at next_page 3; PASS re-sync idempotent (1,704). Progress UI, resume in the browser, and 6-hour re-sync ship with the app shell. |
| 4 · Layout algorithm | Done | `npm run test` → exit 0, 54 tests in 6 files (sort key, normalization, traversal, initial layout with both invariants for 0–60 records, slack reduced, overflow, vinyl/CD/other, cascade across three compartments, overflow off the end, 200 random insertions, calibration, position, neighbors, ranges, and 3,000 records in 40 compartments under 100 ms). `docs/algorithm.md` written, with a 10-record worked example generated by the real code. |
| 5 · Shelf configurator and sort order | Todo | |
| 6 · Map, compartment view, record card, search | Todo | |
| 7 · If-time features | Todo | |
| 8 · Self-test as a new user | Todo | |
| 9 · Hardening and polish | Todo | |
| 10 · Morning summary | Todo | |

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
- **Test users created in Clerk (development instance):** `rls-a+clerk_test@example.com`, `rls-b+clerk_test@example.com`, `import-check+clerk_test@example.com`, `demo-check+clerk_test@example.com` (no passwords; sessions are created through the Backend API).

- **Articles apply to artist and title, not to label or genre.** · Why: that's how most shelves file "The Beatles" and "The Wall". · Easy: one line in `sort.ts`.
- **Article list:** The, A, An, El, La, Los, Las, Le, Les, L' (CLAUDE.md's list plus the French elision). Not added: Die, Der, Das, Il, I, O, Un, Una, because they collide with real names ("I Am Kloot", "O Rappa"). · Easy: `DEFAULT_ARTICLES` in `normalize.ts`.
- **Range labels** cut each end to the shortest prefix that differs from the neighboring compartment; a compartment inside one first-level group shows the group ("Jazz · M – N"). · Easy.
- **Calibration only accepts a record from the compartment or the one right before it** (anything else would move more than one boundary). · Medium: a more general calibration is a v2 idea.
- **When the collection fits only by eating the slack**, the layout spreads proportionally to the real capacity and tells the user the slack was reduced. · Easy.

## Blocked: needs Ale

## Ideas for v2

- A separate sort order per media (vinyl vs. CDs).
- Automatic purge of Discogs data for users who haven't opened the app in N days.
- CSV import and manual entry.

## Timeline

- 2026-11-14 19:09 · Kickoff. Branch `v1-build` created from `main` (7308bc4). Log created with Ale's answers.

- 2026-11-14 19:12 · Phase 1 Done. Spike ran against `aorihuelar`; notes written.
- 2026-11-14 19:18 · Phase 2 Done. Next.js skeleton, Clerk, landing page, footer notice, keepalive cron, tokens, Vitest, Playwright smoke test, README.
- 2026-11-14 19:28 · Phase 3 backend done: schema, RLS, grants, RPCs, import routes, demo route. RLS and import checks pass.
- 2026-11-14 19:30 · Phase 4 started: tests first.
- 2026-11-14 19:36 · Phase 4 Done. 54 tests pass; `docs/algorithm.md` written.

## Morning summary
