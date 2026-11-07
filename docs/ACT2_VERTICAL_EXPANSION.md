# Act 2 vertical expansion: stream, cave, door, Causeway, Upper Canopy, summit, bubble descent — frozen spec

Branch `feature/act2-vertical-expansion` from `main` at `5a7ffa0`. Save stays v4 (additive fields only);
Cloud Isle stays Coming Soon; debug access stays; do not merge `feature/act3-cloud-isle`.
`ENEMY_SPAWNS` is append-only (moving an entry keeps its index). Read `DESIGN_DECISIONS.md` first and
record new decisions there (date, what, why, rejected alternative).

The cave, Upper Canopy and summit are optional. Both normal routes (Grove and lower Canopy) still reach
the Causeway and Port Town, and nothing here may let a player skip a required stage clear.

Slices run in this order: **A** Causeway, **B** door, **C** Grove stream, **L** layers, **D** cave,
**E** cave puzzles, **F** Upper Canopy, **G** encounters, **H** summit and bubble descent. Each slice
leaves tsc, unit tests and build green.

---

## A. Ruined Causeway: no obstructions, one camera

**Geometry.** `lowlandPropsGeometry` (`scene/models/lowland.ts`) still builds two broken arches:
(58, -243) at the Grove mouth and (102, -251.5) by the shrine. Remove both (the Grove one is replaced by
the door in B). The shrine keeps its stepped platform, glowing stone and two monster statues, but the
statues move to the shrine's far east rim, at least 0.6 m outside walkable ground, so nothing tall stands
in the fight. Look over every mesh within `CAUSEWAY`, the shrine disc and the rope-foot pocket. Anything
taller than 0.6 m on walkable ground that is not an enemy, chest or the shrine platform either goes or
moves off the walk area. List what was found in the report. Collision follows the visuals exactly; no
invisible solids. Keep the ruin feel with broken paving, moss, cracked slabs and low rubble (≤ 0.3 m,
no collision) at the edges.

**Combat space test (unit).** For each of the 14 Causeway spawns, a circle of radius 3.2 m (Leafy's
full swing plus an enemy body) contains no lowland solid and no unwalkable ground other than the
Causeway's own outer boundary. A spawn may move (index kept) if it fails only because it sits on the
boundary. The count stays 14 and the stage-clear rules are unchanged.

**Camera.** A new profile `ruined-causeway`: `kind: "lowland"`, **yaw 0**, pitch about 0.8, dist about
10.5, constant `ahead`, no `resolve`, no `trackYaw`. It contains ground-layer points whose
`zoneAt === "causeway"`, including the exit-rope foot pocket `rect(92,100,-244,-241)`. Pitch and
distance may be tuned within pitch 0.72–0.9 and dist 9.5–11.5 from rendered evidence; yaw never changes.
`causeway-exit-rope` becomes climbing-only (`p.climbing`, like `canopy-entrance-rope`), so walking near
the rope never swaps profiles. Where the fixed lens would sit inside or behind the exit landing or the
Canopy deck north faces (player near the north edge or in the rope pocket), that geometry fades on the
sight line with the existing `occluderMat` pattern (`portWall`). The lens never moves, rotates or raises
itself. Scripted shots (rope climb, door, bubble arrival) still own the camera while they run, and the
fixed profile resumes with the normal blend.

Acceptance A: unit tests for the arch and statue removal (no solids, no tall props), the swing circles,
spawn count, and the profile (the same yaw/pitch/dist at a grid of Causeway points, `causeway-exit-rope`
only while climbing). The controller renders the Causeway centre, the shrine, the rope foot and the Grove
mouth at 1366×768 and 1280×800, before and after.

## B. Grove–Causeway door

Replace the `grove` stage exit (`STAGE_EXITS` kind `"reeds"`, x 56, z -241.4) with an ancient stone
gate: a weathered carved frame, two wooden doors with iron bands, moss and vines, and short rock wall
returns that meet the existing `LOWLAND_RIDGES` at z -240 on both sides. The opening matches the
`STAGE_PASSAGES` trail (half-width 1.85) at the door plane. The frame posts are solid, just outside the
walk band. The doors swing open into recesses beside the posts, never into the walk band, so open doors
need no collision of their own. New model `scene/models/groveDoor.ts`.

**Rule (unchanged progression).** Closed and blocking (the existing cut) until `grove` is in `cleared`.
Once cleared, the doors open on approach (within about 7 m, from either side) with a short stone/wood
sound (reuse the port gate's sound if there is one), and stay open. On load with `grove` cleared they are
already open. No English question. Saves that cleared the Grove find it open; Canopy-route players keep
exactly today's access.

**Camera at the threshold.** The Grove/Causeway switch happens at the door plane: in the passage band,
`flooded-grove` applies on the Grove side of z -241.4 and `ruined-causeway` on the Causeway side, with
at least 1 m of hysteresis, so a player standing in the doorway never flickers between them.

Acceptance B: unit tests for the cut before and after the clear (on foot and at the mounted 0.55 m
radius), posts solid, doors outside the walk band, and the camera switch at the plane with no flip-flop
in a ±0.9 m walk across it. The controller renders it closed and open from both sides.

## C. Flooded Grove entrance stream and Bubbo ferry

**Stream.** A new deep stream across the Grove just south of where the left arm enters (arm end
(45.5, -207)). Its centreline runs from the west hills (x ≤ 31, where `lowlandY` already rises) to the
mesa foot (into the mesa capsule at x ≥ 70.5), at roughly z -209 to -213. It is 4.5–6 m wide, with
shallow muddy edges and a deep centre, moving water (scrolling normal or UV flow), ripples, reeds and
aquatic plants, partly submerged rocks, and a wake. It is not a flat rectangle. It upgrades or replaces
the decorative `STREAMS[2]` on that line.

- Water is a `splash` hazard (`world/hazards.ts`, `HOME_PONDS` style): unwalkable for every walker,
  KO for enemies forced into the deep part, and `water.ts` shallow/deep classification so it puts out
  fire (wading rim, same rules as ponds). Visible water and the hazard footprint come from one shared
  shape.
- Both ends seal into impassable ground (west hill bank, mesa capsule). No walkable route around it, on
  foot, mounted or by knock-back (unit test: flood fill on the ground layer from the arm end without
  `groveStream` never reaches the south bank).
- Scenery in the new footprint (giant tree (54.6,-208.4), the log at (44.4,-209.3), anything else) moves
  together with its collision. Grove spawns inside or within 1.5 m of the water move to a sensible bank,
  keeping their indices. Secrets, the lily pond and `groveHiddenCache` keep working.

**Obstacle `groveStream`** (`progress.ts` `OBSTACLES`, `ACT2_OBSTACLES`, `THANKS`, focus text, debug
progress): `needs: "swim"`, `question: "canSwim"`, `others: ["canFly", "canFire"]`, `after: []`. The
place is the north bank ferry point, facing the south bank point, near x 46. The "alone" line is the
existing deep-water line style (en and ja).

- **First crossing:** "Can you swim?" 「およげる？」 → Bubbo "Yes, I can!". Bubbo walks to the bank, the
  player hops on (`hop`), Bubbo swims across in about 3 s with splashes and a wake, the rider stays on
  the saddle (`ride.ts`), and they dismount onto the south bank. `gatherParty` at the destination.
  Reuse `glideWalk`, `hop` and the `groveCrossing` shot pattern; do not copy them.
- **Repeats:** once solved, the focus prompt at either ferry point is "Ride Bubbo" (en/ja). It runs a
  short ferry (≤ 2.5 s, no dialogue, no long shot) in that direction, whoever the active friend is.
- Never set or read `groveLilies` or `rt.act2Unlock.groveLilies` for this. The lily-pad puzzle is
  unchanged.
- Cancelling or a debug teleport mid-ferry leaves no `frozen`, `riding` or `swimming` set.

**Save.** On read, grant `groveStream` if `grove` is in `cleared`, `groveLilies` is solved, any later
stage is cleared, or the saved zone is `grove` with the position south of the stream. A saved position
inside the new water or moved scenery goes to the nearest walkable bank on the side it was on.

Acceptance C: unit tests for the hazard (inside, rim, near-but-outside), the flood-fill seal, spawn
moves (indices kept, none in water), the migrations and the obstacle definition. The controller renders
the stream at both sizes and plays the first and a repeat crossing in the browser.

---

## L. Traversal layers (foundation, before D–H)

```ts
export type Layer = "ground" | "cave" | "high";
```

- Within one layer, every (x, z) has at most one walking surface. Layers change only at authored
  transitions: the cave mouth portal, the Upper Canopy rope, scripted flights (bubble), falls (same
  layer), debug travel and save load.
- **Every existing query gets an optional trailing `layer` that defaults to `"ground"`, and the ground
  result is identical to today** (golden test: sample `zoneAt`, `lowlandWalkable`, `isWalkable`,
  `standY` and `solidsFor` on a 0.5 m grid over `BASIN`, before against after, with an exact match).
  That covers `zoneAt`, `lowlandWalkable`, `isWalkable`, `standY`, `lowlandDeckY`, `moveCircle`,
  `nearestWalkable`, `blocked`, solids, hazards (`Hazard.layer?: Layer`, default ground), `waterAt` and
  element objects.
- `ZoneId` gains `"cave" | "upperCanopy" | "summit"`. These are not `STAGES`, and their enemies are
  `optional`. `cave` and `upperCanopy` are hostile; `summit` is not. `zoneAt(x, z, "cave")` returns
  only `"cave"` or null; `zoneAt(x, z, "high")` returns only `"upperCanopy"`, `"summit"` or null.
- **Walkers carry a layer:** the player (`rt.player.layer`), companions and enemies (from their spawn
  zone). Enemies never change layer. Aggro, targeting, contact damage, projectiles, element hits, wind,
  bubbles, grabs and smoke-spawn materialisation apply only within the caster's layer. Companions follow
  the player's layer: on any transition they are gathered at the player.
- **Portal** data `LAYER_PORTALS`: an overlap strip that is walkable on both layers, with an inner and
  outer line (at least 0.8 m apart). Crossing the inner line on ground switches to the other layer, and
  crossing the outer line on that layer switches back, so a standing player never toggles. The mesa's
  ground solids and walk exclusions stay exactly as they are; the cave layer simply does not use them.
- **Ropes:** the `ClimbRope` definition gains optional `footLayer` and `topLayer` (default ground), and
  `climbRope` sets the layer at the end of the climb.
- **Camera:** `CameraPoint` gains `layer`. Every existing profile matches ground only (one wrapper, not
  per-profile edits), so a high-layer player above the lower Canopy never gets `ancient-canopy`. New
  profiles are added by later slices.
- **Rendering:** one `layerView(player, camera)` decides which layer groups draw: the ground world, the
  cave group, and the high group (with per-instance culling from F). Characters on hidden layers are
  hidden.
- **Save:** `player.layer`; missing or invalid means ground. If the saved position is not walkable on its
  saved layer, it moves to that layer's safe entry (`LAYER_ENTRY[layer]`, filled in by D/F/H; ground
  uses today's behaviour). A save never loads inside rock or over a void.
- **Debug:** travel targets take a layer; `?debug=1` keeps working.
- `e2e.ts` exposes `layer` for the player, companions and enemies.

Acceptance L: the golden ground test, layer isolation tests on a small fixture layer (walk, standY,
targeting and aggro across layers are refused), portal hysteresis, rope layer switch, and the save
fallback. Every existing unit test passes unchanged except those that must name the new optional
parameter.

---

## D. The cave under the mountain (cave layer)

**Where.** The mouth is on the mesa's west face (the Grove's east side), on the south bank of the new
stream, with its centre between z -224 and -230. It must stay clear of `groveDryReeds`, `groveRootPool`,
the half-sunk stone at (64, -227) (it may move a little, collision and all) and the boulder at
(63, -225). The cave floor sits at about local ground height inside the mesa base, so it is genuinely
beneath the mountain. Every cave walk shape lies inside `MESA_OUTLINE`, shrunk by 0.8 m, except the
mouth's overlap strip.

**Layout.** A genuine U: the mouth tunnel leads in and north along the west side to a broad bend in
the mesa's wide head (z about -190 to -200), then comes back south along the east side to the treasure
chamber at the far tip. The tunnels are organic, 2.6–4 m wide with variation, with curved walls, small
side recesses and at least 1.2 m of solid rock between the parallel arms. The walking distance from
mouth to chamber is at least 55 m. The chamber is at least 5.5 m across, irregular, with rock
formations, ancient symbols and a partly hidden alcove. There is no second exit.

**Scenery.** Natural stone walls, rough overhangs, rocky floor, stalactites and stalagmites (the solid
ones with matching collision), a few glowing mushroom clusters, carvings, mineral deposits, damp sheen,
and dripping-water sound (a looping drip while in the cave, plus occasional drip particles). Low poly,
merged or instanced.

**Rendering.** The cave group draws only when the player is on the cave layer, or within about 25 m of
the mouth for the exterior mouth (a carved rock arch with darkness inside, set into the mesa face).
While the player is in the cave, the exterior lowland, mesa and sky are not drawn and the background is
black. A 0.4 s blend at the portal fades the global lights, fog and visibility both ways. Walls are
extruded from the walk outline with jitter, 3–4.5 m high, and there are no ceiling faces between the
lens and the floor. Walls between the lens and the player fade or drop to a low lip, so the player is
always visible.

**Camera.** Profile `cave`: fixed yaw 0, pitch about 1.0, dist about 8, cave layer only.

**Darkness (unlit).** The cave material ignores scene lights, using vertex colour × a cave light term.
Unlit, the floor and walls are near black. Within about 3 m of the player there is a very faint
silhouette term, so nearby walls read as dim outlines. Glowing mushrooms, mineral sparkles and the eyes
of the player, friends and enemies glow (an emissive eye term that is on only while in the unlit cave).
Global scene lights dim to about 4% while the player is in the unlit cave, so characters are dark
except their eyes. You can navigate it, but it is clearly hard.

**Enemies.** Two optional gloomlets in the head bend (appended, `zone: "cave"`), never within 10 m of the
chamber. Their eyes glow.

Acceptance D: unit tests that the cave is inside the shrunk outline, the U route length and widths,
spine thickness, the flood fill from the mouth reaching only cave cells and the chamber (no shortcut to
any other zone or layer), portal switching, and save/load inside the cave. The controller renders the
unlit mouth, a tunnel and the chamber.

## E. Cave puzzles: Ember's torches, Leafy's root seal, treasure

**Torches (optional, never required for entry or treasure).** Two braziers flank the mouth outside
(ground layer), and about 10 torches stand along the route inside. Obstacle `caveTorches`:
`needs: "fire"`, `question: "canFire"`, `others: ["canSwim", "canFly"]`, `after: []`. The place is in
front of the mouth, facing the north brazier. "Can you make fire?" 「ひを だせる？」 → Ember "Yes, I can!"
→ Ember walks to the brazier and breathes fire (the existing Fire Breath visual) → it lights → flame
runs along a carved channel in the rock (emissive groove) into the cave → torches light in route order.
The whole spread takes about 6 s and keeps going if the player walks in.

The braziers are also element objects tagged `flammable`, so Fire Breath or Inferno hitting either
brazier (or any torch, from the cave layer) runs the same chain and solves `caveTorches`, with no
dialogue. Nothing else is affected: no story progression, other flammables unchanged. `caveTorches` is
saved permanently, and on load the cave is fully lit.

**Lighting model.** There are no real point lights in the cave. Each cave vertex stores its route
distance `s` and a baked torch light, which is warm, falls off along the route rather than in a straight
line, and never crosses rock. A `uLitS` uniform animates the spread, and the flames are emissive with a
flicker done in the shader or by uniform. Characters are lit by a cave ambient whose intensity and warm
tint follow the baked light at the player's position. Lit, the cave is readable and warm with darker
recesses, not uniformly bright.

**Root seal (7th secret, `caveRootSeal`).** A heavy, cracked stone panel bound by an ancient root seals
the chamber's alcove. The chest behind it is not visible until discovered, using the existing secret
chest rules: drawn, solid and focusable only after discovery. The clue is a carved vine symbol on the
panel and faint glowing moss along its crack, which is visible in the dark. It is a `grabbable` +
`heavy` element object on the cave layer. Leafy's Vine Grab pulls it aside (`pulled`, the
`leafyStatues` pattern), and that works lit or unlit. Add it to `SECRET_IDS`/`SECRET_SITES` so it is
saved in `act2.secrets`.

**Chest `caveRootSealChest`:** 45 coins, 2 amber and relic `caveCrystal` ("Glow Crystal" / 「ひかる
クリスタル」).

**Relics.** `act2.relics: RelicId[]` (`"caveCrystal" | "summitStar"`), additive in save v4. Unknown
values are dropped. A relic is granted once, by its chest. Opening shows a toast with the relic's name,
and the bag/journal lists collected relics in one line. Nothing else uses them.

Acceptance E: unit tests for the obstacle definition, the burn route solving it (and an unrelated hit
not), persistence, the seal secret in the dark, the chest hidden before discovery, relic granting once,
and save round trips. The controller renders the unlit cave, the mid-spread, the fully lit cave and the
open chamber, and plays the puzzle once in the browser.

---

## F. Upper Canopy (high layer)

**Rope.** `CANOPY_ROPES.upper` (`footLayer: "ground"`, `topLayer: "high"`). The foot is on the lower
Canopy north of the second gap, beside the giant tree at (94.8, -232.8), on deck at least 2 m from any
void and clear of enemy spawns. The top is on a broad upper leaf. Firm anchors: a branch collar above and
a root knot below. It is available at once, with no question, and climbable both ways using
`climbRope`. There is a climbing-only camera profile `upper-canopy-rope` that mirrors the existing rope
framing. The existing Canopy ropes, bridges, voids and enemies are unchanged.

**Layout.** Absolute heights 20–23 m (the lower deck is about 12). The route runs from the rope top
north over the lower Canopy toward the mesa's east shoulder (x ≈ 84–88, z ≈ -200 to -212), with at
least 60 m of walking route. Walk surfaces are giant leaves (authored polygons: **the mesh outline and
the walk polygon are the same vertex list**, with a midrib and veins), thick branches and twisting vines
(trails, at least 1.8 m wide), branch intersections and tree crowns built around the existing giant
trees. Heights vary by up to 1.5 m, joined by ramps of 25° or less. Gaps show the lower forest; distant
cliffs and the mesa are in view. There are no invisible walkways.

**Falls.** One high-layer fall hazard covers the Upper Canopy bounds, with every walk polygon as `safe`.
Every open edge is a real `playerFall` edge (teeter, drop, -12 HP floored at 1). Walls are the
exception: trunk faces, the rope landing's back and the summit rim. Players fall back to the most
recently reached `UPPER_CHECKPOINTS` entry (about 4: rope top, Broadleaf Clearing, Broken Crown, Summit
Approach), never to the forest. Earned items and cleared encounters stay. Enemies forced over an edge
`plunge` (the existing KO and reward on the lip, counted once, normal respawn).

**Unstable leaves (at most 3).** They look visibly different (yellow-brown, cracked, drooping). Standing
on one for 0.8 s starts a 1.2 s warning (shake and creak); then it drops away and is unwalkable, and it
regrows after 6 s. Only the player triggers it. It is not saved. Never two in a row on the main route.

**Sway.** Leaves may sway or bend visually by 0.05 m or less at the walk area. Collision height is
constant.

**Fire.** Walkable leaves and branches are not flammable. There is no flammable scenery up here.

**Camera.** Profile `upper-canopy`: yaw 0.5 (as `ancient-canopy`), pitch about 0.7, dist about 12, high
layer only. The lens is kept out of the mesa (`mesaCameraLift`).

**Seen from below.** When the player is on the ground layer, any high-layer leaf or branch instance
whose bottom is below the camera's y + 2 m within 9 m horizontally of the lens, or on the lens→player
sight line, is hidden per instance (scale 0). No transparency. The far treetops stay visible.

Acceptance F: unit tests that leaf meshes and walk polygons share vertices, flood fill from the rope top
reaches the summit approach and nothing on another layer, fall edges and checkpoints, unstable leaf
timing, the rope both ways, and no high geometry near the lens from lower Canopy sample points. The
controller renders the rope, the giant leaves, a fall and the view down.

## G. Upper Canopy encounters

Four pockets of appended, `optional` enemies on the high layer:

- **Broadleaf Clearing:** a safe, wide leaf with 2 gloomlets.
- **Windward Branch:** exposed edges with 2 gloomlets and 1 forest spitter; Puff's Wind Blast knocks
  them off.
- **Broken Crown:** connected leaves with gaps, 1 snapjaw and 2 gloomlets.
- **Summit Approach:** 1 shellback and 2 snapjaws guarding the last bridge. It does not gate the bridge.

Child-friendly: no pocket has more than 3 enemies, and none needs a jump. Unit tests on high-layer
coordinates through the existing logic:

- Wind Blast knock-back over an edge plunges.
- Cyclone carries a light enemy over a gap and releases it, so it falls; a heavy enemy resists.
- Leafy's 360° swing and fling over an edge plunges.
- A Bubble Trap pushed by Puff over a gap plunges when it bursts.
- Ember damages and burns but ignites no scenery.
- A KO counts once and the reward is given once.

## H. Summit and Bubbo's bubble descent

**Summit (zone `summit`, high layer, not hostile).** The route arrives over a root or branch bridge onto
a narrow mountain ledge, then onto the plateau, which is the existing mesa top (`MESA_STRATA[5]`). The
mesa's look from below is unchanged apart from the bridge, a few small trees and stones and the chest.
The walk polygon is the plateau outline shrunk by 1 m, at the rendered top height, edged with low stones
and grass so the edge is a visible wall. It has windswept grass (instanced), ancient standing stones
(solid, with matching collision), small weathered trees, and wide views of the swamp, Causeway and
forest. It is unreachable from the ground, cave or lower Canopy (flood-fill test).

**Chest `summitChest`:** an ornate variant (gold trim), 60 coins, 3 amber, relic `summitStar` ("Summit
Star" / 「やまの ほし」), once only.

**Obstacle `summitBubble`:** `needs: "swim"`, `question: "canHelp"`, `others: ["canFly", "canFire"]`,
`after: []`. The place is a marked departure stone at the plateau's south edge. "Can you help me?"
「たすけて くれる？」 → Bubbo "Yes, I can!". Once solved, the prompt there is "Float down with Bubbo" and
runs the descent with no question.

**Descent (automatic, 10–12 s).** Bubbo comes beside the player and blows a large translucent bubble
(radius about 1.3, so the whole body is inside, with no limbs through it). It has soft blue fresnel
edges, a highlight, a light shimmer, a gentle wobble and a few tiny pooled bubbles; it is one
transparent sphere. Bubbo floats beside in a smaller bubble. The bubble lifts slightly, drifts out from
the mountain, arcs west over Flooded Grove, then descends into the Causeway along a smooth spline,
lands, and pops gently (sparkle and pop sound). Then movement returns, and the other friends gather
(`gatherParty`).

**Camera** (scripted shot path). It pulls back to show the mountain and treetops, then the Grove below
and the forest's U where it is visible, then the Causeway rising. Keyframes are eased with no snapping.
It is never inside the mesa or terrain (`mesaCameraLift`, a `walkY` clamp) and ends exactly at the
`ruined-causeway` pose for the landing point, then blends to normal follow.

**Landing.** A dedicated Causeway point at least 7 m from every Causeway spawn and on open paving. For
2.5 s after the pop the player takes no damage and no enemy starts an attack on them. The player lands on
walkable ground with the layer set to ground.

**Entitlement.** The Causeway landing requires `grove` or `canopy` in `cleared` (the walking routes).
Otherwise Bubbo lands the player in the lower Canopy at the upper rope's foot, with a friendly en/ja
line, so it is never a shortcut. Either way the descent can be repeated.

Acceptance H: unit tests for the summit flood fill, chest and relic once, obstacle definition, the
entitlement for both destinations, the landing clearance, the camera keyframes against the mesa and
terrain, and save/load on the summit. The controller renders the summit, the bubble close up, three
descent frames and the landing.

---

## Saves (all slices)

v4, additive: `player.layer`, the new obstacles in `solved`, `caveRootSeal` in `act2.secrets`,
`act2.relics`, and the chests in the existing chest list. Older saves load. A save in the cave, on an
upper leaf, on the summit or mid-ferry/mid-descent loads onto a valid surface of the right layer
(mid-script saves resolve to that script's start point).

## Debug

Travel targets: the stream's north bank, the cave mouth, the cave chamber, the upper rope top, the
summit, and the Causeway landing. Progress toggles: `groveStream`, `caveTorches`, `summitBubble`, the
`caveRootSeal` secret, and the relics.

## Performance (school Chromebooks)

Low poly, shared materials, merged or instanced scenery. No physics engine, no new shadow casters, and
no real lights in the cave. Particles are pooled. Draw budgets:

- Every existing asserted view stays within today's limits, at most +5 draw calls.
- Cave views: 60 calls or fewer.
- Upper Canopy, summit and descent frames: 140k triangles and about 110 calls or fewer at 1366×768.
- Hidden layers do not draw.
- Summit details draw only when the player is within 60 m, on the high layer or in the descent.

## Browser evidence (controller)

New spec `tests/e2e/vertical-expansion.spec.ts`, written by the slices and run by the controller with
`npm run e2e`. Screenshots at 1366×768 and 1280×800 go in `.tmp/shots/vertical/`. There is no real
Chromebook available; say so.
