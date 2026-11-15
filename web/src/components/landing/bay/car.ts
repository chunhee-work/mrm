import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

/**
 * The car: a scanned-quality hatchback cut into its body parts, one mesh per part, around an inner frame.
 * Car space: nose +x, up +y, the damaged (camera) side is -z, wheels on y = 0, centre of the length at x = 0.
 * The file holds the parts by name; this module only says how each one behaves:
 *   - where it goes when the car is taken apart (`out`)
 *   - whether it is one of the five damaged parts that are keyed on the claim form
 */

export const L = 3.95;

export type Part = {
  name: string;
  mesh: THREE.Mesh;
  /** the survey grid drawn over the part while it is scanned (and, for damaged parts, in amber after) */
  overlay: THREE.Mesh;
  damaged: boolean;
  home: THREE.Vector3;
  /** where it travels when the car comes apart, in metres */
  out: THREE.Vector3;
  tilt: THREE.Euler;
  /** its own slow rhythm, so floating parts do not move as one block */
  phase: number;
};

export type Car = {
  group: THREE.Group;
  parts: Part[];
  /** in the order of the rows on the claim form, top to bottom */
  damaged: Part[];
  frame: THREE.Object3D | null;
  material: THREE.MeshStandardMaterial | null;
  /** the head lamps' own copy of the paint material, so they can be switched on by themselves */
  lampMaterial: THREE.MeshStandardMaterial | null;
  /** the two head lamps, left then right */
  lamps: Part[];
  dispose(): void;
};

// The five parts the story follows, top row of the form first (highest part first, so leader lines do not cross).
export const DAMAGED = ["bonnet", "lampL", "grille", "fenderL", "bumperF"] as const;

type V3 = [number, number, number];
// [along the car, up, away from the centre line]: the third number is mirrored for the right-hand part
const OUT: [string, V3, V3?][] = [
  ["bonnet", [0.25, 0.5, 0], [0, 0, -0.1]],
  ["windscreen", [0.2, 0.64, 0], [0, 0, -0.06]],
  ["roof", [-0.05, 0.84, 0]],
  ["tailgate", [-0.86, 0.36, 0], [0, 0, 0.1]],
  ["bumperF", [0.55, -0.02, 0]],
  ["grille", [0.9, 0.03, 0]],
  ["bumperR", [-0.98, -0.02, 0]],
  ["lamp", [0.62, 0.16, 0.3]],
  ["tail", [-1.04, 0.14, 0.4]],
  ["fender", [0.26, 0.08, 0.78]],
  ["doorF", [0.07, 0, 0.9]],
  ["doorR", [-0.07, 0, 0.9]],
  ["glassF", [0.07, 0.3, 1.22]],
  ["glassR", [-0.07, 0.3, 1.22]],
  ["quarter", [-0.42, 0.06, 0.82]],
  ["sill", [0, -0.06, 0.62]],
  ["rail", [0, 0.46, 0.62]],
  ["mirror", [0.16, 0.16, 1.3]],
  ["wheel", [0, 0, 0.72]],
  ["under", [0, 0, 0]],
];

/** Dims the inside of a panel: when the car is apart you see the backs of doors and wings, and they should not shine like paint. */
function darkBacks(mat: THREE.MeshStandardMaterial) {
  mat.side = THREE.DoubleSide;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.22;");
  };
}

export function buildCar(gltf: GLTF | null, overlayMaterial: THREE.ShaderMaterial, amberOverlay: THREE.ShaderMaterial): Car {
  const group = new THREE.Group();
  const parts: Part[] = [];
  let frame: THREE.Object3D | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let lampMaterial: THREE.MeshStandardMaterial | null = null;
  if (!gltf) return { group, parts, damaged: [], frame, material, lampMaterial, lamps: [], dispose() {} };

  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  let k = 0;
  for (const mesh of meshes) {
    // the loader names a mesh after its node; a node with one mesh is that mesh
    const name = mesh.name || mesh.parent?.name || "";
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (name === "frame") {
      frame = mesh;
      mat.envMapIntensity = 0.9;
      mat.side = THREE.DoubleSide;
      mesh.visible = false;
      continue;
    }
    if (!material) {
      material = mat;
      // the scan's paint is a dark, flat grey: lift it and let it take the room's reflections
      mat.color.setScalar(1.7);
      mat.roughness *= 0.62;
      mat.envMapIntensity = 1.5;
      mat.emissive.setScalar(1);
      mat.emissiveIntensity = 1.5;
      darkBacks(mat);
    }
    if (name.startsWith("lamp") && material) {
      if (!lampMaterial) { lampMaterial = material.clone(); darkBacks(lampMaterial); }
      mesh.material = lampMaterial;
    }
    const rule = OUT.find(([prefix]) => name.startsWith(prefix));
    const right = /R$/.test(name) && !/^(bumperR)$/.test(name);
    const left = /L$/.test(name);
    const side = right ? 1 : left ? -1 : 0;
    const o = rule ? rule[1] : ([0, 0, 0] as V3);
    const tl = rule?.[2] ?? ([0, 0, 0] as V3);
    const damaged = (DAMAGED as readonly string[]).includes(name);
    const overlay = new THREE.Mesh(mesh.geometry, damaged ? amberOverlay : overlayMaterial);
    overlay.renderOrder = 4;
    overlay.visible = false;
    mesh.add(overlay);
    parts.push({
      name, mesh, overlay, damaged,
      home: mesh.position.clone(),
      out: new THREE.Vector3(o[0], o[1], o[2] * side),
      tilt: new THREE.Euler(tl[0], tl[1], tl[2]),
      phase: (k++ * 2.399) % (Math.PI * 2),
    });
  }
  group.add(gltf.scene);
  const damaged = DAMAGED.map((n) => parts.find((p) => p.name === n)).filter((p): p is Part => !!p);

  const lamps = ["lampL", "lampR"].map((n) => parts.find((p) => p.name === n)).filter((p): p is Part => !!p);

  return {
    group, parts, damaged, frame, material, lampMaterial, lamps,
    dispose() {
      lampMaterial?.dispose();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap]) t?.dispose();
      });
    },
  };
}
