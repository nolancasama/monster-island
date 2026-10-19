# Monster Island

A 3D English adventure for Japanese elementary school students (grades 3–6,
beginners). Explore a tropical island, find monsters, ask them what they like,
make friends, and use their powers to open the way.

**Phase 1 (this build): the Beach.** Professor Maple, the Monster Journal,
Leafy and Bubbo, two obstacles and the Monster Stone ending.

English used in Phase 1:

- "It's green." / "It's blue." — describe a new monster for the journal
- "Do you like apples / bananas / fish / berries?" — and hear "Yes, I do! I like apples!" / "No, I don't. I don't like fish."
- "Yes, I do." / "No, I don't." — answer the monster's own question
- "Can you help me?" / "Can you swim?" — ask a monster friend for help
- "Yes, I can." / "No, I can't."

## Play

- **Move:** WASD / arrow keys (touch: the stick). **Look:** drag. **Zoom:** wheel.
- **Use / talk:** E (touch: the yellow button, or tap the label).
- **Speak:** Space or 🎤 — one press listens once. **Journal:** M. **Companion:** 1 / 2 or the chips.
- **Speak or Tap** on the title screen is a teacher setting: Tap mode never uses the microphone.
  If the microphone is blocked, the game switches to tapping by itself.

Progress saves on the device (Continue on the title screen).

Built for school Chromebooks (1366×768): no downloads, webfonts or CDNs; all
models, sounds and music are generated in the browser. Chrome is needed for
speech recognition.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (rules, matching, save, reachability)
npm run e2e        # build + Playwright: the whole loop, speech, save
node scripts/shots.mjs http://127.0.0.1:5173/ 1366x768 [--touch] [--tap]   # screenshot playthrough → .tmp/shots
```

Add `?e2e=1` for the test hook (`window.__mi`), `&fast=1` to skip pauses.

## Deploy

Every push to `main` runs the tests and deploys `dist/` to GitHub Pages
(`.github/workflows/deploy-pages.yml`; Pages source: GitHub Actions).

See `DESIGN_DECISIONS.md` for why things are the way they are and
`CURRENT_STATE.md` for what is next.
