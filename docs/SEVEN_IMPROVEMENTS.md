# Seven gameplay and environment improvements — frozen spec

Branch `feature/seven-improvements`. Do not merge or deploy without approval.
Preserve everything listed under "Preserve" at the end. Where this spec differs
from the original brief, the reason is given; this spec wins.

Save rule for every slice: `mi.save.v4` stays. Old saves must load. Anything a
save refers to by index (enemy spawn indices) stays stable: **append to
`ENEMY_SPAWNS`, never insert or reorder.**

## 1. Maple's opening conversation

`intro()` in `flow/story.ts`: the player turns toward Maple over ~0.3 s from
Maple's real position, Maple's yaw is set toward the player, then `frameTwo`.
Both hold for the whole conversation. No other conversation changes.

## 2. Forest Camp and combat-area walkability

**Camp.** The walkable link north of camp was a single point: camp disc
(`CAMP_SITE`, r 5.5) and the arm trail only touch at about z -165.5. Add to
`forest1.walk`: `rect(79, 93.2, -172, -158)`. The camp zone keeps its disc (it
remains the safe alcove). The rectangle deliberately stops at x 93.2 and z -158
so it cannot pass round the right-arm exit gate (cut x 93.6–94.4, z -182…-158).
Tent, fire, bench, trees and boulders stay solid.

**Audit.** Primeval Forest, Grove, Canopy, Causeway, Coast. Widen walk shapes
where flat open ground ends with no visible boundary. Banks (`forestBankY`) and
scenery scatter (`lowlandSpots`) follow walk shapes automatically: trees and
ferns must not stand on walkable ground without a collider. Keep the mesa,
stage-exit gates (no walk shape may bypass a `STAGE_EXITS` cut), deep water,
Canopy voids, Port Town walls and solid objects. Canopy decks are not widened.

**Tooling.** `CollisionOverlay.tsx` already draws walkable surfaces and solids
under `?debug=1`; extend it to the lowland if it does not cover it rather than
writing a second overlay. Add `scripts/walkability-audit.mjs`: an SVG/PNG of the
walkable mask at player and mounted radius over the height-shaded ground, plus
total m² per zone, so before/after can be compared.

Mounted radius is the real one in `collision.ts`/`combat.ts`; every widened
passage must pass at that radius.

## 3. Ancient Canopy stairs

The brief assumed the existing climb could be dressed. Measured: both ramps are
~10 m over 10–11 m of smoothstep, peak ≈ 54°, and the exit is 3.7 m wide. That
fails "avoid excessively steep or narrow", so both climbs are re-laid as straight
flights about 7–8 m wide at ≤ 38°.

**Entrance flight** (canopy zone), rising northward:
footprint `x 104–111`, `z -184.5` (foot) to `z -200.5` (top, meets `armApproach`
at full deck height). 16 m run, ≈ 32°. `FOREST_ARMS.right` ends at the foot; its
old diagonal climb is gone. `canopyRaise` stops raising the heightfield; the
flight is a deck surface in `lowlandDeckY`. Move `RIGHT_ARM_BOULDERS` off the
footprint. Tree at (101, -195) stays.

**Exit flight** (canopy zone), descending northward into the Causeway:
footprint `x 92–100`. A flat landing extends the Canopy deck to `z -239`;
flight `z -239` (top) to `z -252` (foot on Causeway paving). 13 m run, ≈ 37.6°.
`canopyDeckY` stays flat to z -239. Replaces the z -235…-245 ramp, the canopy
`trail` to (94, -245) and the second `STAGE_PASSAGES` entry. The Causeway lane
south of z -252 stays open east to west.

Canopy's first-clear gate moves to the top landing, `z` about -238, keeping
`STAGE_EXITS` id, kind and render; its cut spans the same x range. Move pillar
(96.4, -243.6) and any solid on the footprint. Existing gloomlet spawn
(95, -249.6) moves to (103, -247.5) **keeping its array index**. Update
`ROUTE_MARKERS`, `CANOPY_ENCOUNTERS` and camera profiles if they reference the
old ramp.

**Surface.** One height function per flight, linear with short eased ends so
there is no vertical snap at top or foot, shared by `lowlandDeckY`, rendering
and tests. Steps are cosmetic: each step's nosing sits on that line, so feet
never float or sink by more than half a riser (riser ≈ 0.3 m). No per-step
collision.

**Sides.** Low visible rock/root rims with capsule solids along both long sides
(no stepping sideways off a flight onto ground 5 m below), open only at top and
foot. Inner clear width ≥ 6 m on both flights. These edges are not fall hazards;
the flagged Canopy voids are unchanged.

**Look.** Broad stone treads, giant exposed roots across some steps, timber
cribbing under the upper third, rock supports, moss, vegetation. One merged
geometry per flight (PartBuilder), keep lowland views within budget
(`lowland-budget.test.ts`).

## 4. Lily pads

The brief's three large pads in a line do not fit: at the crossing the water
between bank (x 44) and islet rim (x 39.4) is only 4.6 m. The pads therefore
follow a curved route around the islet through the crescent of open water:

    LILY_PAD_R = 1.1
    LILY_PADS  = (42.6, -223.4), (41.4, -226.0), (38.7, -227.5)

Rim gaps ≈ 0.66 m and 0.89 m of open water; all three sit inside the pond and
clear of the islet. Rising, sequential splash, script and static island stay as
they are (`groveCrossing` already loops over `LILY_PADS`).

**Walking.** Delete `LILY_WALK`. Each pad is its own disc, centre clamped to
`max(0.25, LILY_PAD_R - min(radius, 0.35))` so a mounted body can stand on it.
`lowlandDeckY` returns the pad height only inside a pad disc. Water between
pads is blocked.

**Hop.** New pure module `logic/lilyHop.ts`. Route nodes: near bank → pad 0 →
pad 1 → pad 2 → islet landing. `hopTarget(x, z, ux, uz, solved, unlock)` returns
the neighbouring node when all hold: `groveLilies` solved and unlock = 1; the
walker is on a node (bank/islet: within 1.4 m of the launch point; pad: on the
pad); input points within 50° of the neighbour; and the walker is within 0.9 m
of its node's rim on that side. Nothing else can start a hop, so no cliff or
hazard triggers one.

`rt.player.hop = { fromX, fromZ, toX, toZ, t0, seconds: 0.38 }`. While set,
input is ignored, position follows the arc (height `sin(pi k) * 0.55`), the rider
and mount hop together, no damage or knockback applies, then a small splash and
sound. Landing is always the node centre (bank/islet: the launch point), so it
cannot fall in the water. Followers rejoin through the existing stuck rule.

**Look.** Each pad has its own silhouette: notch, radial veins, a per-instance
yaw, slightly different flower. Save projection: a saved position over open
water falls back to the nearest walkable ground through the existing path.

## 5. Smoke spawns

All enemies are created when the game loads, so there is no "spawn" moment to
hook; the brief's plan assumed one. Add one: enemies start **dormant** (not drawn,
no AI, no collision, not targetable, cannot be hit) and materialise when relevant.

- **Activation:** player in the enemy's zone and within 20 m of its home point.
  This also spaces the Causeway into encounter pockets without any extra system.
- **Stagger:** activations queue per zone, 0.12 s apart.
- **Sequence (0.5 s):** smoke at home point; visible from 0.18 s, scaling in; no
  AI, attacks or damage to or from the enemy until 0.5 s; then normal behaviour.
- **Re-dormant:** only `resetCombat`, world change, and `respawnZone`. Crossing a
  boundary without a real respawn keeps enemies awake and plays no smoke.
- **Scripted:** Storm Beacon reinforcements (`i >= 10000`) get the same smoke at
  creation, with no dormancy. Cloud Isle enemies use the same rules.
- **State:** dormant must not read as `gone` (`gone` means defeated to specs and
  hooks). The e2e snapshot must expose it truthfully; `e2e.ts` hooks that set up
  fights must wake their target, so existing specs still work.

**Look.** One instanced mesh of low-poly puffs, pale grey/off-white, expanding and
fading, shared in one draw call (prefer extending the existing `poof` effect). A
short synthesised pop in `audio.ts`. Respect the existing per-frame effect limits.

## 6. Secret chests

Every chest with `secret` set (all eight), for the chest, lid and glow:

- `Chest.tsx`: drawn only when its secret is in `progress.act2.secrets`.
- `lowlandSolids()` stops adding secret chests; `secretSolids(secrets)` returns
  the blocker before discovery and the chest's box after. The collision cache is
  already keyed on secrets.
- `focus.ts` already gates interaction: keep and test it.
- A small smoke puff (from §5) and sound when a chest appears live; none on load.
- Non-secret chests are unchanged. Undiscovered chests appear on no marker, map
  or debug-free hint.

Blockers stay: each already matches a visible enclosure, so no invisible
obstacle remains. Remove any rendering that leaks a glow or a chest-shaped
silhouette. Puff's leaves keep the existing two steps: wind clears the leaves
and exposes the hatch; stepping on the hatch opens it and reveals the chest.

Examples in the brief describe the existing secrets. No new secrets.

## 7. Ruined Causeway: 14 enemies

Append exactly these seven at the **end** of `ENEMY_SPAWNS`:

| kind | x | z | pocket |
| --- | --- | --- | --- |
| gloomlet | 88 | -248 | Canopy stairs, west side |
| raiderShooter (replaces snapjaw) | 96 | -257 | foot of Canopy stairs |
| snapjaw | 73 | -247.5 | central pillars (moved from 72, -250: statues need 4 m clearance) |
| shellback | 78 | -259 | central Causeway |
| gloomlet | 68 | -261 | route to the Coast |
| snapjaw | 54 | -252 | Grove entrance |
| gloomlet | 101 | -259 | shrine approach |

All required (no `optional`); first clear follows from `ENEMY_SPAWNS` (14). If a
point fails the walkable test, nudge it under 2 m and record it. Enemy attack
slots are unchanged. Verify instance caps in `Combat.tsx` for the larger crowd.
Enemy kinds and rewards unchanged.

## Preserve

Beach side-view camera, U forest, mesa, Forest Camp checkpoint, expanded Grove
and Canopy, Canopy fall hazards, Leafy's grab and throw, Puff's wind and Cyclone,
Bubbo's bubbles, Ember's flames and blue Inferno, mouse/keyboard/touch controls,
Port Town walls and gates, save compatibility, story, inventory and rewards.
`CLOUD_ISLE_RELEASED` stays `false`.

## Tests

Unit: every point above that is pure logic. Browser specs live in
`tests/e2e/seven-improvements.spec.ts`. Run with
`npx vitest run --maxWorkers=4`; Playwright uses `MI_LONG_TIMEOUT=3600000`,
fixed port 4176, one suite at a time.
