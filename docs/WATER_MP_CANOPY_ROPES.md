# Water, MP, Forest Camp, Canopy ropes, cameras, Causeway: frozen spec

Branch `feature/water-mp-canopy-ropes` from `main` at `1483dee`. Do not merge or
deploy without explicit approval. Save stays v4; Cloud Isle stays Coming Soon;
debug access stays. `ENEMY_SPAWNS` is append-only (moving an entry keeps its index).

## 1. "I am hot!"

Replace "I'm on fire!" in the speech texture (`scene/ElementEffects.tsx`), the TTS
bark (`audio/audio.ts`) and tests. Existing rate limiting stays. No instance of the
old phrase remains in `src/` or `tests/`.

## 2. Water puts out fire

Today enemies cannot enter ponds: panic steps stop at the hazard edge and forced
motion into a `splash` hazard is a knock-out (`splashKo`). Streams (`STREAMS`) are
walkable decor. Both facts stay true except for the wade below.

- **`waterAt(x, z, world, solved)`** (pure, new `logic/water.ts`): `"none" | "shallow"
  | "deep"`. Stream: `shallow` only inside the rendered water, using the same width and
  surface as the stream mesh and only where terrain is below `streamY`. `splash`
  hazards outside their `safe` shapes: `deep`, and `shallow` in the outer rim
  `POND_WADE = 1.1` m inside the edge. Everything else `none`. Being beside water is
  `none`.
- **Extinguish** (`extinguish(e)` in `combat.ts`): clears `burn`, `panic` and the blue
  flame; steam puff (new `steam` fx, small, white, rising, about 0.6 s); short sizzle
  (new sound in `audio.ts`); speech bubble gone with the panic; cancels a still-speaking
  bark if the TTS layer allows it. The enemy resumes normal behaviour after a brief
  recovery (reuse the existing end-of-panic path and `panicResistUntil`).
- **When:** every live frame, for a burning or panicking enemy that is grounded
  (`air` below 0.3, not grabbed or in a bubble) and with `waterAt != none`. Covers
  running, throws, bubble bursts, Puff's push and knock-back, on landing.
- **Wade:** a panic step into a `splash` hazard's rim is allowed (only that step, only
  while panicking). It extinguishes, then the enemy walks straight back to its last
  walkable point over about 0.5 s. No KO. Non-panic chase/idle steps are unchanged and
  never enter hazards; solids and unrelated unwalkable ground stay blocked.
- **Deep:** forced motion into a `splash` hazard stays the existing KO, plus steam and
  sizzle if the enemy was burning. Reward behaviour is unchanged.
- **Ignition:** `igniteEnemy` does nothing while the enemy's `waterAt != none` (no
  per-frame relight or sizzle spam; throttle any puff to once a second). Direct fire
  damage is otherwise unchanged. Out of the water it ignites normally. Fire Breath and
  Inferno both go through this.

## 3. MP

`regenMp(v, dt, consuming?: CompanionId | null)`: every companion regenerates at the
existing `MP_REGEN` except `consuming`. In `combat.ts`, `consuming` is the friend whose
paid special has a live active state: Inferno while `cb.inferno` is set and not free at
the beacon, and Cyclone (or any other paid special) while its own state runs. A special
with no active state (Bubble Bomb's instant spend) blocks nothing. Free basics block
nothing. No regen and drain in the same frame for that friend. Rate, caps, food, inn and
saved values are unchanged.

## 4. Forest Camp removed

- `ZoneId` loses `camp`. Its walk shapes (including the north opening) become `forest1`
  walk shapes, so no floor is lost. Tent, fire, bench, dirt patch, solids, map labels,
  welcome toast, `CAMP2`, `CAMP_SITE`, route marker, camera profile and any ambience go.
  The Maple camp and beach `CAMP` on the home island are unrelated: do not touch them.
- Natural replacement: forest ground colour, a few small non-solid rocks and plants. No
  clearing look.
- **Checkpoint:** `Checkpoint` becomes `"cliff" | "port"`. The foot of the rope is already
  a tested wake point at the forest entrance, so it is the forest checkpoint; no new
  place, no rest station.
- **Objective:** `crossing` is removed; `reachPort` follows `openChest`. `reachCrossing`
  goes. `rest` stays in `TUTORIAL_STEPS` so saved lists keep validating; nothing requires it.
- **Save reader:** checkpoint `"camp"` becomes `"cliff"`. Zone `"camp"` becomes `"forest1"`.
  `a.cleared` inference that reads the old checkpoint or zone reads the raw value and still
  gives `["forest1"]`. A saved position in the old camp stays there: it is forest floor now.
- Debug progress/travel: `forestCamp` becomes a forest-entrance entry; nothing is lost.

## 5. Black patches

`scene/Secrets.tsx` draws the flat `DARK` floor (`y + .015`) for pockets. Remove flat dark
rectangles. A closed pocket has no floor of its own: the terrain shows. A pocket that opens
(trapdoor, furnace, crate lift) has coherent stone or wood framing. Discovery rules
(`chest-visibility`, drawn only after discovery) are unchanged. No glowing platform.
Bubbo's cage floor gets the same treatment if it is the same dark rectangle.

## 6. Cameras on raised ground

Root cause: `frameTwo` and scripted `shot()` use `groundY`, which under the Canopy is the
forest floor 10 m below the deck.

- `script.ts`: `walkY(p)`, the real height through `standY` with current solved, used by
  `frameTwo`. Flows in `act2.ts` (chest scene, sparkle), `obstacles.ts` and `encounter.ts`
  use it wherever a point can be on a deck. Monster flight helpers that convert world y to
  `air` (`flyThrough`, `glide`, `m.air = y - groundY`) must match how monsters are actually
  placed; check Canopy `canopyVines` and `canopyRope`, fix if they float or sink.
- `shot()` and `frameTwo` clamp: camera y is at least `walkY(camera xz) + 1.2` and at least
  subject y + 1. A scripted camera must not start below a deck or look at its underside.
- Check `CameraRig.tsx` occlusion and floor checks see deck surfaces. Normal Canopy follow
  camera returns after every script (`run` already resets it).

## 7. Ropes replace stairs

Remove `CANOPY_FLIGHTS`, `CANOPY_FLIGHT_RIMS`, `canopyEntranceY`, `canopyExitY`,
`flightFraction`, `canopyFlightGeometry`, the flight meshes and the stairs tests. No
walkable ramp remains anywhere.

Shared data `CANOPY_ROPES` in `world/lowland.ts`, same field style as `CLIFF_ROPE`:

| Rope | x | Face z | Foot stand z | Top stand z | Faces |
| --- | --- | --- | --- | --- | --- |
| `entrance` (forest arm to `armApproach`) | 107.5 | -200.5 | -198.9 | -202.2 | -z |
| `exit` (`exitLanding` to Causeway) | 96 | -241 | -242.8 | -239.8 | +z |

- `exitLanding` extends north to `z -241` so standing room exists beyond the gate at
  `z -238`. Its anchor is a timber post on the landing. The entrance anchor is a large
  branch or post on `armApproach`.
- The stairs footprint `x 104–111`, `z -184.5…-200.5` is ordinary `forest1` ground up to a
  deck face. The exit stairs' footprint north of `z -242.5` is ordinary Causeway. Adjust
  coordinates only if a test shows a foot or top is unwalkable, and say so.
- **Ground and deck are separate.** Both raised edges need an unwalkable strip (like
  `PORT_WALL_CUTS`) so nobody steps between them, on foot, mounted, by knock-back or by
  enemy. `lowlandDeckY` and `canopyUnion` must not lift a walker on the forest side. Faces
  are visibly solid (bark, roots, rock).
- `zoneAt`: the arm floor is `forest1`, Causeway floor is `causeway`, deck is `canopy`.
- **Climb:** generalise `climbCliff` to `climbRope(rope, down)` using `standY` for the top
  and a facing per rope. `CLIFF_ROPE` behaviour is unchanged. Dismount first, `gatherParty`
  at the destination, never leave `frozen`/`climbY` set (a debug cancel too). Top and foot
  stand points get `safeGround` updated so a later fall does not land at the old spot.
- **Exit rule:** the `canopy` `STAGE_EXITS` gate stays at the top landing. Rope down: reached
  only past the gate. Rope up from the Causeway: refused until `canopy` is in `cleared`, with
  a friendly line (en and ja). So it cannot bypass a stage.
- Falls and voids unchanged; `canopyVines` and `canopyRope` puzzles unchanged. Existing deck
  fall rules apply at the new landing: no new fall edge at the rope edges.
- Enemy spawn or ride routes through the old stairs: enemies cannot climb. The gloomlet at
  (97, -203.3) and others stay put. Canopy arm enemies that were on the stairs side keep
  their index. Adjust `ROUTE_MARKERS` and `routeMarker` to the rope feet.

## 8. "Can you fly?"

New obstacle `canopyAscentRope`: `needs: "fly"`, `question: "canFly"`, `others: ["canJump",
"canSwim"]`, `after: []`, in `ACT2_OBSTACLES`, `THANKS`, focus text, and debug progress.

Flow at the entrance foot, through the existing ask flow and speech/tap system: coil on
the ground and a rope that cannot be climbed yet; "Can you fly?" 「とべる？」; Puff says
"Yes, I can!"; Puff takes the free end and flies up, rope visibly paying out from the coil
and connected to Puff the whole way; a short loop-around-the-anchor beat (poof plus sparkle);
lower end hangs in reach. Reuse `flyRope` by giving it a rope definition rather than copying
it. Wrong helper or wrong question behaves like the other obstacles.

Before solving there is no climb prompt, only the ask. After solving the coil is gone, the
rope is drawn on load, and the rope is climbable both ways for good.

**Save:** on read, grant `canopyAscentRope` when `canopy` is in `cleared`, either bridge is
solved, the saved zone is `canopy`, or the position is on a deck or an old stair. That
covers `portFound` because it clears every stage. A save on an old stair footprint moves to
the deck top if on the upper half, otherwise to the entrance foot; the exit stair moves to
the exit foot in the Causeway when `canopy` is cleared. Nothing resets stages, chests or
secrets. A Grove-route player who never saw the Canopy gets the puzzle.

## 9. Causeway pillars

Remove every `RUIN_PILLARS` entry with `z < -240` and its collision. The three forest and
Grove entries stay (half-sunk stones off the fight). The shrine arch and the Grove-mouth arch
stay only if they do not stand in the fighting area; their legs need no collision change
unless a test shows a body catches. Add low rubble, no taller than 0.3 m and with no
collision, along the Causeway's edges, plus grass through paving. Keep the draw-call budget.

14 Causeway enemies stay, indices unchanged. Move a spawn only if it ends up crowded,
keeping its index. Stage clear, rewards, shrine and route to the Coast are unchanged.

## Acceptance

- Unit: pure water classification (inside, near-but-outside, safe shapes), regen per friend,
  save migrations for every case above, ropes' feet and tops walkable and strips blocking
  on foot and at the mounted 0.55 m radius, no walkable route between floor and deck
  anywhere, pillar solids gone, spawn count 14, chest camera above deck.
- Browser (controller): the new spec `tests/e2e/water-ropes.spec.ts` plus rendered
  screenshots at 1366×768 and 1280×800 of Causeway, former camp, secrets, the puzzle's
  stages, climbing both ropes and chest cameras on the deck.
- Existing specs follow the map; no behaviour outside this spec changes.
