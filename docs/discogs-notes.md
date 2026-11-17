# Discogs notes (Phase 1 spike)

Source: `scripts/discogs-spike.ts`, run on 2026-11-14 against the public collection of `aorihuelar` with `npx tsx --env-file=.env.local scripts/discogs-spike.ts`.

## What the API returned

- `GET /users/aorihuelar/collection/folders/0/releases?per_page=100&sort=added&sort_order=asc` → 200, `pagination.items = 1704`, `pages = 18`. A full scan of the 18 pages returned exactly 1,704 items with 1,704 unique `instance_id`s (23 releases are owned more than once, so `release_id` is not unique and `instance_id` is the right key).
- Rate limit with the token: `X-Discogs-Ratelimit: 60`, `-Used`, `-Remaining` (60 per minute, a moving window). Without a token: limit 25. A public collection is readable without a token, but the token gives the higher limit, and `/database/search` requires it.
- Cover URLs (`cover_image`, `thumb`) are on `i.discogs.com`, already signed in the path, and load without auth (`GET` → 200 `image/jpeg`). `cover_image` is up to 600 px; `thumb` is 150 px. We display them straight from these URLs with `<img loading="lazy">`.
- `GET /database/search?q=Kind of Blue Miles Davis&type=release` → 200, 1,053 results. Each result has `id`, `title` as `"Artist - Title"` (one string, has to be split), `year` as a string, `format[]` (flat list like `Vinyl, LP, Album, Reissue`), `genre[]`, `label[]`, `cover_image`, `thumb`.

Example item (`basic_information` of a collection item):

```
release_id 404532 · instance_id 1937271993 · date_added 2025-02-17T20:12:01-08:00
artists [{ name: "George Michael", anv: "", join: "" }]
title "Faith" · year 1987
labels ["Columbia", "Columbia", "Columbia", "Columbia"]
genres ["Rock", "Funk / Soul", "Pop"] · styles ["Soft Rock", "Rhythm & Blues", "Pop Rock", "Soul"]
formats [{ name: "Vinyl", qty: "1", text: "Carrollton Pressing…", descriptions: [...] }]
```

## Fields we use

| Our column | From | Notes |
| --- | --- | --- |
| `discogs_instance_id` | `instance_id` | Unique per copy. Upsert key. |
| `discogs_release_id` | `basic_information.id` | Link to `https://www.discogs.com/release/{id}`. |
| `artist` | `artists[0].name` | First artist only; the disambiguation suffix is stripped in the sort key, not in storage, so the stored value stays faithful. |
| `title` | `title` | Trimmed (one title ends with a space). |
| `year` | `year` | `0` means unknown (210 of 1,704). Stored as null. |
| `label` | `labels[0].name` | Labels repeat (`Columbia` ×4); we keep the first. |
| `genre` | `genres[0]` | Primary genre. All 1,704 had one; the "No genre" fallback stays for safety. |
| `styles` | `styles` | Stored for the record card. |
| `format_name`, `format_qty`, `format_descriptions` | `formats[0]` | See "Media" below for which format decides the shelf. |
| `cover_url`, `thumb_url` | `cover_image`, `thumb` | Empty or `spacer.gif` means "no cover" → placeholder. |

Sort key levels available in v1: genre, artist, year, label, title (all present above).

## Edge cases seen in this collection

- **Artist suffixes:** 102 records, e.g. "Ivan (4)", "America (2)", "Asia (2)", "Elefante (2)". Strip `\s\(\d+\)$` for sorting and display.
- **Multiple artists:** 136 records, joined with "And", "•", "," in the `join` field. We use the first artist.
- **"Various":** 100 compilations have the artist "Various". They sort under V, like on most shelves.
- **Leading articles:** 202 records start with The/A/An/El/La/Los/Las/Le/Les, many in Spanish ("Los Diplomáticos", "Las 100 Cuerdas…"). This confirms the Spanish articles in the ignore list.
- **No year:** 210 records (`year = 0`). In a year level they sort after all known years.
- **No cover:** 2 records.
- **No genre:** 0 here, but the code keeps "No genre".
- **Multiple formats:** 43 records (box sets, vinyl + CD editions).
- **Format mix (first format):** Vinyl 1,367 · CD 327 · Cassette 4 · Box Set 2 · Shellac 1 · File 1 · DVD 1 · Flexi-disc 1. `format_qty > 1` on 182 records (double LPs and the like). 7" on 147, 10" on 6, 12" explicit on 19.
- **Media rule (decided):** walk `formats` in order; the first one named `Vinyl`, `Shellac`, or `Flexi-disc` makes it a vinyl-shelf record; the first one named `CD` (or `CDr`) makes it a CD-shelf record; anything else (Cassette, File, DVD, a Box Set with no vinyl or CD inside) is imported but not placed.

## Import risks

1. **One token for the whole app:** 60 requests per minute shared by every user. A 1,704-record collection is 18 requests, so one import takes about 20–40 seconds when nobody else is importing. At the fair, ten people importing at once would hit the limit: back off on 429 and read `X-Discogs-Ratelimit-Remaining` before each step.
2. **Pages shift during an import:** if the user adds or removes records on Discogs mid-import, offsets move. We sort by `added` ascending so new records land at the end, upserts by `instance_id` are idempotent, and the sweep only runs after a job that saw every page.
3. **Private or missing collections:** an unknown username returns 404 `{"message":"User does not exist or may have been deleted."}` (checked). A private collection should return 403 (not checked: no private collection to test with). Show a clear message ("This collection isn't public") and don't create a job.
4. **Serverless time limits:** one page per step (~1 s) stays far below Vercel's limits; the browser drives the steps, so closing the tab only pauses the job.
5. **Freshness (6 hours):** collection data changes on Discogs; re-sync when `last_synced_at` is older than 6 hours.
6. **Demo:** the demo reads only the 10 most recent pages (`sort=added&sort_order=desc`, 1,000 records), so it costs 10 requests per demo import.
