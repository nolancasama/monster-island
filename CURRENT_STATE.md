# Current State

## Live
`main` deployed 2026-11-07 at `6b76b84` (Pages run 42373513414, success): the **Act 2 vertical expansion**
(frozen spec `docs/ACT2_VERTICAL_EXPANSION.md`) on top of everything below. Save v4 (`mi.save.v4`, additive
fields only). Cloud Isle still locked as Coming Soon. https://nolancasama.github.io/monster-island/

## Act 2 vertical expansion (branch `feature/act2-vertical-expansion`, fast-forwarded into `main`)
Slices A–H are built; decisions per slice are in `DESIGN_DECISIONS.md` (2026-11-07 entries). Codex hit its usage
limit during slice L, so L–H were built by the controller.

- **A/B Causeway:** arches gone, shrine statues off the floor, NE-corner boulders. One fixed camera,
  `ruined-causeway` (yaw 0, pitch .8, dist 10.5); `causeway-exit-rope` is climbing-only, and the Canopy mass
  behind the lens is cut away (`causeway-visibility.test.ts`). The Grove–Causeway stone door opens on approach
  once `grove` is cleared.
- **C Grove stream:** a deep channel across the Grove entrance (`world/groveStream.ts`), crossed by the
  `groveStream` Bubbo ferry ("Can you swim?"), with short repeat rides.
- **L Layers:** `region.layer` (`ground | cave | high`) is the default for collision and height queries; layer
  content registers a `LayerWorld` (`world/layers.ts`). The golden test `layers-ground.test.ts` proves ground
  behaviour is unchanged apart from the cave-mouth pocket.
- **D/E Cave** (`world/cave.ts`, `scene/Cave.tsx`, `scene/models/cave.ts`): a J-shaped route inside the mesa,
  one mouth at z -227. The `caveTorches` obstacle (Ember, "Can you make fire?") or fire on a brazier or torch
  lights it along the route. The Leafy root seal (`caveRootSeal`, in `CAVE_SECRET_IDS`) opens the chest:
  45 coins, 2 amber, and the Glow Crystal (`act2.relics`).
- **F/G Upper Canopy** (`world/upperCanopy.ts`, `scene/UpperCanopy.tsx`): giant disc leaves 20–23 m up, reached
  by `UPPER_ROPE` from the lower Canopy. It has real falls back to checkpoints, two unstable leaves, and 11
  optional enemies.
- **H Summit and bubble** (`flow/summit.ts`): plateau (zone `summit`) with the Summit Star chest. `summitBubble`
  (Bubbo, "Can you help me?") floats you to the Causeway landing (84.5, -254.5), or to the upper rope foot
  until `grove` or `canopy` is cleared.
- Verified: tsc, 914 unit tests, build, and per-slice browser renders at both sizes. The core browser specs
  (`act2 save camera grove-canopy`): 17 passed, 2 failed (below). The full suite has not been run.

## Known problems: fix these next (user playtest 2026-11-07, plus the smoke run)
1. **Summit camera "zooms into the sky" walking over things.** The `upper-canopy` profile runs the lowland
   bank, floor and mesa adjustments. Fix: give it `fixed: true` in `scene/cameraProfiles.ts`; the lens is 7.7 m
   above, clear of every leaf and the summit.
2. **Bubble descent stutters.** `bubbleDescent` moves the player in an async `wait(16)` loop. Fix: drive the
   flight from the per-frame sim tick (store t0, dur and pts in `rt.bubbleRide`; advance in `sim.ts`) and keep the
   script only to start it and wait for landing.
3. **Cave mouth pops in and out** (its group draws only within 30 m, in `Cave.tsx`). Fix: build
   `caveMouthGeometry` and the braziers into `lowlandPropsGeometry` (no draw-call cost, no pop); keep only the
   flames and jet dynamic.
4. **First Grove crossing must be a "Can you swim?" moment.** `logic/save.ts` grants `groveStream` on read to
   anyone past the Grove, so existing players only see "Ride Bubbo". Fix: grant it only for a saved position
   south of the stream, and offer the unsolved ask at both banks (`flow/focus.ts`; `streamFerry(false)`
   currently always starts north).
5. **User decision: the cave becomes a true U with two entrances**, both on the Grove's south bank, with the
   chamber at the bottom of the U. Plan: keep mouth A (z -227, up the east arm, bend, chamber), and add a west arm
   from the chamber south along x ≈ 74.6 to mouth B at about (68.6, -216.4). Keep the ground pocket clear of
   `groveEastPool` and `groveDryReeds`; add a second `LAYER_PORTALS` entry. Move the alcove to the chamber's
   west, about (67.6, -196.6) r .85, because the new arm leaves where the alcove is now. Extend `CAVE_ROUTE`
   and fix `caveRouteS` (the chamber is no longer the route end). Update the golden pocket-removal test to
   remove both pockets.
6. **User decision: unlit cave pitch black, almost unplayable.** `uAmbient` about .01, silhouette about .045,
   mushrooms and crystals tinted down until lit (`scene/models/cave.ts` `caveMaterial`, `Cave.tsx`).
7. **Render budget regression:** the Upper Canopy draws whenever the camera is within 120 m, which includes
   the volcano tunnel (68 calls vs ≤ 60) and the Sanctuary courtyard (125 vs ≤ 120) in `camera.spec.ts`. Fix:
   show it only when `lowlandView.visible` and the player is within about 70 m of (95, -215).
8. `camera.spec.ts:158` expects the old `lowland` profile at a Causeway point; it should expect
   `ruined-causeway` (an intended change).
9. Flaky, not a regression: `water-ropes` "entrance rope … safe landing" (safe ground cleared within 0.2 s).

## Tests to run after the fixes
- `tests/e2e/vertical-expansion.spec.ts`: written, **never run** (8 scenarios; it will need updates for items
  4–5).
- `tests/e2e/zz-vertical-shots.spec.ts`: controller screenshot tool (`SHOT_TAG=after npx playwright test
  zz-vertical-shots`), skipped otherwise. Before shots come from `.tmp/pw-before.config.ts`, which serves a
  build of the old `main`.
- Then the full suite: `MI_LONG_TIMEOUT=3600000 npm run e2e` (about 1.5 h). Then push to `main`.

## Earlier work (all merged and live)
Water/MP/ropes (`docs/WATER_MP_CANOPY_ROPES.md`), seven improvements, Grove/Canopy expansion, U forest,
combat feel, elemental combat, Act 3 and Cloud Isle expansion. See their docs and older `DESIGN_DECISIONS.md`
entries. Still not tested on a real Chromebook.

## Codex / Delegated Work
None in flight. Codex was out of usage until about 23:49 on 2026-11-07. Its partial slice L patch was discarded
(saved only in the session scratchpad). Machine notes: vitest `--maxWorkers=4`; Playwright
`MI_LONG_TIMEOUT=3600000`.
