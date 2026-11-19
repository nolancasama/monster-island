import * as THREE from "three";

/** Material variants scoped to the home group. Many originals are shared by the vessels. */
export function islandHazeMaterials() {
  const factor = { value: 0 };
  // The sky dome's own gradient (Environment SkyAndLights), so the island
  // melts into exactly the sky behind each pixel.
  const horizon = { value: new THREE.Color("#cdeeff") };
  const top = { value: new THREE.Color("#3f97ea") };
  const invProjection = { value: new THREE.Matrix4() };
  const cameraWorld = { value: new THREE.Matrix4() };
  const resolution = { value: new THREE.Vector2(1, 1) };
  const variants = new Map<THREE.Material, THREE.Material>();
  type DrawObject = THREE.Mesh | THREE.Sprite;
  const bindings = new Map<DrawObject, { original: DrawObject["material"]; hazy: DrawObject["material"] }>();

  function variant(original: THREE.Material) {
    const cached = variants.get(original);
    if (cached) return cached;
    const hazy = original.clone();
    hazy.customProgramCacheKey = () => original.customProgramCacheKey() + "-island-haze";
    hazy.onBeforeCompile = (shader, renderer) => {
      original.onBeforeCompile(shader, renderer);
      shader.uniforms.uIslandHaze = factor;
      shader.uniforms.uIslandHorizon = horizon;
      shader.uniforms.uIslandTop = top;
      shader.uniforms.uIslandInvProjection = invProjection;
      shader.uniforms.uIslandCameraWorld = cameraWorld;
      shader.uniforms.uIslandResolution = resolution;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
uniform float uIslandHaze;
uniform vec3 uIslandHorizon;
uniform vec3 uIslandTop;
uniform mat4 uIslandInvProjection;
uniform mat4 uIslandCameraWorld;
uniform vec2 uIslandResolution;`)
        // After the fog, in output colour space: the scene fog would otherwise
        // turn the island back into a pale fog-coloured silhouette.
        .replace("#include <fog_fragment>", `#include <fog_fragment>
{
  // The sky dome's colour along this pixel's view ray (same curve as its vertex colours).
  vec4 ray = uIslandInvProjection * vec4(gl_FragCoord.xy / uIslandResolution * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(mat3(uIslandCameraWorld) * (ray.xyz / ray.w));
  vec3 skyHere = mix(uIslandHorizon, uIslandTop, pow(min(1.0, max(0.0, dir.y) * 1.7), 0.7));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(skyHere, 1.0)).rgb, smoothstep(0.0, 1.0, uIslandHaze));
}`);
    };
    variants.set(original, hazy);
    return hazy;
  }

  function restore() {
    for (const [object, { original, hazy }] of bindings) {
      if (object.material === hazy) object.material = original;
    }
    bindings.clear();
  }

  return {
    update(group: THREE.Group, amount: number, camera: THREE.Camera, gl: THREE.WebGLRenderer) {
      factor.value = amount;
      if (amount <= 0 || amount >= 1) {
        if (bindings.size) restore();
        return;
      }
      invProjection.value.copy(camera.projectionMatrixInverse);
      cameraWorld.value.copy(camera.matrixWorld);
      gl.getDrawingBufferSize(resolution.value);
      if (bindings.size) return;
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
        const original = object.material;
        const hazy = Array.isArray(original) ? original.map(variant) : variant(original);
        bindings.set(object, { original, hazy });
        object.material = hazy;
      });
    },
    dispose() {
      restore();
      for (const material of variants.values()) material.dispose();
      variants.clear();
    },
  };
}
