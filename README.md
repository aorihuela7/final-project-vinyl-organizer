# Record Organizer

A web app for record collectors with hundreds or thousands of records. It models your real shelf, compartment by compartment, and **computes** where each record is and where each new record goes, based on the sort order you pick. You never place records one by one.

Project for Design, Build, Ship (MPCS 51238, UChicago, Autumn 2026). Focus: Systems.

## Try it

- **Demo, no account:** open the app and click **Try the demo collection**. It loads 1,000 real records from a public Discogs collection onto two prebuilt shelves. Sign up only if you want to save.
- **Your own collection:** type your Discogs username (the collection must be public) and create an account; the import runs in steps and resumes if you close the tab.

## Run it locally

Requirements: Node 24, npm, and a `.env.local` with these variables (values are not in the repo):

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
npm run dev        # http://localhost:3000
npm run test       # Vitest (layout algorithm and helpers)
npm run build      # production build
```

## Discogs

This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs. 'Discogs' is a trademark of Zink Media, LLC.

Data shown in the app is provided by Discogs and links back to each release. Covers are displayed straight from Discogs' image URLs; they are never downloaded or proxied.
