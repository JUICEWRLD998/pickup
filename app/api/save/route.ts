import { namespaceFor, validCode } from "../../../src/server/config";
import { decideSave, enqueue, memwalClient, WRITE_TIMEOUT_MS } from "../../../src/server/memory";
import { clientIp, hit } from "../../../src/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  code?: unknown;
  kind?: unknown;
  text?: unknown;
}

/**
 * Writes to Walrus Memory. Mainnet writes take 20 to 30 s, so the browser calls this after the reply is shown.
 * kind "turn": the stock fact extractor (analyze) decides what is worth keeping from the user's message.
 * kind "fact": the user typed it into "Remember this"; stored as written.
 */
export async function POST(req: Request): Promise<Response> {
  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!validCode(b.code)) return Response.json({ error: "bad_code" }, { status: 400 });
  if (b.kind !== "turn" && b.kind !== "fact") return Response.json({ error: "bad_kind" }, { status: 400 });
  if (typeof b.text !== "string") return Response.json({ error: "bad_text" }, { status: 400 });

  const rl = hit(`save:${b.code}:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) return Response.json({ error: "rate_limited", retryAfterS: rl.retryAfterS }, { status: 429 });

  const ns = namespaceFor(b.code);
  const kind = b.kind;
  const decision = kind === "fact" ? (b.text.trim() ? ({ save: true, text: b.text.trim().slice(0, 500), truncated: b.text.trim().length > 500 } as const) : ({ save: false, reason: "empty" } as const)) : decideSave(b.text);
  if (!decision.save) return Response.json({ saved: 0, skipped: decision.reason });

  const t0 = performance.now();
  try {
    const memwal = memwalClient();
    const res = await enqueue(ns, async () => {
      if (kind === "fact") {
        const r = await memwal.rememberAndWait(decision.text, ns);
        return { saved: r?.status === "failed" ? 0 : 1 };
      }
      const r = await memwal.analyzeAndWait(decision.text, ns, { timeoutMs: WRITE_TIMEOUT_MS });
      return { saved: r?.succeeded ?? 0, failed: r?.failed ?? 0 };
    });
    return Response.json({ ...res, truncated: decision.truncated, ms: Math.round(performance.now() - t0) });
  } catch (e) {
    return Response.json({ error: "write_failed", message: e instanceof Error ? e.message.slice(0, 200) : "write failed" }, { status: 502 });
  }
}
