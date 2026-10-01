"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { chat, listMemories, save, type Mem } from "./api";
import styles from "./Chat.module.css";
import { Ledger, age, type LedgerItem } from "./Ledger";
import { loadCode, saveCode } from "./session";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  used?: Mem[];
  recallError?: string | null;
  failed?: string;
}

type SaveState = { kind: "idle" } | { kind: "saving"; n: number } | { kind: "saved"; facts: number } | { kind: "failed"; message: string };

const lc = (s: string) => s.toLowerCase();

/** A bookmark: where you left off. The one accent shape in the wordmark. */
function Bookmark() {
  return (
    <svg className={styles.bookmark} viewBox="0 0 14 20" width="14" height="20" aria-hidden="true" focusable="false">
      <path d="M1 1h12v18l-6-4.5L1 19z" fill="currentColor" />
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
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
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
  const usedTexts = new Set((latest?.used ?? []).map((m) => lc(m.text)));
  const known = ledgerItems.length;

  return (
    <MotionConfig reducedMotion="user">
      <div className={styles.app}>
        <aside id="ledger" className={styles.rail} data-open={drawer ? "true" : "false"} aria-label="Memory">
          <div className={styles.brand}>
            <p className={styles.mark}><Bookmark />Pickup</p>
            <button type="button" className={styles.close} onClick={() => setDrawer(false)} aria-label="Close memory panel">Close</button>
          </div>
          <Ledger code={code} items={ledgerItems} loading={loading} loadError={loadError} usedTexts={usedTexts} onSwitchCode={switchCode} onRemember={remember} />
        </aside>
        {drawer && <button type="button" className={styles.scrim} aria-label="Close memory panel" onClick={() => setDrawer(false)} tabIndex={-1} />}

        <section className={styles.stage} aria-label="Conversation">
          <header className={styles.bar}>
            <p className={styles.barMark}><Bookmark />Pickup</p>
            <p className={styles.barNote}>Walrus and Sui help that remembers your project</p>
            <button ref={drawerBtn} type="button" className={styles.memBtn} onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="ledger">
              Memory <span className={styles.memCount}>{loading ? "…" : known}</span>
            </button>
          </header>

          <div className={styles.log} aria-live="polite">
            <div className={styles.column}>
              {msgs.length === 0 && (
                <div className={styles.welcome}>
                  <h1 className={styles.lead}>{loading ? "Opening your memory…" : known > 0 ? "Welcome back." : "What are you building?"}</h1>
                  <p className={styles.sub}>
                    {loading
                      ? "Checking Walrus for what I already know about you."
                      : known > 0
                        ? `I remember ${known} ${known === 1 ? "thing" : "things"} about your work. Ask me anything and I will pick up from there.`
                        : "Tell me your stack and what you are working on once. Next time, from any device with your memory code, I already know."}
                  </p>
                  {known > 0 && (
                    <ul className={styles.recap}>
                      {ledgerItems.slice(0, 5).map((m) => (
                        <li key={m.text} className={styles.recapItem}>
                          <span>{m.text}</span>
                          <time>{m.pending ? "saving" : age(m.createdAt)}</time>
                        </li>
                      ))}
                    </ul>
                  )}
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
            </div>
          </div>

          <div className={styles.dock}>
            <div className={styles.column}>
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
                  placeholder="Message Pickup"
                />
                <button type="submit" className={styles.send} disabled={busy || !input.trim() || !code}>{busy ? "Thinking" : "Send"}</button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}

function Used({ items, error }: { items: Mem[]; error: string | null }) {
  const [open, setOpen] = useState(false);
  const label = error ? "Memory unavailable for this answer" : items.length === 0 ? "No memories used" : `Used ${items.length} ${items.length === 1 ? "memory" : "memories"}`;
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
