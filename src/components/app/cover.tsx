"use client";

import { useState } from "react";
import { hashIndex, initials, spineColor } from "@/lib/design";

/**
 * A record cover, straight from the Discogs URL (never downloaded or proxied,
 * never altered). Same square frame, radius, and shadow everywhere. Without a
 * cover, or if it fails to load: our own placeholder, never a broken image.
 */
export function Cover({ src, artist, title, size = "md" }: { src: string | null | undefined; artist: string; title: string; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? "size-12" : size === "lg" ? "w-full max-w-64" : "size-20";
  const text = size === "sm" ? "text-sm" : size === "lg" ? "text-5xl" : "text-xl";

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${artist} – ${title} (no cover)`}
        className={`${box} flex aspect-square shrink-0 items-center justify-center rounded-cover font-semibold text-ink/70 shadow-cover ${text}`}
        style={{ background: spineColor(hashIndex(artist)) }}
      >
        {initials(artist)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- covers come straight from Discogs, without next/image optimization.
    <img
      src={src}
      alt={`${artist} – ${title}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${box} aspect-square shrink-0 rounded-cover bg-sunken object-cover shadow-cover`}
    />
  );
}
