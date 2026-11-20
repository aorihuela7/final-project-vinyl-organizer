# v2 plan · Nogal mid-century design and new features · overnight run

This file is the source of truth for tonight's unattended run. **Re-read this file and `docs/v2-design-log.md` at the start of every turn and after any context compaction.** CLAUDE.md still applies (Discogs rules, security, conventions). Where the two conflict, this file wins for this run only.

The visual reference is `docs/design/nogal.html`. Open it with Playwright and read its code. Its colors, layout, lean algorithm (`leanLayout`), brass rail, letter plates, singles shelf, shelf builder and record detail are the specification, not just inspiration. When this file and the mockup disagree, this file wins.

## What tonight covers

1. The **Nogal mid-century** redesign.
2. **Separate shelves by size:** LPs (12″ and 10″) never mix with singles (7″).
3. **Letter plates:** compartments show letter ranges, not artist names.
4. **Live capacity** while creating or editing a shelf.
5. **Search and add:** "Search for an artist or a title in your collection", "or", "Add a new record".
6. **Tracklists** from Discogs in the record detail.
7. **Language selector:** English (default), Español, Português.
8. **A guided tour** offered to first-time users.

Items 2 to 8 change functionality and, for item 2, the database. That's approved for tonight, within the constraints below.

## Why we're redesigning

The current UI works but has no identity. It matches the most common look of generated interfaces right now: a cream background, a terracotta button, a generic sans, everything in identical rounded white cards, and data strings joined with middle dots. The range labels ("5 Seconds Of Summer · 5 – Almendra · Almendra") are also hard to read. The goal is a distinct identity that comes from record shelves.

---

## Part 1 · The design

A 1960s living room: a walnut record cabinet on tapered legs against a sage wall, brass nameplates under each compartment, and a brass rail that shows the whole collection. What you found is marked in mustard. It should feel like a piece of furniture, not an app.

### Color tokens

Put these in the single design tokens file, with these names or close ones.

| Token | Hex | Use |
| --- | --- | --- |
| `wall` | `#D3DBCD` | Page background |
| `walnut` | `#7A4A2B` | Furniture frame (top of gradient), card bands, drawing frames |
| `walnut-dark` | `#4F2D19` | Furniture frame (bottom of gradient), legs |
| `walnut-inside` | `#8A6143` → `#9B7253` | Compartment interior, vertical gradient (top to 75%) |
| `walnut-blocked` | `#6B4329` | Blocked compartments |
| `brass-light`, `brass`, `brass-dark` | `#E2C47A`, `#C9A557`, `#9C7C35` | Brass gradient (plates, rail, meters) |
| `engraving` | `#3E2C0F` (plates), `#4A3613` (rail) | Text on brass |
| `ink` | `#22302A` | Main text, primary buttons, outlines |
| `muted` | `#52605A` | Secondary text |
| `paper` | `#FBFAF6` | Cards, inputs |
| `on-walnut` | `#F1E4D2` | Text on walnut |
| `mustard` | `#E8A825` | Found record, selected states, full compartments, warnings |
| `input-line` | `#A9B3A2` | Input borders |

Record spine palette (mid-century sleeve colors that stand out on walnut): `#2F6F6B`, `#C4552D`, `#E8DCC2`, `#6B7A3A`, `#3D3A35`, `#9C3D2E`, `#5E8C8A`, `#D8CBB0`, `#1F4E5A`. Spines get a thin stroke of `rgba(0,0,0,.3)`. Mustard is reserved for the found record and never appears in the palette.

### Typography

Two families:

- **Display:** a humanist sans with flared strokes, in the spirit of Optima. Use it for the brand, shelf names, plates, rail letters, record titles, card bands, and section titles.
- **Text:** a clean humanist or geometric sans, in the spirit of Avenir Next. Use it for everything else.

The mockup uses Optima and Avenir Next, which only exist on macOS. Use open-licensed equivalents loaded with `next/font`, self-hosted at build time. Candidates to compare on screen:

- display: Belleza or Marcellus;
- text: Nunito Sans or Mulish.

Pick by legibility at 14 px on brass, and log the choice. Type scale: 11, 12, 14, 16, 20, 24 to 26. Use sentence case everywhere, with no all-caps labels.

### Components

**App bar.**

- The brand, left, in the display face at 26 px.
- On the right, in this order: the **language selector**, "My shelf", and the avatar.
- The language selector is a pill (`paper`, 1 px `input-line`, 18 px radius) showing the current language's name with a chevron (see Part 7).

**Search row.** One row on desktop, stacked and centered on narrow screens. From left to right:

- the search input, a `paper` pill (24 px radius) with the placeholder **"Search for an artist or a title in your collection"**;
- the word **"or"** in `muted` at 14 px;
- the button **"+ Add a new record"**, a secondary pill (see Part 5).

**Brass rail (the collection bar).** A 34 px tall pill across the full width.

- Fill: a brass gradient (`brass-light` → `brass` at 45% → `brass-dark`), with an inset top highlight and a soft shadow below.
- Segments are separated by 1 px engraved lines (`rgba(74,54,19,.35)`). Their labels are in the display face at 14 px in `engraving`.
- Hide a segment's label when it's narrower than about 16 px, but keep its tooltip and `aria-label`.
- The marker is a mustard pill 14 px wide with a 2 px `ink` ring that **hangs below the rail** (from 25 px down to 12 px under the rail's bottom), so it never hides a letter.
- Its behavior is under "Collection bar" in Part 2.

**Furniture.**

- **Frame:** a walnut gradient, 14 px padding, 4 px radius, a faint inset top highlight.
- **Header line**, display face 14 px, `on-walnut`:
  - left: the shelf name and what it holds ("Kallax 1, LPs (12″ and 10″)", "Singles box, 7″");
  - right: "1,392 of 2,000".
- **Legs:** two tapered legs (12 × 34 px, walnut gradient, rounded bottoms, splayed about ±8°) under every shelf; leave 34 px below the frame.
- **Compartments:** a grid with 10 px gaps. Square interiors for Kallax templates, with the `walnut-inside` gradient and inset shadows from the top and the left.

**Brass plates.** Centered **below** each compartment, max 92% of its width.

- Padding 3 × 12 px, radius 3 px, the brass gradient, and a shadow of `0 1px 2px rgba(0,0,0,.35)`.
- Text in the display face at 14 px in `engraving`. One line for letter ranges ("A – Al"), two lines only in the genre case (Part 3).
- The full range with names goes in the `title` tooltip, the `aria-label`, and the compartment view.
- Blocked compartments have no plate. Their interior is `walnut-blocked`, with their reason ("Turntable") centered in `on-walnut`.

**Count badge.** Inside the compartment's top-right corner.

- Normally 11 px text in `on-walnut` on `rgba(34,48,42,.8)`.
- At 90% or more, `mustard` with `ink` semibold.

**Found compartment.** A 3 px `mustard` outline around the interior.

**Record detail card** (replaces the current modal layout).

- **Card:** `paper`, 4 px radius, a shadow of `0 10px 24px -16px rgba(0,0,0,.5)`, clipped corners.
- **Walnut header band:**
  - the location in the display face at 20 px semibold, `on-walnut` ("Kallax 1, row 1, column 1");
  - below it, "Record 50 of 55, about 90% in from the left" at 14 px with 85% opacity. This replaces the slider.
- **Record block:**
  - the cover at 104 px, unaltered, hotlinked with `<img loading="lazy">`; the placeholder when missing;
  - the title in the display face at 24 px;
  - then in muted 14 px: artist and year, label, format, and genres joined with commas.
- **Compartment drawing:** the large version, with this record highlighted, inside an 8 px walnut frame at a 1.6:1 ratio.
- **Neighbors:** five columns in physical order: two to the left, this one, two to the right.
  - Each has its cover and two caption lines: the title, and "Two to the left", "Just to the left", "This one", "Just to the right" or "Two to the right".
  - The current one is `ink` semibold with a 3 px `mustard` outline. Captions align to the top.
- **Tracklist** (Part 6).
- **Actions:** "Data provided by Discogs" linking to the release, left; "Show on the map", a secondary pill, right.
- **On narrow screens** it opens as a bottom sheet, and the walnut band is its handle area.

**Compartment view** (the existing modal with spines).

- **Frame:** walnut, with a brass plate at the top showing the full range with names.
- **Drawing:** the large drawing with the same lean as the map.
- **Calibration:** keep the button ("The first record here is different…") as a secondary pill.
- **Behavior:** pointing at and clicking spines works as today.

**Buttons and inputs.**

- **Primary:** an `ink` pill with `paper` text.
- **Secondary:** an outlined `ink` pill on a transparent background.
- **Inputs and selects:** `paper` or white pills with a 1 px `input-line` border.
- **Checkboxes** use `ink`.

**Banners.** A `paper` strip with a 4 px `mustard` left rule and `ink` text; links underlined `ink`.

**Focus ring.** Visible on sage, walnut, brass, and paper alike: 2 px `ink` outline, 2 px offset, with a 2 px `paper` halo.

**Landing page.**

- **Hero:** a real walnut furniture slice (for example 2 × 3, with legs, plates, and the lean) and the brass rail, built with the same components.
- **Kept as they are:** "Try the demo collection" (primary), "Sign up" (secondary), and the Discogs import form.
- **Copy:** plain words.
- **Footer:** the Discogs non-affiliation notice.

**Shelves & order.**

- **Template previews:** drawn as small walnut furniture with plates and legs.
- **Shelf builder:** the live capacity panel (Part 4).

### Lean physics

Records stand packed against the left wall. When a compartment has free space, the records nearest the empty side lean the way real records do: **each one's top rests against the record before it (or the left wall), and its bottom slides toward the right.** It's visual only and never affects placement.

Implement it as a pure function in `src/lib/visual/lean.ts` (no React, no Supabase), ported from `leanLayout` in the mockup, including its contact geometry.

**1. Inputs and output.**

- Inputs: each record's width and **size** (12, 10 or 7 inches), the compartment's capacity, its inner width and height, and a seed.
- Output, per record: base x, width, height, and angle.

**2. Heights by size.**

- Height is 100% of the room for 12″, 80% for 10″, and 56% for 7″.
- Each record's height varies by 0% to 5% from a hash of its record ID.
- 10″ records sit among the 12″ ones on LP shelves; 7″ records only appear on singles shelves.

**3. How many lean, and how far.**

- `free = (capacity - n) / capacity`.
- Full (`free = 0`): every record stands perfectly upright.
- Nearly full (`free < 0.02`): only the last record leans, at about 1°.
- Otherwise the last `k = clamp(round(3 + 14·free + 0.05·n), 2, n)` records lean. The maximum angle is `min(40°, 4° + 42°·free)`.

**4. Angle of each leaning record.**

- At position `p` (from 1/k to 1), the angle is `maxAngle · p^e`, plus a deterministic jitter of about ±0.7°.
- `e` goes from 1.6 down to 0.4 as `free` goes from 0.4 to 0.9 (smoothstep). With little space, only the last few lean, progressively. With a lot of space, the small group reclines together, almost parallel.
- **Angles never decrease toward the right:** take the maximum of the computed angle and the previous record's.

**5. Contact geometry.**

- Each leaning record rotates counterclockwise, with its top toward the left, around its bottom-left corner.
- Its base is the smallest x that satisfies all of these:
  1. its top-left corner clears the left wall;
  2. its bottom-left corner is right of the previous record's bottom-right corner;
  3. **against each of the 12 records before it** (not only the previous one, because a short 10″ record can sit between two tall ones), its top-left corner is on or right of that record's right face at that height, and that record's top-right corner is on or left of its left face.

**6. Fitting and determinism.**

- The bases never use more than 65% of the free width, and no corner leaves the compartment. If one would, scale all angles by 0.88 and rebuild until it fits.
- Same inputs, same drawing; recomputed when the count changes.

Vitest tests:

- A full compartment has every angle at 0. One with `free < 0.02` has a maximum angle of 1.5° or less.
- Leaning angles never decrease toward the right.
- **No two records overlap**, checked with a separating-axis test on every pair of rotated rectangles. Cover every `n` from 1 to 80 and at least 20 seeds, in square and 1.6:1 drawings, with three size mixes: all 12″, about 10% to 30% 10″ among 12″, and all 7″.
- Every corner stays inside the compartment.
- Every leaning record's top is to the left of its own base.
- The same seed gives the same result.
- More free space gives a larger or equal maximum angle.
- Zero records gives an empty result.
- 25 compartments of 80 records are computed in under 16 ms.

The mockup's implementation passed these checks: 0 overlaps in about 9.4 million pairs, including a stress test with 30% 10″ records, and no corner out of bounds.

---

## Part 2 · Map behaviors

### Compartment drawing

One component in three sizes (map, compartment view, record detail), so a compartment looks identical everywhere.

- **One SVG per compartment**, with one record shape per placement, in shelf order.
- **Width:** per record, inner width ÷ capacity. Take an array of widths as input, so thickness by format can replace it later.
- **Color and height:** each record's color comes from a hash of its record ID into the spine palette; its height comes from its size and the same hash.
- **Found record:** `mustard` with an `ink` stroke (3:1 contrast against the interior), and it lifts about 9 px along its own angle when found.
- **Interaction:** clicking a compartment opens the compartment view. Each compartment is keyboard-reachable with `role="button"` and an `aria-label` with its full range and count.
- **Performance:** drawings are memoized, so typing in the search doesn't redraw every SVG.

### Collection bar

- **Segments** follow the first sort level:
  - letters for artist, title, or label, with "#" for digits;
  - genre names (translated, see Part 7);
  - decades for year.
- Each segment's width is proportional to its number of records.
- **One rail per format group**, above the shelves of that group. The rail for LPs only counts LPs.
- **Marker:** it shows the found record's position, its index in its group divided by the group's total.
- **Found moment:** when a search result is chosen, the marker slides to it (1 s, `cubic-bezier(.3,.9,.25,1)`), the compartment gets its mustard outline, and the record lifts. That's the one orchestrated motion of the app.
- **Navigation:** clicking or pressing Enter on a segment scrolls to the compartment where it starts and highlights it briefly.

### Copy

- No strings joined with middle dots. Use plain sentences in sentence case: "1,725 records, sorted by artist, then title, with 10% free space".
- Genres are joined with commas.
- A button and its confirmation use the same verb.

---

## Part 3 · Letter plates (no artist names on the map)

Compartments on the map show a short range based on the **first sort level**. Names appear only in the tooltip, the `aria-label`, and the compartment view.

### The key for each record

The key is the record's value for the level, normalized as the sort does: Discogs suffixes like "(2)" removed, leading articles ignored when that option is on, accents and case folded. A key that starts with a digit belongs to "#".

### Artist, title, or label: first letter, and the second only when needed

For a compartment, take:

- `F`: its first record;
- `L`: its last record;
- `P`: the last record of the previous compartment in its group's order (across shelves of the same group);
- `N`: the first record of the next compartment in that order.

Then:

- `start` = the first letter of `F`. If `P` exists and starts with the same letter, use the first two letters instead.
- `end` = the first letter of `L`. If `N` exists and starts with the same letter, use the first two letters instead.
- Show `start – end` (with an en dash and spaces). If `start` equals `end`, show it once ("S" or "Sa").
- Capitalize as "Al": the first letter upper case, the second lower case. "#" never takes a second character.
- Never more than two letters. If two letters can't tell neighbors apart, that's accepted.

Examples from Ale's shelf:

| Compartment | Label |
| --- | --- |
| 5 Seconds of Summer → Almendra | `# – Al` |
| Almendra → Barbra Streisand | `Al – Ba` |
| Barbra Streisand → Boney M. | `Ba – Bo` |
| Bonnie Pointer → Charly García | `Bo – Ch` |
| Charly García → Daniel Santos | `Ch – Da` |

### Year

The full year: "1972 – 1979", or "1975" when it's one year. Records without a year are labeled "No year".

### Genre: the full genre name, plus the second level

- The second level is the one chosen in the sort order. If there's none, use artist, the first tiebreaker.
- **One genre in the compartment:** the genre name, then the second-level range using the rules above, with `P` and `N` counted only if they're in the same genre. For example "Rock A – Fe".
- **The end of one genre and the start of another:** two lines, one per genre, each with its own range. For example "Pop M – Z" and "Rock A – B". This is Ale's choice.
- **Three or more genres in one compartment:** line one is the first and last genre ("Blues – Latin"), and line two says how many ("3 genres").
- If the second level is year, its range is in years ("Rock 1965 – 1972").
- Genre names are shown translated (Part 7), but sorting always uses the canonical Discogs name, so changing the language never reorders a shelf.

Tests: every example above, plus a compartment entirely inside one letter, the first and last compartments of a group, the "#" bucket, ignoring articles, year ranges, the two-genre and three-genre cases, and genre with year as the second level.

---

## Part 4 · Separate shelves by size, and live capacity

### Format groups

A record belongs to exactly one group:

| Group | What goes in it |
| --- | --- |
| `lp` | Vinyl 12″ and 10″ (LPs) |
| `single` | Vinyl 7″ (singles) |
| `cd` | CDs |
| `other` | Cassettes and everything else, not placed (as today) |

**Classifying vinyl from Discogs formats.** These are Ale's rules:

1. An explicit size wins: a description of `7"` means `single`; `10"` or `12"` means `lp`.
2. With no size, the exact description `Single` or `EP` means `single` (7″).
3. Everything else on vinyl, including `LP`, `Maxi-Single`, or no description at all, means `lp` (12″).
4. If a release has several formats (a box with an LP and a 7″), the largest size wins.

Store `size_inches` (7, 10, 12, or empty) and `format_group` on each record. Compute them at import and when adding a record, and backfill existing records from their stored format data. Unit tests cover every rule, using real description arrays from the Discogs spike notes.

**Shelves.**

- Today a shelf holds Vinyl or CDs. Replace "Vinyl" with two choices: **"LPs (12″ and 10″)"** and **"Singles (7″)"**. A migration turns every existing vinyl shelf into an LP shelf.
- The placement code places each group only on shelves of that group. Modify `src/lib/layout` only for this, with tests: a 7″ is never placed on an LP shelf or the other way around, and the other invariants still hold.

**Existing placements.**

- Singles that are placed on LP shelves today lose their placement, but the LPs don't move (no relayout).
- A banner explains it: "Singles (7″) now go on their own shelves. 214 singles are off the map until you add a Singles shelf."
- Singles without a singles shelf stay off the map, with the same message wherever counts appear.

**Templates and defaults.**

- Add a "Record box" template.
- Default capacity per compartment depends on the group. LPs keep today's default. For singles, use the value from the kickoff answers.
- The demo gets a Singles box (1 × 3) if the demo collection has singles.

### Live capacity in the shelf builder

While a shelf is being **created or edited**, the numbers appear **right in the builder**, not only at the bottom of the page. They update with every change, before saving, as in the mockup.

- **A walnut box under the shelf's fields:**
  - "This shelf holds 1,280 LPs" (or "singles"), large;
  - below it the arithmetic: "16 compartments × 80 records, 2 blocked".
  - The count honors blocked compartments and per-compartment capacity.
- **The preview's header** shows "1,280 places".
- **One row per format group** with records or places, in the same panel:
  - "LPs (12″ and 10″): your 1,392 records would fill 70% of 3,280 places, with this shelf", with a brass meter;
  - with the free-space setting, if the records don't fit: "312 won't fit with 10% free space. Add compartments or raise the capacity." in the warning style, with a mustard meter.
- **During an import**, the rows use the records imported so far ("Importing: 820 of 1,725 so far").
- **The shelf list** also shows each saved shelf's "Holds 1,280".

---

## Part 5 · Search and "Add a new record"

- The search input's placeholder and `aria-label` are **"Search for an artist or a title in your collection"**.
- "Where does this record go?" becomes **"Add a new record"** everywhere: the button, the dialog title, and its copy.
- Inside the dialog, the steps read in plain words:
  1. "Find it on Discogs";
  2. "It goes in Kallax 1, row 2, column 3, between …";
  3. "Add record", which confirms with "Record added".
- The size rules from Part 4 decide which shelves it can go on.

---

## Part 6 · Tracklists from Discogs

The Discogs API returns each release's tracklist (`GET /releases/{id}`, field `tracklist`, with `position`, `type_`, `title`, `duration`, and `sub_tracks` for index tracks).

- **Server route** `/api/discogs/release/[id]`:
  - uses the app token and User-Agent;
  - returns only the fields the UI needs;
  - caches with `fetch` revalidation of at most 6 hours, as the Discogs terms require;
  - handles 429s with backoff and limits each user's requests per minute.
- **No database table** for tracklists.
- **In the record detail**, a "Tracklist" section:
  - grouped by side from the positions (A1, A2 under "Side A"; C1 under "Side C" for a second disc);
  - `heading` entries as subheadings;
  - index tracks with their sub-tracks indented;
  - durations when present;
  - side headings in muted semibold with a 2 px brass underline, rows with the position and duration in muted tabular numbers.
- **States:**
  - while loading, three skeleton rows;
  - on error, "Couldn't load the tracklist." with a "Try again" button;
  - records without a Discogs release ID show no section.
- **Tests** for the parser: sides, headings, index tracks, missing durations, and positions like "1", "A", or "CD1-1".

---

## Part 7 · Language selector

- **Where:** left of "My shelf" in the app bar, also on the landing page. It shows the current language by its own name: "English", "Español", "Português". English is the default.
- **Implementation:** the Next.js App Router dictionary pattern, with no new library.
  - One file per language in `src/i18n/` (`en.json`, `es.json`, `pt.json`).
  - The choice is stored in a `locale` cookie, plus the user's settings when signed in.
  - `<html lang>` is updated.
  - Changing language keeps the person where they were.
- **Translate:**
  - every UI string;
  - numbers with `Intl.NumberFormat` (1,392 in English, 1.392 in Spanish and Portuguese);
  - plurals with `Intl.PluralRules`;
  - the 15 main Discogs genres, with the table below.
- **Don't translate:** artists, titles, labels, styles, and other Discogs data. The Discogs non-affiliation notice and "Data provided by Discogs" stay verbatim in English, as the terms require.
- **Test:** every key exists in all three dictionaries.
- **Review:** Ale reviews the Spanish. Log that the Portuguese needs review by a native speaker.

| Discogs | Español | Português |
| --- | --- | --- |
| Blues | Blues | Blues |
| Brass & Military | Bandas y música militar | Bandas e música militar |
| Children's | Infantil | Infantil |
| Classical | Clásica | Clássica |
| Electronic | Electrónica | Eletrônica |
| Folk, World, & Country | Folk, world y country | Folk, world e country |
| Funk / Soul | Funk y soul | Funk e soul |
| Hip Hop | Hip hop | Hip hop |
| Jazz | Jazz | Jazz |
| Latin | Latina | Latina |
| Non-Music | No musical | Não musical |
| Pop | Pop | Pop |
| Reggae | Reggae | Reggae |
| Rock | Rock | Rock |
| Stage & Screen | Cine y teatro | Cinema e teatro |

---

## Part 8 · Guided tour for first-time users

### When it's offered

- The first time someone opens the demo, and right after someone signs up with their email.
- A dialog asks: "Want a quick tour? It takes about a minute." with "Show me around" (primary) and "Not now" (secondary).
- "Not now" doesn't ask again. The user menu always has "Take the tour".
- For a new account with no records yet, "Show me around" waits until the first map exists, and says so: "We'll show you around as soon as your shelf is ready."

### Steps

Each step is a popover anchored to the real element, with a spotlight around it. Each has Back, Next, and "Skip tour", and shows its progress ("2 of 8").

1. **Search:** "Type an artist or a title to find where a record is."
2. **The brass rail:** "Your whole collection from start to end. The mustard marker shows where a record falls."
3. **A compartment:** "Each compartment shows its range. Click one to see the records inside."
4. **The record detail** (it opens a sample record): "Where it is, the records on each side, and its tracklist."
5. **Add a new record:** "Bought something new? Find it on Discogs and see where it goes."
6. **Shelves & order:** "Set up your furniture. LPs and singles go on separate shelves, and you'll see how many records fit as you build."
7. **The language selector:** "Change the language here."
8. **Done:** "That's it. You can take the tour again from the menu."

### Implementation

- A local component, with no new library:
  - an overlay with a cutout around the target;
  - a popover placed above or below it;
  - scrolling the target into view.
- Styled in Nogal: a `paper` card with a walnut top strip, and `ink` buttons.
- **Keyboard:**
  - focus moves into the popover;
  - Esc closes it;
  - the arrow keys move between steps;
  - focus returns to where it was.
- Respects `prefers-reduced-motion`.
- **State:**
  - for signed-in users, `tour_status` in the user's settings (`offered`, `accepted_pending`, `completed`, `dismissed`), with RLS;
  - for the accountless demo, `localStorage`.

---

## Quality floor

- **Contrast:** WCAG AA for text, including text on brass and walnut. Check `engraving` on the gradient's lightest and darkest stops.
- **Keyboard and motion:** visible keyboard focus everywhere, and `prefers-reduced-motion` respected.
- **Mobile first,** checked at 375 px wide:
  - compartments stay in their real grid;
  - the search row stacks;
  - the record detail is a bottom sheet;
  - tour popovers fit the screen.
- **Dark mode:** none for v2.

## Constraints

- **Database:** changes only through new migration files, applied with `supabase db push --linked --yes` (approved by Ale for tonight). Never reset or drop the database, delete data in the dashboard, or edit old migrations. Every new table or column gets RLS like the rest.
- **Layout code:** modify `src/lib/layout` only for the format groups (Part 4), with tests. Don't change how placements are computed otherwise.
- **Discogs rules from CLAUDE.md:**
  - covers unaltered and hotlinked, never through `next/image`;
  - the attribution link;
  - the non-affiliation notice;
  - data no older than 6 hours.
- **Dependencies:** none new besides fonts through `next/font`. Internationalization and the tour are built locally. If something else seems essential, log it and pick a local solution.
- **Screenshots:** after each UI slice, take Playwright screenshots at 1280 px and 375 px wide. Save them in `docs/screenshots/v2-design/`, compare them with the mockup, and fix the differences that matter.

## Ground rules

1. **Never stop to ask.** Pick the most reversible option that fits this plan and the kickoff answers. Log the question, your choice, why, and how hard it is to change under "Assumptions and questions for Ale". Then continue.
2. **Needs Ale = log and move on.** Try once, log it under "Blocked: needs Ale" with exact steps, and continue with work that doesn't depend on it.
3. **Never work around a permission block.** Don't retry or rephrase a blocked action. Log it and continue.
4. **Git.** Work only on `v2-design`.
   - Never commit to or push `main`, merge, force push, or rewrite pushed history.
   - Push after each completed slice.
   - After the first push, open a draft PR to `main` with `gh pr create --draft`, and keep its description in sync with the status board.
5. **Slices.** Small commits. `npm run test` and `npm run build` pass before every commit. Use the `WIP:` prefix only to save broken work, and log why.
6. **Secrets.** Never read or edit `.env*`. Never print a secret.
7. **Scope.** Only this plan. Other ideas go under "Ideas for v2" in the log.
8. **No deploys tonight.** Database changes only as described under Constraints.
9. **Don't end a turn to report progress.** Update the log after every slice, with a timestamp from `date`.
10. **Stuck rule.** If a task makes no progress for about 45 minutes, log what you tried, mark it Blocked, and move on.
11. **Language.** Write the log and code in English, and the final morning message in Spanish.

## Phases

Work in this order. It puts correctness first and leaves the tour for last if the night runs short. Mark each phase in the log's status board as Todo, Doing, Done, or Blocked, with evidence.

1. **Foundations.** Tokens, fonts via `next/font`, type scale, the i18n dictionary system (English only for now; every new or touched string goes through it), and the global copy cleanup. *Done when:* build passes and screenshots show the new tokens.
2. **Lean function.** `src/lib/visual/lean.ts` with sizes, and every test listed, including the overlap test with mixed sizes. *Done when:* all tests pass.
3. **Format groups.**
   - Classification with its tests, the migration and backfill, LP and singles shelves, and the layout change with its tests.
   - Singles removed from LP shelves without moving LPs, the banner, the Record box template, and the demo's Singles box.
   
   *Done when:* the tests pass, the migration applies, and in screenshots no singles sit on LP shelves. Log how many of Ale's records fell under each classification rule.
4. **Map.** The furniture with legs, the interiors, the SVG drawing with sizes, the letter plates (Part 3, with tests), the count badge, the found outline, and keyboard access. *Done when:* the map matches the mockup, and the label tests pass.
5. **Search row and "Add a new record".** *Done when:* the new copy appears everywhere and the add flow works on the right group's shelves.
6. **Shelf builder with live capacity.** *Done when:* the numbers update with every change in create and edit modes, and the warnings appear when records don't fit.
7. **Record detail card and tracklist.** *Done when:* the card matches the mockup at both widths, and the tracklist loads from Discogs with its states and parser tests.
8. **Compartment view and brass rail.** The large drawing in the existing modal; the rail per group, with marker, motion, and navigation. *Done when:* the same compartment looks identical on the map and in the modal, and the rail works with artist, genre, and year as the first level.
9. **Other screens.** Landing, Shelves & order, banners, buttons, inputs, focus ring. *Done when:* no screen still uses the old cream and terracotta look.
10. **Language selector and translations.** Spanish and Portuguese dictionaries, the genre table, the selector, cookie and settings persistence, and number formatting. *Done when:* every screen works in all three languages and the dictionary test passes.
11. **Guided tour.** *Done when:* it's offered on first demo and first sign-up, every step points at the right element on desktop and mobile, and its state persists.
12. **Mobile, accessibility, and performance pass.** *Done when:* checks at 375 px pass, AA contrast holds on brass and walnut, keyboard navigation works everywhere including the tour, and drawings don't redraw on every keystroke.
13. **Visual QA.** Compare the final screenshots with the mockup, list the remaining differences in the log, and fix the important ones.
14. **Morning summary.** Fill in the summary in the log, and end with a final message in Spanish. Include:
    - what changed, and the screenshots to look at first;
    - the classification counts from phase 3;
    - open questions, with the assumption taken;
    - the PR link, and the test and build results.

## `docs/v2-design-log.md` template

Create it during the kickoff with these sections: Kickoff answers, Approved fonts, Status board, Assumptions and questions for Ale, Blocked: needs Ale, Ideas for v2, Timeline, and Morning summary.
