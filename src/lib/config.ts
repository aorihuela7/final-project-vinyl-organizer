/** App-wide constants. Safe to import from client and server code. */

export const APP_NAME = "Record Organizer";

export const APP_PITCH =
  "Model your real record shelf, compartment by compartment, and always know where every record is and where the next one goes.";

/** Copied verbatim from the Discogs API Terms of Use (provided by Ale). Do not paraphrase. */
export const DISCOGS_NOTICE =
  "This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs. 'Discogs' is a trademark of Zink Media, LLC.";

export const DISCOGS_ATTRIBUTION = "Data provided by Discogs";

/** Discogs data older than this is refreshed when the user opens the app. */
export const FRESHNESS_MS = 6 * 60 * 60 * 1000;

/** The demo is a slice of a real public collection, imported through the normal path. */
export const DEMO = {
  username: "aorihuelar",
  /** 10 pages of 100: the 1,000 most recently added records. */
  maxPages: 10,
  sort: "added",
  sortOrder: "desc",
} as const;

export const DEFAULT_SLACK_PCT = 10;

/**
 * "Start from zero" for people without a Discogs account: an import of this
 * empty public Discogs collection, through the normal path, so the user starts
 * with no records and adds them one by one with "Add a new record". Records
 * added by hand belong to each account (RLS), and nothing is ever written to
 * Discogs, so two people who start from zero never see each other's records.
 * The import ignores anything this collection might gain on Discogs, and the
 * UI never shows this username.
 */
export const ZERO_START = { username: "aorihuelam" } as const;

export function isZeroStart(username: string | null | undefined): boolean {
  return (username ?? "").trim().toLowerCase() === ZERO_START.username;
}

/**
 * Public Discogs collections offered to people without one of their own, to try
 * an import. The descriptions are ours (i18n: samples.<username>); the counts
 * come live from Discogs (/api/discogs/samples), and a collection that stops
 * being public drops out of the list.
 */
export const SAMPLE_COLLECTIONS = ["oddcd", "tubasmarty", "wooda", "veale001", "wcdwinnell"] as const;
export type SampleCollection = (typeof SAMPLE_COLLECTIONS)[number];
