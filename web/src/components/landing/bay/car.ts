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

// The panels that carry paint or glass: they get a clear coat. Tyres, the grille, lamps and the underside stay as scanned.
const GLASS = ["windscreen", "glass"];
const PAINTED = ["bonnet", "roof", "tailgate", "bumper", "fender", "door", "quarter", "sill", "rail", "mirror", ...GLASS];

/**
 * Paint as on a real car: the scanned colour under a smooth clear coat. The coat ignores the scan's bumpy normal map, so the
 * room's light tubes run over the body as clean lines; the layer under it is calmed down so it does not fight them.
 */
function lacquer(base: THREE.MeshStandardMaterial): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(m, base);
  m.defines = { STANDARD: "", PHYSICAL: "" };
  m.clearcoat = 1;
  m.clearcoatRoughness = 0.045;
  m.roughness = base.roughness * 0.7;
  m.normalScale.setScalar(0.35);
  m.envMapIntensity = 1.9;
  m.emissiveIntensity = 1.25;
  darkBacks(m);
  return m;
}

/**
 * The scan's surface is slightly lumpy, which a matt finish hides and a clear coat shows as dents. This recomputes the
 * normals of a set of panels as one skin (so a reflection crosses a panel gap without a step) and relaxes them over their
 * neighbours, so reflections flow over the body as over pressed steel. The shape itself is not touched.
 */
function smoothNormals(meshes: THREE.Mesh[], rounds: number) {
  const EPS = 4e-4; // metres: two panels meet at the same point, give or take what the file's rounding moved it
  const CELL = EPS * 2;
  const grid = new Map<number, number[]>();
  const P: number[] = [];
  const cellOf = (x: number, y: number, z: number) => (Math.floor(x / CELL) * 73856093) ^ (Math.floor(y / CELL) * 19349663) ^ (Math.floor(z / CELL) * 83492791);
  const v = new THREE.Vector3();
  const find = (x: number, y: number, z: number) => {
    for (let c = 0; c < 8; c++) {
      const list = grid.get(cellOf(x + (c & 1 ? EPS : -EPS), y + (c & 2 ? EPS : -EPS), z + (c & 4 ? EPS : -EPS)));
      if (list) for (const w of list) if (Math.abs(P[w * 3] - x) < EPS && Math.abs(P[w * 3 + 1] - y) < EPS && Math.abs(P[w * 3 + 2] - z) < EPS) return w;
    }
    const w = P.length / 3;
    P.push(x, y, z);
    const key = cellOf(x, y, z), list = grid.get(key);
    if (list) list.push(w); else grid.set(key, [w]);
    return w;
  };
  // 1. every panel's points in one space; points doubled along texture seams or shared by two panels become one
  const welds = meshes.map((mesh) => {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.getAttribute("position");
    const weld = new Uint32Array(pos.count);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); weld[i] = find(v.x, v.y, v.z); }
    return weld;
  });
  const m = P.length / 3;
  let N = new Float32Array(m * 3), M = new Float32Array(m * 3);
  const near: Set<number>[] = Array.from({ length: m }, () => new Set<number>());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  meshes.forEach((mesh, k) => {
    const index = mesh.geometry.getIndex(), weld = welds[k];
    if (!index) return;
    for (let t = 0; t < index.count; t += 3) {
      const i = weld[index.getX(t)], j = weld[index.getX(t + 1)], q = weld[index.getX(t + 2)];
      if (i === j || j === q || i === q) continue;
      a.fromArray(P, i * 3); b.fromArray(P, j * 3); c.fromArray(P, q * 3);
      b.sub(a); c.sub(a); b.cross(c); // length = twice the area: big faces count for more
      for (const w of [i, j, q]) { N[w * 3] += b.x; N[w * 3 + 1] += b.y; N[w * 3 + 2] += b.z; }
      near[i].add(j).add(q); near[j].add(i).add(q); near[q].add(i).add(j);
    }
  });
  const unit = (A: Float32Array) => { for (let i = 0; i < m; i++) { const l = Math.hypot(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]) || 1; A[i * 3] /= l; A[i * 3 + 1] /= l; A[i * 3 + 2] /= l; } };
  unit(N);
  // 2. relax: each normal moves toward the average of its neighbours
  const start = new Uint32Array(m + 1);
  for (let i = 0; i < m; i++) start[i + 1] = start[i] + near[i].size;
  const link = new Uint32Array(start[m]);
  for (let i = 0; i < m; i++) { let o = start[i]; for (const j of near[i]) link[o++] = j; }
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < m; i++) {
      let x = N[i * 3], y = N[i * 3 + 1], z = N[i * 3 + 2];
      for (let o = start[i]; o < start[i + 1]; o++) { const j = link[o] * 3; x += N[j]; y += N[j + 1]; z += N[j + 2]; }
      M[i * 3] = x; M[i * 3 + 1] = y; M[i * 3 + 2] = z;
    }
    unit(M);
    [N, M] = [M, N];
  }
  // 3. back into each panel's own space
  const back = new THREE.Matrix3();
  meshes.forEach((mesh, k) => {
    const weld = welds[k], out = new Float32Array(weld.length * 3);
    back.setFromMatrix4(mesh.matrixWorld).transpose();
    for (let i = 0; i < weld.length; i++) { v.fromArray(N, weld[i] * 3).applyMatrix3(back).normalize(); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    mesh.geometry.setAttribute("normal", new THREE.BufferAttribute(out, 3));
  });
}

export function buildCar(gltf: GLTF | null, overlayMaterial: THREE.ShaderMaterial, amberOverlay: THREE.ShaderMaterial): Car {
  const group = new THREE.Group();
  const parts: Part[] = [];
  let frame: THREE.Object3D | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let lampMaterial: THREE.MeshStandardMaterial | null = null;
  let paint: THREE.MeshPhysicalMaterial | null = null;
  let pane: THREE.MeshPhysicalMaterial | null = null; // the glass: the same coat, mirroring the room less
  const panels: THREE.Mesh[] = [], glass: THREE.Mesh[] = [];
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
    } else if (PAINTED.some((prefix) => name.startsWith(prefix)) && material) {
      if (!paint) { paint = lacquer(material); pane = lacquer(material); pane.envMapIntensity = 0.6; }
      const isGlass = GLASS.some((prefix) => name.startsWith(prefix));
      mesh.material = isGlass ? pane! : paint;
      (isGlass ? glass : panels).push(mesh);
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
  gltf.scene.updateMatrixWorld(true);
  smoothNormals(panels, 90);
  smoothNormals(glass, 120);
  group.add(gltf.scene);
  const damaged = DAMAGED.map((n) => parts.find((p) => p.name === n)).filter((p): p is Part => !!p);

  const lamps = ["lampL", "lampR"].map((n) => parts.find((p) => p.name === n)).filter((p): p is Part => !!p);

  return {
    group, parts, damaged, frame, material, lampMaterial, lamps,
    dispose() {
      lampMaterial?.dispose();
      paint?.dispose();
      pane?.dispose();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshStandardMaterial;
        for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap]) t?.dispose();
      });
    },
  };
}
