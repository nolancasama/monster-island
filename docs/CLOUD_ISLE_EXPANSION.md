# Cloud Isle Expansion, Model Overhaul, Frontier Wall, Coming Soon Lock (frozen spec)

Accepted 2026-10-31 from the external brief of the same name, with the changes
recorded in `DESIGN_DECISIONS.md` (same date). Builds on `docs/ACT3_CLOUD_ISLE.md`,
which stays authoritative for story, enemies, puzzles and the boss except
where this file changes geography, scale or travel.

Work lands in slices on `feature/act3-cloud-isle`; nothing merges to `main`
(= deploys) without the user's approval.

| Slice | Content | Depends on |
| --- | --- | --- |
| L | Coming Soon lock (§1) | — |
| W | Frontier wall on the home island (§5) | — |
| K | Environment kit + tree fix (§3) | — |
| X1 | Re-laid frame; dock, Stormbreak Coast, Hidden Hollow, back tunnel at scale; save remap (§2, §6) | K |
| X2 | Windfall Junction, Skyroot Canopy, Thunder Grotto at scale | X1 |
| X3 | Observatory, Storm Beacon surroundings, landmarks, camera review, performance, final measurement | X2 |

## 1. Coming Soon lock

- One flag: `CLOUD_ISLE_RELEASED = false` in `src/game/release.ts`. Every
  normal-gameplay path to the voyage reads it through one function
  (`cloudIsleOpen()`), so release is a one-line change.
- **Harbour, first talk** (lead not yet heard): the lead conversation is
  unchanged up to Maple's "That's Lumo! We must go to Cloud Isle!". Gull's
  "My boat leaves soon…" line is replaced by
  "The ship to Cloud Isle isn't ready yet. Coming soon!" /
  「クラウドじまへの ふねは まだ じゅんびちゅうだよ。もうすぐ いけるよ！」.
  `hearLead` is still recorded (the story fact is real; only travel is held).
  The quest banner becomes **"Cloud Isle — Coming Soon!"** (Japanese
  「クラウドじま — もうすぐ！」), not "Sail with Captain Gull".
- **Harbour, later talks** at home (lead heard, any `voyageDone`): Gull says
  the same Coming Soon line and a small "Cloud Isle — Coming Soon!" notice
  shows. No ask, no voyage, no fade, no world swap, no `completeVoyage`.
- **On Cloud Isle** (existing saves, debug): the dock Gull still offers
  "Sail to Port Town?" so nobody is stranded. Going home is always allowed;
  coming back is locked while the flag is false.
- Journal objective and any hint text that says "Sail with Captain Gull to
  Cloud Isle!" show "Cloud Isle — Coming Soon!" instead while locked and at
  home. Act 3 objectives still show on Cloud Isle.
- **Debug (`?debug=1`)**: all existing Cloud Isle jumps keep working
  regardless of the flag (they bypass the harbour). Add one debug toggle
  "Cloud Isle ship: locked / open" (session-only, default locked, never
  saved to the normal save) so the real voyage stays testable. The normal
  URL can never open it.
- Nothing is removed: Gull, the harbour, the voyage, Act 3 code and content
  all stay. Save data is not changed by the lock.

## 2. Expansion: targets and layout

Measured by `node scripts/measure-cloud-area.mjs` (0.5 m grid, player radius
.35 m, all gates open; the baseline in the script is from `f108ed9`).

| | Baseline | Target |
| --- | --- | --- |
| Walkable floor | 3,133.5 m² | **≥ 9,400 m²** (≥ 3.0×) |
| Shortest route dock → beacon via the canopy | 195.8 m | **≥ 392 m** (≥ 2.0×) |
| … via the grotto | 200.8 m | **≥ 402 m** (≥ 2.0×) |

Per-area guide (m², not exact): dock 350 · coast 2,600 · hollow 700 (the
shelter itself stays its current size; the valley grows) · back tunnel 300 ·
junction 900 · canopy 1,500 · grotto 1,500 · observatory approach 250 ·
observatory 1,100 · beacon 700 (the arena stays r≈12; the summit around it
grows). No area may hit its number with one empty plain; growth comes from
new geography (inlets, beaches, clearings, ledges, chambers, terraces) and
longer winding paths, not from scaling coordinates.

The topology of `ACT3_CLOUD_ISLE.md` §2 is kept: dock (south) → coast →
hollow (behind the waterfall) → back tunnel → junction → canopy (west, high)
| grotto (east, low, cave) → observatory → beacon (north, summit). The raider
barricade stays visible and never passable. Either branch suffices.

Per area, in addition to the source brief's lists:

- **Dock/coast:** a long shoreline the route follows and leaves; beaches,
  rocky inlets, a shipwreck, an abandoned raider supply camp, 3–4 combat
  clearings separated by quiet stretches, the sea cave (windmill puzzle,
  sea chest), the side cove (crate puzzle), one or two overlooks. The coast
  first-clear gate stays before the hollow approach.
- **Hollow:** the shelter stays small; the hidden valley, waterfall pool and
  a winding concealed approach (boulders, trees, a moment where the shelter
  is revealed) grow.
- **Junction:** a mountain crossroads with a panoramic overlook, two clearly
  different route mouths, one or two short optional paths (the junction chest
  moves onto one).
- **Canopy:** gigantic trees (trunks ≥ 3 m across) carrying platforms and
  bridges, real height changes, winding walkways, one optional branch,
  viewpoints. Vine bridge and glide puzzles stay required and spatially apart.
- **Grotto:** several connected chambers — underground water (raft basin),
  crystal chamber (crystal chest), steam machinery (boiler gate), rock
  passages; electric panels keep their timing rules.
- **Observatory:** a larger ruined complex: exterior terraces, broken towers,
  walkways, central dial and lift. The four-mechanism puzzle is unchanged in
  rules; the mechanisms move apart onto the terraces.
- **Beacon:** practical arena size kept; summit rocks, storm machinery and
  cloud level below make it read as far above the island.

**Density:** total enemy spawns per stage at most 1.5× today's; required
clear counts unchanged (coast 6, canopy 6, grotto 6, observatory 4); at most
4 awake at once; respawn rules unchanged.

**Landmarks:** mountain + beacon from the dock; waterfall from the coast;
observatory from the junction; coast from high viewpoints; beacon from the
observatory. One representation per object (real geometry through fog), no
background replicas, no popping inside the fog distance.

**Rendering:** spatial tiles + distance culling matched to fog (extend the
existing `near()` pattern), instanced vegetation, the grotto drawn only when
the camera is in or near it. Budget per gameplay view at 1366×768 and
1280×800: ≤ 120 draw calls, ≤ 140k triangles.

**Camera:** the fixed up-mountain follow camera and context profiles stay;
add or adjust profiles where longer paths, bridges, cliffs or caves need it.

## 2a. Terrain: one island, not extruded paths (added 2026-10-31 after X1 review)

The first X1 attempt (and the original Cloud Isle) drew ground only where the
player can walk: walk-shape cells extruded as 1 m stair-stepped slabs with
rock skirts into the sea. The result reads as separate rafts on water, with no
landmass, slopes or mountain between them. Replaced by:

- **One heightfield** `cloudGroundY(x, z)` in `src/game/world/cloudTerrain.ts`
  (pure, testable) over an irregular island outline that contains every area
  with generous margins (beaches that slope under the sea, rocky headlands).
  A central massif rises from the coast to the summit behind the beacon;
  ridges and valleys separate areas; noise breaks up regularity.
- **Paths are carved into it, not the other way round.** Inside walk shapes
  the ground equals `cloudY` (|difference| < 5 cm at every walkable sample,
  unit-tested). Outside, within a few metres, it blends into natural
  boundaries: slopes and banks up the mountain side, cliffs (steep heightfield
  or kit cliff segments standing on it), beaches or drops on the sea side.
  Collision stays the walk shapes; the visible terrain explains every edge.
- **Mesh:** spatial chunks (~48 m) on a ~2 m grid, flat-shaded low-poly, vertex
  colours by height and slope (wet sand, sand, grass, moss, rock on steep
  slopes, darker cliff), a submerged skirt at the outline. No 1 m stair steps
  anywhere. Elevated floors (canopy walkways, observatory) and enclosed ones
  (grotto) keep their own geometry, with real terrain beneath/around them.
- **Mountain landmark:** the massif replaces the placeholder cones; visible
  from the dock through fog as the island's silhouette.
- **Colour:** stormy but colourful and stylised (the brief's visual standard):
  lift sand, grass and rock toward the home island's palette; keep the storm
  in the sky, fog tint and the summit.
- **Budget:** terrain + scenery chunk culling (frustum and fog distance) so
  every gameplay view is ≤ 120 calls / ≤ 140k triangles.
- **Geography preview without a browser:** `scripts/cloud-map.mjs` writes a
  hill-shaded top-down PNG of `cloudGroundY` with walk shapes, gates, spawns
  and landmarks outlined (Node + zlib only), so layout can be judged without
  WebGL.

## 2b. X2 layout (frozen 2026-10-31)

- The observatory approach, observatory and beacon (and their constants,
  props, cameras, the lift and the summit of `cloudGroundY`) move rigidly
  **+90 m in z**, so the junction and both routes span z ≈ 265–400.
- **Junction (~900 m²):** crossroads plateau around (0, ~275); an overlook
  spur to the east ending at a cliff edge with a panoramic view of the coast;
  a short optional path to the junction chest; the two route mouths leave
  clearly apart (west up into the trees, east down into a rock cut).
- **Skyroot Canopy (~1,500 m², west, x ≈ -20…-75):** first a forest-floor
  section among giant trees standing on real terrain, then ramps and walkways
  climbing onto platforms carried by trunks/branches (kit sockets). The vine
  bridge (required) and the glide gap (required) are ≥ 25 m apart; the
  optional gust-lane branch leads to the canopy chest at a far-west
  viewpoint. Exit east to the approach at z ≈ 400.
- **Thunder Grotto (~1,500 m², east, x ≈ 20…75):** connected chambers —
  entry chamber, underground lake (raft basin, required), optional crystal
  side chamber (crystal chest), steam machinery (boiler gate, required),
  electric-panel corridor (same timing rules), exit mouth climbing to the
  approach. Drawn only when the camera is in or near it.
- Enemies per route ≤ 1.5× today's (≤ 9), required clears stay 6; at most 4
  awake. X2a = shift + junction + canopy (the grotto keeps its shape, joined
  to the moved approach by a longer exit trail); X2b = grotto.

## 3. Environment kit and trees

- New `src/scene/models/cloudKit.ts` (PartBuilder, vertex colours, the
  project's flat-shaded look): giant tree, mountain conifer, branch, root
  flare, rock formation, cliff segment, cave mouth, plank/rope bridge with
  posts, ruined stone wall/arch/tower pieces, waterfall surround, wooden
  shelter parts, observatory pieces.
- **Assembly rule:** every part of a composite is placed from its parent's
  attachment point (trunk top / branch tip / ground contact), never from an
  independent absolute coordinate. Foliage overlaps the branch or trunk that
  carries it; trunks and roots start below ground level; bridge ends and
  walkways rest on a post, branch or rock.
- A unit test builds each kit composite and asserts its connectivity from
  the attachment metadata (every part overlaps its parent's bounds; ground
  parts reach y ≤ 0), and fails on the old `treeGeometry` layout.
- Replace Cloud Isle's `treeGeometry()` (CloudIsle.tsx), the giant trees in
  `canopyGeometry()` (CloudRoutes.tsx) and any disconnected Cloud Isle props
  with kit parts. Inspect `models/nature.ts` trees too; fix only real gaps,
  and do not change their look on the home island otherwise.
- Code-built only (no glTF pipeline). No new textures; no transparent
  foliage cards.

## 5. Frontier wall (home island)

- An old stone defensive wall along the north edge of the sanctuary shelf,
  at the cliff lip around the lookout ledge and the rope head, whose ends
  run into the rock ridge / cliff terrain (never ending in open ground).
  Thick, weathered stone, moss and vines, broken parapets, one or two small
  ruined watchtowers, a gatehouse at the rope head.
- **Progression:** the gate is shut until `act2.started` (the kidnapping
  unlock that already gates the rope), then open. No new progress flag.
  Backtracking stays possible. The lowland's enemies already cannot leave
  the lowland; a unit test proves no lowland spawn or chase can reach the
  prologue side.
- **The view is kept:** at the lookout ledge the parapet is low (below the
  follow camera's sightline) so the forest, coast and distant scenery stay
  visible from the existing lookout framing and from the courtyard view
  decided in "The view beyond the lair". Matched before/after screenshots
  from those cameras are part of acceptance.
- No prologue puzzle, Lumo's sanctuary scene or existing collision outside
  the wall's footprint changes.

## 6. Saves

- Act 3 was never deployed, so there are no public Cloud Isle saves; the
  remap exists for debug and development saves and stays simple.
- `act3` gains `cloudLayout` (absent = 1, the pre-expansion layout; new
  saves write 2). Loading a Cloud Isle position with layout 1 places the
  player at the new spawn of their saved `act3.area`, then projects it with
  the current gates (never in rock, beyond a closed gate or off the floor).
- IDs of areas, stages, enemies, puzzles, chests, pickups and story beats
  are unchanged; solved puzzles, opened chests, coins, food, upgrades and
  chapters are untouched. No save key change.
- Every hard-coded Cloud Isle bound (`cloudNearestWalkable` scan box, the
  debug map bounds, camera zones) is derived from the zone shapes.

## 8. Acceptance (per slice, plus at the end)

- `npm run typecheck`, `npm test`, `npm run build`, the relevant Playwright
  specs; the full suite once at the end (controller-run).
- Area/route report from the script, committed numbers in `CURRENT_STATE.md`.
- Screenshots at 1366×768 and 1280×800 to `.tmp/shots/expansion/` with a
  `render-report.json` (calls, triangles, frame time per view).
- Close-ups of kit trees from several angles; wall from both sides and from
  the lookout before and after; Gull's Coming Soon line and notice.
