/**
 * Sections: a genre or a tag pinned to some shelves ("jazz lives in the studio
 * tower"). Matching records go only on their section's shelves, sorted inside
 * the section; everything else flows through the shelves without a section.
 * Each section is laid out on its own, so contiguity and capacity hold per
 * section. Pure.
 */
import { collator } from "./sort";
import { normalizeGenre } from "./normalize";
import type { LayoutRecord, Slot } from "./types";

/** "genre:Jazz" or "tag:Sunday morning". */
export function parseSection(section: string): { kind: "genre" | "tag"; value: string } | null {
  const i = section.indexOf(":");
  if (i < 0) return null;
  const kind = section.slice(0, i);
  const value = section.slice(i + 1).trim();
  if ((kind !== "genre" && kind !== "tag") || !value) return null;
  return { kind, value };
}

export function matchesSection(record: Pick<LayoutRecord, "genre" | "tag">, section: string): boolean {
  const parsed = parseSection(section);
  if (!parsed) return false;
  if (parsed.kind === "genre") return collator.compare(normalizeGenre(record.genre), parsed.value) === 0;
  return !!record.tag && collator.compare(record.tag, parsed.value) === 0;
}

/** The sections present on these slots, in traversal order. */
export function sectionsOf(slots: readonly Slot[]): string[] {
  const out: string[] = [];
  for (const s of slots) if (s.section && !out.includes(s.section)) out.push(s.section);
  return out;
}

/** A record's section: the first one it matches (in shelf order), or null for the shelves without one. */
export function sectionKeyOf(record: Pick<LayoutRecord, "genre" | "tag">, sections: readonly string[]): string | null {
  return sections.find((s) => matchesSection(record, s)) ?? null;
}

/** The slots of one section (null: the shelves without one), re-indexed from 0 so they work like a group on their own. */
export function sectionSlots(slots: readonly Slot[], section: string | null): Slot[] {
  return slots.filter((s) => (s.section ?? null) === section).map((s, index) => ({ ...s, index }));
}

/** The slots and records a record competes with: its section's (insertion, the simulator). */
export function restrictToSection<T extends LayoutRecord>(slots: readonly Slot[], records: readonly T[], target: LayoutRecord): { slots: Slot[]; records: T[] } {
  const sections = sectionsOf(slots);
  if (sections.length === 0) return { slots: [...slots], records: [...records] };
  const key = sectionKeyOf(target, sections);
  return { slots: sectionSlots(slots, key), records: records.filter((r) => sectionKeyOf(r, sections) === key) };
}

/** The slots and records of the section a compartment belongs to (calibration). */
export function restrictToSlotSection<T extends LayoutRecord>(slots: readonly Slot[], records: readonly T[], slotId: string): { slots: Slot[]; records: T[] } {
  const sections = sectionsOf(slots);
  if (sections.length === 0) return { slots: [...slots], records: [...records] };
  const key = slots.find((s) => s.id === slotId)?.section ?? null;
  return { slots: sectionSlots(slots, key), records: records.filter((r) => sectionKeyOf(r, sections) === key) };
}
