export interface Mem {
  text: string;
  createdAt: string | null;
}

export type ChatEvent =
  | { t: "memories"; items: Mem[]; error: string | null; ms: number }
  | { t: "token"; d: string }
  | { t: "done" }
  | { t: "error"; message: string };

/** Reads the NDJSON stream from /api/chat and calls back per event. Throws on a non-200. */
export async function chat(
  body: { code: string; message: string; history: { role: "user" | "assistant"; content: string }[]; fresh: string[] },
  onEvent: (e: ChatEvent) => void,
): Promise<void> {
  const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; retryAfterS?: number };
    throw new Error(j.error === "rate_limited" ? `Slow down a little: try again in ${j.retryAfterS ?? 30} s.` : `The server said ${j.error ?? res.status}.`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const l = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (l) onEvent(JSON.parse(l) as ChatEvent);
    }
  }
}

export interface SaveResult {
  saved: number;
  skipped?: string;
  truncated?: boolean;
  ms?: number;
}

export async function save(code: string, kind: "turn" | "fact", text: string): Promise<SaveResult> {
  const res = await fetch("/api/save", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, kind, text }) });
  const j = (await res.json().catch(() => ({}))) as SaveResult & { error?: string; message?: string };
  if (!res.ok) throw new Error(j.error === "rate_limited" ? "Saving is rate limited, try again in a minute." : (j.message ?? j.error ?? `save failed (${res.status})`));
  return j;
}
