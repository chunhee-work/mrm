import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { rng } from "./math";

export const ICE = new THREE.Color(0xbfe9ff);
export const AMBER = new THREE.Color(0xffb020);
export const GO = new THREE.Color(0x3ddc97);
export const BAY = new THREE.Color(0x07090c);

/** A colour brighter than white, so the bloom pass picks it up as a light. */
export const glow = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
export const lightMat = (c: THREE.Color, k: number, opts: THREE.MeshBasicMaterialParameters = {}) =>
  new THREE.MeshBasicMaterial({ color: glow(c, k), toneMapped: false, ...opts });

/** What the car's paint and glass reflect: three ceiling tubes and two soft walls of light. */
export function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x020304);
  const strip = (w: number, h: number, pos: [number, number, number], rot: [number, number, number], k: number, c = ICE) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: glow(c, k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    s.add(m);
  };
  strip(8, 3.2, [0, 4.7, 0], [Math.PI / 2, 0, 0], 1.25); // a soft box overhead: the slow gradient on bonnet, roof and shoulders
  for (const z of [-2.2, 0.2, 2.6]) strip(9, 0.3, [0, 4.2, z], [Math.PI / 2, 0, 0], 4.5); // the tubes: crisp lines in paint and glass
  strip(12, 2.4, [0, 2.4, -9], [0, 0, 0], 1.9); // soft wall on the camera side
  strip(13, 0.3, [0, 2.3, -6.5], [0, 0, 0], 2.6); // one long strip on the camera side: the highlight that runs down the car's shoulder
  strip(6, 3, [9, 2.5, 0], [0, -Math.PI / 2, 0], 1.5); // ahead of the nose
  strip(6, 2.4, [-9, 2.4, 0], [0, Math.PI / 2, 0], 0.7); // behind the tail
  strip(8, 1, [0, 0.6, 9], [0, Math.PI, 0], 0.5, new THREE.Color(0x6f8aa5)); // far side, low
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.035).texture;
  pm.dispose();
  s.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  });
  return tex;
}

function markingsTexture(): THREE.CanvasTexture {
  const S = 2048;
  const M = 16; // metres covered
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const px = (m: number) => (m / M + 0.5) * S;
  const r = rng(7);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = "rgba(150,170,188,0.42)";
  g.fillStyle = "rgba(150,170,188,0.42)";
  g.lineCap = "butt";
  // bay outline: corner brackets, not a full box
  const hx = 3.25, hz = 1.92, arm = 0.7;
  g.lineWidth = S * (0.045 / M);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.beginPath();
    g.moveTo(px(sx * (hx - arm)), px(sz * hz));
    g.lineTo(px(sx * hx), px(sz * hz));
    g.lineTo(px(sx * hx), px(sz * (hz - arm)));
    g.stroke();
  }
  // measuring ticks along both long edges, every 25 cm, longer every metre
  g.lineWidth = S * (0.012 / M);
  for (let i = -10; i <= 10; i++) {
    const x = i * 0.25;
    if (Math.abs(x) > hx - arm - 0.1) continue;
    const len = i % 4 === 0 ? 0.16 : 0.07;
    for (const sz of [-1, 1]) { g.beginPath(); g.moveTo(px(x), px(sz * hz)); g.lineTo(px(x), px(sz * (hz - len))); g.stroke(); }
  }
  // centre line, dashed
  g.lineWidth = S * (0.018 / M);
  g.setLineDash([S * (0.22 / M), S * (0.16 / M)]);
  g.beginPath(); g.moveTo(px(-3.2), px(0)); g.lineTo(px(3.2), px(0)); g.stroke();
  g.setLineDash([]);
  // wear: knock small holes out of the paint
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`;
    const w = 2 + r() * 9;
    g.fillRect(r() * S, r() * S, w, 1 + r() * 4);
  }
  g.globalCompositeOperation = "source-over";
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export type Room = {
  group: THREE.Group;
  ring: THREE.Mesh;
  ringMat: THREE.ShaderMaterial;
  tubes: THREE.MeshBasicMaterial;
  dust: THREE.Points;
  reflector: Reflector | null;
  dispose(): void;
};

export function buildRoom(mobile: boolean): Room {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ── floor: a mirror under a dark, slightly rough skin
  let reflector: Reflector | null = null;
  if (!mobile) {
    reflector = new Reflector(keep(new THREE.PlaneGeometry(60, 60)), { textureWidth: 1024, textureHeight: 1024, clipBias: 0.003, color: 0x6a737d, multisample: 4 });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = -0.002;
    group.add(reflector);
  }
  const floorMat = keep(new THREE.MeshStandardMaterial({ color: 0x090b0e, roughness: 0.78, metalness: 0, transparent: !mobile, opacity: mobile ? 1 : 0.8, envMapIntensity: 0.08 }));
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 60)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const marks = new THREE.Mesh(keep(new THREE.PlaneGeometry(16, 16)), keep(new THREE.MeshBasicMaterial({ map: keep(markingsTexture()), transparent: true, depthWrite: false, opacity: 0.85 })));
  marks.rotation.x = -Math.PI / 2;
  marks.position.y = 0.003;
  marks.renderOrder = 1;
  group.add(marks);

  // the pool of light the tubes throw on the floor round the car
  const poolTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.45, "rgba(255,255,255,0.42)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return keep(new THREE.CanvasTexture(c));
  })();
  const pool = new THREE.Mesh(keep(new THREE.PlaneGeometry(13, 8.5)), keep(new THREE.MeshBasicMaterial({ map: poolTex, color: glow(ICE, 0.085), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0.2, 0.004, 0);
  pool.renderOrder = 1;
  group.add(pool);

  // soft contact shadow under the car, so it sits on the floor even where the shadow map is coarse
  const blobTex = (() => {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(128, 64, 4, 128, 64, 126);
    grd.addColorStop(0, "rgba(0,0,0,0.9)"); grd.addColorStop(0.55, "rgba(0,0,0,0.55)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.save(); g.translate(128, 64); g.scale(1, 0.5); g.translate(-128, -64); g.fillRect(0, -64, 256, 256); g.restore();
    return keep(new THREE.CanvasTexture(c));
  })();
  const blob = new THREE.Mesh(keep(new THREE.PlaneGeometry(5.4, 2.7)), keep(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.005;
  blob.renderOrder = 2;
  group.add(blob);

  // ── ceiling tubes
  const tubes = keep(lightMat(ICE, 3.2));
  // (not on phones: a tall frame looks up into them, right behind the words)
  for (const z of mobile ? [] : [-2.2, 0.2, 2.6]) {
    const tube = new THREE.Mesh(keep(new THREE.BoxGeometry(6.4, 0.05, 0.1)), tubes);
    tube.position.set(-0.2, 3.5, z);
    group.add(tube);
    const housing = new THREE.Mesh(keep(new THREE.BoxGeometry(6.7, 0.07, 0.3)), keep(new THREE.MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.6, metalness: 0.5 })));
    housing.position.set(-0.2, 3.56, z);
    group.add(housing);
  }

  // ── back wall: ribbed panels that catch a little of the light, then fog
  const wallMat = keep(new THREE.MeshStandardMaterial({ color: 0x10151b, roughness: 0.7, metalness: 0.3 }));
  const ribGeo = keep(new THREE.BoxGeometry(0.42, 5.2, 0.12));
  const ribs = new THREE.InstancedMesh(ribGeo, wallMat, 44);
  const mtx = new THREE.Matrix4();
  for (let i = 0; i < 44; i++) { mtx.makeTranslation(-11 + i * 0.5, 2.6, 6.2 + (i % 2) * 0.06); ribs.setMatrixAt(i, mtx); }
  group.add(ribs);

  // ── the ring that closes round the car when the case is done
  const ringMat = keep(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uSweep: { value: 0 }, uColor: { value: glow(GO, 2.4) } },
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform float uSweep; uniform vec3 uColor; varying vec2 vP;
      void main(){
        // rounded rectangle outline, drawn clockwise from the nose
        vec2 h = vec2(3.05, 1.75); float rad = 0.9;
        vec2 q = abs(vP) - h + rad;
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
        float line = 1.0 - smoothstep(0.012, 0.03, abs(d));
        float halo = (1.0 - smoothstep(0.0, 0.5, abs(d))) * 0.10;
        float a = atan(vP.y, vP.x) / 6.2831853 + 0.5;
        float on = 1.0 - smoothstep(uSweep - 0.02, uSweep, a);
        on *= step(0.001, uSweep);
        gl_FragColor = vec4(uColor, (line + halo) * on);
      }`,
  }));
  const ring = new THREE.Mesh(keep(new THREE.PlaneGeometry(8.4, 5.4)), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.006;
  ring.renderOrder = 3;
  group.add(ring);

  // ── dust in the light
  const N = mobile ? 90 : 170;
  const r = rng(21);
  const dp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { dp[i * 3] = (r() - 0.5) * 12; dp[i * 3 + 1] = 0.2 + r() * 3.2; dp[i * 3 + 2] = (r() - 0.5) * 9; }
  const dg = keep(new THREE.BufferGeometry());
  dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dg, keep(new THREE.PointsMaterial({ color: glow(ICE, 1.2), size: 0.009, transparent: true, opacity: 0.32, depthWrite: false, sizeAttenuation: true })));
  group.add(dust);

  return {
    group, ring, ringMat, tubes, dust, reflector,
    dispose() {
      for (const d of disposables) d.dispose();
      if (reflector) { reflector.dispose(); }
    },
  };
}
