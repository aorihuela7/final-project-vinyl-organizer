"use client";

import { useState } from "react";
import { displayArtist } from "@/lib/layout";
import type { StoredRecord, TempLocation } from "@/lib/shelf/model";
import { useI18n } from "@/i18n/client";
import { Banner, btnPrimarySm, btnSecondarySm, btnText, card, input } from "../ui";

const SUGGESTIONS = ["turntable", "gigBag", "discards", "display", "pile"] as const;

/** "Where is it going?": the places already used, a few suggestions, or a new name. */
export function TakeOutChooser({
  locations,
  busy,
  onChoose,
  onCancel,
}: {
  locations: TempLocation[];
  busy: boolean;
  onChoose: (name: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const used = new Set(locations.map((l) => l.name.toLocaleLowerCase()));
  const options = [...locations.map((l) => l.name), ...SUGGESTIONS.map((s) => t(`temp.suggestions.${s}`)).filter((n) => !used.has(n.toLocaleLowerCase()))];
  return (
    <div className="flex flex-col gap-2 rounded-card border border-input-line p-3">
      <p className="text-sm font-semibold text-ink">{t("temp.chooseTitle")}</p>
      <ul className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <li key={option}>
            <button type="button" disabled={busy} onClick={() => onChoose(option)} className={btnSecondarySm}>
              {option}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onChoose(name);
        }}
      >
        <label htmlFor="temp-location-name" className="sr-only">
          {t("temp.elsewhere")}
        </label>
        <input
          id="temp-location-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("temp.otherPlaceholder")}
          className={`${input} min-w-40 flex-1 py-1.5 text-sm`}
        />
        <button type="submit" disabled={busy || !name.trim()} className={btnPrimarySm}>
          {t("temp.confirm")}
        </button>
        <button type="button" onClick={onCancel} className={btnText}>
          {t("common.cancel")}
        </button>
      </form>
    </div>
  );
}

/** Shown in the record card while the record is out. */
export function OutBanner({ location, busy, onPutBack }: { location: TempLocation; busy: boolean; onPutBack?: () => void }) {
  const { t } = useI18n();
  return (
    <Banner className="mx-[18px] flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 flex-1">
        <strong className="block">{t("temp.outBanner", { location: location.name })}</strong>
        <span className="text-muted">{t("temp.outHint")}</span>
      </span>
      {onPutBack && (
        <button type="button" disabled={busy} onClick={onPutBack} className={btnPrimarySm}>
          {t("temp.putBackButton")}
        </button>
      )}
    </Banner>
  );
}

/** Every record that's out, by place, with "Put it back". */
export function OutOfShelfPanel({
  records,
  locations,
  busy,
  onPutBack,
  onShow,
}: {
  records: StoredRecord[];
  locations: TempLocation[];
  busy: boolean;
  onPutBack: (id: string) => void;
  onShow: (id: string) => void;
}) {
  const { t } = useI18n();
  const out = records.filter((r) => r.temp_location_id);
  if (out.length === 0) return null;
  const byPlace = locations.map((l) => ({ location: l, items: out.filter((r) => r.temp_location_id === l.id) })).filter((g) => g.items.length > 0);
  return (
    <details className={`${card} p-3`} open={out.length <= 3}>
      <summary className="cursor-pointer font-display text-lg text-ink">{t("temp.panelTitle", { count: out.length })}</summary>
      <div className="mt-2 grid gap-3">
        {byPlace.map(({ location, items }) => (
          <section key={location.id} aria-label={location.name}>
            <h3 className="mb-1 border-b-2 border-brass pb-0.5 text-[13px] font-semibold text-muted">{location.name}</h3>
            <ul className="grid gap-1">
              {items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-ink">{displayArtist(r.artist)}</span>
                    <span className="text-muted">, {r.title}</span>
                  </span>
                  <button type="button" onClick={() => onShow(r.id)} className={btnText}>
                    {t("temp.show")}
                  </button>
                  <button type="button" disabled={busy} onClick={() => onPutBack(r.id)} className={btnSecondarySm}>
                    {t("temp.putBackButton")}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
