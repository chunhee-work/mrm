import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clamp01, lerp, rng, seg, smooth } from "./math";
import { ICE, glow } from "./room";

/**
 * The intake console beside the car (a scanned model), and everything that happens at it:
 *   Upload     the case file flies in and drops into the slot: the pages an adjuster knows (ownership certificate,
 *              insurance schedule, police report, sketch plan, search result) and the damage photos
 *   Autopilot  a glass claim form opens under the scan ball; one row per damaged part types itself and is ticked,
 *              and the same part turns from amber to green on the form's own drawing of the car
 * No words anywhere: every line of writing is a bar.
 */

const N_CARDS = 34;
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
// the picture of the case file: 4 x 3 cells; six pages first, then six photos
const DOCS = 6;
const CELLS = 12;

export type Console = {
  group: THREE.Group;
  /** the claim form: place it and turn it every frame (it hangs in front of the viewer) */
  form: THREE.Group;
  /** world position of the left end of row r on the glass form (where a leader line lands) */
  rowAnchor(r: number, out: THREE.Vector3): THREE.Vector3;
  set(t: number, time: number): void;
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

  // ── heading, and the state of the whole claim on the right
  rr(g, 44, 48, 250, 26, 6); fill(ice(0.95));
  rr(g, 44, 88, 150, 11, 5); fill(ice(0.38));
  rr(g, 548, 46, 176, 54, 27); fill(mixed(c, 0.1)); stroke(mixed(c, 0.9), 2);
  g.beginPath(); g.arc(578, 73, 8, 0, Math.PI * 2); fill(mixed(c, 1));
  rr(g, 598, 66, 96 * (0.3 + 0.7 * prog), 14, 7); fill(mixed(c, 0.9));

  // ── the car, seen from above, nose to the left; the five damaged parts are marked on it
  rr(g, 44, 140, 680, 270, 14); fill(ice(0.035)); stroke(ice(0.22), 1.5);
  g.strokeStyle = ice(0.2); g.lineWidth = 1;
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
    if (live) { rr(g, 44, y + 4, 680, ROW_PITCH - 8, 10); fill(amber(0.1)); rr(g, 44, y + 4, 5, ROW_PITCH - 8, 2); fill(amber(0.95)); }
    else if (k >= 0.999) { rr(g, 44, y + 4, 680, ROW_PITCH - 8, 10); fill(go(0.045)); }
    rr(g, 64, y + 26, 30, 30, 8);
    if (typed > 0.001) fill(mixed(k, 0.92)); else stroke(ice(0.3), 1.5);
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
      rr(g, 116, y + 30, 150, 10, 5); fill(ice(0.1));
    }
    rr(g, 672, y + 25, 32, 32, 8); stroke(k > 0.01 ? go(0.4 + 0.6 * k) : ice(typed > 0.001 ? 0.6 : 0.28), 2);
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
    if (i < ROWS - 1) { g.fillStyle = ice(0.1); g.fillRect(44, y + ROW_PITCH - 1, 680, 1.5); }
  }

  // ── the sum, and the sign-off
  g.fillStyle = ice(0.28); g.fillRect(44, 862, 680, 1.5);
  rr(g, 44, 886, 110, 12, 6); fill(ice(0.4));
  const sum = 230 * prog;
  if (sum > 1) { rr(g, 724 - sum, 878, sum, 28, 9); fill(c > 0.5 ? go(0.95) : ice(0.92)); }
  if (c < 0.999) { g.globalAlpha = 1 - c; g.setLineDash([8, 7]); g.beginPath(); g.moveTo(44, 968); g.lineTo(250, 968); stroke(ice(0.26), 1.5); g.beginPath(); g.arc(690, 950, 26, 0, Math.PI * 2); stroke(ice(0.22), 1.5); g.setLineDash([]); g.globalAlpha = 1; }
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
    rr(g, 44 + i * 138, 1000, 128, 6, 3); fill(ice(0.14));
    if (s.ticked[i] > 0.01) { rr(g, 44 + i * 138, 1000, 128 * s.ticked[i], 6, 3); fill(c > 0.5 ? go(1) : mixed(s.ticked[i], 1)); }
  }
}

export function buildConsole(mobile: boolean, gltf: GLTF | null, casefile: THREE.Texture): Console {
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

  // ── the case file: pages and photos, instanced; each card is a piece of the one picture
  casefile.colorSpace = THREE.SRGBColorSpace;
  casefile.anisotropy = 4;
  const quat = new THREE.Quaternion();
  const cardGeo = keep(new THREE.PlaneGeometry(1, 1, 8, 1));
  const cell = new Float32Array(N_CARDS);
  const seed = new Float32Array(N_CARDS);
  const fade = new Float32Array(N_CARDS);
  const flat = new Float32Array(N_CARDS);
  const r = rng(11);
  const spin: THREE.Quaternion[] = [];
  const jitter: THREE.Vector3[] = [];
  let photo = 0;
  for (let i = 0; i < N_CARDS; i++) {
    // a page, then a photo, in the order of the bundle: whenever you look, the stream shows both
    cell[i] = i % 2 === 0 ? (i / 2) % DOCS : DOCS + (photo++ % (CELLS - DOCS));
    seed[i] = r() * 10;
    spin.push(new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 1.5, (r() - 0.5) * 2.2, (r() - 0.5) * 1.3)));
    jitter.push(new THREE.Vector3((r() - 0.5) * 1.5, (r() - 0.5) * 1.1, (r() - 0.5) * 1.5));
  }
  cardGeo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 1));
  cardGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
  const fadeAttr = new THREE.InstancedBufferAttribute(fade, 1);
  fadeAttr.setUsage(THREE.DynamicDrawUsage);
  cardGeo.setAttribute("aFade", fadeAttr);
  const flatAttr = new THREE.InstancedBufferAttribute(flat, 1);
  flatAttr.setUsage(THREE.DynamicDrawUsage);
  cardGeo.setAttribute("aFlat", flatAttr);
  const cardMat = keep(new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    uniforms: { uMap: { value: casefile }, uIce: { value: ICE.clone() } },
    vertexShader: `
      attribute float aCell; attribute float aSeed; attribute float aFade; attribute float aFlat;
      varying vec2 vUv; varying float vCell; varying float vSeed; varying float vFade; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv; vCell = aCell; vSeed = aSeed; vFade = aFade;
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
      uniform sampler2D uMap; uniform vec3 uIce;
      varying vec2 vUv; varying float vCell; varying float vSeed; varying float vFade; varying vec3 vN; varying vec3 vV;
      void main(){
        float isPhoto = step(5.5, vCell);
        vec2 at = vec2(mod(vCell, 4.0), floor(vCell / 4.0));
        vec2 uv = vUv;
        vec3 paper = vec3(0.93, 0.95, 0.97);
        vec3 col;
        if (isPhoto > 0.5) {
          // a print: a white border round the picture
          vec2 b = vec2(0.03, 0.04);
          vec2 q = (uv - b) / (1.0 - 2.0 * b);
          float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
          vec2 a = (at + vec2(q.x, mix(63.0, 449.0, 1.0 - q.y) / 512.0)) / vec2(4.0, 3.0);
          col = mix(paper, texture2D(uMap, vec2(a.x, 1.0 - a.y)).rgb, inside);
        } else {
          vec2 a = (at + vec2(mix(64.0, 448.0, uv.x), mix(1.0, 511.0, 1.0 - uv.y)) / 512.0) / vec2(4.0, 3.0);
          col = texture2D(uMap, vec2(a.x, 1.0 - a.y)).rgb;
        }
        vec3 n = normalize(vN);
        // the back of a sheet is blank paper
        if (!gl_FrontFacing) { n = -n; col = paper * 0.82; }
        vec3 v = normalize(vV);
        // lit by the room: the tubes overhead, the cold light of the slot below, a glint when a sheet turns through the light
        float top = 0.5 + 0.5 * n.y;
        float face = abs(dot(n, v));
        vec3 h = normalize(v + normalize(vec3(-0.3, 1.0, -0.2)));
        float glint = pow(max(dot(n, h), 0.0), 60.0);
        vec3 lit = col * (0.2 + 0.5 * top + 0.22 * face) + uIce * (0.06 * (1.0 - top) + 0.28 * glint);
        gl_FragColor = vec4(lit, vFade);
      }`,
  }));
  const cards = new THREE.InstancedMesh(cardGeo, cardMat, N_CARDS);
  cards.frustumCulled = false;
  cards.renderOrder = 6;
  // cards live in world space, not under the rotated console
  const world = new THREE.Group();

  // ── the glass claim form: three layers, a hand apart, so it has depth when the picture moves
  const form = new THREE.Group();
  const slab = new THREE.Group(); // its origin is the top edge: it unrolls downward from under the ball
  form.add(slab);
  const glassMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uUp: { value: 0 }, uTime: { value: 0 }, uTint: { value: ICE.clone() } },
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
  const tint = new THREE.Color();
  const GO_C = new THREE.Color(0x3ddc97);

  group.updateMatrixWorld(true);
  world.add(cards);

  function set(t: number, time: number) {
    group.updateMatrixWorld(true);
    // ── cards: along a curve from behind the viewer's shoulder down into the slot
    P3.set(SLOT.x, SLOT.y + 0.03, SLOT.z).applyMatrix4(group.matrixWorld);
    P2.set(0, 2.25, -0.55).applyMatrix4(group.matrixWorld);
    P1.set(P3.x - 0.6, 3.1, P3.z - 2.6);
    P0.set(P3.x - 1.7, 3.6, P3.z - 5.2);
    group.getWorldQuaternion(endQ);
    // stand the card upright in the slot, tilted back with the slope
    endQ.multiply(tmpQ.setFromEuler(new THREE.Euler(-0.3, Math.PI, 0)));
    const tau = clamp01((t - 0.075) / (0.305 - 0.075));
    for (let i = 0; i < N_CARDS; i++) {
      const phi = i / (N_CARDS - 1);
      const q = clamp01((tau - phi * 0.72) / 0.28);
      const e = q * q * (3 - 2 * q);
      const u = lerp(e, q, 0.35);
      const iu = 1 - u;
      p.set(0, 0, 0)
        .addScaledVector(P0, iu * iu * iu)
        .addScaledVector(P1, 3 * iu * iu * u)
        .addScaledVector(P2, 3 * iu * u * u)
        .addScaledVector(P3, u * u * u);
      const loose = (1 - smooth(u * 1.25)) * 0.9;
      p.addScaledVector(jitter[i], loose);
      const drift = time * 0.0015 + seed[i]; // the same slow breath as everything else in the air
      p.y += Math.sin(drift) * 0.03 * loose;
      quat.copy(spin[i]).slerp(endQ, smooth(u * 1.35));
      const isDoc = cell[i] < DOCS;
      const sink = 1 - seg(u, 0.93, 1);
      sc.set(isDoc ? 0.34 : 0.44, (isDoc ? 0.452 : 0.332) * lerp(0.25, 1, sink), 1);
      m4.compose(p, quat, sc);
      cards.setMatrixAt(i, m4);
      fade[i] = q <= 0 || q >= 1 ? 0 : Math.min(1, q * (mobile ? 2 : 9)) * sink;
      flat[i] = smooth(u * 1.2);
    }
    cards.instanceMatrix.needsUpdate = true;
    fadeAttr.needsUpdate = true;
    flatAttr.needsUpdate = true;
    cards.visible = tau > 0 && tau < 1;

    // the slot: awake while the file is going in, steady afterwards
    const feeding = seg(t, 0.08, 0.14) * (1 - seg(t, 0.29, 0.33));
    const shimmer = 0.85 + 0.15 * Math.sin(time * 0.006);
    if (skin) (skin as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + feeding * 3.4 * shimmer;
    slotLight.intensity = 0.4 + feeding * 2.6;

    // ── glass form: opens for the keying; signed off, it rolls back up so the ending is clear
    const up = seg(t, 0.6, 0.66) * (1 - seg(t, 0.868, 0.915));
    form.visible = up > 0.001;
    if (!form.visible) return;
    slab.scale.set(lerp(0.9, 1, up), Math.max(0.001, up), 1);
    const closing = seg(t, 0.83, 0.862); // signed off
    tint.copy(ICE).lerp(GO_C, closing);
    glassMat.uniforms.uUp.value = up;
    glassMat.uniforms.uTime.value = time * 0.001;
    glassMat.uniforms.uTint.value.copy(tint);
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
    dispose() { for (const d of disposables) d.dispose(); casefile.dispose(); },
  };
}

export const DAMAGED_ROWS = ROWS;
