# Record Organizer

A web app for record collectors with hundreds or thousands of records. It models your real shelf, compartment by compartment, and **computes** where each record is and where each new record goes, based on the sort order you pick. You never place records one by one.

Project for Design, Build, Ship (MPCS 51238, UChicago, Autumn 2026). Focus: **Systems**.

**Live:** https://final-project-vinyl-organizer.vercel.app · **Plan for v2:** [`docs/v2-plan.md`](docs/v2-plan.md) · **What changed in v2:** [below](#whats-new-in-v2) · **Security pass:** [`docs/security-pass.md`](docs/security-pass.md) · **Design review:** [`docs/design-review.md`](docs/design-review.md)

## What's new in v2

Most of these changes come from watching four collectors use v1 ([what we saw](docs/v2-plan.md#what-we-saw-when-people-used-v1)); the rest come from reviewing v2 ourselves.

- **Nogal mid-century design:** walnut furniture on tapered legs, brass nameplates with letter ranges ("# – Al", "Rock A – Fe"), a brass rail for the whole collection with a mustard marker, and every compartment drawn with its records leaning into the free space (`src/lib/visual/lean.ts`, tested for overlaps on ~10 million pairs).
  - *Why:* v1 looked like any generated interface, and its range labels ("5 Seconds Of Summer · 5 – Almendra · Almendra") were hard to read and got cut off on phones. A map that looks like the real cabinet, with short letter ranges and every compartment drawn, is easier to match with the shelf in front of you.
- **LPs and singles on separate shelves:** records are grouped by size from their Discogs formats (12″ and 10″ LPs, 7″ singles, CDs); a 7″ never sits on an LP shelf.
  - *Why:* small records get lost behind 12″ ones (one tester lost a 10″ that way), and v1 treated all vinyl the same, so a 7″ could land between two LPs. Singles, the smallest, now get their own shelves.
- **Minimum-move insertion** for new records, with a **purchase simulator** that compares it with v1's naive method on your own collection ([results](docs/algorithm.md#6b-minimum-move-insertion-v2-insertts-with-strategy-minimum)).
  - *Why:* every record the app moves is one you have to shift by hand, and v1's cascade only pushed forward. On a real collection of 1,725 records at 98% full, it moves about 23% fewer records; with the default 10% free space, neither method moves any.
- **Live capacity** while you build a shelf; **calibration by count**; an optional **thickness by format** (a double LP takes two places).
  - *Why:* one tester's map was one or two compartments off by the end of the shelf, because 80 records per cube is a guess and double albums take more room. Seeing capacity while you build, and telling the app "74 fit here", keeps the map matched to the real shelf.
- **Temporary locations** (gig bag, next to the turntable…) and **Put it back**; **sections** that pin a genre to a shelf.
  - *Why:* three of four testers lose records outside the sorted shelf: a DJ's gig bag, a "discards" box. Put it back gives the exact spot and the neighbors. Sections cover the other thing testers asked for: not keeping the whole collection in one order ("jazz lives in the studio tower").
- **CDs at their real size:** a Kallax cube holds two rows of CDs with a board between them, so each row of CDs is a compartment, drawn low and wide, with every shelf on the map at the same scale.
  - *Why:* a CD drawn as tall as an LP gave the wrong picture, and a compartment the size of the whole cube couldn't say which of the two rows a CD is in.
- **Guest mode:** a revocable read-only link to your shelf.
  - *Why:* one tester lost a record when a guest put it back in the wrong place during a party. With the link, a guest finds a record and sees where it goes, without an account. It works because the shelf lives on the server, not on one phone.
- **Tracklists** from Discogs in the record card; **English, Español, Português**; a **guided tour** for first-time users, which **Help** in the header shows again.
  - *Why:* the tracklist lets you check what's on a record without leaving for Discogs. The languages open the app to collectors who don't read English. The tour helps a new person do the core task with no one helping, and "Help" is the word people look for when they're stuck.
- **Hardening and a security pass:** a Content-Security-Policy for Clerk, generic error messages, a nightly purge of Discogs data from inactive accounts, a Clerk webhook that deletes an account's rows, the shared Discogs budget split fairly between imports and searches, per-account quotas so nobody can fill the free database, and cross-site checks on the import routes ([details](docs/security-pass.md)).
  - *Why:* the Discogs terms ask us not to keep data longer than necessary, so data from deleted and inactive accounts goes away. The whole app shares one Discogs token and one free database, so no single account should be able to use them up for everyone else.

## What you can do

1. **Open it without an account** and try the demo collection: 1,000 real records from a public Discogs collection, on two prebuilt shelves (a Kallax 4×4 with two compartments blocked by the turntable, and a 1×5 tower for CDs).
2. **Import your own collection** by typing your Discogs username (the collection must be public). You create an account right before the import; it runs in steps of 100 records and resumes if you close the tab. Started with the demo? Import yours later from "Shelves & order": it replaces the demo, and you set up your shelves for it.
3. **Build your shelf from templates:** Kallax 4×4, Kallax 5×5, low unit 2×4, tower 1×5, crates in a row, record box, or custom. Edit rows and columns, tap compartments to block them, set the capacity per shelf or per compartment, choose whether it's read by rows or by columns, and whether it holds LPs (12″ and 10″), singles (7″), or CDs (two rows per cube), and optionally pin a section (a genre). Several shelves, in order. How many records fit updates as you edit.
4. **Pick the sort order:** up to three levels from genre, artist, year, label, and title, with "ignore articles", free space, and thickness by format.
5. **See the map:** walnut furniture where every compartment shows its letters on a brass plate, how full it is, and a drawing of its records; a brass rail per format shows the whole collection. Open a compartment to see the same drawing up close and its records in order.
6. **Search a record:** shelf, row, column, how far into the compartment ("about 40% in from the left"), the two records on each side, and its tracklist.
7. **Calibrate:** "This is the first record in this compartment" or "There are 74 records here" moves one boundary so the map matches the real shelf.
8. **Add a new record.** Search Discogs for a new purchase, see where it goes and what has to move (with minimum moves), and add it.
9. **Take a record out** to a temporary place and **put it back** in its spot; **share** a read-only link with guests.

Signing up is only needed to save your shelf or to import your own collection.

## How it works

- `src/lib/layout/`: the layout algorithm in pure TypeScript (sort key, traversal, format groups, proportional initial layout, naive insertion with cascading overflow, minimum-move insertion, purchase simulator, calibration, position, neighbors). **Read [`docs/algorithm.md`](docs/algorithm.md)** for the explanation and a worked 10-record example.
- `src/lib/import/` and `src/app/api/import/*`: resumable import jobs stored in Postgres (`import_jobs`), one page per step, upserted by Discogs instance id. When a full sync finishes, records it didn't see are deleted. Data older than 6 hours is refreshed when you open the app ("Updating from Discogs…").
- `src/lib/discogs/`: the server-only Discogs client (app token, unique User-Agent, reads `X-Discogs-Ratelimit-Remaining`, exponential backoff on 429) and the pure mapping to our rows.
- `supabase/migrations/`: schema, row-level security, grants, and the `save_setup` / `apply_placements` functions that write a whole change in one transaction.
- `src/components/app/`: the app screens. Without an account, state lives in `localStorage`; signed in, in Supabase. Both use the same algorithm.
- `src/styles/tokens.css`: every design token (colors, type, radii, shadows, spine palette).

Stack: Next.js 16 (App Router, TypeScript, Tailwind 4) · Clerk for accounts · Supabase Postgres through Supabase's third-party auth integration with Clerk · Discogs API · Vitest and Playwright.

## Run it locally

Requirements: Node 24, npm, the Supabase CLI (for migrations), and a `.env.local` with these variables (values are never in the repo):

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (browser and server) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key, `sb_publishable_…` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk, server only |
| `DISCOGS_TOKEN` | Discogs personal token, server only |
| `DISCOGS_USER_AGENT` | Unique User-Agent for Discogs requests |
| `CRON_SECRET` | Protects `/api/cron/keepalive` |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Verifies Clerk's account deletion webhook (optional until set up) |
| `USER_DELETION_SECRET` | Lets that webhook call `delete_user_data` (its SHA-256 is stored in `private.settings`) |

```bash
npm install
supabase link --project-ref <your-project-ref>
supabase db push --remote          # apply the migrations
npm run dev                        # http://localhost:3000
```

Supabase must have Clerk added as a third-party auth provider (Authentication → Sign In / Providers → Third-Party Auth), and the Clerk instance must have the Supabase integration activated, so session tokens carry `role: authenticated`.

## Tests

```bash
npm run test           # Vitest: layout algorithm, Discogs mapping, search, validation, rate limiting
npm run build          # production build
npm run lint
npm run test:rls       # two Clerk test users: one can't read or change the other's rows, plus the database limits (needs .env.local)
npm run check:import   # full import and demo import through the API; counts match Discogs (needs npm run dev)
npm run test:e2e       # Playwright: the core task as a new user, the v2 features, desktop and mobile (needs .env.local)
npx tsx --env-file=.env.local scripts/simulate.ts [username]   # purchase simulator on a real collection
```

The end-to-end tests sign up new users with Clerk's testing helpers (`@clerk/testing`) and `+clerk_test` emails, which only work on a Clerk development instance. That instance allows at most 100 users and each run adds about 25, so clean up after running them: `npm run test-users` counts them, and `npm run test-users -- --delete` deletes the e2e users (only `e2e-…+clerk_test@example.com`) and their rows.

## Deploy

Vercel, framework preset Next.js, with the seven environment variables above. `vercel.json` schedules a daily cron to `/api/cron/keepalive` (Vercel sends `CRON_SECRET` as a bearer token), which runs one minimal query so the free Supabase project isn't paused.

## Data and Discogs

This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs. 'Discogs' is a trademark of Zink Media, LLC.

- Data shown in the app is provided by Discogs and links back to each release.
- Covers are displayed straight from Discogs' image URLs with `<img loading="lazy">`; they are never downloaded, proxied, or optimized through our server.
- Collection data is refreshed when it's more than 6 hours old. The demo for visitors without an account is cached on the server for at most 2 hours and kept in the visitor's browser until it's 6 hours old.
- What we store per user: the records of their collection (to compute the shelf), their shelves, their sort settings, where each record is, temporary locations, guest links, preferences, and a log of layout changes. Records of accounts that haven't opened the app in 90 days are deleted every night (`pg_cron`); deleting a Clerk account deletes its rows (once the webhook is configured).
- Tracklists are fetched from Discogs when a record card opens and cached on the server for at most 6 hours; they're never stored in the database.
- Guest links show a shelf only while its Discogs data is less than 6 hours old.
- Only public collections can be imported (no Discogs OAuth), and nothing is ever written to Discogs.
