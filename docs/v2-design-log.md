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
| 0. Issues, CLAUDE.md, branch | Doing | Branch `v2-design` and this log created |
| 1. Foundations | Todo | |
| 2. Lean function | Todo | |
| 3. Format groups | Todo | |
| 4. Map | Todo | |
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
| 15+. Remaining v2-plan issues | Todo | Listed once the issues exist |

## Assumptions and questions for Ale

- **Order of the v2-plan issues vs. the Nogal phases.** Ale asked to implement the v2-plan issues too. Taken: Nogal phases first, then the remaining issues (minimum-move insertion and simulator, temporary locations, better calibration, custom sections and tags, guest mode, hardening, security pass, design review). Why: the redesign touches every screen, and the plan's constraint "modify `src/lib/layout` only for the format groups" applies to the Nogal phases; the minimum-move work changes the layout code afterwards, as the v2 plan says. Easy to change: the order is only a sequence of slices.

## Blocked: needs Ale

(none yet)

## Ideas for v2

(none yet)

## Resuming

If the session stops on a usage limit, a recurring session job (created when the phases start) re-enqueues: "Continue the v2 overnight run: re-read docs/v2-design-plan.md and docs/v2-design-log.md, then pick up the first phase that isn't Done." It only fires while the session is idle, and it's a no-op once the morning summary is written.

## Timeline

- 2026-11-20 02:34 CST · Kickoff answers recorded, fonts approved, branch `v2-design` created from `main`.

## Morning summary

(written at the end of the run)
