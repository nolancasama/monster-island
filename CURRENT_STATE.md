# Current State

## Status
**Phase 2 (the Forest) is built and tested, not yet committed or deployed.**
Phase 1 (the Beach) is unchanged and published. The forest continues from the
Monster Stone ending: the bramble withers → forest path → broken bridge
(Bubbo can't; switch to Leafy; "Can you help me?"; "Thank you!") → Puff up in
its tree ("Come here!") → describe it ("It's purple." "It's small." "It has
wings.") → "Do you like ___?" → berries → friend → "Let's go!" → the cliff
("Can you fly?"; Puff flies the rope up; "Thank you!"; "Let's go!") → climb →
cliff-top ending (volcano, Maple by radio, third light) → results → free play
(the rope works both ways). Phase 1 saves (v1) migrate to v2.

Verified 2026-10-23: `npm test` (48 unit tests), `npm run e2e` (5 Playwright
specs: the Phase 1 loop, speech, blocked mic, save/continue, and the new
`forest.spec.ts` from a v1 save through the whole forest mic-free).
`forest.spec.ts` was shown to fail with the bridge's ability broken. Visuals
checked by eye in `node scripts/shots-forest.mjs` at 1366×768 (speech),
1366×768 touch/tap and 1280×800 (`.tmp/shots/forest-*`). Forest views: 39–73
draw calls, ~80–90k triangles; beach ~106k.

Published (Phase 1 only so far): repo https://github.com/nolancasama/monster-island,
Pages https://nolancasama.github.io/monster-island/ (every push to `main`
runs the unit tests, builds and deploys).

## What Exists
- **Data:** `game/data/monsters.ts` (Leafy, Bubbo, Puff live — `BUILT_PHASE = 2`;
  Ember is a journal silhouette; `size`, `part`, `perch`), `game/data/foods.ts`.
- **Rules (pure, tested):** `game/logic/progress.ts` (likes, abilities,
  friendship, describe lines, 4 obstacles, `endings`, per-phase objective),
  `english.ts` (phrases incl. requests, size, wings + accent variants),
  `speechMatch.ts`, `save.ts` (`mi.save.v2`, v1 migration).
- **World:** `game/world/island.ts` (beach + forest layout, forest floor,
  ravine, cliff, volcano position), `collision.ts` (gates incl. `forest`,
  bridge deck, cliff top reachable only by rope), `world.test.ts`.
- **Flow:** `game/flow/` — `encounter.ts` (call-down, journal lines, Let's go,
  journal optional lines), `obstacles.ts` (bridge, rope flight, thanks,
  climb), `story.ts` (stone ending opens the forest, cliff-top ending, hints).
- **Scene / UI:** `scene/Forest.tsx` + `scene/models/forest.ts` (trees,
  Puff's tree, bridge, cliff, rope, bramble), Puff in `models/monsters.ts` /
  `Monsters.tsx`, journal size/part lines, Phase 2 results title.
- **Scripts:** `scripts/shots.mjs` (beach), `scripts/shots-forest.mjs` (forest
  from a seeded save).

## Known Issues
- Real speech recognition (especially the new "Come here!" / "Thank you!"
  variants), TTS voices, audio levels and real Chromebook GPU performance are
  untested (SwiftShader runs at 5–12 fps, as expected).
- The ravine's water is the sea plane showing through (kept as a creek).
- The results screen backdrop is the beach camera, also after the forest.
- `THREE.Clock` deprecation warning from R3F (harmless).

## Next Steps
1. Review the uncommitted Phase 2 diff, commit, push (deploys to Pages).
2. Play it on a real school Chromebook with a class: speech acceptance for
   the Phase 2 sentences, whether students find Puff in its tree, the length
   of Phase 2.
3. Phase 3 (Volcano + Sanctuary) per the frozen chain: the rockfall on the
   cliff top opens, Ember (meat), the torch and the dark cave, the sanctuary
   gate needing all four abilities. Freeze its design first.

## Codex / Delegated Work
None pending. Phase 2 was routed through the router, which chose Codex. The
user reported Codex had no usage left and the other workers were quarantined,
so Claude implemented it directly. Nothing awaits review except the user's
own review of the uncommitted diff.
