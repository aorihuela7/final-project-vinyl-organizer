"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
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

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
};

/**
 * The Discogs username field. Focusing it opens a list of public collections
 * to try (for people without one of their own), each with its size and what's
 * in it; typing narrows the list, and picking one fills the field. Arrow keys,
 * Enter, and Escape work as in any combobox.
 */
export function UsernameField({ id, value, onChange, placeholder, invalid, describedBy, className = "" }: Props) {
  const { t } = useI18n();
  const listId = useId();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    let alive = true;
    void loadSamples().then((s) => {
      if (alive) setSamples(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const typed = value.trim().toLowerCase();
  const options = samples.filter((s) => s.username.startsWith(typed) && s.username !== typed);
  const shown = open && options.length > 0;
  const withCounts = options.some((s) => s.count !== null);
  const highlighted = options[active];

  const pick = (username: string) => {
    onChange(username);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Enter" && shown && highlighted) {
      e.preventDefault();
      pick(highlighted.username);
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={`relative min-w-0 ${className}`}>
      <input
        id={id}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown && highlighted ? `${listId}-${highlighted.username}` : undefined}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`${input} w-full`}
      />
      {shown && (
        // Pressing inside the list doesn't take the focus from the field, so the list stays open until a pick.
        <div onMouseDown={(e) => e.preventDefault()} className="absolute top-full right-0 left-0 z-30 mt-1.5 overflow-hidden rounded-card border border-input-line bg-paper shadow-card">
          <p className="px-4 pt-2.5 pb-1 text-xs text-muted">{t("samples.label")}</p>
          <ul role="listbox" id={listId} aria-label={t("samples.label")} className="max-h-72 overflow-y-auto pb-1">
            {options.map((s, i) => {
              const about = t(`samples.about.${s.username}`);
              return (
                <li
                  key={s.username}
                  id={`${listId}-${s.username}`}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => pick(s.username)}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-4 py-2 text-sm text-ink ${i === active ? "bg-mustard-soft" : ""}`}
                >
                  <span className="font-semibold">{s.username}</span>{" "}
                  <span className="text-muted">
                    ({s.count === null ? about : `${t("common.records", { count: s.count })}, ${about}`})
                  </span>
                </li>
              );
            })}
          </ul>
          {/* The counts are Discogs data: attribute them, linking to the collection under the pointer. */}
          {withCounts && (
            <div className="border-t border-rule px-4 py-1.5">
              <DiscogsAttribution href={highlighted ? `https://www.discogs.com/user/${highlighted.username}/collection` : "https://www.discogs.com"} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
