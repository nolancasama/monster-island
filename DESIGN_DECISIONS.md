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
