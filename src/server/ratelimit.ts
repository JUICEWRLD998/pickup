// Best-effort, in-memory, per server instance. It slows a loop; it is not a security boundary.
const buckets = new Map<string, number[]>();

export function hit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterS: number } {
  const since = now - windowMs;
  const list = (buckets.get(key) ?? []).filter((t) => t > since);
  if (list.length >= limit) {
    buckets.set(key, list);
    return { ok: false, retryAfterS: Math.max(1, Math.ceil(((list[0] ?? now) + windowMs - now) / 1000)) };
  }
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 5000) for (const [k, v] of buckets) if ((v[v.length - 1] ?? 0) <= since) buckets.delete(k);
  return { ok: true, retryAfterS: 0 };
}

export const clientIp = (req: Request): string => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
