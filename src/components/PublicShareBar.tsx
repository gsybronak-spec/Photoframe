"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { trackClient } from "@/lib/analytics-client";

export function PublicShareBar({
  title,
  url,
  imageUrl,
}: {
  title: string;
  url: string;
  imageUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const webShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} · ZenFrame`, text: title, url });
        trackClient("creation_shared", { channel: "webshare" });
        return;
      }
      await copy();
    } catch {
      /* dismissed */
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackClient("creation_shared", { channel: "copy" });
    } catch {
      /* clipboard blocked — the URL is visible in the address bar anyway */
    }
  };

  return (
    <div className="glass flex flex-wrap items-center justify-center gap-3 rounded-3xl p-5">
      <button
        onClick={webShare}
        className="btn-primary flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold"
      >
        <Share2 className="h-4 w-4" aria-hidden /> Share this frame
      </button>
      <button
        onClick={copy}
        className="btn-ghost flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-ink"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-jade-deep" aria-hidden /> Link copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" aria-hidden /> Copy link
          </>
        )}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${title} — ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-white/70 px-5 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-white"
      >
        WhatsApp
      </a>
      <a
        href={`https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(
          url
        )}&media=${encodeURIComponent(imageUrl)}&description=${encodeURIComponent(title)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-white/70 px-5 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-white"
      >
        Pinterest
      </a>
    </div>
  );
}
