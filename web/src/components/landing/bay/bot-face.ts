import * as THREE from "three";
import { ICE, glow } from "./room";
import { BOT_R, type Bot, type Face } from "./bot";

/**
 * The scan ball with a face (the other look of the ball; `bot.ts` is the lens ball): the brand's mascot as an object in the bay. A pearl-white ball, a black glass visor in a thin
 * metal rim, two white lights for eyes. It is lit by the room, like the car, so the two belong to one picture.
 * It faces +z (so `group.lookAt(p)` turns its face to p). Its face is a small drawing, redrawn only when it changes.
 *   mode 0  two open eyes        mode 1  one scan bar with a light running along it
 *   mode 2  three working dots   mode 3  done: one eye stays, the other becomes a white tick
 * Between two modes the eyes close to two short lines and open again as the next one.
 */

// the patch of the ball the face is drawn on: how far it wraps round, and from how far below the middle to how far above
const LON = 0.97;
const LAT0 = -0.618;
const LAT1 = 0.782;
const TW = 512;
const PX = TW / (LON * 2); // pixels to a radian, the same both ways
const TH = Math.round((LAT1 - LAT0) * PX);
// the visor in that drawing: a pill, 1.36 ball radii wide seen from the front
const PILL_W = 396;
const PILL_H = 222;
const RIM = 9;
const EYE = "#ffffff";
const EYE_W = 52;
const EYE_H = 112;
const EYE_X = 82;

function pill(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(w, h) / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

export function buildFaceBot(): Bot {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.12; // the mascot's head is always a little to one side
  group.add(tilt);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // pearl shell: it takes its light and its reflections from the room, the same as the car's paint
  const body = new THREE.Mesh(
    keep(new THREE.SphereGeometry(BOT_R, 64, 48)),
    keep(new THREE.MeshPhysicalMaterial({ color: 0xd3dae2, roughness: 0.34, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.12, emissive: 0xbfd3e6, emissiveIntensity: 0.035, envMapIntensity: 1.25, sheen: 0.4, sheenRoughness: 0.5, sheenColor: 0xbfe9ff })),
  );
  body.castShadow = true;
  tilt.add(body);

  // a patch of a slightly larger ball, facing +z
  const patch = (r: number) => keep(new THREE.SphereGeometry(r, 48, 28, Math.PI / 2 - LON, LON * 2, Math.PI / 2 - LAT1, LAT1 - LAT0));
  const mask = (grow: number) => {
    const c = document.createElement("canvas");
    c.width = TW; c.height = TH;
    const m = c.getContext("2d")!;
    m.fillStyle = "#000"; m.fillRect(0, 0, TW, TH);
    m.fillStyle = "#fff"; pill(m, (TW - PILL_W) / 2 - grow, (TH - PILL_H) / 2 - grow, PILL_W + grow * 2, PILL_H + grow * 2);
    return keep(new THREE.CanvasTexture(c));
  };
  // the rim the glass sits in: a hair of dark metal that catches the tubes
  const rim = new THREE.Mesh(
    patch(BOT_R * 1.006),
    keep(new THREE.MeshStandardMaterial({ color: 0x6f7a86, roughness: 0.3, metalness: 1, envMapIntensity: 1.6, alphaMap: mask(RIM), transparent: true, depthWrite: false })),
  );
  rim.renderOrder = 4;
  tilt.add(rim);
  const visor = new THREE.Mesh(
    patch(BOT_R * 1.012),
    keep(new THREE.MeshPhysicalMaterial({ color: 0x020304, roughness: 0.22, metalness: 0, specularIntensity: 0.3, clearcoat: 0.14, clearcoatRoughness: 0.05, alphaMap: mask(0), transparent: true, depthWrite: false })),
  );
  visor.renderOrder = 5;
  tilt.add(visor);

  const eyeCanvas = document.createElement("canvas");
  eyeCanvas.width = TW; eyeCanvas.height = TH;
  const g = eyeCanvas.getContext("2d")!;
  const eyeTex = keep(new THREE.CanvasTexture(eyeCanvas));
  eyeTex.colorSpace = THREE.SRGBColorSpace;
  const eyes = new THREE.Mesh(
    patch(BOT_R * 1.02),
    keep(new THREE.MeshBasicMaterial({ map: eyeTex, color: glow(new THREE.Color(0xffffff), 1.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
  );
  eyes.renderOrder = 6;
  tilt.add(eyes);

  const light = new THREE.PointLight(ICE, 1, 5.5, 1.6);
  group.add(light);

  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 128;
  const hg = haloCanvas.getContext("2d")!;
  const grd = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.9)"); grd.addColorStop(0.3, "rgba(255,255,255,0.28)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  hg.fillStyle = grd; hg.fillRect(0, 0, 128, 128);
  const halo = keep(new THREE.SpriteMaterial({ map: keep(new THREE.CanvasTexture(haloCanvas)), color: glow(ICE, 1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const haloSprite = new THREE.Sprite(halo);
  haloSprite.scale.setScalar(BOT_R * 7);
  haloSprite.renderOrder = 4;
  group.add(haloSprite);

  const EX = [TW / 2 - EYE_X, TW / 2 + EYE_X];
  const CX = TW / 2;
  const CY = TH / 2;
  let drawn = "";

  function setFace(f: Face) {
    const open = Math.max(0, Math.min(1, f.open));
    const key = `${f.mode}|${open.toFixed(2)}|${f.mode === 0 || f.mode === 3 ? 0 : f.phase.toFixed(2)}`;
    if (key === drawn) return;
    drawn = key;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = "#000";
    g.fillRect(0, 0, TW, TH);
    const flat = (a: number, x: number) => {
      if (a <= 0.01) return;
      g.globalAlpha = a; g.fillStyle = EYE;
      pill(g, x - EYE_W / 2, CY - 5, EYE_W, 10);
      g.globalAlpha = 1;
    };
    const eye = (x: number) => { g.fillStyle = EYE; const h = 10 + (EYE_H - 10) * open; pill(g, x - EYE_W / 2, CY - h / 2, EYE_W, h); };
    if (f.mode === 0) {
      for (const x of EX) eye(x);
    } else if (f.mode === 1) {
      // the two lines reach for each other and become one bar
      g.fillStyle = EYE;
      const L = CX - PILL_W / 2 + 52; // where the bar ends, inside the visor
      const x0 = EX[0] - EYE_W / 2 + (L - (EX[0] - EYE_W / 2)) * open;
      const x1 = EX[0] + EYE_W / 2 + (CX + 2 - (EX[0] + EYE_W / 2)) * open;
      pill(g, x0, CY - 6, x1 - x0, 12);
      pill(g, TW - x1, CY - 6, x1 - x0, 12);
      if (open > 0.6) {
        const hx = L + f.phase * (TW - L * 2);
        const hgr = g.createLinearGradient(hx - 46, 0, hx + 46, 0);
        hgr.addColorStop(0, "rgba(255,255,255,0)"); hgr.addColorStop(0.5, `rgba(255,255,255,${((open - 0.6) / 0.4).toFixed(2)})`); hgr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = hgr;
        g.save(); g.beginPath(); g.rect(L, CY - 9, TW - L * 2, 18); g.clip();
        g.fillRect(hx - 46, CY - 9, 92, 18);
        g.restore();
      }
    } else if (f.mode === 2) {
      for (const x of EX) flat(1 - open, x);
      g.fillStyle = EYE;
      for (let i = 0; i < 3; i++) {
        const lift = Math.max(0, Math.sin((f.phase - i * 0.16) * Math.PI * 2));
        g.globalAlpha = open * (0.5 + 0.5 * lift);
        g.beginPath(); g.arc(CX + (i - 1) * 60, CY - lift * 9, 15, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    } else {
      // done: one eye opens as it always does; the other is drawn as a tick, short stroke first
      eye(EX[0]);
      flat(1 - open * 2.5, EX[1]);
      const u = 94;
      const x = EX[1] + 4;
      const a: [number, number] = [x - 0.5 * u, CY - 0.02 * u];
      const b: [number, number] = [x - 0.14 * u, CY + 0.36 * u];
      const d: [number, number] = [x + 0.52 * u, CY - 0.4 * u];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const l2 = Math.hypot(d[0] - b[0], d[1] - b[1]);
      const len = Math.max(0, (open - 0.25) / 0.75) * (l1 + l2);
      if (len > 0.5) {
        g.strokeStyle = EYE; g.lineWidth = 27; g.lineCap = "round"; g.lineJoin = "round";
        g.beginPath(); g.moveTo(a[0], a[1]);
        const k1 = Math.min(1, len / l1);
        g.lineTo(a[0] + (b[0] - a[0]) * k1, a[1] + (b[1] - a[1]) * k1);
        if (len > l1) { const k2 = (len - l1) / l2; g.lineTo(b[0] + (d[0] - b[0]) * k2, b[1] + (d[1] - b[1]) * k2); }
        g.stroke();
      }
    }
    eyeTex.needsUpdate = true;
  }
  setFace({ mode: 0, open: 1, phase: 0 });

  // the white ball is lit by the room; it needs no lamp of its own, so this one stays dark
  const key = new THREE.PointLight(0xffffff, 0, 1, 2);
  return { group, light, key, halo, setFace, dispose() { for (const d of disposables) d.dispose(); } };
}
