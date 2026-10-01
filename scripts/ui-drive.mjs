// Drives the real page in headless Chrome over CDP (no dependencies; Node 24 has fetch and WebSocket).
// Journey: send a fact, wait for "Saved to Walrus", RELOAD (a new session; the memory code survives in localStorage),
// ask about the fact, open "Used N memories", screenshot. Then layout probes at 5 widths with a planted overflow control.
// Usage: E2E_BASE=http://localhost:3200 node scripts/ui-drive.mjs   -> evidence/ui/report.json + PNGs (PNGs are git-ignored)
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.E2E_BASE || "http://localhost:3200";
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9344;
const dir = join("evidence", "ui");
mkdirSync(dir, { recursive: true });
const report = { at: new Date().toISOString(), base: BASE, checks: [] };
const check = (name, ok, detail = {}) => { report.checks.push({ name, ok, ...detail }); console.log(ok ? "PASS" : "FAIL", name, JSON.stringify(detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "pk-"))}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 40; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch { /* chrome still starting */ }
  await sleep(250);
}
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
const until = async (expr, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(400); } return false; };
const shot = async (name) => { const r = await cdp("Page.captureScreenshot", { format: "png" }); writeFileSync(join(dir, `${name}.png`), Buffer.from(r.result.data, "base64")); };
const size = (w, h) => cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
const goto = async (url) => { await cdp("Page.navigate", { url }); await sleep(1200); await until("document.readyState === 'complete'", 15000); };
const setText = (sel, v) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const clickText = (t) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().indexOf(${JSON.stringify(t)}) === 0 && !x.disabled); if (!b) return false; b.click(); return true; })()`);

await cdp("Page.enable"); await cdp("Runtime.enable");
const consoleErrors = [];
await cdp("Log.enable");
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.method === "Runtime.exceptionThrown") consoleErrors.push(d.params.exceptionDetails?.exception?.description?.slice(0, 300) ?? d.params.exceptionDetails?.text);
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") consoleErrors.push(d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
});

await size(1280, 900);
await goto(BASE + "/");
check("page renders title and wordmark", (await ev("document.querySelector('h1')?.textContent")) === "Pickup", { title: await ev("document.title") });
const code = await ev("document.querySelector('code')?.textContent");
check("memory code shown and valid", typeof code === "string" && /^[a-z0-9]{10,24}$/.test(code), { codeLength: code?.length });
await shot("01-empty");

// session 1: tell it once
const fact = "I am building a Walrus Sites app on mainnet with Next.js 16 and my remember calls keep returning 429 errors.";
await setText("#msg", fact);
check("Send enabled with text", await clickText("Send"));
check("reply streams in", await until("[...document.querySelectorAll('article')].filter(a => a.textContent.indexOf('Pickup') === 0).some(a => a.textContent.length > 40 && a.textContent.indexOf('Checking memory') < 0)", 40000));
if (consoleErrors.length) console.log("page errors so far:", JSON.stringify(consoleErrors));
await shot("02-first-reply");
check("save completes on mainnet", await until("document.querySelector('[role=status]')?.textContent.indexOf('Saved to Walrus') === 0", 100000), { status: await ev("document.querySelector('[role=status]')?.textContent") });

// session 2: reload = no chat history, same code
await goto(BASE + "/");
check("code survives reload", (await ev("document.querySelector('code')?.textContent")) === code);
check("chat history is empty after reload", (await ev("document.querySelectorAll('article').length")) === 0);
await setText("#msg", "Which framework and network am I on, and what error am I hitting?");
await clickText("Send");
let ok2 = false;
for (let i = 0; i < 6 && !ok2; i++) {
  ok2 = await until("[...document.querySelectorAll('article')].some(a => /Used [0-9]+ memor/.test(a.textContent))", 30000);
  if (!ok2) { await sleep(8000); await clickText("Send"); }
}
check("second session shows 'Used N memories'", ok2, { label: await ev("[...document.querySelectorAll('button')].map(b => b.textContent).find(t => t.indexOf('Used') === 0)") });
await until("[...document.querySelectorAll('article')].some(a => a.textContent.indexOf('Next') > -1)", 30000);
await clickText("Used");
await sleep(900);
check("memory chips open and list text with age", (await ev("document.querySelectorAll('li time').length")) > 0, { chips: await ev("document.querySelectorAll('li time').length") });
const reply = await ev("[...document.querySelectorAll('article')].pop()?.textContent");
check("reply uses the remembered stack without asking again", /next/i.test(reply) && !/what (framework|stack)|tell me (about|more)/i.test(reply), { reply: reply?.slice(0, 200) });
await shot("03-second-session-memories");

// layout at five widths, with a planted overflow control
for (const w of [320, 375, 414, 768, 1280]) {
  await size(w, 800);
  await sleep(250);
  const over = await ev("(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; }).map(e => e.tagName + '.' + String(e.className).slice(0, 30)); })()");
  check(`no element past the right edge at ${w}px`, over.length === 0, { over: over.slice(0, 3) });
  if (w === 375) await shot("04-375");
}
await ev("(() => { const d = document.createElement('div'); d.id = '__ctl'; d.style.cssText = 'position:absolute;left:0;top:0;width:2000px;height:4px'; document.body.appendChild(d); })()");
const ctl = await ev("[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).length");
check("planted 2000px control IS detected (probe can fail)", ctl > 0, { flagged: ctl });

// contrast, measured: body text, muted text, accent button label against their real backgrounds
await ev("document.getElementById('__ctl')?.remove()");
await size(1280, 900);
const contrast = await ev(`(() => {
  const toRgb = (c) => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = '#000'; x.fillStyle = c; x.fillRect(0,0,1,1); const d = x.getImageData(0,0,1,1).data; return [d[0], d[1], d[2]]; };
  const lum = ([r,g,b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); };
  const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((x,y) => y-x); return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100; };
  const bgOf = (el) => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') return c; e = e.parentElement; } return 'rgb(0,0,0)'; };
  const pairs = {};
  const pick = (name, sel) => { const el = document.querySelector(sel); if (!el) { pairs[name] = null; return; } pairs[name] = ratio(toRgb(getComputedStyle(el).color), toRgb(bgOf(el))); };
  pick('body text on its card', 'article p[class*=text]'); pick('muted tag line', 'p[class*=tag]'); pick('Send label', 'button[class*=solid]'); pick('memory chip text', 'li[class*=chip]'); pick('status line', 'p[class*=status]');
  return pairs; })()`);
const low = Object.entries(contrast).filter(([, v]) => v !== null && v < 4.5);
check("text contrast is at least 4.5:1 for every measured pair", low.length === 0, { contrast, low });
check("no uncaught page errors", consoleErrors.length === 0, { errors: consoleErrors.slice(0, 3) });

writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 1));
ws.close(); chrome.kill();
const failed = report.checks.filter((c) => !c.ok);
console.log(failed.length ? `FAILED ${failed.length}` : "ALL PASS");
process.exit(failed.length ? 1 : 0);
