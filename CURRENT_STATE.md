# Current State

## Live
`origin/main` at `a278ef2` (2026-11-01): the prologue, Acts 2 and 3 (Cloud Isle stays
locked behind the Coming Soon notice), gameplay polish, debug menu and elemental combat.
Save v4 (`mi.save.v4`); v1–v3 still load and are never overwritten.
https://nolancasama.github.io/monster-island/

## Branch `feature/combat-feel` (pushed, not merged)
Frozen spec `docs/COMBAT_FEEL.md`, decisions dated 2026-11-02.

- **One attack input** (`src/input/attackInput.ts`) for keys, mouse and touch. Left click =
  J, right click = K; reads `e.buttons` for chords. Holds release on menus, dialogue, blur;
  a fresh press is needed afterwards. Context menu blocked on the canvas only.
- **Ember:** held J is a continuous cone (3 damage per 0.25 s), ignition after 0.5 s of
  exposure, 2.5 s panic (2 s heavy) with per-kind motion, temporary limbs, bubble, a yelp and
  a rate-limited TTS "I'm on fire!". Fire cannot KO in the first 1.2 s of panic. 4 s
  resistance after. Inferno sustains on MP. Rules `logic/panic.ts`, pose `scene/panicPose.ts`.
- **Leafy:** flexible whip on live hand anchors (`scene/anchors.ts`, `logic/whip.ts`); hits
  land at the 0.15 s snap; held J repeats only with a target; Double Grab uses both hands;
  Root Snare roots wrap the enemy.
- Verified at `23e704b`: 569 unit tests, build, full Playwright 72/73. The one failure was
  the Act 2 tutorial's `defeat` helper running out of presses under full-suite load; it
  passed alone, and `act2.spec` passed 6/6 on its own. Base-to-hand test 0.0000 m over 25+
  moving frames, and it failed against a deliberate 10 cm offset. Evidence `.tmp/shots/feel/`.
- Not checked by ear: the yelp, flame loop and TTS bark (tests stub speech). Panic limbs of
  raiders, crabs, drones and sprites were not rendered, only gloomlets.

## Elemental combat (merged, on `main`)
Built on `feature/act3-cloud-isle` + `main`'s debug teleport. Frozen spec
`docs/ELEMENTAL_COMBAT.md`; decisions dated 2026-11-01 in
`DESIGN_DECISIONS.md`.

- **J (free) = signature power:** Ember Fire Breath (cone + burn), Bubbo
  Bubble Trap (lift, pop, fall damage; ≤3), Leafy Vine Grab (swing/fling as a
  weapon; upgrade double grab), Puff Wind Blast (knock-back, wall impact,
  hazard knock-outs). **K (MP):** Inferno (tap 1.2 s, keyboard hold ≤3 s),
  Bubble Bomb (chains through trapped bubbles, capped), Root Snare, Cyclone
  (carries light enemies/bubbles, reflects shots). No auto-turn or homing.
  Storm Beacon specials stay free.
- Rules in `src/game/logic/elements.ts`, hazards in
  `src/game/world/hazards.ts`, visuals in `src/scene/ElementEffects.tsx`.
- **Six optional lowland secrets** (`src/game/world/elementObjects.ts`,
  `logic/secrets.ts`, `scene/Secrets.tsx`): thicket (Ember), shell key
  (Bubbo), statues (Leafy), leaves + trapdoor (Puff), crate lift (Leafy +
  Bubbo), furnace (Ember + Puff). Saved in `act2.secrets` (v4).
- Verified at `415ff75`: tsc, 498 unit tests (`--maxWorkers=4`), build.
  Browser (`MI_LONG_TIMEOUT=3600000`): Act 3 full chapter both sizes 6/6,
  Act 2, elements 7/7 (fails when an expectation is broken), expansion,
  continuity, polish, camera budgets (sanctuary 116 calls = base; volcano
  tunnel 59/59).
- **Full Playwright suite, end to end: 62/62 in 42.9 min** (2026-11-01,
  `MI_LONG_TIMEOUT=3600000`, fresh build), after updating the camera,
  companions-polish and combat-polish Cloud Isle steps to the expanded island
  (coordinates now come from the world constants; camera covers every cloud
  profile).
- Controller evidence: screenshots of all eight moves, the bubble chain,
  two combos and every secret before/after (six secrets persist across
  reload) — `.tmp/shots/elements/`, `.tmp/shots/secrets/` in this worktree.
  Fights ≤ 93 draw calls / ≤ 97k triangles.
- Fixed on the way: `DESIGN_DECISIONS.md` truncation from slice X1 restored;
  Beacon reinforcement sprites spawned 265 m from the moved arena.

## Act 3 and polish (merged, on `main`)
Contents:

- **Act 3 "Cloud Isle: Above the Storm"** — spec `docs/ACT3_CLOUD_ISLE.md`.
- **Gameplay polish Parts 1 and 2** (`docs/GAMEPLAY_POLISH.md`) and the
  **debug menu** (`?debug=1`, then Ctrl+Shift+D or backquote).
- **Cloud Isle expansion** (2026-10-31), frozen spec
  `docs/CLOUD_ISLE_EXPANSION.md`, decisions in `DESIGN_DECISIONS.md`:
  - **L — Coming Soon lock:** `CLOUD_ISLE_RELEASED = false` in
    `src/game/release.ts`. Gull at Port Town says the ship isn't ready, a
    "Cloud Isle — Coming Soon!" notice shows, journal and hints follow.
    Going home from Cloud Isle stays open. `?debug=1` has a session-only
    "Cloud Isle ship" toggle; browser tests use the `openCloudShip` hook.
    Release = set the flag to `true`.
  - **W — frontier wall** on the home island along the sanctuary shelf's
    cliff lip, gate shut until `act2.started`, low parapet keeps the view.
  - **K — environment kit** `src/scene/models/cloudKit.ts`: composites
    assembled from parent attachment points, connectivity-tested.
  - **X1–X3 — the island at scale.** One island heightfield
    (`src/game/world/cloudTerrain.ts`) with the paths carved in, decks
    (branch walkway), chasms (puzzle gaps) and caves (the grotto under the
    mountain). Coast/Hollow/tunnel (X1); junction, Skyroot Canopy with giant
    trees, Thunder Grotto chambers (X2); observatory forecourt, terraces and
    towers with the four mechanisms spread out (X3). Save remap via
    `act3.cloudLayout: 2`. Top-down map: `node scripts/cloud-map.mjs`.

| Measured (`node scripts/measure-cloud-area.mjs`) | Baseline `f108ed9` | Now |
| --- | --- | --- |
| Walkable floor | 3,133.5 m² | **9,523.25 m² (3.04×)** |
| Dock → beacon via canopy / grotto | 195.8 / 200.8 m | **542.5 / 543.1 m** |

The unit test asserts ≥ 3× floor and ≥ 2× each route. Gameplay views
≤ 107 calls and ≤ 98k triangles at 1366×768 and 1280×800 (fog 260 m).

Verified on the finished island: tsc, 373 unit tests (`--maxWorkers=4`),
build; browser: Act 3 full chapter at 1366×768 and 1280×800 touch-only,
the Coming Soon lock and debug-toggle specs, debug menu, Act 2 (15/15 with
`MI_LONG_TIMEOUT=3600000`). Polish/camera specs passed after the wall, before
the expansion; the full suite has not been run end to end on this machine.

## Known Issues
- **Secret pockets look plain:** the closed reward pockets for Puff's
  trapdoor, the crate lift and the furnace render as plain large boxes;
  Ember's opened nook is a flat dark patch. Functional and readable, not
  yet attractive. Combat balance (e.g. a full-height Bubble Trap knocks out
  a 20 HP gloomlet) is untested with children.
- **CI browser job does not finish:** `test.yml` limits Playwright to 60
  minutes and runs 41266499516 and 41302604485 ended cancelled; the full suite
  takes 43 min on this machine with nothing else running. Deploys run only unit
  tests and the build. Unit tests timed out intermittently on CI at Vitest's
  default 5 s (Cloud Isle flood fills), which would also have blocked a
  deploy; `testTimeout` is now 30 s and the CI unit job passes.
- **Run `npm run e2e`, or build first:** plain `npx playwright test` serves
  whatever is in `dist`, so it silently tests a stale build.
- **Landmark from the dock:** the mountain does not read as a landmark from
  the dock — the massif's south flank rises gently and the summit is
  > 400 m away. Options: steeper massif (deep canyons by the Hollow and
  junction) or a longer cut-off for the summit alone. User decision.
- **Frame time:** SwiftShader is fill-rate bound now that terrain fills the
  screen (Act 3 chapter ~56 min; grotto ~9 fps with chamber lights). Real
  Chromebook GPU frame time is unmeasured.
- **This machine (6-core A18 Pro):** use `--maxWorkers=4` for vitest (the
  default stalls tests for 10+ min) and `MI_LONG_TIMEOUT=3600000` for
  Playwright (the config and the Act 3 spec read it).
- The junction's grotto mouth is a plain arch set into the slope.
- `scripts/cloud-x1-shots.mjs` cannot settle the coast-waterfall-view camera.
- Lowland-side home views are at ~140–141k triangles (over 140k before the
  wall).
- Nothing tested on a real Chromebook: speech, TTS, audio, fight difficulty,
  frame rate. Sanctuary courtyard shoulder framing; debug map small.
- `feature/physical-stage-passages` is superseded and can be deleted.

## Next Steps
1. Beach side view, U-shaped forest and Port Town wall: spec `docs/U_FOREST_PORT_WALL.md`.
2. User decisions: merge `feature/combat-feel` into `main` (deploys); the dock landmark;
   optional polish on the secret pockets.
3. Chromebook play-test with `?debug=1` (fire, panic audio, whip, frame rate, fights).

## Codex / Delegated Work
None in flight. Codex's sandbox cannot bind ports or launch Chromium, so the
controller captures all rendered evidence (`scripts/lib/dist-route.mjs`
serves `dist` without a port). Codex runs stop at 45 minutes: keep orders
narrow and name exactly what to read.
- Worktrees: `~/Projects/mi-combat` (`feature/elemental-combat`),
  `~/Projects/mi-accept` (detached; controller acceptance),
  `~/Projects/mi-e3` (merged slice branches; removable),
  `~/Projects/mi-base` (`feature/act3-cloud-isle`), `~/Projects/mi-wall`,
  `~/Projects/mi-kit` (merged; removable). The main checkout
  `~/Projects/monster-island` is on `exp/x2` (merged).
