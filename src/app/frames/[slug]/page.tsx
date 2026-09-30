import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, ShieldCheck } from "lucide-react";
import { getAllFrames, buildThumbSVG, svgToDataURI, type Frame } from "@/lib/frames";
import { findAnyFrame, getCatalog, getPublicFrames } from "@/server/frame-catalog";
import { FrameEditor } from "@/components/FrameEditor";
import { FrameCard } from "@/components/FrameCard";
import { Reveal } from "@/components/Reveal";
import { ViewTracker } from "@/components/ViewTracker";

export function generateStaticParams() {
  return getAllFrames().map((f) => ({ slug: f.slug }));
}

export const dynamicParams = true;
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const frame = await findAnyFrame(slug);
  if (!frame) return {};

  const title = `${frame.title} — Yoga Photo Frame`;
  const description = `${frame.description} ${frame.tagline}.`;

  return {
    title,
    description,
    keywords: [...frame.tags, "yoga photo frame", frame.category || "General"].join(", "),
    alternates: { canonical: `/frames/${frame.slug}` },
    openGraph: {
      title: `${frame.title} | ZenFrame`,
      description,
      url: `${SITE_URL}/frames/${frame.slug}`,
      type: "article",
      siteName: "ZenFrame",
      images: [
        {
          url: `/frames/${frame.slug}/og`,
          width: 1000,
          height: 1250,
          alt: `${frame.title} frame preview`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${frame.title} | ZenFrame`,
      description,
      images: [`/frames/${frame.slug}/og`],
    },
  };
}

export default async function FramePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Always resolve any registered frame (canonical slug or alias, active or inactive)
  // so refreshing or re-opening a frame never causes a 404 or disappears.
  const frame = await findAnyFrame(slug);
  if (!frame) notFound();

  const catalog = await getCatalog();
  const categoryLabel = frame.category || "General";

  const related = (await getPublicFrames())
    .filter((f) => (f.category || "General") === categoryLabel && f.slug !== frame.slug)
    .slice(0, 4);

  const thumb = svgToDataURI(buildThumbSVG(frame as Frame));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: `${frame.title} — Yoga Photo Frame`,
    description: frame.description,
    genre: categoryLabel,
    keywords: frame.tags.join(", "),
    url: `${SITE_URL}/frames/${frame.slug}`,
    image: `${SITE_URL}/frames/${frame.slug}/og`,
    creator: { "@type": "Organization", name: "ZenFrame" },
    isAccessibleForFree: true,
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ViewTracker event="frame_view" props={{ frame: frame.slug }} />

      <Link
        href="/frames"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft transition hover:text-coral"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to gallery
      </Link>

      <Reveal>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="glass inline-block rounded-full px-4 py-1.5 text-xs font-semibold text-teal-deep">
              {categoryLabel}
            </span>
            <h1 className="mt-4 font-display text-5xl font-semibold text-ink">
              {frame.title}
            </h1>
            <p className="mt-2 max-w-lg text-lg text-ink-soft">{frame.tagline}</p>
            <p className="mt-3 flex flex-wrap gap-2">
              {frame.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold text-ink-soft"
                >
                  #{t}
                </span>
              ))}
            </p>
          </div>
          <div className="glass flex items-center gap-6 rounded-2xl px-6 py-4">
            <span className="flex items-center gap-2 text-sm text-ink-soft">
              <Clock className="h-4 w-4 text-teal" aria-hidden /> ~12s to create
            </span>
            <span className="flex items-center gap-2 text-sm text-ink-soft">
              <ShieldCheck className="h-4 w-4 text-teal" aria-hidden /> Private by default
            </span>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mt-10">
        <FrameEditor frame={frame} allFrames={catalog} />
      </Reveal>

      {related.length > 0 && (
        <section className="mt-20">
          <h2 className="font-display text-3xl font-semibold text-ink">
            More {categoryLabel.toLowerCase()} frames
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((f, i) => (
              <Reveal key={f.slug} delay={i * 0.08}>
                <FrameCard frame={f} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* prewarmed preview referenced by og:image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt="" aria-hidden className="hidden" />
    </div>
  );
}
