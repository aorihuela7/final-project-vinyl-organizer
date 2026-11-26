# Record Organizer · vinyl shelf organizer

Project for Design, Build, Ship (MPCS 51238, UChicago, Autumn 2026). Focus: **Systems**. Author: Ale.
This file is the project context. If something here stops being true, propose the change before moving on.
Reference documents live in `docs/`: the proposal, the v1 brief, and the TAs' comments.

## Language

- **Talk to me in Spanish** (plans, questions, summaries, explanations).
- **Everything in the repository is in English:** code, comments, commit messages, PR descriptions, README, migrations, and docs you write.
- **The UI is multilingual since v2:** English (default), Español, Português, through the dictionaries in `src/i18n/`. Every UI string goes through them; English is the source. The Discogs notice and "Data provided by Discogs" stay verbatim in English, and Discogs data (artists, titles, labels, styles) is never translated. Genre names are shown translated, but sorting always uses the canonical Discogs name.

## What it is

A web app for collectors with hundreds or thousands of records. It models their real shelf, compartment by compartment, and **computes** where each record is and where each new record goes, based on the order the user picks. The user never places records one by one.

## How it differs from what already exists

Shelfify (native app) already maps Kallax-style shelves and shows neighboring records, but the user places each record in its compartment by hand, the data lives only on the phone, and it doesn't compute where a new purchase goes. Here, location is derived from the sort order and capacity, the map is matched to reality with very little input, and everything lives on a server (the basis for guest mode in v2). Every v1 decision should protect that difference.

## v1 core task (due Tuesday, November 17, 5:30 PM)

A new person, start to finish, without help:

1. Opens the app without signing in (no login wall) and either tries the demo collection right away or types their Discogs username; signing up is asked only to save their work or to run their own import.
2. Imports their public Discogs collection with their username, or picks the demo collection.
3. Builds their shelf from a template and picks their sort order.
4. Sees the map: each compartment with its range ("A – Bea") and how full it is.
5. Searches for a record and sees which shelf, row, and column it's in, how far into the compartment, and which two records it sits between.

If time allows, in this order: (a) calibration with "This is the first record in this compartment"; (b) "Where does this record go?" with Discogs search and an Add button.

## Scope

**In v1:** sign-up and sign-in with Clerk; import by Discogs username, in chunks and resumable; demo collection through the same path; shelf templates (Kallax 4×4, Kallax 5×5, low unit 2×4, tower 1×5, crates in a row, custom); editable rows and columns; block compartments by tapping them; capacity per shelf with per-compartment override; traversal by rows or by columns; multiple shelves in order; sort order with up to 3 levels; global slack in %; persisted map; search with neighbors; compartment view and record card; Discogs notices; daily cron; README.

**Out of v1 (don't build it even if it looks easy):** drag-and-drop editor, multiple rooms, per-compartment dimensions, splitting or merging compartments, thickness by format, temporary locations, minimum-move rearrangement, purchase simulator, sort-order suggestions, guest mode or QR, tracklists, MusicBrainz, any AI model call, Discogs OAuth, writing to Discogs, CSV import, barcode scanning, printable dividers.

## v2 scope (due Tuesday, December 1, 5:30 PM, at the project fair)

Plans: `docs/v2-plan.md` (what we learned from v1 and what to add) and `docs/v2-design-plan.md` (the Nogal redesign and its features). Work is tracked in GitHub issues #4–#23.

**In v2:**
- The **Nogal mid-century** redesign (`docs/design/nogal.html` is the visual spec).
- **Format groups:** LPs (12″ and 10″), singles (7″), CDs, and other (cassettes and the rest: ignored, see the Decisions log). Each group is laid out separately on its own shelves; a 7″ never sits on an LP shelf.
- **Letter plates** on the map instead of names; a **brass rail** per format group.
- **Live capacity** in the shelf builder.
- **"Add a new record"** (renamed from "Where does this record go?").
- **Tracklists** from Discogs in the record detail (fetched on demand, cached at most 6 hours, never stored in the database).
- **Language selector** (English, Español, Português) and a **guided tour**, reopened any time from Help in the header.
- From `docs/v2-plan.md`: easier calibration, minimum-move insertion with a purchase simulator (the naive method stays as the baseline), temporary locations and "Put it back", calibration by count and thickness by format, custom sections (by genre), guest mode (read-only link or QR), and the hardening list (Clerk deletion webhook, purge of inactive accounts, CSP, no database errors in the browser).

**Still out in v2:** drag-and-drop editor, multiple rooms, per-compartment dimensions, splitting or merging compartments, sort-order suggestions, MusicBrainz, any AI model call, Discogs OAuth, writing to Discogs, CSV import and manual entry, barcode scanning, printable dividers, dark mode, stores and Discogs inventory.

## Stack

Next.js (App Router, TypeScript) on Vercel · Clerk for auth (`@clerk/nextjs`) · Supabase Postgres, connected to Clerk through Supabase's native third-party auth integration · Discogs API with the app's personal token, server-side only · Tailwind · Vitest for the algorithm · zod for input validation · Supabase CLI for migrations · GitHub CLI for PRs. No Docker, Redis, or external queues.

## Data model (Postgres on Supabase)

Every table has `user_id text not null default (auth.jwt()->>'sub')`: the Clerk user ID (like `user_2abc…`), so RLS policies stay simple. There is no foreign key to `auth.users` and no users table in v1: Clerk owns the user records.

- `collections`: collection source (`discogs` | `demo` | `manual`), `discogs_username`, `last_synced_at`. One per user in v1.
- `records`: `discogs_release_id`, `discogs_instance_id` (two copies of the same release are two rows), `artist`, `title`, `year`, `label`, `genre` (primary), `styles[]`, `format_name`, `format_qty`, `format_descriptions[]`, `cover_url`, `thumb_url`, `discogs_url`, `synced_at`, `last_seen_job_id`, `origin` (`import` | `added`). Unique on (`user_id`, `discogs_instance_id`).
- `import_jobs`: `status` (`queued` | `running` | `done` | `error`), `next_page`, `total_pages`, `items_total`, `items_done`, `attempts`, `last_error`, timestamps.
- `furniture`: `name`, `template` (adds `record_box` in v2), `media` (`vinyl` | `single` | `cd`), `rows`, `cols`, `traversal` (`rows` | `columns`), `default_capacity`, `sort_index`. In the database `vinyl` means **LPs (12″ and 10″)**: the value stays `vinyl` so the deployed v1 keeps working, and renaming it to `lp` is a later migration. LPs flow only through LP shelves, singles only through singles shelves, CDs only through CD shelves; other formats are imported (a sync compares its count with Discogs') but never placed or shown.
- `records` also has `size_inches` (7, 10, 12, or null) and `format_group` (`lp` | `single` | `cd` | `other`), computed from the Discogs formats (see Algorithm) by a database trigger and by the import.
- `user_preferences` (v2): `locale` (`en` | `es` | `pt`), `tour_status`. Exists before any shelf is saved.
- `compartments`: `furniture_id`, `row`, `col`, `status` (`available` | `blocked`), `capacity` (optional, overrides the shelf's). Unique on (`furniture_id`, `row`, `col`).
- `shelf_settings`: `sort_levels` (max 3), `ignore_articles`, `slack_pct`.
- `placements`: `record_id` (primary key), `compartment_id`. **This is the physical state of the shelf**: it is stored, not recomputed on every view. Order within a compartment comes from the sort key.
- `layout_events`: `kind` (`initial` | `insert` | `calibrate` | `relayout`), `moves` (jsonb), `moved_count`. This is the baseline the v2 simulator will compare against.

## Algorithm (`src/lib/layout`, pure TypeScript, no Next or Supabase imports)

- **Sort key:** the chosen levels (from: genre, artist, year, label, title), then fixed tiebreakers artist → year → title → id, so the order is total and stable. Compare with `Intl.Collator('en', { sensitivity: 'base', numeric: true })`.
- **Normalization:** strip Discogs' disambiguation suffix from artist names ("Nirvana (2)" → "Nirvana"); optional ignoring of leading articles (configurable list: The, A, An, El, La, Los, Las, Le, Les…; off by default); names that differ only by a leading article, case, or accents are one artist: if the collection has both "The Beatles" and "Beatles", all of them sort under "The Beatles"; with multiple artists, use the first; if genre is missing, use "No genre".
- **Format groups (v2):** an explicit size wins (`7"` → single; `10"` or `12"` → LP); with no size, the exact description `Single` or `EP` → single; everything else on vinyl → LP (12″); with several formats, the largest size wins. CDs are their own group; everything else is `other`. Each group is laid out independently with the same sort settings.
- **Traversal:** shelves by `sort_index`; within each, by rows (left to right, top to bottom) or by columns (top to bottom, then the next column); blocked compartments are skipped.
- **Invariant 1, contiguity:** walking the sorted collection, the compartment's traversal index never decreases. Each compartment holds a continuous range.
- **Invariant 2, capacity:** after the initial layout, no compartment exceeds its capacity. If the collection doesn't fit, report how many records are left over; never drop them silently.
- **Initial layout:** use the fewest compartments, in traversal order, whose effective capacity (capacity × (1 − slack)) holds the collection, and distribute proportionally to effective capacity among them, so gaps are spread among the records (the *library sort* idea) and a small collection stays together; the compartments it doesn't need stay empty at the end.
- **v1 insertion (naive method):** compute the position; candidate = the compartment of the previous record, or of the next one if the previous is full and the next isn't. If it fits, that's 1 move. If not, push the last record to the start of the next available compartment, cascading until there's room. Return the list of moves and their count. In v2 this is replaced by minimum moves, and the naive method stays as the baseline.
- **Calibration:** "X is the first record in compartment C" moves only the boundary between C and the previous available compartment. Reality beats capacity: if C ends up over capacity, flag it, don't block it. (The algorithm and its tests stay; since November 25, 2026 the app has no calibration UI.)
- **Position within the compartment:** (index + 0.5) / total, shown as "40% from the left".
- **Neighbors:** two before and two after in global order, each with its compartment.
- **Changing the sort order or the shelf** recomputes the whole layout: ask for confirmation and say how many records change compartment.
- Every rule above has a Vitest test (ties, articles, suffixes, blocked compartments, column traversal, cascading overflow, calibration, a collection that doesn't fit).

## Auth (Clerk + Supabase)

- Clerk handles sign-up, sign-in, sessions, and email verification. Use its prebuilt components and protect routes with Clerk's middleware. Don't call Supabase Auth APIs (`signUp`, `signInWithPassword`, etc.).
- Every Supabase client (server and browser) sends Clerk's session token through the supabase-js `accessToken` option, so RLS sees the Clerk user. Don't use the deprecated Clerk "supabase" JWT template.
- If I point you to a previous assignment that used Clerk + Supabase, reuse its patterns, but follow the current native integration where they differ.

## Import and freshness

- Each step of an `import_job` processes one page of 100 from `GET /users/{username}/collection/folders/0/releases`, upserts by `discogs_instance_id`, and advances `next_page`. The UI shows progress and requests the next step; if the user closes the tab, the job stays in the database and resumes.
- When a full sync finishes, records that job didn't see are deleted (and lose their placement). New records found in a re-sync go in through insertion, not a full relayout.
- One collection per user. Importing a different collection (the demo → your own, or another username, from "Shelves & order") replaces the current one only when that import finishes: every record it didn't see (added ones too) and the shelves are deleted, and the user builds shelves again for the new collection. An import that fails (typo, private collection) changes nothing.
- If `last_synced_at` is more than 6 hours old when the user opens the app, re-sync and show "Updating…".
- There is one token for the whole app: send a unique User-Agent, read `X-Discogs-Ratelimit-Remaining`, back off exponentially on a 429, and allow only one active job per user.

## Discogs: non-negotiable rules

- Follow the API Terms of Use: https://support.discogs.com/hc/en-us/articles/360009334593
- Non-affiliation notice visible in the footer of every page: copy the exact text from the terms, don't paraphrase it.
- "Data provided by Discogs" next to every piece of Discogs data, linking to that release's page.
- Don't display content more than 6 hours out of date, and don't store anything longer than necessary.
- Covers: display them straight from the URL the API returns. Don't download them, don't route them through our own proxy, and don't use `next/image` optimization (it would store copies on Vercel and burn the free quota): use `<img loading="lazy">`.
- If a case isn't clear in the terms, ask me; don't invent an interpretation.

## Covers and design

- **Nogal mid-century (v2):** a 1960s living room. Sage wall background, walnut furniture on tapered legs, brass plates under each compartment, a brass rail for the whole collection, and mustard for what you found. Display face Belleza, text face Nunito Sans (both through `next/font`). The spec is `docs/v2-design-plan.md` and `docs/design/nogal.html`.
- Covers are never altered (no filters, no text on top); they're integrated through the frame: square, same radius and same shadow everywhere.
- **Compartment drawing:** one SVG component in three sizes (map, compartment view, record detail). Each record is a thin shape, one record's share of the capacity wide, colored by a hash of its record ID into the fixed spine palette (mustard is reserved for the found record), with heights by size (12″, 10″, 7″, and CDs at about 40% of an LP's height, a bit thicker). Records lean into free space following `src/lib/visual/lean.ts` (visual only, never affects placement): at least the first half always stands upright against the wall, and only the last ones lean, each resting on the one before, at most 18°. Every record stands on the floor; the found record is drawn in mustard where it stands (it isn't lifted). Hovering or focusing a record shows artist and title; clicking it opens the record card, and only there the cover. On phones the compartment view adds a tappable text list under the drawing.
- Record without a cover: our own placeholder (initials on a palette tile), never a broken image.
- Design tokens (colors, type, radii, shadows) in a single file.
- Plain sentences in sentence case; no strings joined with middle dots; no all-caps labels.
- Mobile first: people use it standing in front of their shelf.

## Demo

Demo collection source: the 1,000 most recently added records of the public Discogs collection of user `aorihuelar`, imported through the same path as any username import (10 pages, page cap). Prebuilt shelves: "Living room", cube shelf 4×4 with two blocked compartments (turntable); "Studio", tower 1×5; and in v2 a "Singles box" (record box 1×3) when the demo collection has singles. Sort order: artist → title. Default capacity: 80 records per cube (unmeasured), 70 per crate, 60 CDs per cube (two rows of 30, each row its own compartment); global slack 10%. Without an account, the demo runs entirely in the browser; signing up saves it to the account.

## Security and free tiers

- Secrets only in environment variables (`.env.local` locally, Vercel in production), never in the repository. `.env*` is in `.gitignore`.
- Don't read or edit `.env*` (there's a deny rule). If a new variable is needed, tell me its name and purpose; I'll add it.
- Environment variable names (already set in `.env.local`):
  - Public: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_…` key), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
  - Server only: `CLERK_SECRET_KEY`, `DISCOGS_TOKEN`, `DISCOGS_USER_AGENT`, `CRON_SECRET`.
- Don't use the Supabase secret key or the legacy service role key in v1.
- RLS enabled on every table, with policies like `(select auth.jwt()->>'sub') = user_id` for the `authenticated` role. Never use `auth.uid()`: it casts the ID to uuid and fails with Clerk IDs. A test proves one account can't see another's data.
- This Supabase project is new: besides RLS, tables may need explicit grants to be reachable through the Data API. Check the current Supabase docs when writing the first migration.
- Validate every API route input with zod, including the Discogs username.
- Free tier everywhere, no payment method. Don't add services without asking.
- Daily Vercel cron at `/api/cron/keepalive`, protected with `CRON_SECRET`, running a minimal query so Supabase doesn't pause.

## Conventions

- Strict TypeScript.
- Migrations with Supabase CLI in `supabase/migrations`; never change the schema by hand in the dashboard.
- Few dependencies; ask before adding one.
- `npm run test` and `npm run build` pass before every commit.
- One branch per session, merged into `main` through a PR (`/security-review` compares the branch against `main`).

## How we work

- When starting a task, propose a short plan and wait for my approval.
- Work in small slices that work end to end; commit after each one.
- When done, summarize in a few lines what changed, how I test it, and what you decided for me.
- If you're torn between two paths, explain the tradeoff and ask: product decisions are mine.
- I have to be able to explain and defend the algorithm in class: explain it to me when I ask.

## Decisions log

(Ale fills this in as the project moves forward.)

- Name: Record Organizer (working name, in a single constant).
- Demo source: the 1,000 most recently added records of Discogs user `aorihuelar`, through the normal import path.
- Calibration in v1 (first record per compartment / count / none): yes, first record per compartment.
- "Where does this record go?" in v1 (yes / no): yes.
- Sign-in: email + password without email verification, plus Google (Clerk).
- No login wall: the demo works without an account (in the browser); sign-up is asked to save or to run an own import.
- Formats: shelves hold vinyl or CDs; each media is laid out separately with the same sort settings.
- Defaults: sort by artist, ignore articles off ("The Beatles" under T), slack 10%, 80 records per cube, 70 per crate, 60 CDs per cube (two rows of 30).
- Artist spellings: "The Beatles" and "Beatles" are the same artist and sort together under the spelling with the article.
- Switching collections: one per user; a new import replaces the old collection and its shelves, then "Build your shelf" with suggested templates.
- Compartment view (v1): vertical spines with a hover bubble on larger screens; replaced in v2 by the Nogal lean drawing.
- v2 design: Nogal mid-century; fonts Belleza (display) and Nunito Sans (text).
- v2 format groups: LPs (12″ and 10″) and singles (7″) on separate shelves; singles were removed from LP shelves without moving any LP. Singles capacity: 150 per Kallax cube (one row deep), 100 per record box (unmeasured).
- v2 languages: English (default), Español, Português; Ale reviews the Spanish, the Portuguese needs a native speaker's review.
- v2 kickoff answers and assumptions: `docs/v2-design-log.md`.
- Demo order (November 20, 2026): by artist, then album title.
- CD shelves (November 20, 2026): a Kallax cube for CDs holds two rows of 30 with a board in the middle; each row is its own compartment.
- Leaning (November 20, 2026): at least the first half of the records in a compartment stands upright, even when there are few; only the last ones lean. Same rule for every format.
- Help (November 20, 2026): one Help button in the header for everyone reopens the tour; the tour has no language step.
- Start from scratch (November 21, 2026): for people without Discogs, "Start from scratch" imports the empty public collection `aorihuelam` behind the scenes (its username never shows, and anything it gains on Discogs is ignored); records are then added one by one with "Add a new record" and belong to each account. Every username field lists five public collections to try (oddcd, tubasmarty, wooda, veale001, wcdwinnell) with their live size from Discogs; the list opens when the field gets focus.
- Calibration (November 25, 2026): removed from the app, both "The first record here is different…" and "Count the records here", and the map's "Match a compartment" hint. The algorithm and its tests stay in `src/lib/layout`.
- Other formats (November 25, 2026): cassettes and every format that doesn't go on a shelf are ignored in any collection: never counted, searched, offered in "Add a new record", or mentioned.
- Notices (November 25, 2026): no notice about singles moving to their own shelves.
- Shelf names (November 25, 2026): no brand names: "Kallax" is "Cube shelf" (Estante de cubos, Estante de nichos). Sizes in names are width × height ("Tower 1×5", "Low unit 4×2") and follow the shelf when its rows or columns change. Shelves go up to 20 rows of cubes and 20 columns.
- Brass rail (November 25, 2026): not on the landing page, only inside a collection or the demo. Its marker can be dragged; letting go picks the record at that spot.
- Nameplates (November 25, 2026): flat engraved brass held by two small screws, so they don't look like buttons. Each compartment view shows its count badge, as on the map.
- Initial layout (November 26, 2026): the fewest compartments that hold the collection with its free space, records spread evenly over them; the rest stay empty. Before, the collection was spread over every compartment, which scattered small collections (two records by one artist ended up several compartments apart after adding an empty shelf).
- Suggested shelves (November 26, 2026): room for the collection plus about 20%, never less than one compartment, and every record always fits: LPs get the smallest rectangle of cubes up to 5×5 (any shape, several shelves past that), singles a record box with 1 to 3 compartments (cubes past that), CDs cubes of two rows. An empty collection gets one cube.
- Drawing (November 26, 2026): records never lift off the floor, and lean at most 18°.
- Landing page (November 26, 2026): "Start from scratch" above the Discogs import, which says in one sentence what Discogs is (with a link); no Sign up button next to the demo. Choosing another collection from the landing page while you have one asks first. Starting from scratch never shows "importing" or Discogs.
- Missing shelf (November 26, 2026): when a new record's format has no shelf, "Add a new record" offers a button that opens Shelves & order with that shelf added.
