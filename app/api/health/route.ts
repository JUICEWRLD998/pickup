import { memwalClient } from "../../../src/server/memory";

export const runtime = "nodejs";

/** Reports whether the relayer answers. Never returns a key or an account id. */
export async function GET(): Promise<Response> {
  const t0 = performance.now();
  try {
    const client = memwalClient() as unknown as { health(): Promise<unknown> };
    await client.health();
    return Response.json({ ok: true, relayer: "up", ms: Math.round(performance.now() - t0) });
  } catch {
    return Response.json({ ok: false, relayer: "down" }, { status: 503 });
  }
}
