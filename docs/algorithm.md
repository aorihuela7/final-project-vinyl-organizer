# How the layout algorithm works

This is the core of Record Organizer: given a collection, a sort order, and the shelves, it **computes** which compartment each record is in. The user never places records one by one. The code is in `src/lib/layout/` (pure TypeScript, no framework imports) and every rule below has a Vitest test next to it.

## 1. The pieces

- **Record:** artist, title, year, label, genre, and media (vinyl, CD, or other).
- **Shelf (furniture):** a grid of `rows × cols` compartments, a default capacity, a traversal (by rows or by columns), a media (vinyl or CDs), and a position in the room (`sort_index`).
- **Compartment:** a cell of the grid. It can be **blocked** (a turntable, speakers, a door) and can override the shelf's capacity.
- **Placement:** record → compartment. This is the physical state of the shelf, and it's stored. Order inside a compartment is not stored; it comes from the sort key.

Vinyl and CDs are separate groups: vinyl flows only through vinyl shelves and CDs only through CD shelves. Everything below runs once per group. Records of other formats (cassettes, files) are counted but not placed.

## 2. The sort key (`sort.ts`, `normalize.ts`)

The user picks up to three levels from genre, artist, year, label, and title, for example genre → artist. After those levels come fixed tiebreakers, **artist → year → title → id**, so two different records never compare as equal. That makes the order **total** (any two records can be compared) and **stable** (the same input always gives the same order, whatever order the records came in).

Before comparing, values are normalized:

- **Discogs suffixes:** Discogs writes "Nirvana (2)" to tell apart two artists with the same name. We strip " (2)" for sorting and display.
- **Leading articles (optional, off by default):** with the option on, "The Beatles" files under B. The list is configurable: The, A, An, El, La, Los, Las, Le, Les, L'. An article is only removed if something follows it, so "The The" stays "The". With the option off, "The Beatles" files under T.
- **One artist, one name:** names that differ only by a leading article ("The Beatles" and "Beatles"), by case, or by accents are the same artist. If the collection has both spellings, every record of that artist sorts under the spelling **with** the article, so they all sit together under T. With articles ignored they already sit together under B. This is computed from the records being laid out (`artistAliases` in `normalize.ts`), so it only kicks in when both spellings are actually there.
- **Leading punctuation** is ignored ('"Weird Al" Yankovic' files under W).
- **Several artists:** we keep the first one.
- **No genre:** treated as "No genre". **No year:** sorts after every known year.

Strings are compared with `Intl.Collator('en', { sensitivity: 'base', numeric: true })`: uppercase and lowercase are equal, accents are ignored ("Élan" = "Elan"), and numbers compare as numbers ("Vol 2" before "Vol 10").

## 3. Traversal (`traversal.ts`)

A sorted list is one-dimensional, but shelves are grids. Traversal is the reading order that turns the grid into a line of compartments:

- Shelves go in their `sort_index` order (living room, then studio).
- **By rows:** left to right, then the next row down, like reading. Natural for wide shelves.
- **By columns:** top to bottom, then the next column. Natural for towers.
- Blocked compartments are skipped.

The result is a numbered list of available compartments: 0, 1, 2… We call that number the compartment's **traversal index**.

## 4. The two invariants

1. **Contiguity:** walking the collection in sort order, the traversal index never goes down. In plain words, each compartment holds one continuous range ("A – Bea"), and you never have to jump back to a previous compartment.
2. **Capacity:** after the initial layout, no compartment holds more than its capacity. If the collection doesn't fit, the app says how many records are left over; it never drops them silently.

## 5. Initial layout (`initial.ts`)

The sorted collection is cut into consecutive runs, one per compartment in traversal order. Contiguity is automatic, because we hand out the sorted list in order. The question is how long each run should be.

The naive answer is to fill each compartment to the top before moving on. Then all the free space ends up at the end of the shelf, and the first purchase that belongs in "A" pushes every record after it. Instead we **spread the free space over the whole shelf**, the way a librarian leaves a little room at the end of each shelf. This is the idea behind *library sort* (gapped insertion sort): gaps left everywhere make later insertions cheap.

Concretely, every compartment gets an **effective capacity** = capacity × (1 − slack). With 80 records per cube and 10% slack, that's 72. Each compartment receives records **in proportion to its effective capacity**. To make the counts add up exactly, we round the cumulative boundaries, not each count:

> boundary_k = round(N × (e_1 + … + e_k) / (e_1 + … + e_n)), and compartment k gets boundary_k − boundary_(k−1) records.

There are three cases:

| Collection size N | What happens |
| --- | --- |
| N ≤ total effective capacity | Proportional to effective capacity; the slack is kept everywhere. |
| effective total < N ≤ total capacity | Proportional to the real capacity: the collection fits, but with less slack than asked. The app says so. |
| N > total capacity | Every compartment full; the last N − capacity records in sort order are reported as not fitting. |

**Why capacity can't be exceeded.** In the first case, compartment k's exact share is N × e_k / E. That's at most e_k, which is at most its capacity. Cumulative rounding can give a compartment at most the ceiling of its exact share, and the ceiling of a number that is ≤ an integer is still ≤ that integer. The other two cases work the same way with the real capacity. The code also has a safety net that carries any excess forward; by the argument above it never has to act.

## 6. Inserting a new record (`insert.ts`), the v1 naive method

1. **Find its place in the global order:** binary search gives the record just before it (prev) and just after it (next).
2. **Pick the candidate compartment:** prev's compartment, or next's compartment if prev's is full and next's isn't. Either one keeps contiguity, because the new record goes at the end of prev's range or at the start of next's. Two edge cases: if empty compartments sit between prev's and next's (a calibration or a sync can empty one), the first of them with room is used; and if the new record sorts first of all, an empty compartment before next's can take it. Both keep contiguity, because those compartments hold nothing.
3. **If the candidate has room:** done, **1 move** (putting the new record on the shelf).
4. **If not, cascade:** put the record in, then push the *last* record of that compartment to the *start* of the next available compartment. If that one was full too, push its last record forward, and so on until a compartment with room absorbs one. Each push is one more move. If the push falls off the last compartment, that record no longer fits and is reported.

**Special case, aliases:** if the new record is "The X" and the shelf already has records by "X" (articles kept), those records now sort as "The X" and belong somewhere else. They are taken off, the new record goes in, and each of them is put back with the same steps 1–4; their moves are counted and listed like any other. If records leave instead (a re-sync deletes the only "The X"), the remaining "X" records keep their place until the next full layout. Neither case appears in the demo collection: Discogs always writes an artist the same way.

The result is a list of moves ("Fleetwood Mac: C2 → C3") and their count, saved as a `layout_event`. This is the **baseline** for v2: the minimum-moves method (6b) is measured against it on the same purchases.

## 6b. Minimum-move insertion (v2, `insert.ts` with `strategy: "minimum"`)

The naive method only ever pushes forward. When the compartment is full and the nearest room is *behind* it, it still cascades all the way forward. v2 looks both ways.

1. **Where the record may go.** As in v1, the new record sorts between prev and next. Any compartment from prev's to next's keeps the range continuous (the ones strictly between them are empty). If one of them has room: **1 move**, done.
2. **If they're all full, find the nearest room on each side:** the first compartment with room after next's (distance f) and the last one with room before prev's (distance b), counted in boundaries.
3. **Shift toward the nearer one.** Forward (f ≤ b): the record goes into next's compartment and each full compartment passes its *last* record to the start of the next one, as in v1. Backward (b < f): the record goes into prev's compartment and each full compartment passes its *first* record to the end of the one before. Cost = 1 + min(f, b).

**Why that's the minimum.** Every compartment between the record and the nearest room is full, so it can't keep one more record. Records keep their order (contiguity), so the extra record has to leave that run of full compartments through one of its two ends, and it can't jump: a record can only change compartment by crossing the boundary next to it, and every full compartment in the way is non-empty. So each boundary between the insertion point and the compartment that absorbs the record is crossed by at least one existing record, and different boundaries need different records. The cheapest plan therefore crosses min(f, b) boundaries, which is exactly what step 3 does. The tests check this against a brute-force search over every contiguous layout of small shelves (`minmove.test.ts`).

It's optimal for **one** insertion. For a sequence of purchases it's greedy: each purchase takes its cheapest plan, which isn't always the cheapest plan for all of them together.

The app uses minimum moves for "Add a new record" and for new records found by a re-sync. The naive method stays as the baseline.

### The purchase simulator (`simulate.ts`)

Take a real collection, hold out 100 records at random as purchases, lay out the rest with the initial layout, and replay the purchases in a random order with each method on its own copy of the shelf. "Records moved" counts existing records that changed compartment; "moves" also counts putting each purchase on the shelf (what `layout_events` logs).

Ale's collection (`aorihuelar`, 1,725 records: 1,242 LPs, 150 singles, 327 CDs) on the shelves the app suggests (two Kallax 4×4 for LPs, a record box for singles, a Kallax for CDs), averaged over 10 seeds of 100 purchases (`scripts/simulate.ts`):

| Sort order | Shelves | Naive: records moved | Minimum: records moved |
| --- | --- | --- | --- |
| artist | as suggested, 10% free space | 0.0 | 0.0 |
| artist | 95% full after the purchases | 4.6 | 3.6 |
| artist | 98% full after the purchases | 17.5 | 13.4 |
| genre → artist | as suggested, 10% free space | 0.0 | 0.0 |
| genre → artist | 98% full after the purchases | 16.5 | 15.1 |
| genre → artist | 100% full after the purchases | 89.4 | 60.6 |

What it shows:

- **The free space is the big win.** With the initial layout spreading 10% free space over every compartment (the library-sort idea), 100 purchases go straight in with either method: not one existing record moves.
- **Minimum moves matter when the shelf is nearly full.** At 98% full, v2 moves about 23% fewer records sorted by artist; at 100% sorted by genre, about 32% fewer.
- **Greedy has a cost on single purchases.** In one 100%-full run, v2's worst single purchase moved more records than v1's worst, because earlier cheap choices left the room in worse places. The totals were still lower.

## 7. Calibration (`calibrate.ts`): "This is the first record in this compartment"

The computed map can drift from the real shelf (double albums, box sets, a 10" hiding behind the 12"s). Instead of recounting, the user looks at a compartment C and says "X is the first record here". That **moves only the boundary between C and the previous available compartment P**:

- If X is currently in P: X and everything after it in P move to the front of C.
- If X is already in C: everything before X in C moves to the end of P.
- Anything else (X two compartments away) is refused, because it would move other boundaries too.

**Reality beats capacity:** if C or P ends up with more records than its capacity, it's flagged on the map, not blocked. The shelf in front of the user is the truth.

## 8. Finding a record (`query.ts`)

- **Position inside the compartment:** if the record is the i-th of n (counting from 0), it sits at (i + 0.5) / n from the left. The 1st of 5 is at 10%, the 3rd of 5 at 50%. Shown as "40% from the left".
- **Neighbors:** the two records before and the two after in global order, each with its compartment. Even if the percentage is off, "between Blue Train and Bitches Brew" is what the user actually looks for.
- **Ranges for the map** (`ranges.ts`): each end of a compartment's range is cut to the shortest prefix that tells it apart from the neighboring compartment: "A – Bj", then "Bl – F". If a whole compartment is inside one first-level group (one genre), the label shows it: "Jazz · M – N".

## 9. Changing the sort order or the shelves

Changing the sort order or the furniture recomputes the whole initial layout. Before saving, the app compares the new placement with the stored one, position by position, and tells the user how many records would change compartment. The user confirms first.

## 10. Worked example: 10 records

One shelf with 3 compartments (C1, C2, C3), capacity 5 each, slack 20%, sorted by artist, ignoring articles. This is the real output of the code.

**Sorted collection** (articles ignored, suffix stripped): ABBA, The Beatles, Björk, Blondie, The Cure, Daft Punk, Fleetwood Mac, Nirvana (2), Radiohead, Talking Heads.

**Effective capacity:** 5 × (1 − 0.2) = 4 per compartment, total 12. N = 10 ≤ 12, so case 1.

**Boundaries:** round(10 × 4/12) = round(3.33) = 3; round(10 × 8/12) = round(6.67) = 7; then 10. **Counts: 3, 4, 3.** The free space is spread out (2, 1, 2 free), not piled at the end.

| Compartment | Range | Records |
| --- | --- | --- |
| C1 (3/5) | A – Bj | ABBA, The Beatles, Björk |
| C2 (4/5) | Bl – F | Blondie, The Cure, Daft Punk, Fleetwood Mac |
| C3 (3/5) | N – T | Nirvana (2), Radiohead, Talking Heads |

"Bj" is as short as possible and still different from the next compartment's first record, "Bl"ondie.

**Purchase 1, Beck.** It goes between The Beatles and Björk. Prev (The Beatles) is in C1, which has room (3/5). **1 move:** Beck → C1.

**Purchase 2, Bob Dylan.** Between Blondie and The Cure. Prev (Blondie) is in C2, with room (4/5). **1 move:** Bob Dylan → C2, which is now full (5/5).

**Purchase 3, Bon Iver.** Between Bob Dylan and The Cure, both in C2, which is full. The candidate is C2. Bon Iver goes in, and C2's last record, Fleetwood Mac, is pushed to the start of C3. C3 had room (3/5), so the cascade stops. **2 moves:** Bon Iver → C2, Fleetwood Mac C2 → C3. C2's range becomes "Bl – D" and C3's "F – T".

**Calibration.** At the real shelf, the user sees that Björk is actually the first record of C2, and says so. Björk is in C1, the compartment right before C2, so the C1/C2 boundary moves back by one record. **1 move:** Björk C1 → C2. C2 now holds 6 records with capacity 5: it's **flagged as over capacity, not blocked**. Ranges: C1 "A – Be", C2 "Bj – D".

**Search, Daft Punk.** C2, 6th of 6, at (5 + 0.5) / 6 ≈ **92% from the left**. Before it: Bon Iver, The Cure. After it: Fleetwood Mac and Nirvana (2), both in C3.

## 11. Cost

Sorting n records is O(n log n), and the comparisons use normalized keys computed once per record. The layout itself is one pass over the compartments. The tests check that **3,000 records in 40 compartments are laid out in under 100 ms**. One insertion is a binary search plus at most one push per compartment after the candidate.

## 12. Tests

`src/lib/layout/*.test.ts` covers:

- **Sort key:** articles (The Beatles with and without, and "Beatles" next to "The Beatles"), suffixes (Nirvana (2)), two artists, no genre, accents and numbers, ties, unknown years, three levels.
- **Traversal:** a Kallax 4×4 with two blocked compartments, by rows and by columns; several shelves; capacity override.
- **Initial layout:** proportional counts, both invariants for every size from 0 to 60 records, slack reduced, a collection that doesn't fit, vinyl vs CD vs other, an empty shelf, and the 3,000-record timing test.
- **Insertion:** fits (1 move), next compartment, an empty compartment in between, a new first record with an empty compartment before it, a cascade across three compartments, the new record itself pushed forward, overflow at the end, an empty shelf, 200 random insertions that keep both invariants, and collapsing repeated moves.
- **Calibration:** boundary moved back (with the over-capacity flag), moved forward, only one boundary touched, no-op, and refusals.
- **Position, neighbors, ranges, and spine colors.**
