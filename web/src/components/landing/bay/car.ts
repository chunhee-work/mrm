import * as THREE from "three";
import { clamp01, curve, lerp, smooth } from "./math";

/**
 * A five-door hatchback, built from one parametric surface.
 *
 *   s  distance from the nose along the car, 0..L (metres)
 *   v  position around one half of the cross-section, 0..7: seven spans between eight
 *      control points (underside centre, underside edge, sill, widest point, belt line,
 *      roof rail, crown, roof centre)
 *
 * Every panel is a set of rectangles in (s, v), so shut lines are real gaps and a panel can be
 * lifted off the car. There is no number plate and no badge: both ends are left smooth.
 * The car faces +x. Its left side (z < 0) took the hit: bumper, grille, bonnet, left headlamp, left fender.
 */

export const L = 3.95;
export const AX_F = 0.8; // front axle, s
export const AX_R = 3.3; // rear axle, s
export const WHEEL_R = 0.315;
const ARCH_R = 0.378;
const Y_MID_F = 0.52;
const Y_MID_R = 0.64;

const TOP = [[0, 0.7], [0.1, 0.745], [0.45, 0.845], [1.05, 0.965], [1.4, 1.215], [1.78, 1.435], [2.25, 1.495], [2.95, 1.475], [3.4, 1.425], [3.6, 1.22], [3.8, 1.0], [3.95, 0.86]] as const;
const BELT = [[0, 0.64], [0.45, 0.79], [1.05, 0.915], [2.2, 0.955], [3.3, 1.01], [3.7, 0.97], [3.95, 0.8]] as const;
const HALFW = [[0, 0.8], [0.5, 0.845], [1.2, 0.87], [2.6, 0.87], [3.4, 0.845], [3.95, 0.79]] as const;

/** Superellipse corner: 0 at q=0, 1 from q=1, blunt in between. */
const cap = (q: number, n: number) => (q >= 1 ? 1 : q <= 0 ? 0 : Math.pow(1 - Math.pow(1 - q, n), 1 / n));

type P2 = [number, number]; // [z, y]

function section(sIn: number): P2[] {
  const s = Math.min(L, Math.max(0, sIn));
  const capW = cap(s / 0.5, 2.4) * cap((L - s) / 0.36, 2.8);
  const kvF = cap(s / 0.16, 2.2);
  const kvR = cap((L - s) / 0.12, 2.5);
  let yt = curve(TOP, s);
  let yb = 0.19 + 0.08 * smooth(1 - s / 0.7) + 0.13 * smooth((s - 3.45) / 0.5);
  let belt = Math.min(curve(BELT, s), yt - 0.055);
  const g = smooth((yt - belt - 0.06) / 0.34); // how much greenhouse there is here
  // round the two ends in side view
  const yMid = s < L / 2 ? Y_MID_F : Y_MID_R;
  const kv = s < L / 2 ? kvF : kvR;
  yt = yMid + (yt - yMid) * kv;
  yb = yMid - (yMid - yb) * kv;
  belt = yMid + (belt - yMid) * kv;
  const w = curve(HALFW, s) * capW;
  const p5z = lerp(w * 0.93, w * 0.74, g);
  const p5y = lerp(belt + (yt - belt) * 0.55, yt - 0.075, g);
  return [
    [0, yb],
    [w * 0.8, yb],
    [w * 0.985, yb + 0.1 * kv],
    [w, lerp(yb, belt, 0.55)],
    [w * 0.965, belt],
    [p5z, p5y],
    [p5z * 0.58, yt - 0.014 * kv],
    [0, yt],
  ];
}

function sectionPoint(pts: P2[], v: number): P2 {
  const vv = Math.min(6.9999, Math.max(0, v));
  const k = Math.floor(vv);
  const f = vv - k;
  const at = (i: number): P2 => (i < 0 ? [-pts[1][0], pts[1][1]] : i > 7 ? [-pts[6][0], pts[6][1]] : pts[i]);
  const p0 = at(k - 1), p1 = at(k), p2 = at(k + 1), p3 = at(k + 2);
  const f2 = f * f, f3 = f2 * f;
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f2 + (-a + 3 * b - 3 * c + d) * f3);
  return [Math.max(0, cr(p0[0], p1[0], p2[0], p3[0])), cr(p0[1], p1[1], p2[1], p3[1])];
}

// The hit: front left corner pushed in, with a crease running back along the fender.
const IMPACT = new THREE.Vector3(L / 2 - 0.22, 0.6, -0.66);
function dent(p: THREE.Vector3, n: THREE.Vector3) {
  const d = p.distanceTo(IMPACT);
  if (d > 0.9) return;
  const k = smooth(1 - d / 0.9);
  const ripple = Math.sin(p.x * 23 + p.y * 17) * Math.sin(p.y * 31 - p.z * 13);
  const push = 0.045 * k * k + 0.0035 * k * ripple;
  p.addScaledVector(n, -push);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Undamaged surface point. side: -1 left, +1 right. */
function rawPoint(s: number, v: number, side: number, out: THREE.Vector3) {
  const [z, y] = sectionPoint(section(s), v);
  let zz = z;
  // wheel-arch flare
  if (v > 1 && v < 3.9) {
    for (const ax of [AX_F, AX_R]) {
      const d = Math.hypot(s - ax, y - WHEEL_R);
      if (d < ARCH_R + 0.14) zz += 0.022 * smooth(1 - (d - ARCH_R) / 0.14) * smooth((v - 1) / 0.6) * smooth((3.9 - v) / 0.8);
    }
  }
  return out.set(L / 2 - s, y, side * zz);
}

function rawNormal(s: number, v: number, side: number, out: THREE.Vector3) {
  const ds = 0.006, dv = 0.02;
  const s0 = Math.max(0.002, s - ds), s1 = Math.min(L - 0.002, s + ds);
  const v0 = Math.max(0, v - dv), v1 = Math.min(7, v + dv);
  rawPoint(s1, v, side, _a).sub(rawPoint(s0, v, side, _b));
  const tx = _a.x, ty = _a.y, tz = _a.z;
  rawPoint(s, v1, side, _a).sub(rawPoint(s, v0, side, _b));
  out.set(ty * _a.z - tz * _a.y, tz * _a.x - tx * _a.z, tx * _a.y - ty * _a.x);
  if (out.lengthSq() < 1e-12) out.set(s < L / 2 ? 1 : -1, 0, 0);
  out.normalize();
  // outward = away from the car's spine
  rawPoint(s, v, side, _a);
  if (out.x * 0 + out.y * (_a.y - 0.62) + out.z * _a.z < 0 && Math.abs(out.x) < 0.9) out.negate();
  if (Math.abs(out.x) >= 0.9 && out.x * _a.x < 0) out.negate();
  // the last few centimetres at either end face straight out: the surface closes to a point there
  const e = Math.min(s, L - s);
  if (e < 0.03) {
    const k = 1 - smooth(e / 0.03);
    out.set(lerp(out.x, s < L / 2 ? 1 : -1, k), lerp(out.y, 0, k), lerp(out.z, 0, k)).normalize();
  }
  return out;
}

export function surfacePoint(s: number, v: number, side: number, out: THREE.Vector3, offset = 0) {
  const n = rawNormal(s, v, side, new THREE.Vector3());
  rawPoint(s, v, side, out);
  dent(out, n);
  if (offset) out.addScaledVector(n, offset);
  return out;
}

type Rect = { s: [number, number]; v: [number, number]; side: "L" | "R" | "both" };

/** One mesh geometry from rectangles of the surface. `uv` holds (s, v) for the scan overlay. */
function patch(rects: Rect[], offset = 0, cutArches = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const r of rects) {
    for (const side of r.side === "both" ? [-1, 1] : [r.side === "L" ? -1 : 1]) {
      const n0 = Math.max(2, Math.ceil((r.s[1] - r.s[0]) / 0.022));
      // even steps along the car, plus a few close rings where a panel reaches either end, so the ends close round
      const ss: number[] = [];
      for (let i = 0; i <= n0; i++) ss.push(lerp(r.s[0], r.s[1], i / n0));
      for (const e of [0.0004, 0.002, 0.005, 0.011, 0.034]) {
        if (r.s[0] <= 0 && r.s[1] > e) ss.push(e);
        if (r.s[1] >= L && r.s[0] < L - e) ss.push(L - e);
      }
      ss.sort((a, b) => a - b);
      const ns = ss.length - 1;
      const nv = Math.max(2, Math.ceil((r.v[1] - r.v[0]) * 9));
      const base = pos.length / 3;
      const inside: boolean[] = [];
      for (let i = 0; i <= ns; i++) {
        const s = ss[i];
        for (let j = 0; j <= nv; j++) {
          const v = lerp(r.v[0], r.v[1], j / nv);
          rawNormal(s, v, side, n);
          rawPoint(s, v, side, p);
          let ins = false;
          if (cutArches && v > 0.95 && v < 3.75) {
            for (const ax of [AX_F, AX_R]) {
              const cx = L / 2 - ax;
              const dx = p.x - cx, dy = p.y - WHEEL_R;
              const d = Math.hypot(dx, dy);
              if (d < ARCH_R) {
                ins = true;
                if (d > 1e-4) { p.x = cx + (dx / d) * ARCH_R; p.y = WHEEL_R + (dy / d) * ARCH_R; }
              }
            }
          }
          inside.push(ins);
          dent(p, n);
          if (offset) p.addScaledVector(n, offset);
          pos.push(p.x, p.y, p.z);
          nor.push(n.x, n.y, n.z);
          uv.push(s, v);
        }
      }
      const at = (i: number, j: number) => i * (nv + 1) + j;
      for (let i = 0; i < ns; i++) {
        for (let j = 0; j < nv; j++) {
          const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
          if (inside[a] && inside[b] && inside[c] && inside[d]) continue;
          // winding so the front face looks outward on both sides
          if (side < 0) idx.push(base + a, base + b, base + c, base + a, base + c, base + d);
          else idx.push(base + a, base + c, base + b, base + a, base + d, base + c);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export type PanelKind = "paint" | "glass" | "trim" | "lamp" | "lampOff" | "tail" | "grille";
export type Panel = {
  name: string;
  kind: PanelKind;
  mesh: THREE.Mesh;
  overlay: THREE.Mesh;
  damaged: boolean;
  /** rest position of the panel's centre, car space */
  home: THREE.Vector3;
  /** where the panel goes when lifted off, relative to home */
  lift: THREE.Vector3;
  /** small rotation while lifted (euler, radians) */
  tilt: THREE.Euler;
};

const G = 0.0045; // half a shut line, metres along s
const GV = 0.03; // half a shut line, spans of v

type Spec = { name: string; kind: PanelKind; rects: Rect[]; damaged?: boolean; lift?: [number, number, number]; tilt?: [number, number, number]; inlay?: { kind: PanelKind; rects: Rect[] } };

const both = (s: [number, number], v: [number, number]): Rect => ({ s, v, side: "both" });
const left = (s: [number, number], v: [number, number]): Rect => ({ s, v, side: "L" });
const right = (s: [number, number], v: [number, number]): Rect => ({ s, v, side: "R" });

function fender(mk: typeof left): Rect[] {
  return [mk([0.4 + G, 1.12 - G], [1 + GV, 3.1]), mk([0.47 + G, 1.12 - G], [3.1, 4.5 - GV])];
}

const SPECS: Spec[] = [
  // ── front end
  { name: "bumper", kind: "paint", damaged: true, lift: [0.62, -0.1, -0.22], tilt: [0, 0.16, -0.08], rects: [both([0, 0.4 - G], [1 + GV, 3 - GV]), both([0, 0.06 - G], [3.95, 7]), both([0, 0.19], [0, 1 + GV])],
    // lower intake, moulded into the bumper
    inlay: { kind: "grille", rects: [both([0, 0.2], [1.45, 2.3]), both([0.24, 0.36], [1.7, 2.35])] } },
  { name: "grille", kind: "grille", damaged: true, lift: [0.95, 0.12, -0.34], tilt: [0, 0.22, 0.04], rects: [both([0, 0.1 - G], [3 + GV, 3.95 - GV])] },
  { name: "lampL", kind: "lampOff", damaged: true, lift: [0.5, 0.2, -0.62], tilt: [0.1, 0.5, 0.12], rects: [left([0.1 + G, 0.47 - G], [3.12 + GV, 3.95 - GV])] },
  { name: "lampR", kind: "lamp", rects: [right([0.1 + G, 0.47 - G], [3.12 + GV, 3.95 - GV])] },
  { name: "underLampL", kind: "paint", rects: [left([0.1 + G, 0.4 - G], [3, 3.12 - GV])] },
  { name: "underLampR", kind: "paint", rects: [right([0.1 + G, 0.4 - G], [3, 3.12 - GV])] },
  { name: "bonnet", kind: "paint", damaged: true, lift: [0.12, 0.62, -0.1], tilt: [0, 0, 0.2], rects: [both([0.06 + G, 1.05 - G], [4.5 + GV, 7]), both([0.06 + G, 0.47 - G], [3.95 + GV, 4.5 + GV])] },
  { name: "fenderL", kind: "paint", damaged: true, lift: [0.1, 0.1, -0.7], tilt: [0.14, -0.2, 0], rects: fender(left) },
  { name: "fenderR", kind: "paint", rects: fender(right) },
  { name: "cowl", kind: "trim", rects: [both([1.05 + G, 1.12 - G], [4.5 + GV, 7])] },
  // ── glasshouse
  { name: "windscreen", kind: "glass", rects: [both([1.14, 1.76 - G], [5.16, 7])] },
  { name: "roof", kind: "paint", rects: [both([1.76 + G, 3.42 - G], [5.16, 7])] },
  { name: "rails", kind: "paint", rects: [both([1.12 + G, 3.76 - G], [4.86, 5.16 - GV * 0.5])] },
  { name: "rearGlass", kind: "glass", rects: [both([3.42 + G, 3.76 - G], [5.16, 7])] },
  { name: "glassF", kind: "glass", rects: [both([1.3, 2.06], [4.1, 4.86 - GV * 0.5])] },
  { name: "pillarB", kind: "trim", rects: [both([2.06, 2.17], [4.1, 4.86 - GV * 0.5])] },
  { name: "glassR", kind: "glass", rects: [both([2.17, 2.9], [4.1, 4.86 - GV * 0.5])] },
  { name: "pillarC", kind: "paint", rects: [both([2.9 + G, 3.76 - G], [4.1, 4.86 - GV * 0.5]), both([1.12 + G, 1.3 - G], [4.1, 4.86 - GV * 0.5])] },
  // ── sides
  { name: "doorFL", kind: "paint", rects: [left([1.12 + G, 2.115 - G], [1.6 + GV, 4.1 - GV * 0.4])] },
  { name: "doorFR", kind: "paint", rects: [right([1.12 + G, 2.115 - G], [1.6 + GV, 4.1 - GV * 0.4])] },
  { name: "doorRL", kind: "paint", rects: [left([2.115 + G, 2.94 - G], [1.6 + GV, 4.1 - GV * 0.4])] },
  { name: "doorRR", kind: "paint", rects: [right([2.115 + G, 2.94 - G], [1.6 + GV, 4.1 - GV * 0.4])] },
  { name: "sills", kind: "trim", rects: [both([1.12 + G, 2.94 - G], [1 + GV, 1.6 - GV])] },
  { name: "quarterL", kind: "paint", rects: [left([2.94 + G, 3.6 - G], [1 + GV, 4.1 - GV * 0.4]), left([3.6 - G, 3.7 - G], [3.25 + GV, 4.1 - GV * 0.4])] },
  { name: "quarterR", kind: "paint", rects: [right([2.94 + G, 3.6 - G], [1 + GV, 4.1 - GV * 0.4]), right([3.6 - G, 3.7 - G], [3.25 + GV, 4.1 - GV * 0.4])] },
  // ── rear end
  { name: "tailL", kind: "tail", rects: [left([3.7 + G, 3.93], [3.25 + GV, 4.1 - GV])] },
  { name: "tailR", kind: "tail", rects: [right([3.7 + G, 3.93], [3.25 + GV, 4.1 - GV])] },
  { name: "tailgate", kind: "paint", rects: [both([3.76 + G, L], [4.1 + GV, 7]), both([3.93, L], [3.25 + GV, 4.1 + GV])] },
  { name: "bumperR", kind: "paint", rects: [both([3.6 + G, L], [1 + GV, 3.25 - GV]), both([L - 0.14, L], [0, 1 + GV])] },
  { name: "under", kind: "trim", rects: [both([0.19, L - 0.14], [0, 1])] },
];

export type CarMaterials = {
  paint: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  trim: THREE.MeshStandardMaterial;
  lamp: THREE.MeshPhysicalMaterial;
  lampOff: THREE.MeshPhysicalMaterial;
  tail: THREE.MeshStandardMaterial;
  grille: THREE.MeshStandardMaterial;
  tire: THREE.MeshStandardMaterial;
  rim: THREE.MeshStandardMaterial;
};

export function carMaterials(): CarMaterials {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: 0xaab5c1, metalness: 0.62, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.35 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x04070a, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.1, roughness: 0.62 }),
    lamp: new THREE.MeshPhysicalMaterial({ color: 0x151b21, metalness: 0.6, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, emissive: 0xbfe9ff, emissiveIntensity: 0.1, envMapIntensity: 1.8 }),
    lampOff: new THREE.MeshPhysicalMaterial({ color: 0x151b21, metalness: 0.6, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.3, envMapIntensity: 1.2 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x2a0406, metalness: 0.2, roughness: 0.2, emissive: 0xff2a2a, emissiveIntensity: 0.22 }),
    grille: new THREE.MeshStandardMaterial({ color: 0x06080a, metalness: 0.6, roughness: 0.45 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x08090a, metalness: 0, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.95, roughness: 0.24, envMapIntensity: 1.3 }),
  };
}

function wheel(m: CarMaterials): THREE.Group {
  const g = new THREE.Group();
  // tyre: a rounded profile turned round the axle
  const prof: THREE.Vector2[] = [];
  const W = 0.2, R = WHEEL_R, r0 = 0.205;
  const pts: [number, number][] = [[r0, -W / 2], [R - 0.04, -W / 2], [R - 0.008, -W / 2 + 0.018], [R, -W / 2 + 0.05], [R, W / 2 - 0.05], [R - 0.008, W / 2 - 0.018], [R - 0.04, W / 2], [r0, W / 2]];
  for (const [x, y] of pts) prof.push(new THREE.Vector2(x, y));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), m.tire);
  tyre.rotation.x = Math.PI / 2;
  g.add(tyre);
  // rim barrel + face
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.004, r0 + 0.004, W * 0.9, 40, 1, true), m.rim);
  barrel.rotation.x = Math.PI / 2;
  (barrel.material as THREE.Material).side = THREE.DoubleSide;
  g.add(barrel);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 32), new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.9, roughness: 0.4 }));
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  for (const face of [-1, 1]) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.03, 24), m.rim);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = face * (W / 2 - 0.035);
    g.add(hub);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      for (const off of [-0.11, 0.11]) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.02, 0.02), m.rim);
        const mid = 0.125;
        spoke.position.set(Math.cos(a + off * 0.55) * mid, Math.sin(a + off * 0.55) * mid, face * (W / 2 - 0.04));
        spoke.rotation.z = a + off;
        g.add(spoke);
      }
    }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(r0 - 0.004, 0.008, 8, 48), m.rim);
    lip.position.z = face * (W / 2 - 0.022);
    g.add(lip);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  return g;
}

export type Car = {
  group: THREE.Group;
  panels: Panel[];
  damaged: Panel[];
  materials: CarMaterials;
  /** paint clones of the damaged panels, so they can glow on their own */
  damagedPaint: THREE.MeshPhysicalMaterial[];
};

export function buildCar(overlayMaterial: THREE.ShaderMaterial, amberOverlay: THREE.ShaderMaterial): Car {
  const m = carMaterials();
  const group = new THREE.Group();
  const panels: Panel[] = [];
  const damagedPaint: THREE.MeshPhysicalMaterial[] = [];

  // what shows through the shut lines
  const inner = new THREE.Mesh(patch([both([0.01, L - 0.01], [0, 7])], -0.012), new THREE.MeshStandardMaterial({ color: 0x030405, roughness: 0.9, metalness: 0 }));
  inner.castShadow = true;
  group.add(inner);

  for (const spec of SPECS) {
    const geo = patch(spec.rects);
    geo.computeBoundingBox();
    const home = geo.boundingBox!.getCenter(new THREE.Vector3());
    if (spec.damaged) geo.translate(-home.x, -home.y, -home.z);
    let mat: THREE.Material = m[spec.kind];
    if (spec.damaged && spec.kind === "paint") {
      const c = m.paint.clone();
      damagedPaint.push(c);
      mat = c;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = spec.name !== "under";
    mesh.receiveShadow = true;
    if (spec.damaged) mesh.position.copy(home);
    if (spec.inlay) {
      const ig = patch(spec.inlay.rects, 0.003);
      if (spec.damaged) ig.translate(-home.x, -home.y, -home.z);
      mesh.add(new THREE.Mesh(ig, m[spec.inlay.kind]));
    }
    const overlay = new THREE.Mesh(geo, spec.damaged ? amberOverlay : overlayMaterial);
    overlay.renderOrder = 5;
    if (spec.name === "under") overlay.visible = false;
    mesh.add(overlay);
    group.add(mesh);
    panels.push({
      name: spec.name,
      kind: spec.kind,
      mesh,
      overlay,
      damaged: !!spec.damaged,
      home,
      lift: new THREE.Vector3(...(spec.lift ?? [0, 0, 0])),
      tilt: new THREE.Euler(...(spec.tilt ?? [0, 0, 0])),
    });
  }

  // wheels and their wells
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x020203, roughness: 1, side: THREE.DoubleSide });
  const wellGeo = (() => {
    const R = ARCH_R + 0.012, D = 0.33, N = 28;
    const pos: number[] = [];
    const idx: number[] = [];
    const a0 = -0.42, a1 = Math.PI + 0.42; // a little past horizontal on both sides
    for (let i = 0; i <= N; i++) {
      const a = a0 + ((a1 - a0) * i) / N;
      pos.push(Math.cos(a) * R, Math.sin(a) * R, -D / 2, Math.cos(a) * R, Math.sin(a) * R, D / 2);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  for (const ax of [AX_F, AX_R]) {
    for (const side of [-1, 1]) {
      const w = wheel(m);
      const zc = side * (curve(HALFW, ax) - 0.115);
      w.position.set(L / 2 - ax, WHEEL_R, zc);
      if (ax === AX_F) w.rotation.y = side < 0 ? -0.2 : -0.2; // front wheels turned a little toward the camera
      group.add(w);
      // the well: an arch over the wheel, closed at the back, open to the ground
      const well = new THREE.Mesh(wellGeo, wellMat);
      well.position.set(L / 2 - ax, WHEEL_R, side * (curve(HALFW, ax) - 0.185));
      group.add(well);
    }
  }

  // mirrors, handles, roof fin: the small things that make it read as a car
  const p = new THREE.Vector3();
  for (const side of [-1, 1]) {
    surfacePoint(1.33, 4.12, side, p);
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), side < 0 ? m.paint : m.paint);
    mirror.scale.set(0.62, 0.72, 1.15);
    mirror.position.set(p.x - 0.02, p.y + 0.035, p.z + side * 0.085);
    mirror.castShadow = true;
    group.add(mirror);
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 0.09), m.trim);
    stalk.position.set(p.x - 0.02, p.y + 0.0, p.z + side * 0.03);
    group.add(stalk);
    for (const sH of [1.98, 2.8]) {
      surfacePoint(sH, 3.72, side, p, 0.006);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.026, 0.016), m.trim);
      handle.position.copy(p);
      group.add(handle);
    }
  }
  surfacePoint(3.25, 7, 1, p);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 12), m.trim);
  fin.scale.set(2.3, 1, 0.6);
  fin.position.set(p.x, p.y + 0.03, 0);
  group.add(fin);
  // daytime running lights: a thin blade in each lamp. The left one took the hit and barely glows; it rides on its lamp.
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) pts.push(surfacePoint(lerp(0.13, 0.44, i / 10), 3.82, side, new THREE.Vector3(), 0.004));
    const drl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.007, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe9ff).multiplyScalar(side < 0 ? 0.55 : 2.4), toneMapped: false }));
    if (side < 0) {
      const lamp = panels.find((x) => x.name === "lampL")!;
      drl.position.copy(lamp.home).negate();
      lamp.mesh.add(drl);
    } else group.add(drl);
  }

  // tail lamps: one thin lit blade each, wrapping the corner
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) pts.push(surfacePoint(lerp(3.73, 3.925, i / 12), 3.86, side, new THREE.Vector3(), 0.004));
    const bar = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(2.3), toneMapped: false }));
    group.add(bar);
  }

  return { group, panels, damaged: panels.filter((x) => x.damaged), materials: m, damagedPaint };
}

/** Narrowest lit width used to pick the level of detail elsewhere. */
export const carBounds = { halfW: 0.9, height: 1.5, length: L };
export { clamp01 };
