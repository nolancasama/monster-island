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

## Recently shipped (2026-10-31)
Verified at `b972592`: tsc, 318 unit tests, build, full Playwright 51/51.

- **Act 3 "Cloud Isle: Above the Storm"** — slices A–C (`7903823`,
  `6ffb4e9`, `9737f68`). Spec `docs/ACT3_CLOUD_ISLE.md`.
- **Gameplay polish Part 1** (`docs/GAMEPLAY_POLISH.md` items 1, 3, 4, 5, 6,
  7, 11: bridges, 99-food bag, pillars, tent, 10-coin inn, Fern Crossing,
  view beyond the lair) — `f95bf04`, merged in `ec7e14d`.
- **Gameplay polish Part 2** (items 2, 8, 9, 10):
  - **2a** fixed camera profiles everywhere — `33ff066`.
  - **2b1** straight player projectiles, Forest Spitter / Raider Shooter,
    Wind Sprites on the same shot rules — `9f2a1ec`. Evidence
    `.tmp/shots/polish2/combat/`.
  - **2b2** companions leave combat in safe zones — `b972592`.
    `companions-polish.spec` was shown to fail without the fix.
- **Debug menu** — `3e6d1a2`. `?debug=1`, then Ctrl+Shift+D or backquote:
  story-aware jumps, travel map, x/z, free fly, cheats; separate save key
  `mi.debug.save`. On the normal URL, Ctrl+Shift+D reloads into `?debug=1`
  (backquote stays debug-only). Map click / x/z teleport reaches any ground:
  locked ground (muted green) applies the earliest story fixture that opens
  it (`src/game/logic/debugTravel.ts`; reachable layer cached per world).
  Verified: tsc, logic tests 127, build, `debug.spec.ts` 4/4.

## Known Issues
- Nothing has been tested on a real Chromebook (SwiftShader only): speech,
  TTS voices, audio levels, fight difficulty (now including ranged enemies
  and non-homing shots), GPU frame rate. Lowland stage views reach ~133k
  triangles.
- Sanctuary courtyard outer shoulders: the player is tiny in frame, and at
  the west edge partly behind a rock.
- Debug map: first open per world costs ~1 s (locked-ground layer, half
  resolution, so its edges are blocky).
- The Playwright suite renders in SwiftShader on the CPU: background load
  causes timeouts that look like product failures. Check CPU load before
  diagnosing. Workers must not run the full suite (exceeds their time limit);
  the controller runs it.
- The cliff wall's colliders are one box. The ravine's water is the sea plane
  showing through.
- `feature/physical-stage-passages` is superseded and can be deleted.

## Next Steps
1. User decision: merge `feature/act3-cloud-isle` into `main` (deploys).
2. Play it on a school Chromebook (use `?debug=1` to jump around); tune
   fight difficulty from that.
3. Optional polish: courtyard shoulder framing; bigger/whole-island debug map.

## Codex / Delegated Work
None pending; nothing uncommitted from workers.
