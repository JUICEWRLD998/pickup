# Bug bounty lane — MemWal findings

*Mustapha Fadhlullah — independent security researcher.*

Separate from Pickup itself. While building Pickup on `@mysten-incubation/memwal`, I audited the
SDK's host repo, `MystenLabs/MemWal`, and found two reproducible defects in its example chatbot app.
Neither touches Pickup's own code — this folder is the disclosure package for the Walrus Sessions 8
bug-bounty track.

- **`report/CATALOGUE.md`** — index, severity, dedup evidence against all 1000 issues/PRs in the
  tracker (both open and closed).
- **`report/F-01-chat-message-idor.md`** — High. Any authenticated user (guest included) can
  overwrite another user's stored chat message by id.
- **`report/F-02-ratelimit-bypass.md`** — Medium. The hourly message cap never counts requests sent
  in the "tool approval" shape, so it is unmetered.
- **`report/fix-A-scope-updateMessage.patch`** — the one-line fix for F-01, verified to flip the PoC.
- **`poc/`** — the proof-of-concept test. It drives the real, unmodified `MystenLabs/MemWal` route
  handler (sha256-checked against the live repo) against a real Postgres engine (PGlite) and the
  real `ai@6.0.37` SDK; only the session and the language model are stubbed.
- **`poc-output-vulnerable.txt`** — the PoC run against unmodified code (both bugs fire).
- **`poc-output-patchedA.txt`** — the PoC run after applying the F-01 patch (the attack fails, the
  rest still passes).

## Reproduce

The PoC needs three files copied verbatim from `MystenLabs/MemWal`'s `apps/chatbot` (not vendored
here, to avoid shipping another project's source tree in this repo):

```
git clone https://github.com/MystenLabs/MemWal
cp -r MemWal/apps/chatbot/app        bug-bounty/poc/app
cp -r MemWal/apps/chatbot/lib        bug-bounty/poc/lib
mkdir -p bug-bounty/poc/migrations
cp MemWal/apps/chatbot/lib/db/migrations/*.sql bug-bounty/poc/migrations/
cd bug-bounty/poc
npm install
npx vitest run --reporter=verbose
```

Findings as of commit `1ee7801` (fetched 2026-10-01). Disclosure channel is still pending your
decision — see `report/CATALOGUE.md` § Disclosure channel.
