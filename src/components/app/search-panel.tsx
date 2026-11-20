"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { displayArtist } from "@/lib/layout";
import { searchRecords } from "@/lib/search";
import { slotTitle } from "@/lib/shelf/describe";
import { groupOf, type MediaView, type ShelfConfig, type StoredRecord } from "@/lib/shelf/model";
import { useI18n } from "@/i18n/client";
import { btnSecondary } from "../ui";
import { Cover } from "./cover";
import { findLocation } from "./record-details";

/**
 * Instant search over the whole collection, ignoring accents and case. A
 * combobox: arrow keys move through the results, Enter picks, Escape clears.
 */
export function SearchPanel({
  records,
  views,
  config,
  onPick,
}: {
  records: StoredRecord[];
  views: MediaView[];
  config: ShelfConfig;
  onPick: (id: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchRecords(records, query, 12), [records, query]);
  const open = query.trim().length > 0;
  const hasShelf = (group: string) => config.furniture.some((f) => f.media === group);

  const pick = (recordId: string) => {
    onPick(recordId);
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      pick(results[active]!.id);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  const where = (r: StoredRecord) => {
    const loc = findLocation(views, r.id);
    if (loc) {
      const furniture = config.furniture.find((f) => f.key === loc.slot.shelfKey);
      return t("search.where", { place: slotTitle(loc.slot, furniture, t), pct: Math.round(loc.fraction * 100) });
    }
    const group = groupOf(r);
    if (group === "other") return t("search.notPlaced", { format: r.format_name ?? "?" });
    if (!hasShelf(group)) return t(group === "single" ? "search.noSinglesShelf" : group === "cd" ? "search.noCdShelf" : "search.noLpShelf");
    return t("search.notOnShelf");
  };

  return (
    <div className="relative min-w-0">
      <input
        id={`${id}-input`}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
        aria-label={t("search.placeholder")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={t("search.placeholder")}
        autoComplete="off"
        className="w-full rounded-[24px] border border-input-line bg-paper px-[18px] py-3 text-base text-ink placeholder:text-[13px] placeholder:text-muted min-[420px]:placeholder:text-base"
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={t("search.results")}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60dvh] overflow-y-auto rounded-card bg-paper p-1 shadow-sheet"
        >
          {results.length === 0 && (
            <li role="presentation" className="px-3 py-3 text-sm text-muted">
              {t("search.noMatch", { query: query.trim() })}
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-[3px] px-2 py-2 ${i === active ? "bg-mustard-soft" : ""}`}
            >
              <Cover src={r.thumb_url ?? r.cover_url} artist={r.artist} title={r.title} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{displayArtist(r.artist)}</span>
                <span className="block truncate text-sm text-ink">{r.title}</span>
                <span className="block truncate text-xs text-muted">{where(r)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The search row: the search, the word "or", and "+ Add a new record". One row
 * on larger screens; stacked and centered on phones.
 */
export function SearchRow({
  records,
  views,
  config,
  onPick,
  onAdd,
}: {
  records: StoredRecord[];
  views: MediaView[];
  config: ShelfConfig;
  onPick: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 items-center gap-3 text-center min-[700px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[700px]:text-left" data-tour="search">
      <SearchPanel records={records} views={views} config={config} onPick={onPick} />
      <span className="text-sm text-muted">{t("search.or")}</span>
      <button type="button" onClick={onAdd} className={`${btnSecondary} py-[11px]`} data-tour="add">
        {t("search.addNew")}
      </button>
    </div>
  );
}
