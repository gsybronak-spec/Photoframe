import type { Metadata } from "next";
import { Suspense } from "react";
import { OCCASIONS } from "@/lib/frames";
import { getPublicFrames } from "@/server/frame-catalog";
import { GalleryGrid } from "@/components/GalleryGrid";
import { Reveal } from "@/components/Reveal";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";

/** Catalogue changes (featured/active) surface within five minutes. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Yoga photo frame gallery",
  description:
    "Browse 16 hand-crafted yoga photo frames — sunrise flows, meditation, chakra alignment and moonlit savasana. Upload your photo, personalize it and download instantly.",
  keywords: [
    "yoga photo frames",
    "meditation frames",
    "yoga day frame",
    "wellness photo editor",
    "chakra frame",
  ],
  alternates: { canonical: "/frames" },
  openGraph: {
    title: "Yoga photo frame gallery | ZenFrame",
    description:
      "Browse hand-crafted yoga photo frames and create a share-ready image in under a minute.",
    url: `${SITE_URL}/frames`,
    type: "website",
    siteName: "ZenFrame",
  },
  twitter: {
    card: "summary_large_image",
    title: "Yoga photo frame gallery | ZenFrame",
    description: "16 hand-crafted yoga frames — pick one and make it yours.",
  },
};

export default function FramesPage() {
  const frames = getPublicFrames();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "ZenFrame yoga photo frame gallery",
    url: `${SITE_URL}/frames`,
    description: "A curated collection of hand-crafted yoga photo frames.",
    hasPart: frames.slice(0, 20).map((f) => ({
      "@type": "CreativeWork",
      name: f.title,
      url: `${SITE_URL}/frames/${f.slug}`,
    })),
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Reveal className="text-center">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-deep">
          ✦ {frames.length} hand-crafted frames
        </span>
        <h1 className="mt-5 font-display text-5xl font-semibold text-ink">
          The Frame <span className="text-gradient">Gallery</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft">
          Discover yoga frames crafted for every occasion — from sunrise flows to moonlit
          savasana.
        </p>
      </Reveal>

      <Suspense
        fallback={
          <div className="glass mt-10 rounded-3xl p-16 text-center text-ink-soft">
            Unrolling the gallery…
          </div>
        }
      >
        <GalleryGrid frames={frames} occasions={OCCASIONS} />
      </Suspense>
    </div>
  );
}
