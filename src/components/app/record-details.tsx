"use client";

import { displayArtist, locate, type Location } from "@/lib/layout";
import { percent } from "@/lib/design";
import { formatLine, slotTitle } from "@/lib/shelf/describe";
import { releaseUrl } from "@/lib/discogs/map";
import { groupOf, type MediaView, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { Cover } from "./cover";
import { DiscogsAttribution } from "./discogs-attribution";
import { useI18n } from "@/i18n/client";

export function findLocation(views: MediaView[], recordId: string): Location | null {
  for (const v of views) {
    const loc = locate(v.index, recordId);
    if (loc) return loc;
  }
  return null;
}

/** Where a record is: shelf, row, column, how far in, and the two records on each side. */
export function LocationSummary({ location, config, byId }: { location: Location; config: ShelfConfig; byId: Map<string, StoredRecord> }) {
  const { t } = useI18n();
  const furniture = config.furniture.find((f) => f.key === location.slot.shelfKey);
  const pct = percent(location.fraction);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card bg-accent-soft p-3">
        <p className="text-sm font-semibold text-ink">{slotTitle(location.slot, furniture, t)}</p>
        <p className="text-sm text-ink">
          {pct}% from the left · record {location.indexInSlot + 1} of {location.totalInSlot}
        </p>
        <div className="mt-2 h-2 w-full rounded-full bg-surface" aria-hidden>
          <div className="relative h-2">
            <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style={{ left: `${pct}%` }} />
          </div>
        </div>
      </div>
      <Neighbors location={location} config={config} byId={byId} />
    </div>
  );
}

export function Neighbors({ location, config, byId }: { location: Location; config: ShelfConfig; byId: Map<string, StoredRecord> }) {
  const { t } = useI18n();
  const sameSlot = (slotId: string) => slotId === location.slot.id;
  const item = (id: string, slotId: string, side: string) => {
    const r = byId.get(id);
    if (!r) return null;
    const slot = location.before.concat(location.after).find((n) => n.record.id === id)!.slot;
    const furniture = config.furniture.find((f) => f.key === slot.shelfKey);
    return (
      <li key={id} className="flex items-center gap-3">
        <Cover src={r.thumb_url ?? r.cover_url} artist={r.artist} title={r.title} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{displayArtist(r.artist)}</p>
          <p className="truncate text-sm text-ink-muted">{r.title}</p>
          <p className="text-xs text-ink-faint">
            {side}
            {sameSlot(slotId) ? "" : ` · in ${slotTitle(slot, furniture, t)}`}
          </p>
        </div>
      </li>
    );
  };
  if (location.before.length === 0 && location.after.length === 0) return null;
  const left = location.before.at(-1);
  const right = location.after[0];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">
        {left && right ? (
          <>
            Between <strong>{byId.get(left.record.id)?.title}</strong> and <strong>{byId.get(right.record.id)?.title}</strong>
          </>
        ) : left ? (
          <>
            Right after <strong>{byId.get(left.record.id)?.title}</strong>
          </>
        ) : (
          <>
            Right before <strong>{byId.get(right!.record.id)?.title}</strong>
          </>
        )}
      </p>
      <ul className="flex flex-col gap-2">
        {location.before.map((n, i) => item(n.record.id, n.slot.id, i === location.before.length - 1 ? "Just to the left" : "Two to the left"))}
        {location.after.map((n, i) => item(n.record.id, n.slot.id, i === 0 ? "Just to the right" : "Two to the right"))}
      </ul>
    </div>
  );
}

/** The record card: cover, data, location, neighbors, and the Discogs link. */
export function RecordDetails({
  record,
  location,
  config,
  byId,
  onShowOnMap,
}: {
  record: StoredRecord;
  location: Location | null;
  config: ShelfConfig;
  byId: Map<string, StoredRecord>;
  onShowOnMap?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="w-32 shrink-0 sm:w-40">
          <Cover src={record.cover_url ?? record.thumb_url} artist={record.artist} title={record.title} size="lg" />
        </div>
        <dl className="flex min-w-0 flex-col gap-1 text-sm">
          <dt className="sr-only">Artist</dt>
          <dd className="font-semibold text-ink">{displayArtist(record.artist)}</dd>
          <dt className="sr-only">Title</dt>
          <dd className="text-ink">{record.title}</dd>
          <dt className="sr-only">Year</dt>
          <dd className="text-ink-muted">{record.year ?? "Year unknown"}</dd>
          {record.label && (
            <>
              <dt className="sr-only">Label</dt>
              <dd className="text-ink-muted">{record.label}</dd>
            </>
          )}
          <dt className="sr-only">Format</dt>
          <dd className="text-ink-muted">{formatLine(record) || "Format unknown"}</dd>
          {record.genre && (
            <>
              <dt className="sr-only">Genre</dt>
              <dd className="text-ink-muted">{[record.genre, ...(record.styles ?? []).slice(0, 2)].join(" · ")}</dd>
            </>
          )}
          <dd className="pt-1">
            <DiscogsAttribution href={releaseUrl(record.discogs_release_id)} />
          </dd>
        </dl>
      </div>
      {location ? (
        <>
          <LocationSummary location={location} config={config} byId={byId} />
          {onShowOnMap && (
            <button type="button" onClick={onShowOnMap} className="self-start rounded-control border border-line-strong px-3 py-2 text-sm font-medium text-ink hover:bg-sunken">
              Show on the map
            </button>
          )}
        </>
      ) : (
        <p className="rounded-card bg-warning-soft p-3 text-sm text-warning">
          {groupOf(record) === "other"
            ? `This is a ${record.format_name ?? "non-vinyl"} release, so it isn't on a shelf.`
            : "This record isn't on the shelf yet: it doesn't fit. Add a shelf or regenerate the map."}
        </p>
      )}
    </div>
  );
}
