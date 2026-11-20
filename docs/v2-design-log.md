# v2 design log · overnight run

Companion to `docs/v2-design-plan.md`. Re-read both at the start of every turn and after any context compaction.

## Kickoff answers

Answered by Ale on 2026-11-20, before the run. Each item is the question as asked and the answer.

1. **The v2-plan issues.** Create the GitHub issues for `docs/v2-plan.md` (fix-first items at the top, then the "Add" list, hardening, the security pass, and the design review), plus one issue per part of the Nogal plan, **and implement them**, not only create them. *Order taken:* phase 0 (issues + CLAUDE.md) first, then the Nogal phases 1–14 as written (the redesign touches every screen, so building the other issues on the old UI first would be redone), then the remaining v2-plan issues in their listed order. Logged under Assumptions.
2. **Issues closed by Nogal.** OK. "Phone compartment view" and "small labels on phones" are closed by the lean drawing and the letter plates; "thickness by format" is partly covered by the format groups, and calibration by count stays open.
3. **CLAUDE.md update.** OK. Multilingual UI (English default, Spanish and Portuguese dictionaries; code and repo stay in English); tracklists, format groups, letter plates, and the tour move into scope; Nogal replaces "neutral background, single accent"; spine color is a per-record hash; the lean drawing replaces the compartment-view spines; Record box template; shelf media is LPs, singles, or CDs.
4. **If the night runs short.** **Cut nothing.** Follow the whole plan, take the time needed, and don't stop until it's done. Quality first. If the session hits its usage limit, make sure the work resumes automatically when the limit resets (see "Resuming" below).
5. **Display face.** OK: **Belleza**.
6. **Text face.** OK: **Nunito Sans**.
7. **Singles (7″) capacity.** OK: **150 per Kallax cube** (one row deep), **100 per record box**. Unmeasured, in one constant.
8. **Record box template.** OK: 1 × 3 boxes by default; 100 singles or 70 LPs per box depending on the shelf type. The six existing templates stay.
9. **`v2_format_groups` migration.** OK.
   - `records.size_inches` (7, 10, 12, null) and `records.format_group` (`lp`, `single`, `cd`, `other`), computed by a SQL function used by an insert/update trigger and by the one-time backfill. The TypeScript classifier mirrors the rules for the browser demo and the import, with tests.
   - `furniture.media` keeps `'vinyl'` in the database, meaning LPs, and gains `'single'`. The UI says "LPs (12″ and 10″)". Renaming to `'lp'` is a later contract migration after v2 is deployed, because the live v1 filters on `'vinyl'`.
   - `furniture.template` accepts `'record_box'`; `layout_events.kind` accepts `'format_split'`.
   - Only placements of `single` records on `'vinyl'` shelves are deleted, with one `format_split` layout event per user. No LP moves.
   - Known limit: today only one format's descriptions are stored, so rule 4 (largest size wins) can be wrong in the backfill until the next re-sync, which reads every format. A record that changes group on re-sync loses its placement and goes in through insertion.
10. **`user_preferences` table.** OK: `user_id` primary key, `locale` (`en`, `es`, `pt`), `tour_status`, `updated_at`, with RLS and grants like the rest.
11. **Migration command.** OK. CLI v3.1 has no `--linked --yes`; the equivalent is `supabase db push --remote` (dry run verified). Ale authorized pushing new migrations to the linked project as often as needed tonight, without asking again. Never reset the database or delete data.
12. **Browser demo.** OK: localStorage snapshot version 2 (vinyl shelves become LP shelves, groups computed, singles removed from LP shelves). The demo gets a "Singles box" 1 × 3 if it has singles.
13. **Mockup path.** OK: move `docs/nogal.html` to `docs/design/nogal.html`.
14. **Neighbors.** OK: a third caption line ("in Kallax 1, row 2, column 1") only when the neighbor is in another compartment.
15. **Compartment view on phones.** OK: the large drawing on top, the existing text list (artist, title) below it, tappable and doubling as the accessible list. Desktop keeps hover and click on the drawing.
16. **Plates on phones.** OK: 14 px, 12 px when a cell is narrower than 80 px; the two-line genre plate truncates with an ellipsis (full range in `aria-label` and the compartment view); the count badge shows "55" instead of "55 of 80" under 80 px.
17. **Free space in the builder.** OK: the field edits the global setting, labeled "(all shelves)".
18. **Tour.** OK: offered to every new account, including Google sign-ups.
19. **Tracklist route.** OK: new `/api/discogs/release/[id]`, keeping `/api/discogs/release?id=` for the add flow; allowed without a session (for the demo) with a 15-per-minute IP limit; cached at most 6 hours.
20. **Vercel previews.** OK: pushes to `v2-design` build automatic preview deployments; that isn't a production deploy.
21. **End-to-end tests.** OK: updated alongside each phase, run locally at the end. `npm run test` and `npm run build` before every commit.
22. **First commit.** OK: `.claude/settings.json`, `docs/v2-design-plan.md`, the mockup, `docs/v2_instructions.pdf`, and this log.

## Approved fonts

- **Display: Belleza** (SIL Open Font License), for the brand, shelf names, plates, rail letters, record titles, card bands, and section titles. Chosen over Marcellus because Marcellus uses old-style figures: at 14 px on brass, "1" and "0" read as "I" and "O" ("Kallax I", "I,392 of 2,000"), which is unacceptable on plates with years and counts. Belleza has lining figures and is the closest to Optima.
- **Text: Nunito Sans** (SIL Open Font License), for everything else. Both candidates read well at 14 px; Nunito Sans has the larger x-height and sets narrower than Mulish, which matters for 11–12 px labels on phones.
- Both loaded with `next/font/google`, self-hosted at build time.
- Comparison screenshot (each candidate at 14 px on brass, with Optima and Avenir Next as references): `docs/screenshots/v2-design/fonts.png`. Local only: `docs/screenshots/` is gitignored on purpose because screenshots may show Discogs covers, so every v2 screenshot stays on Ale's disk.

## Status board

| Phase | Status | Evidence |
| --- | --- | --- |
| 0. Issues, CLAUDE.md, branch | Done | Branch `v2-design`; issues #4–#14 (v2 plan: fix-first #4–#6, add #7–#11, hardening #12, security pass #13, design review #14) and #15–#23 (Nogal parts); CLAUDE.md has a v2 scope section, format groups, Nogal design, multilingual UI |
| 1. Foundations | Done | Nogal tokens in `src/styles/tokens.css` (+ `surface-*` utilities in globals.css), Belleza and Nunito Sans via `next/font`, type scale 11–26, i18n in `src/i18n/` (core, server, client, `en.json`, 7 tests), app bar, banners, buttons, and inputs in `src/components/ui.tsx`; screenshots `p1-landing-*`, `p1-app-demo-*`; build and 76 tests pass |
| 2. Lean function | Done | `src/lib/visual/lean.ts` (port of `leanLayout`, widths per record, sizes 12/10/7) and 15 Vitest tests: every n from 1 to 80 × 20 seeds × square and 1.6:1 × three size mixes, 0 overlaps by separating-axis test (~10 million pairs), corners inside, tops left of bases, angles non-decreasing, determinism, monotonic maximum angle, 25 × 80 records in under 16 ms; preview `p2-lean-preview.png` |
| 3. Format groups | Done | Classifier `src/lib/discogs/format.ts` (17 tests with real description arrays); migrations `20261120094123_v2_format_groups` and `20261120094124_v2_user_preferences` applied with `supabase db push --remote --yes` and verified read-only (0 records without a group, 0 singles on LP shelves, 37 `format_split` events with 1,678 moves); layout groups `lp`/`single`/`cd` with tests (a 7″ never on an LP shelf, invariants per group); browser demo snapshot v2 with migration test (no LP moves); Record box template; demo Singles box; banner for singles without a shelf; screenshot `p3-demo-groups-*` (13 singles in the Singles box, none on Living room) |
| 4. Map | Done | Walnut furniture with legs (`furniture.tsx`), one memoized SVG drawing per compartment with sizes (`compartment-drawing.tsx`), letter plates (`src/lib/visual/plates.ts`, 17 tests with every plan example), count badge (mustard from 90%), found outline and lift, keyboard access (`role=button`, full range in `aria-label`), one section per format group; screenshots `p4-map-*` (1280 and 375). The found outline is checked again in phase 7, once the record detail stops covering the map |
| 5. Search row and "Add a new record" | Todo | |
| 6. Shelf builder with live capacity | Todo | |
| 7. Record detail card and tracklist | Todo | |
| 8. Compartment view and brass rail | Todo | |
| 9. Other screens | Todo | |
| 10. Language selector and translations | Todo | |
| 11. Guided tour | Todo | |
| 12. Mobile, accessibility, and performance pass | Todo | |
| 13. Visual QA | Todo | |
| 14. Morning summary | Todo | |
| 15. Easier calibration (#4) | Todo | |
| 16. Minimum-move insertion and purchase simulator (#7) | Todo | |
| 17. Temporary locations and "Put it back" (#8) | Todo | |
| 18. Calibration by count and thickness by format (#9) | Todo | |
| 19. Custom sections and tags (#10) | Todo | |
| 20. Guest mode (#11) | Todo | |
| 21. Hardening (#12) | Todo | |
| 22. Security pass (#13) | Todo | |
| 23. Design review at 390 and 1440 px (#14) | Todo | |

## Classification counts (phase 3)

Ale's Discogs collection (`aorihuelar`, 1,704 records), classified by the migration from the stored format data:

| Rule | Group | Records |
| --- | --- | --- |
| 1, explicit size `7"` | single | 147 |
| 1, explicit size `10"` | LP (10″) | 6 |
| 1, explicit size `12"` | LP (12″) | 19 |
| 2, `Single` or `EP` without a size | single | 2 |
| 3, everything else on vinyl | LP (12″) | 1,197 |
| CD | CD | 327 |
| Other formats | not placed | 6 |

Rule 4 (several formats, the largest size wins) needs every format, which only the import has; it applies at the next re-sync. Across the whole database: 50,844 LPs, 3,627 singles, 306 10″ records.

## Assumptions and questions for Ale

- **Order of the v2-plan issues vs. the Nogal phases.** Ale asked to implement the v2-plan issues too. Taken: Nogal phases first, then the remaining issues (minimum-move insertion and simulator, temporary locations, better calibration, custom sections and tags, guest mode, hardening, security pass, design review). Why: the redesign touches every screen, and the plan's constraint "modify `src/lib/layout` only for the format groups" applies to the Nogal phases; the minimum-move work changes the layout code afterwards, as the v2 plan says. Easy to change: the order is only a sequence of slices.

- **Brass and engraving tuned for contrast.** The plan asks for AA on the gradient's darkest stop. With the mockup's values, engraving `#3E2C0F` on brass-dark `#9C7C35` is 3.4:1. Taken: brass-dark `#A8873C` and one engraving color `#2E2209` for plates and rail (4.6:1 on the darkest stop, 9.2:1 on the lightest). Visually almost identical. Easy to change: two tokens.
- **Belleza has one weight.** The plan asks for "semibold" in the display face (record detail band). Belleza ships only 400, and a synthesized bold looks smeared, so display text is always 400 (`font-synthesis: none`); hierarchy comes from size. Easy to change: swap the font.
- **How the language reaches the server.** `cacheComponents` is on, so reading the cookie outside a Suspense boundary would block prerendering. Taken: the root layout reads the `locale` cookie inside a Suspense boundary (the shell is prerendered, the rest streams), an inline script sets `<html lang>` before the first paint, and the client provider switches language in place (nothing remounts, so the person stays where they were) and calls `router.refresh()` for server components. No URL prefix. Medium to change.
- **Messages in the app state.** Notices and statuses were stored as finished English sentences. They're now message descriptors (key + variables) rendered at display time, so changing the language updates them. Errors that come from servers (Discogs, Supabase) stay as raw English text.
- **String conversion order.** Phase 1 converted the shell (header, footer, landing, onboarding, import progress, notices, banners). Each later phase converts the components it rebuilds; phase 9 sweeps whatever is left.

- **Lean jitter and the nearly-full case.** With the mockup's ±0.7° jitter, a nearly full compartment (maximum 1.2°) can reach 1.9°, above the plan's 1.5° test, and the jitter of the outermost record made the maximum angle non-monotonic. Taken: jitter shrinks with the maximum angle (full ±0.7° from 4° up), the outermost record takes the maximum exactly, and no record goes past it. Visually the same.
- **Over-capacity compartments.** A calibrated compartment can hold more records than its capacity. Taken: the drawing squeezes records to fit the width instead of overflowing, and all stand upright.

- **Mixed vinyl and CD releases.** Rule 4 talks about vinyl sizes. Taken: v1's media rule stays (the first vinyl or CD format in Discogs' order decides vinyl vs CD), and among vinyl formats the largest size wins. Easy to change in `classifyFormats` and the SQL function.
- **Odd sizes.** Discogs has a few 5″, 6″, 8″, 9″, 11″, and 16″ records. Taken: up to 8″ goes with singles, 9″ to 11″ counts as 10″, bigger as 12″. Easy to change.
- **The database trigger only fills empty groups.** Rows written by the deployed v1 (which doesn't know the columns) get their group from the stored format; the v2 import sends both columns computed from every format. A v1 re-sync that changes a record's formats keeps the old group until v2 is deployed. When a record changes group, v2 takes it off the map on load (`format_split` event) and puts it back through insertion in its own group.
- **Singles capacity on the Record box for LPs.** The Record box template holds 100 singles or 70 LPs per box; the Crates template still exists for LPs. Easy to change in `CAPACITY`.
- **`supabase db push` needs `--yes` in agent mode.** The CLI refused without it ("ask the user before re-running with --yes"). Ale authorized `--yes` for new migrations tonight, so it was re-run with `--remote --yes`.

- **Blocked compartments say "Blocked".** The mockup shows a reason ("Turntable"), but compartments don't store one. Taken: "Blocked", translated. Logged under Ideas.
- **Narrow genre plates.** Under 80 px a single-genre plate breaks into the genre over its range ("Rock" / "Gu – Lo") instead of truncating; two-genre plates still truncate (the full range is in the aria-label and the compartment view).
- **Furniture width.** A compartment is at most 190 px wide on the map, and pieces of the same group sit side by side when they fit, so a tower doesn't fill the screen.

## Blocked: needs Ale

(none yet)

## Ideas for v2

- A reason for each blocked compartment ("Turntable", "Speakers"), shown on the map as in the mockup. Needs a column and a field in the builder.

## Resuming

If the session stops on a usage limit, a recurring session job (created when the phases start) re-enqueues: "Continue the v2 overnight run: re-read docs/v2-design-plan.md and docs/v2-design-log.md, then pick up the first phase that isn't Done." It only fires while the session is idle, and it's a no-op once the morning summary is written.

## Timeline

- 2026-11-20 02:34 CST · Kickoff answers recorded, fonts approved, branch `v2-design` created from `main`.
- 2026-11-20 03:27 CST · Phase 0 done: 20 GitHub issues (#4–#23) with labels fix-first, v2, nogal, hardening; CLAUDE.md updated for v2. Resume job scheduled (every 30 min while idle).
- 2026-11-20 04:55 CST · Phase 4 done: Nogal map with drawings and letter plates.
- 2026-11-20 04:20 CST · Phase 3 done: format groups end to end, migrations applied.
- 2026-11-20 03:45 CST · Phase 2 done: lean function and tests.
- 2026-11-20 03:38 CST · Phase 1 done: tokens, fonts, i18n system, shell strings, ui primitives.

## Morning summary

(written at the end of the run)
