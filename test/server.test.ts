import { describe, expect, it } from "vitest";
import { ConfigError, namespaceFor, serverEnv, validCode } from "../src/server/config";
import { ageLabel, decideSave, enqueue, MAX_SAVE_CHARS, recallFor, tidy, type MemwalLike } from "../src/server/memory";
import { systemPrompt } from "../src/server/prompt";
import { deltaOf, streamReply } from "../src/server/llm";

describe("config", () => {
  it("accepts only lowercase alphanumeric codes of 10 to 24 chars", () => {
    expect(validCode("abcdefghij12")).toBe(true);
    expect(validCode("short")).toBe(false);
    expect(validCode("ABCDEFGHIJ12")).toBe(false);
    expect(validCode("abc/../defghij")).toBe(false);
    expect(validCode(undefined)).toBe(false);
  });
  it("namespaces by code", () => expect(namespaceFor("abcdefghij12")).toBe("pickup-abcdefghij12"));
  it("names the missing variable and never a value", () => {
    expect(() => serverEnv({ OPENROUTER_API_KEY: "secret-value" })).toThrow(ConfigError);
    try {
      serverEnv({ OPENROUTER_API_KEY: "secret-value" });
    } catch (e) {
      expect(String(e)).toContain("MEMWAL_KEY");
      expect(String(e)).not.toContain("secret-value");
    }
  });
});

describe("decideSave", () => {
  it("skips empty and short turns", () => {
    expect(decideSave("   ")).toEqual({ save: false, reason: "empty" });
    expect(decideSave("thanks a lot")).toEqual({ save: false, reason: "too_short" });
  });
  it("saves a real turn", () => {
    const d = decideSave("I am on memwal 0.1.8 and my remember calls return 429 on mainnet");
    expect(d.save).toBe(true);
  });
  it("caps long turns and says so", () => {
    const d = decideSave("word ".repeat(10_000));
    expect(d.save && d.truncated).toBe(true);
    expect(d.save && d.text.length).toBeLessThanOrEqual(MAX_SAVE_CHARS);
  });
});

describe("tidy and age", () => {
  it("drops duplicates and sorts newest first", () => {
    const out = tidy([
      { text: "uses testnet", created_at: "2026-10-01T10:00:00Z" },
      { text: "Uses mainnet", created_at: "2026-10-02T10:00:00Z" },
      { text: "uses mainnet", created_at: "2026-10-01T09:00:00Z" },
    ]);
    expect(out.map((m) => m.text)).toEqual(["Uses mainnet", "uses testnet"]);
  });
  it("labels age", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(ageLabel("2026-10-03T11:59:30Z", now)).toBe("just now");
    expect(ageLabel("2026-10-03T09:00:00Z", now)).toBe("3 h ago");
    expect(ageLabel("2026-10-01T12:00:00Z", now)).toBe("2 d ago");
    expect(ageLabel(null, now)).toBe("earlier");
    expect(ageLabel("garbage", now)).toBe("earlier");
  });
});

const fake = (fn: MemwalLike["recall"]): MemwalLike => ({ recall: fn, analyzeAndWait: async () => ({}), rememberAndWait: async () => ({}) });

describe("recallFor", () => {
  it("returns tidy items and asks for recent order", async () => {
    let seen: unknown;
    const m = fake(async (p) => {
      seen = p;
      return { results: [{ text: "stack is Next.js", created_at: "2026-10-01T00:00:00Z" }] };
    });
    const r = await recallFor(m, "pickup-x", "my stack?");
    expect(r.items[0]?.text).toBe("stack is Next.js");
    expect(seen).toMatchObject({ limit: 5, namespace: "pickup-x", sort: "recent" });
  });
  it("turns a relayer failure into an error string, never a throw", async () => {
    const r = await recallFor(fake(async () => { throw new Error("boom"); }), "pickup-x", "q");
    expect(r.items).toEqual([]);
    expect(r.error).toBe("boom");
  });
});

describe("enqueue", () => {
  it("runs jobs for one namespace in order, one at a time", async () => {
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const job = (name: string, ms: number) => () =>
      (async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, ms));
        log.push(name);
        running--;
      })();
    await Promise.all([enqueue("ns", job("a", 30)), enqueue("ns", job("b", 5)), enqueue("ns", job("c", 1))]);
    expect(log).toEqual(["a", "b", "c"]);
    expect(maxRunning).toBe(1);
  });
  it("keeps going after a failed job", async () => {
    await expect(enqueue("ns2", async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(enqueue("ns2", async () => 7)).resolves.toBe(7);
  });
});

describe("systemPrompt", () => {
  it("lists memories with ages, newest first as given", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    const p = systemPrompt([{ text: "on mainnet", createdAt: "2026-10-03T09:00:00Z" }], now);
    expect(p).toContain("(3 h ago) on mainnet");
  });
  it("tells the model it knows nothing when memory is empty", () => {
    expect(systemPrompt([])).toContain("You know nothing about this user yet");
  });
});

describe("llm stream", () => {
  it("parses deltas and ignores noise", () => {
    expect(deltaOf('{"choices":[{"delta":{"content":"hi"}}]}')).toBe("hi");
    expect(deltaOf("[DONE]")).toBe("");
    expect(deltaOf("not json")).toBe("");
  });
  it("streams tokens from an SSE body, split across chunks", async () => {
    const enc = new TextEncoder();
    const parts = ['data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"del', 'ta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n'];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p));
        c.close();
      },
    });
    const f = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;
    let out = "";
    for await (const t of streamReply("k", "sys", [{ role: "user", content: "hi" }], f)) out += t;
    expect(out).toBe("Hello");
  });
  it("throws on a non-200", async () => {
    const f = (async () => new Response("no", { status: 429 })) as unknown as typeof fetch;
    await expect((async () => { for await (const _ of streamReply("k", "s", [], f)) void _; })()).rejects.toThrow("model HTTP 429");
  });
});
