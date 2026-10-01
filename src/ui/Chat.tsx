"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { chat, listMemories, save, type Mem } from "./api";
import styles from "./Chat.module.css";
import { Ledger, age, type LedgerItem } from "./Ledger";
import { dur, ease, printDelay } from "./motion";
import { loadCode, saveCode } from "./session";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  used?: Mem[];
  recallError?: string | null;
  recallMs?: number;
  failed?: string;
}

type SaveState = { kind: "idle" } | { kind: "saving"; n: number } | { kind: "saved"; facts: number } | { kind: "failed"; message: string };

const lc = (s: string) => s.toLowerCase();

/** A luggage tag with its eyelet: the thing you hand over and pick up later. */
function TagGlyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h6.4c.66 0 1.3.26 1.77.73l5.1 5.1a2.5 2.5 0 0 1 0 3.54l-6.4 6.4a2.5 2.5 0 0 1-3.54 0l-5.1-5.1A2.5 2.5 0 0 1 2 10.9z" fill="currentColor" />
      <circle cx="6.25" cy="6.25" r="1.75" className={styles.glyphHole} />
    </svg>
  );
}

export function Chat() {
  const [code, setCode] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [stored, setStored] = useState<Mem[]>([]);
  const [local, setLocal] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const nextId = useRef(1);
  const pending = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  const drawerBtn = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async (c: string) => {
    const r = await listMemories(c).catch(() => ({ items: [] as Mem[], error: "Could not load memories." }));
    setStored(r.items);
    setLoadError(r.error);
    setLoading(false);
    // Anything the relayer now returns is no longer pending.
    setLocal((p) => p.filter((l) => !r.items.some((s) => lc(s.text) === lc(l.text))));
  }, []);

  useEffect(() => {
    const c = loadCode();
    setCode(c);
    void refresh(c);
  }, [refresh]);

  useEffect(() => {
    if (msgs.length) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawer(false);
        drawerBtn.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const bump = useCallback((delta: number, outcome?: SaveState) => {
    pending.current += delta;
    if (pending.current > 0) setSaveState({ kind: "saving", n: pending.current });
    else if (outcome) setSaveState(outcome);
  }, []);

  // A finished write is not recallable at once (index lag), so look again after a short wait.
  const refreshLater = useCallback(
    (c: string) => {
      for (const ms of [4000, 12000]) setTimeout(() => void refresh(c), ms);
    },
    [refresh],
  );

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
        await chat({ code, message, history, fresh: local.map((l) => l.text) }, (e) => {
          if (e.t === "memories") patch((m) => ({ ...m, used: e.items, recallError: e.error, recallMs: e.ms }));
          else if (e.t === "token") {
            replied = true;
            patch((m) => ({ ...m, content: m.content + e.d }));
          } else if (e.t === "error") patch((m) => ({ ...m, failed: e.message }));
        });
      } catch (err) {
        patch((m) => ({ ...m, failed: err instanceof Error ? err.message : "Something went wrong." }));
      }
      setBusy(false);
      inputRef.current?.focus({ preventScroll: true });
      if (!replied) return;
      // Save after the reply is on screen: a mainnet write takes 20 to 30 s and must not block the chat.
      bump(1);
      save(code, "turn", message)
        .then((r) => {
          bump(-1, { kind: "saved", facts: r.saved });
          if (r.saved > 0) refreshLater(code);
        })
        .catch((err: Error) => bump(-1, { kind: "failed", message: err.message }));
    },
    [busy, code, msgs, local, bump, refreshLater],
  );

  const remember = useCallback(
    async (fact: string): Promise<string> => {
      // Shown in the ledger and used in the next prompt at once; marked pending until Walrus has it.
      setLocal((p) => [{ text: fact, createdAt: new Date().toISOString(), pending: true }, ...p].slice(0, 8));
      bump(1);
      try {
        await save(code, "fact", fact);
        bump(-1, { kind: "saved", facts: 1 });
        refreshLater(code);
        return "Saved to Walrus. I will use it from now on.";
      } catch (err) {
        bump(-1, { kind: "failed", message: (err as Error).message });
        return "Could not save that one. I will still use it in this tab.";
      }
    },
    [code, bump, refreshLater],
  );

  const switchCode = useCallback(
    (c: string) => {
      saveCode(c);
      setCode(c);
      setMsgs([]);
      setLocal([]);
      setStored([]);
      setLoading(true);
      setSaveState({ kind: "idle" });
      setDrawer(false);
      void refresh(c);
    },
    [refresh],
  );

  const ledgerItems: LedgerItem[] = [...local, ...stored.filter((s) => !local.some((l) => lc(l.text) === lc(s.text)))];
  const latest = [...msgs].reverse().find((m) => m.role === "assistant" && m.used);
  const used = (latest?.used ?? []).map((m) => lc(m.text));
  const known = ledgerItems.length;
  const empty = msgs.length === 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.app}>
        <aside id="ledger" className={styles.rail} data-open={drawer ? "true" : "false"} aria-label="Memory">
          <div className={styles.brand}>
            <div className={styles.brandText}>
              <p className={styles.mark}><TagGlyph />Pickup</p>
              <p className={styles.tagline}>Walrus and Sui help that remembers your project</p>
            </div>
            <button type="button" className={styles.close} onClick={() => setDrawer(false)} aria-label="Close memory panel">Close</button>
          </div>
          <Ledger code={code} items={ledgerItems} loading={loading} loadError={loadError} used={used} punchKey={latest?.id ?? 0} onSwitchCode={switchCode} onRemember={remember} />
        </aside>
        {drawer && <button type="button" className={styles.scrim} aria-label="Close memory panel" onClick={() => setDrawer(false)} tabIndex={-1} />}

        <section className={styles.stage} aria-label="Conversation" data-empty={empty ? "true" : "false"}>
          <header className={styles.bar}>
            <p className={styles.barMark}><TagGlyph />Pickup</p>
            <button ref={drawerBtn} type="button" className={styles.memBtn} onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="ledger">
              Memory <span className={styles.memCount}>{loading ? "…" : known}</span>
            </button>
          </header>

          <div className={styles.log} aria-live="polite">
            <div className={styles.column}>
              {empty && (
                <div className={styles.welcome}>
                  <h1 className={styles.lead}>{loading ? "Opening your memory…" : known > 0 ? "Welcome back." : "What are you building?"}</h1>
                  <p className={styles.sub}>
                    {loading
                      ? "Checking Walrus for what I already know about you."
                      : known > 0
                        ? `I am holding ${known} ${known === 1 ? "thing" : "things"} from earlier sessions, the newest saved ${!ledgerItems[0] || ledgerItems[0].pending ? "just now" : age(ledgerItems[0].createdAt)}. Ask anything and I will pick up from there.`
                        : "Tell me your stack and what you are stuck on, once. Next time, on any device with your memory code, I already know."}
                  </p>
                  {known > 0 && !loading && (
                    <ul className={styles.recap} aria-label="Most recent memories">
                      {ledgerItems.slice(0, 4).map((m) => (
                        <li key={m.text} className={styles.recapItem}>
                          <span className={styles.recapHole} aria-hidden="true" />
                          <span className={styles.recapText}>{m.text}</span>
                          <time className={styles.recapAge}>{m.pending ? "saving" : age(m.createdAt)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {msgs.map((m) =>
                m.role === "user" ? (
                  <article key={m.id} className={styles.user}>
                    <p className={styles.who}>You</p>
                    <p className={styles.text}>{m.content}</p>
                  </article>
                ) : (
                  <article key={m.id} className={styles.bot}>
                    <p className={styles.who}>Pickup</p>
                    {m.failed ? (
                      <p className={styles.err} role="alert">{m.failed}</p>
                    ) : m.content ? (
                      <p className={styles.text}>{m.content}</p>
                    ) : (
                      <p className={styles.waiting}>{m.used ? "Writing…" : "Checking memory…"}</p>
                    )}
                    {m.used && <Receipt items={m.used} error={m.recallError ?? null} ms={m.recallMs} />}
                  </article>
                ),
              )}
              <div ref={endRef} />
            </div>
          </div>

          <motion.div layout="position" transition={{ duration: dur.long, ease: ease.out }} className={styles.dock}>
            <div className={styles.column}>
              <div className={styles.statusRow}>
                <p className={styles.status} role="status" data-kind={saveState.kind}>
                  {saveState.kind === "saving" && `Saving to Walrus (${saveState.n} pending). Writes take 20 to 30 s.`}
                  {saveState.kind === "saved" && (saveState.facts > 0 ? `Saved to Walrus: ${saveState.facts} ${saveState.facts === 1 ? "memory" : "memories"}.` : "Nothing worth keeping in that message.")}
                  {saveState.kind === "failed" && `Could not save: ${saveState.message}`}
                </p>
                {saveState.kind === "saving" && <span className={styles.progress} aria-hidden="true" />}
              </div>
              <form
                className={styles.composer}
                data-busy={busy ? "true" : undefined}
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <label htmlFor="msg" className={styles.srOnly}>Message</label>
                <textarea
                  id="msg"
                  ref={inputRef}
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
                  placeholder={known > 0 ? "Ask about your project" : "Your stack, your error, your next step"}
                  aria-describedby="msg-hint"
                />
                <div className={styles.composerFoot}>
                  <p id="msg-hint" className={styles.keys}>Enter sends. Shift and Enter adds a line.</p>
                  <button type="submit" className={styles.send} disabled={busy || !input.trim() || !code} data-state={busy ? "loading" : undefined}>
                    {busy ? "Thinking" : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </section>
      </div>
    </MotionConfig>
  );
}

/** The recall receipt: printed under an answer, listing every memory that went into it. */
function Receipt({ items, error, ms }: { items: Mem[]; error: string | null; ms?: number }) {
  const reduce = useReducedMotion();
  if (error) return <p className={styles.recallNote} data-state="err">Memory unavailable for this answer. I answered without it.</p>;
  if (items.length === 0) return <p className={styles.recallNote}>No memories used for this answer.</p>;
  const delay = printDelay(items.length);
  return (
    <motion.div
      className={styles.receipt}
      initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
      animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
      transition={{ delay: reduce ? 0 : delay, duration: reduce ? dur.short : dur.print, ease: ease.out }}
    >
      <p className={styles.receiptHead}>
        <span>Used {items.length} {items.length === 1 ? "memory" : "memories"}</span>
        {typeof ms === "number" && <span className={styles.receiptMs}>recalled in {ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}</span>}
      </p>
      <ul className={styles.chips}>
        {items.map((m, i) => (
          <motion.li
            key={m.text}
            className={styles.chip}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : delay + 0.16 + i * 0.06, duration: dur.short }}
          >
            <span>{m.text}</span>
            <time className={styles.when}>{age(m.createdAt)}</time>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}
