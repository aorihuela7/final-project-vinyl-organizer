"use client";

import { useMemo, useState } from "react";
import { artistIdentity, displayArtist } from "@/lib/layout";
import { searchRecords } from "@/lib/search";
import type { ArtistTags, StoredRecord, Tag } from "@/lib/shelf/model";
import { useI18n } from "@/i18n/client";
import { btnPrimarySm, btnSecondarySm, card, input } from "../ui";
import type { ShelfApp } from "./use-shelf-app";

const select = "rounded-[18px] border border-input-line bg-white px-3 py-1.5 text-sm text-ink";

/**
 * Tags: the user's own groups ("Sunday morning", "house"), in their order,
 * assigned per artist. Usable as a sort level and as a shelf section.
 */
export function TagsCard({ app, records, tags, artistTags }: { app: ShelfApp; records: StoredRecord[]; tags: Tag[]; artistTags: ArtistTags }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const ordered = [...tags].sort((a, b) => a.sortIndex - b.sortIndex);
  const tagOf = useMemo(() => new Map(artistTags), [artistTags]);

  // One entry per artist (every spelling of it), with an example record for search.
  const artists = useMemo(() => {
    const seen = new Map<string, StoredRecord>();
    for (const r of records) if (!seen.has(artistIdentity(r.artist))) seen.set(artistIdentity(r.artist), r);
    return [...seen.values()];
  }, [records]);
  const results = query.trim() ? searchRecords(artists, query, 8) : [];
  const counts = new Map<string, number>();
  for (const [, id] of artistTags) counts.set(id, (counts.get(id) ?? 0) + 1);

  return (
    <section className={`${card} flex flex-col gap-3 p-[18px]`} aria-labelledby="tags-heading">
      <h2 id="tags-heading" className="font-display text-2xl text-ink">
        {t("tags.title")}
      </h2>
      <p className="text-sm text-muted">{t("tags.text")}</p>

      {ordered.length === 0 ? (
        <p className="text-sm text-muted">{t("tags.empty")}</p>
      ) : (
        <ol className="grid gap-1">
          {ordered.map((tag, i) => (
            <li key={tag.id} className="flex flex-wrap items-center gap-2 border-b border-rule py-1 text-sm">
              <span className="min-w-0 flex-1 font-semibold text-ink">{tag.name}</span>
              <span className="text-xs text-muted">{t("tags.artists", { count: counts.get(tag.id) ?? 0 })}</span>
              <button type="button" aria-label={t("tags.moveUp", { name: tag.name })} disabled={i === 0 || app.busy} onClick={() => void app.moveTag(tag.id, -1)} className={`${btnSecondarySm} px-3`}>
                ↑
              </button>
              <button
                type="button"
                aria-label={t("tags.moveDown", { name: tag.name })}
                disabled={i === ordered.length - 1 || app.busy}
                onClick={() => void app.moveTag(tag.id, 1)}
                className={`${btnSecondarySm} px-3`}
              >
                ↓
              </button>
              <button type="button" aria-label={t("tags.remove", { name: tag.name })} disabled={app.busy} onClick={() => void app.deleteTag(tag.id)} className={`${btnSecondarySm} border-danger px-3 text-danger`}>
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          void app.addTag(name);
          setName("");
        }}
      >
        <label htmlFor="new-tag" className="sr-only">
          {t("tags.newTag")}
        </label>
        <input id="new-tag" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("tags.placeholder")} className={`${input} min-w-48 flex-1 py-1.5 text-sm`} />
        <button type="submit" disabled={!name.trim() || app.busy} className={btnPrimarySm}>
          {t("tags.add")}
        </button>
      </form>

      {ordered.length > 0 && (
        <div className="flex flex-col gap-2">
          <label htmlFor="tag-artist-search" className="text-sm font-semibold text-ink">
            {t("tags.assignLabel")}
          </label>
          <input id="tag-artist-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("tags.assignPlaceholder")} className={`${input} py-1.5 text-sm`} />
          {results.length > 0 && (
            <ul className="grid gap-1">
              {results.map((r) => {
                const key = artistIdentity(r.artist);
                return (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-semibold text-ink">{displayArtist(r.artist)}</span>
                    <select
                      aria-label={t("tags.tagFor", { artist: displayArtist(r.artist) })}
                      value={tagOf.get(key) ?? ""}
                      disabled={app.busy}
                      onChange={(e) => void app.setArtistTag(r.artist, e.target.value || null)}
                      className={select}
                    >
                      <option value="">{t("tags.none")}</option>
                      {ordered.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
