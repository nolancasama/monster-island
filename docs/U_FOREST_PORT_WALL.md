# Beach side view, U-shaped Primeval Forest, Port Town wall — frozen spec (2026-11-02)

Source: the user's brief of the same name. Change this file only through the
controller and record why in `DESIGN_DECISIONS.md`. Work stays on a feature branch;
merging or deploying needs the user's explicit approval.

## 0. Controller verdict

Accepted as written: fixed side-on beach, U around an inaccessible mesa with arms
that enter Flooded Grove and Ancient Canopy directly, removal of Fern Crossing, the
Old Trail and the shortcut, Port Town wall and gate with no new quiz, save migration.

Changed or added:

1. **The mesa's footprint is bounded by the camera.** The lowland camera sits 8.5 m
   south and 5.2 m above the player. A mesa running to the causeway would put the
   camera inside rock on the causeway and at both exits. Footprint is limited as in
   §3, and a unit test checks the camera position for all walkable ground.
2. **The first clear stays in the base of the U.** Clearing counts every spawn in a
   zone, so arm enemies would force both arms. Spawns gain `optional?: true`:
   the five tutorial enemies stay required in the base; arm enemies are optional, do
   not count in "Enemies remaining", and respawn normally.
3. **Stage gate at both necks, not at the far ends.** Clearing the base opens both
   arms at once. Far-end gates would let a player run the length of an arm only to
   be sent back.
4. **A safe camp is kept, off the route.** Deleting the `camp` zone removes the only
   safe zone and wake point between rope and town, and its safe-zone behaviour. Zone
   id `camp` stays (so saved checkpoint values keep meaning), renamed **Forest Camp**,
   moved to a small alcove off the base near the rope foot, with the tent and fire.
   It is not a junction: nothing routes through it. Clearing the base also sets the
   `camp` checkpoint, so a player who never visits it still wakes there.
5. **Arm length has a real bound.** Grove and canopy keep their positions (puzzles,
   chests, secrets, Act 3 tests depend on them), so arms live in x ∈ [38, 118].
   Target each arm ≥ 40 m from neck to next-stage boundary, half-width 4–5.5 m, with
   side pockets. A much larger U would need moving both stages. Not doing that.
6. **Town gate camera.** Just inside the gate the camera is south of the wall, which
   would hide the player. A raised gate profile (§5) and a line-of-sight test fix it.
7. **Removing the shortcut removes Ember's only Act 2 "Can you…?" unlock**
   (`causewayGate`, `canFire`). Accepted, as asked; called out in the report.

Rejected: a playable mesa summit, a route through the mesa, moving Grove or Canopy,
extra fights to open the town gate, invisible-wall-only collision visuals.

## 1. Beach camera (slice M1)

`src/scene/cameraProfiles.ts`: west-beach, east-beach, palm-pass, pier, river-bridge,
far-bank use `yaw: 0` (camera over the sea at +z, looking inland; +x is screen right).
Framing about pitch .42, dist 11, ahead 1.5; consistent across all of them, including
pier. Inland profiles are already yaw 0, so the handoff is a framing blend only.
New optional `lead` on `CameraProfile`: smoothed horizontal look-ahead along +x/−x from
the player's velocity, at most 2 m, in `CameraRig.tsx`. Never rotates with the player.
Scripted shots unchanged. Movement already reads the rendered camera yaw, so D is east.

## 2. Forest layout (slice M2, `src/game/world/lowland.ts`)

```text
   grove (unchanged)         canopy (unchanged but for its first metres)
        \                       /
     LEFT ARM     MESA     RIGHT ARM      zone: forest1
        \                       /
       left neck ─ BASE ─ right neck      stage gates "forest1" at both necks
                    |  \
                  rope  Forest Camp alcove (zone: camp, safe)
```

- Remove: `oldTrail` zone, `OLD_TRAIL`, `SHORTCUT_GATE`, `GATE_CUT`, the shortcut's
  focus, travel and obstacle code, `FORK_SIGN` at the fork, opening "saddle" for the
  fork, first points of `GROVE_TRAIL` (72,-199.5),(61,-203.5) and of `CANOPY_TRAIL`
  (81,-199),(92,-201) so no walk shape survives inside the mesa footprint.
- Base keeps today's clearings and side loops (z −154 to about −183), its chest,
  `rootHollowChest` and the `emberThicket` site; the northward exit is closed.
- Left arm from the base's west loop, about (58,−172) → (47,−175) → (41,−185) →
  (41,−197) → grove's west disc. Right arm from about (94,−170) → (104,−174) →
  (113,−184) → (113,−194) → (102,−201) → canopy. Tune so `emberThicket`, secrets and
  canopy discs are untouched. Grove and canopy spawn at the removed points move inside
  their zones and keep kind and count.
- `STAGE_EXITS` may hold two entries per stage and gains a barrier orientation; cuts
  span only their own neck. Keep every other stage's gate and passage footprint.
- Arm terrain: left arm's `base` falls gently toward the grove (wet); right arm rises
  to meet the root walk with no step at the zone boundary. A test checks height steps.
- `ROUTE_MARKERS` becomes per-side in the forest (nearest arm by player x). Sign moves
  to the base, says left and right. All dialogue, hints, journal and toast text
  describing three choices or the crossing is rewritten (en and ja, easy kana).
- 3–4 optional enemies per arm, `zone: "forest1"`, `optional: true`, placed so leash
  and home points stay on their own arm. Enemy zone-guard rules unchanged.
- `camp`: alcove disc about r 5.5 east of the rope foot near (88,−160), joined to the
  base, away from required spawns' notice range. Wake at `CAMP2.rest`.
- Debug jumps, `debugProgress`, `debugTravel` and `travel.ts` follow the new map.

## 3. Mesa (slice M3, `src/scene/models/lowland.ts`, `Lowland.tsx`)

- Footprint: an irregular closed outline inside x ∈ [63, 90], z ∈ [−231, −187], data
  `MESA_OUTLINE` in `lowland.ts`. Nothing walkable within 1.5 m. Rises 18–22 m.
- One merged low-poly mesh, one draw call: stepped strata with a jagged silhouette,
  overhang-free, vertical faces, moss bands in vertex colour, its base skirt buried
  below the terrain so no gap shows. Under 6k triangles. A plateau with a few
  low-poly trees and an optional ruin, in the same merged mesh.
- Collision comes from walkability; add the outline as a solid as well so a future
  shape cannot open a hole. Keep bank shoulders high around it.
- Include it in `CameraRig`'s `lift` floor sampling and in view culling. The sanctuary
  view of the basin must stay in budget.
- Arm dressing with reused instanced vegetation: left gets pools (decor water), reeds,
  moss, streams, denser green nearer the grove; right gets giant trunks, exposed roots
  and rock nearer the canopy. Solids registered in `lowlandSolids`.

## 4. Save migration (with M2, `src/game/logic/save.ts`)

- Add `act2.forestLayout: 2`. On load without it:
  - Saved `act2.zone` of `oldTrail` becomes `forest1` (camp stays camp).
  - A saved position in the old camp, old trail or any point not walkable under the new
    map moves to `CAMP2.rest` when the camp checkpoint is valid and otherwise the rope
    foot. Grove, canopy, causeway, coast and port positions that remain walkable stay.
  - Read `causewayGate` to infer `cleared` first (existing rules), then drop it from
    `solved`. `checkpoint: "camp"` keeps its value and meaning.
  - Port access stays: `portFound` implies all stages cleared.
- Saves that used the shortcut but never cleared grove or canopy keep access through
  the now-cleared forest gates: `forest1` is in `cleared`.
- Older save versions still load and are never overwritten. Tests cover each case.

## 5. Port Town wall and gate (slice M4)

- Along z ≈ −288.4 from about x 46 to x 108, centred on `TOWN_GATE`, joined at both
  ends to rock outcrops that meet the terrain. Stays clear of houses and services;
  the walkable town rect does not change.
- Stylised: thick weathered stone, crenellated parapet, two towers flanking a timber
  double door with iron bands, banners, moss, lanterns, road through. A wavy top and
  buttresses, not a box. Merged geometry; doors separate so they can swing. ≤ 3 draw
  calls, under 8k triangles.
- Opening half-width 3.4 m (Ember mounted fits). Collision stays `coast` in `cleared`,
  through the existing `STAGE_EXITS` cut; bridge the cut to the wall's full span.
- Doors: pure `townGateOpen(cleared, distanceToGate)`, opening within 9 m once cleared,
  animating over about .7 s with a sound; once opened they stay open after arrival.
  Closed look before clear. No quiz or other interaction.
- Camera: new profile `port-gate` for z ∈ [−298, −282] with pitch about .85, dist 11,
  so the camera sees over the wall. Right against the wall's inner face no pitch clears
  it, so the wall, towers and doors use `occluderMat`, which fades the sight line.
- Inside: existing safe-zone logic, music, `arriveAtPort`, companion behaviour and
  services. Enemies stay out through `stepTo`'s zone guard. Leaving and returning works.

## 6. Budgets

Fights ≤ current draw calls + 4 near the mesa or gate; any view ≤ existing 140k-triangle
limit. Fixed camera throughout Act 2; existing camera budget spec keeps passing.

## 7. Acceptance

Unit: reachability from the rope to grove by the left arm only and to canopy by the right
arm only; no walkable path across the mesa; mesa footprint clear of walkable shapes;
camera outside mesa for all walkable points; arm length ≥ 40 m; required count unaffected
by optional enemies; either route reaches the port; no `oldTrail`, `SHORTCUT_GATE` or
"Fern Crossing" left in `src`; save migration matrix; wall line of sight; gate rule.

Browser (controller; Codex's sandbox cannot launch Chromium): beach left-to-right with
no rotation on reversal, palm, pier, river, stone; forest from the base and both arms;
mesa; gate closed, opening and passed; leave and return; touch. Screenshots in
`.tmp/shots/map/`. Existing Act 2 and elements specs updated for the new route.
