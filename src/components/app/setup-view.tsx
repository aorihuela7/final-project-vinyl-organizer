"use client";

import { useMemo, useState } from "react";
import { SORT_LEVELS, type SortLevel } from "@/lib/layout";
import {
  newFurniture,
  resizeFurniture,
  type FurnitureConfig,
  type ShelfConfig,
  type StoredRecord,
} from "@/lib/shelf/model";
import { slotPlace } from "@/lib/shelf/describe";
import { TEMPLATES, defaultCapacity, template, type TemplateId } from "@/lib/shelf/templates";
import { Sheet } from "./sheet";
import type { MapPreview, ShelfApp } from "./use-shelf-app";

const LEVEL_LABEL: Record<SortLevel, string> = { genre: "Genre", artist: "Artist", year: "Year", label: "Label", title: "Title" };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? Math.round(n) : min));

/** Shelf configurator and sort order: a form with a live preview, no drag and drop. */
export function SetupView({ app, initial, records, onDone }: { app: ShelfApp; initial: ShelfConfig; records: StoredRecord[]; onDone: () => void }) {
  const [draft, setDraft] = useState<ShelfConfig>(() => structuredClone(initial));
  const [preview, setPreview] = useState<MapPreview | null>(null);
  const [adding, setAdding] = useState<TemplateId>("kallax_4x4");

  const counts = useMemo(() => {
    const c = { vinyl: 0, cd: 0, other: 0 };
    for (const r of records) c[r.media]++;
    return c;
  }, [records]);

  const furniture = [...draft.furniture].sort((a, b) => a.sortIndex - b.sortIndex);
  const capacityOf = (media: "vinyl" | "cd") =>
    furniture
      .filter((f) => f.media === media)
      .reduce((sum, f) => sum + f.compartments.filter((c) => c.status === "available").reduce((s, c) => s + (c.capacity ?? f.defaultCapacity), 0), 0);

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

  const remove = (key: string) =>
    setDraft((d) => ({ ...d, furniture: reindex([...d.furniture].sort((a, b) => a.sortIndex - b.sortIndex).filter((f) => f.key !== key)) }));

  const add = () =>
    setDraft((d) => ({
      ...d,
      furniture: [...d.furniture, newFurniture(adding, d.furniture.length, counts.vinyl === 0 && counts.cd > 0 ? "cd" : "vinyl")],
    }));

  const setLevel = (i: number, value: SortLevel | "") =>
    setDraft((d) => {
      const levels = [...d.settings.sortLevels];
      if (value === "") levels.splice(i);
      else levels[i] = value;
      const unique = levels.filter((l, k) => l && levels.indexOf(l) === k).slice(0, 3);
      return { ...d, settings: { ...d.settings, sortLevels: unique.length ? unique : ["artist"] } };
    });

  const canGenerate = draft.furniture.length > 0 && draft.furniture.every((f) => f.name.trim());

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="shelves-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="shelves-heading" className="text-lg font-semibold text-ink">
            Your shelves
          </h2>
          <p className="text-xs text-ink-muted">Records flow through them in this order.</p>
        </div>

        {furniture.map((f, i) => (
          <ShelfEditor
            key={f.key}
            furniture={f}
            first={i === 0}
            last={i === furniture.length - 1}
            onChange={(change) => update(f.key, change)}
            onMove={(delta) => move(f.key, delta)}
            onRemove={() => remove(f.key)}
          />
        ))}

        {furniture.length === 0 && (
          <p className="rounded-card bg-warning-soft p-3 text-sm text-warning">Add at least one shelf to generate the map.</p>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-card border border-dashed border-line-strong p-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Add a shelf</span>
            <select value={adding} onChange={(e) => setAdding(e.target.value as TemplateId)} className="rounded-control border border-line-strong bg-surface px-2 py-2 text-base">
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={add} className="rounded-control bg-ink px-3 py-2 text-sm font-semibold text-surface hover:bg-ink/85">
            Add
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card" aria-labelledby="order-heading">
        <h2 id="order-heading" className="text-lg font-semibold text-ink">
          Sort order
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <label key={i} className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-ink">{i === 0 ? "First by" : "Then by"}</span>
              <select
                value={draft.settings.sortLevels[i] ?? ""}
                disabled={i > draft.settings.sortLevels.length}
                onChange={(e) => setLevel(i, e.target.value as SortLevel | "")}
                className="rounded-control border border-line-strong bg-surface px-2 py-2 text-base disabled:opacity-50"
              >
                {i > 0 && <option value="">—</option>}
                {SORT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-muted">Ties are always broken by artist, then year, then title.</p>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={draft.settings.ignoreArticles}
            onChange={(e) => setDraft((d) => ({ ...d, settings: { ...d.settings, ignoreArticles: e.target.checked } }))}
            className="size-4 accent-[var(--color-accent)]"
          />
          Ignore articles (“The Beatles” under B, “Los Lobos” under L)
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Free space to leave in every compartment (slack)</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              value={draft.settings.slackPct}
              onChange={(e) => setDraft((d) => ({ ...d, settings: { ...d.settings, slackPct: clamp(Number(e.target.value), 0, 50) } }))}
              className="w-24 rounded-control border border-line-strong bg-surface px-2 py-2 text-base"
            />
            <span className="text-ink-muted">%</span>
          </span>
        </label>
      </section>

      <section className="rounded-card bg-sunken p-3 text-sm text-ink">
        <p>
          Vinyl: {counts.vinyl.toLocaleString("en-US")} records for {capacityOf("vinyl").toLocaleString("en-US")} places
          {counts.cd > 0 && (
            <>
              {" "}
              · CDs: {counts.cd.toLocaleString("en-US")} for {capacityOf("cd").toLocaleString("en-US")} places
            </>
          )}
          {counts.other > 0 && <> · {counts.other} in other formats (not placed)</>}
        </p>
        {counts.cd > 0 && !furniture.some((f) => f.media === "cd") && (
          <p className="mt-1 text-ink-muted">Add a shelf that holds CDs to place your {counts.cd} CDs.</p>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          disabled={!canGenerate || app.busy}
          onClick={() => setPreview(app.previewMap(draft))}
          className="flex-1 rounded-control bg-accent px-4 py-3 text-base font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          Generate map
        </button>
        <button type="button" onClick={onDone} className="rounded-control border border-line-strong px-4 py-3 text-sm font-medium text-ink hover:bg-sunken">
          Cancel
        </button>
      </div>

      {preview && (
        <Sheet title={preview.hasMap ? "Recompute the whole map?" : "Generate the map?"} onClose={() => setPreview(null)}>
          <div className="flex flex-col gap-3 text-sm text-ink">
            {preview.hasMap ? (
              <p>
                <strong>{preview.changed.toLocaleString("en-US")}</strong> record{preview.changed === 1 ? "" : "s"} will change compartment. Calibrations you made are replaced by the new layout.
              </p>
            ) : (
              <p>{preview.placed.toLocaleString("en-US")} records will be placed.</p>
            )}
            {preview.leftover > 0 && (
              <p className="rounded-card bg-warning-soft p-2 text-warning">
                {preview.leftover} record{preview.leftover === 1 ? " doesn't" : "s don't"} fit. They&apos;ll be listed as not on the shelf.
              </p>
            )}
            {preview.slackReduced && preview.leftover === 0 && (
              <p className="rounded-card bg-warning-soft p-2 text-warning">It only fits by using part of the free space you asked for.</p>
            )}
            {preview.notPlaced > 0 && <p className="text-ink-muted">{preview.notPlaced} cassettes, files, or other formats stay off the shelves.</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={app.busy}
                onClick={async () => {
                  await app.generateMap(preview.config);
                  setPreview(null);
                  onDone();
                }}
                className="flex-1 rounded-control bg-accent px-4 py-3 font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {app.busy ? "Saving…" : preview.hasMap ? "Recompute" : "Generate"}
              </button>
              <button type="button" onClick={() => setPreview(null)} className="rounded-control border border-line-strong px-4 py-3 font-medium hover:bg-sunken">
                Back
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function ShelfEditor({
  furniture: f,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  furniture: FurnitureConfig;
  first: boolean;
  last: boolean;
  onChange: (change: (f: FurnitureConfig) => FurnitureConfig) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [tapMode, setTapMode] = useState<"block" | "capacity">("block");
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const id = `shelf-${f.key}`;
  const editingCell = editing ? f.compartments.find((c) => c.row === editing.row && c.col === editing.col) : undefined;

  const toggle = (row: number, col: number) => {
    if (tapMode === "capacity") {
      setEditing({ row, col });
      return;
    }
    onChange((x) => ({
      ...x,
      compartments: x.compartments.map((c) =>
        c.row === row && c.col === col ? { ...c, status: c.status === "blocked" ? "available" : "blocked" } : c,
      ),
    }));
  };

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card" aria-labelledby={`${id}-name`}>
      <div className="flex items-start gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span id={`${id}-name`} className="font-medium text-ink">
            Name
          </span>
          <input
            value={f.name}
            maxLength={60}
            onChange={(e) => onChange((x) => ({ ...x, name: e.target.value }))}
            className="rounded-control border border-line-strong bg-surface px-3 py-2 text-base"
          />
        </label>
        <div className="flex shrink-0 gap-1 pt-6">
          <button type="button" aria-label={`Move ${f.name} up`} disabled={first} onClick={() => onMove(-1)} className="rounded-control border border-line px-2.5 py-2 text-sm disabled:opacity-30">
            ↑
          </button>
          <button type="button" aria-label={`Move ${f.name} down`} disabled={last} onClick={() => onMove(1)} className="rounded-control border border-line px-2.5 py-2 text-sm disabled:opacity-30">
            ↓
          </button>
          <button type="button" aria-label={`Remove ${f.name}`} onClick={onRemove} className="rounded-control border border-line px-2.5 py-2 text-sm text-danger">
            ✕
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Template</span>
          <select
            value={f.template}
            onChange={(e) => {
              const t = template(e.target.value as TemplateId);
              onChange((x) => ({ ...resizeFurniture({ ...x, template: t.id, traversal: t.traversal, defaultCapacity: defaultCapacity(t.id, x.media) }, t.rows, t.cols) }));
            }}
            className="rounded-control border border-line-strong bg-surface px-2 py-2 text-base"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Rows</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            value={f.rows}
            onChange={(e) => onChange((x) => resizeFurniture(x, clamp(Number(e.target.value), 1, 12), x.cols))}
            className="rounded-control border border-line-strong bg-surface px-2 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Columns</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={24}
            value={f.cols}
            onChange={(e) => onChange((x) => resizeFurniture(x, x.rows, clamp(Number(e.target.value), 1, 24)))}
            className="rounded-control border border-line-strong bg-surface px-2 py-2 text-base"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-ink">Records per compartment</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={f.defaultCapacity}
            onChange={(e) => onChange((x) => ({ ...x, defaultCapacity: clamp(Number(e.target.value), 1, 1000) }))}
            className="rounded-control border border-line-strong bg-surface px-2 py-2 text-base"
          />
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium text-ink">Holds</legend>
          <div className="flex gap-3 pt-1">
            {(["vinyl", "cd"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`${id}-media`}
                  checked={f.media === m}
                  onChange={() => onChange((x) => ({ ...x, media: m, defaultCapacity: defaultCapacity(x.template, m) }))}
                  className="accent-[var(--color-accent)]"
                />
                {m === "vinyl" ? "Vinyl" : "CDs"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="col-span-2 flex flex-col gap-1 text-sm">
          <legend className="font-medium text-ink">Read it</legend>
          <div className="flex flex-wrap gap-3 pt-1">
            {(["rows", "columns"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`${id}-traversal`}
                  checked={f.traversal === t}
                  onChange={() => onChange((x) => ({ ...x, traversal: t }))}
                  className="accent-[var(--color-accent)]"
                />
                {t === "rows" ? "By rows (left to right)" : "By columns (top to bottom)"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">Preview</p>
          <div className="flex rounded-control border border-line p-0.5 text-xs" role="group" aria-label="What tapping a compartment does">
            {(["block", "capacity"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={tapMode === m}
                onClick={() => {
                  setTapMode(m);
                  setEditing(null);
                }}
                className={`rounded px-2 py-1 ${tapMode === m ? "bg-ink text-surface" : "text-ink-muted"}`}
              >
                {m === "block" ? "Tap to block" : "Tap to set capacity"}
              </button>
            ))}
          </div>
        </div>
        <TraversalPreview furniture={f} onTap={toggle} editing={editing} />
        {editing && editingCell && (
          <div className="flex flex-wrap items-end gap-2 rounded-card bg-sunken p-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-ink">Capacity of {slotPlace(editing, f)}</span>
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
                className="w-28 rounded-control border border-line-strong bg-surface px-2 py-1.5 text-base"
              />
            </label>
            <button type="button" onClick={() => setEditing(null)} className="rounded-control px-2 py-1.5 font-medium text-ink-muted hover:bg-surface">
              Done
            </button>
            <p className="w-full text-xs text-ink-muted">Leave it empty to use the shelf&apos;s {f.defaultCapacity}.</p>
          </div>
        )}
      </div>
    </article>
  );
}

/** The grid with the traversal order numbered, so you can check it matches how you read your shelf. */
function TraversalPreview({ furniture: f, onTap, editing }: { furniture: FurnitureConfig; onTap: (row: number, col: number) => void; editing: { row: number; col: number } | null }) {
  const order = new Map<string, number>();
  let n = 0;
  const visit = (row: number, col: number) => {
    const c = f.compartments.find((x) => x.row === row && x.col === col);
    if (c && c.status !== "blocked") order.set(`${row}:${col}`, ++n);
  };
  if (f.traversal === "columns") for (let col = 0; col < f.cols; col++) for (let row = 0; row < f.rows; row++) visit(row, col);
  else for (let row = 0; row < f.rows; row++) for (let col = 0; col < f.cols; col++) visit(row, col);

  return (
    <div className="grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${f.cols}, minmax(0, 1fr))` }}>
      {f.compartments.map((c) => {
        const blocked = c.status === "blocked";
        const isEditing = editing?.row === c.row && editing?.col === c.col;
        return (
          <button
            key={`${c.row}:${c.col}`}
            type="button"
            onClick={() => onTap(c.row, c.col)}
            aria-pressed={blocked}
            aria-label={`${slotPlace(c, f)}: ${blocked ? "blocked" : "available"}${c.capacity ? `, capacity ${c.capacity}` : ""}`}
            className={`relative flex aspect-square flex-col items-center justify-center rounded-cell border text-xs ${
              blocked ? "border-transparent bg-blocked text-ink-faint" : "border-line-strong bg-canvas text-ink"
            } ${isEditing ? "ring-2 ring-accent" : ""}`}
          >
            {blocked ? "—" : order.get(`${c.row}:${c.col}`)}
            {!blocked && c.capacity !== null && <span className="text-[9px] text-ink-muted">{c.capacity}</span>}
          </button>
        );
      })}
    </div>
  );
}
