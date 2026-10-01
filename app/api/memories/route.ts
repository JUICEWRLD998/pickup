import { namespaceFor, validCode } from "../../../src/server/config";
import { memwalClient, recallFor } from "../../../src/server/memory";
import { clientIp, hit } from "../../../src/server/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** What Pickup remembers for this memory code, newest first. Feeds the ledger beside the chat. */
export async function POST(req: Request): Promise<Response> {
  let b: { code?: unknown };
  try {
    b = (await req.json()) as { code?: unknown };
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!validCode(b.code)) return Response.json({ error: "bad_code" }, { status: 400 });
  const rl = hit(`mem:${b.code}:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return Response.json({ error: "rate_limited", retryAfterS: rl.retryAfterS }, { status: 429 });

  const r = await recallFor(memwalClient(), namespaceFor(b.code), "what the user is building: their stack, errors, decisions and goals", 20);
  return Response.json({ items: r.items, error: r.error, ms: r.ms });
}
