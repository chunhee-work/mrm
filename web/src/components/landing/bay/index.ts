import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { BOT_R, buildBot, type Face } from "./bot";
import { buildLogo } from "./logo";
import { buildCar, type Part } from "./car";
import { FORM_H, buildConsole, type Viewer } from "./console";
import { AMBER, BAY, GO, ICE, buildEnvironment, buildRoom, glow } from "./room";
import { clamp01, lerp, pulse, rng, seg, smooth } from "./math";

/**
 * The night bay. One function of `t`:
 *   0     the car at rest on its turntable, the scan ball waiting beside it
 *   0.2   Upload     the case file flies into the console; the ball watches it go in
 *   0.45  Scan       the ball flies round the car and reads every panel, then stops above its damaged corner
 *   0.7   Autopilot  the car turns once all the way round as it comes apart; the damaged parts are keyed, row by row, on a glass form
 *   1     Done       the car is whole again and turns to face you, lamps on; the ball flies into the logo and becomes its "o"
 * The car turns a little with every stretch of the page, so the turntable's heading is a function of `t` too.
 * `render(time)` adds only idle motion: dust, a breath of camera drift, and, once the page has stopped
 * moving, a slow rise and fall of everything that is in the air. Pass 0 for a still.
 */

export type BayOptions = { mobile: boolean };
/** where the logo's "o" is on the page, in CSS pixels from the canvas's top left corner */
/** Where the page keeps the logo's place at the ending, in canvas pixels: the middle and width of the wordmark, and the middle and height of the whole block of words under it. */
export type Dock = { cx: number; cy: number; w: number; by: number; bh: number };
export type Bay = { setProgress(t: number): void; setDock(d: Dock | null): void; /** where the viewer's mouse is in the frame, -1..1 each way (right and up are positive); the head lamps lean after it at the ending */ setPointer(x: number, y: number): void; render(timeMs: number): void; resize(): void; /** drop one step of quality; false when there is nothing left to drop */ degrade(): boolean; dispose(): void };

type V3 = [number, number, number];
type Key = { pos: V3; look: V3; fov: number; shift: [number, number] };
// shift: where the picture's centre sits in the frame, as a fraction of width / height (+x = right, +y = down)
const DESKTOP: Key[] = [
  { pos: [4.9, 1.15, -6.3], look: [0.2, 0.62, 0], fov: 31, shift: [0.2, 0.03] },
  { pos: [-6.5, 1.75, -5.3], look: [-2.8, 1.0, -2.15], fov: 34, shift: [0.11, 0.05] },
  { pos: [0.4, 1.3, -7.9], look: [-0.1, 0.9, 0], fov: 30, shift: [0.1, -0.03] },
  { pos: [1.0, 2.9, -7.9], look: [0.0, 0.7, -0.1], fov: 31, shift: [0.02, 0.09] },
  { pos: [0, 0.82, -8.4], look: [0, 0.8, 0], fov: 30, shift: [0, 0.27] },
];
const MOBILE: Key[] = [
  { pos: [7.9, 2.2, -4.3], look: [0.1, 0.6, 0], fov: 50, shift: [0, 0.13] },
  { pos: [-6.6, 2.4, -7.2], look: [-2.95, 1.05, -2.5], fov: 48, shift: [0, 0.25] },
  { pos: [0.3, 1.6, -11.2], look: [0, 0.9, 0], fov: 50, shift: [0, 0.13] },
  { pos: [0.8, 4.2, -12.4], look: [0, 0.7, 0], fov: 50, shift: [0, 0.02] },
  { pos: [0, 1.2, -9.6], look: [0, 0.9, 0], fov: 50, shift: [0, 0.2] },
];
const STOPS = [0, 0.2, 0.45, 0.7, 1];

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

/** The turntable's heading in degrees: a little with every stretch, once all the way round while the car comes apart, then nose to the viewer. */
const spinAt = (t: number) => 25 * seg(t, 0.02, 0.2) + 25 * seg(t, 0.2, 0.45) + 360 * seg(t, 0.47, 0.655) + 40 * seg(t, 0.84, 0.975);

// ── the ball's flight
const REST: V3 = [2.45, 1.6, -0.35]; // off the car's nose, before anything starts
const WATCH: V3 = [-3.0, 1.9, -2.05]; // over the console's shoulder while the file goes in
const WATCH_NARROW: V3 = [-3.5, 1.6, -2.05]; // on a phone the file comes down the middle of the frame, so it watches from the side
// the scan: an ellipse round the car, in the car's own space (it turns with the turntable)
const ORBIT_A = 2.75;
const ORBIT_B = 1.6;
const SCAN_FROM = -150 * RAD;
const SCAN_T: [number, number] = [0.305, 0.45];
const PERCH = 16 * RAD; // where it stops at the Scan stop: off the nose, high, the car's damaged corner under its light
const SCAN_SWEEP = 526; // from SCAN_FROM once round and on to PERCH
const CORNER = -38; // then it comes down to the damaged corner itself, degrees from the nose
// where the claim form hangs in the frame (fractions of the frame, and metres from the viewer) and how big the ball is above it
const FORM_FRAME = { x: 0.85, y: 0.27, depth: 3.4, yaw: -0.3 };
const FORM_FRAME_NARROW = { x: 0.69, y: 0.575, depth: 3.5, yaw: -0.22 };
const DESK_SCALE = 0.46;
const DOCK_DEPTH = 2.6;

function orbit(theta: number, out: THREE.Vector3) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const r = (ORBIT_A * ORBIT_B) / Math.sqrt(ORBIT_B * ORBIT_B * c * c + ORBIT_A * ORBIT_A * s * s);
  // low along the car's left, high over its right, so it shows above the roof on the far side
  return out.set(r * c, 1.28 + 0.47 * s, r * s);
}

type Scan = { uDir: THREE.IUniform<THREE.Vector2>; uTheta0: THREE.IUniform<number>; uSwept: THREE.IUniform<number>; uOn: THREE.IUniform<number>; uTime: THREE.IUniform<number>; uSpin: THREE.IUniform<number> };

function overlayMaterial(scan: Scan, amber: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uDir: scan.uDir,
      uTheta0: scan.uTheta0,
      uSwept: scan.uSwept,
      uOn: scan.uOn,
      uTime: scan.uTime,
      uSpin: scan.uSpin,
      uAmber: { value: 0 },
      uHold: { value: 0 },
      uIce: { value: glow(ICE, 1) },
      uAmberCol: { value: glow(AMBER, 1) },
      uIsAmber: { value: amber ? 1 : 0 },
    },
    vertexShader: `
      uniform float uSpin;
      varying vec3 vCar; varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        // back onto the turntable: the survey belongs to the car, not to the room
        float c = cos(uSpin), s = sin(uSpin);
        vCar = vec3(w.x * c - w.z * s, w.y, w.x * s + w.z * c);
        vN = vec3(n.x * c - n.z * s, n.y, n.x * s + n.z * c);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec2 uDir; uniform float uTheta0; uniform float uSwept; uniform float uOn; uniform float uTime; uniform float uAmber; uniform float uIsAmber; uniform float uHold; uniform float uSpin;
      uniform vec3 uIce; uniform vec3 uAmberCol;
      varying vec3 vCar; varying vec3 vN; varying vec3 vV;
      float ln(float c, float k){ float d = abs(fract(c - 0.5) - 0.5); return 1.0 - smoothstep(0.0, fwidth(c) * k, d); }
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        // a survey mesh in the car's own coordinates: a line every 10 cm along, across and up the car
        vec3 p = vCar / 0.1;
        vec3 n = normalize(vN);
        // a family of lines fades out where the surface lies flat against it
        vec3 keep = smoothstep(0.03, 0.45, 1.0 - n * n);
        vec3 l = vec3(ln(p.x, 1.2), ln(p.y, 1.2), ln(p.z, 1.2)) * keep;
        vec3 m = vec3(ln(p.x, 3.0), ln(p.y, 3.0), ln(p.z, 3.0)) * keep;
        float line = max(l.x, max(l.y, l.z));
        float dotv = max(m.x * m.y, max(m.x * m.z, m.y * m.z));
        // c and s of the car's turn, for the view vector (it is in the room's space)
        float cs = cos(uSpin), sn = sin(uSpin);
        vec3 v = normalize(vV);
        v = vec3(v.x * cs - v.z * sn, v.y, v.x * sn + v.z * cs);
        float fres = pow(1.0 - abs(dot(n, v)), 2.0);
        // the scan goes round the car: a point has been read once the light has passed its bearing
        float th = mod(atan(vCar.z, vCar.x) - uTheta0, 6.2831853);
        // no edge of the survey is a drawn line: where it has not been read yet the mesh thins out cell by cell,
        // behind the light as much as at the bearing the scan set out from
        float jit = (hash(floor(p)) - 0.5) * 0.5;
        float lead = uSwept - th;
        float seen = smoothstep(0.0, 0.34, lead + jit * 0.4);
        float born = max(smoothstep(0.0, 1.0, th + jit), smoothstep(0.0, 0.34, lead - 6.2831853 + jit * 0.4));
        float since = mod(lead, 6.2831853);
        float read = seen * born * (0.3 + 0.7 * exp(-since / 1.1) * smoothstep(0.0, 0.3, since));
        // the light itself: the upright sheet from the ball to the middle of the car
        float off = dot(vCar.xz, vec2(-uDir.y, uDir.x));
        float facing = step(0.0, dot(vCar.xz, uDir));
        float band = exp(-pow(off / 0.022, 2.0)) * facing;
        float glowband = exp(-pow(off / 0.14, 2.0)) * facing;
        // close to the light the survey is four times finer, and single cells of it flash as they are read
        vec3 pf = vCar / 0.025;
        vec3 lf = vec3(ln(pf.x, 1.1), ln(pf.y, 1.1), ln(pf.z, 1.1)) * keep;
        float fine = max(lf.x, max(lf.y, lf.z));
        float near = exp(-pow(off / 0.42, 2.0)) * facing;
        float cell = step(0.9, hash(floor(pf * 0.5) + floor(uTime * 9.0)));
        float spark = step(0.985, hash(floor(vCar / 0.012) + floor(uTime * 14.0)));
        vec3 col = uIce * (line * 0.3 + dotv * 1.4 + fres * 0.22) * read * uOn;
        col += uIce * near * (fine * 0.34 + cell * 0.3 + line * 0.3) * uOn;
        col += uIce * (band * 3.4 + glowband * (0.3 + spark * 2.6)) * uOn;
        // while the car is apart every panel keeps a faint survey, so each one reads as a part of its own
        col += uIce * (line * 0.2 + dotv * 0.9 + fres * 0.3) * uHold * (1.0 - uIsAmber);
        // damaged parts hold an amber survey of their own once the scan has found them
        float a = uAmber * uIsAmber;
        col += uAmberCol * a * (line * 0.55 + dotv * 1.3 + fres * 1.1 + 0.07);
        // the belly of the car is not surveyed: lit, it showed in the mirror floor as a hard-edged slab of light under the car
        col *= 1.0 - smoothstep(-0.35, -0.8, n.y) * (1.0 - clamp(uHold * 2.5, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Points spread evenly over the car's skin, in the car's own space: where the scan's motes leave from. */
function skinPoints(parts: Part[], count: number) {
  const tri: number[] = [];
  const cum: number[] = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (const p of parts) {
    if (/^(wheel|under|mirror)/.test(p.name)) continue;
    const pos = p.mesh.geometry.attributes.position;
    const idx = p.mesh.geometry.index;
    p.mesh.updateWorldMatrix(true, false);
    const n = idx ? idx.count : pos.count;
    const stride = 3 * Math.max(1, Math.floor(n / 3 / 5000)); // a few thousand triangles a part are plenty
    for (let i = 0; i + 2 < n; i += stride) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(p.mesh.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(p.mesh.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(p.mesh.matrixWorld);
      const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * 0.5;
      if (!(area > 1e-9)) continue;
      total += area;
      cum.push(total);
      tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  }
  const r = rng(31);
  const P = new Float32Array(count * 3);
  const N = new Float32Array(count * 3);
  const S = new Float32Array(count * 2);
  for (let k = 0; k < count && cum.length; k++) {
    const want = r() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < want) lo = mid + 1; else hi = mid; }
    const o = lo * 9;
    a.set(tri[o], tri[o + 1], tri[o + 2]); b.set(tri[o + 3], tri[o + 4], tri[o + 5]); c.set(tri[o + 6], tri[o + 7], tri[o + 8]);
    let u = r(), v = r();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    ab.subVectors(b, a); ac.subVectors(c, a);
    const nx = ab.clone().cross(ac).normalize();
    a.addScaledVector(ab, u).addScaledVector(ac, v);
    // the model's panels are closed shells: keep the normal that points away from the car's axis
    if (nx.x * a.x * 0.3 + nx.y * (a.y - 0.7) + nx.z * a.z < 0) nx.negate();
    P.set([a.x, a.y, a.z], k * 3);
    N.set([nx.x, nx.y, nx.z], k * 3);
    S.set([r(), r()], k * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
  geo.setAttribute("aN", new THREE.BufferAttribute(N, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(S, 2));
  return geo;
}

function softDisc(size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, col] of stops) grd.addColorStop(at, col);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** What a bright lamp does to a lens: a corona of very many hair-fine streaks of uneven length, so faint that together they read as a glow with grain, not as spikes. The same on every load. */
function glare(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = rng(11);
  const h = size / 2;
  g.translate(h, h);
  g.globalCompositeOperation = "lighter";
  const n = 150;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const far = r();
    const len = h * (0.22 + 0.78 * far * far);
    const w = h * (0.003 + 0.007 * r());
    const cx = Math.cos(a), sy = Math.sin(a);
    const grd = g.createLinearGradient(0, 0, cx * len, sy * len);
    const al = 0.03 + 0.07 * r();
    grd.addColorStop(0, `rgba(255,255,255,${al.toFixed(3)})`);
    grd.addColorStop(0.35, `rgba(255,255,255,${(al * 0.35).toFixed(3)})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(-sy * w, cx * w); g.lineTo(cx * len, sy * len); g.lineTo(sy * w, -cx * w); g.closePath(); g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/** The ring of light round a lamp seen through glass: a thin soft circle, cool on its inside and warm on its outside,
 *  and never even all the way round: stretches of it are bright, stretches are almost gone. The same on every load. */
function haloRing(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [at, col] of [
    [0, "rgba(255,255,255,0)"], [0.56, "rgba(170,205,255,0)"], [0.66, "rgba(150,195,255,0.1)"], [0.72, "rgba(255,255,255,0.2)"],
    [0.78, "rgba(255,216,170,0.1)"], [0.9, "rgba(255,190,140,0.02)"], [1, "rgba(255,190,140,0)"],
  ] as [number, string][]) grd.addColorStop(at, col);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  // take light away in soft-sided wedges
  const r = rng(29);
  g.globalCompositeOperation = "destination-out";
  g.translate(h, h);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const wide = 0.25 + 0.7 * r();
    const al = 0.1 + 0.2 * r();
    for (let p = 1; p <= 4; p++) {
      const w = (wide * p) / 4;
      g.fillStyle = `rgba(0,0,0,${(al / 2).toFixed(3)})`;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, size, a - w / 2, a + w / 2); g.closePath(); g.fill();
    }
  }
  return new THREE.CanvasTexture(c);
}

/** A ghost of the lens opening, as a lamp throws it across the glass: a faint filled disc with a slightly brighter rim. */
function ghostDisc(size: number) {
  return softDisc(size, [[0, "rgba(255,255,255,0.1)"], [0.7, "rgba(255,255,255,0.13)"], [0.86, "rgba(255,255,255,0.3)"], [0.93, "rgba(255,255,255,0.06)"], [1, "rgba(255,255,255,0)"]]);
}

/** A head lamp's beam where it lands on the floor: hot at the car, widening and fading away from it (u runs away from the car). */
function beamOnFloor(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1);
    const v = (y / (h - 1) - 0.5) * 2;
    const along = Math.min(1, u / 0.07) * Math.exp(-u * 2.6) * (1 - u * u);
    const across = Math.exp(-Math.pow(v / (0.16 + 0.62 * u), 2));
    const a = Math.max(0, along * across);
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(255 * a);
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export async function createBay(canvas: HTMLCanvasElement, opts: BayOptions): Promise<Bay> {
  const mobile = opts.mobile;
  // the two scanned models and the picture of the case file come first: without them there is no scene, and the caller shows the stills instead
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [carFile, consoleFile, botFile, casefile, casefileHero] = await Promise.all([
    loader.loadAsync("/landing/car.glb"),
    loader.loadAsync("/landing/console.glb"),
    loader.loadAsync("/landing/bot.glb"),
    new THREE.TextureLoader().loadAsync("/landing/casefile.webp"),
    new THREE.TextureLoader().loadAsync("/landing/casefile-hero.webp"),
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
  let maxRatio = mobile ? 1.5 : 2;
  renderer.setClearColor(BAY, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  scene.background = BAY.clone();
  scene.fog = new THREE.FogExp2(BAY.getHex(), 0.07);
  const env = buildEnvironment(renderer);
  scene.environment = env;
  scene.environmentIntensity = 1.2;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

  // ── lights: the room is lit by its reflections (the environment); the key only casts the shadow
  scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x0a0c10, 0.4));
  const key = new THREE.DirectionalLight(0xdff3ff, 0.06);
  key.position.set(2.2, 6.5, -3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  key.shadow.camera.left = -4.8; key.shadow.camera.right = 4.8; key.shadow.camera.top = 4.8; key.shadow.camera.bottom = -4.8;
  key.shadow.camera.near = 1; key.shadow.camera.far = 14;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe9ff, 0.04);
  rim.position.set(-5, 3, 5);
  scene.add(rim);
  const amberLight = new THREE.PointLight(AMBER, 0, 4.5, 1.6);
  scene.add(amberLight);
  // the green of the ending comes up from the ring on the floor, one light low at each side of the car: a light hung in
  // front of the nose burns a hot spot into the flat panel between the lamps
  const goLights = [-1, 1].map((sx) => {
    const l = new THREE.PointLight(GO, 0, 9, 1.4);
    l.position.set(sx * 2.5, 0.22, -1.5);
    scene.add(l);
    return l;
  });

  // ── things
  const scan: Scan = { uDir: { value: new THREE.Vector2(1, 0) }, uTheta0: { value: SCAN_FROM }, uSwept: { value: 0 }, uOn: { value: 0 }, uTime: { value: 0 }, uSpin: { value: 0 } };
  const holo = overlayMaterial(scan, false);
  const amberHolo = overlayMaterial(scan, true);
  const car = buildCar(carFile, holo, amberHolo);
  const moteGeo = skinPoints(car.parts, mobile ? 5200 : 12000);
  scene.add(car.group);
  const frameScale = car.frame ? car.frame.scale.x : 1;
  const room = buildRoom(mobile);
  scene.add(room.group);
  const con = buildConsole(mobile, consoleFile, casefile, casefileHero);
  scene.add(con.group);
  const bot = buildBot(botFile);
  scene.add(bot.group, bot.key);

  // ── the scan light. Everything in it starts at the ball:
  //    an upright fan of rays from the ball to the middle of the car, a soft beam down its centre,
  //    the line it draws on the floor, and motes that lift off the paint under the light and stream back into the ball's eye
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  fanGeo.setAttribute("aB", new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3));
  const fanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: glow(ICE, 1) }, uOn: scan.uOn, uTime: scan.uTime },
    vertexShader: "attribute vec3 aB; varying vec3 vB; void main(){ vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 uColor; uniform float uOn; uniform float uTime; varying vec3 vB;
      float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
      void main(){
        // rays from the ball: hair-fine threads, a few of them bright, and pulses of light running out along them
        float ray = vB.z / max(1e-4, vB.y + vB.z);
        float along = 1.0 - vB.x;
        float id = floor(ray * 150.0);
        float thread = smoothstep(0.42, 0.5, abs(fract(ray * 150.0) - 0.5) * -1.0 + 0.5) * (0.25 + 0.75 * step(0.72, hash(id)));
        float wide = 0.5 + 0.5 * sin(ray * 46.0 + uTime * 1.3);
        float run = 0.55 + 0.45 * smoothstep(0.6, 1.0, sin(along * 34.0 - uTime * 7.0 + hash(id) * 6.28));
        // no outline anywhere: the light thins out to nothing at both sides and well before its far end
        float edge = smoothstep(0.0, 0.22, ray) * smoothstep(1.0, 0.78, ray) * smoothstep(0.0, 0.42, vB.x);
        float nearBall = pow(vB.x, 2.2);
        float sheet = 0.035 + 0.05 * wide + thread * run * 0.26;
        gl_FragColor = vec4(uColor * uOn * (sheet * (0.45 + 1.6 * nearBall) + 0.5 * pow(vB.x, 7.0)) * edge, 1.0);
      }`,
  });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  fan.renderOrder = 5;
  scene.add(fan);
  // the beam down the middle of the fan: a ribbon that always faces the viewer, so the light has body from every side
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  beamGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]), 2));
  beamGeo.setIndex([0, 2, 1, 1, 2, 3]);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: glow(ICE, 1) }, uOn: scan.uOn, uTime: scan.uTime },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 uColor; uniform float uOn; uniform float uTime; varying vec2 vUv;
      void main(){
        float across = exp(-pow((vUv.y - 0.5) / 0.2, 2.0));
        float core = exp(-pow((vUv.y - 0.5) / 0.045, 2.0));
        float run = 0.75 + 0.25 * sin(vUv.x * 60.0 - uTime * 9.0);
        float fadeOut = smoothstep(1.0, 0.4, vUv.x) * smoothstep(0.0, 0.03, vUv.x);
        gl_FragColor = vec4(uColor * uOn * (across * 0.16 + core * 0.55 * run) * fadeOut, 1.0);
      }`,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  beam.renderOrder = 5;
  scene.add(beam);
  // the line on the floor is light too: soft across, and it fades away at both ends
  const traceGeo = new THREE.PlaneGeometry(1, 0.12);
  traceGeo.rotateX(-Math.PI / 2);
  traceGeo.translate(0.5, 0, 0);
  const traceMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: glow(ICE, 1.5) }, uA: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 uColor; uniform float uA; varying vec2 vUv;
      void main(){
        float across = exp(-pow((vUv.y - 0.5) / 0.16, 2.0));
        float along = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
        gl_FragColor = vec4(uColor * uA * across * along, 1.0);
      }`,
  });
  const trace = new THREE.Mesh(traceGeo, traceMat);
  trace.position.y = 0.008;
  trace.renderOrder = 3;
  scene.add(trace);
  const moteMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uBall: { value: new THREE.Vector3() }, uDir: scan.uDir, uOn: scan.uOn, uTime: scan.uTime, uPx: { value: 1 }, uColor: { value: glow(ICE, 1.5) } },
    vertexShader: `
      attribute vec3 aN; attribute vec2 aSeed;
      uniform vec3 uBall; uniform vec2 uDir; uniform float uOn; uniform float uTime; uniform float uPx;
      varying float vA;
      void main(){
        // only the paint under the light gives off motes: how near this point's bearing is to the ball's
        float d = abs(mod(atan(position.z, position.x) - atan(uDir.y, uDir.x) + 3.14159265, 6.2831853) - 3.14159265);
        float w = exp(-pow(d / 0.2, 2.0)) * step(d, 0.6);
        // each mote lives one short flight, over and over, at its own pace: off the paint, a little way out, then into the eye
        float k = fract(aSeed.x + uTime * (0.16 + 0.2 * aSeed.y));
        float e = k * k * (3.0 - 2.0 * k);
        vec3 p0 = position + aN * 0.012;
        vec3 p1 = position + aN * (0.2 + 0.3 * aSeed.y) + vec3(0.0, 0.1 + 0.2 * aSeed.x, 0.0);
        vec3 p = mix(mix(p0, p1, e), mix(p1, uBall, e), e);
        p += 0.035 * sin(k * 3.14159265) * vec3(sin(k * 9.0 + aSeed.x * 40.0), cos(k * 7.0 + aSeed.y * 30.0), sin(k * 8.0 + aSeed.x * 20.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        // bright as it leaves the paint, a thread of light on the way, gone as it reaches the eye
        vA = w * uOn * smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.82, 1.0, k)) * (0.55 + 0.45 * aSeed.y);
        gl_PointSize = max(1.0, uPx * mix(0.022, 0.009, e) / -mv.z) * step(0.004, vA);
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main(){
        float r = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uColor * vA * smoothstep(0.5, 0.08, r), 1.0);
      }`,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  motes.renderOrder = 6;
  car.group.add(motes);

  // leader lines: damaged part → its row on the form. Drawn over everything, like marks on a drawing.
  const leadMat = new THREE.LineBasicMaterial({ color: glow(AMBER, 1.8), transparent: true, depthTest: false, depthWrite: false });
  const dotGeo = new THREE.SphereGeometry(0.008, 10, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: glow(AMBER, 2.2), transparent: true, toneMapped: false, depthTest: false, depthWrite: false });
  const leads = car.damaged.map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const line = new THREE.Line(geo, leadMat);
    line.frustumCulled = false;
    line.renderOrder = 24;
    const d0 = new THREE.Mesh(dotGeo, dotMat);
    const d1 = new THREE.Mesh(dotGeo, dotMat);
    d0.renderOrder = d1.renderOrder = 24;
    scene.add(line, d0, d1);
    return { geo, line, d0, d1 };
  });
  // rows on the form, top to bottom, follow the parts from the highest to the lowest, so the lines do not cross
  const ROW: Record<string, number> = { bonnet: 0, lampL: 1, grille: 2, fenderL: 3, bumperF: 4 };
  const rowOf = car.damaged.map((p, i) => ROW[p.name] ?? i);
  // parts that stand on the floor slide; everything else is in the air and breathes
  const floats = car.parts.map((p) => !/^(wheel|under)/.test(p.name));

  // ── the head lamps, for the ending. A lamp pointed at a lens does these things, and each is one piece here: a hot
  //    core, a wide soft glow, a grain of very fine streaks in it, a thin ring of light round it, a short soft streak
  //    to each side, one faint ghost of the lens, and its beam on the floor.
  //    Between the two lamps a veil of light lifts the whole picture, the way a dark room looks with lamps in your eyes.
  const glowTex = softDisc(128, [[0, "rgba(255,255,255,1)"], [0.18, "rgba(255,255,255,0.55)"], [0.5, "rgba(255,255,255,0.1)"], [1, "rgba(255,255,255,0)"]]);
  const haloTex = softDisc(256, [[0, "rgba(255,255,255,0.5)"], [0.07, "rgba(255,255,255,0.34)"], [0.18, "rgba(255,255,255,0.19)"], [0.36, "rgba(255,255,255,0.085)"], [0.6, "rgba(255,255,255,0.028)"], [0.82, "rgba(255,255,255,0.007)"], [1, "rgba(255,255,255,0)"]]);
  const rayTex = glare(mobile ? 256 : 512);
  const ringTex = haloRing(256);
  const ghostTex = ghostDisc(128);
  const beamTex = beamOnFloor(256, 128);
  const LAMP_WHITE = new THREE.Color(0xeaf6ff);
  /** how far the beams on the floor swing after the mouse, each way */
  const LAMP_SWING = 9 * RAD;
  const lampSprite = (map: THREE.Texture, color: THREE.Color, order: number) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    sp.renderOrder = order;
    sp.visible = false;
    scene.add(sp);
    return sp;
  };
  const lampFx = car.lamps.map((lamp, li) => {
    const halo = lampSprite(haloTex, glow(LAMP_WHITE, 1), 11);
    const rays = lampSprite(rayTex, glow(LAMP_WHITE, 1.2), 11);
    rays.material.rotation = li * 1.9 + 0.3;
    const flare = lampSprite(glowTex, glow(ICE, 1.6), 12);
    const ring = lampSprite(ringTex, glow(LAMP_WHITE, 1), 11);
    const ghost = lampSprite(ghostTex, glow(ICE, 1), 11);
    ring.material.rotation = li * 2.3;
    const core = lampSprite(glowTex, glow(LAMP_WHITE, 2.6), 12);
    const BEAM = 11;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(BEAM, 5), new THREE.MeshBasicMaterial({ map: beamTex, color: glow(LAMP_WHITE, 0.9), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(BEAM / 2, 0, 0);
    pool.renderOrder = 2;
    pool.visible = false;
    // the beam on the floor hangs from the lamp, so it can swing a little to one side
    const swing = new THREE.Group();
    swing.position.set(lamp.home.x - 0.1, 0.007, lamp.home.z);
    swing.add(pool);
    car.group.add(swing);
    return { lamp, core, halo, rays, flare, ring, ghost, pool, swing, turn: li * 1.9 + 0.3 };
  });
  // under the dark that hangs behind the words (9), so the light fills the frame and the words still read
  const veil = lampSprite(haloTex, glow(LAMP_WHITE, 1), 8);

  // ── the logo, for the ending: the wordmark as a solid thing in the room, its "o" left open for the ball. It has a
  //    lamp of its own in front of it, the head lamps reach it from below, and a patch of dark hangs behind the words.
  const logo = buildLogo();
  scene.add(logo.group);
  const logoKey = new THREE.PointLight(0xffffff, 0, 7, 1.4);
  const logoUnder = new THREE.PointLight(LAMP_WHITE, 0, 3.2, 1.4);
  scene.add(logoKey, logoUnder);
  const shadeTex = softDisc(128, [[0, "rgba(0,0,0,1)"], [0.45, "rgba(0,0,0,0.72)"], [1, "rgba(0,0,0,0)"]]);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadeTex, color: BAY, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }));
  shade.renderOrder = 9;
  shade.visible = false;
  scene.add(shade);

  // ── post
  const size = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const BLOOM = mobile ? 0.42 : 0.5;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), BLOOM, 0.6, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const keys = mobile ? MOBILE : DESKTOP;
  const formAt = mobile ? FORM_FRAME_NARROW : FORM_FRAME;
  const cur = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 32, shift: new THREE.Vector2() };
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const vd = new THREE.Vector3();
  const ve = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const ball = new THREE.Vector3();
  const ballCar = new THREE.Vector3();
  const desk = new THREE.Vector3();
  const formTop = new THREE.Vector3();
  const gaze = new THREE.Vector3();
  const slot = con.slotWorld(new THREE.Vector3());
  const eyeColour = new THREE.Color();
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), formAt.yaw);
  let dock: Dock | null = null;
  let W = 1;
  let H = 1;
  let t = 0;
  // the viewer's mouse in the frame, and the same thing eased: the lamps lean after it, they do not jump
  const aimTo = new THREE.Vector2();
  const aim = new THREE.Vector2();
  const lean = new THREE.Vector3();
  let moved = true;
  let lastMove = 0;
  let lastTime = 0;
  let breath = 0;

  function cameraAt(tt: number) {
    let i = 0;
    while (i < 3 && tt > STOPS[i + 1]) i++;
    const f = smooth(clamp01((tt - STOPS[i]) / (STOPS[i + 1] - STOPS[i])));
    const k = (j: number) => keys[Math.max(0, Math.min(4, j))];
    // Catmull-Rom through the stops, so the camera does not corner
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    const v3 = (get: (k: Key) => V3, out: THREE.Vector3) => {
      const a = get(k(i - 1)), b = get(k(i)), c = get(k(i + 1)), d = get(k(i + 2));
      return out.set(cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1]), cr(a[2], b[2], c[2], d[2]));
    };
    v3((q) => q.pos, cur.pos);
    v3((q) => q.look, cur.look);
    cur.fov = lerp(k(i).fov, k(i + 1).fov, f);
    cur.shift.set(lerp(k(i).shift[0], k(i + 1).shift[0], f), lerp(k(i).shift[1], k(i + 1).shift[1], f));
  }

  function setProgress(tt: number) {
    const next = clamp01(tt);
    if (Math.abs(next - t) > 2e-5) moved = true;
    t = next;
    cameraAt(t);
  }

  /** The point `depth` metres in front of the viewer that shows at (fx, fy) of the frame (0..1, from the top left). */
  function inFrame(fx: number, fy: number, depth: number, out: THREE.Vector3) {
    const halfH = Math.tan((cur.fov * RAD) / 2) * depth;
    const halfW = halfH * (W / H);
    return out.copy(camera.position)
      .addScaledVector(fwd, depth)
      .addScaledVector(right, (fx - 0.5 - cur.shift.x) * 2 * halfW)
      .addScaledVector(up, -(fy - 0.5 - cur.shift.y) * 2 * halfH);
  }

  const viewer: Viewer = { at: inFrame, tall: (depth) => 2 * depth * Math.tan((cur.fov * RAD) / 2), quat: camera.quaternion, up };

  /** Everything in the room for the current `t`. `time` only adds the breathing; 0 gives the plain still. */
  function pose(time: number) {
    const wave = time * (TAU / 4200); // one breath every 4.2 s
    const idle = time ? breath : 0;

    // ── the turntable
    const spin = spinAt(t) * RAD;
    car.group.rotation.y = spin;
    room.table.rotation.y = spin;
    car.group.updateMatrixWorld(true);
    scan.uSpin.value = spin;

    // ── the claim form hangs in front of the viewer, a little to one side, turned towards the car
    inFrame(formAt.x, formAt.y, formAt.depth, formTop);
    formTop.y += Math.sin(wave + 1.1) * 0.012 * idle;
    con.form.position.copy(formTop);
    con.form.quaternion.copy(camera.quaternion).multiply(yawQ);
    con.set(t, time, viewer);

    // ── the logo: the word stands up where the page keeps its place, swinging round to face you as it does
    const wordUp = dock ? seg(t, 0.882, 0.955) : 0;
    logo.set(wordUp);
    shade.visible = !!dock && t > 0.86;
    logoKey.intensity = logoUnder.intensity = 0;
    if (dock && t > 0.86) {
      const focal = H / 2 / Math.tan((cur.fov * RAD) / 2);
      inFrame(dock.cx / W, dock.cy / H, DOCK_DEPTH, logo.group.position);
      logo.group.quaternion.copy(camera.quaternion);
      logo.group.rotateY(-(1 - smooth(wordUp)) * 0.85 + (time ? Math.sin(time * 0.00055) * 0.11 : 0));
      logo.group.rotateX(-0.2 + (time ? Math.sin(time * 0.0004 + 1.3) * 0.04 : 0));
      logo.group.scale.setScalar((dock.w * DOCK_DEPTH) / focal / logo.width);
      logo.group.updateMatrixWorld(true);
      logoKey.position.copy(camera.position).addScaledVector(fwd, DOCK_DEPTH * 0.5).addScaledVector(up, 0.75).addScaledVector(right, -0.5);
      logoKey.intensity = wordUp * 1.5;
      logoUnder.position.copy(logo.group.position).addScaledVector(up, -0.5).addScaledVector(fwd, 0.35);
      logoUnder.intensity = seg(t, 0.925, 0.995) * 1.6;
      // the dark behind the words: wide enough for the logo, tall enough for everything under it
      const sd = DOCK_DEPTH + 0.6;
      inFrame(dock.cx / W, dock.by / H, sd, shade.position);
      shade.quaternion.copy(camera.quaternion);
      shade.scale.set((Math.max(dock.w * 1.9, W * 0.5) * sd) / focal, (dock.bh * 2.1 * sd) / focal, 1);
      (shade.material as THREE.MeshBasicMaterial).opacity = seg(t, 0.872, 0.94) * 0.88;
    }

    // ── the ball: where it is
    const toWatch = seg(t, 0.045, 0.165);
    const toOrbit = seg(t, 0.288, 0.335);
    const toDesk = seg(t, 0.5, 0.585);
    const toDock = seg(t, 0.9, 0.962);
    const sweptDeg = SCAN_SWEEP * clamp01((t - SCAN_T[0]) / (SCAN_T[1] - SCAN_T[0]));
    // at the Scan stop it has stopped, high, off the nose; after it, it comes down to the damaged corner
    const down = seg(t, 0.455, 0.495);
    const theta = SCAN_FROM + sweptDeg * RAD + (CORNER * RAD - PERCH) * down;
    const perch = seg(t, 0.385, 0.45) * (1 - down);
    orbit(theta, ballCar);
    ballCar.y = lerp(ballCar.y, 1.05, down) + perch * (mobile ? 0.95 : 0.5);
    // a phone's frame is narrow: there it perches closer in over the bonnet, so it stays in the picture
    if (mobile) { const tuck = lerp(1, 0.66, perch); ballCar.x *= tuck; ballCar.z *= tuck; }
    ball.set(...REST).lerp(va.set(...(mobile ? WATCH_NARROW : WATCH)), toWatch);
    ball.y += Math.sin(toWatch * Math.PI) * 0.28;
    if (toOrbit > 0) ball.lerp(va.copy(ballCar).applyMatrix4(car.group.matrixWorld), toOrbit);
    let scale = 1;
    if (toDesk > 0) {
      desk.copy(formTop).addScaledVector(up, BOT_R * DESK_SCALE + 0.05);
      ball.lerp(desk, toDesk);
      ball.y += Math.sin(toDesk * Math.PI) * 0.3;
      scale = lerp(1, DESK_SCALE, toDesk);
    }
    if (toDock > 0) {
      // into the logo: the word's first "o" is a ring, and the ball settles in it
      let size = 0.2;
      if (dock) { va.copy(logo.o).applyMatrix4(logo.group.matrixWorld); size = (logo.ballRadius * logo.group.scale.x) / BOT_R; }
      else inFrame(0.5, 0.2, DOCK_DEPTH, va);
      ball.lerp(va, toDock);
      ball.addScaledVector(up, Math.sin(toDock * Math.PI) * 0.16);
      scale = lerp(scale, size, toDock);
    }
    // it is never quite still; more so when the page is
    ball.y += Math.sin(wave + 0.6) * 0.055 * scale * (time ? 0.4 + 0.6 * breath : 0) * (1 - toDock);
    bot.group.position.copy(ball);
    bot.group.scale.setScalar(scale);
    // ── what it looks at: the viewer, the slot, the car, the form, the viewer again
    gaze.set(0, 0, 0)
      .addScaledVector(va.copy(cur.pos).lerp(vb.set(0.6, 0.9, 0), 0.22), 1 - toWatch)
      .addScaledVector(vb.copy(slot).lerp(camera.position, 0.45), toWatch * (1 - toOrbit))
      .addScaledVector(va.set(0, lerp(0.75, ball.y, 0.35), 0).lerp(cur.pos, 0.42), toOrbit * (1 - toDesk))
      .addScaledVector(va.copy(formTop).addScaledVector(up, -FORM_H * 0.45).lerp(camera.position, 0.55), toDesk * (1 - toDock))
      .addScaledVector(camera.position, toDock);
    bot.group.lookAt(gaze);
    // ── its eyes
    const on = pulse(t, 0.3, 0.326, 0.488, 0.515);
    const edges = [0.3, 0.535, 0.862];
    let mode = 0;
    let near = 1;
    for (const e of edges) { if (t >= e) mode++; near = Math.min(near, Math.abs(t - e) / 0.014); }
    let open = smooth(near);
    if (mode === 0 && time) {
      // a blink now and then
      const b = (time % 4300) / 150;
      if (b < 1) open *= Math.abs(b * 2 - 1);
    }
    const face: Face = { mode: mode as Face["mode"], open, phase: mode === 1 ? (t * 31 + time * 0.0006) % 1 : (t * 60 + time * 0.0011) % 1 };
    bot.setFace(face);
    const done = seg(t, 0.9, 0.99);
    bot.light.color.copy(eyeColour.copy(ICE).lerp(GO, seg(t, 0.862, 0.9) * (1 - toDock)));
    bot.light.intensity = (0.7 + on * 8) * scale * scale;
    bot.halo.opacity = (0.1 + on * 0.14) * (1 - toDock * 0.6);
    bot.halo.color.copy(eyeColour);
    // its own small lamp stays up and to the viewer's side of it, wherever it goes
    va.subVectors(camera.position, ball).normalize();
    bot.key.position.copy(ball).addScaledVector(va, 0.5 * scale).addScaledVector(up, 0.42 * scale).addScaledVector(right, -0.3 * scale);
    bot.key.distance = 1.5 * Math.max(scale, 0.35);
    bot.key.intensity = 1.5 * scale * scale * (1 - toDock * 0.85);

    // ── scan: the light goes round the car, and the paint under it gives up its motes to the ball
    scan.uOn.value = on;
    scan.uSwept.value = sweptDeg * RAD;
    car.group.worldToLocal(ballCar.copy(ball));
    scan.uDir.value.set(ballCar.x, ballCar.z).normalize();
    moteMat.uniforms.uBall.value.copy(ballCar);
    const scanning = on > 0.004;
    fan.visible = trace.visible = beam.visible = motes.visible = scanning;
    if (scanning) {
      const arr = fanGeo.attributes.position.array as Float32Array;
      arr.set([ball.x, ball.y, ball.z, 0, 1.55, 0, 0, 0.03, 0]);
      fanGeo.attributes.position.needsUpdate = true;
      // the ribbon: from the ball to the car's middle, widening, turned to the viewer
      va.set(0, 0.8, 0);
      vb.subVectors(va, ball);
      vc.subVectors(camera.position, ball).cross(vb).normalize();
      const b = beamGeo.attributes.position.array as Float32Array;
      b.set([
        ball.x - vc.x * 0.05, ball.y - vc.y * 0.05, ball.z - vc.z * 0.05,
        ball.x + vc.x * 0.05, ball.y + vc.y * 0.05, ball.z + vc.z * 0.05,
        va.x - vc.x * 0.4, va.y - vc.y * 0.4, va.z - vc.z * 0.4,
        va.x + vc.x * 0.4, va.y + vc.y * 0.4, va.z + vc.z * 0.4,
      ]);
      beamGeo.attributes.position.needsUpdate = true;
      trace.rotation.y = -Math.atan2(ball.z, ball.x);
      trace.scale.x = Math.hypot(ball.x, ball.z);
      traceMat.uniforms.uA.value = on * 0.85;
    }

    // ── the car comes apart, is keyed, and goes back together
    const apart = seg(t, 0.5, 0.6) * (1 - seg(t, 0.83, 0.915));
    const amber = seg(t, 0.47, 0.5) * (1 - seg(t, 0.845, 0.905));
    for (let i = 0; i < car.parts.length; i++) {
      const p = car.parts[i];
      const lag = ((i * 7) % 11) * 0.0022;
      const e = seg(t, 0.5 + lag, 0.58 + lag) * (1 - seg(t, 0.83 + lag * 0.6, 0.9 + lag * 0.6));
      const reach = p.damaged ? 1.4 : 1;
      p.mesh.position.copy(p.home).addScaledVector(p.out, e * reach);
      const b = floats[i] && time ? breath * e : 0;
      p.mesh.position.y += Math.sin(wave + p.phase * 0.35) * 0.035 * b;
      p.mesh.rotation.set(p.tilt.x * e + Math.sin(wave * 0.5 + p.phase) * 0.012 * b, p.tilt.y * e, p.tilt.z * e);
      p.overlay.visible = on > 0.004 || (p.damaged ? amber > 0.004 : apart > 0.004);
    }
    if (car.frame) {
      // the frame is a little larger than the shell in places, so it only shows once the panels have left it
      car.frame.visible = apart > 0.02;
      car.frame.scale.setScalar(frameScale * lerp(0.93, 1, seg(apart, 0.02, 0.5)));
    }
    car.group.updateMatrixWorld(true);
    let lifted = 0;
    car.damaged.forEach((p, i) => {
      const lead = leads[i];
      const drawn = seg(t, 0.636 + i * 0.008, 0.672 + i * 0.008) * (1 - seg(t, 0.835, 0.875));
      lifted = Math.max(lifted, apart);
      lead.line.visible = lead.d0.visible = lead.d1.visible = drawn > 0.002;
      if (drawn > 0.002) {
        con.rowAnchor(rowOf[i], vd);
        // drawn like a mark on the picture: the part's place in the frame, brought forward to the form's own distance,
        // then straight to a point beside the row and level into it
        va.copy(p.mesh.position).applyMatrix4(car.group.matrixWorld).sub(camera.position);
        va.multiplyScalar(vb.subVectors(vd, camera.position).dot(fwd) / Math.max(0.1, va.dot(fwd))).add(camera.position);
        vb.copy(vd).addScaledVector(right, -(0.1 + 0.035 * rowOf[i]));
        const a1 = clamp01(drawn * 1.6);
        const a2 = clamp01(drawn * 2.6 - 1.6);
        vc.copy(va).lerp(vb, a1);
        ve.copy(vc).lerp(vd, a2);
        const arr = lead.geo.attributes.position.array as Float32Array;
        arr.set([va.x, va.y, va.z, vc.x, vc.y, vc.z, ve.x, ve.y, ve.z]);
        lead.geo.attributes.position.needsUpdate = true;
        lead.d0.position.copy(va);
        lead.d1.position.copy(ve);
      }
    });
    amberHolo.uniforms.uAmber.value = amber;
    holo.uniforms.uHold.value = apart * 0.4;
    amberLight.intensity = lifted * 5;
    amberLight.position.set(1.9, 0.9, -1.0).applyMatrix4(car.group.matrixWorld);

    // ── done: the ring closes round the turntable, the lamps come on
    room.ringMat.uniforms.uSweep.value = done * 1.03;
    // the bay's own lights go down as the car's come on
    const dim = seg(t, 0.845, 0.925);
    room.tubes.color.copy(ICE).multiplyScalar(3.2 * (1 - dim));
    room.tubes.visible = dim < 0.995;
    for (const l of goLights) l.intensity = done * 4;
    const lit = seg(t, 0.925, 0.995);
    if (car.lampMaterial) car.lampMaterial.emissiveIntensity = 1.5 + lit * 5;
    // a flare only shows to someone the lamp is pointed at
    va.set(1, 0, 0).transformDirection(car.group.matrixWorld);
    vb.subVectors(camera.position, car.group.position).normalize();
    const facing = Math.pow(clamp01(va.dot(vb)), 3);
    const flick = time ? 1 + Math.sin(time * 0.004) * 0.03 : 1;
    // the lamps lean after the mouse, a little: the glow round each lamp drifts that way, the beams on the floor swing
    // a few degrees, and the lamp on the mouse's side burns a touch brighter. The lamp itself stays where it is.
    const ax = aim.x * lit;
    const ay = aim.y * lit;
    // which way is "to the viewer's right" for the car: its own side axis, seen from the camera
    const side = ve.set(0, 0, 1).transformDirection(car.group.matrixWorld).dot(right);
    lean.copy(right).multiplyScalar(ax).addScaledVector(up, ay * 0.6);
    vd.set(0, 0, 0);
    for (const fx of lampFx) {
      vc.copy(fx.lamp.home).add(ve.set(0.06, 0, 0)).applyMatrix4(car.group.matrixWorld);
      const near = THREE.MathUtils.clamp(vb.subVectors(vc, car.group.position).dot(right) * 1.4, -1, 1) * ax;
      const k = lit * facing * flick * (1 + near * 0.22);
      fx.core.visible = fx.halo.visible = fx.rays.visible = fx.flare.visible = fx.ring.visible = fx.ghost.visible = fx.pool.visible = k > 0.003;
      if (k <= 0.003) continue;
      vd.addScaledVector(vc, 1 / lampFx.length);
      fx.swing.rotation.y = -ax * side * LAMP_SWING;
      fx.core.position.copy(vc);
      fx.halo.position.copy(vc).addScaledVector(lean, 0.3);
      fx.rays.position.copy(vc).addScaledVector(lean, 0.12);
      fx.rays.material.rotation = fx.turn - ax * 0.16;
      // the long streak stays on the lamp's own height: it only slides sideways
      fx.flare.position.copy(vc).addScaledVector(right, ax * 0.3);
      // the ring sits round the lamp, and drifts a little further after the mouse than the glow does
      fx.ring.position.copy(vc).addScaledVector(lean, 0.2);
      // the ghost lies on the line from the lamp toward the middle of the frame, short of the words, and slides against the mouse
      const depth = vb.subVectors(vc, camera.position).dot(fwd);
      inFrame(0.5, 0.5, depth, vb).addScaledVector(lean, -0.9);
      fx.ghost.position.copy(vc).lerp(vb, 0.4);
      fx.core.scale.setScalar(0.3 + 0.1 * k);
      fx.halo.scale.setScalar((mobile ? 4.4 : 6.4) * (0.7 + 0.3 * k));
      // the grain opens as the lamp comes up
      fx.rays.scale.setScalar((mobile ? 2.4 : 3.6) * (0.5 + 0.5 * k));
      fx.flare.scale.set((mobile ? 1.6 : 2.2) + 0.8 * k, 0.07, 1);
      fx.ring.scale.setScalar((mobile ? 1.7 : 2.4) * (0.8 + 0.2 * k));
      fx.ghost.scale.setScalar(mobile ? 0.12 : 0.17);
      fx.core.material.opacity = k;
      fx.halo.material.opacity = k * (mobile ? 0.3 : 0.34);
      fx.rays.material.opacity = k * 0.42;
      fx.flare.material.opacity = k * 0.2;
      fx.ring.material.opacity = k * 0.6;
      fx.ghost.material.opacity = k * 0.16;
      (fx.pool.material as THREE.MeshBasicMaterial).opacity = lit * (mobile ? 0.4 : 0.6);
    }
    // the light fills the room: a wide wash centred between the lamps, reaching every edge of the frame
    const veilK = lit * facing;
    veil.visible = veilK > 0.003;
    if (veil.visible) {
      veil.position.copy(vd).addScaledVector(lean, mobile ? 0 : 2.2);
      veil.scale.set(mobile ? 13 : 30, mobile ? 15 : 15, 1);
      veil.material.opacity = veilK * (mobile ? 0.14 : 0.16);
    }
    // lamps in your eyes: everything bright in the picture spreads further
    bloom.strength = BLOOM * (1 + veilK * 0.35);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w === W && h === H) return;
    W = w; H = h;
    // sharp, but never more pixels than a mid-range graphics chip draws comfortably (about 3.6 million)
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, maxRatio, Math.sqrt(3.6e6 / (w * h))));
    renderer.setPixelRatio(ratio);
    composer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(size);
    composer.setSize(w, h);
    bloom.resolution.set(size.x / 2, size.y / 2);
    moteMat.uniforms.uPx.value = size.y / (2 * Math.tan((32 * RAD) / 2));
  }

  function render(time: number) {
    resize();
    // stillness: a moment after the page stops moving, things in the air start to breathe; they settle as it moves again
    if (time) {
      const dt = lastTime ? Math.min(100, time - lastTime) : 16;
      lastTime = time;
      aim.lerp(aimTo, 1 - Math.exp(-dt / 260));
      if (moved) { lastMove = time; moved = false; }
      const want = smooth((time - lastMove - 140) / 650);
      breath += (want - breath) * (1 - Math.exp(-dt / 240));
    } else { breath = 0; moved = false; aim.copy(aimTo); }
    // idle: a breath of drift, never enough to change what the frame says
    const dx = time ? Math.sin(time * 0.00021) * 0.07 : 0;
    const dy = time ? Math.sin(time * 0.00017 + 1.3) * 0.035 : 0;
    camera.position.set(cur.pos.x + dx, cur.pos.y + dy, cur.pos.z);
    camera.fov = cur.fov;
    camera.aspect = W / H;
    camera.lookAt(cur.look);
    // slide the picture inside the frame without bending its perspective
    camera.setViewOffset(W, H, -cur.shift.x * W, -cur.shift.y * H, W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    scan.uTime.value = time * 0.001;
    pose(time);
    if (time) {
      room.dust.rotation.y = time * 0.000012;
      room.dust.position.y = Math.sin(time * 0.00009) * 0.08;
    }
    composer.render();
  }

  resize();
  setProgress(0);

  let steps = 0;
  function degrade() {
    if (steps >= 2) return false;
    steps++;
    if (steps === 1) maxRatio = 1;
    else { bloom.enabled = false; if (room.reflector) room.reflector.visible = false; renderer.shadowMap.enabled = false; }
    W = 0; // force the next resize() to rebuild the buffers
    resize();
    return true;
  }

  return {
    setProgress,
    setDock(d) { dock = d; },
    setPointer(x, y) { aimTo.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)); },
    render,
    resize,
    degrade,
    dispose() {
      composer.dispose();
      target.dispose();
      env.dispose();
      room.dispose();
      con.dispose();
      bot.dispose();
      car.dispose();
      holo.dispose();
      amberHolo.dispose();
      logo.dispose(); shadeTex.dispose(); glowTex.dispose(); haloTex.dispose(); rayTex.dispose(); ringTex.dispose(); ghostTex.dispose(); beamTex.dispose();
      leadMat.dispose(); dotGeo.dispose(); dotMat.dispose();
      for (const l of leads) l.geo.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
            const std = x as THREE.MeshStandardMaterial;
            for (const tex of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.emissiveMap, std.alphaMap]) tex?.dispose();
            x.dispose();
          }
        }
      });
      renderer.dispose();
    },
  };
}
