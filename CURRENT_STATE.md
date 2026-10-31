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
  - **X1 — coast, Hollow, tunnel at scale on one island** (`0a11f16`,
    merged `a28b0b4`): dock, Stormbreak Coast, Hidden Hollow and back tunnel
    re-laid at scale; later areas moved rigidly for X2/X3. Ground is one
    island heightfield (`src/game/world/cloudTerrain.ts`, spec §2a) with
    paths carved in, rendered as 7 banded chunks (~42k triangles). Save
    remap via `act3.cloudLayout: 2`. Top-down map: `node scripts/cloud-map.mjs`.
  - Because Cloud Isle is locked, the branch could be merged to `main`
    without exposing Act 3 — after a full Playwright run.

Verified at `a28b0b4`: tsc, 365 unit tests (`--maxWorkers=4`), build; X1
views ≤106 calls / ≤83k triangles at 1366×768 and 1280×800; Act 3 full
chapter 1366×768 passes (56 min). The 1280×800 touch chapter and the
debug spec have not been rerun to completion on X1 (they time out at their
default limits on this machine; see Known Issues). Lock/wall specs passed
before X1.

## Expansion progress
Measurement: `node scripts/measure-cloud-area.mjs`.

| | Baseline (`f108ed9`) | After X1 | Final target |
| --- | --- | --- | --- |
| Walkable floor | 3,133.5 m² | 6,002.5 m² | ≥ 9,400 m² |
| Dock → beacon via canopy | 195.8 m | 424.7 m | ≥ 392 m ✓ |
| Dock → beacon via grotto | 200.8 m | 430 m | ≥ 402 m ✓ |

Remaining ~3,400 m² comes from X2 (junction ~900, canopy ~1,500, grotto
~1,500 m²) and X3 (approach, observatory ~1,100, beacon summit).

X1 visual items carried into X2/X3: the Hollow shell pillars and back-tunnel
walls are large flat dark slabs; the mountain is hidden by fog from the dock
(landmarks are X3); `scripts/cloud-x1-shots.mjs` cannot settle the
coast-waterfall-view camera at the coast gate.

## Known Issues
- **This machine (6-core A18 Pro) is slow for SwiftShader**: since X1 the
  terrain fills the screen and the full Act 3 browser chapter takes ~56 min
  (`MI_LONG_TIMEOUT=3600000` raises its limit). Vitest's default
  parallelism stalls tests for 10+ min here; use `--maxWorkers=4`
  (whole suite ~15 s). Real-GPU frame time on a Chromebook is unmeasured.
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
1. X2: Windfall Junction, Skyroot Canopy, Thunder Grotto at scale on the
   heightfield (spec §2, §2a). Give the giant canopy trees real terrain
   beneath; keep the 45-minute Codex limit in mind — split into a world/
   layout order and a rendering order, as X1's terrain was (T1/T2).
2. X3: observatory, beacon summit, landmarks (mountain from the dock,
   observatory from the junction, beacon from the observatory), camera
   review, Hollow/tunnel slab polish, final ≥ 3× measurement, performance.
3. Full Playwright suite (with `MI_LONG_TIMEOUT`), final report with
   screenshots and measurements.
4. User decision: merge `feature/act3-cloud-isle` into `main` (deploys).
5. Chromebook play-test with `?debug=1` — including frame rate on Cloud Isle.

## Codex / Delegated Work
None in flight. Codex's sandbox cannot bind ports or launch Chromium, so
the controller captures all rendered evidence (`scripts/lib/dist-route.mjs`
serves `dist` without a port). Codex runs are limited to 45 minutes: keep
orders narrow and name exactly what to read.
- Worktrees: `~/Projects/mi-base` (this branch; controller acceptance),
  `~/Projects/mi-wall`, `~/Projects/mi-kit` (merged; removable). The main
  checkout `~/Projects/monster-island` is on `exp/x1` (merged).
