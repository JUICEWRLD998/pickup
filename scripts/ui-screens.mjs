// Every-screen check: renders the real page at 320, 375, 414, 768, 1024, 1280, 1440 and 1920 px in headless Chrome,
// screenshots each (welcome state with real stored memories, then after one real answer), and measures composition.
// A code that already has memories on mainnet is injected into localStorage so the page opens on real data.
// Usage: PICKUP_CODE=<12-char code> E2E_BASE=http://localhost:3200 node scripts/ui-screens.mjs  -> evidence/ui/screens.json + PNGs
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.E2E_BASE || "http://localhost:3200";
const CODE = process.env.PICKUP_CODE;
if (!CODE) { console.error("Set PICKUP_CODE to a memory code that has memories."); process.exit(2); }
const CHROME = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9355;
const WIDTHS = [[320, 700], [375, 760], [414, 800], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const dir = join("evidence", "ui");
mkdirSync(dir, { recursive: true });
const report = { at: new Date().toISOString(), base: BASE, widths: WIDTHS.map((w) => w[0]), checks: [] };
const check = (name, ok, detail = {}) => { report.checks.push({ name, ok, ...detail }); console.log(ok ? "PASS" : "FAIL", name, JSON.stringify(detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "pk2-"))}`, "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length) break; } catch { /* starting */ } await sleep(250); }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map(); const errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
  if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails?.exception?.description?.slice(0, 200) ?? "exception");
};
const cdp = (method, params = {}) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const until = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(300); } return false; };
const shot = async (name) => writeFileSync(join(dir, `${name}.png`), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
const size = (w, h) => cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });

await cdp("Page.enable"); await cdp("Runtime.enable");
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem('pickup.code', ${JSON.stringify(CODE)}); } catch (e) {}` });

const overflow = `(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false; return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !e.closest('[data-open="false"]'); }).map(e => e.tagName + '.' + String(e.className).slice(0, 30)); })()`;
const railVisible = `(() => { const r = document.querySelector('aside'); const b = r.getBoundingClientRect(); const s = getComputedStyle(r); return s.visibility !== 'hidden' && b.right > 0 && b.left < window.innerWidth && b.width > 100; })()`;
const filled = `(() => { const vw = innerWidth; const c = document.querySelector('[class*=column]').getBoundingClientRect(); const a = document.querySelector('aside').getBoundingClientRect(); const railW = getComputedStyle(document.querySelector('aside')).position !== 'fixed' ? a.width : 0; const used = railW + Math.min(c.width, vw - railW); return Math.round(100 * used / vw); })()`;

for (const [w, h] of WIDTHS) {
  await size(w, h);
  await cdp("Page.navigate", { url: BASE + "/" });
  await sleep(900);
  await until("document.readyState === 'complete'", 15000);
  const loaded = await until("document.querySelector('h1') && document.querySelector('h1').textContent.indexOf('Opening') < 0", 40000);
  await sleep(500);
  const h1 = await ev("document.querySelector('h1')?.textContent");
  check(`${w}px: welcome state opens on real memory`, loaded && h1 === "Welcome back.", { h1 });
  check(`${w}px: no element past the edge`, (await ev(overflow)).length === 0, { over: (await ev(overflow)).slice(0, 3) });
  const visible = await ev(railVisible);
  check(`${w}px: memory rail ${w >= 1024 ? "is permanent" : "is a drawer, closed"}`, w >= 1024 ? visible === true : visible === false, { visible });
  if (w < 1024) {
    await ev("[...document.querySelectorAll('button')].find(b => b.textContent.trim().indexOf('Memory') === 0)?.click()");
    await sleep(600);
    check(`${w}px: Memory button opens the drawer`, (await ev(railVisible)) === true);
    await shot(`screen-${w}-drawer`);
    await ev("document.querySelector('aside button[class*=close]')?.click()");
    await sleep(600);
    check(`${w}px: Close hides the drawer`, (await ev(railVisible)) === false);
  } else {
    const pct = await ev(filled);
    check(`${w}px: rail plus conversation fill at least 60% of the width`, pct >= 60, { pct });
  }
  const heroBottom = await ev("document.querySelector('h1').getBoundingClientRect().bottom");
  check(`${w}px: headline and recap visible without scrolling`, heroBottom < h, { heroBottom: Math.round(heroBottom), viewport: h });
  await shot(`screen-${w}-welcome`);
}

// One real answer at laptop and phone widths (a question, so nothing is written to Walrus).
for (const [w, h] of [[1440, 900], [375, 760]]) {
  await size(w, h);
  await cdp("Page.navigate", { url: BASE + "/" });
  await sleep(900);
  await until("document.querySelector('h1')?.textContent === 'Welcome back.'", 40000);
  await ev(`(() => { const el = document.querySelector('#msg'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'Which framework and network am I on, and what error am I hitting?'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await ev("[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Send')?.click()");
  const ok = await until("[...document.querySelectorAll('article')].some(a => /Used [0-9]+ memor/.test(a.textContent)) && !document.querySelector('button[class*=send]').textContent.startsWith('Thinking')", 60000);
  check(`${w}px: answer arrives with 'Used N memories'`, ok);
  await sleep(600);
  await shot(`screen-${w}-answer`);
}
check("no uncaught page errors across all widths", errors.length === 0, { errors: errors.slice(0, 3) });

// planted control: an element wider than the viewport must be flagged by the overflow probe.
await size(375, 760);
await ev("(() => { const d = document.createElement('div'); d.id='__ctl'; d.style.cssText='position:absolute;left:0;top:0;width:2000px;height:4px'; document.body.appendChild(d); })()");
check("planted 2000px control IS detected (probe can fail)", (await ev(overflow)).length > 0);

writeFileSync(join(dir, "screens.json"), JSON.stringify(report, null, 1));
ws.close(); chrome.kill();
const failed = report.checks.filter((c) => !c.ok);
console.log(failed.length ? `FAILED ${failed.length}` : "ALL PASS");
process.exit(failed.length ? 1 : 0);
