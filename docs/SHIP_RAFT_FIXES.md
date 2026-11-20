# Pirate ship and raft: 17 fixes (frozen spec, 2026-11-21)

The user's plan "Pirate Ship and Raft: 17 Gameplay and Visual Fixes", reviewed by Claude. Branch
`feature/ship-raft-fixes` from `main` `1073ea0`. Nothing merges to `main` or deploys without the user's approval.
Keep: the story and dialogue order, ESL phrases (`logic/english.ts`), save compatibility (`mi.save.v4`, voyage
checkpoints), the no-shake riding rule (`DESIGN_DECISIONS.md` 2026-11-17), Chromebook budgets.

## Review decisions (accepted, modified, added)

- **1 Ember auto-mount — accepted.** Today the cooking stance only applies when the player happens to stand within
  4.2 m of the stove with Ember active. After "Put it in the pot": `switchTo("ember")`, walk/glide the player to a fixed
  mount spot facing the stove (clear of counter and stove solids), wait until `cb.stance.friend === "ember" && k >= .99`,
  then show "Hold J". The stance holds through the whole heat step; it releases for fetch and serve.
- **5 Combat powers — modified to an audit.** Item 7 (deployed 2026-11-21) already drives the four jobs from the shared
  combat stance and the combat breath/vine/bubble/gust effects. Remaining work is the storm (13) on the same mechanism,
  plus any job gap found in the renders. No second effect system.
- **13 Storm stances — accepted.** Each storm task registers a `stance()` exactly as the jobs do (Leafy backpack for
  barrels and the spar, Bubbo for fires, Puff perched for the torn sail, Ember mounted if fire is used). The pose is
  complete before the tool works; storm dialogue lines release and re-take it the way job dialogue does.
- **2, 3, 4, 6, 7 Hold — accepted as one redesign.** Frozen dimensions below. Bill is a hold-only candidate (requires
  `vy.inHold`; never offered from the deck). The fore mast's foot becomes a pillar in the larger hold.
- **8 Fishing railings — accepted.** Remove rails and their posts; keep the platform walkable by the existing ship
  floor/edge clamp (no visible rail, no new invisible wall beyond the platform edge).
- **9 Grappling hooks — modified.** Pirate figures are one merged mesh with no arm rig, so the throw is a body
  animation (hook raised overhead as a held prop, lean back, lunge) rather than new articulated arms. Three throwers
  (Tom, Sam, Max) at the starboard rail; hooks fly ballistic arcs to three gunwale points of Gull's boat
  (`world/gullBoat.ts`); each rope is drawn only from the thrower's hand to its hook's current position; taut after
  landing; then the existing haul and fade. Redbeard turns to face the boat before his order. ≤ 6 s added.
- **10 Pepper close-up — accepted**, using `flow/closeUp.ts` (`closeUp("pepper")`, then `endCloseUp()` into the
  monsters' frightened reaction).
- **11 Sails out of cutscene cameras — accepted, camera first.** Close-ups already reject sail spans. Add one central
  control: `vy.cutSails` (0..1 target cloth opacity, eased in `scene/PirateShip.tsx`, cloth only, masts and rigging
  stay). It is set by the capture/encirclement/interrogation shots that cannot avoid a sail and is reset by the
  voyage `scene()` wrapper's end, by `resetVoyageRt()` and by load. Sail fullness, storm and quest state untouched.
- **12 Cannon ports — accepted.** Framed rectangular ports cut where each barrel crosses the bulwark (`CANNONS`), both
  sides; no barrel intersects intact planking.
- **14 Storm crew panic — accepted, authored.** Short authored paths per pirate to emergency stations (no random
  wandering), urgent pose/bob, brace on big waves, Pepper at the galley, Redbeard directing. Paths are collision-safe
  and never park on a task target or the player's route. Crew freeze in place during close-ups and dialogue.
- **15 Steering — accepted; root cause found.** The obstacle is always in the current lane or lane 0 and outward turns
  clamp at the edge, so once at lane -1 "Turn left" is always safe; right and straight only look broken. New rule:
  each step is authored with one or two obstacle lanes so exactly one command is safe. Steps (the free lane):
  ship `[-1, 0, 0, 1]` = left, right, straight, right; raft `[1, 0, 0, -1, 0]` = right, left, straight, left, right.
  "Straight" is only ever the answer from lane 0. A wrong answer is a bump, then the step retries from its own start
  lane. Calls name every obstacle in the existing style ("Rocks ahead! A barrel on the left!"). The raft's island
  approach becomes left, straight ("The island is straight ahead!"), right.
- **16 Raft wake — accepted**, reusing `scene/BoatWake.ts` scaled to the raft (smaller than Gull's boat, speed-driven,
  none at rest).
- **17 Raft sail — accepted.** A visible patched cloth on the raft mast, filling with `vy.raft.sail` and Puff's wind.
- **Added: the cut-away shots of issue 4** are judged in motion (descending the stairs), not only stills.

## Frozen hold dimensions (ship-local metres)

- `HOLD`: `x0 -5.9, x1 5.9, z0 -13.2, z1 -1.2` (was `-4.2..4.2, -7.8..-1.2`). Floor `HOLD_Y = SEA_Y - 1.1` (was
  `SEA_Y - 0.5`), so the clear height under the deck beams is ≥ 3.3 m. The stair ramp keeps its deck opening; the stair
  gains steps to the new floor. The fore mast foot at `(-0.75, -10.6)` is a round pillar solid in the hold.
- Furniture is re-laid for the larger room with ≥ 1.2 m walking aisles: shelf (one level only, sturdy, at the port
  wall), table, a box big enough to hold the bottle, the door on the forward bulkhead.
- Cargo ≈ 2× today's size: barrel ~0.9 m tall, sack ~0.8 m, bottle/flagon ~0.8 m (colours and names unchanged).
- Collision, standing heights, hold camera, interaction targets, Bill's spot, lanterns and the saved `inHold` restore
  all use the same constants.

## Slices (each in its own worktree, merged by Claude)

Wave 1 in parallel: **H** hold (2, 3, 4, 6, 7) · **P** powers (1, 5, 13) · **S** steering (15) · **C** cutscenes (9, 10, 11).
Wave 2 after merging: **X** exterior (8, 12) · **K** crew panic (14) · **R** raft wake and sail (16, 17).
Claude captures and judges all rendered evidence (worker sandboxes cannot start a browser).
