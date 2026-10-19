import * as THREE from "three";

/**
 * Shared materials. Everything is vertex-coloured Lambert: cheap on
 * Chromebooks, and flat shading gives the faceted low-poly look for free
 * (normals come from screen-space derivatives, so animated meshes need no
 * normal updates).
 */

export const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const smoothMat = new THREE.MeshLambertMaterial({ vertexColors: true });

const losUniforms = {
  targetView: { value: new THREE.Vector3() },
  radius: { value: 0 }
};

/**
 * Shared world material with a screen-door opening around the camera-to-player
 * line. Keeping the effect in one material means instanced and merged scenery
 * can clear the view without being split into extra draw calls.
 */
export const occluderMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
occluderMat.onBeforeCompile = (shader) => {
  shader.uniforms.uLosTargetView = losUniforms.targetView;
  shader.uniforms.uLosRadius = losUniforms.radius;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
uniform vec3 uLosTargetView;
uniform float uLosRadius;`
    )
    .replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
if (uLosRadius > 0.0) {
  vec3 losPoint = -vViewPosition;
  float cameraDistance = length(losPoint);
  float losLengthSq = max(dot(uLosTargetView, uLosTargetView), 0.0001);
  float losAlong = dot(losPoint, uLosTargetView) / losLengthSq;
  vec3 losNearest = uLosTargetView * clamp(losAlong, 0.0, 1.0);
  float losDistance = length(losPoint - losNearest);
  // Scenery right in front of the lens (a palm the camera swung into) dissolves.
  float visibility = smoothstep(3.4, 5.4, cameraDistance);
  if (losAlong > -0.04 && losAlong < 1.04) {
    // A cone, not a cylinder: narrow near the camera, full width at the player,
    // so the opening on screen stays about the player's size instead of a
    // large ring cut through every canopy along the way. The soft edge keeps
    // it from reading as a hard-edged bubble.
    float losRadius = uLosRadius * mix(0.2, 1.0, clamp(losAlong, 0.0, 1.0));
    float capsuleVisibility = smoothstep(losRadius * 0.5, losRadius, losDistance);
    visibility = min(visibility, capsuleVisibility);
  }
  if (visibility <= 0.0) discard;
  if (visibility < 1.0) {
    float screenDoor = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
    if (screenDoor > visibility) discard;
  }
}`
    );
};
occluderMat.customProgramCacheKey = () => "line-of-sight-screen-door-v4";

/** Update the shared line-of-sight capsule after the follow camera has moved. */
export function updateOccluderFade(camera: THREE.Camera, target: THREE.Vector3, enabled: boolean): void {
  losUniforms.radius.value = enabled ? 1.55 : 0;
  if (!enabled) return;
  camera.updateMatrixWorld(true);
  losUniforms.targetView.value.copy(target).applyMatrix4(camera.matrixWorldInverse);
}

let glow: THREE.CanvasTexture | null = null;
/** Soft radial dot (beacons, embers, blob shadows, sparkles). */
export function glowTexture(): THREE.CanvasTexture {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

export function shadowMaterial(opacity = 0.32): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#3a2a10", transparent: true, opacity, depthWrite: false });
}

export function additiveSprite(color: THREE.ColorRepresentation, opacity = 1): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: glowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

/** The forest sign's painted text. */
export function signTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d79c58";
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = "rgba(90,50,20,0.35)";
  g.lineWidth = 3;
  for (let y = 18; y < 96; y += 26) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y + 4);
    g.stroke();
  }
  g.fillStyle = "#4a2a12";
  g.font = "bold 46px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("FOREST →", 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
