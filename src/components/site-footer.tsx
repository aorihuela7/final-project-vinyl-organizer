import { DISCOGS_NOTICE } from "@/lib/config";

/** Footer on every page, with the Discogs non-affiliation notice copied verbatim from the API Terms of Use. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto max-w-5xl px-4 py-6 text-xs leading-relaxed text-ink-muted">
        <p>{DISCOGS_NOTICE}</p>
      </div>
    </footer>
  );
}
