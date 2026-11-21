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
| 4. Map | Done | Found outline verified in `p7-record-1280.png`. Walnut furniture with legs (`furniture.tsx`), one memoized SVG drawing per compartment with sizes (`compartment-drawing.tsx`), letter plates (`src/lib/visual/plates.ts`, 17 tests with every plan example), count badge (mustard from 90%), found outline and lift, keyboard access (`role=button`, full range in `aria-label`), one section per format group; screenshots `p4-map-*` (1280 and 375). The found outline is checked again in phase 7, once the record detail stops covering the map |
| 5. Search row and "Add a new record" | Done | `SearchRow` (search, "or", "+ Add a new record"; one row from 700 px, stacked and centered below), search as an accessible combobox (arrows, Enter, Escape), "Add a new record" everywhere (button, dialog, README, comments, e2e selectors) with the three steps "Find it on Discogs" / "It goes in …, between … and …" (with the target compartment drawn and the new record in mustard) / "Add record" → "Record added"; groups decide the shelves; screenshots `p5-search-row-*`, `p5-add-*`, `p5-added-*` |
| 6. Shelf builder with live capacity | Done | Shelves & order rebuilt: shelves as cards with "Holds 1,280" and a mini walnut drawing, one open in the builder (form, walnut box "This shelf holds 910 LPs / 13 compartments × 70 records, 3 blocked", one meter per format group with "won't fit" warnings in mustard, the preview as walnut furniture with "910 places"), template picker drawn as small furniture, sort order card; pure `src/lib/shelf/capacity.ts` with 3 tests; checked live in Playwright (capacity 80 → 70 and one more blocked compartment); screenshots `p6-builder-*` |
| 7. Record detail card and tracklist | Done | `RecordCard`: walnut band ("Living room, row 3, column 2" / "Record 28 of 60, about 46% in from the left"), 104 px cover, title in Belleza, artist and year, label, format, genres with commas, the compartment drawn at 1.6:1 in an 8 px walnut frame with the record lifted in mustard, five neighbors in physical order (third line when in another compartment), tracklist, Discogs link and "Show on the map". Side column from 900 px (with an empty state), bottom sheet with the band as handle below. Tracklist route `/api/discogs/release/[id]` ("use cache", expires within 6 h, 15/min per IP or 30/min per user, works without an account) and parser `src/lib/discogs/tracklist.ts` with 5 tests (sides, headings, index tracks, missing durations, "1", "A", "CD1-1"); loading skeleton, error with "Try again"; screenshots `p7-record-*`, `p7-record-sheet-375.png` (real tracklist for Sirope) |
| 8. Compartment view and brass rail | Done | Compartment view rebuilt: walnut frame with the full range on a brass plate, the same drawing as the map (same viewBox and seed, so it looks identical), hover bubble with artist, title, and position, click opens the card, an accessible list of the records, calibration as a secondary pill with translated refusals. Brass rail per format group (`brass-rail.tsx`, segments from `src/lib/visual/rail.ts` with 4 tests): letters, genres, or decades sized by records, engraved separators, labels only where they fit whole, mustard marker hanging below that slides in 1 s, segments jump to their first compartment and flash it. Checked with genre, artist, and year first in Playwright; fixed a bug where an open record showed as a modal over Shelves & order on desktop. Old `spines.tsx` removed. Screenshots `p8-*` |
| 9. Other screens | Done | Landing with a walnut hero (Kallax slice 2 × 3 with legs, plates, lean, a found record, and the brass rail, built with the map's own components through a shared `RailBar`), CTAs and Discogs form kept; Collection panel translated and in Nogal; Clerk screens themed (ink primary, paper background, Nunito Sans, 4 px radius); cover placeholders translated; old cream and terracotta tokens are gone (the semantic names map onto Nogal); every component except the Discogs attribution and notice goes through the dictionaries; screenshots `p9-landing-*`, `p9-sign-up-*`, `p9-onboarding-*` |
| 10. Language selector and translations | Done | Selector in the app bar (paper pill, each language by its own name, on every page including the landing), cookie plus `user_preferences` when signed in (`LocaleSync`: a choice on this device is saved, a device without the cookie adopts the saved one), `<html lang>` updated, switching keeps the person where they were (checked in Playwright: the open record card stays open), `es.json` and `pt.json` complete (342 keys each, including the tour and the 15 genres from the plan), numbers with grouping ("1.392"), zero reads as plural in all three; dictionary test (same keys, same placeholders, singular and plural forms) and translation tests, 15 tests; screenshots `p10-es-*`, `p10-pt-*`, `p10-pt-landing-*` |
| 11. Guided tour | Done | `tour.tsx`, local (no library): offer dialog ("Want a quick tour? It takes about a minute.", "Show me around" / "Not now"), waiting banner for new accounts without a map, 8 steps anchored to real elements with a spotlight (a hole in a shadow) and a Nogal popover (walnut strip, progress "2 of 8", Back, Next, Skip tour); step 4 opens a sample record (side column on desktop, bottom sheet on phones) and closes it after. Keyboard: focus moves into the popover and returns after, Esc closes (captured, so an open sheet doesn't also close), arrows move, Tab stays inside. Reduced motion respected. State in localStorage (demo) or `user_preferences.tour_status`; a demo answer carries over on sign-up. "Take the tour" in the Clerk account menu and next to the view tabs. Walked through all 8 steps at 1280 and 375 in Playwright (focus on Next each step, `completed` saved, not offered again after reload, Esc closes); screenshots `p11-*` |
| 12. Mobile, accessibility, and performance pass | Done | 375 px: compartments keep their grid, search row stacks, record detail and compartment view are bottom sheets, tour popovers fit (screens `p4`–`p11` at 375). Contrast measured for every text pair on brass, walnut, sage, paper, mustard, and translucent text (all ≥ 4.5:1 for body text; the one failure, mustard text on walnut at 3.5:1, became ink on a mustard badge). Keyboard: compartments, rail segments, neighbors, tour, sheets with focus trap and return; visible ink-and-paper focus ring; reduced motion stops the lift, the marker slide, and smooth scrolling. Drawings are memoized with stable props (the search keeps its query inside `SearchRow`, so typing doesn't re-render the map). E2E suite updated for v2 (fixtures that pre-answer the tour, the record card as a column or sheet, new copy) plus a new `e2e/v2.spec.ts` (tour, language, tracklist, singles box): 22 of 22 pass on desktop and mobile (16 in the full run, the 6 that failed on test selectors fixed and re-run). Fixed a real bug found by e2e: Next 16 keeps the previous page hidden in the DOM, so the landing hero's found compartment and rail matched app selectors; app and tour selectors are now scoped to the map |
| 13. Visual QA | Done | Compared `p4`–`p11` with `docs/design/nogal.html` at 1280 and 375. Matches: tokens, walnut frame and legs, interiors and inset shadows, lean drawings, plates, count badges (mustard from 90%), found outline and lift, the rail with the hanging marker, the two-column body with the record card, the card's band, drawing, neighbors, tracklist, and actions, the builder with the walnut "holds" box and meters. Fixed: the singles shelf header now reads "Singles box, 7″" as in the mockup. Remaining differences, kept on purpose: the app has a view switch (Map / Shelves & order) and banners the mockup doesn't show; blocked compartments say "Blocked" (no reason is stored); display text is never semibold (Belleza has one weight); brass-dark and engraving are slightly adjusted for AA contrast |
| 14. Morning summary | Done | "Morning summary" below and the final message of the run; draft PR #24 updated with the final status |
| 15. Easier calibration (#4) | Done | A banner on the map until the first calibration ("The map assumes about 80 records per compartment, an estimate…") with "Match a compartment", which opens the second compartment with calibration already showing, and "Not now" (remembered); the app knows whether you've calibrated (a `calibrate` layout event, or the demo's events). Defaults stay in `CAPACITY`, documented as unmeasured. Screenshots `p15-hint-1280.png`, `p15-calibrate-1280.png` |
| 16. Minimum-move insertion and purchase simulator (#7) | Done | `insertRecord(…, "minimum")`: shift toward the nearest compartment with room in either direction (cost 1 + boundaries crossed), with the proof in `docs/algorithm.md` §6b; 6 tests (brute-force optimality on every small shelf and every gap, more than 100 cases; invariants over 300 random insertions; never worse than naive when naive keeps every record; the simulator is deterministic and wins on nearly full shelves). The app uses it for "Add a new record" and re-syncs; naive stays as the baseline. Simulator in `src/lib/layout/simulate.ts`, in Shelves & order ("How full your shelves end up": as they are, 90%, 95%, 98%, 100%) and as `scripts/simulate.ts`. On Ale's 1,725 records: 0 records moved with either method on the suggested shelves (10% free space spread everywhere); at 98% full, 17.5 vs 13.4 by artist; at 100% full by genre, 89.4 vs 60.6. Screenshot `p16-simulator-1280.png` |
| 17. Temporary locations and "Put it back" (#8) | Done | Migration `20261120104542_v2_temporary_locations` (table with RLS and grants; `records.temp_location_id` with a same-user composite key that puts records back if a place is deleted; applied and verified). "Take it out…" in the record card with the places already used, five suggestions (next to the turntable, gig bag, discards box, on display, unsorted pile), or a new name; the record keeps its placement (its home spot), drawn hollow with a dashed outline on the map and in the compartment view; the card says "Out of the shelf: in Gig bag" with "Put it back", which highlights its spot and neighbors; search says "In Gig bag. Its spot: Living room, row 3, column 2"; a panel lists every record that's out by place. Works in the browser demo (snapshot) and signed in (Supabase). Checked in Playwright at 1280 and 375, plus a new e2e test; tracklists from vinyl releases with a bonus CD now get a separate "CD" section. Screenshots `p17-*` |
| 18. Calibration by count and thickness by format (#9) | Done | `calibrateCount` ("there are N records here" moves only the boundary with the next compartment; refuses what needs another boundary; flags over capacity) with 4 tests and a "Count the records here" form in the compartment view. Thickness by format: optional setting in Sort order (migration `20261120105551_v2_thickness_by_format` adds `shelf_settings.thickness_by_format` and teaches `save_setup` to save it; applied), records weigh their number of discs (`format_qty`, 1–12), `distributeWeighted` for the initial layout, insertion and calibration count places, drawings are as wide as their places, badges count places. Off by default, and off reproduces v1 exactly (all v1 tests unchanged, plus a test that weights are ignored when off); 5 weighted tests (spread in places, never over capacity, leftovers, a too-thick record, inserting a double album with both methods). Documented in `docs/algorithm.md` §7b–7c. Checked in Playwright: turning it on recomputes the demo map (98 records change compartment; the first cube goes to 70 of 80 places), and a count of 50 moves 14 records to the next compartment. Screenshots `p18-*` |
| 19. Custom sections and tags (#10) | Done | Migration `20261120110319_v2_sections_and_tags` (tables `tags` and `artist_tags` with RLS and grants, `furniture.section`, "tag" allowed in `sort_levels`, `save_setup` saves sections; applied). Layout: `tag` sort level (user's order, untagged last), sections in `src/lib/layout/sections.ts` (each section laid out on its own shelves; insertion, calibration, and the simulator run inside the record's section), 4 tests. App: a Tags card in Shelves & order (create, order with ↑↓, remove, tag an artist from a search, every spelling at once), a Section select per shelf (genres in the collection and tags), the section in the shelf header, plates and rail by tag name, a notice when tags change and the map needs regenerating; demo and signed in. Checked in Playwright: sorting by tag puts "Sunday morning" first; pinning Rock to the Living room places 401 records there and reports the 440 that have no shelf. Screenshots `p19-*` |
| 20. Guest mode (#11) | Done | Migration `20261120111031_v2_guest_mode` (table `share_links` with RLS; `shared_shelf(token)`, a `security definer` function granted to anon that returns only the shelf behind an active token, only the fields the read-only view needs, null otherwise; applied). "Share your shelf" card in Shelves & order (create, copy, renew, turn off; one active link per owner; the accountless demo is told to sign up). Guest page `/s/{token}` (no index): read-only map, rail, search, record card with neighbors and where a record is out, compartment view without calibration; data is shown only if synced in the last 6 hours (Discogs terms), otherwise it explains. New e2e test: an account creates a link, an anonymous browser opens it, searches, sees no editing controls; turning the link off makes it say the link no longer works (passes) |
| 21. Hardening (#12) | Done, with one step blocked on Ale | Content-Security-Policy tuned for Clerk (its Frontend API decoded from the publishable key, `*.clerk.com` with any port for Clerk Protect, the Cloudflare check), Supabase, and Discogs covers; checked in Playwright with no violations (Clerk sign-up, demo, covers, tracklist). Import routes return generic messages for 5xx and log the details (`src/lib/import/errors.ts`). Migration `20261120111555_v2_hardening`: a nightly `pg_cron` job deletes Discogs records of accounts that haven't synced in 90 days (verified active), and `delete_user_data(user_id, secret)` for the Clerk deletion webhook, guarded by a hashed secret in a schema the Data API doesn't expose. Route `/api/webhooks/clerk` verifies Clerk's signature and calls it; it answers 503 until Ale configures it (see Blocked) |
| 22. Security pass (#13) | Done, with two settings on Ale | `docs/security-pass.md`: the course checklist (auth on every route, RLS and grants on all 13 tables, one account can't see another's, keys out of the repo, no model calls), every database function and who can call it, and an independent review by a fresh session (no cross-account access, no anonymous writes, no leaked secrets; 2 medium and 5 low findings, all fixed or handed to Ale). Fixes: the shared Discogs budget split between imports (which pace themselves) and interactive calls (refused near the end, never retried), IPv6 /64 keys; quotas and size limits so no account can fill the database; JSON-only, same-origin import routes; import jobs checked by the database and re-validated on the server; only Clerk-shaped user ids can own rows; guest links return no data older than 6 hours; the purge covers unfinished imports; classifier functions revoked from PUBLIC. Migrations `20261120113954_v2_security_review`, `20261120114224_v2_fix_layout_prune`, `20261120114356_v2_clerk_user_ids` applied and verified; RLS test 50/50 against the real database; 177 unit tests. Supabase Auth sign-ups (dashboard) and the Clerk deletion webhook are on Ale's list |
| 23. Design review at 390 and 1440 px (#14) | Done | Every page and view at 390 and 1440 (`p23-*`), with loading, empty, and error states inventoried in `docs/design-review.md`. Fixed: banners that crushed their text on phones, the search below three banners on a phone (the calibration hint moved under it), the hover bubble over the compartment title, and a heading that separates the save-on-their-own tools from "Generate map" in Shelves & order |

## Plan for phases 15–23 (the remaining v2-plan issues)

- **15 · Easier calibration (#4).** A map banner until the first calibration ("The map assumes 80 LPs per cube, an estimate…") with a button that opens the first compartment in calibration mode; defaults stay in one constant (`CAPACITY`), documented as estimates.
- **16 · Minimum-move insertion and purchase simulator (#7).** For one new record, the cheapest plan shifts records toward the nearest compartment with room, in either direction; the cost is 1 + the number of boundaries crossed. Tested for optimality by brute force on small shelves, invariants on random runs, never worse than naive. The app uses it for "Add a new record" and re-syncs; the naive method stays as the baseline. Simulator: take a real collection, hold out 100 records as purchases, lay out the rest, then insert the 100 with both methods and count moves (seeded). In the app and as `scripts/simulate.ts`; result in the README.
- **17 · Temporary locations and "Put it back" (#8).** Named places outside the sort order; a record taken out keeps its home spot; search and the card say where it is; "Put it back" shows its spot and neighbors. New table with RLS; the browser demo keeps them in its snapshot.
- **18 · Calibration by count and thickness by format (#9).** "There are 74 records in here" moves the boundary with the next compartment; a setting counts double albums and box sets by their number of discs, so capacity follows thickness (layout weights, with tests).
- **19 · Custom sections and tags (#10).** Tags per artist usable as a sort level; sections pin a genre or tag to a shelf, and the layout sorts inside each section.
- **20 · Guest mode (#11).** A revocable read-only link to the map and search, served by a `security definer` function that returns only the shelf for that token.
- **21 · Hardening (#12).** CSP tuned for Clerk, generic database errors in API responses, purge of Discogs data from inactive accounts with `pg_cron` (no secrets needed), and the Clerk deletion webhook (needs Ale for the signing secret and the dashboard endpoint).
- **22 · Security pass (#13).** Checklist, an independent review, fixes, written up in `docs/security-pass.md`.
- **23 · Design review (#14).** Every page at 390 and 1440 px, missing states designed, notes in `docs/design-review.md`.

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

- **The search placeholder on phones.** The plan's placeholder is 50 characters and gets cut at 375 px. Taken: the placeholder is 13 px under 420 px wide (the typed text stays 16 px, so iOS doesn't zoom).
- **Place names in plain words.** "Living room · row 4, column 4" is now "Living room, row 4, column 4" everywhere, and record boxes say "box 2".

- **One shelf open at a time.** The mockup shows a single "New shelf" builder. Taken: saved shelves are cards with Edit, and only one is open in the builder; a new shelf from the template picker opens right away. On first setup (no map yet) the first suggested shelf starts open.
- **Changing "Holds" keeps a hand-set capacity.** Switching a shelf between LPs, singles, and CDs updates the records per compartment to the new default only if it was still the old default.

- **Rail labels.** The plan hides labels under about 16 px; genre and decade labels are longer than one letter, so a label shows only where it fits whole (measured with a ResizeObserver), never truncated.
- **Keyboard access to records in the compartment view.** The drawing is for pointing; the list under it (on every screen size, not only phones) is the keyboard and screen reader path.

- **Clerk's own screens stay in English.** Translating them needs `@clerk/localizations`, a new dependency, which tonight's constraints rule out. They're themed in Nogal colors and type. Logged under Ideas.
- **Page titles stay in English** ("My shelf · Record Organizer"). Translating them means reading the cookie in `generateMetadata`, which would block the prerendered shell under Cache Components.

- **Portuguese needs a native speaker's review.** It's Brazilian Portuguese ("compactos" for 7″ singles, "nicho" for a compartment). Ale reviews the Spanish (neutral, with "tú"; "repisa" for shelf, "compartimiento" for compartment).
- **Shelf names are data.** The demo's shelves ("Living room", "Studio", "Singles box") are named in the language active when the demo is created, and don't change when the language changes, like any name the user types.

- **When a status counts as answered.** Seeing the offer saves nothing until the person answers; "Not now" and "Skip tour" save `dismissed`, finishing saves `completed`, so neither asks again. Existing v1 accounts have no tour status, so they're offered the tour once in v2.
- **"Take the tour" without an account.** There's no account menu in the accountless demo, so a "Take the tour" link also sits next to the Map / Shelves & order tabs for everyone.
- **The signed-in tour path wasn't driven end to end tonight.** It needs a Clerk test account; the e2e suite covers sign-up, and the tour reads and writes `user_preferences` through the same RLS helpers as the language.

- **What the simulator compares.** With the app's own shelves (10% free space spread over every compartment), 100 purchases never move a record with either method, so the simulator also offers shelves resized to end up 90–100% full, where the two methods differ. That's the honest result: the free space does most of the work, and minimum moves help on nearly full shelves.
- **Minimum moves are greedy across purchases.** Each purchase takes its cheapest plan; over a sequence, that's not always the cheapest overall (one 100%-full run had a worse single purchase than naive, with a lower total). Logged in `docs/algorithm.md`.

- **Thickness is discs, not millimeters.** A double LP counts 2 places and a box set its number of discs; gatefolds, heavy pressings, and box packaging aren't measured. It's an option (off by default) because it changes the whole layout when turned on. With weights, minimum moves keep the nearest-room rule, which is provably optimal only for one place per record.
- **The builder's meters count places when thickness is on**, but the sentence still says "records" ("your 1,392 records would fill…"). Easy to reword.

- **One tag per artist.** Tags sort, so each artist has one (a record can't sort under two tags at once). Multiple labels per artist for search would be a later addition.
- **Sections are per shelf.** A section is pinned to whole shelves, not to single compartments; a record belongs to the first section it matches in shelf order.

- **Guest mode and the 6-hour rule.** Guests see the owner's data straight from the database. Taken: the guest page shows it only if the collection was synced in the last 6 hours (the owner's visits re-sync it); otherwise it explains and shows nothing. Question for Ale: is this the reading of the Discogs terms you want for shared links, or should guest views also be able to trigger a refresh?
- **No QR code yet.** The link covers "a read-only link or QR"; a QR code needs an encoder, and tonight's rules say no new dependencies (a hand-written encoder is possible later).

- **90 days for the purge.** "Don't store longer than necessary": records of accounts that haven't synced (opened the app) in 90 days are deleted nightly; shelves and settings stay, and the next visit re-imports. Easy to change: one number in the cron command.
- **Quotas per account.** To keep one account from filling the free database: 25,000 records (and artist tags), 30 shelves, 100 tags, 100 temporary places, 20 guest links, 30 imports started per hour, and a layout log of the newest 500 events (up to 5 MB, always keeping the newest calibration). Question for Ale: is 25,000 records enough? A bigger collection's import would stop with an error at that point. Easy to change: one number per trigger, in a new migration.
- **Only Clerk-shaped user ids.** Every table now requires `user_id` to look like `user_…`. If Clerk ever changed its id format, writes would fail until the check is relaxed (one migration).
- **A new guest link deletes the old ones** instead of only revoking them, so guest links don't pile up under the quota. Turning a link off still only revokes it.
- **The CSP allows inline scripts.** Next.js's inline bootstrap scripts and the language script need them; a nonce-based policy would remove `'unsafe-inline'` but makes every page dynamic. Logged under Ideas.

## Blocked: needs Ale

**First thing: new sign-ups are blocked on the live app (Clerk's 100-user cap).** Production runs on Clerk's development instance, which allows at most 100 users. The end-to-end suite signs up about 25 per run; tonight's runs filled it: 100 users, 94 of them e2e test users (`e2e-…+clerk_test@example.com`), 6 others. Clerk now answers `user_quota_exceeded` to every sign-up, on the live app too. I didn't delete anything (deleting Clerk users can't be undone, and the instance holds real accounts). To free the space, run `npm run test-users -- --delete`: it touches only users whose every email matches the e2e pattern, deletes their rows through the Data API with their own session (RLS applies), then deletes them in Clerk. `npm run test-users` alone only counts. Longer term: a Clerk production instance (see below), or run the e2e suite against a separate development instance.

**Clerk account deletion webhook (phase 21).** The code and the database function are deployed; three settings are needed:

1. Pick a long random secret (for example `openssl rand -base64 32`) and add two environment variables in Vercel (Production and Preview) and in `.env.local`:
   - `USER_DELETION_SECRET` = that secret;
   - `CLERK_WEBHOOK_SIGNING_SECRET` = the signing secret Clerk shows in step 3.
2. In the Supabase SQL editor (data, not schema), store the secret's hash once:
   `insert into private.settings (name, value_hash) values ('user_deletion', encode(extensions.digest('<the secret>', 'sha256'), 'hex'));`
3. In the Clerk dashboard → Webhooks → Add endpoint: `https://final-project-vinyl-organizer.vercel.app/api/webhooks/clerk`, event `user.deleted`; copy its signing secret into `CLERK_WEBHOOK_SIGNING_SECRET`.

Until then the route answers 503 and nothing is deleted.

**Supabase Auth sign-ups (phase 22).** Supabase's own email sign-up is enabled and auto-confirmed on the project, so anyone can get an `authenticated` token without Clerk. The database now refuses rows whose `user_id` isn't a Clerk id, so such a token can't write anything, but it's better closed: Supabase dashboard → Authentication → Sign In / Providers → turn off "Allow new users to sign up" and the Email provider (Clerk stays under Third-Party Auth). Then sign in to the app once to check. Verify: `curl "$SUPABASE_URL/auth/v1/settings" -H "apikey: <publishable key>"` should show `"disable_signup": true`.

**Decisions from the independent review (phase 22), not blocking:**

- Production runs on a Clerk development instance (relaxed limits, no email verification, `+clerk_test` emails work). A production instance needs a domain of your own; the e2e tests would then need a separate development instance.
- Local dev, the e2e tests (about 25 new users per run), and the scripts all use the production Supabase project. A second free project for tests would keep test users out of production.
- `.claude/settings.json` auto-allows `npx tsx *`, and a script run that way can read `.env.local`, so the `Read(.env*)` deny rule isn't a real barrier for the agent. Whether to keep that convenience is your call; I didn't change the agent's permissions.

## Ideas for v2

- A nonce-based Content-Security-Policy (no `'unsafe-inline'` scripts).
- A QR code for guest links (needs an encoder; no new dependencies tonight).
- Multiple tags per artist for search (one tag per artist is what sorting needs).

- Translate Clerk's sign-in and sign-up screens with `@clerk/localizations` (needs Ale's OK for the dependency).

- A reason for each blocked compartment ("Turntable", "Speakers"), shown on the map as in the mockup. Needs a column and a field in the builder.

## Resuming

If the session stops on a usage limit, a recurring session job (created when the phases start) re-enqueues: "Continue the v2 overnight run: re-read docs/v2-design-plan.md and docs/v2-design-log.md, then pick up the first phase that isn't Done." It only fires while the session is idle, and it's a no-op once the morning summary is written.

## Timeline

Times from the commits (`git log`), CST.

- 2026-11-20 02:34 · Kickoff answers recorded, fonts approved, branch `v2-design` created from `main`.
- 03:26 · Phase 0: 20 GitHub issues (#4–#23), CLAUDE.md updated for v2, draft PR #24, resume job scheduled (every 30 minutes while idle).
- 03:35 · Phase 1: tokens, fonts, i18n system, shell strings, ui primitives.
- 03:39 · Phase 2: lean function and tests.
- 03:49 · Phase 3: format groups end to end, migrations applied.
- 03:55 · Phase 4: Nogal map with drawings and letter plates.
- 03:59 · Phase 5: search row and Add a new record.
- 04:04 · Phase 6: shelf builder with live capacity.
- 04:08 · Phase 7: record card and tracklists.
- 04:13 · Phase 8: compartment view and brass rail.
- 04:17 · Phase 9: landing hero, collection panel, Clerk theme.
- 04:22 · Phase 10: language selector, Spanish and Portuguese.
- 04:26 · Phase 11: guided tour.
- 04:37 · Phase 12: mobile, accessibility, performance; e2e suite green.
- 04:44 · Phases 15 and 16: calibration hint, minimum-move insertion, purchase simulator.
- 04:45 · Phase 13: visual QA against the mockup.
- 04:50 · Phase 17: temporary locations and Put it back.
- 05:00 · Phase 18: calibration by count, thickness by format.
- 05:09 · Phase 19: tags and sections.
- 05:13 · Phase 20: guest mode.
- 05:18 · Phase 21: CSP, generic import errors, nightly purge, deletion webhook (needs Ale's setup).
- 05:20 · Security pass: anon execute revoked on internal functions, RLS test extended (38 checks pass), independent review started.
- 05:24 · Phase 23: design review and fixes.
- 05:35 · Bug found by e2e and fixed: saving the browser demo to a new account sent derived fields (tag, tag rank) and the demo's local temporary place to the database, so the save failed.
- 05:40 · Independent security review back; migration `v2_security_review` applied. 05:42 · the extended RLS test caught a broken alias in the layout-log trigger (every layout event insert failed for about three minutes); fixed by `v2_fix_layout_prune`. 05:44 · `v2_clerk_user_ids` applied. RLS test 50/50.
- 05:46–06:00 · Full e2e runs under parallel imports showed the first Discogs budget split starved searches; reworked twice (imports pace themselves, searches estimate the refill and wait up to 5 s). Last full run: 24 passed, 1 blocked by Clerk's 100-user cap (found in the trace: `user_quota_exceeded`), which also blocks sign-ups on the live app; `npm run test-users` added, deletion left to Ale.
- 06:02 · Security review fixes committed (`56f1a89`).

## Morning summary

**Every phase of the plan is done, and so are the remaining v2-plan issues,** on `v2-design` (draft PR #24, https://github.com/aorihuela7/final-project-vinyl-organizer/pull/24). Nothing was deployed and `main` wasn't touched. Two phases are done with a step left for Ale (21 and 22).

**Needs Ale, in this order** (details under "Blocked: needs Ale"):

1. **New sign-ups are blocked on the live app right now.** Clerk's development instance allows 100 users; tonight's e2e runs filled it (94 test users). Run `npm run test-users -- --delete` (it touches only `e2e-…+clerk_test@example.com` users and their rows).
2. Turn off Supabase Auth's own sign-ups in the dashboard (the database already refuses non-Clerk ids).
3. The Clerk deletion webhook: two environment variables, the secret's hash, and the endpoint.
4. Decisions: a Clerk production instance, a separate database for tests, and the agent's `npx tsx` permission.

**Screenshots to look at first** (local, `docs/screenshots/v2-design/`): `p7-record-1280.png` (map, found compartment, record card with tracklist), `p8-compartment-1280.png`, `p8-rail-artist-375.png`, `p6-builder-1280.png`, `p9-landing-1280.png`, `p10-es-1280.png`, `p11-step3-375.png`, `p16-simulator-1280.png`, `p17-out-card-1280.png`, `p19-section-1280.png`, `p23-*` (every page at 390 and 1440).

**Database:** eleven new migrations, all additive, applied to the linked project and in sync:
- format groups (with a backfill trigger; singles left LP shelves without moving any LP: 1,678 placements in 37 accounts);
- user preferences, temporary locations, thickness by format, sections and tags, guest mode;
- hardening (nightly purge with `pg_cron`, the account deletion function) and function grants;
- three from the security pass.

They also work with the deployed v1, which uses the same database. One slip: a new trigger broke layout-event inserts for about three minutes (v1 and v2) until a follow-up migration fixed it. Failed writes rolled back whole, so no partial data was saved.

**Security pass:** the course checklist and an independent review. The review found no cross-account access, no anonymous writes, and no leaked secrets. Its 2 medium and 5 low findings are fixed or on Ale's list (`docs/security-pass.md`).

**Classification of Ale's collection (1,704 records):**

| Group | Records | Rule |
| --- | --- | --- |
| LPs | 1,197 | rule 3 |
| LPs | 19 | explicit 12″ |
| LPs | 6 | explicit 10″ |
| Singles | 147 | explicit 7″ |
| Singles | 2 | "Single" or "EP" |
| CDs | 327 | |
| Other | 6 | |

**Purchase simulator on Ale's real collection (records moved by 100 purchases):**

| Shelves | Sort order | Naive | Minimum moves |
| --- | --- | --- | --- |
| Suggested (10% free space spread everywhere) | | 0 | 0 |
| 98% full | Artist | 17.5 | 13.4 |
| 100% full | Genre | 89.4 | 60.6 |

**Tests on the last commit:**
- `npm run test`: exit 0, 180 unit tests.
- `npm run build`: exit 0.
- `npm run test:rls`: 50/50 against the real database.
- End-to-end: the last full run passed 24. The remaining test couldn't sign up because of Clerk's user cap, not the code; it passed earlier tonight on the same import path. Seven tests are skipped by design (they run on one screen size only).

**Open questions** are under "Assumptions and questions for Ale". The ones that most need an answer:
- Guest links and the 6-hour rule: the database now enforces it. Should guests be able to trigger a refresh?
- The 90-day purge.
- The 25,000-record quota.
- Reviewing the Spanish, and finding a Portuguese reviewer.

## After Ale's review (November 20, afternoon)

Ale asked for six changes; three needed a decision, and these were the answers:
- **CD compartments:** each row of CDs is its own compartment (option a). A Kallax cube with a CD insert holds two rows with a board between them.
- **Language of each record as a sort level:** not done (option d). Discogs has no language field. The other sources, MusicBrainz or a model, are out of scope, and inferring it from genres and styles would leave more than half of Ale's collection undetermined: 539 records are Latin by primary genre, 364 have clearly Spanish styles, 14 Portuguese, and 9 French, but the 679 rock records can't be told apart.
- **Help:** visible in the header for everyone (option a).

What changed:
1. **Demo order:** artist, then album title (it was genre, then artist). Only new demos; a saved one keeps its order.
2. **Tour and Help:** the language step is gone (7 steps). "Take the tour" became "Help" ("Ayuda", "Ajuda"): one button in the header on every page, with or without an account. It replaces the account-menu item and the link next to the view tabs. Before the first map, Help starts the tour as soon as the shelf is ready. Also fixed: the tour ended inside a state updater, which caused a React warning.
3. **Lean:** at least the first half of a compartment's records stand upright against the wall, and only the last ones lean, each resting on the one before it. Four singles in a box of 100 are now two upright and two leaning; before, all of them reclined against the wall.
4. **CDs:**
   - Each row of CDs is a compartment of 30 (60 per cube, as before). A Kallax 4×4 for CDs has 8 rows, and the demo's tower has 10.
   - Switching a shelf to or from CDs splits or joins its rows, and a blocked cube blocks both of its rows.
   - Rows of CDs are drawn low and wide (2.1:1). A CD is about 40% of an LP's height, and thicker because a row holds 30 CDs against 80 LPs per cube.
   - Every shelf on the map now shares one compartment width (`sharedCell`), so a one-column tower isn't drawn bigger than a Kallax.
   - CD shelves already saved keep their rows until they're rebuilt in Shelves & order. Before this change there were 2 in the database.
5. **Tags removed:** the tags card, the tag sort level, tag sections, and the data in the browser demo and the guest link. Migration `20261120223524_v2_remove_tags` drops `tags` and `artist_tags`. It was checked first, read-only: 0 tags, 0 artist tags, and 0 shelves or sort orders using them. It also limits sections to genres and recreates `shared_shelf` and `delete_user_data` without the tag tables. A demo saved with tags still loads (`withoutRemovedOptions`).

Checks: `npm run test` passes (195 unit tests); `npm run build` passes; RLS 46/46 against the real database, with 11 tables, all with RLS; migrations are in sync. The tour e2e (7 steps, then Help again without an account) passes at desktop and mobile size.
