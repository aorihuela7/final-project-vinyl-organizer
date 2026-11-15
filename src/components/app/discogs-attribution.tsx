import { DISCOGS_ATTRIBUTION } from "@/lib/config";

/** "Data provided by Discogs", linking to the release page (or to Discogs for a whole screen). */
export function DiscogsAttribution({ href = "https://www.discogs.com", className = "" }: { href?: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`text-xs text-ink-muted underline underline-offset-2 hover:text-ink ${className}`}>
      {DISCOGS_ATTRIBUTION}
    </a>
  );
}
