import { BackSide, Color, GreaterDepth, MeshBasicMaterial, ShaderMaterial, Vector3 } from 'three'

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

/** Where the light comes from, and how hard it is. */
export interface LightSetting {
  /**
   * Off = the reference look: faceted blocks, see-through bones, a fixed drawing light.
   * On = a smooth, solid model lit from wherever you put the light.
   */
  on: boolean
  /** Direction on a disc seen from the front: x = right, y = up (each -1..1). */
  x: number
  y: number
  /** Light sits behind the model (set by the Rim preset). */
  behind: boolean
  /** 0 = flat colour, 1 = deep shadows. */
  depth: number
}

export const DEFAULT_LIGHT: LightSetting = { on: false, x: -0.49, y: 0.69, behind: false, depth: 0.7 }

/** One set of uniforms shared by every block, so a single write relights the whole model. */
const LIGHT = {
  uLightOn: { value: 0 },
  uLight: { value: new Vector3(-0.49, 0.69, 0.54) },
  uDepth: { value: DEFAULT_LIGHT.depth },
}

export function applyLight(l: LightSetting) {
  const flat = Math.min(1, Math.hypot(l.x, l.y))
  const z = Math.sqrt(Math.max(0, 1 - flat * flat)) * (l.behind ? -1 : 1)
  LIGHT.uLightOn.value = l.on ? 1 : 0
  LIGHT.uLight.value.set(l.x, l.y, z).normalize()
  LIGHT.uDepth.value = l.depth
}

const FILL_VERT = /* glsl */ `
attribute vec2 coord;
uniform vec3 uLight;
varying vec3 vN;
varying vec2 vC;
varying vec3 vL;
void main() {
  vN = normalMatrix * normal;
  vC = coord;
  // the light rides on the camera, so the ball in the panel always matches the screen
  vL = uLight;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FILL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uDim;
uniform float uEdge;
uniform float uRing;
uniform float uLightOn;
uniform float uDepth;
varying vec3 vN;
varying vec2 vC;
varying vec3 vL;

// The reference look: a light glued to the camera (top-left, like a drawing),
// soft enough that every plane keeps its colour and the top / side split still reads.
vec3 referenceShade(vec3 n) {
  float d = dot(n, normalize(vec3(-0.5, 0.7, 0.55)));
  float lit = smoothstep(-0.4, 0.95, d);
  vec3 shadow = uColor * vec3(0.66, 0.64, 0.76);
  vec3 light = mix(uColor, vec3(1.0), 0.3);
  vec3 col = mix(shadow, uColor, smoothstep(0.05, 0.5, lit));
  return mix(col, light, smoothstep(0.6, 1.0, lit));
}

// The light mode: a proper turning-away-from-the-light gradient on the smooth model,
// a cool shadow side with a little bounce, and a soft highlight.
vec3 lightShade(vec3 n) {
  float d = dot(n, normalize(vL));
  float direct = smoothstep(-0.2, 0.55, d);
  float bounce = 0.14 * smoothstep(0.1, -0.9, d);
  vec3 shadow = uColor * mix(vec3(1.0), vec3(0.26, 0.25, 0.44) + bounce, uDepth);
  vec3 col = mix(shadow, uColor, direct);
  vec3 highlight = mix(uColor, vec3(1.0), 0.5 * uDepth);
  return mix(col, highlight, smoothstep(0.75, 1.0, d));
}

void main() {
  vec3 n = normalize(vN);
  vec3 col = uLightOn > 0.5 ? lightShade(n) : referenceShade(n);

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
      ...LIGHT,
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
