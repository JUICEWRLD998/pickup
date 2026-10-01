# I built a chatbot that remembers me across devices. Here's what nobody tells you about doing that on Walrus.

*Mustapha Fadhlullah — independent security researcher.*

<!-- DRAFT for Medium or Inkray. Not posted. Fill every [BRACKET] before posting. Remove this comment and the one below. -->
<!-- Rule: nothing in this article may claim more than a file in evidence/ supports. The "Real use" section stays blank until real use exists — do not fill it with guesses. -->

I ask the same Walrus SDK chatbot the same question twice, a week apart, from two different
browsers. The first time I explain my stack: Next.js 16, mainnet, the 429 errors I keep hitting on
`remember()`. The second time, from a browser that has never seen me, I type a 12-character code and
ask "what framework and network am I on, and what error am I hitting?"

It answers correctly. No re-explaining. That's the entire pitch for Pickup, and it's also the
smallest possible way to find out that "a chatbot with memory" is a much harder engineering problem
than it sounds.

## The idea is one sentence. The hard part is everything after it.

Pickup is a Walrus and Sui builder-support chatbot that remembers your project across sessions and
devices. Tell it your stack, an error, a decision — once. It's built on `@mysten-incubation/memwal`
0.1.8 against the managed relayer, writing and reading encrypted memory blobs on Walrus, mainnet, for
real, not a local mock.

That sentence is the whole product. What it doesn't say is how much of building it was fighting the
gap between "the SDK docs describe a write" and "a write is actually durable, recallable, and under
budget."

## Three paths, three different kinds of slow

**Recall** happens before every answer. The server calls `recall({ query, limit: 5, namespace, sort:
"recent" })` and puts the hits into the system prompt. In testing this takes anywhere from under a
second to several seconds (`evidence/p0.json`: 2.8s for one empty-namespace probe). An 8-second abort
means Pickup never hangs waiting for memory — it answers anyway and says it answered blind.

**Save** happens after the reply is already on screen, because a mainnet write took 36 seconds in my
own smoke test (`evidence/p0.json`). Thirty-six seconds is an eternity to hold a chat response
hostage to. So the save is fire-and-forget from the user's point of view: a small "Saving to Walrus"
state that turns into "Saved: N memories" whenever the job actually lands — which could be well after
the user has already asked a follow-up question.

**Hand-added facts** ("Add a fact") use `rememberAndWait` and feel instant, except they aren't
recallable the moment they return. The relayer needs a short indexing window after a job reports
done. I learned this by watching a fact I'd just saved get *silently skipped* on the very next
recall, and the fix wasn't in any doc — it was keeping the fact in client state until I saw it come
back from the server on its own.

None of this is a complaint about Walrus Memory. It's the actual shape of building on infrastructure
that's honest about its own latency instead of a benchmark slide.

## The receipt is the product

The one feature I'd point a judge at first isn't the chat. It's the line under every reply: *"Used 2
memories"*, expandable, each one with its actual text and how old it is. Click it and you see exactly
which facts from six sessions ago shaped the answer you just got.

I built this because I didn't trust my own recall calls. If a chatbot claims to remember you and you
can't verify what it actually pulled, you're trusting a black box with your project context. The
receipt turns "it remembers you" from a claim into something you can audit, turn by turn.

## What breaks when you try to make this real

Writing the thin path — chat, recall, save — took about a day. Making it *honest* took longer:

- The relayer silently drops any turn over 16 KB (this is a known upstream behavior, not a Pickup
  bug — tracked as issue #1037 against the SDK's host repo). Pickup caps saved text at 12 KB and
  says so, rather than let a long message vanish without explanation.
- A finished save job isn't instantly recallable — index lag, not a bug, just a property of the
  system you have to design around.
- Corrections needed an explicit instruction: the model is told to trust the newest memory over an
  older one and say what changed, because nothing in the recall payload does that for you by default.

None of these are secrets. They're the kind of thing you only learn by actually shipping against a
real mainnet relayer instead of stopping at "the demo worked once."

## What I actually measured

- **Phase 0 smoke, mainnet:** relayer health check 991ms, one `rememberAndWait` 36.1s, one `recall`
  2.8s, one Gemini 2.5 Flash call 959ms at $0.0000046 (`evidence/p0.json`).
- **Phase 1 journey, mainnet:** a fact told in session A is recalled in a brand-new session with no
  shared chat history, using the same memory code; a *different* code sees nothing; a hand-added
  correction gets used in the next answer (`evidence/p1-journey.json`).
- **UI, driven in a real headless browser, not inferred from a grep:** the same journey rendered at 8
  widths from 320px to 1920px, zero horizontal overflow, text contrast measured at 4.5:1 or above,
  zero console errors, a planted 2000px control that the overflow probe correctly catches
  (`evidence/ui/report.json`).

What I have *not* measured yet, and won't pretend I have: real outside usage. This is a draft written
before deployment.

## Real use

<!-- FILL AFTER REAL USE. Until then this section stays exactly as written — do not invent numbers. -->

- Days live: **[N]**
- Distinct outside users: **[N]**
- Messages sent / memories written / recalls that visibly helped: **[N] / [N] / [N]**
- One real before/after: a stranger's second session, on a different day, that skipped re-explaining
  their setup because Pickup already knew it. **[quote, with permission]**

## What it doesn't do, on purpose

No accounts, no auth, no payments — a memory code is the entire identity model, and that's a tradeoff
stated plainly, not hidden. There's no forgetting: SDK 0.1.8 has no delete method, and the relayer's
`forget` route only drops the search index, not the underlying blob, per its own documentation. I'd
rather say "don't paste secrets" in the UI than ship a delete button that doesn't actually delete.

## One more thing I found along the way

Building on `@mysten-incubation/memwal` meant reading its host repo closely enough to notice two
access-control bugs in its example chatbot app — one letting any authenticated user overwrite another
user's stored message, the other letting the per-user rate limit be bypassed entirely by sending the
request in a different shape. Both reproduced against the real, unmodified code with a proof of
concept, both deduped against the full issue tracker, one with a verified one-line fix. Full writeup:
[`bug-bounty/`](bug-bounty/) in the repo. Unrelated to Pickup's own code — just what you find when you
read infrastructure carefully instead of only consuming it.

## Try it

```
npm ci
cp .env.example .env.local
npm run smoke        # three real checks against mainnet: relayer health, one write+read, one model call
npm run dev
```

`npm run verify` runs the type check and 18 unit tests with no keys and no network.

Repo: **[REPO URL]**. Live: **[LIVE URL, not deployed yet]**.

Built for Walrus Sessions 8, "Chatbots That Remember."
