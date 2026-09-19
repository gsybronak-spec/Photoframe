"use client";

import { useEffect } from "react";
import { trackClient, type ClientEvent } from "@/lib/analytics-client";

/**
 * Fires a product-analytics event on mount. Kept as a client component on
 * purpose: pages that track views stay statically rendered (or ISR) instead of
 * being forced dynamic for a fire-and-forget counter.
 */
export function ViewTracker({
  event,
  props = {},
}: {
  event: ClientEvent;
  props?: Record<string, string | number | boolean>;
}) {
  useEffect(() => {
    trackClient(event, props);
    // Intentionally keyed on the serialized props so a route change re-fires.
  }, [event, JSON.stringify(props)]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
