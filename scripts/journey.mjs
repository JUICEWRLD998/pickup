// Phase 1 exit: tell a fact in session A, then recall it from a brand-new session (no chat history) with the same code.
// Controls: a different code must NOT recall it. Also: a corrected fact wins.
// Usage: start the app (npm run build && npx next start -p 3200), then: E2E_BASE=http://localhost:3200 npm run journey
// Writes evidence/p1-journey.json. Writes real (harmless) memories to mainnet under throwaway namespaces.
import { writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const BASE = process.env.E2E_BASE || "http://localhost:3200";
const rand = () => Array.from(randomBytes(12), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const out = { at: new Date().toISOString(), base: BASE, steps: [] };
const log = (name, data) => { out.steps.push({ name, ...data }); console.log(name, JSON.stringify(data)); };

async function chat(code, message, { history = [], fresh = [] } = {}) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, message, history, fresh }) });
  if (!res.ok) return { status: res.status, ms: Math.round(performance.now() - t0), reply: "", memories: [], err: await res.text() };
  const text = await res.text();
  let reply = "", memories = [], err = null, recallError = null;
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    const e = JSON.parse(l);
    if (e.t === "memories") { memories = e.items; recallError = e.error; }
    else if (e.t === "token") reply += e.d;
    else if (e.t === "error") err = e.message;
  }
  return { status: 200, ms: Math.round(performance.now() - t0), reply: reply.trim(), memories, recallError, err };
}
async function save(code, kind, text) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/api/save`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, kind, text }) });
  return { status: res.status, ms: Math.round(performance.now() - t0), json: await res.json().catch(() => ({})) };
}
const mentions = (s, re) => re.test(s ?? "");

const A = rand(), B = rand();
const fact = "I am building a Walrus Sites app on mainnet with Next.js 16 and my remember calls keep returning 429 errors.";

// 1. session A: tell it once
const t1 = await chat(A, fact);
log("A.turn1", { status: t1.status, ms: t1.ms, memoriesUsed: t1.memories.length, replied: t1.reply.length > 0, err: t1.err });

// 2. write (analyze), like the browser does after the reply
const w = await save(A, "turn", fact);
log("A.save", { status: w.status, ms: w.ms, saved: w.json.saved, failed: w.json.failed });

// 3. brand-new session, same code, no history. Poll: a finished job is not recallable at once (index lag).
let t3 = null, tries = 0;
const q = "Which framework and network am I on, and what error am I hitting?";
for (; tries < 8; tries++) {
  t3 = await chat(A, q);
  if (t3.memories.some((m) => mentions(m.text, /next\.?js|mainnet|429/i))) break;
  await new Promise((r) => setTimeout(r, 8000));
}
const recalled = t3.memories.some((m) => mentions(m.text, /next\.?js|mainnet|429/i));
log("A.newSession", { ms: t3.ms, tries: tries + 1, recalled, memoriesUsed: t3.memories.length, replyMentionsStack: mentions(t3.reply, /next\.?js/i) && mentions(t3.reply, /mainnet/i), replyMentions429: mentions(t3.reply, /429/), replyAsksAgain: mentions(t3.reply, /what (framework|stack)|which (framework|stack)|tell me (about|more)/i), reply: t3.reply.slice(0, 400) });

// 4. control: a different code must not see it
const c = await chat(B, q);
log("B.control", { ms: c.ms, memoriesUsed: c.memories.length, replyMentionsNext: mentions(c.reply, /next\.?js/i), reply: c.reply.slice(0, 200) });

// 5. hand-added correction: the newer fact wins
const fix = "We moved to testnet for debugging this week.";
const s5 = await save(A, "fact", fix);
log("A.fact.save", { status: s5.status, ms: s5.ms, saved: s5.json.saved });
const t5 = await chat(A, "Which network am I on right now?", { fresh: [fix] });
log("A.correction", { ms: t5.ms, replyMentionsTestnet: mentions(t5.reply, /testnet/i), reply: t5.reply.slice(0, 300) });

out.verdict = {
  recalledInNewSession: recalled,
  controlIsolated: c.memories.length === 0 || !mentions(c.reply, /next\.?js/i),
  correctionUsed: mentions(t5.reply, /testnet/i),
};
mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/p1-journey.json", JSON.stringify(out, null, 1));
console.log("VERDICT", JSON.stringify(out.verdict));
process.exit(out.verdict.recalledInNewSession && out.verdict.controlIsolated ? 0 : 1);
