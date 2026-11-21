"use client";

import { useEffect, useState } from "react";
import { SAMPLE_COLLECTIONS, type SampleCollection } from "@/lib/config";
import { useI18n } from "@/i18n/client";
import { DiscogsAttribution } from "./app/discogs-attribution";
import { input } from "./ui";

type Sample = { username: SampleCollection; count: number | null };

let request: Promise<Sample[]> | null = null;

/**
 * The sample collections with their counts from Discogs, fetched once per page
 * load. If Discogs can't be reached, the list still shows, without numbers.
 */
function loadSamples(): Promise<Sample[]> {
  request ??= fetch("/api/discogs/samples")
    .then((res) => (res.ok ? (res.json() as Promise<{ samples: Sample[] }>) : Promise.reject(new Error(String(res.status)))))
    .then((json) => json.samples)
    .catch(() => {
      request = null;
      return SAMPLE_COLLECTIONS.map((username) => ({ username, count: null }));
    });
  return request;
}

/**
 * For people without a Discogs collection: a list of public ones to try the
 * import with. Picking one fills the username field; the Import button stays
 * the same.
 */
export function SampleCollections({ id, value, onPick }: { id: string; value: string; onPick: (username: string) => void }) {
  const { t } = useI18n();
  const [samples, setSamples] = useState<Sample[] | null>(null);

  useEffect(() => {
    let alive = true;
    void loadSamples().then((s) => {
      if (alive) setSamples(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!samples || samples.length === 0) return null;
  const selected = samples.find((s) => s.username === value.trim().toLowerCase())?.username ?? "";
  const withCounts = samples.some((s) => s.count !== null);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted">
        {t("samples.label")}
      </label>
      <select id={id} value={selected} onChange={(e) => e.target.value && onPick(e.target.value)} className={`${input} text-sm`}>
        <option value="">{t("samples.choose")}</option>
        {samples.map((s) => {
          const about = t(`samples.about.${s.username}`);
          return (
            <option key={s.username} value={s.username}>
              {s.count === null
                ? t("samples.optionNoCount", { username: s.username, about })
                : t("samples.option", { username: s.username, records: t("common.records", { count: s.count }), about })}
            </option>
          );
        })}
      </select>
      {/* The counts are Discogs data: attribute them, linking to the chosen collection. */}
      {withCounts && (
        <DiscogsAttribution href={selected ? `https://www.discogs.com/user/${selected}/collection` : "https://www.discogs.com"} className="self-start" />
      )}
    </div>
  );
}
