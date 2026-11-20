/**
 * The demo without an account lives only in this browser (localStorage).
 * Signing up saves it to the account.
 */
import { initialLayout } from "@/lib/layout";
import {
  groupOf,
  newFurniture,
  toLayoutRecord,
  toShelfSpecs,
  toSortSettings,
  type FurnitureConfig,
  type ShelfConfig,
  type ArtistTags,
  type StoredRecord,
  type Tag,
  type TempLocation,
} from "@/lib/shelf/model";

const KEY = "ro:local-v1";

export type LocalSnapshot = {
  version: 2;
  records: StoredRecord[];
  /** When the records were fetched from Discogs (6-hour freshness rule). */
  fetchedAt: string;
  config: ShelfConfig;
  /** recordId → slot id (position key). */
  placement: Array<[string, string]>;
  events: Array<{ kind: string; movedCount: number; at: string }>;
  /** Temporary locations (the records carry temp_location_id). */
  locations?: TempLocation[];
  tags?: Tag[];
  artistTags?: ArtistTags;
};

type SnapshotV1 = Omit<LocalSnapshot, "version" | "config"> & {
  version: 1;
  config: { furniture: Array<Omit<FurnitureConfig, "media"> & { media: string }>; settings: ShelfConfig["settings"] };
};

/** What happened when an older snapshot was brought up to date, for a notice. */
export type LocalMigration = { singlesMoved: number; singlesBoxAdded: boolean };

/**
 * v1 → v2: vinyl shelves become LP shelves, singles (7″) leave them without
 * moving any LP, and if there are singles a "Singles box" is added at the end
 * with the singles laid out in it.
 */
export function migrateV1(old: SnapshotV1, singlesBoxName = "Singles box"): { snapshot: LocalSnapshot; migration: LocalMigration } {
  const furniture: FurnitureConfig[] = old.config.furniture.map((f) => ({ ...f, media: f.media === "cd" ? "cd" : f.media === "single" ? "single" : "lp" }));
  const lpShelves = new Set(furniture.filter((f) => f.media === "lp").map((f) => String(f.sortIndex)));
  const singles = new Set(old.records.filter((r) => groupOf(r) === "single").map((r) => r.id));
  const placement = new Map(old.placement);
  let singlesMoved = 0;
  for (const [recordId, position] of old.placement) {
    if (singles.has(recordId) && lpShelves.has(position.split(":")[0]!)) {
      placement.delete(recordId);
      singlesMoved++;
    }
  }

  let singlesBoxAdded = false;
  if (singles.size > 0 && !furniture.some((f) => f.media === "single")) {
    const nextIndex = furniture.reduce((m, f) => Math.max(m, f.sortIndex), -1) + 1;
    furniture.push(newFurniture("record_box", nextIndex, "single", singlesBoxName));
    singlesBoxAdded = true;
    // Lay out only the singles group; LPs and CDs keep their places.
    const config: ShelfConfig = { furniture, settings: old.config.settings };
    const specs = toShelfSpecs(furniture).map((s) => ({ ...s, compartments: s.compartments.map((c) => ({ ...c, id: undefined })) }));
    const singleRecords = old.records.filter((r) => singles.has(r.id)).map(toLayoutRecord);
    const layout = initialLayout(singleRecords, specs, toSortSettings(config.settings), config.settings.slackPct);
    for (const [id, slot] of layout.placement) placement.set(id, slot);
  }

  const events = [...old.events];
  if (singlesMoved > 0) events.push({ kind: "format_split", movedCount: singlesMoved, at: new Date().toISOString() });
  return {
    snapshot: { ...old, version: 2, config: { furniture, settings: old.config.settings }, placement: [...placement], events },
    migration: { singlesMoved, singlesBoxAdded },
  };
}

export function loadLocal(): LocalSnapshot | null {
  return loadLocalWithMigration()?.snapshot ?? null;
}

/** Loads the browser demo, bringing an older snapshot up to date (and saving it). */
export function loadLocalWithMigration(singlesBoxName?: string): { snapshot: LocalSnapshot; migration: LocalMigration | null } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSnapshot | SnapshotV1;
    if (parsed.version === 2) return { snapshot: parsed, migration: null };
    if (parsed.version === 1) {
      const { snapshot, migration } = migrateV1(parsed, singlesBoxName);
      saveLocal(snapshot);
      return { snapshot, migration };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocal(snapshot: LocalSnapshot): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
