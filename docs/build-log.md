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
| 2 · Skeleton | Todo | |
| 3 · Schema, RLS, and import | Todo | |
| 4 · Layout algorithm | Todo | |
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

## Blocked: needs Ale

## Ideas for v2

- A separate sort order per media (vinyl vs. CDs).
- Automatic purge of Discogs data for users who haven't opened the app in N days.
- CSV import and manual entry.

## Timeline

- 2026-11-14 19:09 · Kickoff. Branch `v1-build` created from `main` (7308bc4). Log created with Ale's answers.

- 2026-11-14 19:20 · Phase 1 Done. Spike ran against `aorihuelar`; notes written.

## Morning summary
