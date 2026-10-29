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

## In development: branch `feature/act3-cloud-isle`
Pushed through `9737f68`; the merge of Part 1 below is local until pushed.
Not merged to `main`. Merging (= deploying) needs the user's approval.

- **Act 3 "Cloud Isle: Above the Storm"** — complete (slices A–C, commits
  `7903823`, `6ffb4e9`, `9737f68`). Spec `docs/ACT3_CLOUD_ISLE.md`. Verified at
  `9737f68`: tsc, 223 unit tests, build, act3.spec 3/3 (≤120 calls, ≤66k
  triangles), full Playwright 23/23.
- **Gameplay polish Part 1** (`docs/GAMEPLAY_POLISH.md` items 1, 3, 4, 5, 6,
  7, 11: bridges, 99-food bag, pillars, tent, 10-coin inn, Fern Crossing,
  view beyond the lair) — built by Codex on `feature/gameplay-polish`
  (worktree `../monster-island-polish`), reviewed by Claude from
  `.tmp/shots/polish/` there, committed `f95bf04`, merged into this branch.
  Merge fixes: union of `combat.ts` imports; the `rest` Focus kind restored
  (Cloud Isle's Hollow and observatory rests use it; the Act 2 camp rest stays
  gone).
- **Gameplay polish Part 2** (items 2, 8, 9, 10) — split into two sequential
  Codex slices because they share the harness and decisions files:
  - **2a** camera profiles everywhere: `.ai/work-order-polish2a.json`.
  - **2b** straight projectiles, ranged enemies, companions leaving combat:
    `.ai/work-order-polish2b.json` (runs after 2a is reviewed and committed).
  `.ai/work-order-polish2.json` is the superseded single order.

## Known Issues
- Nothing has been tested on a real Chromebook (SwiftShader only): speech,
  TTS voices, audio levels, fight difficulty, GPU frame rate. Lowland stage
  views reach ~133k triangles.
- The Playwright suite renders in SwiftShader on the CPU: background load
  causes timeouts that look like product failures (camera.spec failed at ~50%
  CPU and passed alone on 2026-10-30). Check CPU load before diagnosing.
- The cliff wall's colliders are one box. The ravine's water is the sea plane
  showing through.
- `feature/physical-stage-passages` is superseded and can be deleted.

## Next Steps
1. Review slice 2a (camera) from `.tmp/shots/polish2/camera/` and the full
   suite; commit.
2. Dispatch slice 2b through the router; review combat/companion screenshots
   and the full suite; commit; push the branch.
3. Final report to the user; merge to `main` only with their approval.
4. Play the live game on a school Chromebook.

## Codex / Delegated Work
- Slice 2a: see the latest `.ai/result-polish2a.json`. If it is missing or
  in flight, do not edit this worktree; never re-delegate it.
