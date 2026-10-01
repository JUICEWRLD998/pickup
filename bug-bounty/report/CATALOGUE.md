# MemWal — security findings catalogue

*Mustapha Fadhlullah — independent security researcher.*
Target: `MystenLabs/MemWal` @ commit `1ee7801` (fetched 2026-10-01). Event: Walrus Sessions 8 — Bug Bounty.

Two reproducible defects in the shipped example app `apps/chatbot`, both in the `POST /api/chat` route
handler. Each is proven by a PoC that drives the **byte-identical, unmodified** route and queries against the
real `ai@6.0.37` SDK and a real Postgres engine (PGlite running the repo's own migrations). Nothing in the
route or the DB layer is patched for the proof; only the trust boundary (session, language model, unrelated
helpers) is stubbed.

| # | Title | Surface | Class | Severity | Status |
|---|---|---|---|---|---|
| F-01 | Tool-approval flow overwrites any user's stored chat message by id (IDOR write) | `apps/chatbot` `POST /api/chat` → `updateMessage` | Broken access control / stored tampering | High | Not reported (deduped) |
| F-02 | Hourly message limit is bypassed by sending `messages` instead of `message` (unmetered generations) | `apps/chatbot` `POST /api/chat` | Rate-limit / quota bypass | Medium | Not reported (deduped) |

## Scope note

`apps/chatbot` is a first-party app in the audited repo, deployed as a live demo. The maintainers have
accepted and fixed many security bugs **in this exact app** (e.g. #516/#517 document IDOR, #111 HIGH-10 chat
server-action ownership, #857 getSuggestions cross-user, #937 vote cross-chat, #598 memory isolation,
#776/#784/#786). Chatbot security bugs are therefore in-scope by established precedent.

## Dedup — checked against all 1000 issues + PRs (open and closed), API-pulled 2026-10-01

Both findings are in the **IDOR / access-control family the project already recognises**, but each specific
sink below is **unaddressed** in the current tree.

| Neighbour | What it covered | Why F-01/F-02 are distinct |
|---|---|---|
| #516 / #517 | `updateDocument` / `requestSuggestions` AI tools resolved a **Document** by id with no owner check. Fixed by owner-scoped query + deleting the unscoped getter. | Different resource (`Document`) and code path (AI tools). `updateMessage` (the `Message_v2` sink in the chat route's `onFinish`) was never touched — still `where(eq(message.id, id))`. |
| #111 (HIGH-10) | Added ownership checks to `deleteTrailingMessages` and `updateChatVisibility` in `actions.ts`. | Different functions, different file. The tool-approval `onFinish` → `updateMessage` write in `route.ts` is not covered. |
| #937 / #945 | `PATCH /api/vote` cross-chat vote row; scoped the vote lookup to the chat. | `Vote` table. Unrelated to message content tampering. |
| #857 / #824 | `getSuggestions` returned another user's suggestion text; scoped to caller. | Read-only, `Suggestion` table. |
| #598 / #587 | Chatbot used one shared memory namespace; isolated per user. | Memory namespace, not chat-row access control. |
| #840 / #775 | No rate limit on unauthenticated guest **user-row creation**. | Different limiter (account creation), not the per-user hourly message entitlement. |
| #360 / #361 | X-Forwarded-For spoofing bypassed per-IP limiter on MCP routes. | Different limiter and route; F-02 is the per-user DB-count limiter in the chatbot. |

No issue or PR mentions `updateMessage`, `isToolApprovalFlow`, the `onFinish` persistence path, or the
`messages`-vs-`message` request-shape split. Search terms run against the GitHub search API and the full
local corpus: `updateMessage`, `isToolApprovalFlow`, `tool approval`, `maxMessagesPerHour`,
`getMessageCountByUserId`, `messages array`, `rate limit bypass chatbot`, `overwrite message another user`.

## Reproduce

```
cd poc
npm install              # pins ai@6.0.37, drizzle-orm, @electric-sql/pglite, vitest, zod
npx vitest run --reporter=verbose
```

`poc/poc.test.ts` copies six repo files verbatim (sha256 equality asserted in the prepare log) and runs them.
Captured run on unmodified code: `poc-output-vulnerable.txt`.

## Disclosure channel — decision needed

`SECURITY.md` says: report by email to **security@mystenlabs.com**, and **"Do not report security issues
through GitHub or Discord."** The Sessions-8 Bug-Bounty bucket instead asks for "a reproducible bug on
GitHub." These conflict. No report has been sent anywhere. Awaiting your call on channel before any send.
