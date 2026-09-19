/**
 * Rate limiting with pluggable drivers.
 *
 * - `memory` (default): sliding window per process. Perfect for local dev and a
 *   single-instance deploy.
 * - `redis`: fixed-window counters in a Redis-compatible store (Upstash REST,
 *   which also works for self-hosted Redis behind a REST proxy). Required for
 *   multi-instance/serverless deployments, where per-process memory would let an
 *   attacker spread attempts across instances.
 *
 * Fail-safe policy: limits are NEVER silently disabled. If the production driver
 * is misconfigured or the network call fails, we log loudly and fall back to the
 * in-process limiter rather than allowing unlimited requests.
 */

export interface RateLimitResult {
  ok: boolean;
  retryAfter: number;
  driver: "memory" | "redis";
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/* ------------------------------------------------------------------ */
/* Memory driver                                                       */
/* ------------------------------------------------------------------ */

declare global {
  var __zenframeBuckets: Map<string, number[]> | undefined;
  var __zenframeRedisWarned: boolean | undefined;
}

function memoryStore(): Map<string, number[]> {
  if (!globalThis.__zenframeBuckets) globalThis.__zenframeBuckets = new Map();
  return globalThis.__zenframeBuckets;
}

function memoryLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const store = memoryStore();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    return {
      ok: false,
      retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000),
      driver: "memory",
    };
  }
  hits.push(now);
  store.set(key, hits);
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (v.every((t) => now - t >= windowMs)) store.delete(k);
    }
  }
  return { ok: true, retryAfter: 0, driver: "memory" };
}

/* ------------------------------------------------------------------ */
/* Redis driver (Upstash-compatible REST)                              */
/* ------------------------------------------------------------------ */

export function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

export function activeRateLimitDriver(): "memory" | "redis" {
  const explicit = (process.env.RATE_LIMIT_DRIVER ?? "").trim().toLowerCase();
  if (explicit === "redis") {
    if (redisConfigured()) return "redis";
    if (!globalThis.__zenframeRedisWarned) {
      globalThis.__zenframeRedisWarned = true;
      console.error(
        "[ratelimit] RATE_LIMIT_DRIVER=redis but UPSTASH_REDIS_REST_URL/TOKEN " +
          "are missing. Falling back to the in-memory limiter — do NOT run " +
          "multiple instances like this, limits are per-process."
      );
    }
    return "memory";
  }
  return "memory";
}

interface RedisReply {
  result?: unknown;
  error?: string;
}

/**
 * Fixed-window counter: INCR the key, set the TTL on first hit, read the TTL.
 * Two round-trips in a single pipeline request.
 */
async function redisLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(windowSeconds), "NX"],
        ["TTL", key],
      ]),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = (await res.json()) as RedisReply[];
    const count = Number(payload[0]?.result ?? 0);
    const ttl = Number(payload[2]?.result ?? windowSeconds);
    if (!Number.isFinite(count) || count <= 0) throw new Error("bad counter");

    if (count > limit) {
      return {
        ok: false,
        retryAfter: Number.isFinite(ttl) && ttl > 0 ? ttl : windowSeconds,
        driver: "redis",
      };
    }
    return { ok: true, retryAfter: 0, driver: "redis" };
  } catch (err) {
    if (!globalThis.__zenframeRedisWarned) {
      globalThis.__zenframeRedisWarned = true;
      console.error(
        `[ratelimit] Redis driver unavailable (${
          err instanceof Error ? err.message : "unknown"
        }). Falling back to the in-memory limiter for this process.`
      );
    }
    return null; // caller falls back to memory — never fail open to "no limit"
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function rateLimit(
  req: Request,
  route: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const key = `zf:rl:${route}:${clientIp(req)}`;
  if (activeRateLimitDriver() === "redis") {
    const viaRedis = await redisLimit(key, limit, windowMs);
    if (viaRedis) return viaRedis;
  }
  return memoryLimit(key, limit, windowMs);
}
