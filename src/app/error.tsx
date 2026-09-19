"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Flower2 } from "lucide-react";

/**
 * Route-level error boundary. The technical cause is logged for operators; the
 * user only ever sees a calm explanation and a retry path.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged client-side only — never rendered, so no internals leak to the UI.
    console.error("[zenframe] route error:", error.message, error.digest);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <div className="glass rounded-[2.5rem] p-12">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-coral/15 text-coral">
          <AlertCircle className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-3xl font-semibold text-ink">
          Something slipped out of alignment
        </h1>
        <p className="mt-3 leading-relaxed text-ink-soft">
          This page couldn&apos;t finish loading. Your work is safe — nothing was lost.
          Try again, and if it keeps happening let us know.
        </p>
        {error.digest && (
          <p className="mt-4 text-xs text-ink-soft">
            Reference: <code>{error.digest}</code>
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={reset}
            className="btn-primary inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Try again
          </button>
          <Link
            href="/frames"
            className="btn-ghost inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-ink"
          >
            <Flower2 className="h-4 w-4" aria-hidden /> Back to the gallery
          </Link>
        </div>
      </div>
    </div>
  );
}
