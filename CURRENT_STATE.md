# Current State

## Status
**Phase 3 (Volcano + Sanctuary) is built, reviewed and committed; not yet
pushed/deployed.** The whole game now plays to the end: beach (Phase 1,
live on Pages) → forest (Phase 2, live on Pages) → cliff top → lava (Bubbo)
→ Ember + meat rack → dark cave (Ember's fire) → four sanctuary pillars (one
per friend) → Lumo ("What's your name?") → Maple in person → The End → free
exploration. Old saves (v1, v2) migrate to `mi.save.v3`.

Verified 2026-10-24: `npm test` (59 unit tests), `npx tsc --noEmit`,
`npm run e2e` (7 Playwright specs, run by the acceptance executor: Phase 1
loop, speech, blocked mic, save/continue, forest, and `volcano.spec.ts` ×2
from a v2 save through The End mic-free plus the spoken lava alias).
`volcano.spec.ts` was shown to fail with Bubbo's swim removed. Visuals judged
by Claude from `node scripts/shots-volcano.mjs` at 1366×768 and 1280×800
(`.tmp/shots/volcano-*`). Phase 3 views: 24–83 draw calls, ≤~110k triangles.

Published (Phases 1–2): repo https://github.com/nolancasama/monster-island,
Pages https://nolancasama.github.io/monster-island/ (every push to `main`
runs the unit tests, builds and deploys).

## What Exists
- **Rules (pure, tested):** `game/logic/progress.ts` — obstacles `lava`,
  `cave`, `gateLeaf/Drop/Wing/Flame`, `gateOpen`, `obstacleAvailable`,
  `invite` (Ember's "Let's go!"), `befriendLumo`, `companions` (Lumo never
  follows), `questionFoods` (meat from Phase 3), objectives `letsGo`,
  `askBack`, `finale`; `english.ts` gains "Can you make fire?", "What's your
  name?", "It's yellow."; `save.ts` v3.
- **Data:** `game/data/monsters.ts` — Ember (volcano), Lumo (sanctuary,
  `companion: false`, `power: null`), `BUILT_PHASE = 3`.
- **World / scene:** `scene/Volcano.tsx` + `scene/models/volcano.ts` (lava,
  trail, meat rack, roofed cave with torches, crater garden, pillar gate),
  Ember and Lumo models and portraits, finale staging in `flow/story.ts`,
  Phase 3 results camera at the sanctuary.
- **Harness:** `tests/e2e/volcano.spec.ts`, `scripts/shots-volcano.mjs`,
  read-only `window.__mi.state()` (with `?e2e=1`).

## Known Issues
- Real speech recognition (new: "Can you make fire?", "What's your name?",
  "It's yellow."), TTS voices, audio levels, classroom pacing and real
  Chromebook GPU performance are untested (SwiftShader only).
- The Phase 2 results backdrop still uses the beach camera.
- The ravine's water is the sea plane showing through (kept as a creek).
- `THREE.Clock` deprecation warning from R3F (harmless).

## Next Steps
1. Push `main` to deploy Phase 3 to Pages (waiting for the user's go-ahead).
2. Play it on a real school Chromebook with a class: speech acceptance for
   the Phase 2–3 sentences, whether the pillar gate's four switches are clear,
   total length (the e2e playthrough's in-game clock read ~31 min).
3. Polish from classroom feedback; no Phase 4 is planned (the story ends).

## Codex / Delegated Work
None pending. Phase 3 was built by Codex via the router in two slices (rules,
then world/flow/UI) plus one correction pass (cave, companion placement,
lava, legendary objective, harness known-bad proof); all reviewed and
accepted by Claude.
