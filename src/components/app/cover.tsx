"use client";

import { useState } from "react";
import { hashIndex, initials, onSpineColor, spineColor } from "@/lib/design";
import { useI18n } from "@/i18n/client";

/**
 * A record cover, straight from the Discogs URL (never downloaded or proxied,
 * never altered). Same square frame, radius, and shadow everywhere. Without a
 * cover, or if it fails to load: our own placeholder, never a broken image.
 */
export function Cover({
  src,
  artist,
  title,
  size = "md",
  className = "",
}: {
  src: string | null | undefined;
  artist: string;
  title: string;
  size?: "sm" | "md" | "lg" | "detail" | "fill";
  className?: string;
}) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const box = { sm: "size-12", md: "size-20", lg: "w-full max-w-64", detail: "size-[104px]", fill: "w-full" }[size];
  const text = { sm: "text-sm", md: "text-xl", lg: "text-5xl", detail: "text-[22px]", fill: "text-base" }[size];

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={t("cover.none", { artist, title })}
        className={`${box} flex aspect-square shrink-0 items-center justify-center rounded-cover font-semibold shadow-cover ${text} ${className}`}
        style={{ background: spineColor(hashIndex(artist)), color: onSpineColor(hashIndex(artist)) }}
      >
        {initials(artist)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- covers come straight from Discogs, without next/image optimization.
    <img
      src={src}
      alt={`${artist}, ${title}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${box} aspect-square shrink-0 rounded-cover bg-sunken object-cover shadow-cover ${className}`}
    />
  );
}
