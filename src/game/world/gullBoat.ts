/**
 * Captain Gull's boat: one set of dimensions for its model (scene/CloudIsle
 * `CloudBoat`), its passengers (flow/act3 `boatPose`), its berths and its
 * clearance from the pirate ship (flow/voyage). Local frame: +z is the bow,
 * +x is starboard when the boat faces +z, y = 0 is the waterline origin.
 *
 * 2026-11-19: 1.33× the first boat in every direction (passengers clipped
 * through the rails), proportions kept.
 */
export const BOAT_SCALE = 1.33;
/** The deck's top surface: where everyone aboard stands. */
export const BOAT_DECK_Y = 0.75 * BOAT_SCALE;
/** The hull's widest half-width at the gunwale (outside face). */
export const BOAT_HALF_BEAM = 1.56 * BOAT_SCALE;
/** Half the hull's length, bow tip to stern tip. */
export const BOAT_HALF_LENGTH = 3.6 * BOAT_SCALE;
/** The open deck inside the rails (inner faces): every body stays within it. */
export const BOAT_INNER = { halfX: 1.25 * BOAT_SCALE, halfZ: 2.6 * BOAT_SCALE } as const;
/** The mast's foot (round solid on deck). */
export const BOAT_MAST = { x: 0, z: -0.1 * BOAT_SCALE, r: 0.12 * BOAT_SCALE } as const;

export const BOAT_HULL_BOTTOM_Y = -0.3 * BOAT_SCALE;
export const BOAT_HULL_TOP_Y = 0.6 * BOAT_SCALE;
export const BOAT_RAIL = { width: 0.1 * BOAT_SCALE, height: 0.5 * BOAT_SCALE } as const;
export const BOAT_RIG = {
  mastTopRadius: 0.09 * BOAT_SCALE,
  mastHeight: 6 * BOAT_SCALE,
  yardWidth: 3.6 * BOAT_SCALE,
  yardThickness: 0.1 * BOAT_SCALE,
  yardY: 6.5 * BOAT_SCALE,
  sailWidth: 3.4 * BOAT_SCALE,
  sailHeight: 4 * BOAT_SCALE,
  sailY: 6.4 * BOAT_SCALE,
} as const;

export const BOAT_SEATS = {
  gull: { x: 0.25, z: 2.95, yaw: 0 },
  player: { x: 1.2, z: -0.65, yaw: 0 },
  leafy: { x: 0.9, z: 2.1, yaw: 0 },
  bubbo: { x: -0.6, z: 1.75, yaw: 0 },
  puff: { x: 0.8, z: 0.6, yaw: 0 },
  ember: { x: -0.15, z: -1.95, yaw: 0 },
} as const;

export function boatSeatWorld(id: keyof typeof BOAT_SEATS, boat: { x: number; z: number; yaw: number }) {
  const seat = BOAT_SEATS[id];
  const cos = Math.cos(boat.yaw), sin = Math.sin(boat.yaw);
  return {
    x: boat.x + seat.x * cos + seat.z * sin,
    z: boat.z - seat.x * sin + seat.z * cos,
    yaw: boat.yaw + seat.yaw,
  };
}
