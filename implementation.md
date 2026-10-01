# Pickup: implementation brief

*Mustapha Fadhlullah — independent security researcher.*
Event: Walrus Sessions 8, "Chatbots That Remember". Deadline **Fri 2026-10-09 14:00 UTC**. Internal submit Oct 8. You press submit.
Replaces the Memgate plan. The old repo is `C:\Users\fadhm\Desktop\walrus-sessions-8` (reference and reusable parts). In the table below, `../` means that folder.

## The idea

**Pickup is a chatbot for people building on Walrus and Sui that picks up where you left off.**
Tell it your stack, your error, your decision once. Next day, from another device, it already knows. No re-explaining.

One sentence for the form: *A Walrus and Sui builder chatbot that remembers your project, your errors and your decisions across days and devices, and shows you the memories it used for every answer.*

That is the whole product. It is a chatbot that remembers. Nothing else is required to win the event's stated bar.

### Why this idea (no security angle, on purpose)

- **Built-in users.** The people entering Session 8 are Walrus builders hitting SDK, relayer and Move questions every day. They are the target users and they are reachable in the event's own Discord. Real use for several days is a hard requirement; this is the cheapest way to get it.
- **The memory is the product.** Every session answers "what did this person already tell me": SDK version, chain, last error, repo, what they decided and why.
- **Cross-session value is easy to see.** A stranger's second session that skips the setup questions is the before/after story the article needs.
- **Gemini 2.5 Flash (not Claude or GPT)** also fits the "Beyond the Big Two" prize bucket. Confirm the exact rule on the walform page.

### The one visible feature beyond chat: "Memories used"

Under each reply, a collapsed line: *Used 3 memories* with the actual text and its age. A "Remember this" box lets the user add a fact directly, and a newer fact on the same topic wins on recall (recency sort). This is the memory integration the judges are asked to read about, shown, not described.

Not building: forgetting. The TypeScript SDK 0.1.8 has no delete method and the relayer's forget route only drops the search index. Say so in the docs; do not fake a delete button.

## Scope: what it does and does not do

Does:
1. Chat, streamed, Gemini 2.5 Flash through OpenRouter.
2. Before each answer: recall relevant memories for this user.
3. After each turn: save durable facts for this user (async, not blocking the reply).
4. Show the memories used. Let the user add one by hand.
5. Same memory on a second device via a short **memory code** (the user's namespace id).

Does not (cut list, do not reopen): auth, accounts, payments, forgetting, a gate or filter of any kind, a second model, multi-user sharing, voice, Telegram, a settings page, an evidence page, a corpus.

## Stack

- Next.js App Router, TypeScript, CSS Modules plus design tokens, no Tailwind.
- `@mysten-incubation/memwal` 0.1.8, mainnet, managed relayer `https://relayer.memory.walrus.xyz`.
- Model: `google/gemini-2.5-flash` via OpenRouter, Vercel AI SDK for streaming.
- Hosting: Vercel.
- Secrets are already here as `.env.local` (copied from the old repo's `.env`): `OPENROUTER_API_KEY`, `MEMWAL_KEY`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_SERVER_URL`. `.gitignore` covers it. Never commit.

## Memory design

- **One relayer account, one namespace per user.** Namespace = `pickup-<memory code>`. Memory code is a random 12-char id generated on first visit, stored in a cookie and shown in the UI so it can be typed into another device.
- **Write path:** after the reply streams, send the turn to `analyze` (the stock fact extractor), fire and forget from the user's view. Writes take 20 to 30 s on mainnet, so show a small "saving to Walrus" state that turns to "saved" when the job is done. Never block the next message on it.
- **Read path:** `recall({ query: <last user message>, limit: 5, namespace, sort: "recent" })`, then put the hits into the system prompt as "What you know about this user". Abort the recall at 8 s and answer without memory rather than hang (the relayer's p50 is reported around 9 s; show a "checking memory" state).
- **Hand-added facts:** `rememberAndWait(text, namespace)`.
- **Known traps, handle each with one line of code or one line of docs:**
  - Job `done` is not yet recallable (index lag): when the user just saved a fact, also keep it in client state for the next prompt.
  - No write dedupe: skip `analyze` on turns under about 8 words and on turns the user typed as a question only.
  - Turns over 16 KB silently produce no memories: cap the saved text at 12 KB and say so.
  - Rate limit about 30 weighted requests a minute: queue writes, one at a time per user.
  - Recall has no recency guarantee by default: use `sort: "recent"`.
  - Confirm package IDs from live `GET /config`, never from docs.

## System prompt (draft)

> You help people build on Walrus and Sui. Below is what you already know about this user from earlier sessions. Use it silently: do not ask for facts you already have, and do not recite the list. If a fact looks outdated or the user contradicts it, trust the user and say what changed. If you do not know a Walrus or Sui detail, say so.

## Reusable from `../` (copy, do not import)

| Need | Take from |
|---|---|
| MemWal client setup, env loading | `scripts/p0-memwal.mjs`, `scripts/env.mjs` |
| OpenRouter call, timeout, cache | `src/proposer/client.ts` |
| Chat route and streaming shape | `app/api/chat/route.ts`, `src/server/reply.ts` |
| Design tokens (SIGNAL DECK: flat blue-black, one mint-teal accent, no glass, no violet) | `styles/tokens.css`, `docs/DESIGN.md` |
| Per-user rate limit | `src/server/ratelimit.ts` |
| Headless-Chrome driver with planted controls | `scripts/ui-drive.mjs` |

## Build order

1. **Hour 0: scaffold and smoke.** New Next app in this folder, copy env, one script that does remember, recall and a Gemini call. Same three checks as the old Phase 0, all already known to work.
2. **Thin path.** Chat with recall before the answer and `analyze` after. Test: tell it a fact, open a new browser profile, type the memory code, ask about the fact.
3. **"Memories used" and "Remember this".** The visible memory integration.
4. **UI pass** with `ui-studio`, SIGNAL DECK, one signature moment (the memory chips landing under a reply). Drive a real browser and screenshot it; measure contrast; no claims from greps.
5. **Deploy to Vercel** (needs your `vercel login`). Run the full journey from a clean browser on the live URL.
6. **Real use, several days.** Post the invite in the Walrus and Sui channels and in one outside community for the Promo prize. Log honest counts in `evidence/usage.md`; your own traffic is not adoption. Collect at least three before/after stories.
7. **Package.** Article, ~2 minute video, X post tagging @WalrusProtocol with #WalrusMemory, README, form. Drafts already exist in `walrus-sessions-8/submission/` (article, video script, posts, checklist); rewrite them for Pickup.

## Clock

| Date | Milestone |
|---|---|
| Oct 1 | Steps 1 and 2 done |
| Oct 2 | Step 3 and 4 done, deployed |
| Oct 3 | Invites posted, real use starts |
| Oct 3 to 7 | Real use runs, bug fixes only |
| Oct 7 | Article and video recorded |
| Oct 8 | Internal submit |
| Oct 9 14:00 UTC | Hard deadline |

Days left are not a reason to shrink the idea; they are listed as a fact.

## Docs the judges read (keep short)

README: what it is, how memory is integrated (the three paths above), a before/after from a real second session, real-use counts, known limits, run command. Status vocabulary: LIVE / NEXT / NOT LIVE. Every number traces to a file or says "unmeasured".

## Bug bounty lane (separate, already done)

Three drafted reports for MystenLabs/MemWal are in `walrus-sessions-8/submission/BUG_REPORT.md` with repros in `walrus-sessions-8/submission/bug-repro/`. They are independent of this product. Re-run the dedupe search, run the PGlite test for report 2, humanizer pass, then you file. Pickup does not touch them. One bug and one improvement idea also go on the walform entry.

## Risks

| Risk | Fallback |
|---|---|
| Few outside users | Direct outreach in the event Discord; record the shortfall honestly |
| Relayer slow or down (check `/health`) | Answer without memory, say so in the UI |
| Relayer wallet runs out of WAL or gas | Check balance daily; top up |
| Gemini over-asks or recites the memory list | Tighten the system prompt; test with the second-session journey |
| Judges' rules unknown | Read the walform rules page first thing and record weights in `NOTES.md` |
