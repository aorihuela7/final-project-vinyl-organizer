import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { APP_PITCH } from "@/lib/config";

const PREVIEW_RANGES = [
  ["A", "Bea"], ["Bee", "Bow"], ["Box", "Cl"], ["Co", "Da"],
  ["De", "Dy"], null, null, ["E", "Fl"],
  ["Fo", "Ga"], ["Ge", "Ha"], ["He", "J"], ["K", "Le"],
  ["Li", "Ma"], ["Me", "Ni"], ["No", "Pi"], ["Pl", "Z"],
] as const;
const PREVIEW_FILL = [72, 80, 64, 77, 70, 0, 0, 58, 81, 66, 74, 69, 79, 61, 75, 52];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 md:flex-row md:items-start md:gap-14 md:py-16">
      <section className="flex flex-1 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Know where every record is, and where the next one goes.
          </h1>
          <p className="text-lg leading-relaxed text-ink-muted">{APP_PITCH}</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/app?start=demo"
            className="rounded-control bg-accent px-5 py-3 text-center text-base font-semibold text-on-accent shadow-card hover:bg-accent-hover"
          >
            Try the demo collection
          </Link>
          <Link
            href="/sign-up"
            className="rounded-control border border-line-strong bg-surface px-5 py-3 text-center text-base font-semibold text-ink hover:bg-sunken"
          >
            Sign up
          </Link>
        </div>
        <p className="text-sm text-ink-muted">No account needed for the demo. Sign up only when you want to save.</p>

        <div className="rounded-card border border-line bg-surface p-4 shadow-card">
          <h2 className="mb-3 text-base font-semibold text-ink">Import your collection from Discogs</h2>
          <ImportForm />
        </div>
      </section>

      <section aria-label="Example map" className="flex-1">
        <figure className="rounded-card border border-line bg-surface p-4 shadow-card">
          <div className="grid grid-cols-4 gap-1.5">
            {PREVIEW_RANGES.map((range, i) =>
              range ? (
                <div key={i} className="flex aspect-square flex-col justify-between rounded-cell border border-line bg-canvas p-1.5">
                  <span className="text-[11px] font-medium leading-tight text-ink sm:text-xs">
                    {range[0]} – {range[1]}
                  </span>
                  <span className="h-1 w-full overflow-hidden rounded-full bg-line">
                    <span className="block h-full bg-ink/70" style={{ width: `${PREVIEW_FILL[i]}%` }} />
                  </span>
                </div>
              ) : (
                <div key={i} className="flex aspect-square items-center justify-center rounded-cell bg-blocked text-[10px] text-ink-faint">
                  turntable
                </div>
              ),
            )}
          </div>
          <figcaption className="mt-3 text-sm text-ink-muted">
            A Kallax 4×4: every compartment shows its range and how full it is. Search a record and see the exact cube, how far in, and the two records on each side.
          </figcaption>
        </figure>
      </section>
    </main>
  );
}
