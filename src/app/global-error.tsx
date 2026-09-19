"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: only reached when the root layout itself fails, so it
 * renders its own minimal <html>/<body> and cannot rely on app CSS.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[zenframe] global error:", error.message, error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "linear-gradient(120deg,#FBF7F1 0%,#FFF0DC 55%,#FDE7F1 100%)",
          color: "#243033",
          fontFamily:
            "'Helvetica Neue', Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: 520, textAlign: "center" }}>
          <p
            style={{
              letterSpacing: "0.14em",
              fontSize: 13,
              fontWeight: 700,
              color: "#0F766E",
            }}
          >
            ZENFRAME
          </p>
          <h1
            style={{
              margin: "12px 0 8px",
              fontSize: 30,
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            We couldn&apos;t start the studio
          </h1>
          <p style={{ color: "#5C6B6E", lineHeight: 1.6, fontSize: 15 }}>
            A critical error stopped the app from loading. Reloading usually fixes it.
            {error.digest ? ` Reference: ${error.digest}.` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "14px 28px",
              borderRadius: 999,
              border: "none",
              background: "#0F766E",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload ZenFrame
          </button>
        </main>
      </body>
    </html>
  );
}
