# Plan for v2

Record Organizer · v2 is due at the fair on December 1, 2026.

## Where v1 stands

v1 is live at https://final-project-vinyl-organizer.vercel.app. A new person can do the whole core task without help: open the demo without an account, or import a public Discogs collection by username; build shelves from templates; pick a sort order; see the map with each compartment's range and fill; and search a record to get its shelf, row, column, how far into the compartment it is, and its neighbors. Calibration ("this is the first record here") and "Where does this record go?" with Add also shipped.

The same end-to-end suite that runs locally (16 Playwright tests on desktop and mobile) passes against production.

## What we saw when people used v1

We showed v1 to the four people interviewed for the proposal and gave each one the core task without helping. What they said is paraphrased below.

| Person | Collection and furniture | What they did | What came up | Where it fell short |
| --- | --- | --- | --- | --- |
| 1 · Collector | ~850 records, two reinforced Kallax 4×4, by artist then year | Imported from Discogs, built two Kallax 4×4, sorted artist → year, searched records they knew | Search with neighbors and the map matched how they think about their shelf; it would have saved them the weekend they spent re-sorting after moving | The map was one or two compartments off toward the end: 80 per cube is unmeasured, and doubles and gatefolds take more room. Their real loss (a 10" slipping behind the 12"s) isn't addressed, since v1 treats all vinyl the same |
| 2 · DJ | 3,000+ records, custom furniture, genre → label → bpm or vibe | Imported 3,000+ records, sorted genre → label, tried "Where does this record go?" | Useful for knowing where a new purchase goes | What they lose are the records they take out (their gig bag, the "discards" box), and v1 has no temporary locations. No third level for bpm or vibe. Many white labels aren't on Discogs and can't be added by hand |
| 3 · Casual collector | ~150 records, vintage crates and a low mid-century bookcase, by vibe | Used the demo (no Discogs), browsed the map and spines, searched a record | Liked the look: the spines and the covers | Their order is by vibe, which no sort level supports, so they didn't see themselves using it. Their loss (a guest moved a record during a party) needs guest mode |
| 4 · Store owner | 4,000–5,000 records, metal shelves, boxes and crates | Used the demo, searched records | Knowing which physical box a record is in is exactly what they want | Records come in and go out every day, and v1 only drops a record when it's removed on Discogs and re-synced. Their stock is Discogs inventory, not a collection. "New arrivals" and "gems" are fixed sections v1 doesn't have |

**What we learned**

- The core task works for someone who sorts the way the app does (person 1), and the map's accuracy depends on calibration and record thickness.
- Three of four people need something outside the sorted shelf: records taken out (2), moved by someone else (3), or selling every day (4). Finding and returning records matters more than placing new ones, as the interviews already suggested.
- Three of four don't sort only by Discogs fields: bpm or vibe (2), vibe (3), fixed sections (4).
- Stores are a different product: inventory instead of a collection, constant turnover, and a Discogs terms question (collection data and images are non-commercial). They stay out of v2.

## Fix first

These come from the tests above and from our own run as a new user.

1. **The map drifts from the real shelf until someone calibrates** (person 1). Default capacities (80 per cube, 70 per crate, 60 CDs) aren't measured yet. We'll measure real cubes and crates and make calibration easier to find. Today it sits behind "The first record here is different…" inside a compartment.
2. **Compartment view on phones.** People use the app standing in front of their shelf, but phones only get text strips. We'll design spines for small screens.
3. **Small labels on phones** with 4+ columns, and long genre names that get cut off.

## Add (in order)

The first item is the core of the Systems focus. The rest follow what the interviews and the v1 tests showed: finding and returning a record matters more than placing a new purchase, and most people don't sort only by Discogs fields.

1. **Minimum-move insertion, measured.** When a compartment overflows, find the plan that moves the fewest records to neighboring compartments, instead of v1's naive cascade. Add a **purchase simulator**: replay 100 purchases on a real collection with both methods and count the records moved. v1 already logs every move in `layout_events`, so the naive method is the baseline. The comparison ("naive: X records moved, v2: Y") is the result we'll show at the fair.
2. **Temporary locations and "Put it back"** (persons 2 and 3). Places outside the sort order: next to the turntable, the gig bag, the "discards" box, on display, an unsorted pile. A record there shows up in search with that location, and when you return it the app tells you its spot and its neighbors.
3. **Better calibration** (person 1). Calibration by count ("74 fit here"). Estimated thickness by format (single LP, double gatefold, box set) from the format data Discogs already gives us, so capacity follows what's really in each compartment.
4. **Custom sections and tags** (3 of 4 testers). User-defined tags ("Sunday morning", "house", a bpm range), assigned per artist so nobody tags record by record, and usable as a sort level. Sections pinned to compartments ("jazz lives in the studio tower"), with the algorithm sorting inside each section.
5. **Guest mode** (person 3). A read-only link or QR code for the shelf, so a guest at a party can find a record and see where to put it back without an account. v1 keeps all data on the server, which is what makes this possible.

## Hardening that ships with v2

- Deleting a Clerk account also deletes its Supabase rows (Clerk webhook), and Discogs data from inactive accounts is purged after N days ("don't store longer than necessary").
- A Content-Security-Policy tuned for Clerk.
- Database error messages no longer reach the browser on import failures.

## What waits until after v2

Sort-order suggestions with growth projections (they need the simulator first), per-compartment dimensions, splitting and merging compartments, multiple rooms, tracklists, printable dividers, CSV import and manual entry, Discogs OAuth, barcode scanning, and any AI tagging.
