"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Mem } from "./api";
import styles from "./Ledger.module.css";
import { CODE_RE, normaliseCode } from "./session";

export interface LedgerItem extends Mem {
  pending?: boolean;
}

export function age(createdAt: string | null): string {
  if (!createdAt) return "earlier";
  const s = Math.round((Date.now() - Date.parse(createdAt)) / 1000);
  if (!Number.isFinite(s)) return "earlier";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

interface Props {
  code: string;
  items: LedgerItem[];
  loading: boolean;
  loadError: string | null;
  usedTexts: Set<string>;
  onSwitchCode: (code: string) => void;
  onRemember: (fact: string) => Promise<string>;
}

export function Ledger({ code, items, loading, loadError, usedTexts, onSwitchCode, onRemember }: Props) {
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fact, setFact] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can be blocked; the code is on screen */
    }
  };

  const doSwitch = () => {
    const c = normaliseCode(draft);
    if (!CODE_RE.test(c)) {
      setErr("A memory code is 10 to 24 lowercase letters and digits.");
      return;
    }
    setErr(null);
    setDraft("");
    setSwitching(false);
    onSwitchCode(c);
  };

  const add = async () => {
    const f = fact.trim();
    if (!f || busy) return;
    setBusy(true);
    setFact("");
    setNote(await onRemember(f));
    setBusy(false);
  };

  return (
    <div className={styles.ledger}>
      <section className={styles.codeCard} aria-labelledby="code-h">
        <h2 id="code-h" className={styles.label}>Your memory code</h2>
        <code className={styles.code} aria-label="Your memory code">{code || "…"}</code>
        <p className={styles.hint}>Type this on another device to open the same memory.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={copy} disabled={!code}>{copied ? "Copied" : "Copy code"}</button>
          <button type="button" className={styles.ghost} onClick={() => setSwitching((s) => !s)} aria-expanded={switching}>Use another code</button>
        </div>
        {switching && (
          <div className={styles.switch}>
            <label htmlFor="code-in" className={styles.srOnly}>Memory code from another device</label>
            <input id="code-in" className={styles.field} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSwitch()} placeholder="Paste a code" autoComplete="off" spellCheck={false} />
            <button type="button" className={styles.solid} onClick={doSwitch}>Open</button>
            {err && <p className={styles.err} role="alert">{err}</p>}
          </div>
        )}
      </section>

      <section className={styles.entries} aria-labelledby="mem-h">
        <div className={styles.entriesHead}>
          <h2 id="mem-h" className={styles.label}>What I remember</h2>
          <span className={styles.count}>{loading ? "…" : items.length}</span>
        </div>
        {loadError && <p className={styles.err} role="alert">{loadError}</p>}
        {!loading && !loadError && items.length === 0 && <p className={styles.empty}>Nothing yet. What you tell me appears here once it is saved to Walrus.</p>}
        <ul className={styles.list}>
          <AnimatePresence initial={false}>
            {items.map((m) => (
              <motion.li
                key={m.text.toLowerCase()}
                layout="position"
                className={styles.entry}
                data-used={usedTexts.has(m.text.toLowerCase()) ? "true" : undefined}
                data-pending={m.pending ? "true" : undefined}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <p className={styles.entryText}>{m.text}</p>
                <p className={styles.entryMeta}>
                  {m.pending ? <span>saving to Walrus</span> : <time>{age(m.createdAt)}</time>}
                  {usedTexts.has(m.text.toLowerCase()) && <span className={styles.usedTag}>used in this answer</span>}
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <section className={styles.remember} aria-labelledby="rem-h">
        <h2 id="rem-h" className={styles.label}>Add a fact</h2>
        <p className={styles.hint}>A newer fact beats an older one when they disagree.</p>
        <div className={styles.rememberRow}>
          <label htmlFor="fact" className={styles.srOnly}>A fact for me to remember</label>
          <input id="fact" className={styles.field} value={fact} onChange={(e) => setFact(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} maxLength={500} placeholder="A fact about your project" />
          <button type="button" className={styles.solid} onClick={() => void add()} disabled={!fact.trim() || busy || !code}>Add</button>
        </div>
        {note && <p className={styles.hint} role="status">{note}</p>}
        <p className={styles.warn}>Do not paste secrets. Walrus memories cannot be deleted one by one.</p>
      </section>
    </div>
  );
}
