# Design Decisions

## 2026-10-31 — Slice X2a-world: junction and canopy gameplay layout

- Moved the observatory approach, observatory and beacon rigidly +90 m in z,
  including combat, lift, scene and camera-shot coordinates. Beacon combat
  now derives its arena and pylons from the world landmark.
- The junction has an east cliff overlook and a separate west chest path.
  The canopy winds through a forest floor and two raised platforms, with
  gentle ramps, six enemies in three pairs, and quiet stretches between.
  The required vine bridge and short scripted glide are 44 m apart; the
  optional gust lane leads to the far-west chest. Both route clear gates
  sit at their exits near z=398; the existing grotto gets only an extended
  exit trail. Save recovery follows the relocated glide pads.
- Rendering expansion remains a later slice; the terrain budget assertion
  remains unchanged for the controller to review alongside that work.

## 2026-10-31 — Slice X1: coast, Hollow and tunnel at scale, on one island

- **Layout.** The coast follows a long shoreline with three combat clearings,
  quiet stretches, a beached wreck, an abandoned supply camp, the windmill sea
  cave and crate cove, and two overlooks. Coast enemies stay six (IDs and the
  first-clear gate unchanged). The raider road is a visible dead end; the
  family tunnel is still the only way to the junction. The waterfall valley
  and a winding west approach precede the small shelter (moved rigidly +140 m
  in z); discovery waits until the player is within 7 m of Tala. The junction
  and every later area moved rigidly +180 m in z, to be enlarged in X2/X3.
  One coast rock moved off the trail at (-6, 32): on the centre line it left a
  mounted player less than 1 m.
- **Terrain (spec §2a).** `cloudGroundY` is one island heightfield: a coastal
  strip following the shore route (sea and bays within 6 m of it) joined to a
  northern massif with its peak behind the beacon. Paths keep their walking
  height plus a 3 m level shoulder (beyond the 2.83 m diagonal of a 2 m grid
  triangle), then blend into the hillside over 6 m. Rendering: 48 m chunks
  (2 m grid near paths, 4 m on the open mountain, 1.5 m edge skirts closing
  seams) merged into 96 m east-west bands, ~42k triangles and 7 draws for the
  whole island, culled on z; height/slope colours from sand through grass to
  rock. Rejected: the extruded walk-cell slabs (rafts on water), a 1 m grid
  everywhere (~4x triangles), a 55 m fog to make culling easy (hides
  landmarks).
- **Scenery on the terrain.** Off-path kit parts rest on `cloudGroundY` (the
  lowest ground under a slab; a deep rock outcrop under the Hollow's giant
  tree, which moved onto the hillside at (-34, 204)). Conifers sit at the
  lowest ground beside their trunk and only on dry land. Grounding tests
  allow 15 cm between the 2 m grid and the walking floor on hill crowns, and
  require off-path footings to be supported and not swallowed.
- **Saves.** New Act 3 records write `cloudLayout: 2`; layout-1 Cloud Isle
  positions move to their saved area's new spawn before the existing gate and
  solid projection. Bounds for search and the debug map derive from the zones.
- **Measured (scripts/measure-cloud-area.mjs).** 6,002.5 m² walkable (1.92x);
  dock → beacon 424.7 m via the canopy, 430 m via the grotto (both already
  >= 2x); dock → junction 329 m (was 100 m). Gameplay views <= 106 calls and
  <= 83k triangles at both Chromebook sizes.
- **Test-machine cost.** Terrain now fills the screen where the sea plane did,
  and SwiftShader is fill-rate bound: the full Act 3 browser chapter takes
  ~56 min on this 6-core machine (was ~6 min). `MI_LONG_TIMEOUT` raises its
  limit. Real-GPU frame time is unmeasured.

## 2026-10-31 — Slice X2a scene: junction and Skyroot Canopy

- The carved terrain carries the main canopy route. Five giant-tree kits sit
  on slope-depth pads using the landscape high-rest rule; their raised crowns
  leave the follow-camera corridor open. Platform sockets reach the clearings.
- Only `CLOUD_DECKS` receives tessellated timber at `cloudY`, with branch-braced
  posts embedded in the terrain and open sea-side rails. The vine bridge follows
  its relocated chasm and keeps the existing puzzle rotation; the glide gap has
  two lip markers and remains open. Mouth arches use the authored yaw, and low
  broken masonry frames the junction's east overlook.
- Geometry tests cover the deck every metre, rendered post feet and heads,
  terrain-seated kits, crown clearance and the single-draw/<25k canopy budget.
  Gameplay layout and puzzle state are unchanged.

## 2026-10-31 — Slice X2a review: giant trees, colours, placement

- **Giant tree crown.** The first kit tree read as a lamppost (a near-black
  trunk under three small pads). It now has five limbs spreading from two
  forks, each carrying a large foliage cluster, plus the leader: a broad
  umbrella crown. Bark is warm brown (#7a6650), the root pad a light stone,
  greens brighter. Assembly rules and connectivity tests are unchanged.
- **Cave mouths** are dark grey-green rock (#59625b), not navy.
- **Trees stay out of the follow camera's way.** Two canopy trees ahead of
  the high path moved 10 m east onto the uphill side; on a deep outcrop the
  roots drop with the pad (half its height), so downhill roots still meet the
  slope. The vine bridge rests 1.3 m back from each lip, where the 2 m terrain
  grid is level.
- **Left for X2b/X3:** the old grotto mouths at the junction (oversized, with
  a black interior) are rebuilt with the grotto.

## 2026-10-31 — Slice X2b-world: Thunder Grotto chambers under the mountain

- Implemented by the controller (Codex was in a usage-limit window).
- Layout east of the junction: mouth trail (9,279)→(14,284); entry chamber
  (28,298); passage to an underground lake (x 42–62, z 312–332) with the raft
  barrier across the water at z 321–323; an optional crystal chamber off the
  lake's near shore (73,322), reachable before either puzzle; passage to the
  steam-machinery chamber (40,352) with the boiler gate on its north exit;
  the electric-panel corridor north to (28,384); the exit climbs into open air
  at (22,390) and reaches the approach at observatory height. Six enemies
  (unchanged count) in pairs in the entry, lake and machinery chambers; the
  crystal chamber and corridor are quiet. Grotto 1,541.5 m²; total 8,837.75 m².
- **Caves in the terrain.** `CLOUD_CAVES` (every grotto shape but the open-air
  mouth and exit) are not carved: the mountain stays ≥ 7 m above the cave
  floor within 4 m of the walls, and land extends 8 m around every cave. The
  open-air mouths stay carved so the mountain rises behind them.
  `GROTTO_MOUTHS` give the two openings for the scene.
- Rejected: carving the grotto like other paths (an open trench, no cave).
