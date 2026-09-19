"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Globe2,
  ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { DeleteCreationButton } from "@/components/DeleteCreationButton";
import { formatBytes } from "@/lib/image-client";

export interface CreationItem {
  id: string;
  frameSlug: string;
  frameTitle: string;
  caption: string | null;
  bytes: number;
  hasThumb: boolean;
  visibility: "private" | "public";
  shareSlug: string | null;
  createdAt: string;
}

interface Props {
  initial: CreationItem[];
  nextCursor: string | null;
  pageSize?: number;
}

const dateFmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * Creations grid with keyset pagination. The first page is server-rendered (no
 * loading flash); subsequent pages load on demand so a large library never
 * arrives in one payload.
 */
export function CreationsPager({ initial, nextCursor }: Props) {
  const [items, setItems] = useState<CreationItem[]>(initial);
  const [cursor, setCursor] = useState<string | null>(nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/creations?limit=12&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not load more creations.");
        return;
      }
      const incoming = (data.creations as Omit<CreationItem, "frameTitle">[]).map(
        (c) => ({
          ...c,
          frameTitle: titleFor(c.frameSlug),
        })
      );
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...incoming.filter((c) => !seen.has(c.id))];
      });
      setCursor(data.nextCursor ?? null);
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  const removeLocally = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((c) => (
          <div key={c.id} className="glass group overflow-hidden rounded-3xl">
            <div className="relative">
              <Link href={`/creations/${c.id}`} aria-label={`Open ${c.frameTitle} creation`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/creations/${c.id}/image?variant=${c.hasThumb ? "thumb" : "full"}`}
                  alt={`${c.frameTitle} creation${c.caption ? ` — ${c.caption}` : ""}`}
                  loading="lazy"
                  decoding="async"
                  width={400}
                  height={500}
                  className="aspect-[4/5] w-full bg-sand object-cover"
                />
              </Link>
              <DeleteCreationButton
                creationId={c.id}
                label={c.frameTitle}
                onDeleted={removeLocally}
              />
              <span className="glass-strong absolute left-3 top-3 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-ink">
                {c.visibility === "public" ? (
                  <>
                    <Globe2 className="h-3 w-3 text-jade-deep" aria-hidden /> Public
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3 text-ink-soft" aria-hidden /> Private
                  </>
                )}
              </span>
            </div>
            <div className="p-4">
              <p className="font-semibold text-ink">{c.frameTitle}</p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {dateFmt(c.createdAt)}
                {c.caption ? ` · “${c.caption}”` : ""} · {formatBytes(c.bytes)}
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/frames/${c.frameSlug}`}
                  className="rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-teal-deep transition hover:bg-white"
                >
                  Recreate
                </Link>
                <Link
                  href={`/creations/${c.id}`}
                  className="rounded-full bg-white/70 px-3.5 py-1.5 text-xs font-semibold text-teal-deep transition hover:bg-white"
                >
                  Details &amp; sharing
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 flex items-center justify-center gap-2 text-sm text-coral"
        >
          <AlertCircle className="h-4 w-4" aria-hidden /> {error}
        </p>
      )}

      {cursor && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="btn-ghost flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-ink disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" aria-hidden /> Load older creations
              </>
            )}
          </button>
        </div>
      )}

      {!cursor && items.length > 0 && (
        <p className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-soft">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> That&apos;s every creation in
          your studio.
        </p>
      )}
    </div>
  );
}

/** Static empty state, exported so the server page can render it without JS. */
export function EmptyCreations() {
  return (
    <div className="glass mt-4 rounded-3xl p-12 text-center">
      <ImageIcon className="mx-auto h-9 w-9 text-teal/50" aria-hidden />
      <p className="mt-4 font-display text-xl text-ink">
        Nothing here yet — your mat is rolled out and waiting.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Create and save a frame to see it appear here, stored privately in your studio.
      </p>
      <Link
        href="/frames"
        className="btn-primary mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold"
      >
        Browse frames
      </Link>
    </div>
  );
}

// Titles come from the code catalogue (frame titles are not admin-editable).
function titleFor(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
