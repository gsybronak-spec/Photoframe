/**
 * Client-side analytics helper.
 *
 * Uses `sendBeacon` where available so events survive page unloads, falling back
 * to a keepalive fetch. Events are fire-and-forget and never block the UI; the
 * server decides what is actually recorded (allowlist + prop sanitizing).
 */

const ALLOWED = new Set([
  "frame_view",
  "frame_search",
  "editor_open",
  "image_upload",
  "creation_shared",
  "creation_unshared",
  "creation_deleted",
  "upgrade_interest",
  "public_view",
]);

export type ClientEvent =
  | "frame_view"
  | "frame_search"
  | "editor_open"
  | "image_upload"
  | "creation_shared"
  | "creation_unshared"
  | "creation_deleted"
  | "upgrade_interest"
  | "public_view";

export function trackClient(
  event: ClientEvent,
  props: Record<string, string | number | boolean> = {}
): void {
  if (typeof window === "undefined" || !ALLOWED.has(event)) return;
  const payload = JSON.stringify({ event, props });
  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/analytics", blob)) return;
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
  } catch {
    /* analytics is best-effort */
  }
}
