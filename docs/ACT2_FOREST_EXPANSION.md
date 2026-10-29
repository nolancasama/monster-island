# Act 2 forest expansion review

Development branch: `feature/act2-forest-expansion`. Baseline: `d820c8053815134b25e7b0552445440ea926e128`. This work does not merge or deploy the live game.

## What changed

- **Cliff:** a continuous capped rock core connects the ledge to below the forest floor. Flush colour strata replace variable-depth climbing slabs. Closed wings join the garden rim. Three obsolete sea-stack rocks that protruded into the lowland are removed; genuine offshore stacks remain. Decorative rocks are moved outside the climbing clearance. The descent camera stays north of the face, including interpolation, and camera endpoints stay above terrain. The existing rope, climbing animation, and two-way interaction are retained.
- **Early overlook:** a small eastward extension of the sanctuary approach is accessible before the lair gate. It shows a separate merged low-detail landscape: forest crowns, mountain contours, coastline, port roofs and pier. Detailed combat stages, enemies and entrances are hidden from this view. Tunnel visibility remains restricted.
- **Larger stages:** Primeval has two side loops and a root-hollow chest; Grove has larger wet clearings, shallow channels and western loops around its existing optional islet puzzle; Canopy has expanded elevated platforms and an eastern root loop around the existing Leafy/Puff puzzles; Causeway has a wider stone arena and western treasure chamber; Coast has a bending approach, boulder passage, vegetation loop and optional chest. Camp and Port Town retain their locations and sizes.
- **Isolation (superseded):** the scenery isolation and opaque banks described here are superseded by `DESIGN_DECISIONS.md`, **2026-10-29 — Act 2 continuity polish**, Visibility and Camera. Enemies, projectiles and inactive enemy simulation retain their existing zone restrictions. Scenery now uses spatial tiles and distance visibility throughout the basin.
- **First clears:** five environmental exits use roots, aquatic growth, stone or timber. Collision blocks the full crossing, including mounted radii. Required enemy counts are 5 / 8 / 5 / 7 / 4 (Primeval / Grove / Canopy / Causeway / Coast). Either branch suffices. The first clear animates the exit opening with a short sound and toast. A small counter disappears after clearing; a final-enemy arrow is relative to the camera.
- **Companions:** only the active monster is visible and simulated in hostile zones, except the brief shrinking departure during a switch. Inactive friends keep their state and inventory. Safe areas restore normal following; story staging is retained. Manual J/K attacks, touch controls, riding/perching, food, shops and economy are preserved.
- **Atmosphere:** existing procedural insects and distant calls gain sparse rustling wind and branch creaks. Combat music responds to engagement; lonely stretches use the quieter danger theme. Moderate mist supplements solid terrain separation. Maple remains behind until the existing town arrival.

## Save compatibility

`mi.save.v4` gains a validated `act2.cleared` array. This permanent state is separate from temporary KO/respawn memory. Reloading an incomplete stage restarts its enemies; reloading a cleared stage cannot relock its exit. The existing 12 seconds of play elsewhere still controls respawning.

Older v4 saves without that array receive already-earned travel rights based on their saved area, checkpoint, shortcut and town discovery. Since an old Causeway save does not identify which branch was used, both branch exits are grandfathered there. Saves already beyond a new branch exit keep that return route too. Original puzzle positions and town coordinates stay in place. Invalid positions are projected onto valid collision ground using the existing save loader. Story, HP/MP, inventory, upgrades and the original save-key migration remain intact.

## Before/after playable floor

Measured in square metres on a 0.5 m grid, using a 0.35 m player radius, real solid collision, all puzzle bridges and all exits open. These are plan-view floor measurements, excluding props and water cut-outs, not bounding boxes or visual mesh scale. Baseline was measured before editing the checkout with the same sampler. Reproduce with `node scripts/measure-areas.mjs`; output is `.tmp/area-report.json`.

| Section | Before m² | After m² | Ratio |
| --- | ---: | ---: | ---: |
| Primeval Forest | 286.00 | 564.75 | 1.975× |
| Flooded Grove | 464.75 | 867.75 | 1.867× |
| Ancient Canopy | 236.75 | 467.00 | 1.973× |
| Ruined Causeway | 600.75 | 1164.75 | 1.939× |
| Coastal Path | 250.00 | 470.00 | 1.880× |

## Validation and captures

Results on 2026-10-29:

- **Unit tests:** 141 passed in 15 files; no skipped tests.
- **TypeScript and production build:** passed.
- **Browser checks:** all 19 verified across the full run and targeted recheck. The full 19-test run passed 18 and caught an initial-state timing assertion in the new visual test (it sampled the camera before the next rendered frame, during the existing black transition). Waiting for the rendered camera corrected that assertion; the targeted visual and town recheck passed 2/2. The final visual rerun after removing obsolete sea stacks passed 1/1, regenerating all captures. The preceding run also identified an old coast test coordinate, which was updated for the expanded Causeway. All 15 existing browser regressions passed after that correction.
- **Visual coverage:** two orbit angles per expanded area at both sizes; panorama; four cliff viewpoints per size; three normal-speed descent heights and an ascent midpoint. Captures are paused after the normal damage blink ends so the player remains visible.
- **Sampled rendering:** 37–58 draw calls and 19,110–36,147 triangles in the captured stage views (the exact values are in the capture report), below the existing documented upper bounds of 112 calls / 108k triangles. This is a draw-budget comparison, not a hardware FPS claim.

 The suite includes existing story, speech, save, town, camera and touch tests, plus real attack-driven stage clears, independent branch progression, retreat, re-entry, reloads, companion visibility and screenshots. Unit tests flood the routes with actual collision moves, check mounted exit bypasses, validate old saves, measure area, and raycast the cliff surface and rope clearance.

Commands:

```sh
npm test
npm run build
node scripts/measure-areas.mjs
npx playwright test --config .tmp/playwright.cloud.config.ts
```

The cloud runner uses its preinstalled `/usr/bin/chromium` with the existing SwiftShader arguments via the ignored local config. The repository's normal Playwright configuration still uses its standard installed browser. No application dependencies or lockfiles changed.

Captures are under `.tmp/shots/expansion/`: each expanded region, the panorama and cliff front/side/above/below at both 1366×768 and 1280×800; normal-speed descent at three heights and an ascent midpoint. `render-report.json` records calls, triangles and observed software-renderer FPS. These files are local review artifacts, not a live deployment.

## Chromebook acceptance pass

1. Open this feature build on an actual school Chromebook at both target sizes. Test keyboard/mouse and touch-only controls. Check normal frame rate, camera rotation near banks, stage boundaries and switching all four companions.
2. From a completed original save, approach the east overlook before Lumo's gate. Look for forest/coast/port silhouettes, then play the original finale and kidnapping. Descend and climb back; inspect hands, feet, rope and cliff from normal play cameras.
3. Clear Primeval manually. Confirm retreat is available, the last-enemy hint is useful, and the barrier opens once. Rest at Fern Camp; check all four followers reappear.
4. In separate fresh runs take Grove and Canopy. Finish only that branch, then Causeway and Coast to reach town. Solve the existing English ability puzzles; test the optional chests and Old Trail shortcut.
5. Leave a cleared zone for at least 12 seconds of play and return. Confirm enemies respawn while its exit stays open. Reload before and after a clear; repeat with an old town save.
6. Test real microphone recognition, classroom speaker bleed, TTS, audio levels and combat pacing. Browser tests stub speech and use CPU WebGL; they cannot establish hardware Chromebook performance or microphone quality.

## Affected files

| Responsibility | Files |
| --- | --- |
| Layout, walkability, gate cuts, terrain heights, placements | `src/game/world/lowland.ts`, `collision.ts`, `island.ts` |
| Cliff, panorama, vegetation, scenery and barriers | `src/scene/models/lowland.ts`, `src/scene/Lowland.tsx`, `CameraRig.tsx`, `src/scene/models/highlands.ts` |
| Required-enemy clears, zone activity, switching and rendering | `src/game/combat.ts`, `sim.ts`, `flow/companion.ts`, `src/scene/Combat.tsx`, `Monsters.tsx` |
| Save flags and migration | `src/game/logic/act2.ts`, `save.ts` |
| Counter, last-enemy hint and sound | `src/ui/Act2Hud.tsx`, `src/styles.css`, `src/audio/audio.ts` |
| Automation and evidence | `src/game/e2e.ts`, `src/game/world/lowland.test.ts`, `expansion-area.test.ts`, `src/game/logic/act2.test.ts`, `src/scene/cliff-surface.test.ts`, `tests/e2e/expansion.spec.ts`, `act2.spec.ts`, `helpers.ts`, `scripts/measure-areas.mjs` |
| Review context | `CURRENT_STATE.md`, `DESIGN_DECISIONS.md`, this report |
