import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clamp01, lerp, rng, seg, smooth } from "./math";
import { AMBER, GO, ICE, glow, lightMat } from "./room";

/**
 * The intake console beside the car (a scanned model), and everything that happens at it:
 *   Upload     the case file (documents and photos) flies in and drops into the slot
 *   Autopilot  a glass claim form rises out of it; one row per damaged part types itself and is ticked
 * No words anywhere: rows are bars, marks and ticks.
 */

const N_CARDS = 40;
const ROWS = 5;
// slab, local to the console
const SLAB_W = 1.02;
const SLAB_H = 1.34;
const SLAB_Y = 0.78;
/** where the glass form stands: in front of the car's tail, clear of the panels when they come apart */
export const FORM_AT = new THREE.Vector3(-1.0, 0, -2.9);
// where the slot sits on the plinth's sloped top, local to the console
const SLOT = new THREE.Vector3(-0.01, 0.923, -0.008);

export type Console = {
  group: THREE.Group;
  /** world position of the left end of row r on the glass form (where a leader line lands) */
  rowAnchor(r: number, out: THREE.Vector3): THREE.Vector3;
  set(t: number, time: number): void;
  float(dy: number): void;
  /** world position of the slot the case file drops into */
  slotWorld(out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
};

function tickGeometry(size: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const w = 0.2;
  // a check mark as one outline, in a unit box
  s.moveTo(-0.5, 0.02); s.lineTo(-0.5 + w * 0.7, 0.02 + w * 0.7); s.lineTo(-0.14, -0.18); s.lineTo(0.5 - w * 0.7, 0.5);
  s.lineTo(0.5, 0.5 - w * 0.7); s.lineTo(-0.14, -0.18 - w * 1.45); s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.scale(size, size, size);
  return g;
}

export function buildConsole(mobile: boolean, gltf: GLTF | null): Console {
  const group = new THREE.Group();
  group.position.set(-3.25, 0, -2.75);
  group.rotation.y = 0.5;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // ── body: the scanned plinth; its slot and edge lines are in its own light map
  const body = keep(new THREE.MeshStandardMaterial({ color: 0x1a212a, roughness: 0.42, metalness: 0.65 }));
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

  // ── the case file: documents and photos, instanced
  const quat = new THREE.Quaternion();
  const cardGeo = keep(new THREE.PlaneGeometry(1, 1));
  const kind = new Float32Array(N_CARDS);
  const seed = new Float32Array(N_CARDS);
  const fade = new Float32Array(N_CARDS);
  const r = rng(11);
  const spin: THREE.Quaternion[] = [];
  const jitter: THREE.Vector3[] = [];
  for (let i = 0; i < N_CARDS; i++) {
    kind[i] = i % 5 === 0 || i % 7 === 0 ? 0 : 1; // mostly photos, a few documents
    if (i < 4) kind[i] = 0; // the documents lead
    seed[i] = r() * 10;
    spin.push(new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 2.4, (r() - 0.5) * 3.2, (r() - 0.5) * 2.2)));
    jitter.push(new THREE.Vector3((r() - 0.5) * 1.5, (r() - 0.5) * 1.1, (r() - 0.5) * 1.5));
  }
  cardGeo.setAttribute("aKind", new THREE.InstancedBufferAttribute(kind, 1));
  cardGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
  const fadeAttr = new THREE.InstancedBufferAttribute(fade, 1);
  fadeAttr.setUsage(THREE.DynamicDrawUsage);
  cardGeo.setAttribute("aFade", fadeAttr);
  const cardMat = keep(new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    vertexShader: `
      attribute float aKind; attribute float aSeed; attribute float aFade;
      varying vec2 vUv; varying float vKind; varying float vSeed; varying float vFade; varying vec3 vN;
      void main(){
        vUv = uv; vKind = aKind; vSeed = aSeed; vFade = aFade;
        mat4 m = modelMatrix * instanceMatrix;
        vN = normalize(mat3(m) * normal);
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv; varying float vKind; varying float vSeed; varying float vFade; varying vec3 vN;
      float box(vec2 p, vec2 a, vec2 b){ vec2 s = step(a, p) * step(p, b); return s.x * s.y; }
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        vec3 paper = vec3(0.78, 0.85, 0.92);
        vec3 col = paper;
        if (vKind < 0.5) {
          // a document: a heading block and ragged lines
          float lines = 0.0;
          for (int i = 0; i < 9; i++) {
            float y = 0.76 - float(i) * 0.076;
            float w = 0.4 + 0.5 * hash(vSeed * 91.7 + float(i) * 12.3);
            lines += box(vUv, vec2(0.12, y), vec2(0.12 + w * 0.76, y + 0.026));
          }
          float head = box(vUv, vec2(0.12, 0.85), vec2(0.5, 0.91));
          col = mix(col, vec3(0.34, 0.40, 0.47), clamp(lines, 0.0, 1.0) * 0.8);
          col = mix(col, vec3(0.09, 0.12, 0.16), head);
        } else {
          // a photo: white border, a dark picture, one amber mark where the damage is
          float inner = box(vUv, vec2(0.055, 0.08), vec2(0.945, 0.92));
          vec3 pic = mix(vec3(0.07, 0.09, 0.12), vec3(0.26, 0.33, 0.41), vUv.y + 0.18 * sin(vSeed * 7.0 + vUv.x * 3.0));
          vec2 c = vec2(0.42 + 0.2 * hash(vSeed * 3.3), 0.44);
          float blob = smoothstep(0.36, 0.30, length((vUv - c) * vec2(1.0, 1.55)));
          pic = mix(pic, vec3(0.50, 0.58, 0.66), blob * 0.85);
          vec2 mk = vec2(0.28 + 0.44 * hash(vSeed * 5.1), 0.34 + 0.3 * hash(vSeed * 9.7));
          float mark = smoothstep(0.05, 0.034, length((vUv - mk) * vec2(1.4, 1.0)));
          pic = mix(pic, vec3(1.0, 0.69, 0.13) * 1.7, mark);
          col = mix(col, pic, inner);
        }
        float shade = 0.5 + 0.5 * abs(dot(normalize(vN), normalize(vec3(0.35, 0.6, -0.7))));
        gl_FragColor = vec4(col * shade * 1.12, vFade);
      }`,
  }));
  const cards = new THREE.InstancedMesh(cardGeo, cardMat, N_CARDS);
  cards.frustumCulled = false;
  cards.renderOrder = 6;
  // cards live in world space, not under the rotated console
  const world = new THREE.Group();

  // ── the glass claim form
  // it stands on its own floor emitter beside the damaged corner
  const form = new THREE.Group();
  form.position.set(FORM_AT.x, 0, FORM_AT.z);
  form.rotation.y = -1.0;
  // flush in the floor and dark until the form rises
  const emitter = new THREE.Mesh(keep(new THREE.BoxGeometry(SLAB_W + 0.08, 0.01, 0.07)), body);
  emitter.position.y = 0.005;
  const emitterGlow = new THREE.Mesh(keep(new THREE.BoxGeometry(SLAB_W, 0.004, 0.014)), keep(lightMat(ICE, 0.5)));
  emitterGlow.position.y = 0.012;
  form.add(emitter, emitterGlow);
  const slab = new THREE.Group();
  slab.position.set(0, SLAB_Y, 0);
  form.add(slab);
  // two faint beams from the floor to the form's lower corners: it is projected, not hung
  const beamMat = keep(new THREE.LineBasicMaterial({ color: glow(ICE, 0.9), transparent: true, opacity: 0, depthWrite: false }));
  const beams = new THREE.LineSegments(keep(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-SLAB_W / 2, 0.014, 0), new THREE.Vector3(-SLAB_W / 2, SLAB_Y, 0),
    new THREE.Vector3(SLAB_W / 2, 0.014, 0), new THREE.Vector3(SLAB_W / 2, SLAB_Y, 0),
  ])), beamMat);
  form.add(beams);
  const glassMat = keep(new THREE.MeshBasicMaterial({ color: glow(ICE, 0.35), transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  const glass = new THREE.Mesh(keep(new THREE.PlaneGeometry(SLAB_W, SLAB_H)), glassMat);
  glass.position.y = SLAB_H / 2;
  glass.renderOrder = 7;
  slab.add(glass);
  const frameMat = keep(new THREE.LineBasicMaterial({ color: glow(ICE, 1.4), transparent: true, depthWrite: false }));
  const fw = SLAB_W / 2, fh = SLAB_H;
  const frame = new THREE.LineLoop(keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-fw, 0, 0), new THREE.Vector3(fw, 0, 0), new THREE.Vector3(fw, fh, 0), new THREE.Vector3(-fw, fh, 0)])), frameMat);
  frame.renderOrder = 8;
  slab.add(frame);
  const flat = (c: THREE.Color, k: number) => keep(new THREE.MeshBasicMaterial({ color: glow(c, k), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const unit = keep(new THREE.PlaneGeometry(1, 1));
  unit.translate(0.5, 0, 0); // grows from its left edge
  const sq = keep(new THREE.PlaneGeometry(1, 1));
  const tickGeo = keep(tickGeometry(0.06));
  const bigTickGeo = keep(tickGeometry(0.2));
  const boxGeo = keep(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0), new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0)]));
  // the form faces the console's front (-z): build its contents mirrored so they read left to right from there
  const content = new THREE.Group();
  content.rotation.y = Math.PI;
  content.position.z = -0.004;
  slab.add(content);
  // heading: two bars
  const headMat = flat(ICE, 0.9);
  const head1 = new THREE.Mesh(unit, headMat);
  head1.scale.set(0.4, 0.05, 1); head1.position.set(-0.41, SLAB_H - 0.14, 0);
  const head2 = new THREE.Mesh(unit, flat(ICE, 0.35));
  head2.scale.set(0.24, 0.022, 1); head2.position.set(-0.41, SLAB_H - 0.21, 0);
  content.add(head1, head2);
  const rule = new THREE.Mesh(unit, flat(ICE, 0.3));
  rule.scale.set(0.82, 0.004, 1); rule.position.set(-0.41, SLAB_H - 0.29, 0);
  content.add(rule);

  type Row = { y: number; mark: THREE.MeshBasicMaterial; name: THREE.Mesh; qty: THREE.Mesh; nameW: number; qtyW: number; box: THREE.LineBasicMaterial; tick: THREE.Mesh; tickMat: THREE.MeshBasicMaterial; caret: THREE.Mesh; nameMat: THREE.MeshBasicMaterial };
  const rows: Row[] = [];
  const rr = rng(5);
  for (let i = 0; i < ROWS; i++) {
    const y = SLAB_H - 0.42 - i * 0.17;
    const markMat = flat(AMBER, 1.5);
    const mark = new THREE.Mesh(sq, markMat);
    mark.scale.set(0.045, 0.045, 1); mark.position.set(-0.385, y, 0);
    const nameMat = flat(ICE, 0.95);
    const name = new THREE.Mesh(unit, nameMat);
    const nameW = 0.2 + rr() * 0.16;
    name.position.set(-0.32, y, 0);
    const qty = new THREE.Mesh(unit, flat(ICE, 0.45));
    const qtyW = 0.07 + rr() * 0.07;
    qty.position.set(0.1, y, 0);
    const caret = new THREE.Mesh(sq, flat(AMBER, 2));
    caret.scale.set(0.012, 0.05, 1);
    const boxMat = keep(new THREE.LineBasicMaterial({ color: glow(ICE, 0.8), transparent: true }));
    const box = new THREE.LineLoop(boxGeo, boxMat);
    box.scale.set(0.075, 0.075, 1); box.position.set(0.37, y, 0);
    const tickMat = flat(GO, 1.9);
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(0.37, y + 0.004, 0.001);
    const line = new THREE.Mesh(unit, flat(ICE, 0.16));
    line.scale.set(0.82, 0.003, 1); line.position.set(-0.41, y - 0.085, 0);
    content.add(mark, name, qty, caret, box, tick, line);
    rows.push({ y, mark: markMat, name, qty, nameW, qtyW, box: boxMat, tick, tickMat, caret, nameMat });
  }
  // the whole form signed off
  const doneMat = flat(GO, 2.1);
  const doneTick = new THREE.Mesh(bigTickGeo, doneMat);
  doneTick.position.set(0.3, SLAB_H - 0.165, 0.001);
  content.add(doneTick);

  const P0 = new THREE.Vector3();
  const P1 = new THREE.Vector3();
  const P2 = new THREE.Vector3();
  const P3 = new THREE.Vector3();
  const p = new THREE.Vector3();
  const endQ = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  group.updateMatrixWorld(true);
  form.updateMatrixWorld(true);
  world.add(cards);

  function set(t: number, time: number) {
    group.updateMatrixWorld(true);
    // ── cards: along a curve from behind the camera's shoulder down into the slot
    P3.set(SLOT.x, SLOT.y + 0.03, SLOT.z).applyMatrix4(group.matrixWorld);
    P2.set(0, 2.25, -0.55).applyMatrix4(group.matrixWorld);
    P1.set(P3.x - 0.6, 3.3, P3.z - 2.6);
    P0.set(P3.x - 1.6, 4.4, P3.z - 5.6);
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
      const isDoc = kind[i] < 0.5;
      const sink = 1 - seg(u, 0.93, 1);
      sc.set(isDoc ? 0.3 : 0.4, (isDoc ? 0.42 : 0.28) * lerp(0.25, 1, sink), 1);
      m4.compose(p, quat, sc);
      cards.setMatrixAt(i, m4);
      fade[i] = q <= 0 || q >= 1 ? 0 : Math.min(1, q * 9) * sink;
    }
    cards.instanceMatrix.needsUpdate = true;
    fadeAttr.needsUpdate = true;
    cards.visible = tau > 0 && tau < 1;

    // the slot: awake while the file is going in, steady afterwards
    const feeding = seg(t, 0.08, 0.14) * (1 - seg(t, 0.29, 0.33));
    const shimmer = 0.85 + 0.15 * Math.sin(time * 0.006);
    if (skin) (skin as THREE.MeshStandardMaterial).emissiveIntensity = 1.3 + feeding * 3.4 * shimmer;
    slotLight.intensity = 0.4 + feeding * 2.6;

    // ── glass form
    // up for the keying; signed off, it sinks back into the floor so the ending is clear
    const up = seg(t, 0.555, 0.625) * (1 - seg(t, 0.925, 0.972));
    slab.visible = emitter.visible = emitterGlow.visible = up > 0.001;
    slab.scale.set(1, Math.max(0.001, up), 1);
    const closing = seg(t, 0.875, 0.925); // signed off
    (emitterGlow.material as THREE.MeshBasicMaterial).color.copy(ICE).lerp(GO, closing).multiplyScalar(0.02 + up * 2.6);
    glassMat.opacity = 0.07 * up + 0.03 * closing;
    glassMat.color.copy(ICE).lerp(GO, closing).multiplyScalar(0.35);
    frameMat.color.copy(ICE).lerp(GO, closing).multiplyScalar(1.4);
    frameMat.opacity = up;
    beamMat.opacity = up * 0.32;
    beamMat.color.copy(ICE).lerp(GO, closing).multiplyScalar(0.9);
    headMat.opacity = up;
    doneMat.opacity = closing;
    doneTick.scale.setScalar(0.6 + 0.4 * closing);
    for (let i = 0; i < ROWS; i++) {
      const row = rows[i];
      const t0 = 0.635 + i * 0.034;
      const typed = seg(t, t0, t0 + 0.04);
      const ticked = seg(t, t0 + 0.042, t0 + 0.058);
      row.name.scale.set(Math.max(0.0001, row.nameW * typed), 0.03, 1);
      row.qty.scale.set(Math.max(0.0001, row.qtyW * seg(t, t0 + 0.02, t0 + 0.04)), 0.03, 1);
      row.caret.visible = typed > 0.001 && typed < 0.999;
      row.caret.position.set(-0.32 + row.nameW * typed + 0.012, row.y, 0);
      row.mark.opacity = up * lerp(0.35, 1, typed);
      row.mark.color.copy(AMBER).lerp(GO, ticked).multiplyScalar(1.5);
      row.nameMat.opacity = up;
      row.box.opacity = up * lerp(0.5, 1, typed);
      row.box.color.copy(ICE).lerp(GO, ticked).multiplyScalar(lerp(0.8, 1.8, ticked));
      row.tickMat.opacity = ticked;
      row.tick.scale.setScalar(0.5 + 0.5 * ticked);
    }
  }

  function rowAnchor(rIdx: number, out: THREE.Vector3) {
    // content is mirrored, so the row's left end sits at +x in slab space
    out.set(0.46, rows[rIdx].y * Math.max(0.001, slab.scale.y), -0.004);
    slab.updateWorldMatrix(true, false);
    return slab.localToWorld(out);
  }

  void mobile;

  /** how far the glass form floats off its rest height (the breathing of things in the air) */
  function float(dy: number) { slab.position.y = SLAB_Y + dy; }

  const root = new THREE.Group();
  root.add(group, world, form);

  return {
    group: root,
    rowAnchor,
    set,
    float,
    slotWorld(out) { group.updateMatrixWorld(true); return out.copy(SLOT).applyMatrix4(group.matrixWorld); },
    dispose() { for (const d of disposables) d.dispose(); },
  };
}

export const DAMAGED_ROWS = ROWS;
