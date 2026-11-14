import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildCar } from "./car";
import { buildConsole } from "./console";
import { AMBER, BAY, GO, ICE, buildEnvironment, buildRoom, glow } from "./room";
import { clamp01, lerp, pulse, seg, smooth } from "./math";

/**
 * The night bay. One function of `t`:
 *   0     the car at rest in the bay
 *   0.2   Upload     the case file flies into the console
 *   0.45  Scan       the gantry's light crosses the car, tail to nose
 *   0.7   Autopilot  the damaged parts lift off and are keyed, row by row, on the glass form
 *   1     Done       parts back, form signed off, a green ring closes round the car
 * `render(time)` adds only idle motion (dust, a breath of camera drift); pass 0 for a still.
 */

export type BayOptions = { mobile: boolean };
export type Bay = { setProgress(t: number): void; render(timeMs: number): void; resize(): void; /** drop one step of quality; false when there is nothing left to drop */ degrade(): boolean; dispose(): void };

type Key = { pos: [number, number, number]; look: [number, number, number]; fov: number; shift: [number, number] };
// shift: where the picture's centre sits in the frame, as a fraction of width / height (+x = right, +y = down)
const DESKTOP: Key[] = [
  { pos: [4.9, 1.15, -6.3], look: [0.2, 0.62, 0], fov: 31, shift: [0.2, 0.03] },
  { pos: [-6.7, 1.75, -5.1], look: [-2.8, 0.98, -2.15], fov: 34, shift: [0.19, 0.02] },
  { pos: [0.4, 1.05, -7.6], look: [-0.1, 0.84, 0], fov: 30, shift: [0.17, 0.04] },
  { pos: [5.4, 1.7, -5.3], look: [1.3, 0.95, -1.3], fov: 33, shift: [0.17, 0.02] },
  { pos: [5.3, 1.45, -6.6], look: [0.1, 0.6, -0.1], fov: 32, shift: [0.17, 0.05] },
];
const MOBILE: Key[] = [
  { pos: [7.9, 2.2, -4.3], look: [0.1, 0.6, 0], fov: 50, shift: [0, 0.13] },
  { pos: [-6.6, 2.4, -7.2], look: [-2.95, 1.05, -2.5], fov: 48, shift: [0, 0.2] },
  { pos: [0.3, 1.5, -10.7], look: [0, 0.8, 0], fov: 50, shift: [0, 0.13] },
  { pos: [7.5, 2.7, -7.4], look: [1.35, 0.95, -1.1], fov: 50, shift: [0, 0.15] },
  { pos: [7.7, 2.6, -5.6], look: [0.35, 0.65, -0.4], fov: 50, shift: [0, 0.13] },
];
const STOPS = [0, 0.2, 0.45, 0.7, 1];

function overlayMaterial(scan: { uScanX: THREE.IUniform<number>; uOn: THREE.IUniform<number>; uTime: THREE.IUniform<number> }, amber: boolean) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uScanX: scan.uScanX,
      uOn: scan.uOn,
      uTime: scan.uTime,
      uAmber: { value: 0 },
      uIce: { value: glow(ICE, 1) },
      uAmberCol: { value: glow(AMBER, 1) },
      uIsAmber: { value: amber ? 1 : 0 },
    },
    vertexShader: `
      varying vec3 vWorld; varying vec2 vSV; varying vec3 vN; varying vec3 vV;
      void main(){
        vSV = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uScanX; uniform float uOn; uniform float uTime; uniform float uAmber; uniform float uIsAmber;
      uniform vec3 uIce; uniform vec3 uAmberCol;
      varying vec3 vWorld; varying vec2 vSV; varying vec3 vN; varying vec3 vV;
      void main(){
        // a survey grid in the surface's own coordinates: 10 cm along the car, a third of a span around it
        vec2 g = vec2(vSV.x / 0.1, vSV.y / 0.3333);
        vec2 d = abs(fract(g - 0.5) - 0.5);
        vec2 w = fwidth(g) * 1.2;
        float line = max(1.0 - smoothstep(0.0, w.x, d.x), 1.0 - smoothstep(0.0, w.y, d.y));
        float dotv = (1.0 - smoothstep(0.0, w.x * 2.6, d.x)) * (1.0 - smoothstep(0.0, w.y * 2.6, d.y));
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        // the scan travels toward +x: everything behind the line has been read
        float behind = uScanX - vWorld.x;
        float read = smoothstep(0.0, 0.03, behind) * exp(-max(behind, 0.0) / 1.7);
        float band = exp(-pow(behind / 0.03, 2.0));
        vec3 col = uIce * (line * 0.28 + dotv * 1.5 + fres * 0.25) * read * uOn;
        col += uIce * band * 3.2 * uOn;
        // damaged parts hold an amber survey of their own once the scan has found them
        float a = uAmber * uIsAmber;
        col += uAmberCol * a * (line * 0.55 + dotv * 1.3 + fres * 1.1 + 0.07);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function createBay(canvas: HTMLCanvasElement, opts: BayOptions): Bay {
  const mobile = opts.mobile;
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
  const scan = { uScanX: { value: -9 }, uOn: { value: 0 }, uTime: { value: 0 } };
  const holo = overlayMaterial(scan, false);
  const amberHolo = overlayMaterial(scan, true);
  const car = buildCar(holo, amberHolo);
  scene.add(car.group);
  const room = buildRoom(mobile);
  scene.add(room.group);
  const con = buildConsole(mobile);
  scene.add(con.group);

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
  const ROW: Record<string, number> = { bonnet: 0, lampL: 1, grille: 2, fenderL: 3, bumper: 4 };
  const rowOf = car.damaged.map((p, i) => ROW[p.name] ?? i);

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
  let W = 1;
  let H = 1;
  let t = 0;

  function cameraAt(tt: number) {
    let i = 0;
    while (i < 3 && tt > STOPS[i + 1]) i++;
    const f = smooth(clamp01((tt - STOPS[i]) / (STOPS[i + 1] - STOPS[i])));
    const k = (j: number) => keys[Math.max(0, Math.min(4, j))];
    // Catmull-Rom through the stops, so the camera does not corner
    const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    const v3 = (get: (k: Key) => [number, number, number], out: THREE.Vector3) => {
      const a = get(k(i - 1)), b = get(k(i)), c = get(k(i + 1)), d = get(k(i + 2));
      return out.set(cr(a[0], b[0], c[0], d[0]), cr(a[1], b[1], c[1], d[1]), cr(a[2], b[2], c[2], d[2]));
    };
    v3((q) => q.pos, cur.pos);
    v3((q) => q.look, cur.look);
    cur.fov = lerp(k(i).fov, k(i + 1).fov, f);
    cur.shift.set(lerp(k(i).shift[0], k(i + 1).shift[0], f), lerp(k(i).shift[1], k(i + 1).shift[1], f));
  }

  function setProgress(tt: number) {
    t = clamp01(tt);
    cameraAt(t);

    // ── scan: gantry out and back, light on while it reads
    const sweep = seg(t, 0.33, 0.575);
    const back = seg(t, 0.6, 0.69);
    const gx = lerp(lerp(-2.95, 2.55, sweep), -2.95, back);
    room.gantry.position.x = gx;
    const on = pulse(t, 0.315, 0.345, 0.575, 0.61);
    scan.uOn.value = on;
    scan.uScanX.value = lerp(-2.95, 2.55, sweep);
    room.gantryLight.intensity = on * 9;
    room.scanStrip.color.copy(ICE).multiplyScalar(0.7 + on * 2.2);
    (room.floorLine.material as THREE.MeshBasicMaterial).opacity = on;
    // conduit: light runs from the console to the gantry's rail when the file is in
    const run = seg(t, 0.26, 0.33) * (1 - seg(t, 0.36, 0.42));
    const runLen = seg(t, 0.26, 0.33) * 1.05;
    room.conduit.visible = run > 0.001;
    room.conduit.scale.set(Math.max(0.001, runLen), 1, 1);
    room.conduit.rotation.z = Math.PI / 2; // lies along z: console → rail
    room.conduit.position.set(-3.05, 0.007, -2.62 + runLen / 2);
    (room.conduit.material as THREE.MeshBasicMaterial).opacity = run;

    con.set(t, 0);

    // ── damaged parts: found (amber), lifted, keyed, put back
    let lifted = 0;
    car.damaged.forEach((p, i) => {
      const found = seg(t, 0.525 + i * 0.008, 0.56 + i * 0.008) * (1 - seg(t, 0.93, 0.985));
      const e = seg(t, 0.57 + i * 0.012, 0.655 + i * 0.012) * (1 - seg(t, 0.845 + i * 0.01, 0.925 + i * 0.01));
      lifted = Math.max(lifted, e);
      p.mesh.position.copy(p.home).addScaledVector(p.lift, e);
      p.mesh.rotation.set(p.tilt.x * e, p.tilt.y * e, p.tilt.z * e);
      const mat = p.mesh.material as THREE.MeshPhysicalMaterial;
      if (p.kind === "paint") { mat.emissive.copy(AMBER); mat.emissiveIntensity = found * 0.5; }
      // leader line
      const lead = leads[i];
      const drawn = seg(t, 0.6 + i * 0.012, 0.665 + i * 0.012) * (1 - seg(t, 0.84, 0.9));
      lead.line.visible = lead.d0.visible = lead.d1.visible = drawn > 0.002;
      if (drawn > 0.002) {
        va.copy(p.home).addScaledVector(p.lift, e);
        va.y += 0.02;
        con.rowAnchor(rowOf[i], vd);
        // an elbow: out level with the row, then along to it
        vb.set(lerp(va.x, vd.x, 0.45), vd.y, lerp(va.z, vd.z, 0.45));
        const a1 = clamp01(drawn * 2);
        const a2 = clamp01(drawn * 2 - 1);
        vc.copy(va).lerp(vb, a1);
        const end = vc.clone().lerp(vd, a2);
        const arr = lead.geo.attributes.position.array as Float32Array;
        arr.set([va.x, va.y, va.z, vc.x, vc.y, vc.z, end.x, end.y, end.z]);
        lead.geo.attributes.position.needsUpdate = true;
        lead.d0.position.copy(va);
        lead.d1.position.copy(end);
      }
    });
    amberHolo.uniforms.uAmber.value = seg(t, 0.53, 0.57) * (1 - seg(t, 0.93, 0.985));
    amberLight.intensity = lifted * 5;
    leadMat.opacity = 1;

    // ── done: the ring closes, the room breathes out
    const done = seg(t, 0.9, 0.99);
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
      con.set(t, time);
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
      holo.dispose();
      amberHolo.dispose();
      leadMat.dispose(); dotGeo.dispose(); dotMat.dispose();
      for (const l of leads) l.geo.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) {
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
