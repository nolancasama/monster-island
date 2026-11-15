# Port Town revamp: palisade, town art, clothes shop, combo trainer — frozen spec (2026-11-15)

Source: the user's plan "Port Town area and its town systems" of 2026-11-15. Change this
file only through the controller and record why in `DESIGN_DECISIONS.md`. Work stays on
`feature/port-town-revamp`; merging or deploying needs the user's explicit approval.

## 0. Controller verdict

Accepted as written: wooden palisade instead of the stone wall; a better-looking town
with buildings told apart by purpose; the Treat Kitchen replaced by a funny clothes shop
for the player and the friends (cosmetic or small bonus, visible on the models, saved);
Coach Rex teaches one combo per friend (unlock saved, clear feedback); the four combo
concepts; Ember uses the plan's suggested version (2+ enemies set on fire by one fire
action). Saves stay v4, with additive fields only.

Changed or added, and why:

1. **The treat upgrades move to the trainer; nothing is lost.** Removing the kitchen
   would strand four working upgrades (Double Grab, Big Bubble, Big Wind, Big Flame):
   old saves would keep powers that new players can't get. So each friend's lesson
   teaches its combo **and** its old bigger move. The learned lessons are stored in the
   existing `act2.upgrades` list, so a friend who ate a treat already knows its combo.
   No migration is needed, and an older build reading a new save sees the same upgrades.
2. **A lesson costs 1 amber; clothes cost coins.** Amber's only use was the kitchen. The
   forest chest's amber is guaranteed before the town, so the first lesson is always
   affordable, and the objective step that said "make a treat" now says "learn a combo".
3. **Combos are a bonus layer on events that already exist.** These events are Leafy's
   swung/flung enemy hitting another (`weaponCollisions`), the Double Grab bash, wall
   impacts (`wallImpact`), Bubble Bomb detonation and fire ignition. Base damage, knock
   and timing are unchanged, so combat feels the same until a combo is learned. Added:
   attribution of pushes. A Bubble Bomb knock into a wall is currently credited to Puff
   (`e.flight?.owner ?? "puff"`), so it would wrongly trigger Puff's combo.
4. **Two slots per character, chosen by the item: head and face.** The child never picks
   a slot. Tiny Cape is deferred, because a back attachment has to follow the
   back/shoulder/ride stances. The friends-only Baby Bonnet replaces it.
5. **Bonuses help the whole team while anyone wears the item, and each stat is on
   exactly one item.** There is no stacking math, and who wears what is a fun choice,
   never an optimisation (the HP pool is shared anyway).
6. **No +max HP stat.** `MAX_HP` is a constant used by the HUD, the inn, knock-outs and
   saves. The Knight Helmet's "less ouch" gives the same feeling.
7. **Each item is owned once and worn by one character at a time.** Wearing it on someone
   else moves it. This gives 13 different items to collect.
8. **The clothes shop is optional.** It is not in the objective chain, and Maple
   mentions it once when the party arrives.
9. **The trainer's move monologue and the "practise the command" coins are removed**,
   as the plan asks. The forest tutorial still teaches the moves. `act2.trained` stays in
   the save, unused.
10. **English stays short and spoken where it's cheap.** The clothes shop's first visit
    and every combo lesson use existing spoken phrases (Yes, please. / No, thank you. /
    Thank you.). Tapping an item reads its line aloud ("This is a pirate hat."). Combo
    popups are English sound words (Bonk! Splash x3! Slam! Blaze x2!).
11. **Outfits change only at the shop in this pass** (a field wardrobe is a follow-up).
12. Rejected: duplicates of one item; full-body clothing; in-world 3D combo text (a DOM
    callout costs no GPU); stat items priced in amber (buying one could leave a player
    without amber for the required first lesson).

## 1. Palisade (replaces the stone wall; `scene/models/portWall.ts`)

Keep exactly: `PORT_WALL` and `TOWN_GATE` values, the wall line, its cuts and gate
collision, the tower collider circles (`towerR` 2 at `gx ± (gateHalf + towerR)`), the
door hinge/swing logic and `portDoorGeometry(dir)`'s signature and size. Keep the
`occluderMat` dither fade, the `port-gate` camera, `PORT_WALL_FAR`, and the gate opening
height, which a rider on Ember needs (≥ the current lintel underside). Keep the natural
rock outcrops at both ends. Only the meshes change.

The look is a rough frontier settlement, low-poly and handmade:
- **Vertical sharpened logs** along the wall line. 5–6-sided trunks, 0.40–0.50 m thick
  and touching, with heights varying ±0.3 m around `PORT_WALL.height`. Each has a
  sharpened 5–6-sided tip about 0.6 m long, a slight random lean (≤ 2°), and 3–4 warm
  browns with lighter weathered tips. The logs stand on a low earth/stone footing
  (≈ 0.4 m high), as wide as the collision band, so the wall reads as solid as it
  collides.
- **Cross-bracing on the town side:** two horizontal rails, plus diagonal braces every
  few metres down to the ground. Add rope lashing bands on some logs on the coast face.
- **Two timber watchtowers** at the tower circles. Each has 4 thick corner posts, a plank
  platform at ≈ 5 m with a waist-high rail, and a small pitched roof (peak ≈ 7.5 m, close
  to the old tower silhouette so the landmark stays). Add one small flag or bell.
- **Gate:** a heavy log lintel beam at the old lintel height. A hanging wooden sign reads
  **PORT TOWN** (an English word to read; add it to the town sign atlas). Two torches on
  posts flank the opening, with flat bright flame colours and no lights.
- **Doors** (`portDoorGeometry`): vertical planks with two horizontal battens and one
  diagonal Z-brace. Use pegs/rope or a little dark iron for hinges, at the same size and
  pivot.
- The gate flagstone road may become packed earth with a few stones.

## 2. Town buildings and props (`townGeometry`, `townSigns`, NPC look)

Design for the fixed cameras. The lowland camera looks south (−z) from about 10 m back
at pitch .55, and `port-gate` uses pitch .85 near the wall. So the **roofs and
north-facing walls fill most of the view**, while the plaza-facing fronts (the west row
faces +x, the east row −x) are seen at a glancing angle. Put shop identity on roofs,
colours, rooftop/blade signs and props near the counters.

Keep exactly: the `SERVICES` house footprints and keeper spots, the `HOUSES` footprints,
the fountain, the quay, the pier and every walking route. Building walls stand on their
footprints; roof overhangs (≈ 0.3–0.4 m) may extend past them overhead. Props hug walls
(≤ 1 m out). They never stand on a route, at a door, between a keeper and the player's
approach, or in the plaza's open middle. Nothing may look walkable-through but be solid,
or look solid but be walkable-through.

Every building gets:
- a **gable roof** (two slabs, ridge beam, gable ends, overhang; some roofs steeper or
  taller for silhouette variety);
- a **timber frame** (dark corner posts and a beam band) on a stone footing;
- **shutters** beside the windows;
- **flower boxes or greenery** where they fit;
- **a chimney** on some buildings.

Use clean colour separation: each service keeps its own roof/trim colour.

Per building:
- **Food Market** (west, north): a red/white striped awning over the counter; open
  crates of food in the food colours (apples, bananas, fish, berries, meat); baskets and
  a barrel.
- **Clothes Shop** (east, north; formerly the kitchen): pink/purple with a pink/white
  awning. A **giant top hat with a bow on the roof** is the landmark. A short line of
  colourful hanging cloth or bunting runs along the front. A hat stand with 2–3 hats
  stands by the counter. The sign reads **CLOTHES SHOP**.
- **Monster Trainer** (west, south): blue/yellow. A **training yard** in front: a
  sand-coloured ground patch, 2 straw practice dummies and a ring target board, all
  within 1 m of the walls, plus short fence posts at the yard's corners only. Keep the
  sign MONSTER TRAINER.
- **Seaside Inn** (east, south): two storeys (keep h 4.4) with a timber band between
  floors, lanterns by the door, flower boxes, a bench, and a hanging moon sign. Keep the
  sign SEASIDE INN.
- **Harbor Office** (south-west): navy/white with an anchor emblem, rope coils, barrels
  and a ship's bell on a post (the flag pole stays). Keep the sign HARBOR OFFICE.
- **The three houses:** varied roof pitch, height and colours. One has a dormer and one
  a chimney.
- **Plaza and quay:** a few barrels and crates against walls and on the quay. Keep lamps
  and the fountain, and optionally add a ring of flat stones around the fountain.
- **Ms. Button** (the clothes seller; NPC id `tailor`): a tall purple top hat with a big
  bow, a measuring tape around the neck and a pink outfit. The 3D model
  (`npcGeometry`) and the portrait (`ui/Portraits.tsx`) must match. Retire the chef hat
  if nothing else uses it.

Signs must be readable at 1366×768 from the town cameras. They stay one atlas and one
draw. Blade signs facing north (toward the camera) are allowed.

Performance (as built, 2026-11-15).

The town mesh had no draw distance. Its 2,654 triangles counted in the far forest views,
and the forest base view had only 30 triangles left under its cap. So the town is now two
merged meshes (`scene/models/town.ts`):
- The **base** holds the volumes, gable roofs, chimneys, the giant hat, the quay, the pier,
  the boat and the lighthouse. It is drawn at any distance and is down to **1,620**
  triangles, so far views gained margin.
- The **detail** holds the frames, windows, shutters, flower boxes, awnings, props, lamps,
  the fountain, the counters and the sign boards. It is **9,376** triangles, drawn within
  `TOWN_DETAIL_FAR` of its bounds: the coast, causeway and town views only.

The cost is one extra draw call, and only near the town. Measured view totals: port
39.1k, coast 63.2k, causeway 68.9k, all under the 120k cap. The palisade stays under the
wall test's 8,000-triangle cap and is still drawn within `PORT_WALL_FAR`. Every view in
`src/scene/lowland-budget.test.ts` and `src/game/world/portWall.test.ts` passes.

## 3. Clothes shop and wearables

### 3.1 Catalog (`src/game/data/wearables.ts`)

| id | name (en / ja) | slot | who | coins | stat | line |
|---|---|---|---|---|---|---|
| partyHat | Party Hat / パーティーハット | head | everyone | 10 | — | This is a party hat. |
| bigBow | Big Bow / おおきな リボン | head | everyone | 15 | — | This is a big bow. |
| flowerCrown | Flower Crown / はなの かんむり | head | everyone | 15 | — | This is a flower crown. |
| babyBonnet | Baby Bonnet / あかちゃんの ぼうし | head | friends | 15 | — | This is a baby bonnet. |
| bandana | Bandana / バンダナ | head | everyone | 30 | power | This is a bandana. |
| explorerHat | Explorer Hat / たんけんの ぼうし | head | player | 35 | speed | This is an explorer hat. |
| pirateHat | Pirate Hat / かいぞくの ぼうし | head | everyone | 40 | coins | This is a pirate hat. |
| knightHelmet | Knight Helmet / きしの かぶと | head | everyone | 45 | defense | This is a knight helmet. |
| crown | Crown / おうかん | head | everyone | 100 | combo | This is a crown. |
| mustache | Funny Mustache / おもしろい ひげ | face | everyone | 10 | — | This is a funny mustache. |
| sunglasses | Sunglasses / サングラス | face | everyone | 20 | — | These are sunglasses. |
| heartGlasses | Heart Glasses / ハートの めがね | face | everyone | 20 | — | These are heart glasses. |
| goggles | Goggles / ゴーグル | face | everyone | 30 | push | These are goggles. |

Data also holds 2–3 colours per item, shared by the 3D model and the icon. The Knight
Helmet is cute: a round dome, a visor slit and a big feather plume.

### 3.2 Bonuses (team-wide while the item is worn by anyone)

| stat | effect | blurb (en / ja) |
|---|---|---|
| power | +10% damage dealt by friends (base and combo) | Stronger hits! / こうげき アップ! |
| push | +25% knock-back speed from friends' moves | Bigger push! / ふきとばし アップ! |
| speed | +8% player move speed (walking and riding) | Walk faster! / あしが はやく なる! |
| defense | −20% damage from enemy attacks (rounded, min 1; falls unchanged) | Less ouch! / ダメージ ダウン! |
| coins | +1 coin per coin pickup | More coins! / コインが ふえる! |
| combo | +50% combo bonus damage | Bigger combos! / コンボ アップ! |
| none | — | Just for fun! / おしゃれ だけ! |

### 3.3 Rules (pure, `src/game/logic/wardrobe.ts`)

- An item is bought once (coins only) and is owned forever.
- `who`: `everyone` = the player or any friend; `player` = the player only; `friends` =
  any friend only. Friends must be the player's friends (`p.monsters[id].friend`), and
  Lumo never wears anything.
- Each wearer (`player | leafy | bubbo | puff | ember`) wears ≤ 1 item per slot.
  Wearing an item replaces that wearer's item in the same slot (the old one stays
  owned) and moves the item off anyone else wearing it.
- Taking an item off keeps it owned.
- The bonus counts only while the item is worn.

### 3.4 Shop flow (`src/game/flow/clothes.ts`) and English

- **First visit** (`!wardrobe.visited`):
  - Ms. Button says "Welcome! I'm Ms. Button." / 「ようこそ! わたしは ボタンさん。」
  - then "I have funny hats and glasses!" / 「おもしろい ぼうしと めがねが あるよ!」
  - then asks "Do you want a hat?" as a choice: Yes, please. / No, thank you. (speech or
    tap, cancellable). Any answer marks `visited`.
  - No → "OK. See you!" / 「わかった。またね!」.
  - Yes → open the panel.
- **Later visits:** "Hello again! Look at my hats!" / 「また きてくれたね! ぼうしを
  みてね!」 → panel.
- **Panel** (`src/ui/ClothesPanel.tsx`): a grid of item cards. Each card shows the
  icon, English name, blurb and price, or its state (Owned / Worn by ⟨portrait⟩).
  - Tapping a card speaks its line (TTS, non-blocking).
  - Buy, if not enough coins: the error sound, the toast "Not enough coins!" / 「コインが
    たりない!」 and nothing else.
  - Buy, if affordable: the buy sound, the coins go, the TTS "Who will wear it?" and a
    who-picker. The picker shows only allowed wearers: "Me" (the player's portrait)
    plus friend portraits, and "Not now" (the item stays owned, not worn).
  - Picking a wearer: wear it, TTS "Great choice!", a sparkle on the wearer and a happy
    pose (friends use the existing friend/excited animation).
  - Owned cards show Wear (opens the picker) and, when worn, Take off.
  - The panel stays open for more shopping. Close and Esc close it.
- Fit: 1366×768 first, then 1280×800, with no scrolling of the page. The grid may
  scroll inside the modal. Touch targets ≥ 44 px.
- Icons are inline SVG in the style of `ui/icons.tsx`, with no emoji and no external
  assets.

### 3.5 Visible wearables (`src/scene/models/wearables.ts`, `Characters.tsx`, `Monsters.tsx`)

- One low-poly geometry per item, ≤ 300 triangles, with vertex colours and the shared
  flat material. Head items have their origin at the top-of-head anchor; face items at
  the eye centre, facing +z.
- Each wearer has two anchors (`head`, `face`): a position, scale and slight tilt in the
  character's local frame. The player's anchors sit in the posed body group; a friend's
  in the group that carries its body and eyes, so items follow bobbing, squash and the
  back/shoulder/ride stances. Hats sit on top with a slight jaunty tilt; face items sit
  on the eyes and just in front of them.
- **Each character's worn items merge into one mesh** (≤ 1 extra draw per character),
  rebuilt only when that outfit changes.
- When the player wears a head item, the built-in cap is hidden (a body geometry variant
  without the cap). With no head item the cap is back.
- Items appear everywhere the character is drawn (town, forests, rides, Cloud Isle).
  They never appear on Lumo or on NPCs.

## 4. Combo trainer and combos

### 4.1 Data (`src/game/data/combos.ts`)

| friend | kind | name (en / ja) | call | rule (en / ja) | extra (en / ja) | colour |
|---|---|---|---|---|---|---|
| leafy | bonk | Bonk Combo / ボンク コンボ | Bonk! | Leafy combo! Hit one enemy into another enemy! / リーフィの コンボ! てきを べつの てきに ぶつけよう! | Leafy can grab two enemies, too! / リーフィは てきを 2ひき つかめるよ! | #5fd35a |
| bubbo | splash | Splash Combo / スプラッシュ コンボ | Splash! | Bubbo combo! Hit many enemies at the same time! / バボの コンボ! いちどに たくさんの てきに あてよう! | Bubbo can lift bigger enemies, too! / バボは おおきな てきも あわで うかせるよ! | #4fc3ff |
| puff | slam | Slam Combo / スラム コンボ | Slam! | Puff combo! Push enemies into walls! / パフの コンボ! てきを かべに ぶつけよう! | Puff's wind gets bigger, too! / パフの かぜが おおきく なるよ! | #eef3ff |
| ember | blaze | Blaze Combo / ブレイズ コンボ | Blaze! | Ember combo! Burn many enemies! / エンバーの コンボ! たくさんの てきを もやそう! | Ember's fire gets bigger, too! / エンバーの ほのおが おおきく なるよ! | #ffb02e |

Each lesson costs 1 amber.

Tuning (`COMBO_TUNING`, the only place these numbers live):
- bonk: `{ struck: 8, thrown: 4, stun: 0.8 }`
- splash: `{ min: 2, each: 6, stun: 0.6 }`
- slam: `{ minSpeed: 3, damage: 10, stun: 1.0, bounce: 2.5 }`
- blaze: `{ min: 2, flare: 8, extend: 1 }`

### 4.2 Learning

`learnCombo(p, friend)` fails with `known`, `friend` (not a friend) or `amber` (< 1).
Otherwise it removes 1 amber and appends the friend to `act2.upgrades`.
`knowsCombo(p, f)` is `upgrades.includes(f)`. The existing `upgraded()` checks in
combat keep granting the bigger moves, unchanged.

### 4.3 Trainer flow (`src/game/flow/trainer.ts`) and English

- Rex: "Hi! I'm Coach Rex. I teach monster combos!" / 「やあ! コーチの レックスだ。
  モンスターの コンボを おしえるぞ!」 → the combo panel.
- If every friend knows its combo, Rex says "Your friends know every combo. Great job!"
  / 「ともだちは みんな コンボを しってるね。すごい!」 first.
- **Panel** (`src/ui/ComboPanel.tsx`): one row per friend the player has. Each row shows
  the portrait, the combo name, the rule, the extra and its cost (1 amber icon), with a
  **Learn** button or a **Learned!** badge. Close and Esc close it.
- **Learn** closes the panel, and then:
  1. Rex says the rule, then the extra.
  2. He asks "Do you want to learn it? It's one amber." / 「ならう? こはく 1こ だよ。」 as a
     choice: Yes, please. / No, thank you. (speech or tap, cancellable).
  3. No → "OK! Come back any time!" / 「わかった! いつでも おいで!」.
  4. Yes without amber → "Sorry! You need one amber. Look in treasure chests!" /
     「ごめんね! こはくが 1こ いるよ。たからばこを さがそう!」.
  5. Yes and learned: the friend poofs next to the player if far, plays its power
     animation with a sparkle and an excited voice, and the "learned" sound plays. The
     banner shows `"<Friend> learned <Combo>!"` with the rule as its sub-line. Rex:
     "Great! Try it in a fight!" / 「いいね! たたかいで ためして みよう!」, then a "Thank
     you." command ask (like the old kitchen).

### 4.4 Combo rules (`src/game/combat.ts`). Each fires only if that friend knows its combo

- **Bonk (Leafy).**
  - Trigger: a swung or flung enemy whose `flight.owner === "leafy"` registers a **new**
    victim in `weaponCollisions`, or a Double Grab bash completes (each of the two counts
    as struck).
  - Bonus: the struck enemy takes +`struck` damage and a `stun` second stun (heavies
    follow the existing resistance rules), and the thrown enemy takes +`thrown`.
  - One callout per throw that counts its victims ("Bonk!", "Bonk x2!").
- **Splash (Bubbo).**
  - Trigger: one Bubble Bomb detonation damages ≥ `min` distinct enemies (the direct
    radius plus bubble-chain victims).
  - Bonus: each of them takes +`each` and a `stun` second stagger.
  - Feedback: a bigger splash (×1.4) and "Splash x⟨n⟩!".
- **Slam (Puff).**
  - Trigger: an enemy whose current push was started by Puff (Wind Blast fling, Cyclone
    carry or release) is stopped by a solid or a bank in the `wallImpact` path, at speed
    > `minSpeed`.
  - Bonus: +`damage`, and a `stun` second stun (replacing the base 0.6 s). It bounces
    back `bounce` m/s away from the wall. At most once per push.
  - Feedback: a dust-puff ring and "Slam!".
  - Pushes record their owner and expiry on the enemy (Puff, Bubbo's bomb knock, Leafy's
    fling, the weapon knock's flight owner). `wallImpact` reads that instead of
    `?? "puff"`. Leafy's swing-wall contact (the existing 8) is never a Slam.
- **Blaze (Ember).**
  - One fire action is one held Fire Breath stream (press to release) or one Inferno.
    Count distinct enemies the action ignites or re-ignites (water blocks ignition, and
    those don't count).
  - When the `min`-th is reached, every enemy counted so far gets a flare: +`flare`
    damage, burn extended `extend` s and a golden flare burst. Each further enemy the
    same action ignites gets the flare as it ignites.
  - The callout is "Blaze x⟨n⟩!" (updated, not stacked).
- **Damage order.** Combo bonus damage × (1 + combo stat), then × (1 + power stat),
  rounded, min 1. It goes through the normal `hit()` path, so knock-outs, rewards and
  hit reactions behave normally.

### 4.5 Feedback (shared)

- **Callout:** a DOM overlay projected from the impact point (like the floating "E Talk
  to" prompt).
  - Big bold text ≥ 28 px at 1366×768, in the friend's colour with a dark outline.
  - Rises and fades over ≈ 0.9 s.
  - At most 3 visible at once (the oldest is replaced).
  - Text is English only.
- **Burst:** a new pooled effect kind `combo` in the friend's colour (a ring plus a star
  burst, ≈ 0.5 s). Puff's slam uses a white dust ring; Ember's flare is golden. It adds
  no draw calls when idle.
- **Sound:** a short synthesized "combo" sting, plus a per-kind accent (bonk/thud/splash/
  whoosh) in `audio/audio.ts`. Respect the existing audio caps.
- **Test surface:** `cb` keeps the last 8 combo events `{ kind, t, n, x, z }`, exposed in
  the e2e snapshot as `act2.combos`.

### 4.6 Stat hooks (`src/game/combat.ts`)

`wardrobeBonus(progress)` is computed once per progress change, not per hit. Apply it in
`hit()` (power), at knock-velocity sites (push: the Puff blast, the bomb knock, the
weapon knock and Leafy's fling speed), in `speedScale()` (speed), in `hurtPlayer()`
(defense) and in coin `collect()` (coins).

## 5. Save data (v4, additive)

- `act2.wardrobe` (**new**): `{ owned: WearableId[]; worn: Partial<Record<Wearer,
  Partial<Record<WearSlot, WearableId>>>>; visited: boolean }`. It is read only once
  `portFound` (otherwise fresh) and re-validated. Unknown ids are dropped, and duplicate
  owned ids collapse. A worn item must be owned, in its own slot, allowed for its wearer
  (the wearer a friend), and worn by one wearer only (the first in `WEARERS` order
  keeps it).
- `act2.upgrades` (existing, unchanged format) now means **learned lessons** (combo plus
  bigger move). Saves whose friends ate treats keep them as learned combos.
- `act2.trained` (existing): retired. It is still read and written, but nothing uses it.
- No new storage key and no version bump. Older builds ignore `wardrobe`.

## 6. Text, objective and other call sites

- `ServiceId` `kitchen` → `clothes` (`SERVICES.clothes`, name Clothes Shop / ふくの
  おみせ, same footprint and keeper). `NpcId` `cook` → `tailor` (Ms. Button, service
  `clothes`, voice pitch 1.2 rate 0.92). Update `NPC_OF`, the focus prompt (`Buy
  clothes`), debug travel targets, i18n, the sign label CLOTHES SHOP and the e2e
  helpers.
- Objective `{ id: "kitchen" }` → `{ id: "trainer" }`, with the same condition (no
  lesson learned yet). Text: "Learn a combo from Coach Rex" / 「コーチ・レックスに コンボを
  ならおう」. Story hint: "Learn a combo from the trainer!" / 「トレーナーで コンボを
  ならおう!」.
- Maple's arrival lines become:
  1. "You made it! I came by boat."
  2. "Let's get ready. Buy food at the market."
  3. "Then learn a combo from Coach Rex."
  4. "Look! You can buy fun hats, too!"
  5. "Then ask at the harbor office: Where is the ship?"

  Use easy Japanese like the existing lines.
- Amber pickup toast (ja): 「こはくを みつけた! コンボを ならうのに つかうよ」.
- Remove the kitchen flow, `RECIPES`, `craft`, `craftMissing`, `practise`,
  `practiseCommand`, the old trainer panel and the mix/command phrases. Keep anything
  still used elsewhere: check with grep before deleting.

## 7. Budgets

- Town and wall: §2.
- Wearables: ≤ 300 triangles per item and ≤ 1 extra draw per dressed character.
- Combo effects: no idle draws; the callout is DOM.
- Unit tests must not need new snapshots of unrelated areas.

## 8. Implementation order and where things live

By the user's instruction (2026-11-15, "no router, do it yourself") the controller
implements every part directly, in this order, on one branch. The list below is the map
of which files each part owns.

- **0. Foundations.**
  - New files: `data/wearables.ts`, `data/combos.ts`, `logic/wardrobe.ts` (+ tests), and
    the stubs `flow/clothes.ts`, `flow/trainer.ts`, `ui/ClothesPanel.tsx`,
    `ui/ComboPanel.tsx`.
  - The §6 renames, removals and text.
  - `logic/act2.ts` (`learnCombo`, `knowsCombo`, objective, `wardrobe` in `Act2`).
  - `logic/save.ts`, the store panel union, `ui/Act2Hud.tsx` (mount the stub panels).
  - Unit test updates; e2e specs made to compile without the removed APIs.
- **A. Town art.** `scene/models/portWall.ts`; the town/NPC code in
  `scene/models/lowland.ts` (it may move into a new `scene/models/town.ts`);
  `scene/Lowland.tsx` (town wiring only); `data/town.ts` (NPC look); `ui/Portraits.tsx`
  (NPC hats); decorative prop data in `world/lowland.ts` (no collision changes); new
  `tests/e2e/zz-town-shots.spec.ts`.
- **B. Wardrobe.** `flow/clothes.ts`, `ui/ClothesPanel.tsx`, new `ui/Clothes.css`, new
  `ui/wearIcons.tsx`, new `scene/models/wearables.ts`, `scene/Characters.tsx`,
  `scene/Monsters.tsx`, `scene/models/people.ts` (cap-less variant), new
  `scene/wearables.test.ts`, new `tests/e2e/zz-wardrobe-shots.spec.ts`.
- **C. Combos.** `game/combat.ts`, `flow/trainer.ts`, `ui/ComboPanel.tsx`, new
  `ui/Combo.css`, new `ui/ComboCallout.tsx` (mounted in `ui/Act2Hud.tsx`),
  `scene/ElementEffects.tsx`, `audio/audio.ts`, `game/e2e.ts`, `game/combat.test.ts`,
  new `tests/e2e/combos.spec.ts` and `tests/e2e/zz-combo-shots.spec.ts`.
- **D. Integration.** Merge A–C. Rewrite the `act2.spec.ts` town test (market → combo
  lesson → clothes purchase and wear → inn → harbour). Run the targeted e2e specs and
  record state and decisions.

## 9. Acceptance

- `npx tsc --noEmit`, `npm test` and `npm run build` pass in every slice.
- Unit tests cover:
  - wardrobe rules and save validation (bad ids, worn-not-owned, wrong slot/wearer,
    duplicates, non-friend wearer, pre-port save);
  - `learnCombo` (amber spent, known, non-friend), and that an old save with
    `upgrades` knows those combos;
  - the objective step;
  - each combo's positive case and its negative cases (not learned; a bomb hitting one
    enemy; a bomb knock into a wall is not a Slam; a slow push is not a Slam; a single
    ignition is not a Blaze);
  - every stat hook.
- The controller judges renders at 1366×768 (and the panels at 1280×800):
  - the palisade from the coast and from inside;
  - the gate open and closed;
  - the plaza; each shop;
  - the clothes panel and who-picker;
  - the player and every friend wearing head plus face items in town, and in their
    back/shoulder/ride stances;
  - each combo's callout and burst;
  - the combo panel.

  Visual work is accepted only from the rendered result.
