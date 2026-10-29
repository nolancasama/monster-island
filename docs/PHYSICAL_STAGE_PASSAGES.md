# Physical stage passages

The stage exits now have opaque, closed-backed chambers. Unlocking an exit
withdraws its separate blocker while the chamber remains in place. Walking
into it fades out, transfers the player to the paired mouth, and fades back
in. No interaction button is required. The existing world coordinates,
first-clear flags, enemy reset rules, puzzles and panorama remain in use.

## Plan decisions

Accepted the proposed physical entrance, movement, visibility and persistence
requirements. Added a second Old Trail connection so both shortcut ends are
proper passages: nine connections, eighteen directed entrances in total.
Each connection has its own hollow-tree, root, trunk, stone or rocky shell.
The original Ember shortcut puzzle remains mandatory in both directions.

Entering an uncleared combat stage backwards grants a return permit for that
mouth until the player leaves the stage. The permit survives a reload and
does not count as clearing enemies. This prevents the unused optional branch
from trapping players returning from Causeway. Ordinary forward progression
still requires the stage's first clear.

## Implementation

- `world/transitions.ts` owns paired mouth positions, inward normals, entry
  triggers, arrival pads, clear conditions and passage collision. Normal
  movement stays in its current zone; the transfer changes zones while black.
- `flow/passages.ts` owns the short fade, cancellation token, outward facing,
  input cooldown, party placement and stable save position. Hostile-to-hostile
  travel settles the selected combat stance immediately; safe arrivals dismount.
- Follower targets stay on the stage floor when their usual position behind
  the player would fall inside a passage. The regular formation resumes outside.
- `scene/StagePassages.tsx` and `scene/models/passages.ts` draw opaque linings,
  backs, roofs and distinct exteriors. Blockers retract independently. Each
  endpoint uses one merged shell mesh and one blocker mesh; only the current
  zone's endpoints are visible.
- `CameraRig.tsx` keeps both desired and smoothed camera positions within a
  passage's clearance when the camera enters it or follows an arrival out.
- Save v4 retains its key and earlier migrations. Mid-transfer saves use a
  stable position outside the source or destination mouth. Older positions
  inside a new passage normalize to their own side without losing progress.

Detailed neighboring scenery and inactive enemy simulation continue to use
the existing zone culling. The high sanctuary overlook keeps its distant
landscape silhouettes. The small floor changes around the new shell footprints
retain the expansion's 1.8–2.2× playable-area requirement.

## Validation

TypeScript, the production build and all 156 unit tests pass. Unit coverage
includes all eighteen mounted/walking entry pads, shell side/back collision,
level interior floors, independent branch reachability, save normalization,
retreat permits and raycasts proving each shell's open mouth and opaque interior.

Measured playable areas after adding solid shells (same 0.5 m sampler as the
expansion): Forest 552.75 m² (1.933× original), Grove 840.25 (1.808×), Canopy
431.75 (1.824×), Causeway 1123.75 (1.871×), Coast 454.50 (1.818×).

The full Playwright suite passed 22/22. Focused passage rechecks passed 2/2
after the wall-surface cleanup and the added held-input and partial-vitals
assertions. The final follower-placement browser check passed 1/1, and all six
locked, unlocked and arrival captures were refreshed and visually inspected at
both requested resolutions. No known functional issues remain from these checks.

The browser checks cover all eighteen directions with real walking, first-clear
locks and enemy knockouts, both independent branches, shortcut locks on both
sides, reverse entry into uncleared branches followed by reload and retreat,
respawns, old town saves, Bubbo/Ember mounts, safe-area followers, joystick input,
resource retention, and the original adventure, story and camera regressions.

Locked, unlocked and arrival screenshots are saved in `.tmp/shots/passages/`
at 1366×768 and 1280×800, alongside `report.json`. Expansion and panorama
captures remain in `.tmp/shots/expansion/`. The twenty expansion stage views
sampled at most 58 draw calls and 34,307 triangles. These are render-budget
observations, not a hardware FPS measurement.

Physical Chromebook performance and real microphone behavior remain hardware
checks; the cloud browser uses software WebGL and the existing speech stub.

This branch is for review. It is not merged into `main` or deployed.
