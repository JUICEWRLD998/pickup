"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Mem } from "./api";
import styles from "./Ledger.module.css";
import { dur, ease, punch } from "./motion";
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

/** The memory code split into groups of four, so it can be read aloud and typed on a phone. */
export function CodeGroups({ code }: { code: string }) {
  if (!code) return <>…</>;
  const groups = code.match(/.{1,4}/g) ?? [code];
  return (
    <>
      {groups.map((g, i) => (
        <span key={i} className={styles.group}>{g}</span>
      ))}
    </>
  );
}

interface Props {
  code: string;
  items: LedgerItem[];
  loading: boolean;
  loadError: string | null;
  /** Lowercased memory texts used in the latest answer, in recall order. */
  used: string[];
  /** Changes once per answer, so the punch replays even when the same tags are pulled again. */
  punchKey: number;
  onSwitchCode: (code: string) => void;
  onRemember: (fact: string) => Promise<string>;
}

export function Ledger({ code, items, loading, loadError, used, punchKey, onSwitchCode, onRemember }: Props) {
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fact, setFact] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
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
    setNote(null);
    setFact("");
    const text = await onRemember(f);
    setNote({ ok: text.startsWith("Saved"), text });
    setBusy(false);
  };

  return (
    <div className={styles.ledger}>
      <section className={styles.ticket} aria-labelledby="code-h">
        <div className={styles.ticketBody}>
          <h2 id="code-h" className={styles.ticketLabel}>Your memory code</h2>
          <code className={styles.code} aria-label={`Your memory code: ${code}`}>
            <CodeGroups code={code} />
          </code>
          <p className={styles.ticketHint}>Type it on another device to pick up the same memory.</p>
        </div>
        <div className={styles.stub}>
          <button type="button" className={styles.stubBtn} onClick={copy} disabled={!code} data-state={copied ? "success" : undefined}>
            {copied ? "Copied" : "Copy code"}
          </button>
          <button type="button" className={styles.stubBtn} onClick={() => setSwitching((s) => !s)} aria-expanded={switching} aria-controls="code-switch">
            Use another code
          </button>
        </div>
      </section>

      <AnimatePresence initial={false}>
        {switching && (
          <motion.div
            key="switch"
            id="code-switch"
            className={styles.switch}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: dur.short, ease: ease.out }}
          >
            <label htmlFor="code-in" className={styles.fieldLabel}>Code from your other device</label>
            <div className={styles.row}>
              <input
                id="code-in"
                className={styles.field}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setErr(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && doSwitch()}
                placeholder="12-character code"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? "code-err" : undefined}
              />
              <button type="button" className={styles.solid} onClick={doSwitch} disabled={!draft.trim()}>Open</button>
            </div>
            {err && <p id="code-err" className={styles.err} role="alert">{err}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <section className={styles.rack} aria-labelledby="mem-h">
        <div className={styles.rackHead}>
          <h2 id="mem-h" className={styles.heading}>What I remember</h2>
          <span className={styles.count} aria-label={loading ? "loading" : `${items.length} memories`}>{loading ? "…" : items.length}</span>
        </div>
        {loadError && <p className={styles.err} role="alert">{loadError}</p>}
        {loading && !loadError && (
          <ul className={styles.list} aria-hidden="true">
            {[0, 1, 2].map((i) => <li key={i} className={styles.ghostTag} />)}
          </ul>
        )}
        {!loading && !loadError && items.length === 0 && (
          <p className={styles.empty}>Nothing checked in yet. Tell me your stack or your error, and it lands here once Walrus has stored it.</p>
        )}
        {!loading && items.length > 0 && (
          <ul className={styles.list}>
            <AnimatePresence initial={false}>
              {items.map((m) => {
                const k = m.text.toLowerCase();
                const order = used.indexOf(k);
                const isUsed = order >= 0;
                return (
                  <motion.li
                    key={k}
                    layout="position"
                    className={styles.tag}
                    data-used={isUsed ? "true" : undefined}
                    data-pending={m.pending ? "true" : undefined}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: dur.short, ease: ease.out }}
                  >
                    <span className={styles.hole} aria-hidden="true">
                      {isUsed && (
                        <motion.span
                          key={punchKey}
                          className={styles.punch}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: [0, 1.25, 1], opacity: 1 }}
                          transition={{ delay: order * punch.stagger, duration: punch.each, ease: ease.out, times: [0, 0.6, 1] }}
                        />
                      )}
                    </span>
                    <p className={styles.tagText}>{m.text}</p>
                    <p className={styles.tagMeta}>
                      {m.pending ? <span className={styles.saving}>checking in to Walrus</span> : <time dateTime={m.createdAt ?? undefined}>{age(m.createdAt)}</time>}
                      {isUsed && <span className={styles.pulled}>used in this answer</span>}
                    </p>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <section className={styles.add} aria-labelledby="rem-h">
        <h2 id="rem-h" className={styles.heading}>Add a fact</h2>
        <p className={styles.hint}>A newer fact wins when it disagrees with an older one.</p>
        <div className={styles.row}>
          <label htmlFor="fact" className={styles.srOnly}>A fact for me to remember</label>
          <input
            id="fact"
            className={styles.field}
            value={fact}
            onChange={(e) => setFact(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            maxLength={500}
            placeholder="A fact about your project"
          />
          <button type="button" className={styles.solid} onClick={() => void add()} disabled={!fact.trim() || busy || !code} data-state={busy ? "loading" : undefined}>
            {busy ? "Adding" : "Add"}
          </button>
        </div>
        {note && <p className={note.ok ? styles.ok : styles.err} aria-live="polite">{note.text}</p>}
        <p className={styles.warn}>Do not paste secrets. Walrus memories cannot be deleted one by one.</p>
      </section>
    </div>
  );
}
