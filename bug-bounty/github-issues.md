# GitHub issues for MystenLabs/MemWal (paste-ready)

*Mustapha Fadhlullah, independent security researcher.*

File these as **two separate issues**, one per bug. They have different fixes and different severity, and
maintainers triage and close issues one at a time.

Nothing here has been sent. Read "Before you file" first.

## Before you file

1. The repo's own issue form says: *"If this is a security finding, email security@mystenlabs.com. Do not
   use this form. See our security policy."* `SECURITY.md` says the same, and adds "do not report security
   issues through GitHub or Discord." The Sessions 8 bounty bucket asks for a GitHub issue. These conflict.
   Email both findings to security@mystenlabs.com first, say you're a Walrus Sessions 8 participant, and
   ask whether a public issue is acceptable for the event. `CATALOGUE.md` already flags this as unresolved.
2. The form's fields (Surface, Network, Package version) are written for the SDK/MCP packages. Both bugs
   are in the example app `apps/chatbot`, so some fields need the closest honest answer, noted below.
3. Do not paste secrets. Nothing below contains any.
4. If you do file publicly, do F-02 first. F-01 lets anyone rewrite another user's messages — the
   maintainers already fixed the same bug class in `apps/chatbot` as #516/#517, so they may prefer advance
   notice before it's public.

---

## Issue 1 — F-01 (High)

**Title**

```
[Bug] Tool-approval flow lets any user overwrite another user's stored chat message by id
```

**Surface:** pick whichever option is closest to "chatbot app" or "other." If there is no close match,
pick "other" and name `apps/chatbot` in the first line of "What happened."

**Network:** not network-specific. Pick any option, or "n/a" if the form allows it.

**Package version**

```
No published package — apps/chatbot at MystenLabs/MemWal, commit 1ee7801 (fetched 2026-10-01).
```

**What happened?**

```
In apps/chatbot, POST /api/chat has a tool-approval branch selected only by request shape (isToolApprovalFlow = Boolean(messages)). Its onFinish calls updateMessage({ id, parts }) for every returned message whose id appears in the caller-supplied messages array. updateMessage filters on the message id alone, so any signed-in user (a guest session is enough) can overwrite another user's stored message by sending that message's id.
```

**Steps to reproduce**

```
Proof of concept drives the unmodified route.ts and queries.ts against ai@6.0.37 and a real Postgres engine (PGlite running the repo's own migrations). Only the session and the language model are stubbed.

1. Sign in as user B (guest is enough). Create chat B.
2. User A owns a chat with a stored message M. Note M's id. A shared (non-private) chat discloses message ids to any visitor through initialMessages in app/(chat)/chat/[id]/page.tsx.
3. As user B, POST /api/chat with id = chat B (so the chat-ownership check passes) and messages = [{ id: <M's id>, role: "assistant", parts: [<any parts>] }]. messages[].id is z.string() and parts is z.array(z.any()), so the schema accepts this.
4. Read message M. Its parts now hold B's content, and its chatId is still A's chat.

Controls: posting with id = A's chat returns 403, and a random message id changes nothing — so the overwrite comes from the victim's id, not from the request shape.
```

**Expected**

```
updateMessage only writes to a message that belongs to the chat the caller owns. A message id from another chat is ignored or rejected.
```

**Actual**

```
The victim's message is overwritten. Test output: [A] victim message <uuid> in chat <victim-chat-uuid> now reads: "ATTACKER CONTROLLED TEXT". The change persists and is served to the victim and to anyone viewing the chat.
```

**Logs or error text**

```
No error — the request returns 200. Suggested fix, verified to flip the proof of concept (the victim message stays unchanged):

// apps/chatbot/lib/db/queries.ts
export async function updateMessage({ id, chatId, parts }: { id: string; chatId: string; parts: DBMessage["parts"] }) {
  return await db.update(message).set({ parts })
    .where(and(eq(message.id, id), eq(message.chatId, chatId)));
}
// route.ts onFinish: updateMessage({ id: finishedMsg.id, chatId: id, parts: finishedMsg.parts });

Full write-up, proof of concept and patch: https://github.com/JUICEWRLD998/pickup/tree/main/bug-bounty
```

Tick the checkboxes only if true: the duplicate search ran against all 1000 issues and PRs (see
`report/CATALOGUE.md`), and the report has no secrets.

---

## Issue 2 — F-02 (Medium)

**Title**

```
[Bug] Hourly message limit in apps/chatbot is bypassed by sending `messages` instead of `message`
```

**Surface / Network / Package version:** same answers as Issue 1.

**What happened?**

```
In apps/chatbot, POST /api/chat caps each user at 30 messages per hour, counted as stored rows with role = 'user'. Only the single-message path (field "message") stores that row. A request that sends the same turn under the "messages" array takes the tool-approval path, stores no user row, and the counter stays at 0. The limit never trips.
```

**Steps to reproduce**

```
Proof of concept, describe block B, against the unmodified route and queries.

1. Sign in as a guest.
2. Send POST /api/chat 32 times with the normal payload, using the field "message". Request 32 returns 429, so the limiter works.
3. As a new guest, send POST /api/chat 45 times with messages: [userTurn] instead of message: userTurn.
4. All 45 return 200 and reach the model. getMessageCountByUserId reports 0.
```

**Expected**

```
The limit counts every generation, so the 31st request in an hour is refused regardless of which request shape is used.
```

**Actual**

```
Test output: [B] approval flow: 45 requests -> statuses 200; model calls 45; counted by the limiter 0. One guest gets unlimited model generations, and guest sessions are free to create, so the operator pays for every one.
```

**Logs or error text**

```
No error. Suggested fix: count the generation, not the stored row — increment a per-user hourly counter at the top of POST for both flows and check that. Alternatively, accept the approval path only when the referenced messages already belong to the caller's own chat.

Full write-up and proof of concept: https://github.com/JUICEWRLD998/pickup/tree/main/bug-bounty
```

Note for this field: the fix is described but not harness-verified by the proof of concept, unlike F-01's.
Say "suggested fix" as written above, not "verified fix."

---

## After filing

- Copy each issue's URL as soon as GitHub assigns it.
- Put both URLs in `report/CATALOGUE.md` under a new "Filed" line, replacing "Not reported (deduped)" in
  the status column.
- Use both issue URLs in the bug-bounty field of the walform submission.
