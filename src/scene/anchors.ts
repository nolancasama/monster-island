import * as THREE from "three";

// Ember's smile in emberParts is centred at (0, 1.08, .49).
export const EMBER_MOUTH: [number, number, number] = [0, 1.08, .51];
export const anchors = {
  emberMouth: new THREE.Vector3(),
  emberMouthValid: false
};

/** Both fire streams start at the live rig point, without a second pose blend. */
export function fireStreamBase(out: THREE.Vector3): THREE.Vector3 {
  return out.copy(anchors.emberMouth);
}
