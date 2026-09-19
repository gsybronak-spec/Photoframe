/**
 * Entitlements: which plan a user is on and what they are allowed to do.
 *
 * No row in `subscriptions` means the free plan. There is deliberately no
 * payment-provider code here — a future checkout only has to write a row.
 */

import { getDb, nowIso } from "./db";
import { PLANS, planById, type Plan, type PlanId } from "@/lib/plans";
import { generateToken } from "./passwords";

export interface SubscriptionRow {
  user_id: string;
  plan_id: string;
  status: string;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entitlements {
  plan: Plan;
  planId: PlanId;
  status: "active" | "canceled";
  usage: { creations: number; publicShares: number };
  remaining: { creations: number; publicShares: number };
  canCreate: boolean;
  canPublish: boolean;
}

function count(sql: string, ...args: (string | number)[]): number {
  return (getDb().prepare(sql).get(...args) as { n: number }).n;
}

export function getSubscription(userId: string): SubscriptionRow | null {
  return (
    (getDb()
      .prepare("SELECT * FROM subscriptions WHERE user_id = ?")
      .get(userId) as SubscriptionRow | undefined) ?? null
  );
}

export function getEntitlements(userId: string): Entitlements {
  const sub = getSubscription(userId);
  const plan = planById(sub?.status === "canceled" ? "free" : sub?.plan_id);

  const creations = count(
    "SELECT COUNT(*) AS n FROM creations WHERE user_id = ?",
    userId
  );
  const publicShares = count(
    "SELECT COUNT(*) AS n FROM creations WHERE user_id = ? AND visibility = 'public' AND share_slug IS NOT NULL",
    userId
  );

  const { creations: creationLimit, publicShares: shareLimit } = plan.limits;
  return {
    plan,
    planId: plan.id,
    status: sub?.status === "canceled" ? "canceled" : "active",
    usage: { creations, publicShares },
    remaining: {
      creations: creationLimit < 0 ? -1 : Math.max(0, creationLimit - creations),
      publicShares: shareLimit < 0 ? -1 : Math.max(0, shareLimit - publicShares),
    },
    canCreate: creationLimit < 0 || creations < creationLimit,
    canPublish: shareLimit < 0 || publicShares < shareLimit,
  };
}

/**
 * Records a plan change. Admin/system-only today — the payment provider will
 * call this once billing exists. Never exposed as a self-service upgrade.
 */
export function setPlan(
  userId: string,
  planId: PlanId,
  input: { status?: "active" | "canceled"; periodEnd?: string | null } = {}
): SubscriptionRow {
  if (!PLANS[planId]) throw new Error(`Unknown plan: ${planId}`);
  const db = getDb();
  const now = nowIso();
  const existing = getSubscription(userId);
  if (existing) {
    db.prepare(
      `UPDATE subscriptions
       SET plan_id = ?, status = ?, current_period_end = ?, updated_at = ?
       WHERE user_id = ?`
    ).run(
      planId,
      input.status ?? "active",
      input.periodEnd ?? null,
      now,
      userId
    );
  } else {
    db.prepare(
      `INSERT INTO subscriptions
         (user_id, plan_id, status, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      planId,
      input.status ?? "active",
      input.periodEnd ?? null,
      now,
      now
    );
  }
  return getSubscription(userId)!;
}

/** Plan distribution for the admin dashboard. */
export function planBreakdown(): { plan_id: string; n: number }[] {
  const rows = getDb()
    .prepare(
      "SELECT plan_id, COUNT(*) AS n FROM subscriptions GROUP BY plan_id ORDER BY n DESC"
    )
    .all() as { plan_id: string; n: number }[];
  const totalUsers = count("SELECT COUNT(*) AS n FROM users");
  const paid = rows.reduce((sum, r) => sum + (r.plan_id === "free" ? 0 : r.n), 0);
  return [{ plan_id: "free", n: Math.max(0, totalUsers - paid) }, ...rows.filter((r) => r.plan_id !== "free")];
}

export function newId(): string {
  return generateToken(12);
}
