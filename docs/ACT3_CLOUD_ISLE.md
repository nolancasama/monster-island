# Act 3 — Cloud Isle: Above the Storm (frozen spec)

Branch: `feature/act3-cloud-isle` (from `main` `201990a`). This is the
product definition the implementation follows. It is the external brief
("Monster Island — Act 3: Cloud Isle and the Hidden Family") as accepted, with
the changes recorded in `DESIGN_DECISIONS.md` ("2026-10-29 — Act 3 Cloud Isle:
brief accepted, with these changes"). Where this file and the brief differ,
this file wins.

Everything established for Act 2 still holds unless stated: real-time manual
combat (J/K, held J, 1–4, F), one HP pool, per-friend MP, abilities free at
0 MP, coins, food, respawn after 12 s away, permanent first-clear exits,
only the active friend in hostile zones and the whole party in safe zones, no
microphone in fights, the obstacle flow ("Can you ___?") for puzzles, English
+ Japanese for every line, forgiving speech with a Tap alternative, enemies
and their projectiles simulated only in the active zone, scenery chosen by
camera distance only (one representation per place, fog-matched cut-off, no
pop-in), Chromebook budget.

## 1. Entry and travel

- **Gate:** Act 3 is reachable only when `progress.act2.harbor` is true (Gull
  has given the Cloud Isle lead). Existing finished-Act-2 saves get a harbour
  interaction that starts the voyage. Replace the "coming soon" lines (Gull's
  repeat line, the `act2Done` hint, the journal "(To be continued)") with the
  new objective.
- **First voyage (≈60–90 s, one scene, playable):** Gull: "Are you ready? Let's
  go to Cloud Isle!" → "Yes, let's go!". The boat leaves the real Port Town
  quay. Then three beats, each a button that shows the English and accepts
  speech (forgiving) or a tap:
  1. "Raise the sail!" — the sail goes up, the boat speeds up.
  2. "Turn left!" — rocks ahead; the boat steers round them (no fail state;
     a wrong/late answer just has Gull steer).
  3. Gull: "How's the weather?" → a picture choice: "It's windy." (correct,
     the sail is full) / "It's sunny." / "It's rainy." Wrong picks get a
     gentle retry.
  4. "Look!" — the reveal (below).
- **One transition:** a short fade at sea between the Port Town waters and
  the Cloud Isle waters is allowed (and only there). Only one world is mounted
  at a time: the home island (prologue + lowland) or Cloud Isle. No second
  low-detail copy of Cloud Isle is drawn from Port Town.
- **Reveal:** Cloud Isle's real geometry, seen from the boat: rocky coast,
  forest, cliffs, giant trees, a waterfall, stone ruins, a storm-cloud ring
  around the summit, and the Storm Beacon's silhouette above the clouds. A
  raider airship with the crescent emblem crosses overhead. Controlled
  cinematic camera is allowed here.
- **Return trips:** Gull at the Cloud Isle dock and at the Port Town harbour
  offers "Sail to Port Town / Cloud Isle?" → a ~2 s fade, no beats. The first
  voyage plays once. During it, a Skip button appears only if the voyage has
  been completed before (e.g. after a reload mid-voyage).

## 2. Geography and camera

Cloud Isle is its own region with its own collision set and height function,
like the lowland (`world/cloudisle.ts`, scene `CloudIsle.tsx`). The route runs
in one direction from the dock (south coast) up to the summit (north), so the
**fixed follow camera** (lowland framing: fixed yaw looking up-mountain along
the route, pitch ≈0.55, 10 m, 3 m look-ahead) always puts the next area and
the summit beacon in the upper half of the screen. No drag orbit in Cloud
Isle. Cinematics may move the camera.

```
            STORM BEACON (boss)            north / summit
                  |
          ANCIENT OBSERVATORY
             /          \
   SKYROOT CANOPY     THUNDER GROTTO
   (upper, west)      (lower, east, cave)
             \          /
          WINDFALL JUNCTION
                  |
   HIDDEN HOLLOW (behind the waterfall; its back tunnel climbs to the junction)
                  |
          STORMBREAK COAST
                  |
          CLOUD ISLE DOCK                  south / sea
```

- **Why the shelter is on the route:** the raiders' road from the coast to the
  junction is closed by a raider barricade the player can see but never open.
  The family's back tunnel is the "safer route" the parent knows. So the
  family is needed to progress, the shelter is never cut off by enemies, and
  it stays hidden from the road.
- **Zones:** Dock (safe, knock-out wake point at Gull's boat; no healing
  there since the gameplay polish brief made rest a resource), Coast (hostile), Hollow
  (safe, rest + checkpoint), Junction (hostile, light: exploration and one
  chest, no gate), Canopy and Grotto (hostile, gated at their far ends),
  Observatory (hostile + main puzzle), Beacon (boss arena).
- **Required clears:** Coast 6, Canopy 6, Grotto 6, Observatory 4. Either
  branch opens the observatory. Retreat is always possible. Gates are
  see-through, as in the lowland.
- **Visibility:** from the dock the summit and beacon; from the coast the
  waterfall cliff; from the junction both route mouths and the observatory;
  from the observatory the beacon. Distant landmarks are the real geometry
  through fog. The summit/beacon may use a longer fog/cut-off than ground
  scenery, but still one representation.

## 3. Enemies (introduced gradually)

All wear the crescent emblem, telegraph clearly, can be interrupted, and use
the Act 2 knock-out (dizzy spin, poof). No more than 4 awake at once in any
area.

| Enemy | Behaviour | Where |
| --- | --- | --- |
| Storm Crab | Armoured front: J from the front does half damage; side/back full. Short telegraphed sideways charge. | Coast, Grotto |
| Wind Sprite | Flies, drifts sideways, fires a slow wind puff (light damage, small push). | Coast, Canopy, Observatory |
| Raider Drone | Small machine, hovers, a red aim line then a straight dash. | Canopy, Observatory |
| Thunder Beetle | Glows and crackles ~1 s before a short electric ring around itself. | Grotto, Observatory |

## 4. Wind and puzzles (all abilities free at 0 MP, obstacle flow)

- **Coast:** gust lanes are visible (streaks, swaying grass) and only push
  light objects and the wind puffs. Gusts never push the player. Puzzle: Puff
  "Blow!" turns a stuck windmill whose crane lowers a plank into a sea cave
  (optional chest). Leafy "Pull!" drags a crate onto a pressure plate that
  opens a side cove (optional).
- **Discovery trail (coast):** see §5.
- **Canopy (upper route):** Leafy "Pull!" swings a vine bridge (required);
  Puff "Fly!" carries the player across one gap between two marked glide
  pads (required). Scripted, no free flight. One optional chest behind a gust
  lane Puff stops.
- **Grotto (lower route):** Bubbo "Splash!" fills a basin that floats a raft
  across an underground pool (required); Ember "Burn!" lights a steam boiler
  that lifts a gate (required). Electric floor panels pulse on a slow, visible
  rhythm (≥1.5 s safe window) and do light damage, no knock-back into pits.
  One optional chest in a crystal chamber.
- **Observatory main puzzle:** four mechanisms around a central dial, each
  one friend's verb: Leafy "Pull!" (lever), Bubbo "Splash!" (water wheel), Puff
  "Blow!" (turbine), Ember "Burn!" (steam valve). Each lights one lamp on the
  dial; all four raise the lift to the Beacon. Order free, each stays solved,
  nothing can be undone.
- A friend not yet in the party is impossible here (all four are present by
  Act 2), but every puzzle must still check, as Act 2's do.

## 5. Hidden Hollow and the family

**Location:** a cave behind the waterfall at the top of the coast, under the
roots of a giant tree. Inside: a humble, lived-in room: cooking fire, sleeping
mats, a table, pots, stored food, drying fish, barrels and crates, a lantern,
a child's toys, a hand-drawn map pinned up, patched repairs. No stalls, no
storefront, nobody else.

**The family** (distinct looks, idle animations, en + ja voices via the
existing TTS settings):
- **Tala** (parent, protector) — suspicious at first; knows the back tunnel.
- **Grandpa Bo** (caregiver) — calm; rest and cooking.
- **Kiko** (child, witness) — curious about the monsters; saw Lumo; draws.

**Discovery (first time, short scripted event):** after the coast's first
clear, a small figure (Kiko) dashes from the coast's inland end towards the
waterfall. A trail of disturbed ferns/footprints with a soft sparkle leads
to it. The waterfall parts as the player walks through. Inside:
- Tala steps forward: "Who are you?" → player: "I'm a friend."
- Kiko, peeking at the active friend: "Is that your monster?" → "Yes, it is!"
- Tala: "Can you help us?" → "Yes, I can!"
Each player line is speech-or-tap (forgiving, Tap always available; typing
only if the existing system already offers it). Then the family relaxes,
all friends come out and relax (safe zone).

**Story reveal:** Kiko: "I saw a shining monster in a cage!" and shows a
crayon drawing that is clearly Lumo in the raiders' cage (a 2D overlay card).
Player: "Where is Lumo?" Tala: "They took the cage up the mountain, to the
old observatory." Objective: **Reach the Ancient Observatory and find
Lumo.** Tala opens the back tunnel.

**Safe area:** combat HUD hidden or reduced, peaceful music, all friends out.
"Rest" at the mats (Grandpa Bo: "Have a rest.") fully restores HP and every
friend's MP, and sets the checkpoint. A knocked-out player on Cloud Isle wakes
at the Hollow once found, else at the dock.

**Grandpa Bo's stew (optional, not an economy):** "Do you have any fish?" →
"Yes, I do." (if the bag has fish; costs 1 fish) / "No, I don't." (no cost,
"Come back with a fish."). He cooks **Stew**: a new bag food, nobody's
favourite, eaten from the bag: +50 HP and +40 MP to every friend. Carry at
most 3. No other recipes, no new currency. Port Town stays the only shop.

**Errands (optional, world pickups only, never the player's own items):**
1. **Kiko's lost bag** — in a coast sea cave. Reward: 20 coins; the storage
   shelf is repaired.
2. **Firewood ×3** — logs at the junction and along either route. Reward: an
   amber; a better cooking area.
3. **Glow moss** — one in the Canopy, one in the Grotto; either counts.
   Reward: 30 coins; a brighter lantern and extra bedding.
Each reward shows permanently in the Hollow. After the beacon falls, the
roof is mended and the Hollow is brighter (aftermath, below).

## 6. Storm Beacon (boss)

**Officer Squall**, a raider officer at the controls of the weather machine.
One continuous boss bar (the machine's power). Arena: a round platform above
the clouds, three **storm pylons** around the machine.

- **Wind gust** (telegraph: streaks gather, 1 s): a push across the arena;
  Puff's attack in the gust's direction cancels it.
- **Lightning circles** (telegraph: glowing rings on the floor, 1.2 s):
  step out.
- **Pylons:** each pylon has a shield that drops after a telegraphed charge;
  hitting an exposed pylon removes a third of the bar. Bubbo's Splash on a
  charging pylon shorts it early (a reward for attention, not required).
- After the 2nd pylon the officer adds wind sprites (max 2).
- All offence is the player's. No separate battle screen. Defeat = wake at
  the observatory entrance (a rest point once reached) with progress kept;
  pylons destroyed in a failed attempt are restored (simple, predictable).

**Resolution (cutscene):** the machine powers down; the storm ring breaks; the
clouds clear (sky and fog lighten across Cloud Isle permanently). Officer
Squall, dizzy, is hauled up by a rope from a second raider airship. On its
deck: Lumo's cage. Lumo glows; the airship and the raider captain fly north
towards a distant **Sky Fortress** (a silhouette in the new clear sky). Banner:
"Chapter Clear! Lumo is going to the Sky Fortress!" The new objective is
"Find the Sky Fortress." The journal says so. Lumo is **not** rescued.

## 7. Aftermath

Returning to the Hollow after the beacon: Tala is relaxed ("The storm is
gone. Thank you!"), Grandpa Bo thanks the player, Kiko: "Will you find Lumo?"
→ "Yes, I will!". The roof is mended, sunlight comes through the entrance,
the family's mood idles change. The weather line: Kiko: "How's the weather
now?" → "It's sunny!" The family stays in the Hollow (going home is a later
chapter). Gull at the dock: "The Sky Fortress? We need a bigger boat... Next
chapter!" — clear "to be continued" ending.

## 8. Save

`mi.save.v4` gains a validated `act3` object (additive; v1–v4 saves without it
load unchanged and get the defaults). Nothing in `act3` may be true unless
`act2.harbor` is. Fields: voyage done, current world (home/cloud), area,
hollow found, family milestones (met, trusted, drawing seen, tunnel open,
aftermath seen), errands (bag, firewood count, moss), stew count, cleared
areas, opened chests, solved puzzles, observatory lamps, beacon defeated,
Sky Fortress clue. Invalid positions project onto valid Cloud Isle ground. A
save made on Cloud Isle loads on Cloud Isle (no voyage replay). The home
island and all earlier areas stay reachable by boat.

## 9. Budget and acceptance

- Gameplay views at 1366×768 and 1280×800: ≤120 draw calls, ≤140k triangles
  (same order as the lowland). Instanced vegetation, spatial tiles, distance
  cut-off matched to fog, cheap water/wind (vertex sway, sprites), no new
  real-time shadows or post-processing. The Grotto is enclosed: draw only it
  and its mouths while the camera is inside.
- Unit tests: Cloud Isle reachability flood (both routes reach the
  observatory, back tunnel needed, barricade never passable), gates, save
  validation and migration (old v4 without `act3`, act3 without the harbour
  lead rejected), stew/errand rules.
- Browser tests (`tests/e2e/act3.spec.ts`): harbour → voyage → dock → coast
  clear → discovery → trust → drawing → rest → either route → observatory
  dial → boss → aftermath; reload on Cloud Isle; boat back to Port Town and
  return; touch-only pass. Screenshots of every area and story beat at both
  sizes to `.tmp/shots/act3/`, with a `render-report.json`.
- The whole existing suite still passes; the prologue and Act 2 are unchanged.
