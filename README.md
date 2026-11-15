# Record Organizer

A web app for record collectors with hundreds or thousands of records. It models your real shelf, compartment by compartment, and **computes** where each record is and where each new record goes, based on the sort order you pick. You never place records one by one.

Project for Design, Build, Ship (MPCS 51238, UChicago, Autumn 2026). Focus: **Systems**.

## What you can do

1. **Open it without an account** and try the demo collection: 1,000 real records from a public Discogs collection, on two prebuilt shelves (a Kallax 4×4 with two compartments blocked by the turntable, and a 1×5 tower for CDs).
2. **Import your own collection** by typing your Discogs username (the collection must be public). You create an account right before the import; it runs in steps of 100 records and resumes if you close the tab.
3. **Build your shelf from templates:** Kallax 4×4, Kallax 5×5, low unit 2×4, tower 1×5, crates in a row, or custom. Edit rows and columns, tap compartments to block them, set the capacity per shelf or per compartment, choose whether it's read by rows or by columns, and whether it holds vinyl or CDs. Several shelves, in order.
4. **Pick the sort order:** up to three levels from genre, artist, year, label, and title, with "ignore articles" and a slack percentage.
5. **See the map:** every compartment with its range ("A – Bea") and how full it is.
6. **Search a record:** shelf, row, column, how far into the compartment ("40% from the left"), and the two records on each side.
7. **Calibrate:** "This is the first record in this compartment" moves one boundary so the map matches the real shelf.
8. **Where does this record go?** Search Discogs for a new purchase, see where it goes and how many records must move, and add it.

Signing up is only needed to save your shelf or to import your own collection.

## How it works

- `src/lib/layout/`: the layout algorithm in pure TypeScript (sort key, traversal, proportional initial layout, naive insertion with cascading overflow, calibration, position, neighbors, ranges). **Read [`docs/algorithm.md`](docs/algorithm.md)** for the explanation and a worked 10-record example.
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
npm run test:rls       # two Clerk test users: one can't read or change the other's rows (needs .env.local)
npm run check:import   # full import and demo import through the API; counts match Discogs (needs npm run dev)
npm run test:e2e       # Playwright: the core task as a new user, desktop and mobile (needs .env.local)
```

The end-to-end tests sign up new users with Clerk's testing helpers (`@clerk/testing`) and `+clerk_test` emails, which only work on a Clerk development instance.

## Deploy

Vercel, framework preset Next.js, with the seven environment variables above. `vercel.json` schedules a daily cron to `/api/cron/keepalive` (Vercel sends `CRON_SECRET` as a bearer token), which runs one minimal query so the free Supabase project isn't paused.

## Data and Discogs

This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs. 'Discogs' is a trademark of Zink Media, LLC.

- Data shown in the app is provided by Discogs and links back to each release.
- Covers are displayed straight from Discogs' image URLs with `<img loading="lazy">`; they are never downloaded, proxied, or optimized through our server.
- Collection data is refreshed when it's more than 6 hours old. The demo for visitors without an account is cached on the server for at most 2 hours and kept in the visitor's browser until it's 6 hours old.
- What we store per user: the records of their collection (to compute the shelf), their shelves, their sort settings, where each record is, and a log of layout changes. v1 has no automatic deletion for accounts that stop using the app; that's planned for v2.
- Only public collections can be imported (no Discogs OAuth), and nothing is ever written to Discogs.
