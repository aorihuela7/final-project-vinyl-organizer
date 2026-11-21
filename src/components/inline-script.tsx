/**
 * A script that runs while the HTML is parsed, before the first paint.
 * On the client it renders as text/plain so React doesn't warn or run it twice.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
