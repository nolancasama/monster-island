import { MathUtils, type Vector3 } from "three";
import { HOLD, HOLD_CEILING_Y, HOLD_ENTRY, HOLD_RAMP, HOLD_STAIRS, SHIP } from "../game/world/pirateShip";
import type { Framing } from "./cameraProfiles";

const { clamp, lerp, smoothstep } = MathUtils;

/** Writes the follow pose. The return value blends the deck FOV into the hold FOV. */
export function holdFollowPose(
  player: Readonly<{ x: number; y: number; z: number }>,
  inside: boolean,
  deck: Framing,
  lens: Vector3,
  target: Vector3,
): number | null {
  const x = player.x - SHIP.x, z = player.z - SHIP.z;
  const ramp = HOLD_RAMP;
  const onStairs = x >= ramp.x0 && x <= ramp.x1 && z >= ramp.z0 && z <= ramp.z1;
  const halfWidth = (ramp.x1 - ramp.x0) / 2;
  const aligned = 1 - smoothstep(Math.abs(x - HOLD_ENTRY.x), halfWidth - 0.33, halfWidth - 0.1);
  const approach = z >= ramp.z1 ? aligned * (1 - smoothstep(z, ramp.z1 + 0.2, ramp.z1 + 1.7)) : 0;
  if (!inside && !onStairs && approach === 0) return null;

  // The lens follows its own point on the slope, behind the avatar and at
  // the same x. This pose is independent of which floor owns the player.
  const stairZ = z + 1.9;
  const stairY = HOLD_STAIRS.floorY(stairZ) + 1.45;
  if (onStairs) {
    lens.set(player.x, stairY, SHIP.z + stairZ);
    target.set(player.x, player.y + 0.92, player.z);
    return 1;
  }
  if (!inside) {
    const deckZ = z + deck.dist * Math.cos(deck.pitch) - deck.ahead;
    const deckY = player.y + 1.1 + deck.dist * Math.sin(deck.pitch);
    lens.set(player.x, lerp(deckY, stairY, approach), SHIP.z + lerp(deckZ, stairZ, approach));
    target.set(player.x, player.y + lerp(1.1, 0.92, approach), player.z - deck.ahead * (1 - approach));
    return approach;
  }

  const aftLimit = HOLD.z1 - 0.3;
  const roomZ = clamp(z + 4.1, HOLD.z0 + 0.3, aftLimit);
  const roomY = HOLD_CEILING_Y - 0.26;
  const stair = aligned * (1 - smoothstep(HOLD.z1 - z, 0.2, 1.65));
  const lensZ = lerp(roomZ, stairZ, stair);
  // While looking through the doorway, keep the lens above the stair track.
  // In the room, move toward the aisle when the aft wall shortens the view.
  const aisle = (1 - smoothstep(roomZ - z, 0.25, 1.5)) * (1 - aligned);
  const roomX = lerp(x, 0, 0.35 * aisle);
  const lensX = lensZ > aftLimit
    ? clamp(lerp(roomX, x, stair), ramp.x0 + 0.1, ramp.x1 - 0.1)
    : clamp(roomX, HOLD.x0 + 0.3, HOLD.x1 - 0.3);
  lens.set(SHIP.x + lensX, lerp(roomY, stairY, stair), SHIP.z + lensZ);
  target.set(player.x, Math.min(player.y + 0.92, HOLD_CEILING_Y - 0.14), player.z);
  return 1;
}
