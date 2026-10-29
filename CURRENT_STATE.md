# Current State

## Development work (not deployed)

`feature/act2-forest-expansion` expands the five combat stages, adds permanent
first-clear exits and active-only hostile-zone companions, repairs the descent
cliff and adds an earlier landscape overlook. Review details, measurements and
Chromebook checks: [Act 2 expansion](docs/ACT2_FOREST_EXPANSION.md).
Validation: 141 unit tests, TypeScript and production build pass; all 19 browser
checks verified across the full suite and targeted visual rechecks. Both screen
sizes and normal-speed two-way descent are captured. Real Chromebook hardware
and microphone validation remain outstanding. The live status below describes
main before this feature branch.

## Status
**Act 2 is live.** With the user's approval, `feature/act2-hunt-for-lumo`
was fast-forwarded into `main` on 2026-10-29 (`02bc281`). The Pages workflow
(run 40781012500) passed its tests, built and deployed. The live site serves
the tested bundle (`index-BdbnZuVW.js`).
Pages: https://nolancasama.github.io/monster-island/

Act 2 "The Hunt for Lumo" is complete for its first chapter. The original
adventure becomes the prologue. After Lumo comes the kidnapping cutscene
(airship, cage, reveal), Maple's quest, the rope down the sanctuary cliff,
the Primeval Forest tutorial, Fern Camp, then Flooded Grove / Ancient Canopy,
the Ruined Causeway with its shortcut gate, the Coastal Path and Port Town:
market, kitchen with the first treat upgrade, trainer, inn, and the harbour's
lead (Cloud Isle). Combat is real time in the world (J/K, held J, 1–4 switch,
F eats). One HP pool, MP per friend, coins, food, respawns after 12 s away.
Save v4 (`mi.save.v4`); v1–v3 still load and are never overwritten. A
finished save gets "NEW! Act 2" on the title. What was accepted, changed and
decided is in `DESIGN_DECISIONS.md` (the two 2026-10-29 sections at the top).

Commits: `924b5c3` (milestones 1–2), `c064537` (3), `e4d1b48` (4: tunnel
render budget, camera spec fix, decisions).

**Private preview** (the same build as the live game):
https://claude.ai/artifact/UKRJgebxGLhVAtk3ySYNtr. Its saves are kept apart
from the live game's, and the microphone is blocked inside it (Tap mode). The
live game is now the place to test on Chromebooks, with a real microphone.
The older preview (https://claude.ai/artifact/8tLLTpHHi369KVjLZUi1M5) is a
pre-Act 2 build (`e3d6d3c`).

## Verified 2026-10-29 (branch, `e4d1b48`)
- `npx tsc --noEmit` clean; `npm test` 129 unit tests pass.
- Full `npx playwright test`: 15/15 pass in 9.0 min on an idle machine,
  including `act2.spec.ts` (6 tests) and the updated camera/volcano specs.
- The camera spec failed 3 times in a row before the fix. Cause: the lowland
  was drawn while the camera was in the tunnel, which halved the tunnel's
  frame rate. The spec also measured the follow camera's catch-up along with
  the move. Its fixed version was checked with one known-good pass and one
  known-bad fail (Left and Right keys swapped).
- Render budget at the tunnel views is back to `main`'s (50–59 calls, ~40k
  triangles). Lowland views 39–112 calls, ≤108k triangles; sanctuary views
  up to 120 calls.
- Visuals judged by Claude from screenshots: the whole Act 2 sequence at
  1366×768 (`.tmp/shots/act2-1366x768`). Clean combat-position views at
  1280×800 (`.tmp/shots/ride-1280x800`): Ember piggyback, Bubbo, Leafy on
  the backpack, Puff on the shoulder, no visible intersections, the HUD
  fits.
- GitHub `test.yml` passed on the branch (run 40778698063, `8582a65`:
  typecheck, unit tests, build and the Playwright suite).

## Known Issues
- Nothing has been tested on a real Chromebook (SwiftShader only): speech
  for Phase 2–3 and the town sentences, TTS voices, audio levels, fight
  difficulty and pacing, GPU frame rate in the town.
- The whole Act 2 sequence was captured at 1366×768 only. At 1280×800 only
  the combat positions were captured.
- The Playwright suite renders in SwiftShader on the CPU: another heavy
  process causes timeouts that look like product failures. Check CPU load
  before diagnosing a red run.
- The cliff wall's colliders are one box; the seeded rocks at its foot are
  not individually solid. The ravine's water is the sea plane showing through.

## Next Steps
1. Play the live game on a school Chromebook: title → "NEW! Act 2" (or
   Continue a finished save and walk up to Lumo) → kidnapping → rope at the
   lookout → forest tutorial → a route → town → market, kitchen, harbour.
   Check the speech for the town sentences, the fight difficulty and the
   town's frame rate.
2. Polish from classroom feedback. The next chapter (Cloud Isle) is not
   planned yet.

## Codex / Delegated Work
None pending. Act 2 was built by Claude directly across two sessions. The
milestone 4 fixes were diagnosed and made directly (a small, localized fix).
