import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { BLOOM_READ, LIT_MAX, MIRROR_READ, OUTPUT_READ, capSurfaces, guardBloom, guardMirror, guardOutput } from "./hdr";
import { soundNormals } from "./car";

// The guards are written into the library's own shaders. If an upgrade of the library words those shaders differently,
// the guards are skipped without a sound and the black flashes can come back: these tests are what would say so.

test("the glow reads the picture through the guard, and takes it once", () => {
  const bloom = new UnrealBloomPass(new THREE.Vector2(64, 64), 0.5, 0.6, 1);
  assert.ok(bloom.materialHighPassFilter.fragmentShader.includes(BLOOM_READ), "the library still reads the picture with the line the guard looks for");
  assert.equal(guardBloom(bloom), true);
  const src = bloom.materialHighPassFilter.fragmentShader;
  assert.ok(src.includes("texel.rgb = sane( texel.rgb );"));
  assert.ok(src.indexOf("float sane1") < src.indexOf("void main()"), "the helper is declared before main");
  assert.ok(src.includes("floatBitsToUint"), "this shader is GLSL ES 3.00: it looks at the bits");
  assert.equal(guardBloom(bloom), false);
  assert.equal(bloom.materialHighPassFilter.fragmentShader, src, "asked twice, nothing is added twice");
  bloom.dispose();
});

test("the last pass reads the picture through the guard, in the older shader language it is written in", () => {
  const out = new OutputPass();
  assert.ok(out.material.fragmentShader.includes(OUTPUT_READ));
  assert.equal(guardOutput(out), true);
  const src = out.material.fragmentShader;
  assert.ok(src.includes("gl_FragColor.rgb = sane( gl_FragColor.rgb );"));
  assert.ok(src.indexOf("gl_FragColor.rgb = sane(") < src.indexOf("ToneMapping( gl_FragColor.rgb )"), "made safe before it is tone mapped");
  assert.ok(!src.includes("floatBitsToUint"), "GLSL ES 1.00 has no such function: here it is comparisons only");
  out.dispose();
});

test("the floor mirror reads its picture through the guard", () => {
  const mirror = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: 8, textureHeight: 8 });
  assert.ok((mirror.material as THREE.ShaderMaterial).fragmentShader.includes(MIRROR_READ));
  assert.equal(guardMirror(mirror), true);
  assert.ok((mirror.material as THREE.ShaderMaterial).fragmentShader.includes("base.rgb = sane( base.rgb );"));
  mirror.dispose();
});

test("every surface of the library is capped, once, in the chunk they all end with", () => {
  const chunk = THREE.ShaderChunk as Record<string, string>;
  const before = chunk.opaque_fragment;
  assert.ok(before.includes("gl_FragColor = vec4( outgoingLight, diffuseColor.a );"), "the chunk still ends the way the cap expects");
  capSurfaces();
  const after = chunk.opaque_fragment;
  assert.ok(after.endsWith(before), "the library's own lines are all still there, after the cap");
  assert.ok(after.includes(`vec3( ${LIT_MAX.toFixed(1)} )`));
  assert.ok(after.indexOf("outgoingLight = mix(") < after.indexOf("gl_FragColor = vec4( outgoingLight"));
  capSurfaces();
  assert.equal(chunk.opaque_fragment, after, "asked twice, capped once");
  for (const lib of ["standard", "physical", "basic", "points", "sprite"] as const) {
    assert.ok(THREE.ShaderLib[lib].fragmentShader.includes("#include <opaque_fragment>"), `${lib} ends with the chunk`);
  }
});

test("a point of a mesh with no direction is given the direction of a face it belongs to", () => {
  const g = new THREE.BufferGeometry();
  // two faces in the plane z = 0, and a fifth point that only a sliver of a face (no area) uses
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 5, 5, 5]), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 0, NaN, 0, 1, 0, 0, 1, 0, 0, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 4, 4]);
  assert.equal(soundNormals(g), 3);
  const n = g.getAttribute("normal");
  for (let i = 0; i < 4; i++) assert.deepEqual([n.getX(i), n.getY(i), n.getZ(i)], [0, 0, 1], `point ${i}`);
  assert.deepEqual([n.getX(4), n.getY(4), n.getZ(4)], [0, 1, 0], "no face to ask: it faces up");
  assert.equal(soundNormals(g), 0, "nothing left to mend");
});

test("a sound mesh is left exactly as it was", () => {
  const g = new THREE.SphereGeometry(1, 8, 6);
  const was = Array.from(g.getAttribute("normal").array);
  assert.equal(soundNormals(g), 0);
  assert.deepEqual(Array.from(g.getAttribute("normal").array), was);
});
