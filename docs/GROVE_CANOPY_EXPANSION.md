# Blue Inferno, Puff anchor, 360° vine swing, Grove crossing, Grove and Canopy expansion — frozen spec (2026-11-02)

Source: the user's brief of the same name. Change this file only through the controller and
record why in `DESIGN_DECISIONS.md`. Work stays on `feature/grove-canopy-expansion`; merging or
deploying needs the user's explicit approval.

## 0. Controller verdict

Accepted: all five goals, the ride → dismount → pads → return order, real player falls in the
Canopy only, smaller mesa, strict stage separation, everything in the brief's "preserve" list.

Changed or added, because the code makes the brief's wording wrong or unsafe:

1. **Inferno cannot be a tint.** The flame fragment shader mixes every flame toward yellow
   (`mix(c, vec3(1,.95,.36), …)`), so a blue tint renders green-white. Blue needs its own flame style.
2. **Puff's lag is not only a stale origin.** The gust is one fixed world-space cone alive for 0.6 s,
   so a walking player overtakes it whatever the origin. "Never pull a launched gust back" alone would
   still leave a cone behind Puff. Fix: the cone's root follows the live beak for a short attached
   phase, then releases and its tail runs forward faster than any player speed.
3. **The hit cone stays centred on the player.** Moving it to the beak changes balance and every
   combat test. Only the visual comes from the beak; both share the same yaw, tested.
4. **The swing must not abort or kill on terrain.** `displaceEnemy` ends a swing at any bank and
   knocks out at any hazard. In 4 m corridors and on Canopy platforms a 2.2 m orbit would almost never
   finish. While swinging the enemy is airborne on the tether, shrinks its radius to clear solids, and
   only meets hazards and walls after release.
5. **Release is straight out along the live aim, not tangential.** A tangent release 360° after a front
   grab flies sideways, which cannot be aimed. The orbit spirals out over its last fifth so the throw
   reads as momentum, and its final angle follows the player's current facing.
6. **Pads solve at dismount, not after rising.** Otherwise a save during the pad animation stands on
   an islet that is unsolved. The player is frozen until the pads finish, so nothing changes in play.
7. **The crossing stays optional.** The brief's "opposite side" is the islet side, and the Grove is the
   route that needs no bridge. Making Bubbo mandatory would change progression, which the brief forbids.
   The far side becomes a real destination (bigger island, treasure).
8. **Fairness additions for children:** a short teeter at the edge before falling; enemy knock-back never
   pushes the player off; falling cannot knock out (HP floors at 1); the puzzle bridges keep their rails.
9. **Rewards must land on ground.** `knockOut` drops coins at the enemy's position, which would be
   unreachable in a void. Drops from a fall appear at the enemy's last ground point.
10. **Canopy gap bands must stay closed.** The two 28 m gap cuts are what make the bridges required.
    Widening the stage west without widening them would create a walk-around that skips both puzzles.
11. **Platforms are extruded decks, not the heightfield.** Terrain is a 2 m grid and cannot draw a clean
    ledge. New elevated ground is authored polygons with vertical sides, so the rendered lip matches collision.

Rejected: a real light for the blue glow (Chromebook budget); separate blue-burn rules; a new save
version; moving existing chests, secrets or the two gap positions; deleting the mesa landmark.

## 1. Slice A — Blue Inferno (`scene/ElementEffects.tsx`)

- Fire Breath is unchanged: orange, yellow, red. Inferno is unmistakably blue in the rendered game on the
  green forest and pale stone backgrounds: deep blue edges, cyan body, blue-white core.
- Add a blue flame style to the existing sprite shader. Keep the existing instanced batches, cone shape,
  sizes and particle count. Additive blending washes out on bright ground, so check it on real backgrounds.
- A small additive glow sprite at the mouth, and blue impact sparks where Inferno is hitting an enemy or
  flammable object. Instance budget only: no lights, no new batches.
- An enemy ignited by Inferno shows blue flames briefly (about 0.6 s) and then the normal burn. Purely
  visual. Burn damage, panic, the bubble and speech, KO floor, MP and object ignition do not change.

## 2. Slice A — Puff's live anchor

- `anchors.puffBeak` + `puffBeakValid` + a `PUFF_BEAK` local point on the model, sampled like `emberMouth`
  in `Monsters.tsx` after the pose is set, inside the rig so hop-out, bob and wings are included.
- `blast` Fx: for its first 0.14 s the cone root and the first streaks are drawn from the live beak; then
  the root releases and the tail advances at no less than 9 m/s along the launch yaw until it reaches
  the tip, which ends the effect. A later blast starts from Puff's new position. Launched gusts never move back.
- Cyclone gameplay position is unchanged. For its first 0.3 s the funnel is drawn from the beak out to
  that position and grows into full size.
- If the anchor is invalid (Puff hidden, switched off), draw nothing rather than a stale point.
- Expose a read-only frame record like `whipFrame` so a browser test can compare the gust root to the
  beak on the same rendered frame.

## 3. Slice A — Leafy's full swing (`game/combat.ts`, `logic/whip.ts`)

Applies to a single grabbed light or medium enemy. Pure functions go in `logic/` with unit tests.

- Timeline from the snap: **pull** 0.14 s into the swing radius at its current bearing, **orbit** to about
  0.95 s total, accelerating, in one fixed direction, then **release**. Total from grab to release 0.8–1.2 s
  and must be frame-rate independent (test at 10, 30, 60 fps).
- The centre is the player's live position every frame. Unwrapped sweep around the live centre is at least 360°
  (tested). Sweep = 360° plus the small correction that ends the orbit on the player's current facing.
- Radius 2.2 m. Spiral to about 3 m over the last fifth. Shrink to a minimum of 1.2 m to clear solids, smoothly,
  never closer than the two bodies' radii. The enemy rides at about 0.7 m air on the tether so it reads over low
  edges and voids and never clips the player.
- During the swing, terrain edges and hazards do nothing. A solid or wall contact deals the existing wall damage
  at most once per swing and does not end the swing. Other enemies are hit through the existing `flight.victims`
  ledger, once per swing and fling. Sample the arc in substeps so a low frame rate cannot skip a victim.
- Release: `flung`, along the live aim, at about 11 m/s and about 0.55 s, sharing the ledger. Wall impacts,
  enemy collisions and hazards apply as normal from here. If the release point is already in a fall hazard the enemy falls.
- No new attack before the swing ends, including held J. Leafy's vine stays on the live hand with high tension; it
  must not pass through the player when the enemy is behind.
- Unchanged: Double Grab's two-enemy bash, heavy-enemy tug, object grabs, Root Snare, whip snap timing. Interruptions
  (menu, dialogue, zone change, KO, switching) end the swing cleanly through the existing cancel path.

## 4. Slice B — Lily pad ownership and Bubbo's ride-first crossing

- `lilyPadGeometry` is split. The island mound joins static scenery and is visible from the start. Pads are a
  single instanced mesh (one draw), one matrix per pad, nothing else in it. A test checks the pad bounds contain no
  island and that `Unlocks` moves nothing but pads.
- `POND` may grow and `ISLET` may grow to radius at least 3 around its current centre, keeping `isletChest` where it is
  (or on the island if the radius forces a move), so a body can dismount at least 1.2 m from water. At least 5 pads,
  continuous with no walkable gap from bank to island. Pads rise one at a time, each with a splash, from
  `rt.act2Unlock.groveLilies` split per pad. Water height and every ground height function ignore that value.
- Scene (only `groveLilies`; `ferry` for the beach behaves exactly as before, sharing helpers is fine): the normal "Can
  you swim?" question → Bubbo agrees → hop on → swim across with the body partly submerged, paddling, wake and splashes,
  camera framing the crossing → hop off onto the island → `solve` → Bubbo raises the pads one by one → return open.
- `monsterRootY`'s water level must be the pond's level in the Grove, and the river's on the beach.
- Save: reload after solving shows raised pads, island at its height, no replay. A reload while riding puts the player on the
  near bank (not the camp), unsolved. Both directions walk, in the sim's own movement and for a mounted radius.

## 5. Slice C — World: mesa, Grove, Canopy

**Frozen limits.** Grove walk shapes stay at x ≤ 69 and Canopy at x ≥ 83, because `STAGE_EXITS` and `STAGE_PASSAGES` end at 70
and 82. The mesa becomes a keyhole star-shaped around its centre, with a broad head to the south (its landmark, seen from the
base) and a narrow tail, about 10 m wide, between the stages. The tail reaches z ≈ -231, never further north: the causeway
camera needs that. Existing tests on the mesa, camera and terrain continue to hold, using derived bounds instead of 65/89.

**Separation.** Every barrier is visible rock or scenery with matching collision. Any barrier under 8 m wide between walkable
areas carries rock or root scenery along its full length, because the bank height alone is too low there. Grove–Canopy
and Canopy/Grove–arm crossings are impossible; flood-fill tests prove it with every gate and puzzle open, including at mounted radius.

**Area.** Measured with the existing sampler (`measureAreas`, `scripts/measure-areas.mjs`). From 757 and 407.75 m²,
target 2× each, hard floor 1.7×. Report the numbers. Floor counted must be real ground reachable by flood fill.

**Grove (x 33–69, z -186 to -241).** Fill east toward the mesa tail, plus a lobe east of the left arm separated from it by a rock
ridge. Shallow water regions and winding streams that are walkable; more deep ponds (`splash` hazards, not walkable);
small islands, fallen trees, thick reeds, mossy boulders, half-sunk ruins, giant roots, muddy clearings, optional side paths,
one hidden treasure. Combat clearings that make Bubble Trap, Puff into water, and Leafy into logs useful. One new Ember
secret: dry reeds that burn to open a shortcut, through the existing secrets data, saved like the others.

**Canopy (x 83–119, z -205 to -241).** Giant connected trunks, branch and root walkways, hanging bridges, broken platforms, narrow
crossings, broad combat platforms, an optional treasure ledge. The named encounters: Cliffside Clearing, Broken Bridge (a wide plank span with
exposed sides), Tree-Ring Arena (circular platform around a giant trunk with gaps), Upper Root Walkway. Existing `CANOPY_GAPS`
keep their z and bridge x, but their cut and their hazard now span the full new stage width. The bridges remain required.

**Depth.** Walkable lips are authored decks with vertical faces and bark or rock sides; the drop to the floor below is visibly at least
8 m. Raising `CANOPY_HEIGHT` is allowed if the arm's ramp stays walkable. No foliage over a hazard; broken rails, dark
shadow bands or stones mark every fall edge. `standY`, `lowlandDeckY` and the rendered surface agree within 0.15 m on any walkable sample.

**Hazard kinds.** `hazards.ts` is the only list of voids and ponds. `kind: "fall"` plus a new flag that marks a player fall. Solid
boundaries never become hazards. The test "no point is both a solid boundary and a fall" applies.

**Enemies.** Modest additions: Grove required total about 10 and Canopy about 9, one Canopy shellback included. Append to `ENEMY_SPAWNS`
(indices are identity). Update stage-total tests. Mix of edge and interior positions. All stage gates, respawns and tutorial counts still work.

**Saves.** No version change. Position on ground that no longer exists: nearest walkable in the same zone when within 8 m, otherwise the
existing checkpoint rule. Old solved flags and chests remain.

**Budget.** Scenery goes into existing merged, tiled batches and instances: no new materials. Canopy and Grove gameplay views ≤ 110 calls
and ≤ 170k triangles at 1366×768 and 1280×800 (the budget test is extended to cover them). Check `standY`/`groundY` per-frame cost: use bounding checks.
Update camera profiles only where needed, and give the Canopy a pitch that shows the drop.

## 6. Slice D — Falling

**Player (Canopy flagged hazards only; other unwalkable land still blocks).**

1. Only real player movement input can start a fall. Enemy knock-back, scripts, auto-travel, teleports and debug movement cannot.
2. Pushing over a flagged edge for 0.22 s wobbles the player (a teeter), and releasing cancels it. Then footing is lost.
3. A scene (`run`) owns the fall: fall state on `rt.player` (not `climbY`, which clears the zone), keeps horizontal momentum,
   and gravity carries the player visibly down. The friend leaves its stance. A shot frames it. About 0.9 s in total.
4. HP -12, floored at 1, never a knock-out. A short bilingual "Watch out!" toast. Fade.
5. Land at the last safe ground: sampled while walking, walkable, in the same stage, with at least 2.5 m clear of any fall edge.
   If none was recorded, use an authored landing for that hazard. Friend returns with the player; about 2 s of protection.
6. Total under 3 s. No items, clears or progress lost. A save mid-fall stores the landing point.

**Enemies.** A `plunge` on the KO path: the enemy tips, drops with gravity into the void, and is gone with the normal defeat, rewards and
stage counter. Rewards spawn at its last ground point. Works from Puff's blast, Cyclone flings, Leafy's throw, popped or pushed bubbles,
and Bubble Bomb knock-back. Heavy enemies follow their existing small knock-back. Enemies walking on their own keep stopping at edges. Ponds keep their splash.

## 7. Verification

Controller owns every browser check, because workers cannot launch Chromium. Workers run `npm run typecheck`, `npx vitest run --maxWorkers=4` and
`npm run build`. New browser specs in `tests/e2e/` must show a known-bad failure before they are trusted. Renders at 1366×768 and 1280×800.
