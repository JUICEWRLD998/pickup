"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { chat, save, type Mem } from "./api";
import styles from "./Chat.module.css";
import { CODE_RE, loadCode, normaliseCode, saveCode } from "./session";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  used?: Mem[];
  recallError?: string | null;
  failed?: string;
}

type SaveState = { kind: "idle" } | { kind: "saving"; n: number } | { kind: "saved"; facts: number } | { kind: "failed"; message: string };

const STARTERS = [
  "I'm building a Walrus site on mainnet with Next.js and my remember calls return 429.",
  "I use @mysten-incubation/memwal 0.1.8 with a delegate key and one namespace per user.",
];

function age(createdAt: string | null): string {
  if (!createdAt) return "earlier";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 1000));
  if (!Number.isFinite(s)) return "earlier";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function Chat() {
  const [code, setCode] = useState<string>("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [fresh, setFresh] = useState<string[]>([]);
  const [factDraft, setFactDraft] = useState("");
  const [factMsg, setFactMsg] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const nextId = useRef(1);
  const pending = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCode(loadCode()), []);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }), [msgs]);

  const bumpSaving = useCallback((delta: number, outcome?: SaveState) => {
    pending.current += delta;
    if (pending.current > 0) setSaveState({ kind: "saving", n: pending.current });
    else if (outcome) setSaveState(outcome);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy || !code) return;
      const history = msgs.filter((m) => !m.failed && m.content).map((m) => ({ role: m.role, content: m.content }));
      const uid = nextId.current++;
      const aid = nextId.current++;
      setMsgs((p) => [...p, { id: uid, role: "user", content: message }, { id: aid, role: "assistant", content: "" }]);
      setInput("");
      setBusy(true);
      const patch = (f: (m: Msg) => Msg) => setMsgs((p) => p.map((m) => (m.id === aid ? f(m) : m)));
      let replied = false;
      try {
        await chat({ code, message, history, fresh }, (e) => {
          if (e.t === "memories") patch((m) => ({ ...m, used: e.items, recallError: e.error }));
          else if (e.t === "token") {
            replied = true;
            patch((m) => ({ ...m, content: m.content + e.d }));
          } else if (e.t === "error") patch((m) => ({ ...m, failed: e.message }));
        });
      } catch (err) {
        patch((m) => ({ ...m, failed: err instanceof Error ? err.message : "Something went wrong." }));
      }
      setBusy(false);
      if (!replied) return;
      // Save after the reply is on screen: a mainnet write takes 20 to 30 s and must not block the chat.
      bumpSaving(1);
      save(code, "turn", message)
        .then((r) => bumpSaving(-1, { kind: "saved", facts: r.saved }))
        .catch((err: Error) => bumpSaving(-1, { kind: "failed", message: err.message }));
    },
    [busy, code, msgs, fresh, bumpSaving],
  );

  const remember = useCallback(async () => {
    const fact = factDraft.trim();
    if (!fact || !code) return;
    setFactMsg(null);
    // Kept in the browser at once: a fact is not recallable until the relayer has indexed it.
    setFresh((p) => [fact, ...p].slice(0, 5));
    setFactDraft("");
    bumpSaving(1);
    try {
      await save(code, "fact", fact);
      bumpSaving(-1, { kind: "saved", facts: 1 });
      setFactMsg("Saved to Walrus. I will use it from now on.");
    } catch (err) {
      bumpSaving(-1, { kind: "failed", message: (err as Error).message });
      setFactMsg("Could not save that one. I will still use it in this tab.");
    }
  }, [factDraft, code, bumpSaving]);

  const switchCode = () => {
    const c = normaliseCode(codeDraft);
    if (!CODE_RE.test(c)) {
      setCodeErr("A memory code is 10 to 24 lowercase letters and digits.");
      return;
    }
    saveCode(c);
    setCode(c);
    setMsgs([]);
    setFresh([]);
    setSaveState({ kind: "idle" });
    setSwitching(false);
    setCodeDraft("");
    setCodeErr(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can be blocked; the code is visible on screen */
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.shell}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.mark}>Pickup</h1>
            <p className={styles.tag}>Picks up where you left off. Walrus and Sui help that remembers you.</p>
          </div>
          <div className={styles.codeBox}>
            <span className={styles.codeLabel}>Memory code</span>
            <div className={styles.codeRow}>
              <code className={styles.code} aria-label="Your memory code">{code || "…"}</code>
              <button type="button" className={styles.ghost} onClick={copy} disabled={!code}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" className={styles.ghost} onClick={() => setSwitching((s) => !s)} aria-expanded={switching}>
                Use another
              </button>
            </div>
            {switching && (
              <div className={styles.switch}>
                <label htmlFor="code-in" className={styles.srOnly}>Memory code from another device</label>
                <input id="code-in" className={styles.field} value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} placeholder="paste the code from your other device" autoComplete="off" spellCheck={false} />
                <button type="button" className={styles.solid} onClick={switchCode}>Switch</button>
                {codeErr && <p className={styles.err} role="alert">{codeErr}</p>}
              </div>
            )}
          </div>
        </header>

        <section className={styles.log} aria-label="Conversation" aria-live="polite">
          {msgs.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.lead}>Tell me about your project once. Next time, from any device with your code, I already know.</p>
              <ul className={styles.starters}>
                {STARTERS.map((s) => (
                  <li key={s}>
                    <button type="button" className={styles.starter} onClick={() => setInput(s)}>{s}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {msgs.map((m) => (
            <article key={m.id} className={m.role === "user" ? styles.user : styles.bot}>
              <p className={styles.who}>{m.role === "user" ? "You" : "Pickup"}</p>
              {m.failed ? <p className={styles.err} role="alert">{m.failed}</p> : <p className={styles.text}>{m.content || (m.role === "assistant" ? "Checking memory…" : "")}</p>}
              {m.role === "assistant" && m.used && <Used items={m.used} error={m.recallError ?? null} />}
            </article>
          ))}
          <div ref={endRef} />
        </section>

        <p className={styles.status} role="status">
          {saveState.kind === "saving" && `Saving to Walrus (${saveState.n} pending). Writes take 20 to 30 s.`}
          {saveState.kind === "saved" && (saveState.facts > 0 ? `Saved to Walrus: ${saveState.facts} ${saveState.facts === 1 ? "memory" : "memories"}.` : "Nothing worth keeping in that message.")}
          {saveState.kind === "failed" && `Could not save: ${saveState.message}`}
        </p>

        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <label htmlFor="msg" className={styles.srOnly}>Message</label>
          <textarea
            id="msg"
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={2}
            maxLength={4000}
            placeholder="Ask about Walrus or Sui. Share your stack once."
          />
          <button type="submit" className={styles.solid} disabled={busy || !input.trim() || !code}>{busy ? "Thinking…" : "Send"}</button>
        </form>

        <details className={styles.remember}>
          <summary>Remember this</summary>
          <p className={styles.hint}>Add a fact yourself. A newer fact beats an older one when they disagree.</p>
          <div className={styles.rememberRow}>
            <label htmlFor="fact" className={styles.srOnly}>A fact for me to remember</label>
            <input id="fact" className={styles.field} value={factDraft} onChange={(e) => setFactDraft(e.target.value)} maxLength={500} placeholder="e.g. We moved from testnet to mainnet" onKeyDown={(e) => e.key === "Enter" && void remember()} />
            <button type="button" className={styles.solid} onClick={() => void remember()} disabled={!factDraft.trim() || !code}>Remember</button>
          </div>
          {factMsg && <p className={styles.hint} role="status">{factMsg}</p>}
        </details>
      </div>
    </MotionConfig>
  );
}

function Used({ items, error }: { items: Mem[]; error: string | null }) {
  const [open, setOpen] = useState(false);
  const label = error ? "Memory unavailable for this answer" : items.length === 0 ? "No memories used yet" : `Used ${items.length} ${items.length === 1 ? "memory" : "memories"}`;
  return (
    <div className={styles.used}>
      <button type="button" className={styles.usedBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={items.length === 0}>
        <span className={styles.dot} data-state={error ? "err" : items.length ? "on" : "off"} aria-hidden="true" />
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && items.length > 0 && (
          <motion.ul className={styles.chips} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {items.map((m, i) => (
              <motion.li key={m.text} className={styles.chip} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
                <span>{m.text}</span>
                <time className={styles.when}>{age(m.createdAt)}</time>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
