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

## Ready to merge: branch `feature/act3-cloud-isle`
Pushed through `b972592` (2026-10-31). Not merged to `main`. Merging
(= deploying) needs the user's approval. Verified at `b972592`: tsc, 318 unit
tests, build, full Playwright 51/51 (51 min).

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
  `mi.debug.save`. The normal URL ignores the shortcut.

- Slice L: the Cloud Isle ship is locked with a Coming Soon notice. Release by
  setting `CLOUD_ISLE_RELEASED = true` in `src/game/release.ts`. `?debug=1`
  exposes a session-only ship toggle; Cloud Isle jumps and travel home still work.

## Known Issues
- Nothing has been tested on a real Chromebook (SwiftShader only): speech,
  TTS voices, audio levels, fight difficulty (now including ranged enemies
  and non-homing shots), GPU frame rate. Lowland stage views reach ~133k
  triangles.
- Sanctuary courtyard outer shoulders: the player is tiny in frame, and at
  the west edge partly behind a rock.
- Debug map shows only ground walkable at the current story progress (a fresh
  save shows just the start beach) and is small.
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
Slice K implemented locally at the existing Cloud Isle layout: attachment-based
environment kit, connected trees/branches, supported bridges and prop repairs;
no collision or gameplay changes. Home-island trees inspected and unchanged.
Typecheck, 341 unit tests and build passed. The required
`npx playwright test tests/e2e/act3.spec.ts` exited 1 before test startup because
the sandbox refuses the preview listener (`listen EPERM`, port 4176). Rendering
evidence and Act 3 acceptance remain outstanding. Evidence status:
`.tmp/shots/expansion/kit/render-report.json`. No commit or push.
