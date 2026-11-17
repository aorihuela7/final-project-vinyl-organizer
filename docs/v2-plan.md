# Plan for v2

Record Organizer · v2 is due at the fair on December 1, 2026.

## Where v1 stands

v1 is live at https://final-project-vinyl-organizer.vercel.app. A new person can do the whole core task without help: open the demo without an account, or import a public Discogs collection by username; build shelves from templates; pick a sort order; see the map with each compartment's range and fill; and search a record to get its shelf, row, column, how far into the compartment it is, and its neighbors. Calibration ("this is the first record here") and "Where does this record go?" with Add also shipped.

The same end-to-end suite that runs locally (16 Playwright tests on desktop and mobile) passes against production.

## What we saw when people used v1

> To be filled in after the user tests: one row per person, with what they did and said. The priorities below are provisional until then.

| Person | Collection and furniture | What they did | What they said | Where they got stuck |
| --- | --- | --- | --- | --- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## Fix first

These come from our own run as a new user, and they stay provisional until the user tests are in.

1. **The map drifts from the real shelf until someone calibrates.** Default capacities (80 per cube, 70 per crate, 60 CDs) aren't measured yet. We'll measure real cubes and crates and make calibration easier to find. Today it sits behind "The first record here is different…" inside a compartment.
2. **Compartment view on phones.** People use the app standing in front of their shelf, but phones only get text strips. We'll design spines for small screens.
3. **Small labels on phones** with 4+ columns, and long genre names that get cut off.

## Add (in order)

The order follows two findings from the proposal interviews. Finding and returning a record matters more than placing a new purchase: all 4 people had lost a record recently. Rearranging the whole shelf hurts everyone.

1. **Minimum-move insertion, measured.** When a compartment overflows, find the plan that moves the fewest records to neighboring compartments, instead of v1's naive cascade. Add a **purchase simulator**: replay 100 purchases on a real collection with both methods and count the records moved. v1 already logs every move in `layout_events`, so the naive method is the baseline. The comparison ("naive: X records moved, v2: Y") is the result we'll show at the fair, and it's the core of the Systems focus.
2. **Better calibration.** Calibration by count ("74 fit here"). Estimated thickness by format (single LP, double gatefold, box set) from the format data Discogs already gives us, so capacity follows what's really in each compartment.
3. **Temporary locations and "Put it back".** Places outside the sort order: next to the turntable, the DJ's crate, on display, an unsorted pile. A record there shows up in search with that location, and when you return it the app tells you its spot and its neighbors.
4. **Guest mode.** A read-only link or QR code for the shelf, so someone at a party or a store customer can find a record without an account. v1 keeps all data on the server, which is what makes this possible.

## Hardening that ships with v2

- Deleting a Clerk account also deletes its Supabase rows (Clerk webhook), and Discogs data from inactive accounts is purged after N days ("don't store longer than necessary").
- A Content-Security-Policy tuned for Clerk.
- Database error messages no longer reach the browser on import failures.

## What waits until after v2

Sort-order suggestions with growth projections (they need the simulator first), per-compartment dimensions, splitting and merging compartments, multiple rooms, tracklists, printable dividers, CSV import and manual entry, Discogs OAuth, barcode scanning, and any AI tagging.

## Timeline

- **Week of Nov 17:** user tests and fixes from them; minimum-move insertion and the purchase simulator, with Vitest tests against the naive baseline.
- **Week of Nov 24:** calibration by count and thickness by format; temporary locations and "Put it back"; guest mode; hardening; fair demo with the simulator's numbers.
