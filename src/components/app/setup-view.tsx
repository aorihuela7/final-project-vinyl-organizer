"use client";

import { useEffect, useMemo, useState } from "react";
import { SORT_LEVELS, type ShelfMedia, type SortLevel } from "@/lib/layout";
import {
  changeMedia,
  changeTemplate,
  discsOf,
  groupOf,
  newFurniture,
  renameForSize,
  resizeAndRename,
  sizeLabel,
  suggestedShelves,
  templateSizeLabel,
  type FurnitureConfig,
  type ShelfConfig,
  type StoredRecord,
} from "@/lib/shelf/model";
import { slotPlace } from "@/lib/shelf/describe";
import { groupFills, shelfHolds } from "@/lib/shelf/capacity";
import { MAX_COLS, TEMPLATES, compartmentAspect, isBoxTemplate, maxRows, rowsPerCube, type TemplateId } from "@/lib/shelf/templates";
import { useI18n } from "@/i18n/client";
import type { Translator } from "@/i18n/core";
import { genreName } from "@/i18n/core";
import { Banner, btnPrimary, btnSecondary, btnSecondarySm, card } from "../ui";
import { Compartment, Furniture } from "./furniture";
import { Sheet } from "./sheet";
import type { MapPreview, ShelfApp } from "./use-shelf-app";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));

const field = "flex flex-col gap-1 text-sm text-muted";
const control = "rounded-[18px] border border-input-line bg-white px-3.5 py-2 text-[15px] text-ink disabled:opacity-50";

type Counts = Record<ShelfMedia | "other", number>;

/** A new shelf's name: the template's, with its size ("Tower 1×5", "Custom shelf 3×3"). */
function shelfName(t: Translator["t"], id: TemplateId): string {
  return id === "custom" ? t("builder.customName", { size: templateSizeLabel(id) }) : t(`templates.${id}`);
}

/**
 * Another template for a shelf. A name that is still the old template's own
 * (at any size) becomes the new template's; a name the user wrote keeps its
 * words, with the size updated if it has one.
 */
function withTemplate(t: Translator["t"], f: FurnitureConfig, id: TemplateId): FurnitureConfig {
  const next = changeTemplate(f, id);
  const ownName = renameForSize(shelfName(t, f.template), templateSizeLabel(f.template), sizeLabel(f));
  const name =
    !f.name.trim() || f.name === ownName
      ? renameForSize(shelfName(t, id), templateSizeLabel(id), sizeLabel(next))
      : renameForSize(f.name, sizeLabel(f), sizeLabel(next));
  return { ...next, name };
}

/** Shelves & order: the shelves as walnut furniture, one open in the builder at a time, and the sort order. No drag and drop. */
export function SetupView({
  app,
  initial,
  records,
  onDone,
  addShelf = null,
  onShelfAdded,
}: {
  app: ShelfApp;
  initial: ShelfConfig;
  records: StoredRecord[];
  onDone: () => void;
  /** Open with a new shelf for this format already added (from "Add a new record"), sized for its records plus one. */
  addShelf?: ShelfMedia | null;
  onShelfAdded?: () => void;
}) {
  const { t } = useI18n();
  // The new shelf, if any, is part of the first draft: SetupView mounts fresh when its tab opens.
  const [added] = useState(() => {
    if (!addShelf) return null;
    const n = records.filter((r) => groupOf(r) === addShelf).length + 1;
    const names = { cube: t("builder.cubeShelf"), single: t("builder.suggestedSingles"), cd: t("builder.suggestedCds") };
    return suggestedShelves(addShelf, n, initial.furniture.length, names);
  });
  const [draft, setDraft] = useState<ShelfConfig>(() => {
    const copy = structuredClone(initial);
    return added ? { ...copy, furniture: [...copy.furniture, ...added] } : copy;
  });
  const [preview, setPreview] = useState<MapPreview | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(() =>
    added ? added[0]!.key : initial.furniture.length > 0 && !app.data?.config ? [...initial.furniture].sort((a, b) => a.sortIndex - b.sortIndex)[0]!.key : null,
  );
  useEffect(() => {
    if (!added) return;
    onShelfAdded?.();
    // Show the new shelf open in the builder.
    const timer = setTimeout(() => document.getElementById(`shelf-${added[0]!.key}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 50);
    return () => clearTimeout(timer);
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Records per group, or places with thickness by format (a double album counts 2).
  const thickness = !!draft.settings.thicknessByFormat;
  const counts = useMemo<Counts>(() => {
    const c: Counts = { lp: 0, single: 0, cd: 0, other: 0 };
    for (const r of records) c[groupOf(r)] += thickness ? discsOf(r) : 1;
    return c;
  }, [records, thickness]);

  const furniture = [...draft.furniture].sort((a, b) => a.sortIndex - b.sortIndex);
  // Sections a shelf can hold: the genres in the collection.
  const sectionOptions = useMemo(() => {
    const genres = [...new Set(records.map((r) => r.genre).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b));
    return { genres };
  }, [records]);

  const update = (key: string, change: (f: FurnitureConfig) => FurnitureConfig) =>
    setDraft((d) => ({ ...d, furniture: d.furniture.map((f) => (f.key === key ? change(f) : f)) }));

  const reindex = (list: FurnitureConfig[]) => list.map((f, i) => ({ ...f, sortIndex: i }));

  const move = (key: string, delta: number) =>
    setDraft((d) => {
      const list = [...d.furniture].sort((a, b) => a.sortIndex - b.sortIndex);
      const i = list.findIndex((f) => f.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j]!, list[i]!];
      return { ...d, furniture: reindex(list) };
    });

  const remove = (key: string) => {
    setDraft((d) => ({ ...d, furniture: reindex([...d.furniture].sort((a, b) => a.sortIndex - b.sortIndex).filter((f) => f.key !== key)) }));
    if (openKey === key) setOpenKey(null);
  };

  const add = (id: TemplateId) => {
    const hasSinglesShelf = draft.furniture.some((f) => f.media === "single");
    const media: ShelfMedia =
      id === "record_box" && counts.single > 0 && !hasSinglesShelf ? "single" : counts.lp === 0 && counts.cd > 0 ? "cd" : "lp";
    const shelf = newFurniture(id, draft.furniture.length, media, shelfName(t, id));
    setDraft((d) => ({ ...d, furniture: [...d.furniture, shelf] }));
    setOpenKey(shelf.key);
  };

  const setLevel = (i: number, value: SortLevel | "") =>
    setDraft((d) => {
      const levels = [...d.settings.sortLevels];
      if (value === "") levels.splice(i);
      else levels[i] = value;
      const unique = levels.filter((l, k) => l && levels.indexOf(l) === k).slice(0, 3);
      return { ...d, settings: { ...d.settings, sortLevels: unique.length ? unique : ["artist"] } };
    });

  const setSlack = (value: number) => setDraft((d) => ({ ...d, settings: { ...d.settings, slackPct: clamp(value, 0, 50) } }));
  const canGenerate = draft.furniture.length > 0 && draft.furniture.every((f) => f.name.trim());

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="shelves-heading" data-tour="shelves">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="shelves-heading" className="font-display text-2xl text-ink">
            {t("builder.yourShelves")}
          </h2>
          <p className="text-sm text-muted">{t("builder.flowOrder")}</p>
        </div>

        {furniture.map((f, i) =>
          f.key === openKey ? (
            <ShelfBuilder
              key={f.key}
              furniture={f}
              sectionOptions={sectionOptions}
              all={draft.furniture}
              counts={counts}
              slackPct={draft.settings.slackPct}
              onSlack={setSlack}
              importing={app.syncJob?.items_total ? { done: app.syncJob.items_done, total: app.syncJob.items_total } : null}
              onChange={(change) => update(f.key, change)}
              onClose={() => setOpenKey(null)}
            />
          ) : (
            <ShelfCard
              key={f.key}
              furniture={f}
              first={i === 0}
              last={i === furniture.length - 1}
              onEdit={() => setOpenKey(f.key)}
              onMove={(delta) => move(f.key, delta)}
              onRemove={() => remove(f.key)}
            />
          ),
        )}

        {furniture.length === 0 && <Banner tone="warning">{t("builder.addOne")}</Banner>}
        {added && <Banner>{t("builder.newShelfReady")}</Banner>}

        <TemplatePicker onAdd={add} />
      </section>

      <SortOrder
        levels={draft.settings.sortLevels}
        ignoreArticles={draft.settings.ignoreArticles}
        thickness={!!draft.settings.thicknessByFormat}
        onLevel={setLevel}
        onIgnoreArticles={(v) => setDraft((d) => ({ ...d, settings: { ...d.settings, ignoreArticles: v } }))}
        onThickness={(v) => setDraft((d) => ({ ...d, settings: { ...d.settings, thicknessByFormat: v } }))}
      />

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-input-line/60 bg-wall/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button type="button" disabled={!canGenerate || app.busy} onClick={() => setPreview(app.previewMap(draft))} className={`${btnPrimary} flex-1`}>
          {t("builder.generate")}
        </button>
        {app.data?.config && (
          <button type="button" onClick={onDone} className={btnSecondary}>
            {t("common.cancel")}
          </button>
        )}
      </div>

      {preview && (
        <Sheet title={preview.hasMap ? t("builder.recomputeTitle") : t("builder.generateTitle")} onClose={() => setPreview(null)}>
          <div className="flex flex-col gap-3 text-sm text-ink">
            {preview.hasMap ? <p>{t("builder.willChange", { count: preview.changed })}</p> : <p>{t("builder.willPlace", { count: preview.placed })}</p>}
            {preview.leftover > 0 && <Banner tone="warning">{t("builder.leftover", { count: preview.leftover })}</Banner>}
            {preview.slackReduced && preview.leftover === 0 && <Banner tone="warning">{t("builder.slackReduced")}</Banner>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={app.busy}
                onClick={async () => {
                  await app.generateMap(preview.config);
                  setPreview(null);
                  onDone();
                }}
                className={`${btnPrimary} flex-1`}
              >
                {app.busy ? t("common.saving") : preview.hasMap ? t("builder.recompute") : t("builder.generateShort")}
              </button>
              <button type="button" onClick={() => setPreview(null)} className={btnSecondary}>
                {t("common.back")}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** A saved or suggested shelf, closed: what it is and how much it holds. */
function ShelfCard({
  furniture: f,
  first,
  last,
  onEdit,
  onMove,
  onRemove,
}: {
  furniture: FurnitureConfig;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const holds = shelfHolds(f);
  return (
    <article className={`${card} flex flex-wrap items-center gap-3 p-3`} aria-label={f.name}>
      <MiniFurniture
        rows={f.rows}
        cols={f.cols}
        blocked={f.compartments.filter((c) => c.status === "blocked").map((c) => `${c.row}:${c.col}`)}
        box={isBoxTemplate(f.template)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg text-ink">{f.name}</p>
        <p className="truncate text-sm text-muted">
          {t("builder.cardLine", { media: t(`media.${f.media}`), template: t(`templates.${f.template}`), rows: f.rows, cols: f.cols })}
        </p>
      </div>
      <p className="font-display text-sm text-ink tabular-nums">{t("builder.holds", { count: holds.places })}</p>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} className={btnSecondarySm}>
          {t("builder.edit")}
        </button>
        <button type="button" aria-label={t("builder.moveUp", { name: f.name })} disabled={first} onClick={() => onMove(-1)} className={`${btnSecondarySm} px-3`}>
          ↑
        </button>
        <button type="button" aria-label={t("builder.moveDown", { name: f.name })} disabled={last} onClick={() => onMove(1)} className={`${btnSecondarySm} px-3`}>
          ↓
        </button>
        <button type="button" aria-label={t("builder.remove", { name: f.name })} onClick={onRemove} className={`${btnSecondarySm} border-danger px-3 text-danger`}>
          ✕
        </button>
      </div>
    </article>
  );
}

/** The shelf being created or edited: the form, what it holds (live), and a preview to tap. */
function ShelfBuilder({
  furniture: f,
  sectionOptions,
  all,
  counts,
  slackPct,
  onSlack,
  importing,
  onChange,
  onClose,
}: {
  furniture: FurnitureConfig;
  sectionOptions: { genres: string[] };
  all: FurnitureConfig[];
  counts: Counts;
  slackPct: number;
  onSlack: (v: number) => void;
  importing: { done: number; total: number } | null;
  onChange: (change: (f: FurnitureConfig) => FurnitureConfig) => void;
  onClose: () => void;
}) {
  const { t, n, locale } = useI18n();
  const [tapMode, setTapMode] = useState<"block" | "capacity">("block");
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const id = `shelf-${f.key}`;
  const holds = shelfHolds(f);
  const fills = groupFills(all, { lp: counts.lp, single: counts.single, cd: counts.cd }, slackPct);
  const editingCell = editing ? f.compartments.find((c) => c.row === editing.row && c.col === editing.col) : undefined;

  const tap = (row: number, col: number) => {
    if (tapMode === "capacity") {
      setEditing({ row, col });
      return;
    }
    onChange((x) => ({
      ...x,
      compartments: x.compartments.map((c) => (c.row === row && c.col === col ? { ...c, status: c.status === "blocked" ? "available" : "blocked" } : c)),
    }));
  };

  // CDs stand in two rows per cube: changeMedia splits or joins the rows.
  const setMedia = (media: ShelfMedia) =>
    onChange((x) => {
      const next = changeMedia(x, media);
      return { ...next, name: renameForSize(x.name, sizeLabel(x), sizeLabel(next)) };
    });

  const arithmetic =
    holds.overrides > 0
      ? t("builder.arithmeticMixed", { count: holds.open, open: holds.open, overrides: holds.overrides })
      : t("builder.arithmetic", { count: holds.open, open: holds.open, capacity: f.defaultCapacity });

  return (
    <article id={id} className="scroll-mt-4 grid items-start gap-[22px] min-[900px]:grid-cols-2" aria-labelledby={`${id}-title`}>
      <div className={`${card} flex flex-col gap-3.5 p-[18px]`}>
        <div className="flex items-start justify-between gap-2">
          <h3 id={`${id}-title`} className="font-display text-xl text-ink">
            {f.name.trim() || t("builder.newShelf")}
          </h3>
          <button type="button" onClick={onClose} className={btnSecondarySm}>
            {t("common.done")}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={`${field} col-span-2`}>
            {t("builder.name")}
            <input value={f.name} maxLength={60} onChange={(e) => onChange((x) => ({ ...x, name: e.target.value }))} className={control} />
          </label>
          <label className={field}>
            {t("builder.template")}
            <select
              value={f.template}
              onChange={(e) => {
                const id = e.target.value as TemplateId;
                onChange((x) => withTemplate(t, x, id));
              }}
              className={control}
            >
              {TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {t(`templates.${tpl.id}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            {t("builder.holdsLabel")}
            <select value={f.media} onChange={(e) => setMedia(e.target.value as ShelfMedia)} className={control}>
              {(["lp", "single", "cd"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`media.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            {t("builder.rows")}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxRows(f.template, f.media)}
              value={f.rows}
              onChange={(e) => onChange((x) => resizeAndRename(x, clamp(Number(e.target.value), 1, maxRows(x.template, x.media)), x.cols))}
              className={control}
            />
          </label>
          <label className={field}>
            {t("builder.cols")}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_COLS}
              value={f.cols}
              onChange={(e) => onChange((x) => resizeAndRename(x, x.rows, clamp(Number(e.target.value), 1, MAX_COLS)))}
              className={control}
            />
          </label>
          {rowsPerCube(f.template, f.media) === 2 && <p className="col-span-2 -mt-1 text-xs text-muted">{t("builder.cdRows")}</p>}
          <label className={field}>
            {t("builder.perCompartment")}
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={f.defaultCapacity}
              onChange={(e) => onChange((x) => ({ ...x, defaultCapacity: clamp(Number(e.target.value), 1, 1000) }))}
              className={control}
            />
          </label>
          <label className={field}>
            {t("builder.freeSpace")}
            <span className="flex items-center gap-2">
              <input type="number" inputMode="numeric" min={0} max={50} value={slackPct} onChange={(e) => onSlack(Number(e.target.value))} className={`${control} w-full`} />
              <span aria-hidden>%</span>
            </span>
          </label>
          {/* The only way to match the map to the real shelf: the capacity is an estimate. */}
          <p className="col-span-2 -mt-1 text-xs text-muted">{t("builder.capacityHint")}</p>
          <label className={`${field} col-span-2`}>
            {t("builder.section")}
            <select value={f.section ?? ""} onChange={(e) => onChange((x) => ({ ...x, section: e.target.value || null }))} className={control}>
              <option value="">{t("builder.sectionNone")}</option>
              {sectionOptions.genres.map((g) => (
                <option key={`genre:${g}`} value={`genre:${g}`}>
                  {t("builder.sectionGenre", { name: genreName(locale, g) })}
                </option>
              ))}
            </select>
            {f.section && <span className="text-xs">{t("builder.sectionHint")}</span>}
          </label>
          <fieldset className={`${field} col-span-2`}>
            <legend className="mb-1">{t("builder.readIt")}</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink">
              {(["rows", "columns"] as const).map((tr) => (
                <label key={tr} className="flex items-center gap-1.5">
                  <input type="radio" name={`${id}-traversal`} checked={f.traversal === tr} onChange={() => onChange((x) => ({ ...x, traversal: tr }))} className="accent-ink" />
                  {t(tr === "rows" ? "builder.byRows" : "builder.byColumns")}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <p className="surface-walnut m-0 rounded-[4px] px-3.5 py-3" aria-live="polite">
          <strong className="block font-display text-[22px] font-normal">{t("builder.thisHolds", { count: holds.places, media: t(`mediaShort.${f.media}`) })}</strong>
          <span className="text-[13px] opacity-85">{holds.blocked > 0 ? t("builder.withBlocked", { text: arithmetic, count: holds.blocked }) : arithmetic}</span>
        </p>

        <div className="grid gap-2.5" aria-live="polite">
          {importing && <p className="text-sm text-muted">{t("builder.importing", { done: importing.done, total: importing.total })}</p>}
          {fills.map((g) => {
            const over = g.wontFit > 0;
            return (
              <div key={g.media} className="grid gap-1 text-sm text-ink">
                <div>
                  {g.places > 0
                    ? t(g.media === f.media ? "builder.fillWithThis" : "builder.fill", { media: t(`media.${g.media}`), count: g.records, pct: g.pct, places: g.places })
                    : t("builder.fillNoShelf", { media: t(`media.${g.media}`), count: g.records })}
                </div>
                <div className="h-3 overflow-hidden rounded-[6px] bg-meter-track shadow-[inset_0_1px_2px_rgb(0_0_0/0.15)]" aria-hidden>
                  <div className="h-full" style={{ width: `${Math.min(100, g.pct)}%`, background: over ? "var(--color-mustard)" : "var(--gradient-meter)" }} />
                </div>
                {over && <p className="font-semibold text-warning">{t("builder.wontFit", { count: g.wontFit, slack: slackPct })}</p>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{tapMode === "block" ? t("builder.tapToBlockHint") : t("builder.tapCapacityHint")}</p>
          <div className="flex rounded-pill border border-input-line bg-paper p-0.5 text-xs" role="group" aria-label={t("builder.tapMode")}>
            {(["block", "capacity"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={tapMode === m}
                onClick={() => {
                  setTapMode(m);
                  setEditing(null);
                }}
                className={`rounded-pill px-3 py-1 font-semibold ${tapMode === m ? "bg-ink text-paper" : "text-muted"}`}
              >
                {t(m === "block" ? "builder.tapBlock" : "builder.tapCapacity")}
              </button>
            ))}
          </div>
        </div>
        <PreviewFurniture furniture={f} onTap={tap} editing={editing} places={holds.places} tapMode={tapMode} />
        {editing && editingCell && (
          <div className={`${card} flex flex-wrap items-end gap-2 p-3 text-sm`}>
            <label className={field}>
              {t("builder.capacityOf", { place: slotPlace(editing, f, t) })}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                autoFocus
                placeholder={String(f.defaultCapacity)}
                value={editingCell.capacity ?? ""}
                onChange={(e) => {
                  const value = e.target.value === "" ? null : clamp(Number(e.target.value), 1, 1000);
                  onChange((x) => ({
                    ...x,
                    compartments: x.compartments.map((c) => (c.row === editing.row && c.col === editing.col ? { ...c, capacity: value } : c)),
                  }));
                }}
                className={`${control} w-28`}
              />
            </label>
            <button type="button" onClick={() => setEditing(null)} className={btnSecondarySm}>
              {t("common.done")}
            </button>
            <p className="w-full text-xs text-muted">{t("builder.capacityEmpty", { count: n(f.defaultCapacity) })}</p>
          </div>
        )}
      </div>
    </article>
  );
}

/** The shelf as walnut furniture, numbered in the order records flow, so you can check it matches how you read it. */
function PreviewFurniture({
  furniture: f,
  onTap,
  editing,
  places,
  tapMode,
}: {
  furniture: FurnitureConfig;
  onTap: (row: number, col: number) => void;
  editing: { row: number; col: number } | null;
  places: number;
  tapMode: "block" | "capacity";
}) {
  const { t } = useI18n();
  const order = new Map<string, number>();
  let count = 0;
  const visit = (row: number, col: number) => {
    const c = f.compartments.find((x) => x.row === row && x.col === col);
    if (c && c.status !== "blocked") order.set(`${row}:${col}`, ++count);
  };
  if (f.traversal === "columns") for (let col = 0; col < f.cols; col++) for (let row = 0; row < f.rows; row++) visit(row, col);
  else for (let row = 0; row < f.rows; row++) for (let col = 0; col < f.cols; col++) visit(row, col);
  const aspect = compartmentAspect(f.template, f.media);

  return (
    <Furniture cols={f.cols} title={t("builder.preview")} aside={t("map.places", { count: places })} maxCell={110}>
      {f.compartments.map((c) => {
        const blocked = c.status === "blocked";
        const isEditing = editing?.row === c.row && editing?.col === c.col;
        const place = slotPlace(c, f, t);
        const label = `${place}: ${blocked ? t("builder.blocked") : t("builder.available")}${c.capacity ? `, ${t("builder.capacityN", { count: c.capacity })}` : ""}`;
        return blocked ? (
          <Compartment
            key={`${c.row}:${c.col}`}
            aspect={aspect}
            blocked={t("map.blocked")}
            interactive
            ariaLabel={label}
            ariaPressed={tapMode === "block" ? true : undefined}
            onActivate={() => onTap(c.row, c.col)}
            plate={null}
          />
        ) : (
          <Compartment
            key={`${c.row}:${c.col}`}
            aspect={aspect}
            interactive
            found={isEditing}
            ariaLabel={label}
            ariaPressed={tapMode === "block" ? false : undefined}
            onActivate={() => onTap(c.row, c.col)}
            plate={null}
          >
            <span className="absolute top-1 left-1.5 text-2xs text-on-walnut/80 tabular-nums">{order.get(`${c.row}:${c.col}`)}</span>
            {c.capacity !== null && (
              <span className="absolute right-1 bottom-1 rounded-[3px] bg-(--color-badge) px-1 text-2xs text-on-walnut tabular-nums">{c.capacity}</span>
            )}
          </Compartment>
        );
      })}
    </Furniture>
  );
}

/** A tiny walnut drawing of a template: its grid, blocked cells, and legs. */
function MiniFurniture({ rows, cols, blocked = [], box = false }: { rows: number; cols: number; blocked?: string[]; box?: boolean }) {
  const cell = Math.max(5, Math.min(12, Math.floor(56 / Math.max(rows, cols))));
  const w = cols * cell * (box ? 1.25 : 1) + (cols - 1) * 2 + 8;
  const h = rows * cell + (rows - 1) * 2 + 8;
  return (
    <span aria-hidden className="relative inline-block shrink-0 pb-2" style={{ width: w }}>
      <span className="surface-walnut grid gap-[2px] rounded-[2px] p-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, height: h }}>
        {Array.from({ length: rows * cols }, (_, i) => {
          const key = `${Math.floor(i / cols)}:${i % cols}`;
          return <span key={i} className={blocked.includes(key) ? "bg-walnut-blocked" : "surface-interior"} />;
        })}
      </span>
      <span className="absolute bottom-0 left-1.5 h-2 w-1 -skew-x-[8deg] rounded-b-sm" style={{ background: "var(--gradient-leg)" }} />
      <span className="absolute right-1.5 bottom-0 h-2 w-1 skew-x-[8deg] rounded-b-sm" style={{ background: "var(--gradient-leg)" }} />
    </span>
  );
}

/** "Add a shelf": every template drawn as small walnut furniture. */
function TemplatePicker({ onAdd }: { onAdd: (id: TemplateId) => void }) {
  const { t } = useI18n();
  return (
    <div className={`${card} flex flex-col gap-3 p-4`}>
      <h3 className="font-display text-lg text-ink">{t("builder.addShelf")}</h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {TEMPLATES.map((tpl) => (
          <li key={tpl.id}>
            <button
              type="button"
              onClick={() => onAdd(tpl.id)}
              className="flex h-full w-full flex-col items-center gap-2 rounded-card border border-input-line bg-paper px-2 py-3 text-center hover:border-ink"
            >
              <MiniFurniture rows={tpl.rows} cols={tpl.cols} box={tpl.kind === "box"} />
              <span className="text-sm font-semibold text-ink">{t(`templates.${tpl.id}`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SortOrder({
  levels,
  ignoreArticles,
  thickness,
  onLevel,
  onIgnoreArticles,
  onThickness,
}: {
  levels: SortLevel[];
  ignoreArticles: boolean;
  thickness: boolean;
  onLevel: (i: number, v: SortLevel | "") => void;
  onIgnoreArticles: (v: boolean) => void;
  onThickness: (v: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <section className={`${card} flex flex-col gap-3 p-[18px]`} aria-labelledby="order-heading">
      <h2 id="order-heading" className="font-display text-2xl text-ink">
        {t("builder.sortOrder")}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <label key={i} className={field}>
            {i === 0 ? t("builder.firstBy") : t("builder.thenBy")}
            <select value={levels[i] ?? ""} disabled={i > levels.length} onChange={(e) => onLevel(i, e.target.value as SortLevel | "")} className={control}>
              {i > 0 && <option value="">{t("builder.none")}</option>}
              {SORT_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`levelNames.${l}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted">{t("builder.ties")}</p>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={ignoreArticles} onChange={(e) => onIgnoreArticles(e.target.checked)} className="size-4 accent-ink" />
        {t("builder.ignoreArticles")}
      </label>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={thickness} onChange={(e) => onThickness(e.target.checked)} className="size-4 accent-ink" />
        {t("builder.thickness")}
      </label>
    </section>
  );
}
