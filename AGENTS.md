# AGENTS.md

## Target device

This game runs on school Chromebooks (Lenovo 500e Gen 4: Intel N100-class CPU,
integrated Intel UHD GPU, assume 4 GB RAM, 1366 × 768). Read
`docs/CHROMEBOOK_TARGET.md` before adding features, assets or tests.

- Stable 30 FPS minimum, 60 preferred. Budgets: 50k–150k visible triangles,
  under 100–150 draw calls, 512–1024 textures.
- Never cut English-learning content, core mechanics, collision reliability or
  key NPC interactions for performance.
- Label performance results "desktop benchmark" (this PC) or "Chromebook
  measured". Dev-PC FPS is never Chromebook FPS; budgets are the Chromebook guard.

Record meaningful decisions in `DESIGN_DECISIONS.md`.

## Testing

Follow the machine-wide workflow at `C:/Users/nolan/.claude/testing/TESTING_WORKFLOW.md`
before writing or running browser tests. The self-contained kit is in `tests/support/`.

Preview port **4176**, or **4276** in a git worktree (`.git` is a file);
`PREVIEW_PORT` overrides it. Global setup compares the served HTML with the
current `dist/index.html` (`WRONG_SERVER` on mismatch) and logs the WebGL
renderer. Every browser run goes through the npm scripts, which take the
machine-wide lock before building: never bypass it or stop another agent's run.

| Tier / check | Command | Scope |
| --- | --- | --- |
| 1 Functional | `npm run e2e` | `tests/e2e/` (129 tests, incl. budget checks) |
| 2 Visual | `npm run e2e:visual` | `tests/visual/` (the 8 `zz-*-shots` suites, 61 tests) |
| 3 Performance | `npm run e2e:perf` | `tests/perf/scenes.spec.ts` (desktop benchmark) |
| 4 Full regression | `npm run e2e:full` | all tiers |
| Compatibility | `npm run e2e:compat` | functional on SwiftShader |
| Kit | `npm run test:kit` | lock and server-identity self-tests |

One spec: `npm run e2e -- tests/e2e/save.spec.ts`. `PW_WORKERS=2` is eligible
here (benchmark: 500 s → 355 s, −21% CPU work, identical results); the wrapper
falls back to one worker when the machine is busy. `npm run shots`
(`scripts/shots.mjs`) still uses SwiftShader; switching it to the GPU means
re-capturing and reviewing its evidence first.

### Test map

| Spec | Covers |
| --- | --- |
| `loop`, `forest`, `forest-u` | Act 1 loop: discover/befriend, forest bridge and cliff, the U route and its budget |
| `act2`, `act3`, `volcano` | Act 2 start, Act 3 chapter (routes, boss, ending), volcano/sanctuary |
| `expansion`, `vertical-expansion`, `grove-canopy`, `water-ropes` | Forest clear and companions, Grove door and verticals, elemental attacks, ropes/flying |
| `combat-feel`, `combat-polish`, `companions-polish`, `elements` | Combat input, projectiles, companion stances, specials |
| `pirate-voyage`, `port-gate`, `port-town-extras` | Voyage to Cloud Isle, port doors, Port Town NPCs |
| `camera`, `beach-side`, `continuity` | Camera profiles, side-on framing, continuous geography |
| `menu`, `save`, `debug`, `speech`, `seven-improvements`, `polish` | Title/settings, save/Continue, debug travel, speech sessions, conversation/facing fixes, Part 1 polish checks |

Run **all of Tier 1** after changes to shared systems: game loop/store, input,
camera, save/progress, speech/audio, scene/world loading, collision, combat
core, renderer setup, build config or test setup. Budget checks live in
`act3`, `combat-polish` and `expansion`; keep them in Tier 1.
