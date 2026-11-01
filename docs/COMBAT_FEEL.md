# Combat feel: held fire, panic, mouse, flexible whip — frozen spec (2026-11-02)

Source: three user briefs (Ember continuous fire and burning panic; mouse
combat controls; Leafy's vine whip). Builds on `docs/ELEMENTAL_COMBAT.md`,
which stays in force except where this file changes it. Change this file only
through the controller and record why in `DESIGN_DECISIONS.md`.

## 0. Controller verdict

Accepted as written: J/left hold = continuous free cone, K/right = Inferno,
no homing, ignition, attached flames, panic with a funny yell, panic movement
safety, resistance after panic, normal KO credit, mouse table, context menu
only on the canvas, one shared input system, whip as a live-rooted curve,
snare roots that twist.

Changed:

1. **Tap on J still does something.** The first flame tick is on the press,
   so a tap deals one tick and lights a secret object (spec §3 of the elemental
   file: one J press per step). Only sustained exposure ignites enemies.
2. **"Releasing stops immediately":** emission and damage stop on release; the
   flame tongues already in the air vanish within 0.12 s rather than popping.
3. **Panic must be seen.** Unchanged DPS would kill a gloomlet before it ran.
   Fire damage (cone and burn) cannot take a panicking enemy below 1 HP during
   its first 1.2 s of panic. Other moves can still KO it. This is the core gag.
4. **Enemies have no limbs to wave.** Every enemy is one merged mesh. We do not
   rig nine models. One new instanced limb batch draws per-kind temporary flail
   limbs during panic only (+1 draw call), and body motion is per-kind.
5. **Voice:** browser TTS for the words ("I'm on fire!") plus an instant
   synthesised cartoon yelp, because TTS can lag and may be missing on a
   Chromebook. TTS must never delay dialogue or the microphone (§3).
6. **Flame sound loops** (a filtered-noise loop), not a repeated one-shot.
7. **Held Vine Grab repeats only with an eligible target;** a fresh press always
   whips so the input never feels dead. Applies to all whip input sources.
8. **Hits land at the snap,** 0.15 s after the press, not at the press. A
   pending strike reads position and facing at that moment. Still no homing.
9. **Inferno sustain:** the 3 s cap is removed; MP is the limit. Touch hold
   sustains it too. The 1.2 s prepaid tap stays, and the free Storm Beacon case
   keeps its 3 s cap (it has no MP to run out).
10. **Mouse chords:** browsers fire `pointerdown` only for the first button of a
    chord, so read `e.buttons` on `pointerdown`/`pointermove`/`pointerup`, and
    only for `pointerType === "mouse"` (touch keeps its own buttons).

Rejected: mouse aim; soft-body vine; per-frame mesh rebuilds; per-enemy DOM
speech bubbles (one shared canvas texture instead); recorded voice assets;
making heavies immune to panic (they get a shorter one).

Real-Chromebook testing is not possible from this machine and stays a Known
Issue. Automated runs use the existing touch-only and 1366×768 projects.

## 1. Shared attack input (`src/input/attackInput.ts`)

```ts
type AttackSlot = "basic" | "special";
type AttackSource = "key" | "mouse" | "touch";
pressAttack(slot, source): void    // marks held, fires the move once
releaseAttack(slot, source): void
releaseAllAttacks(): void          // clears every source until a fresh press
isAttackHeld(slot): boolean        // any source
```

- The attack functions stay in `combat.ts`: `basicAttack()` / `specialAttack()`.
  Nothing else calls them outside this module, except tests and e2e hooks.
- Keyboard (`flow/input.ts`, `keyboard.ts` up/blur), mouse (canvas) and touch
  (`Act2Hud.tsx`, both move buttons) all go through this one module. `sim.ts`
  sets `cb.hold` / `cb.holdK` from `isAttackHeld`. `cb.touchHold` goes away.
- **Latch:** a physically held key or button does not resume after a release-all;
  a fresh press is required.
- Release-all on: window blur, `visibilitychange` hidden, leaving the attack-
  allowed state (journal, settings, `g.panel`, an open dialogue line, non-explore
  mode, screen change, knock-out, cutscene). Add `!g.panel` and the open-line
  check to `canFight()` so J cannot fire behind a panel.
- **Switching friends does not release.** Fire stops at once because `friendNow()`
  is null during the hop, then the held input repeats the new friend's basic.
  A held special never triggers on the new friend (press edge only).

Mouse (installed on the R3F canvas element, removed on unmount):

- Press starts only when the target is the canvas. Left bit = basic, right bit =
  special. Track moves and release on `window`, so a release over the HUD or off
  the window still lands. No camera movement. Mouse position is unused.
- `contextmenu`: `preventDefault` on the canvas only, and only on the game screen.
- HUD, dialogue, journal and menus sit above the canvas and so never start one.
- Hints show the mouse alongside the keys in the desktop HUD (J / left click;
  K / right click). Touch HUD is unchanged apart from holding.

Repeats: `basicAttack` gains `{ repeat: true }` for the per-frame held call. A
repeat uses cooldowns as today; Leafy's repeat skips when nothing is eligible.

## 2. Fire Breath (`combat.ts`, rules in `logic/elements.ts`)

`cb.breath: { age: number; tick: number } | null`. Active while `cb.hold` and
the friend is Ember, `canFight()`, no Inferno. Blocked during Inferno.

- Data: `COMBAT.ember.basic` damage **3**, cooldown **0.25** (the tick), range and
  50° unchanged. DPS ≈ 12, close to the old 12.7, so fights keep their length.
- Each tick, including one on the press: cone from live position and facing, beacon
  shape, `dispatchObjects`, then every enemy in the cone takes the tick through
  `fireHit` (below) and adds one exposure.
- **Ignition:** `e.fireTicks` reaches 3 (0.5 s continuous exposure) → ignite and
  try panic. Reset when out of the cone for over 1 s. Inferno ignites on its first
  tick. Burn rules are unchanged: 2.5 s, 3 ticks/s, 2 dmg, refresh without stacking,
  Big Flame ×1.5. Burn and exposure pause with `pauseElements`.
- `fireHit` / burn call `hit` with `quiet: true`: no `hit` sound, no `hit` fx, no
  `learn` re-entry cost, a body flash only at most every 0.25 s, and
  `crabDamage` armour still applies. Fx must not flood the 24-slot pool.
- Stops (no latency): release, friend change, zone change, knock-out, `canFight()`
  false. `clearSpecials` clears it. Flame loop stops with it.
- Player walks at normal speed while breathing (Inferno keeps 50 %).

### Visual — one coherent stream

From Ember's **live mouth anchor** (§5) every frame, along the current facing. 16
to 20 flame sprites at evenly advancing phases in the existing `sprites` batch: a
narrow hot core at the mouth widening toward the cone range, no gaps, no
detached balls. Flicker by per-sprite sine; no per-frame allocation. Inferno:
same code, wider, taller, longer. Big Flame scales the length.

## 3. Burning panic

`EnemyRt` adds (transient, never saved):
`panic: { t0; until; turnAt; hx; hz; blocked: number } | null`, `panicResistUntil`,
`fireTicks`, `lastFireT`.

- **Start** on ignition when not resistant (`rt.time >= panicResistUntil`), alive,
  and with no control active. A resistant or controlled enemy still burns and just
  keeps acting (or stays controlled). Cancels wind-up: if `windup` or `lunge`, set
  state to `chase` so no tell shows, and for ranged disperse its shot. Duration
  **2.5 s** light/medium, **2 s** heavy.
- **End:** state `chase` if the player is in the zone, else `return`.
  `panicResistUntil = now + 4`. Repeated fire refreshes burn only; it never restarts
  or extends panic. Clear on `sendHome`, `knockOut`, respawn. Pause it with
  `pauseElements`.
- **Priority:** `updateElements` runs first, so control (flung, trapped, grabbed,
  snared, carried) and knock-back still apply. Panic's clock keeps running under
  control; a panicking enemy can be blown back or bubbled. Panic resumes if time
  remains. Panic runs in `updateEnemy` after that and before any AI, including
  `updateRanged`. No attacks while panicking.
- **Fire floor:** see §0.3, a pure `fireDamage(hp, damage, panic, now)`.

### Movement (pure heading rules in `logic/panic.ts`, unit-tested)

Heading changes every 0.35–0.7 s (by kind), biased away from the player and, past
70 % of `leash` from home, toward home. Move by `stepTo` (it already collides and
refuses to leave the zone), at `speed × 1.7` (heavy `× 1.2`). Candidate step must
also fail `hazardAt`: panicking never enters a hazard. Moved under 10 % of the
expected step → `blocked++` and a new heading at once; after 3 blocks head straight
home. Not spinning in place. Property test: every spawn in every zone over 2.5 s
of steps stays walkable, in its zone, outside hazards, and makes net progress.

### Per-kind character (`src/scene/panicPose.ts`, pure)

`panicPose(kind, i, age, step)` returns `{ hop, lean, roll, squash, shake }` and is
the **only** source for panic body offsets. `Combat.tsx` applies it, and flames,
limbs and speech bubbles read the same value so they stay glued to the body.

| Kind | Run | Flail limbs |
|---|---|---|
| gloomlet, forestSpitter | fast bouncing dash | two stub arms up |
| snapjaw | leaping zigzag, jaws-up lean | two short forelegs paddling |
| shellback, thunderBeetle | heavy stomp, side-to-side rock | four short legs kicking |
| stormCrab | sideways scuttle (yaw ⟂ heading) | two pincers up, snapping |
| raiderShooter | upright run, arms raised | two arms straight up, waving |
| raiderDrone, windSprite | hover darts, abrupt turns, tilt into motion | two small wings/wisps fluttering |

Limbs: one new `limbs` `Batch` (capsule, about 12 triangles), per-kind colour from
a data table. Positions come from `e`, panic pose, yaw. Hidden unless panicking.

### Flames and bubble

Flames in `ElementEffects`: panic 4 sprites, plain burn 2, centred on the body at
`ground + air + pose.hop`. Bubble: one shared `CanvasTexture` "I'm on fire!" comic
bubble drawn as an instanced billboard above the enemy (+1 draw call, only while
shown), at most 3 at once, visible for the first 1.6 s of panic.

### Audio (`src/audio`)

- `yelp`: short synthesised rising "wah-WOO" in `audio.ts`. Global cooldown 0.8 s.
- Words: `tts.speak("I'm on fire!", { pitch: 1.7, rate: 1.25 })` at most once per
  **4 s** globally and never when `tts.isSpeaking()`, not in explore mode, an open
  line, or while listening. Skip silently if unavailable. If dialogue starts,
  existing flows call `tts.cancel()`; verify nothing awaits the bark. Bark must not
  flip the "speaking" music duck longer than its own length.
- Cartoon only: no realistic screams. Volume under normal sfx.
- Flame loop: `audio.startFlame()` / `stopFlame()`, idempotent, gain at most 0.25,
  stops on pause, zone change and blur, and also with `visibilitychange`.

## 4. Inferno

`infernoStep`: held extends without the 3 s cap until MP runs out (free beacon case
keeps 3 s). `cb.holdK` includes all sources. Other K moves stay one per press, so a
held button never drains MP again. Inferno draws from the live mouth anchor (§5).

## 5. Live anchors (`src/scene/anchors.ts`)

```ts
anchors: { emberMouth, leafyHandL, leafyHandR: THREE.Vector3; valid flags }
```

Each is a child `Object3D` in the friend's rig (`Monsters.tsx`): `leafyHandL/R` on
`armL/armR` at the hand (0, -0.24, 0.03), `emberMouth` at the real mouth in Ember's
head part. After `Monsters` poses them each frame, write world positions with
`getWorldPosition` (no allocation).

**Order bug to fix:** `ElementEffects` mounts inside `CombatScene` before `Monsters`
(`GameScene.tsx`), so its `useFrame` runs first and sees last frame's pose. Move it
to run after `Monsters` (mount order; positive `useFrame` priorities would stop R3F
auto-rendering, so do not use them). A test must show base-to-anchor distance 0.

The existing duplicated stance blend in `ElementEffects` and the static `f.x/y/z`
vine fx are deleted — those are the visible lag. No attack visual reads the position
stored at the press.

## 6. Whip (`logic/whip.ts` pure; `cb.whip` state; drawn in `ElementEffects`)

`cb.whip: { t0; yaw; struck; strands: Strand[] } | null`; up to 2 strands.
Timeline (seconds from press):

| 0–0.07 | 0.07–0.15 | 0.15 | 0.15–0.24 | 0.24–0.5 |
|---|---|---|---|---|
| wind-up: curls back | extension: wave base → tip | snap: **hit + whip sound** | follow-through past impact | retraction, curling home |

- The strike is pending state in `combatTick`: at 0.15 s evaluate the existing grab
  logic with live position and facing, and play the sound there. Cooldown stays 0.75.
  Time-based, so low frame rates do not change it. Friend switch or stop before the
  snap cancels the strike (the cooldown remains spent) and the vine retracts in 0.1 s.
- **Visual aim during extension** samples the same forward-cone pick each sim frame,
  so the tip arrives at what the snap will grab. It never changes facing or adds
  reach; no target is locked before the snap.
- **Grabbed:** strand connects the live hand anchor to the enemy's live body point
  every frame. Tension rises during the swing, reducing curve amplitude to a slight
  bow, never fully straight. On release: retract with a wave. Heavy: tip hits, a tug
  jolt, retract. Object grabs: tip goes to the object.
- **Double Grab:** two strands, `leafyHandR` and `leafyHandL`, one enemy each; both
  flex as enemies meet, impact fx at the middle, then both recoil. No crossing:
  assign hands by each enemy's side of the facing.
- **Curve:** `whipPoints(out: Float32Array, n, root, tip, facing, phase, tension)`
  fills n points; allocates nothing. Arcs up and forward enough to clear the player's
  head when perched. Travelling sine wave with amplitude growing toward the tip.
- **Rendering:** existing `vines` batch, 16–20 instanced segments per strand, radius
  tapering 0.075 → 0.018 m, each segment oriented between its two points with small
  overlap; smooth dark-to-light colour gradient (no alternating knuckles), 2–3 small
  leaves in the sprite batch or a leaf-tinted segment. No new draw calls, no
  per-frame geometry. Leafy's arm lifts during the attack via the existing arm pose.
- Delete the rigid `draw.vine`.

### Root Snare

Ground-anchored; unrelated to the hands. 6 curved roots per snared enemy, each 6–8
tapered segments in the `roots` batch rising from a ring around the enemy, spiralling
inward and wrapping its body up to about 0.8 of its height, with growth and retract
animation. Same curve-segment helper, no straight spikes. Rooted at `ground`.

## 7. Budgets

≤ +3 draw calls in a fight over current (limbs, bubble, one spare), none when idle.
No allocation in `useFrame` or per-tick paths beyond what `coneTargets` already does.
Instance batches stay under `CAP`. At most 8 panicking enemies render limbs and
4 flames; extra ones get 2 flames and no limbs.

## 8. Acceptance

Unit (`--maxWorkers=4`): input latch, sources, chord, release-all; tick cadence at
30 and 8 fps equal in damage; ignition threshold; fire floor; panic duration by weight;
no restart; resistance; property movement; bark cooldowns; `whipPoints` root exact,
tip reached at snap, tension; strike timing and cancel; held Leafy repeat skips with
nothing eligible; Inferno sustain and MP stop; single-press specials never repeat.

Browser (controller runs; Codex's sandbox cannot launch Chromium): extended
`tests/e2e/elements.spec.ts`, new `tests/e2e/combat-feel.spec.ts` for mouse buttons on
the canvas, HUD click not attacking, context menu, touch hold, whip base-to-anchor
distance over a moving strafe, panic bounds, KO credit. Rendered evidence judged by the
controller in `.tmp/shots/feel/`.
