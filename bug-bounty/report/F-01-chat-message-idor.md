# F-01 — Tool-approval flow lets any user overwrite any other user's stored chat message by id

*Mustapha Fadhlullah — independent security researcher.*
`MystenLabs/MemWal` @ `1ee7801` · `apps/chatbot` · `POST /api/chat` · Broken access control (IDOR write) · **High**

## Summary

The chatbot's `POST /api/chat` handler has a "tool-approval" branch, selected purely by request shape
(`isToolApprovalFlow = Boolean(messages)`). In that branch the stream's `onFinish` persists results by
calling `updateMessage({ id, parts })` for every returned message whose id already appears in the
caller-supplied `messages` array. `updateMessage` filters on the message id **only** — it never checks that
the message belongs to the caller's chat or user:

```ts
// apps/chatbot/lib/db/queries.ts
export async function updateMessage({ id, parts }: { id: string; parts: DBMessage["parts"] }) {
  return await db.update(message).set({ parts }).where(eq(message.id, id)); // no chatId / userId scope
}
```

```ts
// apps/chatbot/app/(chat)/api/chat/route.ts  (onFinish, tool-approval branch)
const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
if (existingMsg) {
  await updateMessage({ id: finishedMsg.id, parts: finishedMsg.parts }); // id taken from attacker input
}
```

Because the AI SDK echoes the caller's `originalMessages` back through `onFinish`, an attacker fully controls
both the `id` and the `parts` written. Sending a crafted `messages` array whose first element carries a
**victim's** message id and attacker-chosen `parts` overwrites that victim's stored message content — in the
victim's own chat — while the request's `id` points at a chat the attacker legitimately owns (so the one
ownership check in the route, `chat.userId === session.user.id`, passes).

The request schema does not stand in the way: the approval-flow element is `{ id: z.string(), role:
z.string(), parts: z.array(z.any()) }` — any string id, any parts.

## Impact

Any authenticated user (including a **guest** session, which the app issues freely) can rewrite the stored
content of any other user's chat message, given that message's id. The forged content persists and is served
back to the victim and to anyone viewing the chat. This is stored cross-user tampering of conversation
history — the same "read / write / ownership-hijack" class the project rated worth fixing in #516/#517 for
documents, here on the `Message_v2` table.

**Id-disclosure vector (makes it practical, not blind).** Message ids are UUIDv4, not guessable, but a
**public/shared chat discloses them**: `app/(chat)/chat/[id]/page.tsx` renders a non-private chat to any
visitor (`isReadonly={session?.user?.id !== chat.userId}`) and ships the full message rows, ids included, via
`initialMessages`. An attacker opens a victim's shared chat, reads the ids, then overwrites those messages.

## Preconditions

- An authenticated session (guest sign-in is enough).
- Knowledge of the target message id — obtained from any public/shared chat, or from any other id-disclosing
  surface.

No admin role, no key material, no privileged endpoint. Attacker funds the request with nothing but a normal
session.

## Proof of concept

`poc/poc.test.ts`, describe block **A**, drives the unmodified `route.ts` + `queries.ts` against real
`ai@6.0.37` and a real Postgres engine (PGlite + the repo migrations). Planted controls prove the harness is
honest:

- **Control 1:** the victim message reads `VICTIM ORIGINAL ANSWER` before the attack.
- **Control 2:** posting with `id = victimChat` returns **403** (the chat-ownership boundary works), and the
  victim message is unchanged — so the boundary genuinely exists.
- **Control 3:** an approval request carrying a *random* id changes nothing — so the overwrite is caused by
  the victim's id, not by the request shape.
- **Attack:** the same approval request carrying the *victim's* message id overwrites it.

Observed on unmodified code (`poc-output-vulnerable.txt`):

```
[A] victim message <uuid> in chat <victim-chat-uuid> now reads: "ATTACKER CONTROLLED TEXT"
✓ the attacker rewrites the victim's stored message through the attacker's own chat
✓ the request schema accepts it: messages[].id is any string and parts are z.any()
```

The row's `chatId` is still the victim's chat; only the content changed — confirming a cross-chat,
cross-user write.

## Fix

Scope the update to the chat being written, and pass that chat id from the route (the handler already has it
as `id`, already ownership-checked). Diff: `report/fix-A-scope-updateMessage.patch`.

```ts
export async function updateMessage({ id, chatId, parts }: { id: string; chatId: string; parts: DBMessage["parts"] }) {
  return await db.update(message).set({ parts })
    .where(and(eq(message.id, id), eq(message.chatId, chatId)));
}
// route.ts onFinish: updateMessage({ id: finishedMsg.id, chatId: id, parts: finishedMsg.parts });
```

**Fix verified:** applying the patch to the scratch copy and re-running PoC-A flips the attack assertion —
the victim message stays `VICTIM ORIGINAL ANSWER` (captured in `poc-output-patchedA.txt`), while controls
and both F-02 tests still pass. Defense-in-depth: the route could additionally re-assert that each
`finishedMsg.id` already belongs to chat `id` before writing, mirroring the call-site re-check added in #517.
