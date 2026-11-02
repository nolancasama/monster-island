import * as THREE from "three";

// Ember's smile in emberParts is centred at (0, 1.08, .49).
export const EMBER_MOUTH: [number, number, number] = [0, 1.08, .51];
// Tip of puffParts' beak (centre z=.31, length .1, rotated toward +z).
export const PUFF_BEAK: [number, number, number] = [0, .44, .365];
export const LEAFY_HAND: [number, number, number] = [0, -.24, .03];
export const anchors = {
  emberMouth: new THREE.Vector3(),
  emberMouthValid: false,
  puffBeak: new THREE.Vector3(),
  puffBeakValid: false,
  leafyHandL: new THREE.Vector3(),
  leafyHandR: new THREE.Vector3(),
  leafyHandLValid: false,
  leafyHandRValid: false
};

/** Both fire streams start at the live rig point, without a second pose blend. */
export function fireStreamBase(out: THREE.Vector3): THREE.Vector3 {
  return out.copy(anchors.emberMouth);
}
