import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { AMBER, GO, ICE, glow } from "./room";

/**
 * The scan ball: a matt black shell in panels, one glass lens, two small lamps beside it and a ring of light round
 * its middle (a scanned model made with Higgsfield, like the car). It faces +z, so `group.lookAt(p)` points the lens at p.
 * It has no face to pull: what it is doing shows in its light, which the model carries as a grey map the page colours.
 *   mode 0  at rest: a steady cold light      mode 1  scanning: bright, a pulse running
 *   mode 2  keying: amber, a slow pulse       mode 3  done: green
 * Between two modes the light dips and comes back as the next one.
 */

export const BOT_R = 0.17;

export type Face = { mode: 0 | 1 | 2 | 3; /** 0 = the light is down, 1 = fully the mode's light */ open: number; /** 0..1, where the pulse is */ phase: number };

export type Bot = {
  group: THREE.Group;
  light: THREE.PointLight;
  /** a small lamp of its own, kept between the ball and the viewer by the scene, so the black shell shows its panels in a dark room */
  key: THREE.PointLight;
  /** soft glow round the ball, 0..1 */
  halo: THREE.SpriteMaterial;
  setFace(f: Face): void;
  dispose(): void;
};

// the lens sits a little above the ring; the shell is tipped forward by this much so the lens looks straight ahead
const LENS_TILT = 0.2;
const COLOURS = [ICE, ICE, AMBER, GO];
const LEVEL = [2.6, 4.2, 3.2, 3.4];

export function buildBot(gltf: GLTF): Bot {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.12; // it always carries its head a little to one side
  group.add(tilt);
  const shell = new THREE.Group();
  shell.rotation.x = LENS_TILT;
  shell.scale.setScalar(BOT_R); // the model has radius 1
  shell.add(gltf.scene);
  tilt.add(shell);

  const disposables: { dispose(): void }[] = [];
  let skin: THREE.MeshStandardMaterial | null = null;
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    disposables.push(m.geometry);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!skin) {
      skin = mat;
      mat.emissive = ICE.clone();
      mat.emissiveIntensity = LEVEL[0];
      // the scan reads the shell as bare metal, which in a dark room is simply black: half of it is paint here
      mat.metalness = 0.5;
      disposables.push(mat);
      for (const t of [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.emissiveMap]) if (t) disposables.push(t);
    }
  });

  const light = new THREE.PointLight(ICE, 1, 5.5, 1.6);
  group.add(light);
  const key = new THREE.PointLight(0xdcecff, 0, 1.5, 1.5);

  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 128;
  const hg = haloCanvas.getContext("2d")!;
  const grd = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.9)"); grd.addColorStop(0.3, "rgba(255,255,255,0.28)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  hg.fillStyle = grd; hg.fillRect(0, 0, 128, 128);
  const haloTex = new THREE.CanvasTexture(haloCanvas);
  const halo = new THREE.SpriteMaterial({ map: haloTex, color: glow(ICE, 1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  disposables.push(haloTex, halo);
  const haloSprite = new THREE.Sprite(halo);
  haloSprite.scale.setScalar(BOT_R * 7);
  haloSprite.renderOrder = 4;
  group.add(haloSprite);

  function setFace(f: Face) {
    if (!skin) return;
    const open = Math.max(0, Math.min(1, f.open));
    const beat = f.mode === 1 ? 0.78 + 0.22 * Math.sin(f.phase * Math.PI * 2) : f.mode === 2 ? 0.7 + 0.3 * Math.sin(f.phase * Math.PI * 2) : 1;
    skin.emissive.copy(COLOURS[f.mode]);
    skin.emissiveIntensity = LEVEL[f.mode] * (0.22 + 0.78 * open) * beat;
  }
  setFace({ mode: 0, open: 1, phase: 0 });

  return { group, light, key, halo, setFace, dispose() { for (const d of disposables) d.dispose(); } };
}
