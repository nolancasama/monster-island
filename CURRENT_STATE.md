# Current State

## Status
**Phase 1 (the Beach vertical slice) is complete and tested.** The whole loop
plays through the real UI: Maple's intro → discover Leafy ("It's green.") →
"Do you like ___?" until yes → fetch apples → give → Leafy asks back → friend →
"Can you help me?" lifts the fallen palm → Bubbo (same loop, fish) → Leafy
can't swim, switch to Bubbo → "Can you swim?" → ride + stepping stones →
Monster Stone ending → results → free exploration.

Verified 2026-10-20: `npm test` (33 unit tests), `npm run e2e` (4 Playwright
specs: full loop mic-free, speech misses/rescue/accents, blocked mic, save +
continue + new game). The loop spec was shown to fail with Bubbo's swim
removed. Visuals checked by eye in `node scripts/shots.mjs` playthroughs at
1366×768 (speech), 1366×768 touch, 1280×800 and 844×390 touch tap
(`.tmp/shots/<size>/`). ~99 draw calls, ~82k triangles.

## What Exists
- **Data:** `game/data/monsters.ts` (Leafy, Bubbo live; Puff, Ember are journal
  silhouettes with Phase 2/3 data), `game/data/foods.ts`.
- **Rules (pure, tested):** `game/logic/progress.ts` (likes, abilities,
  friendship, companion, obstacles, objective), `english.ts` (phrases + accent
  variants), `speechMatch.ts`, `save.ts` (`mi.save.v1`, validated).
- **World:** `game/world/island.ts` (layout: west beach / ridge pass + fallen
  palm / east beach / river / far bank), `collision.ts` (gates, sliding,
  stepping stones), `world.test.ts` (flood-fill reachability per gate).
- **Flow:** `game/flow/` — `ask.ts` (speech/tap prompts, inherited rules),
  `encounter.ts`, `obstacles.ts`, `companion.ts`, `story.ts` (intro, Maple's
  hints, ending, save), `focus.ts`, `input.ts`, `script.ts` (scenes, camera
  shots). `game/sim.ts` is the per-frame step.
- **Scene / UI:** procedural models (`scene/models/`), `Monsters.tsx` (shared
  yes/no/spin body language + per-monster parts), `ui/` (HUD, prompt, journal,
  title/results, settings, touch).
- **Deploy:** `.github/workflows/deploy-pages.yml` (tests + build + Pages).

## Known Issues
- Real speech recognition, TTS voices, audio levels and real Chromebook GPU
  performance are untested (SwiftShader runs at 5–12 fps, as expected).
- `THREE.Clock` deprecation warning from R3F (harmless).
- The fallen palm reads more as a log than a palm from some angles.

## Next Steps
1. Play it on a real school Chromebook with a class: speech acceptance,
   whether students find Leafy without the star, and Phase 1 length.
2. Phase 2 (Forest) per the frozen chain in DESIGN_DECISIONS.md: open the
   forest path, broken bridge (Leafy), Puff on the hills (berries, "Can you
   fly?"), describing with "It's big / small", "It has wings", and the
   requests "Come here!", "Let's go!", "Thank you!". Freeze its design first.

## Codex / Delegated Work
None. Phase 1 was implemented directly by Claude at the user's request
("do not go through the router"). Nothing is pending review.
