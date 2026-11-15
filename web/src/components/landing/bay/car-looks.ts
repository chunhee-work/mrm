import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { DAMAGED, OUT, darkBacks, type Car, type Part } from "./car";

/**
 * A car that comes as modelled parts instead of one scanned skin: every part of the file is a node named as the scanned
 * car names its parts (bonnet, doorFL, lampL ...), and each piece of a part carries the name of its finish ("paint",
 * "glass", "chrome" ...) instead of a texture. This module gives each finish its material and hands back the same `Car`
 * the rest of the scene already works with: one mesh per part, its origin at the part's middle.
 */

// the scanned car's paint (its base colour, lifted as car.ts lifts it), so the two cars are the same colour
const PAINT = new THREE.Color().setRGB(0.134, 0.129, 0.144);
const LAMP_WHITE = new THREE.Color(0xdff4ff);
const TAIL_RED = new THREE.Color(0xff1a12);

type Lit = { material: THREE.MeshStandardMaterial; rest: number };

function finishes() {
  const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const paint = phys({ color: PAINT, metalness: 0.55, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.07 });
  const glass = phys({ color: 0x070b10, metalness: 0, roughness: 0.1, clearcoat: 0.4, clearcoatRoughness: 0.05, specularIntensity: 0.6 });
  const gloss = phys({ color: 0x08090b, metalness: 0, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.1 }); // piano-black trim
  const satin = std({ color: 0x0b0d10, metalness: 0, roughness: 0.62 }); // unpainted plastic: sills, splitter, diffuser
  const chrome = std({ color: 0xc9d2da, metalness: 1, roughness: 0.16 });
  const darkChrome = std({ color: 0x3a4048, metalness: 1, roughness: 0.22 });
  const alloy = phys({ color: 0x5d646d, metalness: 1, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  const disc = std({ color: 0x5b6067, metalness: 1, roughness: 0.42 });
  const tyre = std({ color: 0x0a0a0b, metalness: 0, roughness: 0.86 });
  const mesh = std({ color: 0x050607, metalness: 0.2, roughness: 0.5 });
  // the lamps: lit elements behind smoked covers
  const drl = std({ color: 0x111316, emissive: LAMP_WHITE, emissiveIntensity: 4 });
  const grilleLed = std({ color: 0x111316, metalness: 0.6, roughness: 0.3, emissive: LAMP_WHITE, emissiveIntensity: 0.9 });
  const headGlow = std({ color: 0x20242a, metalness: 0.5, roughness: 0.3, emissive: LAMP_WHITE, emissiveIntensity: 1.6 });
  const tailGlow = std({ color: 0x1a0203, roughness: 0.3, emissive: TAIL_RED, emissiveIntensity: 2.6 });
  const headCover = phys({ color: 0x0c1016, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false });
  const tailCover = phys({ color: 0x3a0306, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.45, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, emissive: TAIL_RED, emissiveIntensity: 0.5 });
  const clearLens = phys({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false });
  // when the car is apart you see the backs of panels: they should not shine like paint
  for (const m of [paint, glass, gloss, satin, alloy, darkChrome, chrome, mesh]) darkBacks(m);
  const all: Record<string, THREE.MeshStandardMaterial> = { paint, handle: paint, glass, gloss, satin, chrome, darkChrome, alloy, disc, tyre, mesh, drl, grilleLed, headGlow, tailGlow, headCover, tailCover, clearLens };
  const lit: Lit[] = [drl, grilleLed, headGlow, tailGlow, tailCover].map((material) => ({ material, rest: material.emissiveIntensity }));
  return { all, lit, paint };
}

// the two parts a saloon has that the hatchback had not
const EXTRA: typeof OUT = [["rearGlass", [-0.5, 0.7, 0], [0, 0, 0.08]]];

/** True for a file made of named finishes (see above) rather than the scanned, textured car. */
export function hasLooks(gltf: GLTF): boolean {
  let found = false;
  gltf.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && !Array.isArray(m) && m.name === "paint") found = true;
  });
  return found;
}

export function buildLooksCar(gltf: GLTF, overlayMaterial: THREE.ShaderMaterial, amberOverlay: THREE.ShaderMaterial): Car {
  const group = new THREE.Group();
  const parts: Part[] = [];
  const { all, lit, paint } = finishes();
  const geometries: THREE.BufferGeometry[] = [];
  gltf.scene.updateMatrixWorld(true);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), box = new THREE.Box3(), mid = new THREE.Vector3();
  let k = 0;
  for (const node of [...gltf.scene.children]) {
    const name = node.name;
    const pieces: THREE.Mesh[] = [];
    node.traverse((o) => { if ((o as THREE.Mesh).isMesh) pieces.push(o as THREE.Mesh); });
    if (!pieces.length) continue;
    // one mesh per part: its pieces joined, each keeping its own finish, in the car's space and centred on the part
    let count = 0, tris = 0;
    for (const p of pieces) { count += p.geometry.getAttribute("position").count; tris += p.geometry.getIndex()!.count; }
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), index = new Uint32Array(tris);
    const geo = new THREE.BufferGeometry();
    const materials: THREE.Material[] = [];
    let vo = 0, io = 0;
    box.makeEmpty();
    for (const p of pieces) {
      const gp = p.geometry.getAttribute("position"), gn = p.geometry.getAttribute("normal"), gi = p.geometry.getIndex()!;
      nm.getNormalMatrix(p.matrixWorld);
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(p.matrixWorld); box.expandByPoint(v);
        pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(gn, i).applyMatrix3(nm);
        // a normal of no length turns into a black (or blown-out) pixel under the lights: give it one that points up
        if (v.lengthSq() < 1e-12) v.set(0, 1, 0); else v.normalize();
        nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      }
      for (let i = 0; i < gi.count; i++) index[io + i] = gi.getX(i) + vo;
      geo.addGroup(io, gi.count, materials.length);
      materials.push(all[(p.material as THREE.Material).name] ?? all.satin);
      vo += gp.count; io += gi.count;
      p.geometry.dispose();
    }
    box.getCenter(mid);
    for (let i = 0; i < count; i++) { pos[i * 3] -= mid.x; pos[i * 3 + 1] -= mid.y; pos[i * 3 + 2] -= mid.z; }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, materials);
    mesh.name = name;
    mesh.position.copy(mid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const rule = OUT.find(([prefix]) => name.startsWith(prefix)) ?? EXTRA.find(([prefix]) => name === prefix);
    const right = /R$/.test(name) && name !== "bumperR";
    const side = right ? 1 : /L$/.test(name) ? -1 : 0;
    const o = rule ? rule[1] : [0, 0, 0];
    const tl = rule?.[2] ?? [0, 0, 0];
    const damaged = (DAMAGED as readonly string[]).includes(name);
    // the survey grid is drawn over the whole part, whatever its finishes
    const overlay = new THREE.Mesh(geo, damaged ? amberOverlay : overlayMaterial);
    overlay.renderOrder = 4;
    overlay.visible = false;
    mesh.add(overlay);
    parts.push({
      name, mesh, overlay, damaged,
      home: mesh.position.clone(),
      out: new THREE.Vector3(o[0], o[1], o[2] * side),
      tilt: new THREE.Euler(tl[0], tl[1], tl[2]),
      phase: (k++ * 2.399) % (Math.PI * 2),
    });
  }
  const damaged = DAMAGED.map((n) => parts.find((p) => p.name === n)).filter((p): p is Part => !!p);
  const lamps = ["lampL", "lampR"].map((n) => parts.find((p) => p.name === n)).filter((p): p is Part => !!p);
  return {
    group, parts, damaged, frame: null, material: paint, lampMaterial: null, lamps,
    lit(amount) { for (const l of lit) l.material.emissiveIntensity = l.rest * (1 + amount * 1.6); },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of new Set(Object.values(all))) m.dispose();
    },
  };
}
