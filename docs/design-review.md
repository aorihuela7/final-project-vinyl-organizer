# Design review (v2)

Every page at 390 px (a phone) and 1440 px (a laptop), checked for visual hierarchy, spacing, type, and the loading, empty, and error states. Screenshots are in `docs/screenshots/v2-design/p23-*` (local only: the folder is gitignored because screenshots can show Discogs covers).

## What was checked

| Page or view | 390 px | 1440 px | States covered |
| --- | --- | --- | --- |
| Landing (`/`) | ✓ | ✓ | Import form: empty, invalid username (inline error) |
| Sign in, sign up (Clerk) | ✓ | ✓ | Clerk's own states, themed in Nogal colors |
| Not found | ✓ | ✓ | It's the error state itself, with a way back |
| Onboarding (`/app`, no collection) | ✓ | ✓ | Import error banner after a failed import (e2e) |
| Import progress | ✓ | ✓ | Talking to Discogs, page N of M, "you can close this tab" |
| Map with record card | ✓ | ✓ | Empty card ("Find a record") before a search; off-the-map card |
| Search | ✓ | ✓ | No match ("No records match …"), out of the shelf, no shelf for its format |
| Compartment view | ✓ | ✓ | Empty compartment, over capacity, calibration errors |
| Add a new record | ✓ | ✓ | Empty, searching, no results, Discogs error, no shelf for the format, full shelves |
| Tracklist | ✓ | ✓ | Loading skeleton, error with "Try again", no tracklist |
| Shelves & order | ✓ | ✓ | No shelves, records that won't fit, importing |
| Simulator, share | ✓ | ✓ | No result yet, signed out (share) |
| Guest page (`/s/…`) | ✓ | ✓ | Loading, link off or wrong, data older than 6 hours, error |
| Guided tour | ✓ | ✓ | Offer, waiting for the first map, steps 1–8 |

## What was found and fixed

1. **Narrow banners crushed their text.** At 390 px, the calibration hint (and the "out of the shelf" banner in the record card) kept its buttons beside the text and squeezed the sentence into one word per line. The text now keeps a minimum width, so the buttons wrap under it.
2. **The search sat below three banners on a phone.** On a first visit at 390 px, the demo banner, the "demo ready" notice, and the calibration hint pushed the search, the main action, below the fold. The calibration hint moved below the search row, next to the map it talks about.
3. **The hover bubble could appear over the compartment's title.** When the compartment view opened under a resting pointer, the bubble showed at the top-left corner before the pointer moved. It now appears only once the pointer's position is known.
4. **Shelves & order mixed two kinds of actions.** The simulator, sharing, and the collection come after "Generate map" but save on their own. A heading ("More for your collection") and a line ("These save on their own; they don't need Generate map") now separate them.
5. **Found earlier, during phases 4–12 and the e2e run:** genre plates truncated in 70 px compartments (now genre over range), rail labels cut mid-word (now shown only where they fit whole), a record card that opened as a modal over Shelves & order on desktop, the landing page's hidden copy (Next keeps the previous page in the DOM) matching app selectors, and mustard text on walnut below AA contrast (now ink on a mustard badge).

## Still open

- Clerk's screens are themed but stay in English (translating them needs `@clerk/localizations`).
- With several notices at once on a phone, the top of the map page is still busy; notices could collapse into one line after a few seconds.
- The compartment view is tall on a laptop at 1440 × 900; it scrolls inside the sheet.
