import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { buildBot, type Face } from "./bot";
import { buildCar } from "./car";
import { FORM_AT, buildConsole } from "./console";
import { AMBER, BAY, GO, ICE, buildEnvironment, buildRoom, glow, lightMat } from "./room";
import { clamp01, lerp, pulse, seg, smooth } from "./math";

/**
 * The night bay. One function of `t`:
 *   0     the car at rest in the bay, the scan ball waiting beside it
 *   0.2   Upload     the case file flies into the console; the ball watches it go in
 *   0.45  Scan       the ball flies once round the car and reads every panel
 *   0.7   Autopilot  the car comes apart, panel by panel; the damaged ones are keyed, row by row, on the glass form
 *   1     Done       the car is whole again, the form signed off, a green ring closes round it
 * `render(time)` adds only idle motion: dust, a breath of camera drift, and, once the page has stopped
 * moving, a slow rise and fall of everything that is in the air. Pass 0 for a still.
 */

export type BayOptions = { mobile: boolean };
export type Bay = { setProgress(t: number): void; render(timeMs: number): void; resize(): void; /** drop one step of quality; false when there is nothing left to drop */ degrade(): boolean; dispose(): void };

type V3 = [number, number, number];
type Key = { pos: V3; look: V3; fov: number; shift: [number, number] };
// shift: where the picture's centre sits in the frame, as a fraction of width / height (+x = right, +y = down)
const DESKTOP: Key[] = [
  { pos: [4.9, 1.15, -6.3], look: [0.2, 0.62, 0], fov: 31, shift: [0.2, 0.03] },
  { pos: [-6.7, 1.75, -5.1], look: [-2.8, 0.98, -2.15], fov: 34, shift: [0.19, 0.02] },
  { pos: [0.4, 1.25, -7.9], look: [-0.1, 0.9, 0], fov: 30, shift: [0.17, 0.03] },
  { pos: [6.9, 2.3, -7.9], look: [0.1, 0.95, -0.8], fov: 33, shift: [0.18, 0.03] },
  { pos: [4.6, 1.45, -5.6], look: [0, 0.7, 0], fov: 32, shift: [0, 0.08] },
];
const MOBILE: Key[] = [
  { pos: [7.9, 2.2, -4.3], look: [0.1, 0.6, 0], fov: 50, shift: [0, 0.13] },
  { pos: [-6.6, 2.4, -7.2], look: [-2.95, 1.05, -2.5], fov: 48, shift: [0, 0.2] },
  { pos: [0.3, 1.6, -11.2], look: [0, 0.9, 0], fov: 50, shift: [0, 0.13] },
  { pos: [11.75, 3.75, -6.8], look: [0.4, 1.0, -1.1], fov: 50, shift: [0, 0.15] },
  { pos: [7.9, 2.6, -5.9], look: [0.2, 0.7, -0.2], fov: 50, shift: [0, 0.12] },
];
const STOPS = [0, 0.2, 0.45, 0.7, 1];

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

// ── the ball's flight
const REST: V3 = [1.55, 1.72, -0.95]; // beside the car, before anything starts
const WATCH: V3 = [-2.5, 1.56, -2.05];
const WATCH_NARROW: V3 = [-3.5, 1.6, -2.05]; // on a phone the file comes down the middle of the frame, so it watches from the side // over the console's shoulder while the file goes in
const DESK: V3 = [-1.0, 2.42, -2.85]; // over the glass form while the claim is keyed
const HOME: V3 = [-1.6, 1.75, -1.2]; // beside the car, clear of the words, when it is done
const HOME_NARROW: V3 = [-1.3, 2.08, -0.85]; // the same on a phone, where the frame is narrow
// the scan: an ellipse round the car, started level with the console
const ORBIT_A = 2.75;
const ORBIT_B = 1.6;
const SCAN_FROM = -140 * RAD;
const SCAN_T: [number, number, number] = [0.305, 0.45, 0.535];
const SCAN_DEG: [number, number] = [392, 452]; // by the Scan stop it has been all the way round; then it comes forward to the damaged corner

function orbit(theta: number, out: THREE.Vector3) {
  const c = Math.cos(theta), s = Math.sin(theta);
  const r = (ORBIT_A * ORBIT_B) / Math.sqrt(ORBIT_B * ORBIT_B * c * c + ORBIT_A * ORBIT_A * s * s);
  // low along the side the camera is on, high over the far side so it shows above the roof
  return out.set(r * c, 1.28 + 0.47 * s, r * s);
}

type Scan = { uDir: THREE.IUniform<THREE.Vector2>; uTheta0: THREE.IUniform<number>; uSwept: THREE.IUniform<number>; uOn: THREE.IUniform<number>; uTime: THREE.IUniform<number> };

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
      uAmber: { value: 0 },
      uHold: { value: 0 },
      uIce: { value: glow(ICE, 1) },
      uAmberCol: { value: glow(AMBER, 1) },
      uIsAmber: { value: amber ? 1 : 0 },
    },
    vertexShader: `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform vec2 uDir; uniform float uTheta0; uniform float uSwept; uniform float uOn; uniform float uTime; uniform float uAmber; uniform float uIsAmber; uniform float uHold;
      uniform vec3 uIce; uniform vec3 uAmberCol;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vV;
      float ln(float c, float k){ float d = abs(fract(c - 0.5) - 0.5); return 1.0 - smoothstep(0.0, fwidth(c) * k, d); }
      void main(){
        // a survey mesh in the room's own coordinates: a line every 10 cm along, across and up the car
        vec3 p = vWorld / 0.1;
        vec3 n = normalize(vN);
        // a family of lines fades out where the surface lies flat against it
        vec3 keep = smoothstep(0.03, 0.45, 1.0 - n * n);
        vec3 l = vec3(ln(p.x, 1.2), ln(p.y, 1.2), ln(p.z, 1.2)) * keep;
        vec3 m = vec3(ln(p.x, 3.0), ln(p.y, 3.0), ln(p.z, 3.0)) * keep;
        float line = max(l.x, max(l.y, l.z));
        float dotv = max(m.x * m.y, max(m.x * m.z, m.y * m.z));
        float fres = pow(1.0 - abs(dot(n, normalize(vV))), 2.0);
        // the scan goes round the car: a point has been read once the light has passed its bearing
        float th = mod(atan(vWorld.z, vWorld.x) - uTheta0, 6.2831853);
        float seen = smoothstep(0.0, 0.05, uSwept - th);
        float since = mod(uSwept - th, 6.2831853);
        float read = seen * (0.3 + 0.7 * exp(-since / 1.1));
        // the light itself: the upright sheet from the ball to the middle of the car
        float off = dot(vWorld.xz, vec2(-uDir.y, uDir.x));
        float band = exp(-pow(off / 0.03, 2.0)) * step(0.0, dot(vWorld.xz, uDir));
        vec3 col = uIce * (line * 0.3 + dotv * 1.4 + fres * 0.22) * read * uOn;
        col += uIce * band * 3.2 * uOn;
        // while the car is apart every panel keeps a faint survey, so each one reads as a part of its own
        col += uIce * (line * 0.2 + dotv * 0.9 + fres * 0.3) * uHold * (1.0 - uIsAmber);
        // damaged parts hold an amber survey of their own once the scan has found them
        float a = uAmber * uIsAmber;
        col += uAmberCol * a * (line * 0.55 + dotv * 1.3 + fres * 1.1 + 0.07);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export async function createBay(canvas: HTMLCanvasElement, opts: BayOptions): Promise<Bay> {
  const mobile = opts.mobile;
  // the two scanned models come first: without them there is no scene, and the caller shows the stills instead
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [carFile, consoleFile] = await Promise.all([loader.loadAsync("/landing/car.glb"), loader.loadAsync("/landing/console.glb")]);

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
  key.shadow.camera.left = -4.5; key.shadow.camera.right = 4.5; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1; key.shadow.camera.far = 14;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe9ff, 0.04);
  rim.position.set(-5, 3, 5);
  scene.add(rim);
  const amberLight = new THREE.PointLight(AMBER, 0, 4.5, 1.6);
  amberLight.position.set(2.5, 0.9, -1.5);
  scene.add(amberLight);
  const goLight = new THREE.PointLight(GO, 0, 9, 1.4);
  goLight.position.set(1.5, 0.5, -2.2);
  scene.add(goLight);

  // ── things
  const scan: Scan = { uDir: { value: new THREE.Vector2(1, 0) }, uTheta0: { value: SCAN_FROM }, uSwept: { value: 0 }, uOn: { value: 0 }, uTime: { value: 0 } };
  const holo = overlayMaterial(scan, false);
  const amberHolo = overlayMaterial(scan, true);
  const car = buildCar(carFile, holo, amberHolo);
  scene.add(car.group);
  const frameScale = car.frame ? car.frame.scale.x : 1;
  const room = buildRoom(mobile);
  scene.add(room.group);
  const con = buildConsole(mobile, consoleFile);
  scene.add(con.group);
  const bot = buildBot();
  scene.add(bot.group);

  // the scan light: an upright fan from the ball to the middle of the car, and the line it draws on the floor
  const fanGeo = new THREE.BufferGeometry();
  fanGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
  fanGeo.setAttribute("aB", new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 3));
  const fanMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: glow(ICE, 1) }, uOn: scan.uOn, uTime: scan.uTime },
    vertexShader: "attribute vec3 aB; varying vec3 vB; void main(){ vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 uColor; uniform float uOn; uniform float uTime; varying vec3 vB;
      void main(){
        // rays from the ball: a few brighter threads in a faint sheet
        float ray = vB.z / max(1e-4, vB.y + vB.z);
        float threads = 0.55 + 0.45 * smoothstep(0.55, 1.0, sin(ray * 70.0 + uTime * 1.6));
        float edge = smoothstep(0.0, 0.04, ray) * smoothstep(1.0, 0.96, ray);
        gl_FragColor = vec4(uColor * uOn * (0.05 + 0.3 * vB.x * vB.x) * threads * edge, 1.0);
      }`,
  });
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.frustumCulled = false;
  fan.renderOrder = 5;
  scene.add(fan);
  const traceGeo = new THREE.PlaneGeometry(1, 0.03);
  traceGeo.rotateX(-Math.PI / 2);
  traceGeo.translate(0.5, 0, 0);
  const traceMat = lightMat(ICE, 2.6, { transparent: true, opacity: 0, depthWrite: false });
  const trace = new THREE.Mesh(traceGeo, traceMat);
  trace.position.y = 0.008;
  trace.renderOrder = 3;
  scene.add(trace);

  // leader lines: damaged part → its row on the form
  const leadMat = new THREE.LineBasicMaterial({ color: glow(AMBER, 1.8), transparent: true });
  const dotGeo = new THREE.SphereGeometry(0.018, 10, 8);
  const dotMat = new THREE.MeshBasicMaterial({ color: glow(AMBER, 2.2), transparent: true, toneMapped: false });
  const leads = car.damaged.map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const line = new THREE.Line(geo, leadMat);
    line.frustumCulled = false;
    line.renderOrder = 9;
    const d0 = new THREE.Mesh(dotGeo, dotMat);
    const d1 = new THREE.Mesh(dotGeo, dotMat);
    scene.add(line, d0, d1);
    return { geo, line, d0, d1 };
  });
  // rows on the form, top to bottom, follow the parts from the highest to the lowest, so the lines do not cross
  const ROW: Record<string, number> = { bonnet: 0, lampL: 1, grille: 2, fenderL: 3, bumperF: 4 };
  const rowOf = car.damaged.map((p, i) => ROW[p.name] ?? i);
  // parts that stand on the floor slide; everything else is in the air and breathes
  const floats = car.parts.map((p) => !/^(wheel|under)/.test(p.name));

  // ── post
  const size = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), mobile ? 0.42 : 0.5, 0.6, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const keys = mobile ? MOBILE : DESKTOP;
  const cur = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 32, shift: new THREE.Vector2() };
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const vd = new THREE.Vector3();
  const ve = new THREE.Vector3();
  const ball = new THREE.Vector3();
  const gaze = new THREE.Vector3();
  const slot = con.slotWorld(new THREE.Vector3());
  const eyeColour = new THREE.Color();
  let W = 1;
  let H = 1;
  let t = 0;
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

  /** Everything in the room for the current `t`. `time` only adds the breathing; 0 gives the plain still. */
  function pose(time: number) {
    const wave = time * (TAU / 4200); // one breath every 4.2 s

    // ── the ball: where it is
    const toWatch = seg(t, 0.045, 0.165);
    const toOrbit = seg(t, 0.288, 0.335);
    const toDesk = seg(t, 0.535, 0.605);
    const toHome = seg(t, 0.87, 0.955);
    const sweptDeg = t < SCAN_T[1]
      ? SCAN_DEG[0] * clamp01((t - SCAN_T[0]) / (SCAN_T[1] - SCAN_T[0]))
      : lerp(SCAN_DEG[0], SCAN_DEG[1], seg(t, SCAN_T[1], SCAN_T[2]));
    const theta = SCAN_FROM + sweptDeg * RAD;
    ball.set(...REST).lerp(va.set(...(mobile ? WATCH_NARROW : WATCH)), toWatch);
    ball.y += Math.sin(toWatch * Math.PI) * 0.28;
    if (toOrbit > 0) ball.lerp(orbit(theta, va), toOrbit);
    if (toDesk > 0) { ball.lerp(va.set(...DESK), toDesk); ball.y += Math.sin(toDesk * Math.PI) * 0.12; }
    if (toHome > 0) { ball.lerp(va.set(...(mobile ? HOME_NARROW : HOME)), toHome); ball.y += Math.sin(toHome * Math.PI) * 0.22; }
    // it is never quite still; more so when the page is
    ball.y += Math.sin(wave + 0.6) * 0.055 * (time ? 0.4 + 0.6 * breath : 0);
    bot.group.position.copy(ball);
    // ── what it looks at: the viewer, the slot, the car, the form, the viewer again
    gaze.set(0, 0, 0)
      .addScaledVector(va.copy(cur.pos).lerp(vb.set(0.6, 0.9, 0), 0.22), 1 - toWatch)
      .addScaledVector(slot, toWatch * (1 - toOrbit))
      .addScaledVector(va.set(0, lerp(0.75, ball.y, 0.5), 0).lerp(cur.pos, 0.42), toOrbit * (1 - toDesk))
      .addScaledVector(va.set(FORM_AT.x, 1.3, FORM_AT.z).lerp(cur.pos, 0.45), toDesk * (1 - toHome))
      .addScaledVector(cur.pos, toHome);
    bot.group.lookAt(gaze);
    // ── its eyes
    const on = pulse(t, 0.3, 0.326, 0.54, 0.585);
    const edges = [0.3, 0.6, 0.905];
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
    bot.light.color.copy(eyeColour.copy(ICE).lerp(GO, done));
    bot.light.intensity = 0.9 + on * 8;
    bot.halo.opacity = 0.1 + on * 0.34;
    bot.halo.color.copy(eyeColour);

    // ── scan: the light goes round the car
    scan.uOn.value = on;
    scan.uSwept.value = sweptDeg * RAD;
    scan.uDir.value.set(Math.cos(theta), Math.sin(theta));
    const fanOn = on > 0.004;
    fan.visible = trace.visible = fanOn;
    if (fanOn) {
      const arr = fanGeo.attributes.position.array as Float32Array;
      arr.set([ball.x, ball.y, ball.z, 0, 1.5, 0, 0, 0.03, 0]);
      fanGeo.attributes.position.needsUpdate = true;
      trace.rotation.y = -Math.atan2(ball.z, ball.x);
      trace.scale.x = Math.hypot(ball.x, ball.z);
      traceMat.opacity = on * 0.85;
    }

    con.set(t, time);
    con.float(time ? Math.sin(wave + 1.1) * 0.02 * breath : 0);

    // ── the car comes apart, is keyed, and goes back together
    const apart = seg(t, 0.57, 0.66) * (1 - seg(t, 0.845, 0.93));
    const amber = seg(t, 0.525, 0.565) * (1 - seg(t, 0.86, 0.925));
    for (let i = 0; i < car.parts.length; i++) {
      const p = car.parts[i];
      const lag = ((i * 7) % 11) * 0.0022;
      const e = seg(t, 0.57 + lag, 0.64 + lag) * (1 - seg(t, 0.845 + lag * 0.6, 0.915 + lag * 0.6));
      const reach = p.damaged ? 1.45 : 1;
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
    let lifted = 0;
    car.damaged.forEach((p, i) => {
      const lead = leads[i];
      const drawn = seg(t, 0.6 + i * 0.012, 0.665 + i * 0.012) * (1 - seg(t, 0.84, 0.9));
      lifted = Math.max(lifted, apart);
      lead.line.visible = lead.d0.visible = lead.d1.visible = drawn > 0.002;
      if (drawn > 0.002) {
        va.copy(p.mesh.position);
        con.rowAnchor(rowOf[i], vd);
        // an elbow: out level with the row, then along to it
        vb.set(lerp(va.x, vd.x, 0.45), vd.y, lerp(va.z, vd.z, 0.45));
        const a1 = clamp01(drawn * 2);
        const a2 = clamp01(drawn * 2 - 1);
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
    holo.uniforms.uHold.value = apart * 0.55;
    amberLight.intensity = lifted * 5;

    // ── done: the ring closes, the room breathes out
    room.ringMat.uniforms.uSweep.value = done * 1.03;
    goLight.intensity = done * 7;
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
  }

  function render(time: number) {
    resize();
    // stillness: a moment after the page stops moving, things in the air start to breathe; they settle as it moves again
    if (time) {
      const dt = lastTime ? Math.min(100, time - lastTime) : 16;
      lastTime = time;
      if (moved) { lastMove = time; moved = false; }
      const want = smooth((time - lastMove - 140) / 650);
      breath += (want - breath) * (1 - Math.exp(-dt / 240));
    } else { breath = 0; moved = false; }
    pose(time);
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
    scan.uTime.value = time * 0.001;
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
      leadMat.dispose(); dotGeo.dispose(); dotMat.dispose();
      for (const l of leads) l.geo.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) {
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
