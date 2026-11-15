import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clamp01, lerp, rng, seg, smooth } from "./math";
import { AMBER, ICE, glow } from "./room";

const RAD = Math.PI / 180;

// How much of the claim form is in the working amber: 1 = the rows only, 2 = the frame, the car's panel and the glass too,
// 3 = as 2 with the rows filled solid. 0 is the old all-ice form.
const LOOK: number = 1;
/** How the case file hangs at the Upload stop (see `hung` below). */
export const FILE_LOOK = 0 as 0 | 1 | 2 | 3;

/**
 * The intake console beside the car (a scanned model), and everything that happens at it:
 *   Upload     the case file hangs in front of the viewer, big sheets one over another: the pages an adjuster knows
 *              (ownership certificate, insurance schedule, police report, sketch plan, search result) and the damage
 *              photos. Scroll on, and sheet after sheet goes into the slot
 *   Autopilot  a glass claim form opens under the scan ball; one row per damaged part types itself and is ticked,
 *              and the same part turns from amber to green on the form's own drawing of the car
 * No words anywhere: every line of writing is a bar.
 */

const ROWS = 5;
// the claim form: a sheet of glass, its top edge hanging under the ball
export const FORM_W = 0.72;
export const FORM_H = 0.96;
const CW = 768;
const CH = 1024;
const ROW_Y0 = 440;
const ROW_PITCH = 82;
// where the slot sits on the plinth's sloped top, local to the console
const SLOT = new THREE.Vector3(-0.01, 0.923, -0.008);
// the picture of the case file: 4 x 3 cells; six pages first, then six photos. The two sheets that hang nearest the
// viewer have a sharper picture of their own (cells 12 and 13).
const DOCS = 6;
const HERO_PAGE = 12;
const HERO_PHOTO = 13;

/**
 * How the case file hangs in front of the viewer at the Upload stop: a few big sheets one over another, the nearest
 * sharp, the ones behind larger and out of focus, and loose sheets far off in the dark. Listed from the back to the front.
 *   x, y    where its middle shows in the frame (0..1 from the top left)      h      its height, in frame heights
 *   depth   metres from the viewer                                            turn   pitch, yaw, roll in degrees
 *   blur    how far out of focus, in sheet widths                             dim    how much of the light reaches it
 */
type Sheet = { cell: number; x: number; y: number; h: number; depth: number; turn: [number, number, number]; blur: number; dim: number; shadow?: boolean };
const SHEETS_WIDE: Sheet[] = [
  { cell: 11, x: 0.433, y: 0.322, h: 0.093, depth: 5.0, turn: [4, -20, 8], blur: 0.05, dim: 0.3 },
  { cell: 4, x: 0.374, y: 0.489, h: 0.186, depth: 4.4, turn: [-6, 24, -7], blur: 0.045, dim: 0.3 },
  { cell: 10, x: 0.083, y: 0.731, h: 0.124, depth: 4.2, turn: [8, 30, 10], blur: 0.05, dim: 0.3 },
  { cell: 3, x: 0.073, y: 0.346, h: 0.223, depth: 4.2, turn: [-3, 34, 5], blur: 0.04, dim: 0.34 },
  { cell: 9, x: 0.269, y: 0.756, h: 0.105, depth: 3.9, turn: [10, 10, -6], blur: 0.04, dim: 0.36 },
  { cell: 8, x: 0.383, y: 0.278, h: 0.081, depth: 3.8, turn: [-8, -14, -5], blur: 0.035, dim: 0.4 },
  { cell: 1, x: 0.128, y: 0.489, h: 0.52, depth: 3.4, turn: [-3, 18, -2], blur: 0.02, dim: 0.46 },
  { cell: 5, x: 0.303, y: 0.408, h: 0.372, depth: 3.0, turn: [-4, 15, 2], blur: 0.012, dim: 0.6 },
  { cell: 7, x: 0.341, y: 0.331, h: 0.124, depth: 2.6, turn: [-3, 12, 4], blur: 0.005, dim: 0.86, shadow: true },
  { cell: 2, x: 0.185, y: 0.551, h: 0.422, depth: 2.5, turn: [-3, 14, -4], blur: 0.004, dim: 0.8, shadow: true },
  { cell: HERO_PAGE, x: 0.236, y: 0.508, h: 0.422, depth: 2.2, turn: [-3, 13, -1.2], blur: 0, dim: 1, shadow: true },
  { cell: HERO_PHOTO, x: 0.321, y: 0.625, h: 0.186, depth: 1.9, turn: [-2, 10, 1.2], blur: 0, dim: 1, shadow: true },
];
// a phone's frame is tall: the words are above, the machine below, the file between them
const SHEETS_NARROW: Sheet[] = [
  { cell: 11, x: 0.788, y: 0.344, h: 0.068, depth: 5.0, turn: [4, -20, 8], blur: 0.05, dim: 0.3 },
  { cell: 4, x: 0.844, y: 0.54, h: 0.16, depth: 4.4, turn: [-6, -24, -7], blur: 0.045, dim: 0.3 },
  { cell: 10, x: 0.18, y: 0.676, h: 0.072, depth: 4.2, turn: [8, 30, 10], blur: 0.05, dim: 0.3 },
  { cell: 3, x: 0.124, y: 0.5, h: 0.176, depth: 4.2, turn: [-3, 34, 5], blur: 0.04, dim: 0.34 },
  { cell: 9, x: 0.204, y: 0.36, h: 0.068, depth: 3.9, turn: [10, 10, -6], blur: 0.04, dim: 0.36 },
  { cell: 8, x: 0.796, y: 0.68, h: 0.064, depth: 3.8, turn: [-8, -14, -5], blur: 0.035, dim: 0.4 },
  { cell: 1, x: 0.292, y: 0.48, h: 0.4, depth: 3.4, turn: [-3, 16, -2], blur: 0.02, dim: 0.46 },
  { cell: 5, x: 0.644, y: 0.452, h: 0.272, depth: 3.0, turn: [-4, 13, 2], blur: 0.012, dim: 0.6 },
  { cell: 7, x: 0.692, y: 0.388, h: 0.092, depth: 2.6, turn: [-3, 10, 4], blur: 0.005, dim: 0.86, shadow: true },
  { cell: 2, x: 0.348, y: 0.528, h: 0.296, depth: 2.5, turn: [-4, 12, -5], blur: 0.004, dim: 0.8, shadow: true },
  { cell: HERO_PAGE, x: 0.46, y: 0.5, h: 0.304, depth: 2.2, turn: [-3, 10, -1.2], blur: 0, dim: 1, shadow: true },
  { cell: HERO_PHOTO, x: 0.64, y: 0.608, h: 0.132, depth: 1.9, turn: [-2, 8, 1.2], blur: 0, dim: 1, shadow: true },
];
/**
 * The same file, hung lighter. 0 is the full spread above. The others keep its picture and take weight off it:
 *   1  the whole spread, smaller         2  only the five sheets in focus, no big blurred ones behind
 *   3  those five, small, as one neat handful
 */
export type FileLook = 0 | 1 | 2 | 3;
const NEAR = 5; // the last five of a list are the sheets in focus
function hung(list: Sheet[], look: FileLook, mobile: boolean): Sheet[] {
  if (!look) return list;
  const [cx, cy] = mobile ? [0.5, 0.5] : [0.25, 0.5];
  const k = look === 1 ? (mobile ? 0.7 : 0.68) : look === 2 ? (mobile ? 0.82 : 0.82) : mobile ? 0.62 : 0.58;
  // a handful sits nearer the machine it is about to go into
  const [mx, my] = look === 3 ? (mobile ? [0, 0.02] : [0.035, 0.0]) : [0, 0];
  const keep = look === 1 ? list : list.slice(-NEAR);
  return keep.map((s) => ({ ...s, x: cx + (s.x - cx) * k + mx, y: cy + (s.y - cy) * k + my, h: s.h * k }));
}
const PAGE_ASPECT = 880 / 1168;
const PHOTO_ASPECT = 1168 / 880;
const isPage = (cell: number) => cell < DOCS || cell === HERO_PAGE;
// the file gathers on the way to the Upload stop, hangs there, and goes into the machine on the way out of it
const FILE_IN: [number, number] = [0.05, 0.178];
const FILE_OUT: [number, number] = [0.222, 0.312];

/** What the scene tells the console about the viewer each frame, so the file can hang in front of them. */
export type Viewer = {
  /** the point `depth` metres in front of the viewer that shows at (fx, fy) of the frame */
  at(fx: number, fy: number, depth: number, out: THREE.Vector3): THREE.Vector3;
  /** how tall the frame is at that depth, in metres */
  tall(depth: number): number;
  quat: THREE.Quaternion;
  up: THREE.Vector3;
};

export type Console = {
  group: THREE.Group;
  /** the claim form: place it and turn it every frame (it hangs in front of the viewer) */
  form: THREE.Group;
  /** world position of the left end of row r on the glass form (where a leader line lands) */
  rowAnchor(r: number, out: THREE.Vector3): THREE.Vector3;
  set(t: number, time: number, viewer: Viewer): void;
  /** world position of the slot the case file drops into */
  slotWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
};

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

type FormState = { typed: number[]; ticked: number[]; closing: number };

/** The claim form as one drawing. Rows, top to bottom: bonnet, left head lamp, grille, left wing, front bumper. */
function drawForm(g: CanvasRenderingContext2D, s: FormState, widths: number[][]) {
  const ice = (a: number) => `rgba(191,233,255,${a})`;
  const amber = (a: number) => `rgba(255,176,32,${a})`;
  const go = (a: number) => `rgba(61,220,151,${a})`;
  const mixed = (k: number, a: number) => `rgba(${Math.round(lerp(255, 61, k))},${Math.round(lerp(176, 220, k))},${Math.round(lerp(32, 151, k))},${a})`;
  const fill = (c: string) => { g.fillStyle = c; g.fill(); };
  const stroke = (c: string, w: number) => { g.strokeStyle = c; g.lineWidth = w; g.stroke(); };
  g.clearRect(0, 0, CW, CH);
  g.lineCap = "round"; g.lineJoin = "round";
  const prog = s.ticked.reduce((a, b) => a + b, 0) / ROWS;
  const c = s.closing;
  const warm = LOOK >= 1;
  const all = LOOK >= 2;
  const solid = LOOK >= 3;
  // the form's working colour: amber while the claim is open, green once it is signed
  const work = (a: number) => (warm ? mixed(c, a) : ice(a));
  const edge = (a: number) => (all ? mixed(c, a) : ice(a));

  // ── heading, and the state of the whole claim on the right
  rr(g, 44, 48, 250, 26, 6); fill(ice(0.95));
  rr(g, 44, 88, 150, 11, 5); fill(all ? mixed(c, 0.7) : ice(0.38));
  rr(g, 548, 46, 176, 54, 27); fill(mixed(c, 0.1)); stroke(mixed(c, 0.9), 2);
  g.beginPath(); g.arc(578, 73, 8, 0, Math.PI * 2); fill(mixed(c, 1));
  rr(g, 598, 66, 96 * (0.3 + 0.7 * prog), 14, 7); fill(mixed(c, 0.9));

  // ── the car, seen from above, nose to the left; the five damaged parts are marked on it
  rr(g, 44, 140, 680, 270, 14); fill(all ? mixed(c, 0.05) : ice(0.035)); stroke(all ? mixed(c, 0.55) : ice(0.22), 1.5);
  g.strokeStyle = all ? mixed(c, 0.5) : ice(0.2); g.lineWidth = 1;
  for (let x = 64; x <= 704; x += 20) { g.beginPath(); g.moveTo(x, 398); g.lineTo(x, x % 100 === 64 ? 386 : 392); g.stroke(); }
  // wheels, under the body
  for (const [x, y] of [[212, 176], [212, 364], [520, 176], [520, 364]] as const) { rr(g, x, y, 78, 14, 6); fill(ice(0.3)); }
  // body
  g.beginPath();
  g.moveTo(206, 184); g.lineTo(560, 184);
  g.bezierCurveTo(606, 184, 622, 214, 622, 275);
  g.bezierCurveTo(622, 336, 606, 366, 560, 366);
  g.lineTo(206, 366);
  g.bezierCurveTo(160, 366, 148, 330, 148, 275);
  g.bezierCurveTo(148, 220, 160, 184, 206, 184);
  g.closePath(); fill("rgba(8,14,20,0.85)"); stroke(ice(0.75), 2.5);
  // glass: windscreen, roof, rear window
  g.beginPath(); g.moveTo(300, 204); g.quadraticCurveTo(280, 275, 300, 346); g.lineTo(338, 334); g.quadraticCurveTo(326, 275, 338, 216); g.closePath(); fill(ice(0.1)); stroke(ice(0.5), 1.5);
  rr(g, 346, 214, 170, 122, 16); stroke(ice(0.42), 1.5);
  g.beginPath(); g.moveTo(524, 218); g.quadraticCurveTo(536, 275, 524, 332); g.lineTo(552, 342); g.quadraticCurveTo(566, 275, 552, 208); g.closePath(); fill(ice(0.08)); stroke(ice(0.42), 1.5);
  // door lines and mirrors
  g.strokeStyle = ice(0.3); g.lineWidth = 1.5;
  for (const x of [344, 432, 520]) { g.beginPath(); g.moveTo(x, 186); g.lineTo(x, 214); g.moveTo(x, 336); g.lineTo(x, 364); g.stroke(); }
  rr(g, 318, 170, 16, 14, 4); fill(ice(0.5)); rr(g, 318, 366, 16, 14, 4); fill(ice(0.5));
  // the damaged parts (the car's left is the lower side of the drawing)
  const zone = (i: number, path: () => void) => {
    const k = s.ticked[i];
    const live = s.typed[i] > 0.001 && k < 0.999;
    path(); fill(mixed(k, live ? 0.95 : 0.62)); stroke(mixed(k, 1), live ? 3 : 1.5);
  };
  zone(0, () => { g.beginPath(); g.moveTo(206, 208); g.lineTo(288, 204); g.quadraticCurveTo(270, 275, 288, 346); g.lineTo(206, 342); g.quadraticCurveTo(180, 275, 206, 208); g.closePath(); });
  zone(1, () => { g.beginPath(); g.moveTo(160, 318); g.quadraticCurveTo(170, 352, 200, 358); g.lineTo(200, 340); g.quadraticCurveTo(180, 334, 174, 312); g.closePath(); });
  zone(2, () => rr(g, 150, 244, 16, 62, 6));
  zone(3, () => { g.beginPath(); g.moveTo(208, 349); g.lineTo(296, 352); g.lineTo(296, 364); g.lineTo(208, 364); g.closePath(); });
  zone(4, () => { g.beginPath(); g.moveTo(141, 200); g.quadraticCurveTo(126, 275, 141, 350); g.lineTo(134, 352); g.quadraticCurveTo(116, 275, 134, 198); g.closePath(); });

  // ── one row per part: mark, name, part number, codes, amount, tick
  for (let i = 0; i < ROWS; i++) {
    const y = ROW_Y0 + i * ROW_PITCH;
    const typed = s.typed[i];
    const k = s.ticked[i];
    const live = typed > 0.001 && k < 0.999;
    const [nameW, subW, amtW] = widths[i];
    if (warm) {
      // every row is a card in the working colour: faint while it waits, bright while it is typed, settled once ticked
      rr(g, 44, y + 4, 680, ROW_PITCH - 8, 10);
      if (live) { fill(amber(solid ? 0.3 : 0.17)); stroke(amber(0.95), 2); }
      else if (k >= 0.999) { fill(work(solid ? 0.2 : 0.09)); stroke(work(0.5), 1.5); }
      else { fill(work(solid ? 0.1 : 0.035)); stroke(work(solid ? 0.5 : 0.32), 1.5); }
      if (typed > 0.001) { rr(g, 44, y + 4, 5, ROW_PITCH - 8, 2); fill(mixed(k, 0.95)); }
    } else if (live) { rr(g, 44, y + 4, 680, ROW_PITCH - 8, 10); fill(amber(0.1)); rr(g, 44, y + 4, 5, ROW_PITCH - 8, 2); fill(amber(0.95)); }
    else if (k >= 0.999) { rr(g, 44, y + 4, 680, ROW_PITCH - 8, 10); fill(go(0.045)); }
    rr(g, 64, y + 26, 30, 30, 8);
    if (typed > 0.001) fill(mixed(k, 0.92)); else stroke(warm ? work(0.75) : ice(0.3), 1.5);
    if (typed > 0.001) {
      rr(g, 116, y + 23, nameW * typed, 16, 7); fill(ice(0.95));
      rr(g, 116, y + 48, subW * seg(typed, 0.3, 1), 8, 4); fill(ice(0.36));
      if (typed < 0.999) { g.fillStyle = amber(1); g.fillRect(116 + nameW * typed + 6, y + 19, 4, 24); }
      const chips = seg(typed, 0.5, 0.75);
      if (chips > 0.01) {
        g.globalAlpha = chips;
        rr(g, 372, y + 29, 58, 24, 6); stroke(ice(0.55), 1.5); rr(g, 382, y + 37, 38, 8, 4); fill(ice(0.6));
        rr(g, 440, y + 29, 40, 24, 6); fill(ice(0.16)); rr(g, 450, y + 37, 20, 8, 4); fill(ice(0.6));
        g.globalAlpha = 1;
      }
      const amt = amtW * seg(typed, 0.62, 1);
      if (amt > 1) { rr(g, 646 - amt, y + 34, amt, 14, 7); fill(ice(0.7)); }
    } else {
      rr(g, 116, y + 30, 150, 10, 5); fill(warm ? work(0.32) : ice(0.1));
    }
    rr(g, 672, y + 25, 32, 32, 8); stroke(k > 0.01 ? go(0.4 + 0.6 * k) : warm ? work(typed > 0.001 ? 1 : 0.7) : ice(typed > 0.001 ? 0.6 : 0.28), 2);
    if (k > 0.02) {
      const a = [679, y + 42], b = [686, y + 49], d = [698, y + 33];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const l2 = Math.hypot(d[0] - b[0], d[1] - b[1]);
      const len = k * (l1 + l2);
      g.beginPath(); g.moveTo(a[0], a[1]);
      const k1 = Math.min(1, len / l1);
      g.lineTo(a[0] + (b[0] - a[0]) * k1, a[1] + (b[1] - a[1]) * k1);
      if (len > l1) { const k2 = (len - l1) / l2; g.lineTo(b[0] + (d[0] - b[0]) * k2, b[1] + (d[1] - b[1]) * k2); }
      stroke(go(1), 5);
    }
    if (!warm && i < ROWS - 1) { g.fillStyle = ice(0.1); g.fillRect(44, y + ROW_PITCH - 1, 680, 1.5); }
  }

  // ── the sum, and the sign-off
  g.fillStyle = all ? mixed(c, 0.5) : ice(0.28); g.fillRect(44, 862, 680, 1.5);
  rr(g, 44, 886, 110, 12, 6); fill(ice(0.4));
  const sum = 230 * prog;
  if (sum > 1) { rr(g, 724 - sum, 878, sum, 28, 9); fill(c > 0.5 ? go(0.95) : warm ? amber(0.95) : ice(0.92)); }
  if (c < 0.999) { g.globalAlpha = 1 - c; g.setLineDash([8, 7]); g.beginPath(); g.moveTo(44, 968); g.lineTo(250, 968); stroke(edge(all ? 0.5 : 0.26), 1.5); g.beginPath(); g.arc(690, 950, 26, 0, Math.PI * 2); stroke(edge(all ? 0.5 : 0.22), 1.5); g.setLineDash([]); g.globalAlpha = 1; }
  if (c > 0.01) {
    // a signature, written from left to right, and a round stamp with a tick in it
    g.save(); g.beginPath(); g.rect(40, 916, 230 * c, 70); g.clip();
    g.beginPath(); g.moveTo(52, 962); g.bezierCurveTo(70, 916, 88, 916, 92, 956); g.bezierCurveTo(96, 984, 116, 924, 130, 950); g.bezierCurveTo(140, 970, 150, 938, 166, 952); g.bezierCurveTo(186, 966, 214, 944, 250, 946);
    stroke(go(1), 3.5); g.restore();
    g.globalAlpha = c;
    g.beginPath(); g.arc(690, 950, 26, 0, Math.PI * 2); fill(go(0.16)); stroke(go(1), 2.5);
    g.beginPath(); g.moveTo(678, 951); g.lineTo(687, 960); g.lineTo(703, 940); stroke(go(1), 4.5);
    g.globalAlpha = 1;
  }
  for (let i = 0; i < ROWS; i++) {
    rr(g, 44 + i * 138, 1000, 128, 6, 3); fill(warm ? work(0.22) : ice(0.14));
    if (s.ticked[i] > 0.01) { rr(g, 44 + i * 138, 1000, 128 * s.ticked[i], 6, 3); fill(c > 0.5 ? go(1) : mixed(s.ticked[i], 1)); }
  }
}

export function buildConsole(mobile: boolean, gltf: GLTF | null, casefile: THREE.Texture, hero: THREE.Texture, file: FileLook = FILE_LOOK): Console {
  const group = new THREE.Group();
  group.position.set(-3.25, 0, -2.75);
  group.rotation.y = 0.5;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ── body: the scanned plinth; its slot and edge lines are in its own light map
  let skin: THREE.MeshStandardMaterial | null = null;
  if (gltf) {
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      skin = m.material as THREE.MeshStandardMaterial;
      skin.envMapIntensity = 0.9;
      skin.emissive.setScalar(1);
    });
    group.add(gltf.scene);
  }
  const slotLight = new THREE.PointLight(ICE, 0.5, 2.2, 1.8);
  slotLight.position.set(0, 1.15, -0.2);
  group.add(slotLight);

  // ── the case file: pages and photos, instanced; each card is a piece of one of the two pictures
  for (const tex of [casefile, hero]) { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; }
  const SHEETS = hung(mobile ? SHEETS_NARROW : SHEETS_WIDE, file, mobile);
  const N_CARDS = SHEETS.length;
  const quat = new THREE.Quaternion();
  const cardGeo = keep(new THREE.PlaneGeometry(1, 1, 8, 1));
  const cell = new Float32Array(N_CARDS);
  const seed = new Float32Array(N_CARDS);
  const fade = new Float32Array(N_CARDS);
  const flat = new Float32Array(N_CARDS);
  const soft = new Float32Array(N_CARDS * 2); // blur, dim
  const r = rng(11);
  const spin: THREE.Quaternion[] = [];
  const rest: THREE.Quaternion[] = [];
  const from: THREE.Vector3[] = [];
  for (let i = 0; i < N_CARDS; i++) {
    const sh = SHEETS[i];
    cell[i] = sh.cell;
    seed[i] = r() * 10;
    spin.push(new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 1.5, (r() - 0.5) * 2.2, (r() - 0.5) * 1.3)));
    rest.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(sh.turn[0] * RAD, sh.turn[1] * RAD, sh.turn[2] * RAD, "YXZ")));
    // where it comes from: out of the frame, below and to the side, and nearer than where it will hang
    from.push(new THREE.Vector3(sh.x + (r() - 0.62) * 0.7, 1.25 + sh.h * 0.6 + r() * 0.5, sh.depth * (0.5 + r() * 0.25)));
  }
  cardGeo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 1));
  cardGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
  const fadeAttr = new THREE.InstancedBufferAttribute(fade, 1);
  fadeAttr.setUsage(THREE.DynamicDrawUsage);
  cardGeo.setAttribute("aFade", fadeAttr);
  const flatAttr = new THREE.InstancedBufferAttribute(flat, 1);
  flatAttr.setUsage(THREE.DynamicDrawUsage);
  cardGeo.setAttribute("aFlat", flatAttr);
  const softAttr = new THREE.InstancedBufferAttribute(soft, 2);
  softAttr.setUsage(THREE.DynamicDrawUsage);
  cardGeo.setAttribute("aSoft", softAttr);
  const cardMat = keep(new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: { uMap: { value: casefile }, uHero: { value: hero }, uIce: { value: ICE.clone() } },
    vertexShader: `
      attribute float aCell; attribute float aSeed; attribute float aFade; attribute float aFlat; attribute vec2 aSoft;
      varying vec2 vUv; varying float vCell; varying float vSeed; varying float vFade; varying vec2 vSoft; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv; vCell = aCell; vSeed = aSeed; vFade = aFade; vSoft = aSoft;
        // paper in the air is never flat: a soft curl across the sheet, gone by the time it stands in the slot
        float curl = (0.07 + 0.05 * sin(aSeed * 3.7)) * (1.0 - aFlat);
        float x = position.x;
        vec3 p = vec3(position.xy, curl * (x * x * 4.0 - 0.33) + 0.02 * (1.0 - aFlat) * sin(aSeed * 5.0 + position.y * 3.0));
        vec3 n = normalize(vec3(-curl * 8.0 * x, 0.0, 1.0));
        mat4 m = modelMatrix * instanceMatrix;
        vec4 w = m * vec4(p, 1.0);
        vN = normalize(mat3(m) * n);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform sampler2D uHero; uniform vec3 uIce;
      varying vec2 vUv; varying float vCell; varying float vSeed; varying float vFade; varying vec2 vSoft; varying vec3 vN; varying vec3 vV;
      const vec3 PAPER = vec3(0.93, 0.95, 0.97);
      // the sheet's own picture at uv: a page fills its sheet, and so does a photo (no white border round the print).
      // dx, dy say how coarse a copy of the picture to read; they are worked out once, outside any branch.
      vec3 sheet(vec2 uv, vec2 dx, vec2 dy){
        uv = clamp(uv, 0.0, 1.0);
        bool heroCell = vCell > 11.5;
        bool photo = heroCell ? vCell > 12.5 : vCell > 5.5;
        vec2 q = photo ? clamp(uv, 0.004, 0.996) : uv;
        vec3 c;
        if (heroCell) {
          vec2 a = photo ? vec2(880.0 + q.x * 1168.0, (1.0 - q.y) * 880.0) : vec2(q.x * 880.0, (1.0 - q.y) * 1168.0);
          vec2 k = (photo ? vec2(1168.0, 880.0) : vec2(880.0, 1168.0)) / vec2(2048.0, 1168.0);
          c = textureGrad(uHero, vec2(a.x / 2048.0, 1.0 - a.y / 1168.0), dx * k, dy * k).rgb;
        } else {
          // a whole number that has come through the rasteriser is only nearly whole
          float cell = floor(vCell + 0.5);
          vec2 at = vec2(mod(cell, 4.0), floor(cell / 4.0));
          vec2 a = photo ? vec2(q.x, mix(63.0, 449.0, 1.0 - q.y) / 512.0) : vec2(mix(64.0, 448.0, q.x), mix(1.0, 511.0, 1.0 - q.y)) / 512.0;
          vec2 k = (photo ? vec2(512.0, 386.0) : vec2(384.0, 510.0)) / vec2(2048.0, 1536.0);
          a = (at + a) / vec2(4.0, 3.0);
          c = textureGrad(uMap, vec2(a.x, 1.0 - a.y), dx * k, dy * k).rgb;
        }
        return c;
      }
      void main(){
        float blur = vSoft.x;
        vec2 dx = dFdx(vUv), dy = dFdy(vUv);
        vec3 col;
        if (blur < 0.0015) col = sheet(vUv, dx, dy);
        else {
          // out of focus: the picture is taken a little to every side and from a coarser copy of itself
          float coarse = max(1.0, blur * 240.0);
          dx *= coarse; dy *= coarse;
          col = sheet(vUv, dx, dy) * 2.0;
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.7853982 + vSeed;
            float rad = blur * (i - (i / 2) * 2 == 0 ? 1.0 : 0.55);
            col += sheet(vUv + vec2(cos(a), sin(a) * 0.75) * rad, dx, dy);
          }
          col /= 10.0;
        }
        vec3 n = normalize(vN);
        // the back of a sheet is blank paper
        if (!gl_FrontFacing) { n = -n; col = PAPER * 0.82; }
        vec3 v = normalize(vV);
        // lit by the room: the tubes overhead, the cold light of the slot below, a glint when a sheet turns through the light
        float top = 0.5 + 0.5 * n.y;
        float face = abs(dot(n, v));
        vec3 h = normalize(v + normalize(vec3(-0.3, 1.0, -0.2)));
        float glint = pow(max(dot(n, h), 0.0), 60.0);
        vec3 lit = col * (0.2 + 0.5 * top + 0.22 * face) * vSoft.y + uIce * (0.06 * (1.0 - top) + 0.28 * glint) * vSoft.y;
        // a sheet out of focus has no hard edge either
        vec2 e = min(vUv, 1.0 - vUv);
        float w = max(blur * 1.6, 0.0012);
        float edge = smoothstep(0.0, w, e.x) * smoothstep(0.0, w * 0.75, e.y);
        float alpha = vFade * edge;
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(lit, alpha);
      }`,
  }));
  const cards = new THREE.InstancedMesh(cardGeo, cardMat, N_CARDS);
  cards.frustumCulled = false;
  cards.renderOrder = 6;
  // the near sheets throw a soft shadow on whatever hangs behind them
  const shadowed = SHEETS.map((sh, i) => (sh.shadow ? i : -1)).filter((i) => i >= 0);
  const shadeGeo = keep(new THREE.PlaneGeometry(1, 1));
  const shadeFade = new Float32Array(shadowed.length);
  const shadeAttr = new THREE.InstancedBufferAttribute(shadeFade, 1);
  shadeAttr.setUsage(THREE.DynamicDrawUsage);
  shadeGeo.setAttribute("aFade", shadeAttr);
  const shadeMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: "attribute float aFade; varying vec2 vUv; varying float vFade; void main(){ vUv = uv; vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      varying vec2 vUv; varying float vFade;
      void main(){
        vec2 e = min(vUv, 1.0 - vUv);
        float a = smoothstep(0.0, 0.2, e.x) * smoothstep(0.0, 0.2, e.y);
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * vFade);
      }`,
  }));
  const shades = new THREE.InstancedMesh(shadeGeo, shadeMat, shadowed.length);
  shades.frustumCulled = false;
  shades.renderOrder = 5;
  // cards live in world space, not under the rotated console
  const world = new THREE.Group();

  // ── the glass claim form: three layers, a hand apart, so it has depth when the picture moves
  const form = new THREE.Group();
  const slab = new THREE.Group(); // its origin is the top edge: it unrolls downward from under the ball
  form.add(slab);
  const glassMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uUp: { value: 0 }, uTime: { value: 0 }, uTint: { value: (LOOK >= 2 ? AMBER : ICE).clone() } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uUp; uniform float uTime; uniform vec3 uTint; varying vec2 vUv;
      void main(){
        vec2 p = vUv * vec2(${(FORM_W * 100).toFixed(1)}, ${(FORM_H * 100).toFixed(1)});
        // smoked glass, a touch of the tint; a fine dot grid; one soft band of light that travels down it
        vec2 gq = abs(fract(p / 2.4) - 0.5);
        float dots = 1.0 - smoothstep(0.0, 0.09, length(gq));
        float band = exp(-pow((fract(vUv.y + uTime * 0.11) - 0.5) / 0.07, 2.0));
        vec2 e = min(vUv, 1.0 - vUv) * vec2(${(FORM_W * 100).toFixed(1)}, ${(FORM_H * 100).toFixed(1)});
        float edge = 1.0 - smoothstep(0.0, 2.6, min(e.x, e.y));
        vec3 col = vec3(0.012, 0.02, 0.03) + uTint * (0.025 + 0.05 * dots + 0.05 * band + 0.12 * edge + 0.035 * vUv.y);
        gl_FragColor = vec4(col, (0.74 + 0.1 * edge) * uUp);
      }`,
  }));
  const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(FORM_W, FORM_H)), glassMat);
  glass.position.set(0, -FORM_H / 2, -0.012);
  glass.renderOrder = 20;
  slab.add(glass);

  const canvas = document.createElement("canvas");
  canvas.width = mobile ? 576 : CW;
  canvas.height = mobile ? 768 : CH;
  const g2 = canvas.getContext("2d")!;
  g2.scale(canvas.width / CW, canvas.height / CH);
  const sheetTex = keep(new THREE.CanvasTexture(canvas));
  sheetTex.colorSpace = THREE.SRGBColorSpace;
  sheetTex.anisotropy = 4;
  const sheetMat = keep(new THREE.MeshBasicMaterial({ map: sheetTex, color: glow(new THREE.Color(0xffffff), 1.45), transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false }));
  const sheet = new THREE.Mesh(keep(new THREE.PlaneGeometry(FORM_W, FORM_H)), sheetMat);
  sheet.position.set(0, -FORM_H / 2, 0);
  sheet.renderOrder = 21;
  slab.add(sheet);

  // the frame: a hairline all round, heavier corner brackets standing a little in front of the glass
  const frameMat = keep(new THREE.LineBasicMaterial({ color: glow(ICE, 1.2), transparent: true, depthWrite: false, depthTest: false }));
  const fw = FORM_W / 2 + 0.012;
  const fh = FORM_H + 0.012;
  const outline = new THREE.LineLoop(keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-fw, 0.012, 0), new THREE.Vector3(fw, 0.012, 0), new THREE.Vector3(fw, -fh, 0), new THREE.Vector3(-fw, -fh, 0)])), frameMat);
  outline.renderOrder = 22;
  slab.add(outline);
  const bracketMat = keep(new THREE.MeshBasicMaterial({ color: glow(ICE, 2), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
  const arm = 0.07;
  const th = 0.006;
  const bw = FORM_W / 2 + 0.03;
  const bh = FORM_H + 0.03;
  const bar = keep(new THREE.PlaneGeometry(1, 1));
  for (const sx of [-1, 1]) for (const top of [0, 1]) {
    const y = top ? 0.03 : -bh;
    const hz = new THREE.Mesh(bar, bracketMat);
    hz.scale.set(arm, th, 1); hz.position.set(sx * (bw - arm / 2), y, 0.02);
    const vt = new THREE.Mesh(bar, bracketMat);
    vt.scale.set(th, arm, 1); vt.position.set(sx * bw, y + (top ? -1 : 1) * arm / 2, 0.02);
    hz.renderOrder = vt.renderOrder = 23;
    slab.add(hz, vt);
  }

  // what each row writes: bars of different lengths, the same on every load
  const rr5 = rng(5);
  const widths = Array.from({ length: ROWS }, () => [150 + rr5() * 90, 70 + rr5() * 60, 60 + rr5() * 50]);
  const state: FormState = { typed: [0, 0, 0, 0, 0], ticked: [0, 0, 0, 0, 0], closing: 0 };
  let drawn = "";

  const P0 = new THREE.Vector3();
  const P1 = new THREE.Vector3();
  const P2 = new THREE.Vector3();
  const P3 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const endQ = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const hang = new THREE.Vector3();
  const eul = new THREE.Euler();
  const tint = new THREE.Color();
  const GO_C = new THREE.Color(0x3ddc97);

  group.updateMatrixWorld(true);
  world.add(shades, cards);

  function set(t: number, time: number, viewer: Viewer) {
    group.updateMatrixWorld(true);
    // ── the case file: it gathers in front of the viewer, hangs there, then goes down into the slot sheet by sheet
    P3.set(SLOT.x, SLOT.y + 0.03, SLOT.z).applyMatrix4(group.matrixWorld);
    P2.set(0, 2.25, -0.55).applyMatrix4(group.matrixWorld);
    group.getWorldQuaternion(endQ);
    // stand the card upright in the slot, tilted back with the slope
    endQ.multiply(tmpQ.setFromEuler(new THREE.Euler(-0.3, Math.PI, 0)));
    const coming = clamp01((t - FILE_IN[0]) / (FILE_IN[1] - FILE_IN[0]));
    const going = clamp01((t - FILE_OUT[0]) / (FILE_OUT[1] - FILE_OUT[0]));
    let s = 0;
    for (let i = 0; i < N_CARDS; i++) {
      const sh = SHEETS[i];
      const phi = i / (N_CARDS - 1);
      // in: the far sheets first, the near ones last, each easing to a stop
      const a = clamp01((coming - phi * 0.5) / 0.5);
      const arrive = 1 - Math.pow(1 - a, 3);
      // out: the same order; the sheet nearest the viewer is the last to go
      const q = clamp01((going - phi * 0.6) / 0.4);
      const e = q * q * (3 - 2 * q);
      const u = lerp(e, q, 0.35);
      // where it hangs: it is never quite still
      const drift = time * 0.0011 + seed[i];
      const sway = time ? 1 : 0;
      viewer.at(sh.x + Math.sin(drift * 0.7) * 0.004 * sway, sh.y + Math.sin(drift) * 0.007 * sway, sh.depth, hang);
      viewer.at(from[i].x, from[i].y, from[i].z, p);
      p.lerp(hang, arrive);
      quat.copy(viewer.quat).multiply(tmpQ.copy(spin[i]).slerp(rest[i], arrive));
      if (sway) quat.multiply(tmpQ.setFromEuler(eul.set(Math.sin(drift * 0.8) * 0.012, Math.sin(drift * 0.6 + 1) * 0.02, 0)));
      const tall = viewer.tall(sh.depth) * sh.h;
      const page = isPage(sh.cell);
      sc.set(tall * (page ? PAGE_ASPECT : PHOTO_ASPECT), tall, 1);
      let sink = 1;
      if (u > 0) {
        // down to the machine: up a little first, over the slot, then in
        const iu = 1 - u;
        P1.copy(p).lerp(P2, 0.45).addScaledVector(viewer.up, 0.35);
        p.multiplyScalar(iu * iu * iu)
          .addScaledVector(P1, 3 * iu * iu * u)
          .addScaledVector(P2, 3 * iu * u * u)
          .addScaledVector(P3, u * u * u);
        quat.slerp(endQ, smooth(u * 1.35));
        sink = 1 - seg(u, 0.93, 1);
        const k = smooth(Math.min(1, u * 1.5));
        sc.set(lerp(sc.x, page ? 0.34 : 0.44, k), lerp(sc.y, page ? 0.452 : 0.332, k) * lerp(0.25, 1, sink), 1);
      }
      m4.compose(p, quat, sc);
      cards.setMatrixAt(i, m4);
      const shown = a <= 0 || q >= 1 ? 0 : Math.min(1, a * 5) * sink;
      fade[i] = shown;
      // big and near, a sheet is almost flat; in flight it curls; in the slot it is flat again
      flat[i] = Math.max(0.86 * arrive * (1 - smooth(u * 3)), smooth(u * 1.2));
      // the eye follows the file into the machine: what was out of focus comes sharp, what was dim comes into the slot's light
      const follow = smooth(u * 1.6);
      soft[i * 2] = sh.blur * (1 - follow) * (0.6 + 0.4 * arrive);
      soft[i * 2 + 1] = lerp(sh.dim, 1, follow);
      if (sh.shadow) {
        // its shadow: a little behind it, a little lower, wider than the sheet
        hang.copy(p).addScaledVector(viewer.up, -sc.y * 0.05);
        hang.addScaledVector(P0.set(0, 0, -1).applyQuaternion(viewer.quat), 0.03);
        m4.compose(hang, quat, P0.set(sc.x * 1.22, sc.y * 1.2, 1));
        shades.setMatrixAt(s, m4);
        shadeFade[s] = shown * arrive * (1 - smooth(u * 2.5)) * 0.62;
        s++;
      }
    }
    cards.instanceMatrix.needsUpdate = true;
    shades.instanceMatrix.needsUpdate = true;
    fadeAttr.needsUpdate = flatAttr.needsUpdate = softAttr.needsUpdate = shadeAttr.needsUpdate = true;
    cards.visible = shades.visible = coming > 0 && going < 1;

    // the slot: awake while the file is going in, steady afterwards
    const feeding = seg(t, FILE_OUT[0], FILE_OUT[0] + 0.03) * (1 - seg(t, FILE_OUT[1] - 0.005, FILE_OUT[1] + 0.025));
    const shimmer = 0.85 + 0.15 * Math.sin(time * 0.006);
    if (skin) (skin as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + feeding * 3.4 * shimmer;
    slotLight.intensity = 0.4 + feeding * 2.6;

    // ── glass form: opens for the keying; signed off, it rolls back up so the ending is clear
    const up = seg(t, 0.6, 0.66) * (1 - seg(t, 0.868, 0.915));
    form.visible = up > 0.001;
    if (!form.visible) return;
    slab.scale.set(lerp(0.9, 1, up), Math.max(0.001, up), 1);
    const closing = seg(t, 0.83, 0.862); // signed off
    tint.copy(LOOK >= 2 ? AMBER : ICE).lerp(GO_C, closing);
    glassMat.uniforms.uUp.value = up;
    glassMat.uniforms.uTime.value = time * 0.001;
    // amber glass goes muddy fast: the pane itself takes about half of the colour, the frame all of it
    glassMat.uniforms.uTint.value.copy(tint).multiplyScalar(LOOK >= 2 ? lerp(0.5, 1, closing) : 1);
    frameMat.color.copy(tint).multiplyScalar(1.2);
    frameMat.opacity = up;
    bracketMat.color.copy(tint).multiplyScalar(2);
    bracketMat.opacity = up;
    sheetMat.opacity = seg(up, 0.55, 1);
    let key = closing.toFixed(2);
    for (let i = 0; i < ROWS; i++) {
      const t0 = 0.652 + i * 0.031;
      state.typed[i] = seg(t, t0, t0 + 0.034);
      state.ticked[i] = seg(t, t0 + 0.036, t0 + 0.05);
      key += `|${state.typed[i].toFixed(2)}|${state.ticked[i].toFixed(1)}`;
    }
    state.closing = closing;
    if (key !== drawn) { drawn = key; drawForm(g2, state, widths); sheetTex.needsUpdate = true; }
  }

  function rowAnchor(rIdx: number, out: THREE.Vector3) {
    const y = (ROW_Y0 + rIdx * ROW_PITCH + ROW_PITCH / 2) / CH;
    out.set(-FORM_W / 2 - 0.012, -y * FORM_H, 0);
    slab.updateWorldMatrix(true, false);
    return slab.localToWorld(out);
  }

  const root = new THREE.Group();
  root.add(group, world, form);
  form.visible = false;

  return {
    group: root,
    form,
    rowAnchor,
    set,
    slotWorld(out) { group.updateMatrixWorld(true); return out.copy(SLOT).applyMatrix4(group.matrixWorld); },
    dispose() { for (const d of disposables) d.dispose(); casefile.dispose(); hero.dispose(); },
  };
}

export const DAMAGED_ROWS = ROWS;
