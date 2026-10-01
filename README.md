# Pickup

**A chatbot for Walrus and Sui builders that picks up where you left off.** Tell it your stack, your
error, or a decision once. On any device with your memory code, it already knows.

*Mustapha Fadhlullah — independent security researcher.* Built for Walrus Sessions 8, "Chatbots That
Remember."

## What it is

Pickup is a streamed chat app (Gemini 2.5 Flash, via OpenRouter) backed by Walrus Memory on Sui
mainnet. Before every answer it recalls what it already knows about you; after every answer it
quietly saves what's worth keeping. Under each reply, a line — *"Used 2 memories"* — names exactly
which facts shaped that answer, with their age. A second browser, a second device, a week later: type
the same memory code, and the chatbot picks up mid-conversation instead of starting over.

That's the whole product. No accounts, no auth, no settings page — one memory code is the only key.

## Status

| Piece | Status |
|---|---|
| Chat with Gemini 2.5 Flash (OpenRouter), streamed | **LIVE** locally |
| Recall before each answer, save after it, on Walrus Memory mainnet | **LIVE** locally, verified (`evidence/p1-journey.json`, `evidence/ui/report.json`) |
| Memory ledger beside the chat, "Used N memories" under each reply, "Add a fact" | **LIVE** locally |
| Same memory on a second device via a memory code | **LIVE** locally (code survives reload; not yet tested on separate physical hardware) |
| Deployed public URL | **NOT LIVE** |
| Days of real outside use | **NOT LIVE** |
| Article, video, X post | drafted, see `article.md`, `video-plan.md`, `x-post.md` |

## How memory is integrated

Three paths, each one call into `@mysten-incubation/memwal` 0.1.8 against the managed relayer
(`https://relayer.memory.walrus.xyz`), mainnet.

- **One relayer account, one namespace per user.** The namespace is `pickup-<memory code>`. The code
  is a random 12-character id generated on first visit, kept in the browser, and shown in the header
  split into readable groups (`jor6 nwrt sn1b`). Typing it into another device opens the same memory —
  it is the entire account model.
- **Read path.** Before every answer, the server calls `recall({ query, limit: 5, namespace, sort:
  "recent" })` with an 8-second abort. Hits go into the system prompt, newest first, with their age.
  If recall fails or times out, Pickup answers anyway and says it answered without memory — it never
  blocks the chat on Walrus being slow.
- **Write path.** After the reply is fully on screen (never before — a mainnet write takes 20 to
  30 seconds), the browser calls `/api/save`, which runs the stock fact extractor (`analyzeAndWait`)
  on the user's message. The UI shows "Saving to Walrus," then "Saved: N memories." Writes for one
  user run one at a time. Short turns, bare questions, and empty text are skipped; text over 12 KB is
  cut, because the relayer silently drops turns over 16 KB (upstream issue #1037).
- **Hand-added facts.** The "Add a fact" box calls `rememberAndWait` and stores the text verbatim. It
  also stays in client state for the very next prompt, because a job that just finished is not yet
  recallable — the relayer needs a short indexing window.
- **Corrections.** The model is told to trust the user over an older memory and say what changed. The
  newest memory is always listed first in the prompt.

**Not built:** forgetting. SDK 0.1.8 has no delete method, and the relayer's `forget` route only
drops the item from the search index, per its own docs — the underlying blob stays on Walrus. The UI
says so; there is no delete button pretending otherwise.

## Real evidence, not a claim

- **Phase 0 smoke, mainnet:** relayer health 991 ms, one `rememberAndWait` 36.1 s, one `recall`
  2.8 s, one Gemini call 959 ms, cost $0.0000046 (`evidence/p0.json`).
- **Phase 1 journey:** a fact told in session A is recalled in a brand-new session (no chat history)
  using the same memory code; a *different* code does not see it; a hand-added correction is used
  (`evidence/p1-journey.json`).
- **UI, driven in headless Chrome, not grepped:** the same journey through the real rendered page at
  8 widths (320 to 1920 px), no horizontal overflow, a planted 2000px control that the probe
  correctly flags, measured text contrast at or above 4.5:1, zero console errors
  (`evidence/ui/report.json`, screenshots in `evidence/ui/`).
- **Every-screen composition:** real stored memory rendered at all 8 widths — drawer on phone and
  tablet, permanent panel from 1024 px up — screenshots read, not just measured
  (`evidence/ui/screens.json`).

Anything not backed by one of the files above is marked unmeasured in this README, on purpose.

## Run it

```bash
npm ci
cp .env.example .env.local     # OPENROUTER_API_KEY, MEMWAL_KEY, MEMWAL_ACCOUNT_ID
npm run smoke                  # relayer health, one remember+recall, one Gemini call
npm run dev                    # http://localhost:3000
```

Checks: `npm run verify` (typecheck + 18 unit tests, no keys needed). With keys and the app built
(`npm run build && npx next start -p 3200`):

```bash
E2E_BASE=http://localhost:3200 npm run journey          # mainnet journey, writes evidence/p1-journey.json
node scripts/ui-screens.mjs                              # 8-width composition, writes evidence/ui/screens.json
node scripts/ui-drive.mjs                                 # full journey through the rendered page
```

## Known limits

- **Writes are slow** — 20 to 30 seconds on mainnet. A fact you just told the bot is usable in the
  same tab instantly, but it may take a short while to become recallable from a different device.
- **The fact extractor is the stock Walrus Memory one.** It keeps what it judges durable and can
  drop or rephrase things; Pickup does not control its judgment.
- **The memory code is the only key.** Anyone who has it can read that memory. It is not an account,
  and it cannot be recovered if lost.
- **Do not paste secrets.** Memories on Walrus cannot be deleted one at a time — once written, they
  stay written.
- **No real-user data yet.** Deployment and outside use are still pending (see Status above).

## Stack

Next.js App Router, TypeScript, CSS Modules with design tokens (no Tailwind), Motion for React for
the one signature animation (memory tags being pulled for an answer), Vercel AI SDK for streaming.

## Security research on the underlying SDK

Separate from this product: while building on `@mysten-incubation/memwal`, I found and reproduced two
access-control defects in its host repo, `MystenLabs/MemWal`. Full writeup, proof of concept, and a
verified fix: [`bug-bounty/`](bug-bounty/).
