/**
 * One sentence on what Discogs is, for people who've never heard of it, with
 * "Discogs" linking to the site. `text` is the translated sentence with
 * "{discogs}" where the link goes (works on the server and in the browser).
 */
export function AboutDiscogs({ text, className = "" }: { text: string; className?: string }) {
  const [before, after = ""] = text.split("{discogs}");
  return (
    <p className={`text-sm text-muted ${className}`}>
      {before}
      <a href="https://www.discogs.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-2">
        Discogs
      </a>
      {after}
    </p>
  );
}
