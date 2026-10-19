# Design Decisions

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
