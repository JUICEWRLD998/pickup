export const MODEL = "google/gemini-2.5-flash";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export class LlmError extends Error {}

/** Parses one SSE data payload from OpenRouter into a text delta ("" if none). */
export function deltaOf(payload: string): string {
  if (!payload || payload === "[DONE]") return "";
  try {
    const j = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
    return j.choices?.[0]?.delta?.content ?? "";
  } catch {
    return "";
  }
}

export async function* streamReply(apiKey: string, system: string, messages: ChatMsg[], fetchImpl: typeof fetch = fetch): AsyncGenerator<string> {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: 500, stream: true, messages: [{ role: "system", content: system }, ...messages] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok || !res.body) throw new LlmError(`model HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) {
        const d = deltaOf(line.slice(5).trim());
        if (d) yield d;
      }
    }
  }
}
