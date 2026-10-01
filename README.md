# Pickup

**A Walrus and Sui help chatbot that picks up where you left off.** Tell it your stack, your error or your decision once. Next day, from any device with your memory code, it already knows.

*Mustapha Fadhlullah — independent security researcher.* Built for Walrus Sessions 8, "Chatbots That Remember".

## Status

| Piece | Status |
|---|---|
| Chat with Gemini 2.5 Flash (OpenRouter), streamed | LIVE locally |
| Recall before each answer, save after it, on Walrus Memory mainnet | LIVE locally, verified (`evidence/p1-journey.json`, `evidence/ui/report.json`) |
| "Used N memories" under each reply, "Remember this" box | LIVE locally |
| Same memory on a second device through a memory code | LIVE locally (code survives reload; second device not tested on real hardware) |
| Deployed public URL | NOT LIVE |
| Days of real use by outside users | NOT LIVE |
| Article, video, submission | NOT LIVE |

## How memory is integrated

- **One relayer account, one namespace per user.** Namespace is `pickup-<memory code>`. The code is a random 12-character id kept in the browser and shown in the header. Typing it on another device opens the same memory.
- **Read path.** Before each answer the server calls `recall({ query, limit: 5, namespace, sort: "recent" })` with an 8 second abort. The hits go into the system prompt, newest first, with their age. If recall fails or times out, Pickup answers without memory and says so.
- **Write path.** After the reply is on screen, the browser asks `/api/save` to run the stock fact extractor (`analyzeAndWait`) on the user's message. Mainnet writes take 20 to 30 seconds, so the UI shows "Saving to Walrus" and never blocks the chat. Writes run one at a time per user. Short turns, bare questions and empty text are skipped; text over 12 KB is cut (the relayer silently drops turns over 16 KB, issue #1037).
- **Hand-added facts.** "Remember this" stores the text as written with `rememberAndWait`. The browser also keeps it for the next prompt, because a finished job is not recallable until the relayer has indexed it.
- **Corrections.** The model is told to trust the user over an older memory and to say what changed. The newest memory is listed first.
- **Not built.** Forgetting. SDK 0.1.8 has no delete method, and the relayer's forget route only removes the search index (per its docs).

## Run it

```
npm ci
cp .env.example .env.local     # OPENROUTER_API_KEY, MEMWAL_KEY, MEMWAL_ACCOUNT_ID
npm run smoke                  # relayer health, one remember+recall, one Gemini call
npm run dev                    # http://localhost:3000
```

Checks: `npm run verify` (type check and 18 tests, no keys needed). With keys and the app running (`npm run build && npx next start -p 3200`): `E2E_BASE=http://localhost:3200 npm run journey`, then `node scripts/ui-drive.mjs` (headless Chrome).

## Evidence (all small samples, one account, one relayer)

- Phase 0 smoke on mainnet: write 36 s, recall 2.8 s, Gemini 1 s (`evidence/p0.json`).
- Phase 1 journey: a fact told in session A is recalled in a brand-new session with the same code; a different code does not see it; a hand-added correction is used (`evidence/p1-journey.json`).
- UI, driven in headless Chrome: the same journey through the real page, 5 widths with no overflow (and a planted 2000 px control that is detected), measured text contrast at least 4.5:1, no page errors (`evidence/ui/report.json`).

## Known limits

- Writes are slow (20 to 30 s on mainnet). A fact you just told is available in the same tab at once but may take a short while to be recallable from another device.
- The fact extractor is the stock Walrus Memory one. It keeps what it judges durable and can drop or rephrase things.
- The memory code is the only key. Anyone who has it can read that memory. It is not an account.
- Do not paste secrets. Memories on Walrus cannot be deleted one by one, so anything stored stays stored.
- No real-user data yet.
