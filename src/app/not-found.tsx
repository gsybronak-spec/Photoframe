import Link from "next/link";
import { Compass, Flower2 } from "lucide-react";

export const metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <div className="glass rounded-[2.5rem] p-12">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-saffron to-coral text-white shadow-glass">
          <Compass className="h-8 w-8" aria-hidden />
        </span>
        <p className="mt-6 font-display text-5xl font-bold text-ink">404</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
          This path is quiet
        </h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          The page you&apos;re looking for has either moved, been made private, or never
          existed. Shared links stop working the moment their creator switches them back
          to private.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/frames"
            className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          >
            <Flower2 className="h-4 w-4" aria-hidden /> Browse frames
          </Link>
          <Link
            href="/"
            className="btn-ghost inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-ink"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
