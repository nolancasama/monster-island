# Gameplay, camera, bridge, economy and visual polish (frozen spec)

The external brief "Monster Island — Gameplay, Camera, Bridge, Economy, and
Visual Polish" as accepted, with the changes recorded in `DESIGN_DECISIONS.md`
("2026-10-29 — Gameplay polish brief: accepted, with these changes"). Where
this file and the brief differ, this file wins.

It ships in two parts:

- **Part 1** (`feature/gameplay-polish`, from `main` `201990a`) covers items
  1, 3, 4, 5, 6, 7 and 11. It touches the prologue and Act 2 only and can be
  merged on its own.
- **Part 2** runs after Act 3 slice C, on code that already contains Act 3. It
  covers items 2, 8, 9 and 10 (camera, projectiles, ranged enemies, companion
  transitions). Those live in the camera and combat code that Act 3 also
  changes, and they must cover Cloud Isle.

## Part 1

### 1. Bridges
Every created bridge gets a continuous walking surface from solid land to solid
land: Leafy's prologue ravine bridge (`bridgeFrameGeometry`,
`bridgeVinesGeometry`, `BridgeGrow`), the Ancient Canopy vine bridge
(`vineBridgeGeometry`) and Puff's rope bridge (`ropeBridgeGeometry`), plus
anything else built with those systems.
- The deck's ends sit on and slightly into the ground on both banks, at the
  ground's height and slope. Use real deck/anchor geometry, not floating
  decorations.
- The visible deck, the collision deck and the walking height agree. The
  player's (and a mounted rider's) feet sit on the planks with no float or
  sink, from both directions.
- Each grow/unfold animation ends fully connected.
- **Evidence:** before/after screenshots of each bridge (both ends, centre,
  a side view) at 1366×768. A unit test samples the walking height along each
  bridge against the deck surface and the bank terrain at both joins.

### 3. Food: 99 of each
- One cap of 99 per food type, in the prologue and Act 2 alike. `bagMax`
  becomes a constant. Pickups, the market, chests and drops all respect it.
  Each food's effect is unchanged.
- **Full bag:** the market won't sell past 99 ("Your bag is full!"). A
  pickup is left on the ground.
- **Chest overflow:** food that doesn't fit becomes coins (1 per item) with a
  toast ("Bag full! +3 coins"). The chest's other rewards always arrive.
  Nothing is silently lost.
- The HUD, bag and Eat button show two-digit counts without overflowing.
- Any prologue moment that relied on the old cap of 3 (a hint, a "bag full"
  line) is updated to stay true.
- Save validation clamps to 0–99.

### 4. Sanctuary gate pillars
- Find why the left pillars (`gateLeaf`, `gateDrop`) are hard to see, and fix
  that with placement first: move them slightly and clear or lower the rocks
  and wall pieces that hide them. All four should read as one symmetric set
  from the approach.
- Add subtle guidance: each pillar's friend symbol in its colour, plus a soft
  idle glow while unsolved that stops once solved. No floating labels.
- The camera framing for the courtyard belongs to Part 2's camera zones.
  Part 1 must make the pillars visible from the current camera's default
  framing at the gate.
- The puzzle rules, English, interaction radii, collision and animations
  follow the new positions.

### 5. Professor Maple's tent (prologue)
A finished low-poly expedition tent in the same spot and footprint: closed
canvas walls and a ridged roof, a front entrance with a rolled-back flap, poles,
guy ropes and pegs, seam lines, sitting properly on the ground, plus a few
expedition props (crate, map table, lantern, specimen jars). Warm canvas
palette. Shared materials, no transparency, no inverted or gapped faces, no
cloth simulation. It must look right from every angle the camera can reach.
Use the same model/component split as the chest (`scene/models/`).

### 6. The inn costs 10 coins
- Innkeeper: "Welcome to the Seaside Inn! A room is 10 coins. Would you like a
  room?" Answers by speech or tap: **"Yes, please."** / **"No, thank you."**
  (This is shorter than the brief's three-step exchange, and these are the
  phrases Japanese elementary EFL already drills.)
- **Yes, with ≥10 coins:** deduct 10 once, the existing rest transition, full
  HP and every friend's MP, the inn becomes the checkpoint. Innkeeper: "Good
  night!"
- **Yes, with fewer than 10:** "Sorry, you need 10 coins." No charge, no
  rest. The coins can never go negative.
- **No:** "OK. See you!" No charge.
- Walking up or entering is never charged, and the transition can't charge
  twice.
- A knock-out is never charged. The player wakes at the checkpoint with at
  least 60 HP, as now. Coins keep coming from respawning enemies, so there is
  no dead end.

### 7. Fern Camp becomes Fern Crossing
- Remove the camp's rest interaction and prompt, plus the camp props that
  only served it (bedrolls, cook pot). Keep the clearing, the junction, the
  paths, the exits and the stage transitions. The displayed name becomes
  **Fern Crossing**. Internal IDs (`camp`, `CAMP2`, the `camp` checkpoint)
  stay the same, so saves stay compatible.
- **Fern Crossing stays a wake point:** reaching it sets the checkpoint, and
  a knock-out further in wakes there with at least 60 HP, as now. It no
  longer heals on demand. Without this, a knock-out in the Grove or Canopy
  would send the player back to the rope every time.
- Update the tutorial step, hints, Maple's lines and the journal wherever they
  mention resting at the camp. Old saves with the `camp` checkpoint load
  unchanged (same ID, same spot).
- The clearing is a safe zone as before (party out, no enemies).

### 11. The island beyond the lair
- From outside the sanctuary walls (the approach and the gate courtyard), the
  lowland beyond the lair should be visible: the forest canopy below the cliff,
  slopes, coast and town. It must be the real lowland, drawn by distance
  through the existing constant fog, never a panorama or second copy.
- Lower or notch the specific wall/rim sections that block a natural
  viewpoint, keeping the walls solid and believable.
- The current rule hides the lowland whenever the camera is south of
  z = −125. Narrow it to the enclosed volcano tunnel only (the Grotto
  principle: enclosed spaces draw only themselves). This must not bring back
  the tunnel frame-rate problem recorded in DESIGN_DECISIONS: tunnel views
  stay at 50–59 calls and ~40k triangles.
- Budget at the new viewpoints: ≤120 draw calls, ≤140k triangles.
  **Evidence:** screenshots from the approach and the courtyard at both
  sizes.

## Part 2 (after Act 3 slice C)

### 2. Fixed camera everywhere
The user has overruled the earlier decision to keep the prologue's drag
orbit. There is no player-controlled rotation or zoom anywhere (mouse drag,
touch drag, wheel).
- **Camera profiles by zone.** One default framing: the lowland's pitch ≈0.55,
  10 m, 3 m look-ahead. Each region of the round prologue island gets an
  authored yaw that looks along its main path, so goals are ahead and
  never behind the lens. Special zones get authored framings: the beach pier
  (looking out over the water), forest bridges, the cliff rope (stable side
  view), the volcano tunnel (no ceiling clipping), the sanctuary gate (all four
  pillars and the gate), narrow passages (closer).
- Blends take about 1 s with hysteresis at zone borders, so standing on a
  border never flips the view. Profiles are data in one table, not scattered
  exceptions. Cinematics keep their cameras.
- Movement stays screen-relative to the current camera, and the camera spec
  is extended to every profile.

### 8. No homing player projectiles
Bubbo's, Puff's and Ember's projectiles (basics, specials and upgrades) fly
straight along the active friend's facing at the moment of firing. There is
no snap-turn to the nearest enemy, no enemy-chosen target and no steering
after launch. To stay fair on touchpads, the projectile hit radius is wider
(about 0.8–1 m) and trails are clear. Melee arcs (Leafy's whip) and area
abilities are unchanged. This replaces the Act 2 "forgiving aim" decision for
projectiles.

### 9. Ranged enemies
- **Forest Spitter** (Act 2 forests): stands off at 6–9 m, wind-up ~0.8 s
  (it swells and glows), then a slow seed shot aimed at where the player is at
  that moment, then a 2.5 s pause. It backs off when the player comes within
  3 m.
- **Raider Shooter** (causeway and coast, and Cloud Isle): a raider drone
  variant with a red charge glow, a slow energy bolt, and the same rules.
- **Shared rules:** no homing; shots are blocked by solids and removed at
  zone borders into safe areas; enemies fire only with line of sight, from
  reachable ground, inside the player's zone and on screen; at most 2 ranged
  enemies awake per area; modest damage.
- They replace some existing spawns, so stage-clear counts, respawns and coin
  drops stay as they are. Cloud Isle's Wind Sprite follows the same shared
  rules.

### 10. Companions leaving combat
Find and fix the case where the last active friend stays at the hostile
border after the player enters a safe zone. On entering any safe zone:
- the rider dismounts onto walkable ground, or a perched friend hops down;
- the whole party resumes following;
- an unreachable friend uses the existing poof.

Tested for each friend at Fern Crossing, Port Town and the Hidden Hollow.
