// Phase 0 smoke: relayer health, one remember+recall round trip in a throwaway namespace, one Gemini call.
// Usage: npm run smoke   (reads .env.local). Writes evidence/p0.json. Never prints secret values.
import { writeFileSync, mkdirSync } from "node:fs";
import { MemWal } from "@mysten-incubation/memwal";
import "./env.mjs";

const { MEMWAL_KEY, MEMWAL_ACCOUNT_ID, OPENROUTER_API_KEY } = process.env;
const serverUrl = process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz";
for (const [n, v] of Object.entries({ MEMWAL_KEY, MEMWAL_ACCOUNT_ID, OPENROUTER_API_KEY })) {
  if (!v) { console.error(`${n} missing in .env.local`); process.exit(2); }
}

const out = { at: new Date().toISOString(), serverUrl, sdk: "0.1.8", steps: [] };
const step = async (name, fn) => {
  const t0 = performance.now();
  try {
    const value = await fn();
    out.steps.push({ name, ok: true, ms: Math.round(performance.now() - t0), value });
    console.log("OK  ", name, `${Math.round(performance.now() - t0)} ms`);
    return value;
  } catch (e) {
    out.steps.push({ name, ok: false, ms: Math.round(performance.now() - t0), error: String(e?.message ?? e).slice(0, 300) });
    console.log("FAIL", name, String(e?.message ?? e).slice(0, 200));
    return null;
  }
};

const ns = `pickup-smoke-${Date.now()}`;
const marker = `pickup smoke marker ${Math.random().toString(36).slice(2, 10)}`;
const memwal = MemWal.create({ key: MEMWAL_KEY, accountId: MEMWAL_ACCOUNT_ID, serverUrl, namespace: ns });

await step("relayer.health", () => memwal.health());
const written = await step("memory.rememberAndWait", async () => {
  const r = await memwal.rememberAndWait(marker, ns);
  return { status: r?.status ?? null, blob_id: r?.blob_id ? String(r.blob_id).slice(0, 12) + "…" : null };
});

let hit = null;
const t0 = performance.now();
while (written && !hit && performance.now() - t0 < 60000) {
  const r = await memwal.recall({ query: "pickup smoke marker", limit: 5, namespace: ns }).catch(() => null);
  hit = r?.results?.find((x) => x.text?.includes(marker)) ?? null;
  if (!hit) await new Promise((r2) => setTimeout(r2, 4000));
}
out.steps.push({ name: "memory.recall", ok: !!hit, ms: Math.round(performance.now() - t0) });
console.log(hit ? "OK  " : "FAIL", "memory.recall", `${Math.round(performance.now() - t0)} ms`);

await step("gemini.2.5-flash", async () => {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", max_tokens: 40, messages: [{ role: "user", content: "Reply with the single word: ready" }] }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { model: j.model, reply: j.choices?.[0]?.message?.content?.trim(), cost: j.usage?.cost ?? null };
});

mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/p0.json", JSON.stringify(out, null, 1));
const allOk = out.steps.every((s) => s.ok);
console.log(allOk ? "SMOKE OK" : "SMOKE FAILED");
process.exit(allOk ? 0 : 1);
