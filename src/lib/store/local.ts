/**
 * The demo without an account lives only in this browser (localStorage).
 * Signing up saves it to the account.
 */
import type { ShelfConfig, StoredRecord } from "@/lib/shelf/model";

const KEY = "ro:local-v1";

export type LocalSnapshot = {
  version: 1;
  records: StoredRecord[];
  /** When the records were fetched from Discogs (6-hour freshness rule). */
  fetchedAt: string;
  config: ShelfConfig;
  /** recordId → slot id (position key). */
  placement: Array<[string, string]>;
  events: Array<{ kind: string; movedCount: number; at: string }>;
};

export function loadLocal(): LocalSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSnapshot;
    return parsed.version === 1 ? parsed : null;
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
