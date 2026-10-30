# Design Decisions

## 2026-10-30 — Opt-in playtest debug controls

- The debug menu and DEBUG badge are available only with `?debug=1` or in
  the Vite development server. Ctrl+Shift+D and backquote toggle the menu;
  Escape closes it. The open menu pauses simulation and captures input.
- Debug sessions read, write, and reset only `mi.debug.save`; they never
  read or migrate real saves. Ordinary sessions retain the existing save
  keys and behavior. This keeps classroom play safe from accidental tester
  state and makes the active debug session visible.
- Named jumps reuse the test hook's placement code and establish story
  prerequisites. Map travel and free flight are deliberate tester tools;
  they do not change authored story, camera, puzzle, or combat rules.

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

## 2026-10-30 — Gameplay polish Part 2 — decisions made while building

### Companions (slice B2: item 10)

- Combat mounts set the active friend's mode to `script`. Dismount used to
  preserve that mode even without a running scene, leaving the last active
  friend stranded at the hostile border. Combat now releases its friend to
  `follow` (or `party` after switching); running scenes keep actor ownership.
- Hop-off destinations use the existing nearest-walkable projection with
  the friend's radius and swimming capability. Riders land on walkable
  player ground; Leafy and Puff use the existing 0.4 s hop-off blend.
  The same stance release covers every home-island and Cloud Isle safe zone.
- Existing follow and party-follow movement still handles getting unstuck
  and distant friends with `poofTo`; safe-zone entry does not teleport the
  whole party or change the active friend. Story, save fields and combat
  rules are unchanged.
- The browser regression covers all four friends crossing from hostile
  ground into Fern Crossing, Port Town and the Hidden Hollow, then walking
  farther inside to check that the whole party follows. Evidence is in
  `.tmp/shots/polish2/companions/`, including the reproduced Leafy failure.

### Combat (slice B1: items 8 and 9)

- **Straight player shots replace Act 2's forgiving projectile aim.** Bubbo,
  Puff and Ember fire along the active friend's facing, without selecting an
  enemy, turning the player or changing velocity after launch. Basic hit radii
  are 0.85 m (upgrades capped at 1 m), with pooled coloured trails. Twin Wind
  launches two parallel shots with offset origins. Launch elevation uses the
  terrain ahead along that facing, so Bubbo's low mouth clears uphill ground;
  the resulting vertical velocity is also fixed at launch. Leafy's whip and pull keep
  their existing targeting; water jet and wind cone use the firing facing,
  and the fire area burst keeps its existing area. Pylons remain physical shot
  targets; their close-range aim preference applies only to targeted melee
  and area moves. Existing puzzle abilities and boss specials remain free at
  zero MP; ordinary combat special costs are unchanged.
- **Ranged enemies replace existing slots.** Forest Spitters inhabit the
  lowland forests; Raider Shooters inhabit the causeway, both coasts, Skyroot
  Canopy and the Observatory. Spawn indices, coordinates, stage counts,
  respawn memory, original HP and original reward distributions are retained
  through explicit replacement metadata. The debug kill-zone command still
  uses normal knock-out bookkeeping.
- Spitters, Shooters and Wind Sprites share a 0.8 s swell/glow tell, a slow
  3.2 m/s shot aimed at the player's position **when firing**, and a 2.5 s
  recovery. They hold 6–9 m distance and retreat within 3 m, cancelling an
  unfinished charge. At most two ranged enemies can be awake in an area,
  including interrupted and returning enemies reacquiring an attack slot;
  Cloud Isle also retains its four-enemy total cap. Firing and ranged wake-up
  require the actual camera frustum, the player's area, reachable ground and
  an unobstructed ground sight line. Interrupting them disperses their shots.
  Wind Sprites retain their sideways drift during the charge.
- Combat projectiles keep their launch velocity even in Cloud Isle wind
  lanes; loose drops retain wind movement. Small swept simulation steps stop
  shots at scenery, closed barriers and gaps, and hostile shots disappear at
  area borders before reaching safe ground. This supersedes the older Wind
  Sprite wind-bending behavior for combat shots.
- Companion following and safe-zone transitions belong to the later slice;
  this slice does not change them or the camera profiles.
- Browser assumptions updated: `act2.spec.ts` now distinguishes hostile shots
  from player shots when asserting that friends never attack automatically.
  Its fights and `act3.spec.ts` already face enemies explicitly through
  `nearEnemy`, so no homing-based fight shortcut is retained. The new
  `combat-polish.spec.ts` exercises committed shots and actual moving misses.
- Evidence in `.tmp/shots/polish2/combat/` contains 15 native gameplay views
  per size (1366×768 and 1280×800): charge, flight, dodge, all three friends'
  moving-target misses, hostile bolts stopped by solid scenery, and a player
  bubble stopped by the raider barricade wall. `render-report.json` records
  every view and live projectile position; the peak is 90 calls / 90,337
  triangles, below the 120 / 140k budget.

### Camera

- All gameplay follow cameras are authored in `src/scene/cameraProfiles.ts`.
  The shared default is pitch 0.55, distance 10 m and look-ahead 3 m. Beach
  headings follow the eastward route, the far bank and forests face north,
  and the volcano trail follows its north-east ascent. The pier faces out to
  sea; passages and bridges use closer framing. The courtyard has a wider,
  raised view with the lens held 2 m east of the approach centre, to hold the
  full pillar row and clear the foreground rim rock. Its bounded pan also fits
  the player on the outer courtyard shoulders. A steeper overhead trial cleared
  the player but cropped the lowland; the final 0.65 / 16 m / 5 m view preserves
  the real forest beyond the lowered east wall as well as the gate.
- Slice A correction: the outer-shoulder failures came from the capture
  harness. Both x=57.5 and x=82.5 lie in the courtyard's 0.65 m entry dead
  band; a snapped teleport discarded the incoming view and selected
  `ember-slope`. The west capture also read the previous settled courtyard
  state before the teleport rendered. Captures now consume a frame after
  placement and approach each shoulder from the centre without snapping,
  preserving the existing profile table and hysteresis. The east `busy`
  state was explicitly set by `stand()`, not a story/cutscene/zone trigger:
  `sim.ts` only calls story triggers in explore mode. Story and save behavior
  remain unchanged. The contracted entry bounds are x=57.65–82.35; the
  retained bounds include both tested shoulders. The correction belongs in
  the harness, rather than widening the profile or removing its hysteresis.
  The full four-pillar row and player remain required at
  both shoulders and the approach centre; no reduced-landmark fallback.
- Volcano-trail pitch is 0.25 with 3.5 m look-ahead, replacing its default
  0.55 / 3 m view. The lower lens shows the uphill route, cave destination
  and sky while keeping the player clear. Its existing one-second blends
  into cliff-top and ember-slope retain their authored framing.
- The same table owns the existing lowland framing and its continuous tip-down
  over the last 5 m before the rope foot, the stable (+5,+4,-8) cliff-rope
  offset, Cloud Isle's northward framing and taller sky view, and the beacon's
  outward radial heading. A fixed north heading in the arena puts the lens
  inside the mast, so its radial heading remains deliberate. Cinematic and
  conversation shots, including the prologue rope shot, keep their cameras.
- Follow profiles interpolate yaw by the shortest turn and framing over 1 s.
  A 0.65 m Schmitt border retains the incoming view inside the dead band;
  elapsed time alone never changes the selected profile. Tunnel clearance
  clamps the desired and rendered lens below the roof during handoffs.
  Movement continues using the rendered camera direction during blends.
- Mouse drag, touch drag and wheel camera handlers are removed, along with
  the drag hints and camera-speed slider. The saved settings schema stays
  compatible; its old sensitivity value is simply unused. Touch detection
  still exposes the movement stick and action buttons.
- The eastward beach view initially measured 124 draw calls. The Monster
  Stone's five separately coloured symbols now share one vertex-coloured
  mesh, preserving their individual glow animations and placement while
  saving four calls. The tunnel's existing torch halos likewise share one
  billboard instance draw after its centre measured 63 calls. Positions,
  colours, opacity and torch lighting are unchanged.
- Deliberately updated camera assumptions: `camera.spec.ts` replaces manual
  orbit cases with every-profile input, movement, blend, hysteresis and render
  coverage; `loop.spec.ts` uses screen-back to return west over the river
  rather than manually turning the lens; `continuity.spec.ts` expects fixed
  prologue framing after returning up the rope. The old sanctuary entrance
  control sample (64.5,-127.2) touches a Part 1 boulder; the new sample
  (70,-127.2) tests input on clear ground with the same vector assertions.
- `act3.spec.ts` slows only the test clock around its fast-mode voyage reveal
  capture. The full-suite run missed the one-frame airship-centre window at
  both sizes, while an isolated rerun captured it; several matching frames
  make the existing screenshot condition robust. Production cinematic timing
  and cameras are unchanged.
- Matched 1366×768 / 1280×800 gameplay captures and render measurements are
  written to `.tmp/shots/polish2/camera/`, including both rope directions,
  the enclosed tunnel and the courtyard's unsolved gate and east-wall view.

## 2026-10-29 — Act 3 Cloud Isle: brief accepted, with these changes

The external brief "Act 3: Cloud Isle and the Hidden Family" is the product
definition of Act 3. The frozen spec is `docs/ACT3_CLOUD_ISLE.md`; branch
`feature/act3-cloud-isle`. Before building it, the continuity-polish branch was
fast-forwarded into `main` and deployed, at the user's request.

**Accepted as written:** the voyage with Captain Gull; a dangerous, empty
Cloud Isle with no town or market; the layout of coast, hidden shelter,
junction, two routes, observatory and beacon; a family of three (protector,
caregiver, witness); the discovery event and the trust exchange; the child's
drawing of Lumo; a safe shelter with free rest and a checkpoint; optional
errands that visibly improve the shelter; four new enemy types; a puzzle
using all four friends; a real-time boss with one bar; Lumo glimpsed and not
rescued; boat travel both ways; the save extended without breaking old saves.

**Changed:**
- **The shelter is on the route.** A raider barricade the player can see but
  never open closes the road from the coast. The family's back tunnel is the
  "safer route" the parent knows. So the family is needed to progress, enemy
  respawns can never cut the shelter off, and it stays hidden from the road.
  The brief's layout showed the shelter on the main path without saying why
  it stays hidden.
- **Only one world is mounted at a time** (home island or Cloud Isle). The
  only cut is a short fade at sea during the voyage. Cloud Isle is not drawn
  from Port Town: a far-off copy would be the second, low-detail
  representation that the continuity decision rejected.
- **The route runs one way (dock in the south, summit in the north)**, so the
  fixed lowland camera framing works unchanged. The summit beacon is the
  long-term goal, and it stays in the upper half of the screen.
- **Wind never pushes the player.** It pushes light objects and projectiles
  only, and the boss's one telegraphed gust can be cancelled by Puff. Puff's
  "glide" is a scripted hop between marked pads, not free flight.
- **Cooking is one optional recipe:** Grandpa Bo turns one fish into Stew (a
  bag food for every friend, carry 3). Errands use pickups found in the world
  and never take the player's own items. There is no second economy, and
  Port Town stays the only shop.
- **No "other hidden residents"** in the aftermath. The brief also forbids a
  settlement, so the family stays the only people. Going home is left for a
  later chapter.
- **The chapter ends on a named hook:** Lumo's airship flies to the Sky
  Fortress, and "Find the Sky Fortress" is the next objective.
- Characters are named (Tala, Grandpa Bo, Kiko, Officer Squall) so the
  dialogue and journal read naturally.

**Rejected:** a sailing minigame with a fail state; a typing-only input path
(the game has speech and Tap); a crafting system at the shelter; microphone
prompts in fights (Act 2 decision stands).

## 2026-10-29 — Gameplay polish Part 1 — decisions made while building

- **Bridge surfaces.** A shared bank-to-bank height profile bends the actual
  touching deck planks and anchors. Collision and walkers use that same profile;
  endpoints overlap solid banks and meet their height and slope. Growth still
  uses the original unlock animations, ending at the full unscaled span.
- **Food and rewards.** The prologue and Act 2 share one 99-item cap per food.
  Full-bag ground food stays available, including enemy food drops. Chest
  overflow becomes one coin per item, reported separately from its other rewards.
  The old 9,999-coin and saved 99-amber clamps cannot silently discard the
  chest's other rewards: coins and amber now load as nonnegative safe integers
  in the same save fields. Only food has the 99-item cap.
- **The paid inn and Crossing.** Only an accepted, affordable inn answer charges
  10 coins and establishes the inn checkpoint. Merely finding Port Town keeps
  the previous wake point. Fern Crossing establishes the existing `camp` wake
  point without healing; its saved `rest` tutorial token remains compatible and
  now means learning about the crossing. Knock-out recovery remains free.
- **Maple's tent.** Thick opaque canvas panels overlap at the seams, with a
  shallow enclosed entrance and rolled flap. The original placement, canvas
  footprint and collision proxy stay fixed. Shared vertex-coloured meshes add
  grounded poles and pegs, ropes, seams, a map, jars and a lantern alongside
  the existing table and crates; no transparent canvas or cloth simulation.
- **The four pillars.** Real-mesh sightline checks identified the east shoulder
  of the tunnel's raised terrain and portal face as the left pillars' occluder.
  A tighter symmetric row and a lower visible shoulder expose their coloured
  friend symbols from the existing courtyard framing. The tunnel's central roof,
  lining, floor, collision and camera clearance stay intact. Each unsolved symbol
  has a soft coloured halo; solving it removes that idle halo.
- **The view beyond the lair.** Only the outer east gate-wall section and the
  east/north-east garden rim rocks are lowered. The existing lowland tiles are
  drawn through the same fog from outside; only a camera physically inside the
  lined tunnel below its roof suppresses them. No panorama, duplicate scenery
  or camera behavior changes are introduced. Render measurements and matched
  before/after views live in `.tmp/shots/polish/render-report.json`.
  Pillar idle halos and solved rings are each batched in one instanced draw:
  the tunnel can include them in its frustum even when its opaque lining hides
  them. This keeps the enclosed views at 52–57 calls / about 40k triangles;
  the new exterior viewpoints stay within 120 calls / 140k triangles.

## 2026-10-29 — Gameplay polish brief: accepted, with these changes

The external brief "Gameplay, Camera, Bridge, Economy, and Visual Polish"
(ten items) is accepted. The frozen spec is `docs/GAMEPLAY_POLISH.md`.

**Supersedes earlier decisions (the user's explicit direction):**
- **The prologue's drag-orbit camera is removed.** The continuity polish had
  kept it because a single fixed yaw on a round island puts half the goals
  behind the lens. The answer now is per-zone camera profiles with authored
  yaws and blended borders, not orbit.
- **Projectiles no longer use "forgiving aim"** (the nearest enemy in front).
  They fly straight along the friend's facing. A wider hit radius keeps them
  fair on touchpads.
- **Fern Camp no longer heals for free**, and the inn costs 10 coins.

**Changed from the brief:**
- **Split in two.** Part 1 (bridges, food 99, pillars, tent, inn, camp, the
  view past the lair) branches from `main` and can ship alone. Part 2 (camera,
  projectiles, ranged enemies, companion transitions) runs after Act 3 slice
  C, because it shares the camera and combat code Act 3 changes, and it must
  cover Cloud Isle.
- **Inn English:** "Would you like a room?" → "Yes, please." / "No, thank
  you." This replaces the brief's three-step exchange: it's shorter, and these
  are the phrases the students already drill. The game has speech and Tap,
  not typing.
- **Fern Crossing stays a knock-out wake point** (no healing). Otherwise a
  knock-out in the Grove or Canopy would always walk the player back from the
  rope.
- **Chest food overflow becomes coins** (1 per item), with a toast. The brief
  asked for "a clear way to handle the excess"; this way is simple and loses
  nothing.
- **The view past the lair uses the real lowland only.** The tunnel-wide
  camera cut-off narrows to the enclosed tunnel itself. A panorama would
  repeat the two-representation problem the continuity polish removed.
- **New ranged enemies replace existing spawns**, so stage-clear counts stay
  the same. At most two are awake per area, and they fire only with line of
  sight, on screen.

**Kept on purpose:** knock-out recovery is free (wake with at least 60 HP).
On Cloud Isle, the Hidden Hollow's rest stays free. It is the family's
hospitality, the story's safe haven, and Cloud Isle has no inn. Gull's boat
at the Cloud Isle dock becomes a wake point only, recorded in the Act 3 spec.

## 2026-10-29 — Act 2 continuity polish (branch `feature/act2-continuity-polish`)

A new brief asks for visible neighbouring stages, an honest Eat button, a
fixed camera, scenery that looks the same at every distance, and finished
treasure chests. Built from `main` (`1a92801`), **not** from
`feature/physical-stage-passages`: that branch's opaque fade-through chambers
are exactly what this brief supersedes, so it stays unmerged.

**Visibility (supersedes the expansion's zone isolation).** Each place has
one representation, chosen by camera distance only — never by which zone the
player stands in, by climbing, or by a position threshold. The separate
pre-lair panorama mesh is retired in favour of the real lowland seen through
fog. Large objects (terrain, trees, props, town) are cut off only beyond the
distance where fog already hides them, so nothing pops in. Small objects
(ferns, reeds) may still be cut off nearer. Fog in the lowland changes
continuously or not at all. Enemies stay drawn and simulated only in the
active zone (performance; they are creatures, not landscape). The exit
barriers become see-through obstructions (roots, bars, reeds with gaps), not
walls. Banks may be lowered or opened at exits so the destination shows.
Rejected: a matched low-detail panorama kept beside the real scenery. That is
two representations that must agree forever, and the brief's complaint is
exactly that they disagree.

**Camera.** In the Act 2 lowland the follow camera has a fixed yaw (0,
looking south along the route, which runs −z from the cliff to the port) and a
fixed pitch and distance. Dragging no longer orbits it there. On the rope it
uses one stable framing for the whole climb in both directions. Modified from
the brief: the prologue island keeps its drag-orbit camera. It is a round
island with goals in every direction and a tunnel framing tuned around orbit,
and its camera specs pass. A fixed south-facing view there would put half the
island behind the player. The handoff at the cliff is the rope, which has its
own camera anyway.

**Continuity implementation.** The real basin replaces the panorama. Scenery
uses 96 m spatial tiles, normal frustum culling and a 260 m fog-matched distance
cut-off plus each object's radius; ferns and reeds scale over their final 8 m.
Lowland fog targets near 55 / far 260 everywhere, blending only from the
prologue's near 70. Follow framing is yaw 0, pitch 0.55 radians, distance 10 m
with a 3 m look-ahead, so the path and the next area sit in the upper half of
the screen. (The first pass used 0.85 / 9 m / 2 m: near top-down, it showed only
~10 m ahead and defeated the visibility goal.) The cliff closes the lowland's
north side, so the lens never goes behind its face; over the last 5 m before
the rope foot the framing tips down (pitch up to 1.15, 8 m, no look-ahead)
with the same heading. Obstructions allow at most 2.5 m pull-in and 1.5 m rise;
rope clearance is resolved before camera smoothing. The rope uses the same
(+5, +4, -8) m offset in both directions, with a 0.75 s entry blend and a
smoothed handoff to follow. The island orbit resumes the rope's yaw. Exit and
fork shoulders have broad low saddles, the outer banks taper continuously,
and the side ridges are lower. Root, reed, stone and timber lattices leave
clear sightlines while their original collision cuts and opening animations
stay intact. Playable floor measurements remain unchanged.

**Eat button.** The quick-eat button and F key belong to the active friend's
favourite food: its icon, the count in the bag, and the effect ("Fish ×3 · +15
HP · +30 Bubbo MP"). With none of that food left, the button is greyed with
the missing food's name and does nothing. It never quietly eats another
friend's favourite or bananas. Other foods are eaten deliberately from the
bag. Toasts name only what actually changed. Rejected: falling back to the
"best" other food, which is what made the apple icon a lie.

**Chests.** One finished low-poly model (closed box, domed lid on a rear
hinge, brass trim, latch, hinges, dark interior, sparkle on opening) used by
every chest. Rewards, IDs and saved open state are unchanged.

## 2026-10-29 — Act 2 forest expansion (development branch)

The five hostile areas gain roughly twice their collision-open floor through
clearings, platforms, loops and optional treasure rather than uniform world
scaling. Existing camp, puzzle and town coordinates remain stable. The two
branches now end in narrow curved ravines; scenery and enemies are isolated
by active zone. A separate merged landscape supplies the pre-lair panorama.

First-clear exits require all registered enemies in their own stage, but either
branch is sufficient. Persistent `act2.cleared` flags are independent of the
existing temporary respawn memory. Pre-expansion v4 saves retain already-reached
travel rights, including return routes past new gates. This extends v4 without
resetting the prologue or kidnapping. See `docs/ACT2_FOREST_EXPANSION.md` for
measurements and migration details.

In hostile zones only the selected friend participates visually; switching
uses the existing hop with a short shrinking departure. Safe zones restore the
full party. This supersedes the earlier decision that inactive friends trail
during fights. No attacks become automatic. Maple's existing lookout/town
story placement and the economy, English exchanges and forgiving defeat remain.

## 2026-10-29 — Act 2 "The Hunt for Lumo": brief accepted, with these changes

The external brief (Kirby: Forgotten Land-style fights in the world, Secret
of Mana-style areas, a lowland below the sanctuary, a port town) is the
product definition of Act 2. The original adventure is the prologue and is
unchanged up to the finale. Built on branch `feature/act2-hunt-for-lumo`.

**Accepted as written:** the kidnapping replaces the final results card;
Lumo stays a friend and being taken is a separate fact
(`progress.act2.lumoTaken`); a rope down the sanctuary's cliff (both ways);
Primeval Forest → camp → Flooded Grove / Ancient Canopy → Ruined Causeway →
Coastal Path → Port Town; manual J/K attacks only; automatic combat
positions by area; one HP pool, per-friend MP (100, regenerating, specials
25–30); food restores HP and the MP of the friend who loves it; camps and the
inn restore everything; coins collected by walking near them; respawn on
re-entry after a real absence; v4 save with migration; town services with
English exchanges; the harbour's lead closes the chapter.

**Changed:**
- **No microphone in fights.** The buttons show each move's English word
  (Whip!/Splash!/Fly!/Fire!, Pull!/Push!/Blow!/Burn!) and K is always
  instant. Speaking the special commands is practised at the Monster
  Trainer, with no enemies about (+10 coins the first time). A 1–7 s
  recognition session plus speaker bleed would make real-time fights unfair.
- **The route puzzles reuse the obstacle flow** ("Can you ___?", truthful
  answers, "Thank you!"): Leafy's vines and Puff's rope bridge span the
  canopy's two gaps (required for that route), Bubbo's lily pads reach the
  grove's islet treasure (optional), Ember burns the thorns on the causeway's
  shortcut gate (its lever side faces the causeway, so it opens from there).
  The abilities stay free at 0 MP.
- **Shopping in two steps:** "What do you want?" → "I want apples, please."
  (a picture frame of the five foods); a number in the spoken answer ("I want
  three apples") skips "How many?" → "One/Two/Three, please." After the
  first purchase the market opens a quick panel whose Buy button still reads
  the sentence ("I want two fish, please.").
- **Kitchen phrases name the two foods** ("Mix the apples and berries.");
  "Mix the" is not judged. One treat per friend: two foods + one amber.
- **The first chest is in the tutorial forest** and always holds amber, so
  the first upgrade needs no grinding.
- **Finished saves get a title button** ("NEW! Act 2: The Hunt for Lumo")
  that goes straight to the garden and the kidnapping; Continue also works
  (the ★ marks Lumo; walking up to Lumo starts it).
- **"Prologue Clear!" is a banner** during the celebration, not a card.

**Rejected:** a microphone-gated special in combat; a separate battle
screen; a carried torch/rope inventory; tutorial pop-up screens (the
tutorial is hint-bar lines that disappear once each lesson is done).

## 2026-10-29 — Act 2 decisions made while building

- **Geography.** The island continues north of the sanctuary's shelf as a
  basin (`world/lowland.ts`, `BASIN` x 19..135, z -150..-344): its own height
  function (`lowlandY`) is blended into `massifY` by `basinFraction`; hills
  close it east and west and fall into the sea; the north coast is the town's
  quay. The massif mesh skips the basin and the basin's own 2 m terrain tiles
  share its grid on the seam (odd x, even z). The garden reaches the ledge
  through a gap where two north-east rim rocks were (their random numbers are
  still drawn, so every other rock keeps its shape). The ledge's north edge
  is a sharp lip (no mask fade); a stratified rock slab is the climbing face.
  Behind the gate the garden is now the round bowl plus the ledge (the box's
  corners outside the ring used to be sealed by those rocks).
- **Collision.** The lowland has its own solids set: walkers north of the
  cliff never test the rest of the island's shapes and the other way round.
  Walkable land is a union of rectangles, trails with a half-width and discs,
  minus cut-outs (the pond, the canopy gaps, the closed gate) plus decks that
  unlocks add. Bridge decks run a metre onto the land at each end (a shorter
  overlap left a seam narrower than a body). Reachability tests flood the
  lowland with real moves: both routes reach the town, the shortcut works,
  optional treasure needs its friend.
- **Areas.** Zones decide everything about fights: hostile (forests,
  causeway, coast) or safe (camp, old trail, town). Respawn rule
  (`changeZone`): an area's knocked-out enemies return on entry only after
  12 s of play elsewhere; stepping back and forth over a border never adds up.
  Enemies outside the player's area walk home and heal (patrols reset).
- **Combat positions.** Leafy rides on the backpack and Puff on the right
  shoulder at half size (it flies out and back for each attack); the player
  rides Bubbo (the prologue's saddle) and Ember piggyback against its back,
  legs round its sides, its tail swung back (Ember stands upright with a big
  head, so a saddle would put the rider's chest in it; `ember-ride.test.ts`
  checks the legs, chest and tail against Ember's shapes). Scenes take the
  friend off; play puts it back with a 0.4 s hop. Riding is 18% quicker.
- **The party.** In Act 2 the friends who are not active walk with the
  player (further back during fights) instead of going home; they never take
  E (switch with 1–4 or the chips) and never block the player.
- **Fights.** Forgiving aim (nearest enemy in front, else close by); held J
  repeats. Enemies (gloomlet, snapjaw, shellback) wear the raiders' crescent
  emblem; they notice ("!"), chase, show a red, shaking wind-up, lunge, and
  can be interrupted. Knock-outs are a dizzy spin and a poof (no gore). All
  enemies pause during conversations, prompts and scenes. A knocked-out
  player wakes at the last rest point (foot of the rope, camp, inn) with at
  least 60 HP; coins, food, amber and progress are kept.
- **Upgrades** (one treat each): Super Whip (reach ×1.35, damage ×1.6), Big
  Bubble and Big Fireball (bigger, ×1.6, splash), Twin Wind (two shots).
- **Lumo** is hidden after the kidnapping except inside the cage; its
  journal page says it was taken (then "Lumo is on Cloud Isle!").
- **Maple** stays by the lookout until the town is found, then waits on the
  quay ("I came by boat").
- **Save v4** (`mi.save.v4`). v1–v3 still load (Act 2 starts fresh) and are
  never overwritten; Act 2 fields are re-validated (nothing stands before the
  prologue is complete; a 0-HP save wakes with 60 HP). Live HP/MP are copied
  in when the game saves, so a fight never writes storage every frame.
- **Budget.** Lowland views measured 39–112 draw calls, ≤108k triangles;
  sanctuary views with all five friends and Maple up to 120 calls. Small
  vegetation, chests and keepers are drawn only near the camera; vegetation
  is tiled (48 m) so the frustum skips tiles; fog reaches further north so
  the coast and town show from the cliff. The lowland is not drawn while the
  camera is south of the tunnel's north end (z > -125): the ridge and the
  garden's rim hide all of it there, and drawing it anyway took the tunnel
  views from ~50 to ~95 draw calls and 40k to 97k triangles (the tunnel
  camera looks north along the passage, straight at it).
- **The camera spec measures screen direction through one camera.** Both
  ends of a move are projected through the camera as it is after the move.
  Comparing two live screen positions also measured the follow camera's
  catch-up, which depends on frame rate and failed on correct movement. Its
  last spot is in the garden 7 m from Lumo, because walking within 5 m of
  Lumo in a finished save now starts Act 2.

## 2026-10-26 — Polish pass 2: continuous adventure, one island

- **Only the finale has a results card.** The beach and forest endings keep
  their story (stone lights, bramble withers, the volcano reveal, Maple's
  lines) and save values (`endings` 1 and 2), then show a short "…Clear!"
  banner and play continues. With the whole game built, a mandatory card
  mid-adventure was an interruption.
- **Speak/Tap is a Settings toggle only.** It is a teacher setting; the
  title shows Start/Continue, New game and Settings. The setting persists and
  blocked microphones still fall back to tapping. Settings now opens above
  the title card (it used to open underneath it, unclickable).
- **Movement follows the camera on screen.** Input is mapped through the
  rendered camera's horizontal view (pos → target), not the stored orbit yaw,
  so any camera placement (tunnel framing, shots) keeps Right = screen right.
  In the tunnel the orbit's yaw is eased to the passage axis and the camera
  comes closer and under the roof, blending over ~1 s; leaving keeps that yaw,
  so there is no swing. Rejected: rotating controls inside the cave.
- **Riders and walkers share heights.** `game/ride.ts` gives the monster's
  root height (ground, water or hover) to both the scene and the rider; the
  player sits on a saddle 0.82 m up Bubbo's back, legs splayed over his round
  body (checked against his body/eye shapes in a unit test). Bubbo's size is
  unchanged. Cooled lava is a surface in `standY` (`lavaCrustY`, flat top with
  ramps) and the crust mesh is built to the same numbers.
- **Pickup is a squat with planted feet**: hips drop 0.2 m, two-link leg IK
  keeps the soles still, the torso leans about the hip; walking waits 0.7 s.
- **The climb follows the drawn rope.** The scene hands the climb its sampled
  Catmull-Rom curve; the body hangs in front of the furthest rope point over
  its whole height (`climbBodyZ`), then mantles over the lip (no fade at the
  top). Puff flies the rope outside the furthest rope point and over the
  highest rock; the coil vanishes in a poof and a small coil rides with Puff
  until the rope is tied (never two ropes).
- **The north of the island is one landmass.** The floating Phase 3 slab
  (rock cap box, wall shells, a half-open distant cone hidden from the
  sanctuary) is replaced by `massifY`: plateau, volcano cone with crater at
  (78, -104) east of Ember's slope, a ridge over the tunnel, the garden on a
  shelf, slopes to the sea, sea stacks. It is scenery fed into `groundY`
  (walkable floors fully mask it; a test floods the reachable land to prove
  it) and drawn as 2 m tiles for frustum culling. The main terrain now stops
  at z -58. The tunnel runs straight into the courtyard (no east turn) and
  the garden's visible ground is the courtyard plus the bowl inside its rim
  rocks (the box corners outside the ring were unreachable). Arches stand in
  front of the lining, portal walls close the ridge, nothing is coplanar.
  Rejected: fog or locking the camera to hide the edges.
- **Budgets:** compared with main at the same views, triangles are equal or
  lower; beach detail is skipped when the player is deep in the sanctuary.
- Development branches are tested by `test.yml` (unit + Playwright, never
  deploys); Pages deploys only from `main`.

## 2026-10-24 — Shared placement and collision overhaul

- Solid scenery uses simple circles, rotated boxes and capsules derived from
  the placement records in `world/island.ts`. Scene meshes consume the same
  transforms and dimensions. This includes furniture, signs/posts, trunks,
  driftwood, bridge rails, volcano rocks, cave walls and sanctuary structures.
  Leaves, small vegetation, thin decorative ropes and tiny ground details remain
  non-blocking; jungle fringe and distant structures lie outside walkable land.
- `isWalkable` includes solids as well as the land/gate restrictions, so movement,
  recovery and reachability checks agree. `moveCircle` retains projection and
  sliding, with bounded substeps to stop thin posts being skipped. Collider sets
  are cached by gate state and simulation movement reuses output/obstacle storage.
  No mesh-based physics or new library is used.
- Live NPC circles follow runtime positions, including Maple's finale move,
  instead of leaving a fixed collider at an empty home location.
- The pier is an independent walkable deck with its actual top height and
  individually solid support posts. It has no existing visual railings; the
  bridge's broken and repaired rails are solid. A solid rectangle over the pier
  would prevent its intended use and was rejected.
- The solved palm rests horizontally across the north support rock's highest
  vertex (measured from its deterministic seed-1 geometry). Its crown extends
  east of the rock, leaving the beach pass clear. The animation and solved-save
  pose share these endpoints, and the trunk retains a capsule at its new place.
  Runtime collision still uses only these authored 2D primitives.
- Saves are relocated with `nearestWalkable` after progression validation and
  v1/v2 migration. Only invalid positions move; progression, yaw and play time
  remain intact. The v3 format and save key are unchanged.
- When `nearestWalkable` finds no open spot nearby, the walker stays where it is;
  only save loading opts into the beach spawn (`toSpawn`). Monsters live behind
  gates that are still closed (Ember before the lava, Lumo behind the gate), and
  a spawn fallback teleported them to the beach on every move, which broke the
  Phase 3 playthrough. Ember also stays at home until the lava is solved.
- F3 toggles merged collision/surface lines and obstacle-state markers only in
  development or an explicit `?e2e=1` session. When disabled there are no debug
  geometries or frame callbacks. Normal production sessions cannot enable it.
- Reachability tests start at spawn for every chapter and the final gate state.
  The solved rope contributes an explicit traversal edge, matching the scripted
  climb; it never makes the cliff face a walkable ramp.

## 2026-10-24 — Rope, climb, food and model fixes

- The rope is hung, not authored: the scene ray-casts the real cliff rocks at
  the rope's x and `world/rope.ts` (`hangRope`) runs it taut from the stake's
  knot over the highest points of the cliff top (spanning notches), then plumb
  down the face, stepping outward only round bulges, 0.13 m clear of rock. The
  stake (`ROPE_STAKE`) stands on the measured top surface with its lower third
  buried. Rejected: a fixed lean or offset, which cannot clear the seeded rock
  pile (bulges reach ~1.6 m out) and pushed the rope's top into the face.
- The rope unrolls by revealing its vertices top-down (draw range), so the
  stake and lashing never squash, unlike the previous Y-scale of the whole mesh.
- The climb follows the same line (`ropeZAt`): the player hangs 0.3 m in front
  of the rope at hand height and goes over the lip with it. It takes 5 s with a
  short ease at each end; the arm and leg cycle is driven by the height climbed
  (one pull per 0.45 m), so limbs and progress stay in step up and down. The
  player's legs gained knees (thigh + shin) for this; walking barely bends them.
- Food is visible exactly when it is collectible: `rt.taken` is the single
  truth and the pop-in plays after regrowth (`rt.ripe`), never before. A full
  bag keeps the food focusable and answers "Your bag is full!" instead of a
  silent E. Food's focus bonus over nearby monsters rose from 0.6 to 0.9 m and
  its reach from 2.1 to 2.4 m (children stop short).
- Trees: trunks run up into the main crown and branches end inside their side
  clusters (forest, apple, Puff's tree); foliage bottoms sit ~0.35 h below
  their centres, which is what left the gaps. The jungle tree only gained trunk
  height: its side canopies already overlap the trunk, and branches on a tree
  instanced ~240 times pushed the beach view past 120k triangles.
- An external Phase 3 brief (same day) asked for a rockfall that opens on a
  story event and an ending skippable on repeat. Kept the frozen design: the
  lava (Bubbo) is the Phase 3 gate in place of the rockfall, and the finale
  plays once (its lines advance with Next; only a 3 s rise and fades are
  fixed), so no replay or skip mechanism was added.
- The forest sign's post stands behind the board (`SIGN_SIZE.postZ`) with a
  cleat on the back; collider and visual share the layout.
- Heart sprites sample the canvas with V flipped: `gl_PointCoord` runs top-down
  while the canvas texture is uploaded flipped, so every heart was inverted.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-10-20 — Brief accepted, with these changes

The brief "Monster Island" (3D monster-befriending adventure, Japanese grade
3–6 beginners) is the product definition. Its phase plan is kept: a fully
playable Phase 1 beach slice first, tested, before the rest of the island.

**Accepted as written:** the four-stage encounter loop (discover → communicate
→ befriend → use abilities), Professor Maple, the Monster Journal, no capture
balls (monsters choose to come), one active companion, data-driven monster
definitions, permanent puzzle unlocks, no XP for repeated pronunciation, mic-free
parity, procedural assets, the stack (React, TS, Vite, R3F, Zustand), GitHub
Pages.

**Changed:**

- **The progression is reordered by habitat.** The brief's stages contradict
  its own monster list: Stage 2 finds Bubbo (a river monster) in the forest,
  Stage 3 finds Ember (volcano) at the river, Stage 4 finds Puff (cliffs) at the
  volcano, and the MVP puts Leafy and Bubbo on the beach. The frozen chain for
  all phases is:
  1. **Beach (Phase 1):** Leafy lives in the apple grove at the forest edge;
     its vines lift the fallen palm that blocks the beach. Bubbo lives in the
     river mouth behind the palm; it ferries the player across the river and
     raises stepping stones.
  2. **Forest (Phase 2):** Leafy's vines repair the broken bridge; Puff lives
     on the forest hills and cliff edges (berries). Puff flies up the high
     cliff with the rope.
  3. **Volcano (Phase 3):** reached by the rope; Ember lives here (meat).
     Ember lights the torch for the dark cave.
  4. **Sanctuary (Phase 3):** behind the cave; the gate needs all four
     abilities; the legendary monster.
  Each monster's ability opens the habitat of the next one, which is the
  brief's own puzzle list (river/Bubbo, cliff/Puff, cave/Ember, bridge/Leafy).
- **Phase 1 uses both monsters' abilities.** The brief's MVP had one obstacle
  (Bubbo's river), so befriending Leafy had no payoff and companion switching
  was never needed. The fallen palm (Leafy, "Can you help me?", the brief's own
  Stage D example) now guards Bubbo's river, so the slice runs the whole loop
  twice and the river needs a switch to Bubbo.
- **"Do you like ___?" has four foods, not two.** With apples and fish only,
  the question is a coin toss. Phase 1 has apples, bananas, fish and berries,
  all placed on the beach. At most three "No, I don't." answers come before
  the "Yes" — never endless — and each one is recorded in the journal as a
  fact ("I don't like fish."), so hearing "No" is progress, not failure.
- **Friendship is gated by the question, not by trial and error.** Food can
  only be offered once the monster has said "Yes, I do! I like apples!".
  Otherwise students skip the English and try every food.
- **The student also answers, not only asks** (the esl-likes turnaround
  lesson). After eating, the monster asks back "Do you like apples?"; at the
  river Bubbo asks "Can you swim?". Both answers are valid and get different
  replies. This is where "Yes, I do. / No, I don't. / Yes, I can. / No, I
  can't." are produced instead of only heard.
- **Describing is how the journal page is written.** On first discovery the
  journal opens a silhouette and the student says "It's green." / "It's blue."
  to colour it in. Phase 1 uses colours only (grade 3 words); size and body
  parts ("It's big." "It has wings.") arrive with Puff and Ember in Phase 2.
- **Ability questions get truthful answers from whoever is active.** At an
  obstacle the student asks the obstacle's question; the active companion
  answers from its data ("Yes, I can!" and acts, or "No, I can't." with a head
  shake and a hint to switch in the journal). In mic-free mode the other
  choices are real questions too ("Can you fly?"), answered truthfully and
  harmlessly; only the right one solves the obstacle. That keeps mic-free a
  meaningful choice rather than a reveal.
- **"Come here!", "Let's go!", "Thank you!" move to Phase 2.** Phase 1
  already introduces likes, abilities and colours; the brief asks for gradual
  introduction. Phase 1 uses "Let's go!" only as Bubbo's line.
- **Save/resume starts in Phase 1, not Phase 3** (survival-island lesson:
  classroom sessions get interrupted, retrofitting a save is painful). The
  save is versioned (`mi.save.v1`); an unknown version is discarded.
- **The Phase 1 ending** is the Monster Stone across the river: two of its four
  symbols light (leaf, drop), Maple says two more monsters live on the island,
  results card, then free exploration continues.

**Added:**

- **Contextual hints, not a guessing game.** Each monster lives beside its
  favourite food (Leafy under the apple trees, Bubbo by the fish basket at the
  river mouth). After two "No"s the monster looks at its food. Maple gives a
  one-line nudge only when the student stalls.
- **Mic-free is a teacher setting** (title + Settings), not a per-prompt
  button (esl-verbs lesson: most students tick a voluntary opt-out).

**Rejected:**

- A capture/party-battle system — the brief rules it out and it would turn the
  English into a menu.
- English to pick up food. Collecting is instant; English is spent on monsters.

## 2026-10-20 — Engineering inherited from survival-island / haunted-hotel

- Speech: one press of Space / 🎤 = one bounded session (7 s cap); a valid
  interim result is accepted at once; only the top hypothesis judges (others
  may only rescue a result that matched nothing); one success = one action.
  Only permission/hardware errors switch to buttons at once; silence or one
  network error is a miss. Ladder: miss 1 "Try again", miss 2 the sentence is
  read aloud, miss 3 the choices become tappable. Music and ambience go silent
  while the mic is open (speaker bleed) and duck under spoken English.
- Matching is key-word based with accent variant tables (esl-likes: a false
  rejection is worse than a false acceptance).
- Everything procedural: merged vertex-coloured primitives (`PartBuilder`),
  Web Audio synthesis, inline SVG portraits and icons. No asset files,
  webfonts or CDNs (school networks block them).
- Chromebook budget: fixed light set, no real-time shadows (blob shadows),
  dpr ≤ 1.5, fog, ~100 draw calls.
- Per-frame state lives in `runtime.ts` outside React; zustand holds UI state;
  pure rules live in `game/logic/` with unit tests; the scripted flow is async
  (`await say(...)`, `await ask(...)`).
- Test hook `window.__mi` only with `?e2e=1`; Playwright drives the real UI
  with TTS/recognition stubs.

## 2026-10-20 — Phase 1 decisions made while building

- **School Chromebooks (1366×768) are the primary target** (decided by the
  teacher). Layout, camera framing and text sizes are tuned there and checked
  at 1280×800 and on a 1366×768 touchscreen. Phone-landscape CSS exists only as
  a fallback (compact cards, sticky results buttons); it is not tuned further.
- **Adaptive pixel ratio:** starts at up to 1.5×; if frames stay under ~28 fps
  for 4 s it drops to 1× once and never flips back (haunted-hotel rule).
  Budget measured: ~99 draw calls, ~82k triangles. No graphics setting.
- **Conversations are three-quarter shots over the player's shoulder** toward
  the monster, so its face (and its yes/no body language) is visible.
  Rejected: a side-on two-shot (it showed both in profile). The companion
  walks round to the far side of the player so it never blocks the lens.
- **Lens shift above the bottom panel:** while a prompt or line is open the
  view slides up by half the panel height (capped at 30% of the screen), the
  haunted-hotel technique; no perspective change.
- **Obstacle prompts frame the obstacle**, with the companion beside the
  player in view; "Can you help me?" needs the obstacle in the picture.
- **The companion never takes E.** It is always close by, so it is not a focus
  candidate; tapping its HUD chip (or its number key) makes it chat instead.
  Food gets a small focus priority because a monster can wander over it, and
  picking it up is instant and harmless.
- **Friendship is recorded at the friendship moment**, after the monster has
  asked back, not when the food is handed over: the flower, heart and team chip
  must not appear before the "is your friend!" card. Walking away mid-feed
  keeps the food.
- **During scenes the HUD shows only the journal and settings buttons**: the
  objective card, bag and team would announce the next goal early.
- **Discovery starts on approach** (2.6 m) — the brief's "approaching starts an
  interaction"; the shy/curious reaction plays earlier, at 7 m.
- **The ★ marker** floats over the current objective's target so nobody gets
  lost, except "Find a monster!", where it appears only after 20 s of wandering
  (discovery is the fun part).
- **Stepping stones replace the ferry for good**; the player can walk both
  ways, and the river never asks again.
- Rejected: a capture/fade-in "summon" for companion switching (switching is
  immediate; a far-away friend poofs over).

## 2026-10-23 — Phase 2 (Forest) design, frozen

Follows the frozen chain above: Leafy repairs the broken bridge, Puff lives on
the forest hills, Puff flies the rope up the high cliff. New English, in order
of first use: "Come here!", "It's small. / It's big.", "It has wings.",
"Let's go!", "Thank you!".

**Route.** The forest path opens behind the Forest sign on the far bank once
the Phase 1 ending has played (before that the sign says "Not yet!" and a
bramble blocks it). Beach → forest path → **ravine with the broken bridge**
→ the hills (Puff, berry bushes) → **the high cliff** with the rope hanging
from the top. The cliff top shows the volcano smoking in the distance; the way
on is closed in this build (a rockfall with Maple's "Next time!").

**Obstacles (data, same rules as Phase 1).**
- `bridge`: needs `grow`, question "Can you help me?", others "Can you swim?" /
  "Can you fly?", after `river`. Leafy's vines weave the missing planks; the
  bridge stays fixed. Bubbo is usually active after the river, so this forces a
  switch back to Leafy — the switch is part of the lesson.
- `cliff`: needs `fly`, question "Can you fly?", others "Can you jump?" /
  "Can you swim?", after `bridge`. Spoken "Can you help me?" still works here
  (help = the obstacle's need, as in Phase 1). Puff carries
  the rope end up and ties it; the player climbs (short scripted climb).

**Puff (shy, discovery uses "Come here!").** Puff is first seen in a tree on
the hills. Approaching makes it flutter higher. The discovery prompt is "Come
here!" — Puff floats down, then the journal opens. Mic-free choices: "Come
here!" / "Let's go!" / "Thank you!" (only the first works; the others get a
puzzled tilt, no penalty). Leafy and Bubbo's discovery is unchanged.

**Describing grows to three lines for Puff:** colour ("It's purple."), size
("It's small."), body part ("It has wings."), one prompt each, each filling a
part of the silhouette. Distractors: "It's big.", "It has a tail.". Leafy and
Bubbo's pages gain a size line ("It's small." / "It's big.") the student fills
by opening the journal on that page and pressing speak — optional, shown as a
dotted line, never on the objective path (rejected: forcing a re-describe of
old friends; it repeats without new meaning).

**"Do you like ___?" is unchanged.** Same four foods, same ≤3 "No"s, Puff
likes berries and lives beside berry bushes (the contextual hint). Berries also
grow in the forest so the student need not walk back to the beach.

**"Let's go!" ends befriending from Phase 2 on.** After the "is your friend!"
card the student says "Let's go!" and the new friend becomes the companion
(Phase 1's automatic first companion is kept for Leafy). It is also the
request at the bottom of the rope before climbing.

**"Thank you!" after every ability use from Phase 2 on** (bridge, cliff, and
the Phase 1 obstacles are already solved so they never ask). The companion
answers with a happy spin. A miss here never blocks: after the ladder the
choice is tappable as always.

**Companion switching stays immediate** via chips / number keys (Phase 1
decision). "Come here!" is not required to switch; rejected because it turns
every switch into a chore and the bridge already makes switching needed.

**Phase 2 ending.** At the cliff top: camera shows the volcano, Maple (by
radio portrait, she stays at camp) says one more monster lives there, the
Monster Stone's third symbol (wing) lights (seen on the beach afterwards),
results card for Phase 2, then free exploration. Ember stays a journal
silhouette.

**Save.** `mi.save.v2`. A valid v1 save migrates (Phase 1 progress kept,
`finished` becomes "Phase 1 ending played") instead of being discarded, so
classes that played Phase 1 continue into the forest. Unknown versions are
still discarded.

**Budget.** Same Chromebook budget per view (~100 draw calls; triangles may
rise to ~120k). Forest trees are instanced/merged; areas out of view
(beach vs forest) are hidden by region, not drawn at once. Fog hides the
transitions.

## 2026-10-23 — Phase 2 decisions made while building

- **`endings` replaces `finished`** in the save (the highest phase whose
  ending has played) and each monster record gains `described` (size / part
  lines). Save key `mi.save.v2`; a v1 save is migrated on load (`finished` →
  `endings: 1`) and an ending never stands without the obstacle that leads to
  it. The objective walks Phase 1 completely, ending included, before Puff or
  the bridge can appear, even though Puff is live data from the start.
- **Shy fliers are data:** `MonsterDef.perch` (Puff's nest on its tree's south
  branch). Until discovered the monster sits there; noticing the player makes
  it flutter a little higher and hide its face. Walking under it starts the
  "Come here!" prompt; it flies down and the usual discovery follows. A wrong
  mic-free request gets a puzzled head tilt (`onWrong` on `ask`), no penalty.
- **Puff's page order:** colour → "Hi! I'm Puff!" → size → wings, all on the
  same "New monster!" card, which fills in line by line. Walking away
  mid-page resumes at the missing line.
- **Puff has no tail** (wings, tuft, little feet), so "It has wings." is the
  only body-part answer; "It has a tail." is the distractor. Bubbo's page has
  no part line at all (only a size line).
- **The optional size lines** for Leafy and Bubbo are a dashed "Big or small?"
  line on their journal page once the forest is open; tapping it closes the
  journal and opens a cancellable prompt with the friend's portrait (they may
  be far away).
- **Thanks get a reply:** after "Thank you!" the monster spins and says
  "You're welcome!" (heard, not produced).
- **The stone ending opens the forest on screen:** a shot of the bramble
  withering, then "The forest path is open now!". The bramble replaced the
  old decorative vine wall at the same place.
- **The rope works both ways** once Puff has tied it (E at the foot: Climb;
  at the top: Climb down). The climb is a short scripted rise; a save is
  never written mid-climb (it resumes at the foot of the rope).
- **The cliff-top ending** is staged from the south-west corner of the cliff
  top: the group in front, the smoking volcano beyond, then a two-shot while
  Maple speaks "by radio" (she stays at camp). Puff's stone symbol lights
  remotely and is seen on the beach afterwards.
- **The volcano moved further away** (70, -112) and became a truncated cone:
  seen from the cliff top the old one was too close and its crater sat on a
  point like a mushroom. A corridor of the jungle toward it has no trees, and
  three ridges sit on the rising jungle to close the view north.
- **The ravine has a creek:** its floor lies below sea level, so the sea plane
  shows there as water. It reads as a stream under the bridge; kept.
- **Budget measured** (SwiftShader, 1366×768): forest 39–73 draw calls,
  ~80–90k triangles; beach with the forest behind it 68 calls, ~106k. Hiding
  areas by region (planned in the frozen design) was not needed: merged and
  instanced geometry plus frustum culling stay inside the budget.

## 2026-10-24 — Phase 3 (Volcano + Sanctuary) design, frozen

Follows the frozen chain: the volcano is reached from the cliff top, Ember
lives there (meat), Ember's fire lights the dark cave, the sanctuary behind
it has a gate needing all four abilities and the legendary monster. This is
the last phase: it ends the story. New English, in order of first use:
"It's hot!" (heard), "It has a tail." (first real use), "Can you make
fire?", "It's yellow.", "What's your name?".

**Route.** Cliff top → **lava stream** (replaces the rockfall placeholder at
the same place) → the volcano slopes (Ember, a meat rack beside its hot
rocks) → **the dark cave** in the volcano's flank → the sanctuary, a green
crater garden on the far side → **the sanctuary gate** → the legendary
monster. Before Phase 2's ending has played the lava stream does not ask.

**Obstacles (data, same rules as Phases 1–2; "Thank you!" after each).**
- `lava`: needs `swim`, question "Can you help me?", others "Can you fly?" /
  "Can you jump?", after `cliff`. Maple (radio): "It's hot!". Bubbo sprays
  water; the lava cools to dark stepping rock for good. Spoken "Can you
  swim?" also solves (help = the obstacle's need). Puff is active after the
  cliff, so this forces a switch to Bubbo. Rejected: Leafy's vines pulling
  the rockfall aside (a third "Leafy helps" in a row; Bubbo would then never
  be used after Phase 1).
- `cave`: needs `fire`, question "Can you make fire?" (new phrase), others
  "Can you fly?" / "Can you swim?", after `lava` and Ember's friendship.
  Ember lights the torches along the cave wall; the cave stays lit. The
  player carries nothing (rejected: a carried torch — a new held-item
  mechanic for one obstacle). Before it is lit the cave mouth is black and
  walking in says "It's dark!" and stops.
- **The sanctuary gate is four obstacles**, `gateLeaf`, `gateDrop`,
  `gateWing`, `gateFlame`, one pillar each with the Monster Stone's symbols,
  all after `cave`, in any order: leaf "Can you help me?" (Leafy grows a
  flower vine), drop "Can you swim?" (Bubbo fills the basin), wing "Can you
  fly?" (Puff rings the bell on top), flame "Can you make fire?" (Ember
  lights the brazier). Each pillar's others are two of the other three
  questions. Each lit pillar stays lit; the gate opens when all four are.
  This is the review of the whole game: four switches, four questions.

**Ember (big, a little grumpy, kind).** Normal discovery on approach (it
huffs smoke at 7 m instead of hiding). Its page has three lines like Puff's:
"It's orange." → "Hi! I'm Ember!" → "It's big." → "It has a tail."
(distractors as defined: "It's small.", "It has wings."). "Do you like ___?"
is unchanged in rules (≤3 "No"s, each a journal fact); meat joins the
question cards from Phase 3 on and is found only on the meat rack by Ember's
hot rocks (the contextual hint). Ember asks back "Do you like meat?", then
"Let's go!" makes it the companion.

**The legendary monster: Lumo** (yellow, big, wings; gentle, glowing). It
sleeps in the sanctuary garden behind the gate. Opening the gate wakes it.
Its page is the only one where the student asks the name: "It's yellow." →
"What's your name?" → "I'm Lumo!" → "It's big." → "It has wings." (the
name line stays blank until asked; distractor for the name prompt: "Do you
like ___?" / "Thank you!"). Then Lumo asks "Do you like monsters?" — either
answer gets a warm reply — and Lumo becomes a friend. Lumo does **not** join
as a companion (rejected: no obstacle is left to use it on; a fifth chip for
nothing); in free play it stays in the sanctuary and chats.

**Phase 3 ending = the game's ending.** Lumo rises over the crater; on the
beach the Monster Stone's fourth symbol (flame) and a new centre star light;
Maple, in person at the sanctuary this time, says the island is safe and the
student is a Monster Friend. Results card "The End" with all five journal
pages, then free exploration of the whole island.

**Save.** `mi.save.v3`; v2 (and v1 through v2) migrate, `endings` reaches 3.
New obstacle ids join the solved set; Lumo is a monster record like the
others (`phase: 3`, no `can`, not selectable as companion).

**Budget.** Same per-view budget (~100 draw calls, ≤~120k triangles). The
volcano and sanctuary are new geometry far from the beach; hide regions out
of view if measurement shows the need (not needed in Phase 2).

## 2026-10-24 — Phase 3 rules decisions

- Ember's home is (58, -92), with the meat rack hint at (55, -90), on the volcano's south-west slope. Lumo's provisional garden home is (78, -136). Slice 2 may adjust these coordinates.
- `islandFoods(p)` adds meat after `endings >= 2`, when the volcano route opens. `ISLAND_FOODS` remains the four Phase 1–2 foods for existing callers; slice 2 should use `questionFoods(p, id)` for cards. After three recorded No answers it offers only the favourite, preserving truthful answers and the three-No limit with five foods.
- Ember's `invited` flag records its post-friendship “Let's go!” separately; `invite` selects Ember and the cave requires this completed encounter. Earlier phases retain their existing rules.
- Lumo records the name prompt in `described.name`; `befriendLumo` accepts either existing yes/no answer after the complete page and open gate. `friends` includes Lumo, while `companions` and `setActive` exclude it. Its unused favourite/foodSpot fields retain the shared definition shape; `power: null` and an empty power line mean no ability.
- Gate objectives use leaf, drop, wing, flame order while permanent unlocks allow any order. Gate distractors are two of the other gate questions, never "Can you help me?" outside the leaf pillar (help means the obstacle's need, so it would solve wing or flame too). `finale` represents the final ending, and `endings: 3` records its completion.

## 2026-10-24 — Phase 3 decisions made while building

- The lava stream replaces the cliff-top rockfall at (34.5, -51.3), where the
  actual Phase 2 route ends. A winding southwest trail climbs to Ember at
  (58, -92), beside the meat rack (55, -90). The cave mouth is (64, -102).
  The garden lies beyond a narrow open-topped cave passage; its four pillars
  stand at x=60/65/75/80, z=-130, before the gate at (70, -133). Lumo's home
  moved to (70, -141), with space for the finale group and garden camera.
- Lumo's journal omits Food and Can sections and the companion button. Its
  name remains blank until asked. This reflects the actual encounter and
  avoids implying an unused food or ability puzzle.
- The centre star is a fifth socket between the Monster Stone's four symbols.
  It and the flame light remotely as Lumo rises. Phase 3 results orbit the
  sanctuary rather than the beach and show five compact journal page summaries.
  Unwritten optional beach size lines stay unknown, as in the real journal.
- The cave is an open-topped rock passage with an arch and a black mouth before
  lighting. This keeps the existing third-person camera unobstructed. Torches
  remain visible after Ember lights them; the player carries no new item.
- Detailed volcano scenery hides when both player and scripted camera target
  are south of the cliff. The distant smoking cone stays visible in earlier
  phases. Merged geometry and fixed lights retain the Chromebook render budget.
- Food questions support number key 5 once meat joins the cards; companion
  shortcuts remain keys 1–4. Lumo never adds a fifth companion chip.
- The final cutscene exposes a read-only semantic stage through the existing
  opt-in test hook (`idle`, `rise`, `maple`, `complete`) along with permanent
  unlock animation values and camera coordinates, so captures wait on state.
- Inside the sanctuary, its local rock rim replaces the distant volcano shell.
  The garden floor ends at that rim, with rocks resting on the flat plateau.
  This removes the distant cone's cut edge and the tall jungle terrain fringe
  from the gate/finale cameras. Finale cameras stand inside the gate; friends
  gather behind the player and Maple when she speaks in person.
- Equivalent spoken ability questions are accepted separately from the three
  tap cards. In particular, lava accepts "Can you swim?", and contextual
  "Can you help me?" works at the rope and pillars, using the unchanged pure
  obstacle rules. This preserves the frozen tap distractors and speech ladder.
- Correction pass: the open-topped cave is replaced by an opaque roofed tunnel
  with a continuous near-black lining and an opaque rear wall. The eastern
  side exit joins the garden on the existing walkable passage; no collision or ability rules
  change. A low follow camera stays beneath the roof inside the tunnel. The
  rock shell does not use camera transparency, so sky/garden cannot show
  through it. Ember warms the lining with vertex colours and lights ten wall
  flames with additive glow sprites, without extra lights or shadows.
- Phase 3 obstacle shots give big companions more room on the player's far
  shoulder; arrival captures wait for their physical walk and camera position.
  Lava uses yellow-white fissures, pulsing emissive colour and six instanced
  steam puffs. Lumo's undiscovered objective names the legendary monster in
  English and Japanese using the existing objective state.

## 2026-10-29 — Act 3 decisions made while building (slice A)

- Cloud Isle is a separate physical world. Only its scene or the home scene
  mounts. North is +z with fixed yaw π; collision, heights, zone encounters,
  checkpoints and save projection all select the active world. Existing home
  terrain, camera offsets, encounters and balance are preserved.
- Dock → Coast → waterfall Hollow → family back tunnel → Junction is the
  playable route. The raider road stays permanently blocked. Both mountain
  route mouths have see-through barriers; the real observatory and beacon are
  distant geometry. Zone, enemy, chest, puzzle and pickup tables can be extended
  by later slices without replacing this region.
- The lowland follow offsets remain pitch .55, distance 10 m, look-ahead 3 m.
  Cloud Isle uses an 80° vertical lens and a modest upward lens shift so the
  nearby player and the actual summit silhouette fit together. The original
  55° lens crops the horizon at this pitch. Home framing is unchanged. Cloud
  fog starts at 38 m and ends at 260 m with a darker storm colour; the longer
  end keeps the real summit visible during the offshore reveal.
- The first voyage saves the departure harbour until its one sea fade. At
  that fade all four English beats are complete, voyageDone is recorded and
  the physical world swaps. An interrupted arrival reloads at valid Cloud
  ground without replay. Completed trips use the short two-way boat fade.
  Enemy memories survive boat travel and keep the existing 12-second rule.
- Wind lanes move loose props and projectiles. A sprite puff deals light
  damage without translating the player, following the accepted wind rule.
  Cloud attacks keep at most four enemies awake, including when a sleeping
  enemy is struck. Environmental powers spend no MP.
- The three optional errands can be completed in slice A: the bag is inside
  the windmill sea cave, three logs lie in the Junction, and glow moss grows
  on the accessible Canopy route-mouth lip. The closed route beyond that lip
  belongs to a later slice. Hand-ins permanently repair the shelf, improve
  the cooking area, and brighten the lantern with extra bedding.
- Stew is stored in act3.stew, outside ordinary FoodId favourites. One fish
  cooks one stew, carry limit three; the bag deliberately restores 50 HP and
  40 MP to every friend. The F key and quick-eat button retain their existing
  favourite-food behavior.
- The Hollow becomes the Cloud wake destination as soon as it is found;
  using the mats restores all vitals and records its checkpoint. Trust,
  drawing and tunnel unlocks are monotonic and validated in order. Old v4
  saves gain defaults, and every Act 3 field is discarded without the harbour
  lead. Reserved observatory and beacon fields are present for later slices.
- Browser acceptance is authored in tests/e2e/act3.spec.ts, including both
  viewport sizes and touch controls. This order's validation commands do not
  run that browser suite; screenshots and measured render reports are produced
  by it when browser acceptance is requested, rather than fabricated here.

**Slice B extensions (2026-10-29):**

- The two Junction mouths are open immediately, with three wind sprites and
  no Junction clear gate. Each mountain route has six enemies and its own
  permanent far gate. Both gates join one approach to the closed Observatory;
  the entrance and interior remain reserved for slice C. The original three
  Junction logs and mouth moss retain their IDs and remain collectible.
- West rises early through broad roots, vine bridges and marked glide pads;
  east stays low in an enclosed blue crystal cave before its exit climbs to
  the same approach. Cave occupancy hides outdoor geometry, lights and props.
  Cave floors, walls and a high ceiling enclose gameplay views; only its
  two mouths connect the view to the outside.
- Puzzle rules now name their friend, ability and English command in one
  table. Leafy's vine bridge and Puff's pad-to-pad hop are required in the
  Canopy; Bubbo's raft basin and Ember's boiler gate are required in the Grotto.
  Puff's optional gust opens the branch chest. Every environmental ability
  remains free at zero MP. The hop permits no steering and supports the return
  direction; an interrupted hop reloads at a marked pad.
- Electric panels repeat four-second cycles: 1.8 seconds dark, .6 seconds
  amber warning (both safe), then 1.6 seconds blue-white and active. They deal
  five HP using the shared damage grace period and apply no knock-back.
- Voyage camera poses follow the hull immediately from a clear broadside,
  bypassing land camera collision while at sea. Fixed rocks occupy the
  original forward heading; Gull's existing left-turn leg clears them. Sky,
  fog, lighting and vertex sea swell darken continuously offshore, keeping
  Port Town fair and preserving the single sea fade and slice A story order.
- The Hollow has continuous opaque side/rear walls, a floor extending behind
  them and a high root ceiling. Its near facade cuts away when behind the
  lens; the interior waterfall curtain faces inward. Family props, collision,
  checkpoints and permanent errand upgrades keep their existing behavior.
- Browser acceptance now captures the airship reveal and every new route,
  mechanism, panel state and approach at both sizes, with render-budget
  assertions and route reloads (68 views, at most 118 calls / 60k triangles).
  The closed-entrance check asserts the player stops short of the door
  (z < 135, door at 137): player centres may sit a few tenths past a walk
  rectangle's edge, so the rectangle's own edge (134) was too tight a limit.

**Slice C extensions (2026-10-29):**

- Either completed mountain route enters the same ruined Observatory. Reaching
  its entrance records the summit checkpoint without healing; the entrance
  rest restores the party deliberately. Gull's boat remains a wake point with
  the existing minimum 60 HP recovery and no longer offers free rest. The
  Hollow's mats retain their free rest.
- Four raiders guard the dial. After their first clear, Leafy's lever,
  Bubbo's water wheel, Puff's turbine and Ember's steam valve use the existing
  Can-you / command / thank-you exchange. The lamps are permanent, order-free,
  friend-checked and free at zero MP. The four lamps power an inclined lift
  on brass rails; the interaction carries the player up, with retreat retained.
- Officer Squall's weather machine has one three-part power pool. Each pylon
  cycles through a shield, a 2.4-second charge and a six-second opening. One
  manual hit while exposed removes exactly one third. Bubbo can short a charge
  early; Puff can cancel the one-second gust by attacking along its streaks.
  Lightning gives 1.2 seconds to leave two small rings. Gust movement stops
  well inside the rim, lightning deals 12 HP, and only two wind sprites join
  after the second pylon. Boss abilities remain usable at zero MP; the earlier
  regions' combat economy is unchanged.
- Fight attempts are transient: loss, arena exit or reload reconstructs the
  three pylons. Observatory clear, lamps, items and checkpoints survive. The
  boss outcome and Sky Fortress clue are separate milestones so an interrupted
  resolution resumes safely. Lumo remains captured throughout.
- The resolution drives the existing kidnapping airship and cage runtime and
  renderer. Squall is roped aboard while dizzy; Lumo glows in the cage as the
  ship heads north to a distant Sky Fortress. The objective and journal retain
  “Find the Sky Fortress” even after sailing home. Gull offers the bigger-boat
  next-chapter line at either dock without removing return travel.
- Summit weather is a slowly rotating ring of instanced cloud puffs with
  occasional lightning, leaving a large open centre. Victory disperses the
  ring and permanently brightens Cloud Isle's sky, fog, sea and light. The
  family's patched roof, entrance sunlight and relaxed idles accompany the
  bilingual promise and sunny-weather aftermath exchange.
- Grotto panels retain their four-second timing. Opaque dark safe faces,
  amber warning faces and blue-white active faces with a few instanced sparks
  and a short procedural crackle make the three states distinct.
- Browser acceptance is extended through the ending, retry, reload and two-way
  boats at both viewport sizes (146 views, at most 120 calls / 66k triangles).
- **Fixes after acceptance:**
  - **Arena camera.** Inside the beacon arena, the camera's heading turns to
    sit on the far side of the player from the weather machine (damped,
    radial). Cloud Isle's fixed north heading put the lens inside the mast
    whenever the player stood north of it, at the third pylon. From the lift
    the radial heading equals the normal one, so the hand-over doesn't turn.
  - **Pylon aim.** A pylon within 3.5 m in front of the player beats a nearer
    wind sprite. Before, a hovering sprite took every swing at the pylon.
  - **Far detail.** The officer and the pylons (lights, shields) are drawn
    within 90 m only. From the boat they were specks costing 10 draw calls,
    and the reveal went over budget (130 calls).
  - **Test server.** The browser suite serves the built `dist`
    (`npm run preview`), so run `npm run build` before Playwright.
