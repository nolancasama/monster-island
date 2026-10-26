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

## Polish pass 2 (2026-10-26, branch `claude/blissful-volta-dscgid`)
All 12 reported issues are implemented on the development branch. `main`
and the live Pages site are unchanged and nothing has been merged or deployed.

- **#1 Bubbo ride:** the rider sits on a saddle on Bubbo's back, from shared
  height code (`game/ride.ts`), legs astride, and hops on and off.
- **#2 Pickup:** a squat with planted feet (knee IK), a lean, a reach, and
  the food in the hand.
- **#3 Menu:** Speak/Tap is now only in Settings and is remembered. Settings
  now opens above the title card; it used to open hidden behind it.
- **#6, #10 Chapter endings:** the beach and forest endings show a short
  "Clear!" banner and play continues. Only the finale shows the results card.
  Save values are unchanged.
- **#11 Cooled lava:** a shared walking surface (`lavaCrustY` via `standY`).
- **#4 Controls:** movement follows the rendered camera. The tunnel camera
  turns along the passage smoothly, and against the mountain the camera
  comes in closer instead of climbing the rock.
- **#7 Puff and the rope:** Puff's flight stays clear of the cliff. The coil
  vanishes in a poof and a carried coil stays with Puff until it is tied.
- **#8 Climb:** follows the drawn rope, keeps the body clear of the rock, and
  mantles over the lip.
- **#5 Island edges:** the north of the island is one landmass: a plateau,
  the volcano with its crater at (78, -104), a ridge over the tunnel, the
  sanctuary on a shelf, and slopes and sea stacks down to the sea
  (`massifY`, `models/highlands.ts`).
- **#9 Volcano view:** the cliff-top reveal frames the whole volcano.
- **#12 Cave entrance:** rebuilt. The arches stand in front of the lining,
  portal walls close the ridge, nothing is coplanar, and the tunnel runs
  straight into the courtyard.

**Verified 2026-10-26:** `tsc` and `npm test` pass (100 unit tests). The full
`npx playwright test` passes (9 specs, 9.4 min), including the new
`menu.spec.ts` and `camera.spec.ts` (all four directions at 7 cave and
sanctuary spots, with the camera turned by hand) and updated
loop/forest/volcano specs.

Screenshots were checked for:
- the ride, the squat and the cooled lava;
- Puff's flight and the climb up the face;
- the island from far away and after leaving the cave;
- the cave entrance dark and lit, from the front, side, an angle and close up;
- the volcano reveal at 1366×768 and 1280×800.

Render budgets were compared with `main` at the same views: triangles are
equal or lower everywhere. Looking back across the island from the garden
drops from 173 to 122 calls and from 154k to 115k triangles. The beach spawn
view is 107 calls and 121k triangles, against 96 calls and 123k on `main`.

The climb over the lip was also checked on the game's own climb camera: the
player rises to the edge and stands up on the top with no fade and no rock
through the body. There is no close-up of the knee coming up onto the edge.

**Chromebook preview:** https://claude.ai/artifact/8tLLTpHHi369KVjLZUi1M5
- A private build of commit `e3d6d3c`. The live game is unchanged.
- The microphone is blocked inside the preview, so answers are tapped.
- Saves are kept apart from the live game's.
- To update it, rebuild and republish the same preview page with the new
  `dist/assets` files.

**Not verified:**
- Nothing has been tested on a real Chromebook (SwiftShader only).
- The new `test.yml` workflow has not run on GitHub yet.

## Known Issues
- Real speech recognition (Phase 2–3 sentences), TTS voices, audio levels,
  classroom pacing and real Chromebook GPU performance are untested
  (SwiftShader only).
- The Playwright suite renders in SwiftShader on the CPU: another heavy
  process on the machine causes timeouts that look like product failures.
  Check CPU load before diagnosing a red run.
- The cliff wall's colliders are one box; the seeded rocks bulging out at its
  foot are not individually solid.
- The ravine's water is the sea plane showing through.

## Next Steps
0. Review the development branch (and, if wanted, a private preview for the
   school Chromebook), then merge to `main` to publish.
1. Play it on a real school Chromebook with a class: speech acceptance for
   the Phase 2–3 sentences, the climb's pace (5 s each way), whether the
   pillar gate is clear, total length (~31 min in the e2e playthrough).
2. Polish from classroom feedback; no Phase 4 is planned (the story ends).

## Codex / Delegated Work
None pending. The collision overhaul was built by Codex via the router and
corrected/accepted by Claude; the visual and interaction fixes were done by
Claude directly (Codex was at its usage limit).
