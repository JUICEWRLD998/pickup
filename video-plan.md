# Video plan — Pickup demo, ~2:00

*Mustapha Fadhlullah — independent security researcher.*

Nothing recorded yet. This is the shot list, exact clicks, and recording checklist. Follow it in
order; don't improvise the script live.

## Before you hit record

- [ ] Deploy is live (Phase 4). Record on the **live URL**, not localhost — judges should see it's
      real, not a dev server.
- [ ] Close every other tab/app. Mute notifications (Windows: Focus Assist on).
- [ ] Use a **clean browser profile** (or a fresh incognito/private window) for the "second session"
      shot — this is the whole proof, and it has to be visibly a browser that's never seen you before.
- [ ] Pick a screen-recording tool with captions, or plan to burn captions in afterward
      (e.g. OBS + manual captions, or a tool that auto-captions). Captions are required — most viewers
      watch muted.
- [ ] Have two real facts ready to type, written down so you don't fumble live:
      1. First session: `"I'm building a Walrus Sites app on mainnet with Next.js 16, and my remember() calls keep returning 429 errors."`
      2. Second session question: `"Which framework and network am I on, and what error am I hitting?"`
- [ ] Do a full dry run once, silently, before the take you'll keep. Time it — if it's over 2:15, cut
      from the "known limits" beat first (see Cut order below), not from the recall proof.
- [ ] Record a backup take. Screen recordings fail in dumb ways (wrong window captured, mic muted).

## Shot list

| Time | On screen | Say (or caption) | Exact action |
|---|---|---|---|
| 0:00–0:08 | Pickup welcome screen, empty state, memory code visible in the header | "Most chatbots forget you the second you close the tab. This one doesn't." | Load the live URL fresh |
| 0:08–0:20 | Type the first fact into the composer | "I'll tell it what I'm building, once." | Type fact 1, hit Send |
| 0:20–0:35 | Reply streams in; "Saving to Walrus" status appears under the composer | "It answers normally — and in the background, it's writing this to Walrus Memory. Real mainnet, takes 20 to 30 seconds." | Wait for "Saved: N memories" to appear |
| 0:35–0:45 | Click "Copy code" on the memory code card | "This code is the only thing that links me to my memory. No login." | Click Copy code |
| 0:45–0:55 | Open a **new private/incognito window**, paste the URL | "New browser. Never seen this before." | Open private window, navigate to live URL |
| 0:55–1:05 | On the new window: paste the memory code into "Use another code", submit | "I give it the code — not my identity, just the code." | Paste code, click Open |
| 1:05–1:15 | Welcome-back screen loads with the real stored memory shown | "And it already knows what I told it a week ago." | Let the welcome screen render fully — this is the money shot, hold on it |
| 1:15–1:35 | Ask the second-session question; reply streams in | "Ask it anything — it picks up from where I left off." | Type the question, Send, wait for full reply |
| 1:35–1:50 | Click "Used N memories" under the reply to expand it | "And it shows its work — exactly which memories it used, and how old they are. Not a black box." | Click the receipt, let it expand |
| 1:50–2:00 | Cut to README or terminal: `npm run verify` passing, or the evidence folder | "Every claim in this video is backed by a file in the repo. Link below." | Show `npm run verify` green, or `evidence/` folder listing |

Last frame (hold 2–3s): live URL + repo URL on screen, large and readable.

## Cut order if you're over time

1. Cut the "Used N memories" expand-click (1:35–1:50) down to just a quick flash — the receipt text
   is still visible in the reply, you just don't need to narrate the click.
2. Cut the terminal/evidence close at the end to a single still frame with URLs, no narration.
3. Never cut the second-session recall (0:45–1:15) — that is the entire proof. If the video is too
   long, it should be the last thing standing, not the first thing cut.

## Technical recording notes

- Record at 1920×1080 or 1280×720, 30fps is plenty for a screen capture.
- If your terminal/browser chrome has personal info (real email, real file paths with your name) in
  a visible spot, either crop it out or use a masked/demo profile — don't put your home directory
  path on screen by accident.
- Export captions as burned-in text, not a separate .srt — most platforms (X, LinkedIn, Medium
  embeds) don't reliably show external caption files.
- Keep the final file under whatever size cap the platform you're posting to enforces (X videos:
  check current limit before export).

## After recording

- [ ] Watch the full take once without touching anything — does the pacing match the shot list, is
      every click visible, is text legible at 100% zoom on a phone-sized preview?
- [ ] Re-check: does anything in the video show a secret, a real private key, or any text you
      wouldn't want public? (You're a security researcher — this is the one video where that check
      actually matters.)
- [ ] Save the final export to `evidence/video/` alongside a one-line note of the exact URL and date
      recorded, so "what you see in the video" stays traceable to a real run.
