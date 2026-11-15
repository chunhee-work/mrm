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
function lacquer(base: THREE.MeshStandardMaterial, glass = false): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(m, base);
  m.defines = { STANDARD: "", PHYSICAL: "" };
  // the scan marks some panels as bare metal and others as plastic, in patches: one car, one paint
  m.metalnessMap = null;
  m.roughnessMap = null;
  m.metalness = glass ? 0 : 0.55;
  m.roughness = glass ? 0.12 : 0.42;
  m.clearcoat = 1;
  m.clearcoatRoughness = 0.07;
  if (glass) {
    // the scan paints its own grey smears on the panes and its bump map draws streaks in a mirror this sharp:
    // a pane is one dark tint, and the only thing to see in it is the room
    m.map = null;
    m.normalMap = null;
    m.color.set(0x070b10);
  } else m.normalScale.setScalar(0.3);
  m.envMapIntensity = glass ? 0.4 : 1.5;
  darkBacks(m);
  return m;
}

/**
 * A pane of glass is a mirror, and a mirror shows every ripple the scan left in it, however long the normals are relaxed.
 * A real pane is one gentle curve, so each pane's normals are replaced by the closest gentle curve: every component of the
 * normal is fitted as a quadratic in the point's position (least squares), which keeps the pane's overall bow and drops the ripples.
 */
function fairNormals(mesh: THREE.Mesh, amount = 1) {
  const pos = mesh.geometry.getAttribute("position"), nor = mesh.geometry.getAttribute("normal");
  if (!pos || !nor || pos.count < 20) return;
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!, mid = box.getCenter(new THREE.Vector3());
  const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) / 2 || 1;
  const K = 10, f = new Float64Array(K);
  const basis = (i: number) => {
    const x = (pos.getX(i) - mid.x) / span, y = (pos.getY(i) - mid.y) / span, z = (pos.getZ(i) - mid.z) / span;
    f[0] = 1; f[1] = x; f[2] = y; f[3] = z; f[4] = x * x; f[5] = y * y; f[6] = z * z; f[7] = x * y; f[8] = y * z; f[9] = z * x;
  };
  // normal equations: A (K x K) and three right-hand sides, one per component
  const A = new Float64Array(K * K), B = new Float64Array(K * 3);
  for (let i = 0; i < pos.count; i++) {
    basis(i);
    for (let r = 0; r < K; r++) {
      for (let c = 0; c < K; c++) A[r * K + c] += f[r] * f[c];
      B[r * 3] += f[r] * nor.getX(i); B[r * 3 + 1] += f[r] * nor.getY(i); B[r * 3 + 2] += f[r] * nor.getZ(i);
    }
  }
  for (let r = 0; r < K; r++) A[r * K + r] += 1e-6 * pos.count; // a flat pane leaves some terms undetermined
  for (let col = 0; col < K; col++) {
    let best = col;
    for (let r = col + 1; r < K; r++) if (Math.abs(A[r * K + col]) > Math.abs(A[best * K + col])) best = r;
    if (Math.abs(A[best * K + col]) < 1e-12) return;
    if (best !== col) {
      for (let c = 0; c < K; c++) { const t = A[col * K + c]; A[col * K + c] = A[best * K + c]; A[best * K + c] = t; }
      for (let c = 0; c < 3; c++) { const t = B[col * 3 + c]; B[col * 3 + c] = B[best * 3 + c]; B[best * 3 + c] = t; }
    }
    for (let r = 0; r < K; r++) {
      if (r === col) continue;
      const k = A[r * K + col] / A[col * K + col];
      if (!k) continue;
      for (let c = col; c < K; c++) A[r * K + c] -= k * A[col * K + c];
      for (let c = 0; c < 3; c++) B[r * 3 + c] -= k * B[col * 3 + c];
    }
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    basis(i);
    let x = 0, y = 0, z = 0;
    for (let r = 0; r < K; r++) { const d = A[r * K + r]; x += (f[r] * B[r * 3]) / d; y += (f[r] * B[r * 3 + 1]) / d; z += (f[r] * B[r * 3 + 2]) / d; }
    let l = Math.hypot(x, y, z) || 1;
    // amount < 1 keeps part of the panel's own modelling (a bonnet has creases a pane has not)
    x = (x / l) * amount + nor.getX(i) * (1 - amount); y = (y / l) * amount + nor.getY(i) * (1 - amount); z = (z / l) * amount + nor.getZ(i) * (1 - amount);
    l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  mesh.geometry.setAttribute("normal", new THREE.BufferAttribute(out, 3));
}

/**
 * Every point of a mesh must face somewhere. A scan leaves a few that do not (a sliver of a face, two sheets back to
 * back whose directions cancel), and on a graphics card "no direction" becomes "not a number" over every face that
 * touches the point. Such a point takes the direction of a face it belongs to. Returns how many were mended.
 */
export function soundNormals(geometry: THREE.BufferGeometry): number {
  const pos = geometry.getAttribute("position"), nor = geometry.getAttribute("normal");
  if (!pos || !nor) return 0;
  const lost: number[] = [];
  for (let i = 0; i < nor.count; i++) {
    const l = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i));
    if (!(l > 0.5 && l < 2)) lost.push(i); // also catches NaN
  }
  if (!lost.length) return 0;
  const want = new Set(lost), found = new Map<number, THREE.Vector3>();
  const index = geometry.getIndex();
  const count = index ? index.count : pos.count;
  const at = (t: number) => (index ? index.getX(t) : t);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t + 2 < count && found.size < want.size; t += 3) {
    const i = at(t), j = at(t + 1), q = at(t + 2);
    if (!want.has(i) && !want.has(j) && !want.has(q)) continue;
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j).sub(a); c.fromBufferAttribute(pos, q).sub(a);
    b.cross(c);
    const l = b.length();
    if (!(l > 1e-12)) continue;
    b.divideScalar(l);
    for (const w of [i, j, q]) if (want.has(w) && !found.has(w)) found.set(w, b.clone());
  }
  for (const i of lost) { const n = found.get(i); if (n) nor.setXYZ(i, n.x, n.y, n.z); else nor.setXYZ(i, 0, 1, 0); }
  nor.needsUpdate = true;
  return lost.length;
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
      if (!paint) { paint = lacquer(material); pane = lacquer(material, true); }
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
  smoothNormals(glass, 320); // a pane is close to flat: its mirror image should not wobble
  glass.forEach((pane) => fairNormals(pane));
  // the two big sheets that face the ceiling lights: most of their ripples go, their creases stay
  panels.forEach((panel) => { if (/^(bonnet|roof)/.test(panel.name)) fairNormals(panel, 0.7); });
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
