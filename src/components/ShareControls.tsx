"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Copy,
  Globe2,
  Link2,
  Loader2,
  Lock,
  Share2,
} from "lucide-react";
import { trackClient } from "@/lib/analytics-client";

interface Props {
  creationId: string;
  frameTitle: string;
  caption: string | null;
  initialVisibility: "private" | "public";
  initialShareSlug: string | null;
  initialShowCaption: boolean;
  /** Tier limit copy, shown before the user hits the wall. */
  remainingShares: number | null;
}

interface ShareState {
  visibility: "private" | "public";
  shareSlug: string | null;
  showCaption: boolean;
}

/**
 * Private by default, published on request. Publishing mints a 128-bit slug;
 * revoking clears it, so the old URL 404s immediately.
 */
export function ShareControls({
  creationId,
  frameTitle,
  caption,
  initialVisibility,
  initialShareSlug,
  initialShowCaption,
  remainingShares,
}: Props) {
  const router = useRouter();
  const [state, setState] = useState<ShareState>({
    visibility: initialVisibility,
    shareSlug: initialShareSlug,
    showCaption: initialShowCaption,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const shareUrl =
    state.shareSlug && typeof window !== "undefined"
      ? `${window.location.origin}/s/${state.shareSlug}`
      : state.shareSlug
        ? `/s/${state.shareSlug}`
        : null;

  const update = async (next: { visibility?: "private" | "public"; shareShowCaption?: boolean }) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/creations/${creationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update sharing. Please try again.");
        return;
      }
      setState({
        visibility: data.creation.visibility,
        shareSlug: data.creation.shareSlug,
        showCaption: data.creation.shareShowCaption,
      });
      trackClient(
        data.creation.visibility === "public" ? "creation_shared" : "creation_unshared",
        { frame: frameTitle }
      );
      router.refresh();
    } catch {
      setError("Network trouble — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    const absolute =
      shareUrl.startsWith("http") || typeof window === "undefined"
        ? shareUrl
        : `${window.location.origin}${shareUrl}`;
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      trackClient("creation_shared", { frame: frameTitle, channel: "copy" });
    } catch {
      setError("Couldn't copy automatically — select the link and copy it manually.");
    }
  };

  const webShare = async () => {
    if (!shareUrl || typeof window === "undefined") return;
    const url = shareUrl.startsWith("http")
      ? shareUrl
      : `${window.location.origin}${shareUrl}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${frameTitle} · ZenFrame`, url });
        trackClient("creation_shared", { frame: frameTitle, channel: "webshare" });
        return;
      }
      await copyLink();
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const isPublic = state.visibility === "public";

  return (
    <section
      className="glass rounded-[2rem] p-6 sm:p-8"
      aria-labelledby="sharing-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="sharing-heading"
            className="flex items-center gap-2 font-display text-xl font-semibold text-ink"
          >
            {isPublic ? (
              <Globe2 className="h-5 w-5 text-jade-deep" aria-hidden />
            ) : (
              <Lock className="h-5 w-5 text-ink-soft" aria-hidden />
            )}
            Sharing
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {isPublic
              ? "Anyone with the link can view this frame. Your account stays anonymous."
              : "Private — only you can see this creation."}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            isPublic
              ? "bg-jade/15 text-jade-deep"
              : "bg-white/70 text-ink-soft"
          }`}
        >
          {isPublic ? "Public" : "Private"}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <label className="flex items-center justify-between gap-4 rounded-2xl bg-white/50 px-4 py-3">
          <span className="text-sm font-semibold text-ink">
            Public share link
            {remainingShares !== null && !isPublic && (
              <span className="ml-2 text-xs font-normal text-ink-soft">
                {remainingShares} slot{remainingShares === 1 ? "" : "s"} left on your plan
              </span>
            )}
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Publish this creation with a public link"
            className="h-5 w-9 shrink-0 cursor-pointer accent-jade"
            checked={isPublic}
            disabled={busy}
            onChange={(e) =>
              update({ visibility: e.target.checked ? "public" : "private" })
            }
          />
        </label>

        {isPublic && (
          <label className="flex items-start gap-3 rounded-2xl bg-white/50 px-4 py-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-coral"
              checked={state.showCaption}
              disabled={busy}
              onChange={(e) => update({ shareShowCaption: e.target.checked })}
            />
            <span className="text-sm text-ink">
              Show my intention caption on the public page
              {caption ? (
                <span className="block text-xs text-ink-soft">“{caption}”</span>
              ) : (
                <span className="block text-xs text-ink-soft">
                  No caption written for this creation yet.
                </span>
              )}
            </span>
          </label>
        )}

        {isPublic && shareUrl && (
          <div className="rounded-2xl bg-white/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Share link
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="flex-1 truncate rounded-xl bg-white/80 px-3 py-2 text-xs text-teal-deep">
                {shareUrl}
              </code>
              <button
                onClick={copyLink}
                className="btn-ghost flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-ink"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-jade-deep" aria-hidden /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
                  </>
                )}
              </button>
              <button
                onClick={webShare}
                className="btn-primary flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden /> Share
              </button>
              <a
                href={shareUrl}
                className="flex items-center gap-2 rounded-xl bg-white/70 px-3.5 py-2 text-xs font-semibold text-teal-deep transition hover:bg-white"
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden /> Open page
              </a>
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Revoking the link makes this page inaccessible immediately.
            </p>
          </div>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-ink-soft" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Updating sharing…
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-2xl bg-coral/10 px-4 py-3 text-sm text-coral"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </div>
    </section>
  );
}
