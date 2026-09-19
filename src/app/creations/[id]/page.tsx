import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Download, Globe2, Lock } from "lucide-react";
import { getCurrentUser } from "@/server/sessions";
import { getDb } from "@/server/db";
import { findAnyFrame } from "@/server/frame-catalog";
import { getEntitlements } from "@/server/entitlements";
import { DeleteCreationButton } from "@/components/DeleteCreationButton";
import { ShareControls } from "@/components/ShareControls";
import { formatBytes } from "@/lib/image-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creation detail",
  robots: { index: false, follow: false },
};

interface Row {
  id: string;
  user_id: string;
  frame_id: string;
  caption: string | null;
  bytes: number;
  mime_type: string;
  thumb_path: string | null;
  visibility: string;
  share_slug: string | null;
  share_show_caption: number | null;
  created_at: string;
  updated_at: string;
}

export default async function CreationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const { id } = await params;
  const row = getDb()
    .prepare(
      `SELECT id, user_id, frame_id, caption, bytes, mime_type, thumb_path,
              visibility, share_slug, share_show_caption, created_at, updated_at
       FROM creations WHERE id = ?`
    )
    .get(id) as Row | undefined;

  if (!row) notFound();
  // Server-side authorization: owners (and admins) only — 404 keeps this hidden
  // from anyone probing ids.
  if (row.user_id !== user.id && user.role !== "admin") notFound();

  const frame = findAnyFrame(row.frame_id);
  const entitlements = getEntitlements(user.id);
  const isPublic = row.visibility === "public";
  const isOwner = row.user_id === user.id;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft transition hover:text-coral"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to studio
      </Link>

      <div className="glass mt-6 overflow-hidden rounded-[2rem]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/creations/${row.id}/image`}
          alt={`Your ${frame?.title ?? "yoga"} creation`}
          className="w-full bg-sand"
        />
      </div>

      <div className="glass mt-6 rounded-[2rem] p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-ink">
              {frame?.title ?? row.frame_id}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-teal">
              {frame?.occasion}
              <span className="flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                {isPublic ? (
                  <>
                    <Globe2 className="h-3 w-3 text-jade-deep" aria-hidden /> Public
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" aria-hidden /> Private
                  </>
                )}
              </span>
            </p>
          </div>
          {isOwner && (
            <DeleteCreationButton
              creationId={row.id}
              label={frame?.title ?? "this creation"}
              variant="button"
            />
          )}
        </div>

        {row.caption && (
          <p className="mt-4 font-display text-xl italic text-ink">“{row.caption}”</p>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-soft">Saved</dt>
            <dd className="font-semibold text-ink">
              {new Date(row.created_at).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-ink-soft">File size</dt>
            <dd className="font-semibold text-ink">{formatBytes(row.bytes)}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Format</dt>
            <dd className="font-semibold text-ink">
              {row.mime_type.replace("image/", "").toUpperCase()} · 1000×1250
            </dd>
          </div>
        </dl>

        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href={`/api/creations/${row.id}/image?download=1`}
            download
            className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          >
            <Download className="h-4 w-4" aria-hidden /> Download original
          </a>
          <Link
            href={`/frames/${row.frame_id}`}
            className="btn-ghost inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-ink"
          >
            Recreate with this frame
          </Link>
        </div>
      </div>

      {isOwner && (
        <div className="mt-6">
          <ShareControls
            creationId={row.id}
            frameTitle={frame?.title ?? row.frame_id}
            caption={row.caption}
            initialVisibility={isPublic ? "public" : "private"}
            initialShareSlug={row.share_slug}
            initialShowCaption={row.share_show_caption !== 0}
            remainingShares={
              entitlements.remaining.publicShares < 0
                ? null
                : entitlements.remaining.publicShares + (isPublic ? 1 : 0)
            }
          />
        </div>
      )}
    </div>
  );
}
