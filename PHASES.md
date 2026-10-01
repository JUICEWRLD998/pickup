# Pickup: phases

*Mustapha Fadhlullah — independent security researcher.* Deadline Fri 2026-10-09 14:00 UTC. Internal submit Oct 8. You press submit; nothing is posted or sent without your go.
Design and memory rules: `implementation.md`. Tick a box only when its exit check has run.

## Phase 0: Scaffold and smoke (Oct 1)

- [x] `git init`, set identity, first commit. `npm create next-app` (App Router, TypeScript, no Tailwind). Add `@mysten-incubation/memwal@0.1.8`, `@mysten/sui`, `@mysten/seal`, `@mysten/walrus`, `ai`, `zod`, `motion`.
- [x] `.env.local` is in place (copied from the old repo). `.gitignore` covers it.
- [x] `scripts/smoke.mjs`: `health`, one `rememberAndWait` plus `recall` in a throwaway namespace, one Gemini 2.5 Flash call via OpenRouter. Copy from the old `scripts/p0-memwal.mjs`, `scripts/p0-openrouter.mjs`.
- [x] Read the walform rules page (judges, weights, region exclusions, "Beyond the Big Two" wording). Write it to `NOTES.md`.
- **Exit:** smoke script prints three green lines. Evidence saved to `evidence/p0.json`.

## Phase 1: Thin path (Oct 1 to 2)

- [x] Memory code: random 12-char id, cookie, shown in the UI, accepted from a text box.
- [x] `POST /api/chat`: recall (8 s abort, `sort: "recent"`, limit 5) then stream Gemini with the memories in the system prompt.
- [x] Save path: after the reply, `analyze` the turn in the background; queue one write at a time per user; skip turns under about 8 words; cap saved text at 12 KB.
- [x] Saving state in the UI: "saving to Walrus", then "saved".
- **Exit (the journey):** tell it a fact in browser A. Open a clean profile, enter the memory code, ask about the fact. It answers from memory without asking again. Save the transcript and timings to `evidence/p1-journey.json`.

## Phase 2: Visible memory (Oct 2)

- [x] "Used N memories" line under each reply, expandable, with text and age.
- [x] "Remember this" box (`rememberAndWait`); the new fact is kept in client state until it is recallable (index lag).
- [ ] Contradiction case: user changes a fact; the newer one wins and the reply says what changed.
- **Exit:** the three cases above pass in a driven browser, screenshots saved.

## Phase 3: UI (Oct 2)

- [ ] Run `ui-studio`. House look: SIGNAL DECK (flat blue-black, one mint-teal accent, no glass, no violet, no Tailwind). Tokens from the old `styles/tokens.css`.
- [ ] One signature moment: memory chips landing under a reply. Reduced-motion fallback.
- [ ] Drive Chrome over CDP. Measure contrast in writing. Check 320, 375, 768, 1280 px. A grep or a build exit code is not verification.
- **Exit:** screenshots in `evidence/ui/`, scorer run, no overflow, no console errors.

## Phase 4: Deploy (Oct 2 to 3)

- [ ] You run `vercel login`. Set the three env vars on Vercel.
- [ ] Per-user rate limit and a daily spend cap on the OpenRouter key so strangers cannot run up the bill.
- [ ] Run the Phase 1 journey on the live URL from a clean browser.
- [ ] `/api/health` and a daily check of relayer `/health` and the WAL and gas balance.
- **Exit:** live URL, journey evidence with blob or tx ids.

## Phase 5: Real use (Oct 3 to 8)

- [ ] Draft the invite (Walrus and Sui channels) and one post for an outside community (the Promo prize; X and Sui or Walrus channels do not count). Drafts only until you say send.
- [ ] `evidence/usage.md`: sessions, distinct users, messages, memories written, recalls that helped. Own and test traffic counted separately and not as adoption.
- [ ] At least three before/after stories from outside people (a second session that skipped the setup questions). A simulated persona is not a participant.
- **Exit:** counts, dates and method written down. Shortfalls stated plainly.

## Phase 6: Bug bounty lane (parallel, yours to file)

- [ ] Three reports are drafted in `C:\Users\fadhm\Desktop\walrus-sessions-8\submission\BUG_REPORT.md`.
- [ ] Before filing: re-run the dedupe search, run the PGlite test for report 2, humanizer pass.
- [ ] One bug and one improvement idea go on the walform entry.

## Phase 7: Package (Oct 6 to 8)

- [ ] README: what it is, how memory is integrated (recall, save, hand-add), a real before/after, real-use counts, known limits, run command, LIVE / NEXT / NOT LIVE list.
- [ ] Article (Medium or Inkray), humanizer pass, byline `Mustapha Fadhlullah — independent security researcher`. Rewrite the old drafts in `walrus-sessions-8/submission/` for Pickup.
- [ ] Video, about 2 minutes: opens on the second-session recall, wow by 0:30, real product, captions, ends on live URL and proof.
- [ ] X post tagging @WalrusProtocol with #WalrusMemory. Draft only.
- **Exit:** every claim traces to a file, or says "unmeasured".

## Phase 8: Submit (Oct 8)

- [ ] Judge's path on the live URL from a clean browser: empty message, a 20 KB paste, relayer timeout, mobile width.
- [ ] Pre-submit grep: `mock|fake|dummy|lorem|0x0000|picsum|randomuser|example.com`. Justify every hit.
- [ ] Walform entry: repo, live URL, model (`google/gemini-2.5-flash`), article, X post, video, one bug, one improvement idea.
- **Exit:** you press submit.

## Cut order if time slips

1. Contradiction handling polish.
2. Signature motion beyond the basic version.
3. Video polish (a clean screen recording with captions is enough).

Never cut: the thin path, the live deploy, real use, the article.
