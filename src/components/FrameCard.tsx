import Link from "next/link";
import { Flame } from "lucide-react";
import {
  buildThumbSVG,
  svgToDataURI,
  frameCategory,
  type CatalogFrame,
  type Frame,
} from "@/lib/frames";

/** Accepts either a code frame or a merged catalogue frame. */
export function FrameCard({
  frame,
}: {
  frame: Frame & { featured?: boolean; category?: string };
}) {
  const thumb = svgToDataURI(buildThumbSVG(frame as CatalogFrame));
  const category = frameCategory(frame);
  const highlighted = frame.featured ?? frame.trending ?? false;

  return (
    <Link
      href={`/frames/${frame.slug}`}
      className="group glass sheen block overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-glass-lg"
    >
      <div className="relative overflow-hidden rounded-t-3xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt={`${frame.title} — ${category} yoga photo frame`}
          width={300}
          height={375}
          loading="lazy"
          decoding="async"
          className="w-full transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {highlighted && (
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-saffron to-coral px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-glass">
            <Flame className="h-3 w-3" aria-hidden /> Featured
          </span>
        )}
        <span className="glass-strong absolute bottom-3 right-3 rounded-full px-3 py-1 text-[11px] font-semibold text-teal-deep">
          {category}
        </span>
      </div>
      <div className="p-5">
        <h3 className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-coral">
          {frame.title}
        </h3>
        <p className="mt-1 text-sm text-ink-soft">{frame.tagline}</p>
      </div>
    </Link>
  );
}
