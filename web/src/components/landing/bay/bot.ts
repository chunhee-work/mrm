import * as THREE from "three";
import { GO, ICE, glow } from "./room";

/**
 * The scan ball: the brand's mascot as an object in the bay. A white ball, a black visor, two lights for eyes.
 * It faces +z (so `group.lookAt(p)` turns its face to p). Its eyes are a small drawing, redrawn only when they change.
 *   mode 0  two open eyes        mode 1  one scan bar with a light running along it
 *   mode 2  three working dots   mode 3  two green ticks
 * Between two modes the eyes close to two short lines and open again as the next one.
 */

export const BOT_R = 0.17;

export type Face = { mode: 0 | 1 | 2 | 3; /** 0 = two flat lines, 1 = fully the mode's shape */ open: number; /** 0..1, where the running light or the wave is */ phase: number };

export type Bot = {
  group: THREE.Group;
  light: THREE.PointLight;
  /** soft glow round the ball, 0..1 */
  halo: THREE.SpriteMaterial;
  setFace(f: Face): void;
  dispose(): void;
};

const TW = 512;
const TH = 208;
// the visor on the ball: how far it wraps round, and from how far below the middle to how far above
const LON = 0.97;
const LAT0 = -0.307;
const LAT1 = 0.471;

const css = (c: THREE.Color) => `#${c.getHexString()}`;

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

export function buildBot(): Bot {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.12; // the mascot's head is always a little to one side
  group.add(tilt);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  const body = new THREE.Mesh(
    keep(new THREE.SphereGeometry(BOT_R, 48, 32)),
    keep(new THREE.MeshPhysicalMaterial({ color: 0xeef2f6, roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18, emissive: 0xeef2f6, emissiveIntensity: 0.16, envMapIntensity: 1.1 })),
  );
  body.castShadow = true;
  tilt.add(body);

  // a patch of a slightly larger ball, facing +z
  const patch = (r: number) => keep(new THREE.SphereGeometry(r, 40, 14, Math.PI / 2 - LON, LON * 2, Math.PI / 2 - LAT1, LAT1 - LAT0));

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = TW; maskCanvas.height = TH;
  const mg = maskCanvas.getContext("2d")!;
  mg.fillStyle = "#000"; mg.fillRect(0, 0, TW, TH);
  mg.fillStyle = "#fff"; pill(mg, 5, 5, TW - 10, TH - 10);
  const mask = keep(new THREE.CanvasTexture(maskCanvas));
  const visor = new THREE.Mesh(
    patch(BOT_R * 1.012),
    keep(new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.5, alphaMap: mask, transparent: true, depthWrite: false })),
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
    keep(new THREE.MeshBasicMaterial({ map: eyeTex, color: glow(new THREE.Color(0xffffff), 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })),
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

  const ice = css(ICE);
  const go = css(GO);
  const EX = [TW / 2 - 81, TW / 2 + 81];
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
    const flat = (a: number, colour: string) => {
      if (a <= 0.01) return;
      g.globalAlpha = a; g.fillStyle = colour;
      for (const x of EX) pill(g, x - 24, CY - 5, 48, 10);
      g.globalAlpha = 1;
    };
    if (f.mode === 0) {
      g.fillStyle = ice;
      const h = 10 + 94 * open;
      for (const x of EX) pill(g, x - 24, CY - h / 2, 48, h);
    } else if (f.mode === 1) {
      // the two lines reach for each other and become one bar
      g.fillStyle = ice;
      const x0 = EX[0] - 24 + (98 - (EX[0] - 24)) * open;
      const x1 = EX[0] + 24 + (TW / 2 + 2 - (EX[0] + 24)) * open;
      pill(g, x0, CY - 6, x1 - x0, 12);
      pill(g, TW - x1, CY - 6, x1 - x0, 12);
      if (open > 0.6) {
        const hx = 98 + f.phase * (TW - 196);
        const hgr = g.createLinearGradient(hx - 46, 0, hx + 46, 0);
        hgr.addColorStop(0, "rgba(255,255,255,0)"); hgr.addColorStop(0.5, `rgba(255,255,255,${((open - 0.6) / 0.4).toFixed(2)})`); hgr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = hgr;
        g.save(); g.beginPath(); g.rect(98, CY - 9, TW - 196, 18); g.clip();
        g.fillRect(hx - 46, CY - 9, 92, 18);
        g.restore();
      }
    } else if (f.mode === 2) {
      flat(1 - open, ice);
      g.fillStyle = ice;
      for (let i = 0; i < 3; i++) {
        const lift = Math.max(0, Math.sin((f.phase - i * 0.16) * Math.PI * 2));
        g.globalAlpha = open * (0.5 + 0.5 * lift);
        g.beginPath(); g.arc(TW / 2 + (i - 1) * 66, CY - lift * 9, 15, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    } else {
      flat(1 - open, go);
      g.globalAlpha = open; g.strokeStyle = go; g.lineWidth = 16; g.lineCap = "round"; g.lineJoin = "round";
      for (const x of EX) { g.beginPath(); g.moveTo(x - 24, CY + 2); g.lineTo(x - 7, CY + 21); g.lineTo(x + 25, CY - 22); g.stroke(); }
      g.globalAlpha = 1;
    }
    eyeTex.needsUpdate = true;
  }
  setFace({ mode: 0, open: 1, phase: 0 });

  return { group, light, halo, setFace, dispose() { for (const d of disposables) d.dispose(); } };
}
