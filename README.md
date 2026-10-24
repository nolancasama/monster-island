# Monster Island

A 3D English adventure for Japanese elementary school students (grades 3–6,
beginners). Explore a tropical island, find monsters, ask them what they like,
make friends, and use their powers to open the way.

**Phase 1: the Beach.** Professor Maple, the Monster Journal, Leafy and
Bubbo, two obstacles and the Monster Stone ending, which opens the forest.

**Phase 2: the Forest.** The broken bridge (Leafy), Puff the shy flier on the
hills, the high cliff (Puff flies the rope up) and the cliff-top ending with
the volcano in view.

**Phase 3: Volcano + Sanctuary.** Cool the lava with Bubbo, meet Ember by
the meat rack, light the cave, and use all four friends at the sanctuary
pillars. Meet Lumo, celebrate with Maple, and finish with The End and all
five journal pages. The whole island remains open for exploration.

English used in Phase 1:

- "It's green." / "It's blue." — describe a new monster for the journal
- "Do you like apples / bananas / fish / berries?" — and hear "Yes, I do! I like apples!" / "No, I don't. I don't like fish."
- "Yes, I do." / "No, I don't." — answer the monster's own question
- "Can you help me?" / "Can you swim?" — ask a monster friend for help
- "Yes, I can." / "No, I can't."

Added in Phase 2:

- "Come here!" — call the shy monster down from its tree
- "It's small." / "It's big." / "It has wings." — finish a journal page
- "Let's go!" — invite a new friend along; start the climb
- "Thank you!" — after a friend's power has helped
- "Can you fly?"

Added in Phase 3:

- "It's hot!" / "It's dark!" (heard)
- "It's orange." / "It has a tail."
- "Do you like meat?"
- "Can you make fire?"
- "It's yellow." / "What's your name?"
- "Do you like monsters?" and either "Yes, I do." or "No, I don't."

## Play

- **Move:** WASD / arrow keys (touch: the stick). **Look:** drag. **Zoom:** wheel.
- **Use / talk:** E (touch: the yellow button, or tap the label).
- **Speak:** Space or 🎤 — one press listens once. **Journal:** M. **Companion:** 1 / 2 / 3 / 4 or the chips.
- **Speak or Tap** on the title screen is a teacher setting: Tap mode never uses the microphone.
  If the microphone is blocked, the game switches to tapping by itself.

Progress saves on the device (Continue on the title screen). Version 1 and 2
saves migrate to version 3. Companion keys are 1 / 2 / 3 / 4; Lumo stays in
the sanctuary. Food questions can offer five cards (keys 1 through 5).

Built for school Chromebooks (1366×768): no downloads, webfonts or CDNs; all
models, sounds and music are generated in the browser. Chrome is needed for
speech recognition.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (rules, matching, save, reachability)
npm run e2e        # build + Playwright: the whole loop, speech, save
node scripts/shots.mjs http://127.0.0.1:5173/ 1366x768 [--touch] [--tap]          # beach playthrough → .tmp/shots
node scripts/shots-forest.mjs http://127.0.0.1:5173/ 1366x768 [--touch] [--tap]   # forest playthrough from a seeded save
```

Capture the final phase from a Phase 2-complete save (defaults to both
1366x768 and 1280x800; optional final argument selects one size):

```sh
node scripts/shots-volcano.mjs http://127.0.0.1:5173/
```

Writes `.tmp/shots/volcano-{size}/` images and `report.json` render budgets.
The executor owns `npm run e2e`, including `tests/e2e/volcano.spec.ts` and
the documented temporary broken-ability probe.

Add `?e2e=1` for the test hook (`window.__mi`), `&fast=1` to skip pauses.
`__mi.state()` exposes saved progress/objective, lava/cave/pillar/gate animation
values, `finale` (`idle`, `rise`, `maple`, `complete`), `starGlow`, camera and
renderer statistics for semantic harness waits.

**Collision overlay:** in `npm run dev` or any `?e2e=1` session, press **F3**
to draw the player radius, solid colliders, walkable surfaces (the pier deck)
and dynamic obstacle states. It never appears in a normal session. Colliders
come from the same placement records the scene uses (`src/game/world/island.ts`);
the cliff rope's line is measured from the rocks at load (`src/game/world/rope.ts`).

## Deploy

Every push to `main` runs the tests and deploys `dist/` to GitHub Pages
(`.github/workflows/deploy-pages.yml`; Pages source: GitHub Actions).

See `DESIGN_DECISIONS.md` for why things are the way they are and
`CURRENT_STATE.md` for what is next.
