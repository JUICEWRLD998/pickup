import { namespaceFor, serverEnv, validCode, ConfigError } from "../../../src/server/config";
import { streamReply, type ChatMsg } from "../../../src/server/llm";
import { memwalClient, recallFor, tidy, type Memory } from "../../../src/server/memory";
import { systemPrompt } from "../../../src/server/prompt";
import { clientIp, hit } from "../../../src/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MSG = 4_000;

interface Body {
  code?: unknown;
  message?: unknown;
  history?: unknown;
  fresh?: unknown;
}

const asText = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v : null);

function parseHistory(v: unknown): ChatMsg[] {
  if (!Array.isArray(v)) return [];
  const out: ChatMsg[] = [];
  for (const m of v.slice(-12)) {
    const r = (m as { role?: unknown })?.role;
    const c = asText((m as { content?: unknown })?.content, MAX_MSG);
    if ((r === "user" || r === "assistant") && c) out.push({ role: r, content: c });
  }
  return out;
}

/** Facts the browser just saved: they may not be recallable yet (index lag after a write). */
function parseFresh(v: unknown): Memory[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 5)
    .map((t) => asText(t, 500))
    .filter((t): t is string => t !== null)
    .map((text) => ({ text, createdAt: new Date().toISOString() }));
}

const line = (o: unknown) => new TextEncoder().encode(JSON.stringify(o) + "\n");

/** Response is newline-delimited JSON: one `memories` event, then `token` events, then `done` (or `error`). */
export async function POST(req: Request): Promise<Response> {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!validCode(b.code)) return Response.json({ error: "bad_code" }, { status: 400 });
  const message = asText(b.message, MAX_MSG);
  if (!message) return Response.json({ error: "bad_message" }, { status: 400 });

  const rl = hit(`chat:${b.code}:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return Response.json({ error: "rate_limited", retryAfterS: rl.retryAfterS }, { status: 429 });

  let env;
  try {
    env = serverEnv();
  } catch (e) {
    return Response.json({ error: e instanceof ConfigError ? e.message : "config" }, { status: 500 });
  }

  const code = b.code;
  const history = parseHistory(b.history);
  const fresh = parseFresh(b.fresh);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(line(o));
      try {
        const rec = await recallFor(memwalClient(), namespaceFor(code), message);
        // Just-saved facts first, then recalled ones, duplicates removed.
        const items = tidy([...fresh.map((m) => ({ text: m.text, created_at: m.createdAt ?? undefined })), ...rec.items.map((m) => ({ text: m.text, created_at: m.createdAt ?? undefined }))]);
        send({ t: "memories", items, error: rec.error, ms: rec.ms });
        for await (const d of streamReply(env.openrouterKey, systemPrompt(items), [...history, { role: "user", content: message }])) send({ t: "token", d });
        send({ t: "done" });
      } catch (e) {
        send({ t: "error", message: e instanceof Error ? e.message : "reply failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
