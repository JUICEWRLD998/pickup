import { MemWal } from "@mysten-incubation/memwal";
import { serverEnv } from "./config";

export const RECALL_TIMEOUT_MS = 8_000;
export const WRITE_TIMEOUT_MS = 100_000;
export const MAX_SAVE_CHARS = 12_000; // the relayer silently drops turns over 16 KB (issue #1037)
export const MIN_SAVE_WORDS = 8;

export interface Memory {
  text: string;
  createdAt: string | null;
}

/** Slice of the MemWal client used here. The real class satisfies it structurally. */
export interface MemwalLike {
  recall(p: { query: string; limit?: number; namespace?: string; sort?: "relevance" | "recent" }): Promise<{ results: { text: string; created_at?: string }[] }>;
  analyzeAndWait(text: string, namespace?: string, opts?: { timeoutMs?: number }): Promise<{ succeeded?: number; failed?: number; total?: number }>;
  rememberAndWait(text: string, namespace?: string): Promise<{ status?: string }>;
}

/** A question that states nothing about the user is not worth a write. "I am on 0.1.8, why does it 429?" still is. */
const STATES_A_FACT = /\b(i am|i'm|i use|i have|i run|i moved|my|we are|we're|we use|we have|our)\b/i;

export type SaveDecision = { save: true; text: string; truncated: boolean } | { save: false; reason: "too_short" | "empty" | "question" };

/** Short chit-chat is not worth a 30 s write, and the relayer has no write dedupe (issue #273). */
export function decideSave(text: string): SaveDecision {
  const t = text.trim();
  if (!t) return { save: false, reason: "empty" };
  if (t.split(/\s+/).length < MIN_SAVE_WORDS) return { save: false, reason: "too_short" };
  if (/\?\s*$/.test(t) && !STATES_A_FACT.test(t)) return { save: false, reason: "question" };
  if (t.length > MAX_SAVE_CHARS) return { save: true, text: t.slice(0, MAX_SAVE_CHARS), truncated: true };
  return { save: true, text: t, truncated: false };
}

/** Human age: "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ageLabel(createdAt: string | null, now = Date.now()): string {
  if (!createdAt) return "earlier";
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return "earlier";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Newest first, exact duplicates removed (the relayer stores repeats, issue #273). */
export function tidy(rows: { text: string; created_at?: string }[]): Memory[] {
  const seen = new Set<string>();
  const out: Memory[] = [];
  for (const r of rows) {
    const key = r.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ text: r.text.trim(), createdAt: r.created_at ?? null });
  }
  const ts = (m: Memory) => {
    const t = Date.parse(m.createdAt ?? "");
    return Number.isFinite(t) ? t : 0;
  };
  return out.sort((a, b) => ts(b) - ts(a));
}

export async function recallFor(memwal: MemwalLike, namespace: string, query: string, limit = 5): Promise<{ items: Memory[]; error: string | null; ms: number }> {
  const t0 = performance.now();
  try {
    const r = await Promise.race([
      memwal.recall({ query, limit, namespace, sort: "recent" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("recall timed out")), RECALL_TIMEOUT_MS)),
    ]);
    return { items: tidy(r.results), error: null, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "recall failed", ms: Math.round(performance.now() - t0) };
  }
}

// One write at a time per namespace: the relayer allows about 30 weighted requests a minute.
const queues = new Map<string, Promise<unknown>>();
export function enqueue<T>(namespace: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(namespace) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(job);
  queues.set(namespace, next);
  const clear = () => {
    if (queues.get(namespace) === next) queues.delete(namespace);
  };
  next.then(clear, clear);
  return next;
}

let shared: MemwalLike | null = null;
export function memwalClient(): MemwalLike {
  if (shared) return shared;
  const env = serverEnv();
  shared = MemWal.create({ key: env.memwalKey, accountId: env.memwalAccountId, serverUrl: env.memwalServerUrl }) as unknown as MemwalLike;
  return shared;
}
