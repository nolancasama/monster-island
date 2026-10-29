# Current State

## Live
`main` = `201990a`, deployed by Pages run 40871708332 (2026-10-29).
https://nolancasama.github.io/monster-island/

Live: the prologue, Act 2 "The Hunt for Lumo" (kidnapping, lowland, real-time
combat, Port Town, harbour lead), the forest expansion (larger stages,
permanent first-clear exits) and the continuity polish (one continuous
lowland drawn by distance with constant fog, see-through gates, fixed lowland
camera, honest Eat button, finished chests). The decisions are in
`DESIGN_DECISIONS.md` (2026-10-29 sections) and `docs/ACT2_FOREST_EXPANSION.md`.
Save v4 (`mi.save.v4`); v1–v3 still load and are never overwritten.

**Private preview:** https://claude.ai/artifact/UKRJgebxGLhVAtk3ySYNtr
(Act 2 build before the expansion; microphone blocked inside it). Use the
live site for Chromebook testing.

## In development: Act 3 "Cloud Isle: Above the Storm"
Branch `feature/act3-cloud-isle` (from `main` `201990a`). It is not pushed yet.
- **Spec:** `docs/ACT3_CLOUD_ISLE.md` (frozen; it wins over the external
  brief). The changes to the brief are in `DESIGN_DECISIONS.md`, "Act 3 Cloud
  Isle: brief accepted, with these changes". Commit `2c9d994`.
- **Build plan:** three sequential Codex slices, because they share the save,
  runtime and flow files:
  - **A** — voyage + boat travel, dock, Stormbreak Coast, four enemies, Hidden
    Hollow and the family, stew, errands, back tunnel, junction stub, additive
    `act3` save.
  - **B** — Windfall Junction, Skyroot Canopy, Thunder Grotto.
  - **C** — Observatory dial, Storm Beacon boss, resolution, aftermath, full
    e2e and screenshots.
- **Slice A:** implemented by Codex. It is **uncommitted** in the working tree
  and under review.
  - New modules: `world/cloudisle.ts`, `scene/CloudIsle.tsx`, `flow/act3.ts`,
    `logic/act3.ts`, `ui/CloudStory.tsx`, `scene/models/cloudEnemies.ts`,
    `data/family.ts`, `tests/e2e/act3.spec.ts`.
  - Observed: `tsc` clean, 178 unit tests, build OK. `act3.spec.ts` 3/3 at
    1366×768 and 1280×800 (touch-only too). Shots in `.tmp/shots/act3/`, max
    93 draw calls / 38k triangles.
  - The full regression suite was running when this was written.
  - Save review: `readAct3` gates every field on its prerequisites and
    projects Cloud Isle positions onto valid ground.
- **Slice A visual defects to fix (folded into slice B's order):**
  - The "Raise the sail!" shot is blocked by the sail.
  - The voyage is a calm, sunny sea: no storm build-up, and no rocks for
    "Turn left!".
  - The Hollow is an open-air floor with void edges, not an enclosed cave
    behind a waterfall.
  - The reveal beat has no screenshot.
  - The summit's storm ring reads as a mushroom cap (slice C owns the summit).
- **Slice B must also extend** the `readAct3` puzzle filter in
  `logic/save.ts`, which only knows the two coast puzzles.

## Known Issues
- Nothing has been tested on a real Chromebook (SwiftShader only): speech,
  TTS voices, audio levels, fight difficulty, GPU frame rate. The continuity
  polish roughly doubled the triangles at lowland stage views (≤133k).
  Check the frame rate on a school Chromebook.
- The Playwright suite renders in SwiftShader on the CPU: a heavy background
  process causes timeouts that look like product failures. Check CPU load
  before diagnosing a red run.
- The cliff wall's colliders are one box. The ravine's water is the sea plane
  showing through.
- `feature/physical-stage-passages` was superseded by the continuity polish
  and can be deleted.

## Next Steps
1. Finish the slice A review (full suite result). Then commit slice A.
2. Run slice B (routes + slice A visual fixes) through the router, then
   review it.
3. Run slice C (observatory, boss, ending, full acceptance), then review it.
   Push the branch and write the final report: summary, files, commits,
   screenshots, tests, limitations, Chromebook test steps.
4. Merge to `main` (deploy) only with the user's approval.
5. Play the live game on a school Chromebook (Act 2 + continuity polish).

## Codex / Delegated Work
- Slice A (Codex, gpt-6.1-sol high, chain `800893f9`): done and uncommitted
  in the tree. Claude is reviewing it. Do not re-delegate it.
- Work orders: `.ai/work-order-act3a.json`; result `.ai/result-act3a.json`.
