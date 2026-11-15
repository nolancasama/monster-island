# Current State

## In progress (checked out): `feature/pirate-voyage` (from `feature/port-town-revamp` `39b0cbc`)
The user's plan "Monster Island — Pirate Voyage Adventure" (2026-11-15) is being implemented by Claude
directly, without the router. The frozen spec is `docs/PIRATE_VOYAGE.md` (§0 verdict, §1 stages and
English, §2 ship layout, §3 jobs, §4 storm, §5 raft, §6 save, §7 phrases, §10 order). The decision is in
`DESIGN_DECISIONS.md` (2026-11-15 "Pirate Voyage Adventure"). The branch sits on the unmerged town branch,
because the Captain Hat keepsake uses its wardrobe.

**Done and committed** (`b805dfa` spec, `dcd1fcd` milestone 1, `434774b` milestone 2a; tsc passes, all
1045 unit tests pass):
- `game/logic/voyage.ts` and `voyage.test.ts`:
  - stage, jobs, the interrogated and hat flags;
  - `voyageStage()` (`act3.voyageDone` is the authority);
  - the fair interrogation (`interrogationFoods`, `truthfulAnswer`, `foodChoices`, `handOverFood` takes one
    food once);
  - cargo (`cargoTasks`, `taskDone`, `slotFree`, `whereChoices`, `putLine`; items barrel, bag, bottle;
    furniture table and shelf on/under, box in, door by);
  - steering lanes (`steer`, `obstacleSide`, `safeCommand`).
- `act3.voyage` is in `logic/act3.ts`, and `logic/save.ts` reads it before readAct3's `voyageDone` early
  return.
- 29 new phrases in `logic/english.ts` (the spec §7 names are updated as built: Stop reuses `cmdStop`, "Can
  you make a fire?" reuses `canFire`, "Can you swim?" reuses `canSwim`, "Can you help me?" reuses `canHelp`,
  the shelf and table use the full "It's on/under the …" sentences, and "How many? Three!" uses `three`).
- The Captain Hat (`gift: true` in `data/wearables.ts`): never sold (`buyWearable` returns "gift"), given by
  `giveWearable`, shown in the shop only once owned; it has an icon and a 3D model.
- `data/pirates.ts`: Captain Redbeard, Cook Pepper, Bosun Bill, Fisher Finn, Tom, Sam, Max.
  `KeeperLook` (data/town.ts) is shared by keepers and pirates, and pirates have voices, names and
  portraits (`LookPortrait`).

**Next** (spec §10, in order; commit after each):
1. `npcGeometry` in `scene/models/lowland.ts` is still typed `NpcDef`. Change it to `KeeperLook` and draw
   tricorn, bandana, chef hat, beard and patch.
2. `game/world/pirateShip.ts`, in local coordinates from `SHIP = (76, -470)` with the bow toward −z:
   - **Hull:** half-width 4.5 for lz ≥ −13, tapering to 1.5 at the bow tip lz −21; the stern transom is at
     lz 15.
   - **Main deck:** y = SEA_Y + 2.4.
   - **Hold:** lx ±2.8, lz −7.8…−1.2, at SEA_Y + 0.6. Its ramp is lx −2.75…−1.75, lz −1.2…2.0.
   - **Fishing deck and its ramp:** the stern ramp is lx 1.9…3.1, lz 12…15.4; the fishing deck is lx ±3,
     lz 15.4…18, at SEA_Y + 0.7. Fish water is lx ±5, lz 19…27.
   - **Galley:** the bow compartment, lz −18…−13, behind a bulkhead with a door gap at lx ±1.
   - **Fixtures:** helm (0, 11.5); masts main (0.8, 3.2), fore (−0.5, −10.6), mizzen (0, 8.5); mess table
     lx 1.4…3.6, lz −12…−9.
   - **Rails and hold edges:** solid bands. Ramps interpolate the height.
   - **Hooks:** an `inShipArea` branch in `world/collision.ts` `isWalkable` and `standY`, before the
     lowland branch (moveCircle and nearestWalkable go through `isWalkable`).
   - **Camera:** a `pirate-ship` camera profile (pitch .75, dist 11).
3. `scene/models/pirateShip.ts` (≤ 9k triangles: an extruded hull outline, deck, hold, galley, masts,
   cannons, flag). Sails are fore-and-aft: edge-on to the stern camera, with a side shot for the sailing job.
   The billow is the `scale.x` of a pre-bent sail. Add `scene/PirateShip.tsx`, drawn near the ship only, and
   a `game/voyageRt.ts` runtime (npc spots, sails, storm, carried item, fish, fires, raft).
4. `flow/voyage.ts`:
   - Replace the first-trip branch of `sailWithGull()` (`flow/act3.ts`, lines 54–105), keeping the
     `cloudIsleOpen()` lock.
   - Add departure (Gull, "Yes, I am!", "Let's go!"), the capture (the ship approaches; ropes; the boarding
     arcs), the interrogation, the monsters scene, then checkpoint `captured`.
   - Ship focus candidates and interactions like `cloudCandidates`/`cloudInteract`. J routes to the friend's
     job tool in `input/attackInput.ts` `pressAttack` while on the ship.
   - Resume at the stage's spawn on load.
5. The jobs (§3), the storm (§4), the raft and landing (§5): Gull's boat arrives at `CLOUD_DOCK`, then the
   existing `arrive("cloud")`, with `completeVoyage` and the stage set to done.
6. e2e `pirate-voyage.spec.ts` (Tap mode, the cloud ship opened by the e2e hook), an evidence spec, docs.

## Development work (not merged, not deployed): `feature/port-town-revamp` (from `main` `a0dca15`)
The user's plan "Port Town area and its town systems" (2026-11-15) was implemented by Claude directly, without
the router, at the user's request. The frozen spec `docs/PORT_TOWN_REVAMP.md` (§0 lists every change from the
brief) is in place, and the decisions are in `DESIGN_DECISIONS.md` (two 2026-11-15 entries).
- **Town art:** a wooden palisade with two watchtowers, a log lintel and the PORT TOWN board
  (`scene/models/portWall.ts`), on the same collision and fade. Gable-roofed timber buildings with shop props
  and north-facing blade signs (`scene/models/town.ts`). The town is now a far base mesh plus a near detail
  mesh (`TOWN_DETAIL_FAR`).
- **Clothes shop:** the Treat Kitchen is gone; Ms. Button (`tailor`, service `clothes`) sells 13 wearables
  (`data/wearables.ts`, rules in `logic/wardrobe.ts`, shop flow in `flow/clothes.ts`, panel in
  `ui/ClothesPanel.tsx`). The items are drawn on the player and the friends (`scene/models/wearables.ts`,
  `scene/Wearables.tsx`). Bonuses help the whole team; each stat is on one item.
- **Coach Rex:** teaches one combo per friend for 1 amber (`data/combos.ts`, `flow/trainer.ts`,
  `ui/ComboPanel.tsx`). A lesson also gives the old treat upgrade, and lessons are stored in `act2.upgrades`.
  The combos (Bonk, Splash, Slam, Blaze) live in `game/combat.ts`, with a callout (`ui/ComboCallout.tsx`), a
  `combo` burst and sounds. Push ownership is recorded, so a bomb's knock is never Puff's Slam.
- **Save:** v4, plus `act2.wardrobe` (additive and re-validated). `act2.trained` is retired but still read
  and written.
- **Verified:** tsc and build pass, and all 1030 unit tests pass (new: wardrobe rules and save validation,
  combo lessons, every combo with its negative cases, every gear stat, the budgets of the wearable models).
  The lowland budget views all pass: port 39.1k, coast 63.2k, causeway 68.9k; forest base margin up from 30 to
  about 1,060 triangles. Renders were judged by Claude at 1366×768 (and panels at 1280×800) from
  `tests/e2e/zz-town-shots.spec.ts` (`SHOT_TAG=t2|t4`, `SHOT_ONLY=town|stances|combos|panels`;
  `.tmp/shots/town/`).
- **e2e:** `act2.spec.ts` "town in English" was rewritten (market → combo lesson → clothes → inn → harbour). It
  passes every new step and then hits its **known pre-existing** coast "hit" timeout (see below). The full
  e2e suite has not been run on this branch.

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
- Full e2e suite (2026-11-09, `.ai/e2e-mgw.log`): 116 passed, 7 failed. Fixed and rerun green: stale Causeway
  14→8 and retired-shellback specs, water-ropes extinguish fixture (moved to the ankle-water edge), camera
  `sanctuary-garden` triangle budget (ankle water is now its own mesh, drawn within `GROVE_SHALLOWS_FAR`).
  `expansion` grove route now rides Bubbo's ferry. **Still failing, pre-existing** (also fail on the 2026-11-08
  live build `9617b57`): `act2` "town in English" (times out on "hit" at the coast enemy near (67,-272)) and
  `expansion` "grove/canopy alone…" (the `defeat()` teleport-around loop strands the player on canopy decks over
  the Causeway, e.g. raider 42 at (96,-257); the stage never clears). Test-helper problems, not gameplay ones,
  but unverified.
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
-1. Continue `feature/pirate-voyage` from its **Next** list at the top. The user reviews
   `feature/port-town-revamp` (merge and deploy only on approval; the voyage branch depends on it).
0. Fix the three pre-existing e2e failures above (`defeat()` must stay on the ground layer near the Causeway
   canopy; diagnose the coast "hit" timeout in `act2.spec.ts:341`). Real-Chromebook
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
