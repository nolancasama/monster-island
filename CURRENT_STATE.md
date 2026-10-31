# Current State

## Live
`main` = `201990a`, deployed by Pages run 40871708332 (2026-10-29).
https://nolancasama.github.io/monster-island/

Live: the prologue, Act 2 "The Hunt for Lumo" (kidnapping, lowland, real-time
combat, Port Town, harbour lead), the forest expansion and the continuity
polish. Save v4 (`mi.save.v4`); v1–v3 still load and are never overwritten.

**Private preview:** https://claude.ai/artifact/UKRJgebxGLhVAtk3ySYNtr
(an older Act 2 build; microphone blocked inside it). Use the live site for
Chromebook testing.

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
   `feature/act3-cloud-isle` into `main` (deploys; Cloud Isle stays locked).
2. Full Playwright suite once, end to end, with `MI_LONG_TIMEOUT`.
3. Chromebook play-test with `?debug=1` (Cloud Isle frame rate, grotto
   lights, fights).

## Codex / Delegated Work
None in flight. Codex's sandbox cannot bind ports or launch Chromium, so the
controller captures all rendered evidence (`scripts/lib/dist-route.mjs`
serves `dist` without a port). Codex runs stop at 45 minutes: keep orders
narrow and name exactly what to read.
- Worktrees: `~/Projects/mi-base` (this branch; controller acceptance),
  `~/Projects/mi-wall`, `~/Projects/mi-kit` (merged; removable). The main
  checkout `~/Projects/monster-island` is on `exp/x2` (merged).
