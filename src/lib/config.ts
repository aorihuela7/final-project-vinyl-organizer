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
