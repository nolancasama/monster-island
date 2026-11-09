# Current State

## Live
`main` deployed 2026-11-07 at `6b76b84` (Pages run 42373513414, success): the **Act 2 vertical expansion**
(frozen spec `docs/ACT2_VERTICAL_EXPANSION.md`) on top of everything below. Save v4 (`mi.save.v4`, additive
fields only). Cloud Isle still locked as Coming Soon. https://nolancasama.github.io/monster-island/

## Mic / Grove water: live 2026-11-09 (fast-forwarded `feature/mic-grove-water` to `main`), deployed at the user's request before the full local e2e suite finished
User plan "Microphone UX, Flooded Grove Redesign, Bubbo Swimming, Fire Extinguishing"; decisions in
`DESIGN_DECISIONS.md` (four 2026-11-09 entries).
- Mic: toggling/silence/hardware never count as misses; Stop keeps captured speech; clear bilingual states
  (`flow/ask.ts`, `audio/recognition.ts`, `ui/Talk.tsx` + `Talk.css`).
- Deep stream moved back to the Forest–Grove entrance (`world/groveStream.ts`); slow side-on Bubbo ferry.
- Flooded Grove ankle water (`world/groveShallows.ts`, `scene/models/groveShallows.ts`, `scene/WadingEffects.tsx`),
  ~51% of walkable Grove floor (target was ~60%; rest is protected puzzle/approach floor).
- Water extinguish: white steam puffs + "TSSSS" (`combat.ts`, `ElementEffects.tsx`, `audio.ts`).
- Verified: tsc, 1006 unit tests, build, `speech.spec.ts` 3/3 (incl. new 10× toggle test),
  `zz-grove-water-shots.spec.ts` renders judged by Claude (`.tmp/shots/grove-water/w1`, `w8`; `.tmp/shots/mic/m1`).
  Full e2e suite: see Next steps.
- Known evidence-spec artifact: the ripple-trail frame (time frozen inside a rAF poll) can drop the rider; a
  normal wet walk shows the rider.

## Act 2 revision: live 2026-11-08 at `938eda6` (Pages run 42470871185, success), deployed at the user's request
User plan of 2026-11-08; decisions in `DESIGN_DECISIONS.md` ("Act 2 revision plan" and the as-built entries).
- Natural summit top (`scene/models/mesaTop.ts`); recessed rock cave mouths with dark throats.
- Dark cave blocks entry at both mouths (`darkCaveEntryBlocked` in `world/cave.ts`, toast in `sim.ts`); only
  Ember's "Can you make fire?" lights it (Fire Breath on braziers just sparkles).
- Grove stream moved to just north of the Grove–Causeway door (`world/groveStream.ts`); old entrance channel dry.
- Causeway: 8 live enemies (6 spawns `retired`, indices kept).
- Door plane is the grove/causeway zone boundary, with 1 m retention in `combatTick`, matching the camera.
- Verified: tsc, 965 unit tests, `zz-revision-shots.spec.ts` (3/3, evidence in `.tmp/shots/revision/rev/`).
  The full e2e suite has NOT been run on this branch; `vertical-expansion.spec.ts` was updated by the workers
  but only partly run (14/15 before the stream move).

## 2026-11-08 playtest fixes: live at `a2e691a` (Pages run 42431833731, success), deployed at the user's request before the full local suite finished
Fixes for the 2026-11-07 playtest list; decisions in `DESIGN_DECISIONS.md` (2026-11-08 entries).
- **Summit camera:** `upper-canopy` profile is `fixed: true` (`scene/cameraProfiles.ts`).
- **Bubble flight:** advanced per frame in `sim.ts` (`advanceBubbleRide`) from `rt.bubbleRide` timing;
  `bubbleDescent` only starts it and waits.
- **Cave mouths:** both arches, openings and braziers are baked into `lowlandPropsGeometry` (no pop).
- **First stream crossing:** `groveStream` granted on read only for a Grove save south of the stream; the ask
  is offered at both banks and the first ferry starts from the player's bank.
- **U cave:** mouth B at (68.6, -216.4) with its own pocket and portal (`caveMouthWest`); west arm along
  x ≈ 74.6; alcove, seal and chest moved to the chamber's west (67.6, -196.6). Light spreads from the
  entrance or torch that was lit.
- **Dark cave:** unlit ambient .01, silhouette .045, glow at 3%; the fire channel has its own material
  (no ambient, .012 silhouette) so it does not trace the route.
- **Render budget:** Upper Canopy draws only on the high layer or while the lowland draws within 70 m.
- **Specs:** `camera.spec.ts` expects `ruined-causeway` at the Causeway point; `vertical-expansion.spec.ts`
  compiles (it had blocked `npm run build`), covers mouth B and both-bank asks, and was checked with a
  known-bad build (mouth B portal removed, ferry forced north: both new tests failed).

Verified: tsc and build, 925 unit tests, `vertical-expansion` 13/13, cave/stream/summit renders at 1366×768
judged by Claude. The full suite on `a2e691a` (113 passed, 6 failed) found render-budget overruns and stale
spec expectations; fixed in the follow-up commit (chests and brazier flames drawn within 90 m, summit hidden
from below, spec corrections; see `DESIGN_DECISIONS.md` "Render budget after the vertical expansion").
The six failing tests were rerun individually and pass; the full suite has not been rerun end to end.

## Next steps
0. Mic / Grove water is live: finish the full e2e suite run (log `.ai/e2e-mgw.log`) and fix anything found. Real-Chromebook
   check of the mic level meter and ankle-water frame rate.
1. Act 2 revision is live: run `vertical-expansion.spec.ts` and ideally the full suite, and fix anything found.
1a. Optionally rerun the full suite (`MI_LONG_TIMEOUT=3600000 npm run e2e`, about 1.5 h). `water-ropes`
   "entrance rope … safe landing" is known flaky, and so is `act2` "forest tutorial" (bag held 3 apples
   instead of 2 once on 2026-11-08; passed twice on rerun).
2. Play the live game on a real Chromebook (never done): frame rate near the Canopy and in the town.
3. Optional polish: the root-seal chest sits at the left edge of the fixed cave view, partly behind the wall
   lip (`.tmp/shots/vertical/after/seal-open-chest-*.png`). It works; it just isn't showcased.

## Act 2 vertical expansion (live, slices A–H)
- **Causeway:** one fixed camera `ruined-causeway`; Grove–Causeway stone door opens once `grove` is cleared.
- **Grove stream:** `world/groveStream.ts`, Bubbo ferry ("Can you swim?").
- **Layers:** `region.layer` (`ground | cave | high`); golden test `layers-ground.test.ts` (both mouth pockets
  removed, otherwise unchanged).
- **Cave:** `world/cave.ts`, `scene/Cave.tsx`, `scene/models/cave.ts`. `caveTorches` (Ember) or fire on any
  brazier/torch; Leafy root seal → chest with 45 coins, 2 amber, Glow Crystal.
- **Upper Canopy:** `world/upperCanopy.ts`, `scene/UpperCanopy.tsx`; falls to checkpoints, unstable leaves.
- **Summit and bubble:** `flow/summit.ts`; Causeway landing (84.5, -254.5), or the upper rope foot until
  `grove` or `canopy` is cleared.

## Tools
- `tests/e2e/zz-vertical-shots.spec.ts`: controller screenshots (`SHOT_TAG=after`, optional `SHOT_ONLY`),
  skipped otherwise. `.tmp/pw-before.config.ts` serves an old `main` build for before shots.

## Earlier work (all merged and live)
Water/MP/ropes (`docs/WATER_MP_CANOPY_ROPES.md`), seven improvements, Grove/Canopy expansion, U forest,
combat feel, elemental combat, Act 3 and Cloud Isle expansion. See their docs and older `DESIGN_DECISIONS.md`
entries. Still not tested on a real Chromebook.

## Codex / Delegated Work
None in flight. 2026-11-09: Codex did mic, fire, stream and swamp first pass (reviewed, accepted); Codex hit its
usage limit (until 2026-11-12) on the swamp correction, which Claude finished. All output is committed. Machine notes: vitest `--maxWorkers=4`; Playwright
`MI_LONG_TIMEOUT=3600000`.
