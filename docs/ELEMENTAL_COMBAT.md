# Elemental Combat — frozen spec (2026-11-01)

Source: the user's brief "Elemental Combat System: Revised Basic and Special
Attacks". This file is the contract slices E1–E5 implement against. Change it
only through the controller, and record why in `DESIGN_DECISIONS.md`.

**Central rule:** J (free) is each friend's signature power; K (MP) is the
tactical/area version that sets up combinations.

## 0. Controller verdict on the brief

Accepted as written: the eight moves, free J / MP K, directional (never
homing) aiming, control resistance, bubble chain reaction with damage caps,
cyclone carrying bubbles, wall/enemy/hazard collision damage, permanent
secrets in the save, Cloud Isle lock and frontier wall untouched, Chromebook
budget.

Modified:

1. **No auto-turn, no target lock.** The current `aimAt` turns the player
   toward a picked target; that goes. Every move uses the player's facing at
   the press. Only Vine Grab *selects* a target, and only inside its forward
   cone (`pickTarget` restricted to the cone; no fallback behind the player).
2. **Height is a small, scripted number.** Enemies gain `air` (metres above
   their ground). Lifts cap at 2.4 m so they stay in the fixed camera's
   frame. No physics engine: lift, carry and fall are timed curves.
3. **"Bosses".** The only boss is the Storm Beacon (pylons, not an enemy).
   "Heavy" enemies — `shellback`, `thunderBeetle` — take the boss-like
   resistance: never lifted or carried, snare = 60 % slow, grab = no swing
   (they take the vine hit and are tugged 1 m). The beacon fight keeps its
   rules: Bubbo's moves short a charging pylon, any move downs an exposed
   one, Puff's moves (J or K) cancel a gust aimed along it.
4. **Hazards are explicit data, not inferred from walkability.** A
   `HAZARDS` list (pond, canopy gaps, Cloud chasms, the sea edge where the
   coast path borders it) — an enemy whose knock-back carries its centre into
   a hazard is knocked out ("splash" / "fall" effect) through the normal
   `knockOut` path: stage credit, rewards, respawn rules all unchanged.
   Elsewhere knock-back still stops at walkable ground; hitting that stop at
   speed counts as a wall impact.
5. **Inferno input.** Tap K (keyboard or touch) = a fixed 1.2 s burst.
   Holding K on a keyboard extends it while MP lasts, up to 3 s total.
6. **Scope of "apply throughout the game" is bounded:** the shared
   interaction framework, one optional secret per friend, two optional
   two-friend puzzles, all on the **home lowland** (reachable in the live
   game). Required progression and the "Can you…?" English obstacles are
   unchanged — attacks never replace the English unlocks. Cloud Isle gets
   the new moves and its chasms as hazards, no new secrets (it is locked).
7. **Special-move words** change (trainer speech practice and buttons), kept
   to one easy imperative each. `act2.trained` is per friend, so saves are
   unaffected.

Rejected: soft-body vines, rigid-body physics, fire spreading through
forests, per-pair combo damage bonuses (combos emerge from the shared rules),
timed speech during combat.

## 1. Moves (data in `src/game/data/combat.ts`)

`MoveDef.shape` becomes:
`"breath" | "inferno" | "trap" | "bomb" | "grab" | "snare" | "blast" | "cyclone"`.
Old shapes are removed. Numbers below are starting values (tune in data).

| Friend | Key | Word | Name (en / ja) | Shape | Dmg | CD s | Range | Cost |
|---|---|---|---|---|---|---|---|---|
| Ember | J | Fire! | Fire Breath / ほのおの いき | breath | 7 + burn | 0.55 | 4.2 m, 50° | 0 |
| Ember | K | Burn! | Inferno / インフェルノ | inferno | 6/tick + burn | 2.5 | 6 m, 80° | 15 + 12/s held |
| Bubbo | J | Bubble! | Bubble Trap / あわの わな | trap | fall dmg | 0.6 | 10 m @ 10 m/s | 0 |
| Bubbo | K | Pop! | Bubble Bomb / あわの ばくだん | bomb | 22 r=3 m | 1.6 | 11 m @ 9 m/s | 30 |
| Leafy | J | Grab! | Vine Grab / つるで つかむ | grab | 8 + impacts | 0.75 | 4.5 m, 70° | 0 |
| Leafy | K | Stop! | Root Snare / ねっこの わな | snare | 6 | 2.0 | r=3.2 m centred 4 m ahead | 30 |
| Puff | J | Blow! | Wind Blast / かぜの いぶき | blast | 5 + impacts | 0.55 | 5 m, 60° | 0 |
| Puff | K | Spin! | Cyclone / サイクロン | cyclone | 4/s | 2.5 | 1.8 m/s for 4 s | 30 |

Upgrades (treats; `act2.upgrades` unchanged): Ember **Big Flame** cone
range ×1.3, burn ×1.5. Bubbo **Big Bubble** can trap the medium class
(snapjaw, stormCrab, raiderDrone, raiderShooter) — before the upgrade they
are trapped only for 1 s at 0.8 m. Leafy **Double Grab** (brief §4): two
targets bashed together. Puff **Big Wind** blast range ×1.3, cone 80°.

### Weight classes
`light`: gloomlet, forestSpitter, windSprite. `medium`: snapjaw, stormCrab,
raiderDrone, raiderShooter. `heavy`: shellback, thunderBeetle. Add
`weightClass` to `EnemyDef`.

## 2. Simulation (in `src/game/combat.ts`; pure rules in `src/game/logic/elements.ts`)

`EnemyRt` gains (all transient, never saved):

```ts
air: number;                 // metres above ground (rendered)
burn: { until: number; tick: number } | null;
control: null | {            // at most one control effect at a time
  kind: "trapped" | "grabbed" | "snared" | "carried" | "flung";
  t0: number; until: number; peak?: number; source?: number;
};
resistUntil: number;         // control immunity after a control ends
```

Rules (pure, unit-tested in `logic/elements.ts`):

- **Control resistance.** When a control ends, `resistUntil = now + R` with
  R = 1.2 s light, 2 s medium. A control attempt during resistance still
  deals the move's damage and knock-back but no control; the enemy shows a
  "shrug" flash. Snare on a snared enemy never extends `until`.
- **Burn.** 3 ticks/s, 2 dmg per tick, 2.5 s; re-ignite refreshes (no
  stacking). Burn never kills faster than its tick rate.
- **Bubble Trap.** Projectile travels straight on the facing at mouth height;
  first enemy touched (radius 0.8) is trapped: rise over 1.1 s to
  min(2.4 m, ceiling) (`peak`), wobble 0.8 s, pop, fall under gravity.
  Fall damage `round(6 + 8 * air)` at the moment of the pop (so an early pop
  at 0.8 m deals ~12, a full one ~25). Max 3 trapped at once — a 4th shot
  pops the oldest. Trapped enemies do not act; ranged wind-ups are
  cancelled. Ceiling: Thunder Grotto caves cap at 1.4 m.
- **Bubble Bomb.** Straight projectile; explodes on an enemy, a solid, a
  trapped bubble, or at max range. Explosion r=3 m: damage + outward knock 4.
  Each trapped bubble inside r pops (fall damage from its *current* air) and
  its own burst (r=2 m, 8 dmg) can pop further bubbles. Each detonation
  carries an id: an enemy takes burst damage at most once per detonation
  chain, and a bubble pops at most once. Chain length ≤ 3.
- **Vine Grab.** Pick the best enemy in the 70° / 4.5 m cone with a clear
  line (no wall/solid between, using `moveCircle`/solid queries along the
  segment). Light/medium: grabbed, swung through a 140° arc around the
  player over 0.45 s at 2.2 m radius, then released with knock 5 along the
  swing tangent (`flung`, 0.5 s). While swinging or flung, the enemy is a
  **weapon**: any other enemy it overlaps takes 10 and knock (once per swing
  per victim), and the weapon takes 6; hitting a solid/edge: weapon takes 8
  and stops. Heavy: 8 damage, 1 m tug, no swing. Upgrade with ≥2 targets in
  the cone: the two nearest are pulled together over 0.35 s, both take 14
  and 1 s stun. Single press — no second input.
- **Root Snare.** Centre 4 m ahead of the facing (clamped to walkable).
  Every enemy within 3.2 m: 6 damage, cancels ranged wind-up, `snared` for
  3.5 s light / 2.5 s medium; heavy = 60 % slow for 2 s. Snared enemies take
  normal damage, cannot move or attack, *can* be knocked back only as
  `flung` would (they stay rooted — knock-back is ignored while snared).
- **Wind Blast.** 60° / 5 m cone from the player. Light: knock 9, medium 6,
  heavy 2. Knocked enemies become `flung` for up to 0.6 s and are weapons
  (same rule as Vine Grab's swing). Wall/solid impact during `flung` with
  speed > 3 m/s: 8 damage + 0.6 s stun. Entering a hazard: knocked out.
  Trapped bubbles in the cone are pushed (air kept) 4 m; a pushed bubble that
  touches a solid or another enemy pops (fall damage from current air; the
  enemy touched takes 8).
- **Cyclone.** Spawns 2 m ahead, travels at 1.8 m/s along the facing for 4 s
  (stops at solids; never steers). Light enemies within 1.4 m become
  `carried` (air 1.2 m, orbit the core), at most 3; medium are pushed outward
  with 4 dmg/s; heavy only 1 m/s pushback. Hostile projectiles within 1.6 m
  reverse and become friendly (hit enemies, 6 dmg). Trapped bubbles within
  1.6 m are carried; they pop on the cyclone's end or a solid. At the end,
  carried enemies are thrown 4 m outward as `flung`. Max 1 cyclone alive.
- **Inferno.** While active (§0.5), every 0.25 s: enemies in the 80° / 6 m
  cone take a tick and are ignited; flammable world objects in the cone are
  ignited. Player can walk at 50 % speed while it is active and turns the
  cone with facing.
- **Fire Breath.** One instant cone check + a 0.35 s visual; ignites enemies
  and flammable objects.

All enemy damage, knock-outs and stage credit go through the existing `hit`
/ `knockOut` path. `crabDamage` keeps the storm crab's frontal armour for J.
Pooled limits: ≤3 trapped, ≤1 cyclone, ≤24 fx (existing cap).

## 3. Environmental interactions (`src/game/world/elementObjects.ts`)

```ts
type ElementTag = "flammable" | "grabbable" | "windy" | "liftable" | "breakable" | "heavy" | "anchored" | "trigger";
interface ElementObject {
  id: string;                // stable, saved
  world: "home" | "cloud";
  x: number; z: number; r: number;  // footprint (circle)
  tags: ElementTag[];
  /** What a response does (data, not code): */
  on?: Partial<Record<"burn" | "grab" | "wind" | "lift" | "bomb", { becomes: string; secret?: string }>>;
}
```

- A move's area query (`cone`, `circle`, projectile segment) also tests
  objects; a tagged object receives the matching event. Objects change
  **state** (`intact` → named state). Solids and walkability read the state
  (a burnt thicket no longer blocks; an opened trapdoor is walkable).
- Permanent states save in `progress.act2.secrets: string[]` (new field;
  `readAct2` keeps only known ids; older saves load with `[]`; save version
  stays 4). Temporary objects (bubbles, vines, cyclones) are never saved.
- Rewards inside secrets reuse the chest system (new `CHESTS` entries whose
  visibility/reach is gated on the secret state).

### Secrets (home lowland, optional, off the main path)

| Id | Friend | Discovery | Result |
|---|---|---|---|
| `emberThicket` | Ember | Dry thorny thicket in the first forest/grove edge; J or K ignites it, it burns for 1.5 s | Thicket gone; small cave nook with a chest |
| `bubboLedgeKey` | Bubbo | A key-shell on the ground below a ledge with a locked shell gate; Bubble Trap lifts it onto the ledge slot | Gate opens; treasure ledge with a chest |
| `leafyStatues` | Leafy | Two stone statues ~6 m apart; Vine Grab on each pulls it 3 m toward the centre plinth (two grabs) | Statues meet, plinth sinks, steps down to an underground chest chamber (shallow sunken room, not a new zone) |
| `puffLeaves` | Puff | Big leaf pile on old flagstones; Wind Blast or Cyclone blows it away | Trapdoor visible; walking onto it opens it; chest below |
| `comboCrateLift` | Leafy + Bubbo | A crate beyond a stream; Leafy pulls it onto a lift pad; Bubbo lifts it to a high switch | Bridge plank drops; chest island |
| `comboFurnace` | Ember + Puff | Cold furnace with a bellows-vent; Ember lights it; Puff's wind into the vent while lit makes it roar | Furnace door melts open; chest |

Each completed secret: one sparkle + chime + toast ("Secret found!"), and a
journal count ("Secrets 2/6"). Each must be solvable with one J press per
step (no precision timing). Placement: the slice that builds them picks
spots off the main path in existing lowland stages and records them here.

## 4. HUD, words, touch

- Buttons and hint panel read `COMBAT[f].basic/special` (`word`, `name`,
  `cost`) — they update automatically. Trainer panel lists both moves with a
  one-line Japanese description each (add `hint: Text` to `MoveDef`).
- Touch: J button = one press (held repeats, as now). K = one tap; Inferno
  tap = 1.2 s burst. No drag gestures.
- The first-attack and special-move tutorial hints are rewritten for the new
  moves (`HINT_OF` / store hints).
- Each move has a distinct sound from the existing `audio` set.

## 5. Visuals (`src/scene/Combat.tsx`, `src/scene/Effects.tsx`)

Reusable geometry, pooled meshes, ≤ +8 draw calls in a fight:

- breath / inferno: an additive cone of 8–14 pooled flame sprites from the
  mouth; inferno wider, taller, flickering.
- burning enemy: 2 small flame sprites on it.
- trap: translucent sphere around the lifted enemy; enemy wobbles; pop =
  existing splash effect.
- bomb: big bubble projectile; explosion = expanding ring + splash.
- grab: a vine as a stretched, segmented tube/line from Leafy to the enemy
  (not soft body); swing follows the enemy.
- snare: 5–7 root spikes erupting around each snared enemy and a ring decal.
- blast: wind streak cone (reuse gust).
- cyclone: a spinning tapered column of 3 rotating translucent shells +
  dust ring.
- shrug (resistance): a short white flash ring.
- Enemies render at `standY + air`; shadow stays on the ground.

## 6. Tests

- Unit (`--maxWorkers=4`): every rule in §2 (resistance, burn cap, fall
  damage from air, 3-trap cap, chain caps, grab cone/line, heavy behaviour,
  hazard KO credits the stage, cyclone carry cap, projectile reflect),
  secrets save round-trip and unknown-id filtering, old v4 save loads.
- e2e: one spec (`tests/e2e/elements.spec.ts`) per friend: J and K in the
  first forest via e2e hooks, asserting enemy state changes and MP; one
  secret solved and persisted across reload; Cloud Isle still locked.
- Screenshots of each move and the bubble chain (controller).
