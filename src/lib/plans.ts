/**
 * Plan configuration — the single source of truth for pricing copy AND limits.
 *
 * Billing is intentionally NOT connected: there is no payment provider, no
 * checkout, and no way to "buy" a plan from the UI. This module exists so that
 * the pricing page, the entitlement checks and a future checkout all read the
 * same numbers. Changing a limit here changes what the server enforces.
 */

export type PlanId = "free" | "pro" | "studio";

export interface PlanLimits {
  /** -1 means unlimited. */
  creations: number;
  publicShares: number;
  /** Days of analytics/activity retention we promise at this tier. */
  activityRetentionDays: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  blurb: string;
  cta: string;
  href: string;
  popular?: boolean;
  limits: PlanLimits;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Everything a practitioner needs to share the practice.",
    cta: "Start free",
    href: "/signup",
    limits: { creations: 25, publicShares: 3, activityRetentionDays: 30 },
    features: [
      "All 16 hand-crafted frames",
      "Upload, personalize & download",
      "Intention captions",
      "Local editing — photos stay private",
      "Up to 25 saved creations",
      "Up to 3 public share links",
    ],
  },
  pro: {
    id: "pro",
    name: "Zen Pro",
    price: "$9",
    period: "per month",
    blurb: "For teachers and studios building a community.",
    cta: "Go Pro",
    href: "/pricing#plans",
    popular: true,
    limits: { creations: 500, publicShares: 100, activityRetentionDays: 365 },
    features: [
      "Everything in Free",
      "Premium & seasonal frame drops monthly",
      "Custom studio logo on frames",
      "Batch-create for classes & events",
      "Up to 500 saved creations",
      "Up to 100 public share links",
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    price: "$29",
    period: "per month",
    blurb: "For wellness brands running campaigns at scale.",
    cta: "Contact us",
    href: "/contact",
    limits: { creations: -1, publicShares: -1, activityRetentionDays: 730 },
    features: [
      "Everything in Zen Pro",
      "Campaign builder with scheduling",
      "5 team seats with shared library",
      "Analytics on shares & downloads",
      "Unlimited creations & share links",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "pro", "studio"];

export function planById(id: string | null | undefined): Plan {
  return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

export const isUnlimited = (n: number): boolean => n < 0;

/** Human-readable usage line, e.g. "12 of 25" or "12 · unlimited". */
export function usageLabel(used: number, limit: number): string {
  return isUnlimited(limit) ? `${used} · unlimited` : `${used} of ${limit}`;
}
