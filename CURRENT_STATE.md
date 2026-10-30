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

- **Act 3 "Cloud Isle: Above the Storm"** — slices A–C. Spec
  `docs/ACT3_CLOUD_ISLE.md`.
- **Gameplay polish Parts 1 and 2** (`docs/GAMEPLAY_POLISH.md`) and the
  **debug menu** (`?debug=1`, then Ctrl+Shift+D or backquote).
- **Cloud Isle expansion brief** (2026-10-31), frozen spec
  `docs/CLOUD_ISLE_EXPANSION.md` (slices L, W, K, X1–X3). Accepted so far:
  - **L — Coming Soon lock** (`8844c61`): `CLOUD_ISLE_RELEASED = false` in
    `src/game/release.ts`. Gull at Port Town says the ship isn't ready and a
    "Cloud Isle — Coming Soon!" notice shows; journal and hints follow.
    Going home from Cloud Isle stays open. `?debug=1` has a session-only
    "Cloud Isle ship" toggle; browser tests use the `openCloudShip` e2e hook.
    Release = set the flag to `true`.
  - **K — environment kit** (`53fca1a`): `src/scene/models/cloudKit.ts`,
    parts assembled from parent attachment points, connectivity tests;
    Cloud Isle trees/walkways reconnected at the old layout.
  - **W — frontier wall** (`3931c2a`): stone wall along the sanctuary
    shelf's cliff lip with a gatehouse at the rope head (shut until
    `act2.started`), low parapet keeps the view. ≤3 calls, ~1k triangles.
  - Because Cloud Isle is locked, the branch at `db3469f` could be merged
    without exposing Act 3 — after a full Playwright run.

Verified at `db3469f`: tsc, 350 unit tests, build; browser specs act3 (6/6),
act2, debug, polish, camera (the cliff-rope test failed once under CPU load
and passed alone). The full suite has not been run since `b972592`.

## In progress: expansion slice X1 (branch `exp/x1`, main checkout)
Re-laid frame plus dock, Stormbreak Coast, Hidden Hollow and back tunnel at
scale, `act3.cloudLayout` save remap, derived bounds. Uncommitted; a Codex
correction run is in flight there (order `.ai/work-order.json`) — do not edit
that checkout until it reports.

- First attempt met the area targets (dock 359, coast 2,662, hollow 724,
  tunnel 344 m²; dock→junction 332 m vs 100 m) but was **rejected**: ground
  was walk cells extruded as stair-stepped slabs on dark water, no landmass
  or mountain, dock view 146 draw calls, 2 failing unit tests.
- The correction implements spec §2a (one island heightfield
  `cloudGroundY` with paths carved in, colour lift, chunk culling, and
  `scripts/cloud-map.mjs` top-down map).

Measurement: `node scripts/measure-cloud-area.mjs`. Baseline (`f108ed9`)
3,133.5 m²; routes dock→beacon 195.8 m (canopy) / 200.8 m (grotto). Final
targets ≥ 9,400 m² and ≥ 2× each route.

## Known Issues
- Nothing has been tested on a real Chromebook (SwiftShader only): speech,
  TTS voices, audio levels, fight difficulty, GPU frame rate.
- Lowland-side views are at ~140–141k triangles (over the 140k budget
  before the wall, +~1k with it).
- Codex's sandbox can neither bind a port nor launch Chromium: it cannot run
  Playwright or take screenshots. The controller captures all rendered
  evidence. No-port capture: `scripts/shots-wall.mjs --dist <dir>` and
  `scripts/lib/dist-route.mjs` (Playwright request routing from disk);
  `scripts/cloud-kit-shots.mjs` takes `MI_URL`.
- Playwright uses fixed port 4176 with `reuseExistingServer`: never run two
  suites (or a suite and a preview) at once, or one tests the other's build.
- The Playwright suite renders in SwiftShader on the CPU: background load
  causes timeouts that look like product failures. Check load first.
- Sanctuary courtyard outer shoulders framing; debug map small; cliff wall
  colliders are one box; the ravine's water is the sea plane.
- `feature/physical-stage-passages` is superseded and can be deleted.

## Next Steps
1. Review the X1 correction: `.tmp/shots/expansion/x1/map.png`, rendered
   views (no-port capture), budgets, unit tests, `act3.spec` + `debug.spec`.
   Accept → commit on `exp/x1`, merge into `feature/act3-cloud-isle`.
2. X2 (junction, Skyroot Canopy, Thunder Grotto at scale) then X3
   (observatory, beacon surroundings, landmarks, camera, performance, final
   ≥3× measurement) — sequential, same files. Reuse the X1 order shape.
3. Full Playwright suite, final report with area/route numbers, screenshots
   and performance.
4. User decision: merge `feature/act3-cloud-isle` into `main` (deploys).
5. Chromebook play-test with `?debug=1`.

## Codex / Delegated Work
- **X1 correction** in flight in `~/Projects/monster-island` (`exp/x1`).
  Never accept its output unreviewed; never overwrite its pending changes.
- Worktrees: `~/Projects/mi-base` (controller acceptance runs, on this
  branch), `~/Projects/mi-wall` and `~/Projects/mi-kit` (merged; removable).
