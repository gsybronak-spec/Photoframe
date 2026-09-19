import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Flower2, Sparkles } from "lucide-react";
import { getDb } from "@/server/db";
import { findAnyFrame } from "@/server/frame-catalog";
import { track } from "@/server/analytics";
import { PublicShareBar } from "@/components/PublicShareBar";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zenframe.in";
const NO_INDEX: Metadata["robots"] = { index: false, follow: false };

interface PublicRow {
  id: string;
  frame_id: string;
  caption: string | null;
  share_show_caption: number | null;
  published_at: string | null;
}

/**
 * Loads a published creation by share slug.
 * Nothing here can reach a private creation, and no account data (id, email,
 * name, activity) is ever selected.
 */
async function loadPublic(slug: string): Promise<PublicRow | null> {
  if (!slug || slug.length > 64 || !/^[A-Za-z0-9_-]+$/.test(slug)) return null;
  const db = await getDb();
  const row = (await db
    .prepare(
      `SELECT id, frame_id, caption, share_show_caption, published_at
       FROM creations WHERE share_slug = ? AND visibility = 'public'`
    )
    .get(slug)) as PublicRow | undefined;
  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await loadPublic(slug);
  if (!row) {
    return { title: "Shared frame not found", robots: NO_INDEX };
  }
  const frame = await findAnyFrame(row.frame_id);
  const title = frame ? `${frame.title} — shared on ZenFrame` : "Shared on ZenFrame";
  const showCaption = row.share_show_caption !== 0 && Boolean(row.caption);
  const description = showCaption
    ? `“${row.caption}” — a ZenFrame yoga creation.`
    : frame?.description ?? "A hand-crafted yoga photo frame created with ZenFrame.";
  const image = `/api/public/creations/${slug}/image`;

  return {
    title,
    description,
    alternates: { canonical: `/s/${slug}` },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${SITE_URL}/s/${slug}`,
      siteName: "ZenFrame",
      images: [{ url: image, width: 1000, height: 1250, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PublicCreationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await loadPublic(slug);
  if (!row) notFound();

  const frame = await findAnyFrame(row.frame_id);
  const showCaption = row.share_show_caption !== 0 && Boolean(row.caption);
  const title = frame?.title ?? "Yoga frame";
  const image = `/api/public/creations/${slug}/image`;
  const pageUrl = `${SITE_URL}/s/${slug}`;

  // Aggregate, non-identifying event — no user id is attached.
  track("public_view", { props: { frame: row.frame_id } });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: title,
    description: showCaption ? row.caption : (frame?.description ?? undefined),
    contentUrl: `${SITE_URL}${image}`,
    url: pageUrl,
    datePublished: row.published_at ?? undefined,
    creator: { "@type": "Organization", name: "ZenFrame" },
    creditText: "Created with ZenFrame",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <script
        type="application/ld+json"
        // Static, server-built JSON — no user input is interpolated raw.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="text-center">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-teal-deep">
          <Flower2 className="h-3.5 w-3.5 text-saffron-deep" aria-hidden />
          Shared from the ZenFrame studio
        </span>
        <h1 className="mt-5 font-display text-4xl font-semibold text-ink">{title}</h1>
        {showCaption && (
          <p className="mx-auto mt-3 max-w-xl font-display text-xl italic text-ink-soft">
            “{row.caption}”
          </p>
        )}
      </div>

      <div className="glass mt-8 overflow-hidden rounded-[2rem] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={`${title} — a yoga photo frame created with ZenFrame`}
          width={1000}
          height={1250}
          className="mx-auto w-full rounded-3xl bg-sand"
        />
      </div>

      <div className="mt-6">
        <PublicShareBar title={title} url={pageUrl} imageUrl={`${SITE_URL}${image}`} />
      </div>

      <div className="glass mt-8 rounded-[2rem] p-8 text-center">
        <h2 className="font-display text-2xl font-semibold text-ink">
          Make your own in under a minute
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-soft">
          Pick from 16 hand-crafted yoga frames, add your photo, write an intention and
          download a share-ready image. Your photo is edited in your browser.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/frames"
            className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Browse frames
          </Link>
          <Link
            href="/signup"
            className="btn-ghost inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-ink"
          >
            Create a free account
          </Link>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-ink-soft">
        The creator of this frame chose to share it publicly. No account details are shown
        on this page.
      </p>
    </div>
  );
}
