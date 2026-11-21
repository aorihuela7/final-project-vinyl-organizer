import { DISCOGS_NOTICE } from "@/lib/config";

/** Footer on every page, with the Discogs non-affiliation notice copied verbatim from the API Terms of Use (always in English). */
export function SiteFooter() {
  return (
    <footer className="mt-10 bg-wall">
      <div className="mx-auto max-w-6xl border-t border-input-line/60 px-4 py-6 text-xs leading-relaxed text-muted sm:px-6">
        <p lang="en">{DISCOGS_NOTICE}</p>
      </div>
    </footer>
  );
}
