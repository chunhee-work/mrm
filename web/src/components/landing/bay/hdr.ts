import * as THREE from "three";
import type { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import type { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Brightness has a ceiling.
 *
 * The room is drawn into half floats, and its glow is a blurred copy of that picture. A lacquered panel a hand's width
 * from the ball's light gives a highlight thousands of times brighter than white. On a real graphics card one such
 * pixel goes past what a half float can hold; the blur then smears "not a number" over a whole rectangle of the frame,
 * and the rectangle comes out black (white on the account pages, which show the picture as its negative). It lasts a
 * frame and comes back wherever the highlight lands next: the picture flashes.
 *
 * So there are two guards. No surface gives off more than LIT_MAX, which is far above anything the room means to be
 * bright (its lamps are about 5). And neither the glow nor the last pass ever reads a number that is not one, whatever
 * drew it.
 */
export const LIT_MAX = 16;
export const HDR_MAX = 32;

const top = (v: number) => v.toFixed(1);

/** Every material of the library ends in this chunk: there the light a surface gives off is capped. Done once. */
const MARK = "// bay: capped";
export function capSurfaces() {
  const chunk = THREE.ShaderChunk as Record<string, string>;
  if (chunk.opaque_fragment.includes(MARK)) return;
  // the choice between the two is made by a boolean, not by arithmetic: anything times "not a number" is still not one
  chunk.opaque_fragment = `${MARK}
outgoingLight = mix( clamp( outgoingLight, vec3( 0.0 ), vec3( ${top(LIT_MAX)} ) ), vec3( 0.0 ), greaterThan( floatBitsToUint( outgoingLight ) & uvec3( 0x7fffffffu ), uvec3( 0x7f800000u ) ) );
${chunk.opaque_fragment}`;
}

/** GLSL ES 3.00, for the room's own shaders: what one of them writes, capped the same way (colour and cover alike). */
export const CAPPED = `
vec4 capped( vec4 c ) { return mix( clamp( c, vec4( 0.0 ), vec4( ${top(LIT_MAX)} ) ), vec4( 0.0 ), greaterThan( floatBitsToUint( c ) & uvec4( 0x7fffffffu ), uvec4( 0x7f800000u ) ) ); }
`;

/**
 * GLSL: a colour read back from the picture, made safe. A number a little over the ceiling is brought down to it; one
 * far past it is no light at all but a broken pixel, and a dark speck shows less than a bright one with a glow round it.
 * Two wordings of the same thing. The last pass is written in GLSL ES 1.00, which has only comparisons (and "not a
 * number" fails every one of them). The glow and the mirror are GLSL ES 3.00 and look at the bits first, which no
 * compiler can reason away.
 */
const RANGE = `( v > 0.0 ? ( v < ${top(HDR_MAX)} ? v : ( v < ${top(HDR_MAX * 16)} ? ${top(HDR_MAX)} : 0.0 ) ) : 0.0 )`;
export const SANE_ES1 = `
float sane1( float v ) { return ${RANGE}; }
vec3 sane( vec3 c ) { return vec3( sane1( c.r ), sane1( c.g ), sane1( c.b ) ); }
`;
export const SANE = `
float sane1( float v ) { return ( floatBitsToUint( v ) & 0x7f800000u ) == 0x7f800000u ? 0.0 : ${RANGE}; }
vec3 sane( vec3 c ) { return vec3( sane1( c.r ), sane1( c.g ), sane1( c.b ) ); }
`;

/** The line each pass reads the picture with. If the library ever words it differently the guard is skipped, not broken. */
export const BLOOM_READ = "vec4 texel = texture2D( tDiffuse, vUv );";
export const MIRROR_READ = "vec4 base = texture2DProj( tDiffuse, vUv );";
export const OUTPUT_READ = "gl_FragColor = texture2D( tDiffuse, vUv );";

function guard(material: THREE.ShaderMaterial, read: string, safe: string) {
  const src = material.fragmentShader;
  if (!src.includes(read) || src.includes("sane1")) return false;
  const main = src.indexOf("void main()");
  if (main < 0) return false;
  const raw = (material as THREE.RawShaderMaterial).isRawShaderMaterial === true; // compiled as written: GLSL ES 1.00
  material.fragmentShader = src.slice(0, main) + (raw ? SANE_ES1 : SANE) + src.slice(main).replace(read, read + "\n" + safe);
  material.needsUpdate = true;
  return true;
}

/** The glow is made only from numbers: a broken pixel stays one pixel, it is not blurred over the frame. */
export function guardBloom(bloom: UnrealBloomPass) {
  return guard(bloom.materialHighPassFilter, BLOOM_READ, "texel.rgb = sane( texel.rgb );");
}

/** The floor mirror shows the room a second time: what it reads back is made safe as well. */
export function guardMirror(mirror: { material: THREE.Material | THREE.Material[] }) {
  return guard(mirror.material as THREE.ShaderMaterial, MIRROR_READ, "base.rgb = sane( base.rgb );");
}

/** The picture that goes to the screen is made only from numbers too. */
export function guardOutput(out: OutputPass) {
  return guard(out.material, OUTPUT_READ, "gl_FragColor.rgb = sane( gl_FragColor.rgb );");
}
