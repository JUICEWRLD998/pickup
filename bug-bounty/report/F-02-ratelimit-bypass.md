# F-02 — Hourly message limit bypassed by using the `messages` request shape (unmetered model generations)

*Mustapha Fadhlullah — independent security researcher.*
`MystenLabs/MemWal` @ `1ee7801` · `apps/chatbot` · `POST /api/chat` · Rate-limit / quota bypass · **Medium**

## Summary

`POST /api/chat` enforces a per-user hourly cap:

```ts
// route.ts
const messageCount = await getMessageCountByUserId({ id: session.user.id, differenceInHours: 1 });
if (messageCount > entitlementsByUserType[userType].maxMessagesPerHour) {   // 30/hr for guest and regular
  return new ChatbotError("rate_limit:chat").toResponse();
}
```

`getMessageCountByUserId` counts stored rows with `role = 'user'`:

```ts
// queries.ts
.where(and(eq(chat.userId, id), gte(message.createdAt, cutoff), eq(message.role, "user")))
```

The count is only ever incremented by the **single-message** path, which persists the inbound user turn:

```ts
// route.ts — runs ONLY when `message` (singular) is present
if (message?.role === "user") { await saveMessages({ messages: [{ ...role: "user"... }] }); }
```

In the **tool-approval** path the client sends `messages` (array) and omits `message`, so that `saveMessages`
never runs; `onFinish` then persists only the model's returned (assistant/tool) rows, none of which is
`role = 'user'`. The approval path is selected by request shape alone (`isToolApprovalFlow = Boolean(messages)`)
with no server-side check that a tool approval is actually pending. Result: a client that always sends
`messages: [userTurn]` instead of `message: userTurn` receives a full model generation every time, and the
hourly counter stays at zero — the limit never trips.

## Impact

Unmetered, unauthenticated-tier abuse of the paid LLM backend (and the memory recall/save it drives): a single
guest can run unlimited generations per hour against the `30/hr` entitlement. This is a cost-amplification /
economic-DoS primitive — each bypassed request is a billable model call funded by the operator, not the
attacker. Guest sessions are issued freely, so there is no account cost to the attacker either.

## Preconditions

- An authenticated session (guest is enough).
- Send the normal chat payload under the key `messages` (array) instead of `message`.

## Proof of concept

`poc/poc.test.ts`, describe block **B**, against the unmodified route + queries + real `ai@6.0.37` + PGlite:

- **Baseline control (normal flow):** sending `message` (singular) repeatedly, the limiter refuses once 30
  user rows are stored — request 32 returns **429**, and that refused request never reaches the model. This
  proves the limiter works and is wired to the model call. (The 30→32 off-by-one is because the check is
  `count > max` and runs before the current turn is saved; noted, not the finding.)
- **Bypass (approval flow):** sending `messages: [userTurn]` 45 times — all 45 return **200**, the mock model
  is invoked **45** times, and `getMessageCountByUserId` reports **0**.

Observed on unmodified code (`poc-output-vulnerable.txt`):

```
[B] normal flow: request 32 -> HTTP 429
✓ the limiter refuses once 30 are stored (request 32)
[B] approval flow: 45 requests -> statuses 200; model calls 45; counted by the limiter 0
✓ 45 requests all reach the model and the counter stays at 0
```

45 > 30 generations served to one guest in one window, none counted.

## Fix

The limit must gate every generation, not only turns that happen to land a `role = 'user'` row. Options, in
order of preference:

1. **Count the generation, not the row.** Increment a per-user hourly counter (Redis or a dedicated table) at
   the top of `POST` for **both** flows, and check that — independent of what later gets persisted.
2. **Constrain the approval path.** Treat `isToolApprovalFlow` as valid only when the referenced `messages`
   already belong to the caller's own chat `id` (verified against the DB). This both meters the path and
   closes the fabricated-array abuse (and narrows F-01's blast radius).

A request-shape flag must never select an unmetered code path. (This remediation is described, not
harness-verified — unlike F-01's fix, which is confirmed to flip its PoC.)
