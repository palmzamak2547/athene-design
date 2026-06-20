// lib/ratelimit.ts
//
// A basic per-IP sliding-window guard for the SHARED (host) key, so a public
// deploy can't have one visitor burn the free NVIDIA quota for everyone. It's
// in-memory (per serverless instance) — a soft guard, not a hard quota; a
// visitor's own BYO key bypasses it entirely. For a hard limit, back it with
// Upstash/KV. The host key is free, so the worst case is rate-limit pressure,
// not cost — this just keeps it usable.
export const SHARED_LIMIT = 20; // generations / hour on the shared key
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

export function rateLimit(ip: string): { ok: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= SHARED_LIMIT) {
    hits.set(ip, recent);
    return { ok: false, remaining: 0, resetMs: WINDOW_MS - (now - recent[0]) };
  }
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the map can't grow unbounded on a long-lived instance.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return { ok: true, remaining: SHARED_LIMIT - recent.length, resetMs: WINDOW_MS };
}
