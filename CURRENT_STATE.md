# Current State

## Live
`main` deployed 2026-10-31 (Act 3 branch fast-forwarded at `f108ed9`, then
the debug live-shortcut/teleport branch merged on top).
https://nolancasama.github.io/monster-island/

Live: the prologue, Act 2 "The Hunt for Lumo", the forest expansion, the
continuity polish, Act 3 Cloud Isle, gameplay polish Parts 1–2 and the debug
menu. Save v4 (`mi.save.v4`); v1–v3 still load and are never overwritten.

**Private preview:** https://claude.ai/artifact/UKRJgebxGLhVAtk3ySYNtr
(an older Act 2 build; microphone blocked inside it). Use the live site for
Chromebook testing.

## Branch `feature/elemental-combat` (pushed, not merged)
Built on `feature/act3-cloud-isle` + `main`'s debug teleport. Frozen spec
`docs/ELEMENTAL_COMBAT.md`; decisions dated 2026-11-01 in
`DESIGN_DECISIONS.md`. Merging this branch also brings everything below.

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
  tunnel 59/59). Still failing, identically on the base branch `17dfce5`
  (stale Cloud Isle coordinates from the expansion, not this work): camera
  `cloud-back-tunnel` ×2, companions-polish ×4, combat-polish Cloud Isle
  steps ×4. A full run under machine load (2.8 h) adds timeouts that pass
  when rerun.
- Controller evidence: screenshots of all eight moves, the bubble chain,
  two combos and every secret before/after (six secrets persist across
  reload) — `.tmp/shots/elements/`, `.tmp/shots/secrets/` in this worktree.
  Fights ≤ 93 draw calls / ≤ 97k triangles.
- Fixed on the way: `DESIGN_DECISIONS.md` truncation from slice X1 restored;
  Beacon reinforcement sprites spawned 265 m from the moved arena.

## Branch `feature/act3-cloud-isle` (pushed, not merged to `main`)
Merging (= deploying) needs the user's approval. Contents:

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
- Pre-existing spec debt from the Cloud Isle expansion: camera
  `cloud-back-tunnel`, companions-polish and combat-polish Cloud Isle steps
  use pre-expansion coordinates (fail on `17dfce5` too).
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
1. User decisions: the dock landmark (Known Issues); merge
   `feature/elemental-combat` (contains `feature/act3-cloud-isle`) into
   `main` (deploys; Cloud Isle stays locked). Optional polish pass on the
   secret pockets.
2. Full Playwright suite once, end to end, with `MI_LONG_TIMEOUT`.
3. Chromebook play-test with `?debug=1` (Cloud Isle frame rate, grotto
   lights, fights).

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
