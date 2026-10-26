# Current State

## Status
**All three phases are complete and on `main`.** The game plays to the end:
beach → forest → cliff top → lava (Bubbo) → Ember + meat rack → dark cave
(Ember's fire) → four sanctuary pillars (one per friend) → Lumo → Maple →
The End → free exploration. Old saves (v1, v2) migrate to `mi.save.v3`.

On 2026-10-24, after Phase 3, a polish pass fixed nine reported bugs and
overhauled collision (see `DESIGN_DECISIONS.md`, the two 2026-10-24 sections
at the top):
- Collision: solids derived from shared placement records, walkable pier deck
  with solid posts, dynamic solids per gate state, save-position relocation,
  F3 overlay (dev / `?e2e=1` only), behaviour + reachability tests.
- Fixed: food visible-but-uncollectible after regrowth, "Your bag is full!";
  floating rope stake; rope through the cliff (now hung from measured rocks);
  hand-over-hand climb animation (player has knees); floating tree foliage;
  upside-down hearts; sign post through the board; lifted palm through its
  rock; walking through pier/supports/scenery.

Verified 2026-10-24: `npx tsc --noEmit`, `npm test` (84 unit tests),
`npx playwright test` (7 specs, all passing on an idle machine in ~4 min).
Visuals judged by Claude from screenshots at 1366×768 and 1280×800
(`.tmp/shots/forest-*`, `volcano-*`, `review-*`). Render budgets: beach and
forest follow views 41–103 draw calls, ≤117.5k triangles; Phase 3 views
26–86 calls, ≤110.7k triangles.

Published: repo https://github.com/nolancasama/monster-island, Pages
https://nolancasama.github.io/monster-island/ (every push to `main` runs the
unit tests, builds and deploys).

## Polish pass 2 (2026-10-26, branch `claude/blissful-volta-dscgid`, in progress)
A 12-item polish pass is under way on the development branch; `main` and the
live Pages site are unchanged. Passes A and B are done; Pass C has not started.

**Pass A (done):** #1 Bubbo ride (rider attached to a saddle on Bubbo's
body from shared height code in `game/ride.ts`, seated astride, hops on/off),
#2 pickup squat (planted feet, knee IK, reach, food in hand), #3 Speak/Tap
only in Settings, #6/#10 beach and forest endings show a short banner and play
continues (only the finale has the results card), #11 cooled lava is a shared
walking surface (`lavaCrustY` via `standY`).

**Pass B (done):** #4 movement follows the rendered camera's view, and the
tunnel camera turns along the passage smoothly (no hard snap). #7 Puff flies
a path that stays clear of the face (`ropeFlightPath`), the ground coil
vanishes in a poof, and a small carried coil stays with Puff until the rope is
tied. #8 the climb follows the drawn Catmull-Rom rope with the whole body kept
clear (`climbBodyZ`), then mantles over the lip to stand beside the stake
(`climbPath`, mantle pose). There is no fade at the top any more.
Also: Settings opened from the title screen was hidden behind the title card
(z-index) and is now fixed. A new `test.yml` workflow runs typecheck, unit
tests, the build and Playwright on branch pushes, PRs and manual runs, and it
never deploys. Pages deploys only from `main`.

**Verified so far:** `tsc` and `npm test` pass (95 unit tests: squat feet,
seat clearance, lava surface, curved-rope climb). Screenshots checked: ride,
squat, cooled lava, Puff's flight, the climb on the face.
**Not yet verified:** the mantle over the lip on screen. Playwright has not
passed on these changes yet: the one run (menu/loop/forest) used a build made
before the Settings z-index fix and failed on it, and was stopped. The new
`camera.spec.ts` has not been run. It assumes the Pass C tunnel layout (exit
facing the garden).

**Next (Pass C, planned):** replace the floating volcano region with one
landmass: a plateau, the volcano cone (moved to x 78, z -104) with a crater,
a rock ridge over the tunnel, the sanctuary on a shelf, and slopes and sea
stacks down to the sea. Rebuild the cave portals (face walls and arches in
front of the lining) and open the tunnel straight into the courtyard.
Reframe the volcano reveal. Then run the full Playwright suite, update docs,
and publish a private Chromebook preview. Drafts are in the session
scratchpad and not in the repo.

## Known Issues
- Real speech recognition (Phase 2–3 sentences), TTS voices, audio levels,
  classroom pacing and real Chromebook GPU performance are untested
  (SwiftShader only).
- The Playwright suite renders in SwiftShader on the CPU: another heavy
  process on the machine causes timeouts that look like product failures.
  Check CPU load before diagnosing a red run.
- The cliff wall's colliders are one box; the seeded rocks bulging out at its
  foot are not individually solid.
- The Phase 2 results backdrop still uses the beach camera; the ravine's
  water is the sea plane showing through.

## Next Steps
1. Play it on a real school Chromebook with a class: speech acceptance for
   the Phase 2–3 sentences, the climb's pace (5 s each way), whether the
   pillar gate is clear, total length (~31 min in the e2e playthrough).
2. Polish from classroom feedback; no Phase 4 is planned (the story ends).

## Codex / Delegated Work
None pending. The collision overhaul was built by Codex via the router and
corrected/accepted by Claude; the visual and interaction fixes were done by
Claude directly (Codex was at its usage limit).
