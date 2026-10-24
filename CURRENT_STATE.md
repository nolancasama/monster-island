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
