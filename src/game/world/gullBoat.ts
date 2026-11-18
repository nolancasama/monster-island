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
