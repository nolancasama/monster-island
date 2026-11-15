# Pirate Voyage Adventure — frozen spec (2026-11-15)

Source: the user's plan "Monster Island — Pirate Voyage Adventure" of 2026-11-15. Change this file only
through the controller and record why in `DESIGN_DECISIONS.md`. Branch `feature/pirate-voyage` is cut from
`feature/port-town-revamp`, because the keepsake uses that branch's wardrobe. Merging and deploying need
the user's approval.

## 0. Controller verdict

Accepted as written:
- the four-act story (departure and capture, work aboard, storm, raft and landing);
- the truthful food interrogation and the comic monster scene;
- four monster jobs in any order, each with real play, English and a visible result, and the crew
  warming up after each;
- a keepsake hat, the storm's four forgiving emergencies, the ship breaking up with the pirates escaping
  in lifeboats;
- the raft built with Leafy, Bubbo's tow, Puff's sail and the landing;
- the Cloud Isle hand-over, the release lock, checkpoints and safe saves, Speak and Tap, and tests.

Changed or added, and why:

1. **The ship is a walkable deck region in the home world's open sea**, about 150 m south of Port Town.
   The fixed camera always looks south to open water, so the town never shows. The ship is static in the
   world. Sailing is shown by moving water, a wake, drifting clouds and a gentle camera sway; the storm uses
   camera roll, waves, rain and lightning.
   Rejected: a new world type (it touches collision, combat, saves and every renderer) and a rocking
   collision deck (characters would slide and float).
2. **Cutaway decks, no ceilings.** The camera follows the player at a steeper `pirate-ship` pitch.
   - The main deck holds the masts and the helm.
   - The galley is an open-roofed deck-house at the bow.
   - The cargo hold is a sunken, open-topped hold amidships, reached by stairs.
   - The fishing deck is a low stern platform by the water.
   - Masts and sails use the existing occluder fade on the sight line.

   Rejected: enclosed interiors, which the fixed follow camera cannot see into.
3. **On the ship, J is the active friend's job tool**: Bubbo's bubble, Ember's flame, Leafy's vine and
   Puff's gust, using a voyage-only effect system. Combat never runs on the ship (no enemies, no MP).
   Rejected: reusing combat moves (they need enemies, stances and MP).
4. **Prepositions by carry and choose.**
   - Leafy's vine (J) lifts an item and carries it; E at a piece of furniture puts it down.
   - The table and the shelf ask ON or UNDER (word buttons, spoken or tapped). The box takes IN and the
     door takes BY.
   - The item then sits exactly in that relation, and the pirate checks the instruction against the real
     state. "Where is the …?" asks about the real state.
   - Nothing snaps anywhere the player did not choose.

   Rejected: free physics drops, because ON and UNDER are ambiguous from a top-down camera.
5. **Steering by spoken or tapped commands** ("Turn left!", "Turn right!", "Go straight!", "Stop!").
   Obstacles drift toward the ship or raft (the sea moves, the vessel does not), and a command shifts the
   heading lane. A wrong command is a gentle bump and a retry, never a failure. Rejected: sailing physics.
6. **A fair interrogation.**
   - Questions come from the real bag: at least one food the player has and one they don't, when
     possible.
   - Both answers are always offered. A wrong one gets "Look in your bag!" with the bag shown, then the
     same question again.
   - "What food do you have?" offers only foods actually held (any is right), or "I don't have any food."
     when the bag is empty.
   - The pirates take **one** of the named food.
7. **Captain Gull** is captured too, works the helm, and leaves in a lifeboat with the pirates. After the
   raft lands, he arrives at Cloud Isle's dock in his own boat ("I found my boat!"). This keeps Cloud
   Isle's existing dock and sail-home behaviour unchanged.
8. **The keepsake is a new wardrobe item, the Captain Hat** (head, anyone, just for fun). It is never
   sold; it is given once, added to `owned`, and offered to wear. Rejected: a second equipment system, and
   giving the shop's Pirate Hat (the player may already own it).
9. **The release lock stays.** The voyage starts only from `sailWithGull()` when `cloudIsleOpen()`, and
   the public build still says "Coming Soon". Debug builds get travel targets for each checkpoint.
10. **Art scope:**
    - one pirate ship (≤ 9k triangles), drawn only near it;
    - four pirates built on the keeper body (captain, cook, cargo boss, fisher) with pirate looks;
    - Gull's existing boat, a raft, floating wreckage, a distant island silhouette;
    - storm effects that cost no draw calls when the weather is calm.

    Rejected: heavy assets and simulated water.
11. **Checkpoints.** Each stage saves its stage (and each finished job) when it starts or ends. A reload
    resumes at the latest checkpoint's spot, and rewards and food changes are guarded by flags, so a
    reload never repeats them.

## 1. Stages and English

`act3.voyage.stage`: `none → captured → jobs → storm → raft → done`. Each stage is replayable from its
start.

| Stage | Beats (pirate lines are TTS; **student** lines are Speak/Tap asks) |
|---|---|
| depart | Gull: "Are you ready?" → **"Yes, I am!"** · Gull: "Let's go!" → **"Let's go!"**. The boat leaves the pier with the four friends aboard. |
| capture | A pirate ship comes fast from the south-east. Captain Redbeard: "Stop! Stop that boat!" Ropes fly across, and the player and the friends are pulled aboard in arcs (no teleport). |
| interrogation | Up to 3 "Do you have …?" → **"Yes, I do." / "No, I don't."** (from the real bag; wrong → "Look in your bag!"). Then "What food do you have?" → **"I have …"** (held foods only) or **"I don't have any food."**. Pirate: "Thank you! Fish for dinner!" The bag loses one of that food. |
| monsters | Captain: "Monsters! Delicious!" · Cook: "Monster soup!" (friends tremble) → **"No! They're my friends!"** · Captain: "Can they help us?" → **"Yes, they can!" / "No, they can't."** ("No" → "Hmm… are you sure?" and the question again) · Captain: "Okay! Show me!". Checkpoint `captured`; free roam begins (`jobs`). |
| jobs | Four jobs (§3) in any order. After each: thanks, a cheer, a happy friend, new crew lines; the captain's mood flag goes up. All four done: "Your monsters are amazing!" · Cook: "No monster soup!" · Captain: "You're part of my crew now!" Captain Hat given. Thunder. |
| storm | Four emergencies (§4), then the break-up and the lifeboats. |
| raft | §5, then Cloud Isle. |

## 2. The ship

Origin `SHIP = { x: 76, z: -470 }`. The bow points south (−z), so the stern is nearest the camera. Deck
heights are above `SEA_Y`. The walkable shapes live in one authored list (`world/pirateShip.ts`) that drives
walking, `standY` and rendering.

| Area | Footprint (from SHIP) | Height | Contents |
|---|---|---|---|
| fishing deck | x ±3, z +15…+18 | 0.7 | rail, net, bucket, the fishing pirate |
| stairs (stern) | x 2…3.2, z +11…+15 | 0.7→3.2 | |
| quarterdeck | x ±4.2, z +8…+15 | 3.2 | helm wheel, Captain Redbeard, Gull |
| main deck | tapered hull, x ±4.5, z −14…+8 | 2.4 | mainmast z −1, foremast z −10, cannons along the rails, the hold opening (railed except the stairs) |
| cargo hold | x ±3, z −8…−1 | 0.6 | stairs at x −3…−1.8 from z −1…+1.5; table, shelf, open box, door; the cargo boss |
| galley | x ±3.4, z −19…−13 | 2.4 | open-roofed deck-house: stove, pot, supply crates (fish, meat, apples, bananas), serving table; the cook. Three hungry pirates sit outside at a long table. |

The `pirate-ship` camera is pitch 0.75 and dist 11; masts and sails fade on the sight line. A "Fall in the
sea" never happens: rails and the hold edge are solid.

## 3. Jobs (any order)

Each job is offered by its pirate (E: "Can you help me?" → **"Yes, I can!"**). It switches to its friend if
needed ("Let's ask Bubbo!"), runs, and ends with a visible result and a thank-you line.

**A. Fishing (Bubbo, fishing deck).**
- Pirate: "Can you catch fish?" → **"Yes, I can!"**; **"How many fish?"** → "Three fish, please!" (2–4,
  varied).
- Fish swim in the water behind the stern, along with one old boot. J fires a bubble along the player's
  facing (8 m). A fish it touches is trapped, and the bubble floats up to the bucket (the count rises).
- The boot is "That's not a fish! That's a boot!" and does not count. Catching stops at the number asked.
- **"I have fish!"** → "Thank you! Dinner!" The pirate holds up the fish.

**B. Cooking (Ember, galley).**
- Cook: "Can you cook?" → **"Yes, I can!"**; **"Can you make a fire?"** (to Ember) → Ember lights the stove
  (J).
- Three orders, one at a time. **"What do you want?"** to a hungry pirate → "I want fish!" / "I want
  meat!" / "I want bananas!" (and so on).
- E at the right supply crate takes it (cook: "Do you have fish?" → **"Yes, I do."**). E at the pot puts it
  in.
- Ember keeps the fire: hold J to keep the heat bar in its green band for 2.5 s (it cools when J is
  released; no timer can fail).
- E at the pot takes the dish. E at the pirate → **"Here you are!"** → "Thank you! Yummy!"
- A wrong dish: "That's not fish! I want fish!"

**C. Cargo (Leafy, hold).** Items: red barrel, blue box, green crate. Furniture slots: table (on, under),
shelf (on, under), box (in), door (by).
- Six puzzles from a shuffled pool, with each preposition at least once.
- Two "Where is the …?" questions, asked about the real state: **"It's on the table." / "It's under the
  shelf." / …** (four choices).
- Wrong placement: "Hmm, the barrel is on the table. Put it under the table!" Any order works; the player
  can pick items up again.

**D. Sailing (Puff, main deck).**
- Captain: "The wind is gone! Can you make wind?" → **"Yes, I can!"**.
- Three sails (main, fore, mizzen) each have a fill meter. J gusts in the player's facing, and a gust
  filling a sail adds 34%. Full sails billow, and the ship "speeds up": the wake and the water get
  faster.
- Steering: the helm view shows obstacles (rocks, floating barrels) coming one at a time, in one of three
  lanes. The captain: "Rocks on the left!" → **"Turn right!"** (or "Go straight!" / "Turn left!").
- After four obstacles: "Stop!" → **"Stop!"**. Captain: "It's windy! Great job!"

## 4. Storm

The camera gets the sky darkening, rain streaks, lightning flashes, waves and a slow roll of up to 6°.
Emergencies run in order. None has a timer, and each asks its friend with the student's line:

1. Barrels slide across the deck. "Help! The barrels!" → **"Leafy! Can you help me?"** J ties each of
   three barrels with a vine.
2. Lightning sets three small deck fires. "Fire! Fire!" → **"Bubbo! Can you help me?"** J bubbles each out
   (steam and TSSSS).
3. The mainsail tears. "The sail!" → **"Puff! Can you help me?"** Hold J at the sail to keep a meter full
   for 3 s while two pirates sew.
4. A pirate is pinned by a fallen spar. "Help me!" → **"Where is he?"** → "Over there!" → J lifts the spar.

Then the break-up: the mainmast falls and the hull splits and tilts. The pirates and Gull row away in two
lifeboats ("Good luck, crew!"). A wave carries the player and friends away (fade). Checkpoint `raft`.

## 5. Raft and landing

Location `RAFT = { x: 76, z: -600 }`, with an island silhouette far to the south.

1. **Gather.** The player stands on a floating hatch among drifting planks.
   - **"We need wood!"** → Leafy: "How many?" → **"Three!"**.
   - J vines a plank in. The first one asks **"Put it here!"**, and each plank lands in the next of three
     glowing slots. The raft is done.
2. **Tow.**
   - **"Bubbo, can you swim?"** → "Yes, I can!" · **"Can you help me?"**. Bubbo tows the raft.
   - The player steers between three lanes past five pieces of debris. The left and right keys, the
     touch arrows, or **"Turn left!" / "Turn right!" / "Go straight!"** all work.
   - Then Bubbo: "I'm tired!"
3. **Sail.**
   - **"Puff, can you help me?"** → "Yes, I can!". Puff fills the little sail.
   - Three spoken or tapped steering choices toward the island, then **"Stop!"** at the shallows.
4. **Land.** The storm has cleared.
   - Puff: "Look! An island!" → **"Where?"** → Puff: "Over there!" → **"Let's go!"**.
   - Fade to Cloud Isle: the raft runs onto the beach by the dock and the friends hop ashore.
   - Gull's boat sails in: "I found my boat! I'll wait here." Then the existing Cloud Isle arrival (banner,
     save), with `voyageDone` set.

## 6. Save data (v4, additive)

`act3.voyage` (new):
`{ stage: "none"|"captured"|"jobs"|"storm"|"raft"|"done"; jobs: Array<"fishing"|"cooking"|"cargo"|"sailing">;
interrogated: boolean; hat: boolean }`

- It is read only when `act2.harbor`, and is re-validated.
- `voyageDone` (existing) wins: a save with `voyageDone` reads as `stage: "done"`.
- Loading mid-voyage (stage `captured…raft`) places the player at that stage's spawn, with completed jobs
  kept.
- The interrogation's food is taken once (`interrogated`), and the hat once (`hat`).
- Old saves without the field read as `none`.

## 7. New phrases (`logic/english.ts`)

Recognition keys follow the existing forgiving conventions (top hypothesis only, accented forms):

`yesIAm`, `letsGo`, `yesIDo`, `noIDont`, `iHaveApples/Bananas/Fish/Berries/Meat`, `noFood`,
`theyreMyFriends`, `yesTheyCan`, `noTheyCant`, `yesICan`, `howManyFish`, `canYouMakeFire`,
`whatDoYouWant`, `hereYouAre`, `iHaveFish`, `onTheTable`, `underTheTable`, `onTheShelf`,
`underTheShelf`, `inTheBox`, `byTheDoor`, `on`, `under`, `turnRight`, `goStraight`, `stopShip`,
`leafyHelp`, `bubboHelp`, `puffHelp`, `whereIsHe`, `weNeedWood`, `threeP` (existing), `putItHere`,
`bubboCanSwim`, `canYouHelp`, `where`.

Reused as they are: `turnLeft`, `look`, `thankYou`, `yesPlease`.

## 8. Budgets

- The ship is ≤ 9k triangles and ≤ 6 draws, drawn only within 120 m of it.
- Pirates are 4 keeper meshes.
- Voyage effects are pooled, with no idle draws. Rain is one instanced batch, drawn only in the storm.
- Raft and wreckage are ≤ 2k triangles.
- Ship views stay within the lowland budget (≤ 110 calls with reserve, ≤ 120k triangles).

## 9. Acceptance

**Unit tests:**
- interrogation questions and answers are truthful for empty, partial and full bags;
- the preposition evaluator covers every slot, wrong placements and "Where is" answers;
- jobs can be completed in any order and complete the stage;
- save and reload at every stage, with no duplicate food loss or hat, and `voyageDone` precedence;
- the release lock: no voyage while Cloud Isle is locked;
- collision and heights of the ship;
- ship budget.

**e2e** (`pirate-voyage.spec.ts`, ship opened via the e2e hook, Tap mode): depart → capture →
interrogation → monsters → the four jobs in a non-default order → storm → raft → arrival on Cloud Isle,
plus reload checks at `jobs` and `raft`.

**Controller renders at 1366×768:** the departure, capture, deck areas, each job, the storm, the raft and
the landing.

## 10. Implementation order

1. Data, logic and save, phrases, unit tests.
2. Ship region, collision and models, the camera profile, pirates; departure, capture and interrogation.
3. The four jobs.
4. The storm and the break-up.
5. The raft and landing, and the Cloud Isle hand-over.
6. e2e, renders, polish and docs.
