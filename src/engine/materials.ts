import { BackSide, Color, GreaterDepth, MeshBasicMaterial, ShaderMaterial } from 'three'

export const PAPER = '#e7e6e1'
export const BONE = '#fdfdfa'
export const BONE_INK = '#343852'

/** A darker, punchier version of a fill colour - used for outlines and guide lines. */
export function inkOf(fill: string): Color {
  const c = new Color(fill)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return new Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.25 + 0.1), hsl.l * 0.58)
}

/** Paler version, for tendons. */
export function paleOf(fill: string, amount = 0.55): Color {
  return new Color(fill).lerp(new Color('#ffffff'), amount)
}

const FILL_VERT = /* glsl */ `
attribute vec2 coord;
varying vec3 vN;
varying vec2 vC;
void main() {
  vN = normalMatrix * normal;
  vC = coord;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

// Lighting is glued to the camera (top-left, like a drawing),
// so the top plane / side plane split stays readable from every angle.
const FILL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uDim;
uniform float uEdge;
uniform float uRing;
varying vec3 vN;
varying vec2 vC;
void main() {
  vec3 n = normalize(vN);
  float d = dot(n, normalize(vec3(-0.5, 0.7, 0.55)));
  float lit = smoothstep(-0.4, 0.95, d);
  vec3 shadow = uColor * vec3(0.66, 0.64, 0.76);
  vec3 light = mix(uColor, vec3(1.0), 0.3);
  vec3 col = mix(shadow, uColor, smoothstep(0.05, 0.5, lit));
  col = mix(col, light, smoothstep(0.6, 1.0, lit));

  // ink the edges between planes
  float da = min(vC.y, 1.0 - vC.y) / max(fwidth(vC.y), 1e-5);
  float edge = 1.0 - smoothstep(0.4, 1.4, da);
  // cross-contour rings at every station
  float fx = abs(fract(vC.x + 0.5) - 0.5);
  float dr = fx / max(fwidth(vC.x), 1e-5);
  float ring = 1.0 - smoothstep(0.5, 1.5, dr);
  col = mix(col, uInk, max(edge * uEdge, ring * uRing));

  col = mix(col, uPaper, uDim);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

const OUTLINE_VERT = /* glsl */ `
attribute vec3 onormal;
uniform float uThickness;
void main() {
  vec3 p = position + onormal * uThickness;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uDim;
void main() {
  gl_FragColor = vec4(mix(uInk, uPaper, uDim), 1.0);
  #include <colorspace_fragment>
}`

export function makeFill(color: Color, ink: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uColor: { value: color.clone() },
      uInk: { value: ink.clone() },
      uPaper: { value: new Color(PAPER) },
      uDim: { value: 0 },
      uEdge: { value: 0 },
      uRing: { value: 0 },
    },
    vertexShader: FILL_VERT,
    fragmentShader: FILL_FRAG,
  })
}

export function makeOutline(ink: Color, thickness: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uInk: { value: ink.clone() },
      uPaper: { value: new Color(PAPER) },
      uDim: { value: 0 },
      uThickness: { value: thickness },
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: BackSide,
  })
}

/** Faint bone that shows through whatever is in front of it. */
export function makeGhost(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: BONE,
    transparent: true,
    opacity: 0.26,
    depthFunc: GreaterDepth,
    depthWrite: false,
  })
}
