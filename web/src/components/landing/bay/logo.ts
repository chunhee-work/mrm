import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { WORDMARK as W } from "../../brand-data";
import { clamp01, smooth } from "./math";

/**
 * The logo as an object in the bay: the wordmark's own outlines, given a thickness and a bevelled edge, in the same
 * pearl as the bay's cold light. Its first "o" is a plain ring: the ball flies into it and sits there like a lens in its mount.
 * One unit of the group is one unit of the drawing (the word is `width` wide); the origin is the middle of its box,
 * and the front of the letters is the plane z = 0.
 */
export type Logo3D = {
  group: THREE.Group;
  /** the middle of the first "o", in the group's own space: the word's "o" is a ring, and the ball sits in it like a lens in its mount */
  o: THREE.Vector3;
  /** how big the ball is in there, in the drawing's units */
  ballRadius: number;
  width: number;
  material: THREE.MeshPhysicalMaterial;
  /** k 0..1: the letters stand up one after another, left to right */
  set(k: number): void;
  dispose(): void;
};

const DEPTH = 150;
const BEVEL = 11;
/** the ring's hole, and the ball in it */
const O_INNER = 172;
const O_BALL = 160;

export function buildLogo(): Logo3D {
  const group = new THREE.Group();
  const [, vy, , vh] = W.viewBox.split(" ").map(Number);
  const cx = W.width / 2;
  const cy = -(vy + vh / 2); // the drawing is y up, its box is written y down

  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${W.letters}"/></svg>`);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  // one outline is one stroke of a letter; outlines that share a column are one letter (the stem of an i and its dot)
  const spans = shapes.map((shape) => {
    const box = new THREE.Box2().setFromPoints(shape.getPoints(6));
    return { shape, x0: box.min.x, x1: box.max.x };
  }).sort((a, b) => a.x0 - b.x0);
  const letters: { shapes: THREE.Shape[]; x0: number; x1: number }[] = [];
  for (const s of spans) {
    const last = letters[letters.length - 1];
    if (last && s.x0 < last.x1 - 4) { last.shapes.push(s.shape); last.x1 = Math.max(last.x1, s.x1); }
    else letters.push({ shapes: [s.shape], x0: s.x0, x1: s.x1 });
  }

  const material = new THREE.MeshPhysicalMaterial({ color: 0xdfe6ed, roughness: 0.5, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.4, emissive: 0xcfe2f2, emissiveIntensity: 0.06 });
  const disposables: { dispose(): void }[] = [material];
  const ring = new THREE.Shape().absarc(W.o.cx, W.o.cy, W.o.r, 0, Math.PI * 2, false);
  ring.holes.push(new THREE.Path().absarc(W.o.cx, W.o.cy, O_INNER, 0, Math.PI * 2, true));
  letters.push({ shapes: [ring], x0: W.o.cx - W.o.r, x1: W.o.cx + W.o.r });
  letters.sort((a, b) => a.x0 - b.x0);

  const pivots = letters.map((l) => {
    const geo = new THREE.ExtrudeGeometry(l.shapes, { depth: DEPTH - BEVEL * 2, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelOffset: -BEVEL, bevelSegments: 3, curveSegments: 14 });
    disposables.push(geo);
    const mid = (l.x0 + l.x1) / 2;
    // each letter turns about the foot of its own column, on the baseline
    geo.translate(-mid, 0, -(DEPTH - BEVEL));
    const pivot = new THREE.Group();
    pivot.position.set(mid - cx, -cy, 0);
    pivot.add(new THREE.Mesh(geo, material));
    group.add(pivot);
    return pivot;
  });

  const n = pivots.length;
  function set(k: number) {
    group.visible = k > 0.001;
    if (!group.visible) return;
    for (let i = 0; i < n; i++) {
      const e = smooth(clamp01((k * (1 + 0.55) - (i / (n - 1)) * 0.55) / 1));
      const p = pivots[i];
      p.visible = e > 0.001;
      // lying on its back, small; then up on its feet
      p.rotation.x = -(1 - e) * 1.45;
      p.scale.setScalar(0.35 + 0.65 * e);
      p.position.y = -cy - (1 - e) * 90;
    }
  }
  set(0);

  return {
    group,
    o: new THREE.Vector3(W.o.cx - cx, W.o.cy - cy, -DEPTH / 2),
    ballRadius: O_BALL,
    width: W.width,
    material,
    set,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
