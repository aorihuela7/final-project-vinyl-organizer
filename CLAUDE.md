# Record Organizer · vinyl shelf organizer

Project for Design, Build, Ship (MPCS 51238, UChicago, Autumn 2026). Focus: **Systems**. Author: Ale.
This file is the project context. If something here stops being true, propose the change before moving on.
Reference documents live in `docs/`: the proposal, the v1 brief, and the TAs' comments.

## Language

- **Talk to me in Spanish** (plans, questions, summaries, explanations).
- **Everything in the repository is in English:** UI text, code, comments, commit messages, PR descriptions, README, migrations, and docs you write.

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

## Stack

Next.js (App Router, TypeScript) on Vercel · Clerk for auth (`@clerk/nextjs`) · Supabase Postgres, connected to Clerk through Supabase's native third-party auth integration · Discogs API with the app's personal token, server-side only · Tailwind · Vitest for the algorithm · zod for input validation · Supabase CLI for migrations · GitHub CLI for PRs. No Docker, Redis, or external queues.

## Data model (Postgres on Supabase)

Every table has `user_id text not null default (auth.jwt()->>'sub')`: the Clerk user ID (like `user_2abc…`), so RLS policies stay simple. There is no foreign key to `auth.users` and no users table in v1: Clerk owns the user records.

- `collections`: collection source (`discogs` | `demo` | `manual`), `discogs_username`, `last_synced_at`. One per user in v1.
- `records`: `discogs_release_id`, `discogs_instance_id` (two copies of the same release are two rows), `artist`, `title`, `year`, `label`, `genre` (primary), `styles[]`, `format_name`, `format_qty`, `format_descriptions[]`, `cover_url`, `thumb_url`, `discogs_url`, `synced_at`, `last_seen_job_id`, `origin` (`import` | `added`). Unique on (`user_id`, `discogs_instance_id`).
- `import_jobs`: `status` (`queued` | `running` | `done` | `error`), `next_page`, `total_pages`, `items_total`, `items_done`, `attempts`, `last_error`, timestamps.
- `furniture`: `name`, `template`, `media` (`vinyl` | `cd`), `rows`, `cols`, `traversal` (`rows` | `columns`), `default_capacity`, `sort_index`. Vinyl records flow only through vinyl shelves and CDs only through CD shelves; other formats are imported but not placed.
- `compartments`: `furniture_id`, `row`, `col`, `status` (`available` | `blocked`), `capacity` (optional, overrides the shelf's). Unique on (`furniture_id`, `row`, `col`).
- `shelf_settings`: `sort_levels` (max 3), `ignore_articles`, `slack_pct`.
- `placements`: `record_id` (primary key), `compartment_id`. **This is the physical state of the shelf**: it is stored, not recomputed on every view. Order within a compartment comes from the sort key.
- `layout_events`: `kind` (`initial` | `insert` | `calibrate` | `relayout`), `moves` (jsonb), `moved_count`. This is the baseline the v2 simulator will compare against.

## Algorithm (`src/lib/layout`, pure TypeScript, no Next or Supabase imports)

- **Sort key:** the chosen levels (from: genre, artist, year, label, title), then fixed tiebreakers artist → year → title → id, so the order is total and stable. Compare with `Intl.Collator('en', { sensitivity: 'base', numeric: true })`.
- **Normalization:** strip Discogs' disambiguation suffix from artist names ("Nirvana (2)" → "Nirvana"); optional ignoring of leading articles (configurable list: The, A, An, El, La, Los, Las, Le, Les…); with multiple artists, use the first; if genre is missing, use "No genre".
- **Traversal:** shelves by `sort_index`; within each, by rows (left to right, top to bottom) or by columns (top to bottom, then the next column); blocked compartments are skipped.
- **Invariant 1, contiguity:** walking the sorted collection, the compartment's traversal index never decreases. Each compartment holds a continuous range.
- **Invariant 2, capacity:** after the initial layout, no compartment exceeds its capacity. If the collection doesn't fit, report how many records are left over; never drop them silently.
- **Initial layout:** distribute proportionally to effective capacity (capacity × (1 − slack)), so gaps are spread across the whole shelf (the *library sort* idea).
- **v1 insertion (naive method):** compute the position; candidate = the compartment of the previous record, or of the next one if the previous is full and the next isn't. If it fits, that's 1 move. If not, push the last record to the start of the next available compartment, cascading until there's room. Return the list of moves and their count. In v2 this is replaced by minimum moves, and the naive method stays as the baseline.
- **Calibration:** "X is the first record in compartment C" moves only the boundary between C and the previous available compartment. Reality beats capacity: if C ends up over capacity, flag it, don't block it.
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

- Restrained interface: neutral background, clear typography, a single accent color. The covers bring the color.
- Covers are never altered (no filters, no text on top); they're integrated through the frame: square, same radius and same shadow everywhere.
- Spines in the compartment view: typographic strips (artist · title) colored by the first level of the sort order, from a fixed palette. The cover appears when a spine is tapped and in the neighbors card.
- Record without a cover: our own placeholder (initials on a palette tile), never a broken image.
- Design tokens (colors, type, radii, shadows) in a single file.
- Mobile first: people use it standing in front of their shelf.

## Demo

Demo collection source: the 1,000 most recently added records of the public Discogs collection of user `aorihuelar`, imported through the same path as any username import (10 pages, page cap). Prebuilt shelves: "Living room", Kallax 4×4 with two blocked compartments (turntable); "Studio", tower 1×5. Sort order: genre → artist. Default capacity: 80 records per cube (unmeasured), 70 per crate, 60 CDs per cube; global slack 10%. Without an account, the demo runs entirely in the browser; signing up saves it to the account.

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
- Defaults: sort by artist, ignore articles on, slack 10%, 80 records per cube, 70 per crate, 60 CDs per cube.
