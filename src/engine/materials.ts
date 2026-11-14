import { BackSide, Color, GreaterDepth, Matrix4, MeshBasicMaterial, ShaderMaterial, Vector3 } from 'three'
import type { Texture } from 'three'

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

/** Plaster: a warm cast-white, the colour of a studio cast under a lamp. */
export const PLASTER = '#eeeae2'
/** The studio backdrop behind the cast (matches .stage.is-studio in the CSS). */
export const STUDIO = '#8f8d88'

/** Where the light comes from, and how hard it is. */
export interface LightSetting {
  /**
   * Off = the reference look: faceted coloured blocks, see-through bones, a fixed drawing light.
   * On = a plaster cast under one lamp: smooth, solid, with the full light-to-shadow value range.
   */
  on: boolean
  /** Direction on a disc seen from the front: x = right, y = up (each -1..1). */
  x: number
  y: number
  /** Light sits behind the model (set by the Rim preset). */
  behind: boolean
  /** 0 = soft and flat, 1 = a hard lamp with deep shadows. */
  depth: number
  /** true = everything is cast-white plaster; false = keep the muscle colours. */
  plaster: boolean
  /**
   * Lock light: the lamp stays put in the room while you turn the model, so you can
   * walk round a cast and watch the shadows change. Unlocked, it rides on your view.
   */
  locked: boolean
}

export const DEFAULT_LIGHT: LightSetting = { on: false, x: -0.72, y: 0.52, behind: false, depth: 0.9, plaster: true, locked: false }

/** One set of uniforms shared by every block, so a single write relights the whole model. */
const LIGHT = {
  uLightOn: { value: 0 },
  /** Light direction in view space - the light rides on the camera. */
  uLight: { value: new Vector3(-0.72, 0.52, 0.46) },
  uDepth: { value: 0.9 },
  uPlaster: { value: 1 },
  uPlasterColor: { value: new Color(PLASTER) },
  uStudio: { value: new Color(STUDIO) },
  // cast shadows: a depth picture of the model taken from the lamp
  uShadowMap: { value: null as Texture | null },
  uShadowMatrix: { value: new Matrix4() },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: 1 / 2048 },
}

export function applyLight(l: LightSetting) {
  const flat = Math.min(1, Math.hypot(l.x, l.y))
  const z = Math.sqrt(Math.max(0, 1 - flat * flat)) * (l.behind ? -1 : 1)
  LIGHT.uLightOn.value = l.on ? 1 : 0
  LIGHT.uLight.value.set(l.x, l.y, z).normalize()
  LIGHT.uDepth.value = l.depth
  LIGHT.uPlaster.value = l.plaster ? 1 : 0
}

/** The lamp's direction in view space (the shadow pass turns it into world space). */
export const lightInView = () => LIGHT.uLight.value

/*
 * Where a locked lamp sits as seen from the current view.
 * The 3D view writes it every frame; the light ball reads it so the sun on the
 * ball always shows where the lamp is from where you are looking.
 */
export interface LampView {
  x: number
  y: number
  behind: boolean
}
let lampView: LampView = { x: DEFAULT_LIGHT.x, y: DEFAULT_LIGHT.y, behind: false }
const lampListeners = new Set<() => void>()

export const lampViewStore = {
  get: () => lampView,
  subscribe(fn: () => void) {
    lampListeners.add(fn)
    return () => lampListeners.delete(fn)
  },
  set(dir: Vector3) {
    const next = { x: dir.x, y: dir.y, behind: dir.z < 0 }
    const moved = Math.abs(next.x - lampView.x) + Math.abs(next.y - lampView.y) > 0.004
    if (!moved && next.behind === lampView.behind) return
    lampView = next
    lampListeners.forEach((fn) => fn())
  },
}

export function setShadow(map: Texture | null, lampClip: Matrix4 | null, size: number) {
  LIGHT.uShadowMap.value = map
  LIGHT.uShadowOn.value = map && lampClip ? 1 : 0
  LIGHT.uShadowTexel.value = 1 / size
  if (lampClip) LIGHT.uShadowMatrix.value.copy(lampClip)
}

const FILL_VERT = /* glsl */ `
attribute vec2 coord;
uniform mat4 uShadowMatrix;
varying vec3 vN;
varying vec2 vC;
varying vec4 vS;
void main() {
  vN = normalMatrix * normal;
  vC = coord;
  // where this point sits in the lamp's depth picture, nudged off the surface so a form never shades itself
  vS = uShadowMatrix * (modelMatrix * vec4(position + normal * 0.035, 1.0));
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
uniform vec3 uLight;
uniform float uDepth;
uniform float uPlaster;
uniform vec3 uPlasterColor;
uniform vec3 uStudio;
uniform sampler2D uShadowMap;
uniform float uShadowOn;
uniform float uShadowTexel;
varying vec3 vN;
varying vec2 vC;
varying vec4 vS;

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

// 1 = the lamp reaches this point, 0 = another form is in the way (a cast shadow)
float lampReaches() {
  if (uShadowOn < 0.5) return 1.0;
  vec3 c = vS.xyz / vS.w * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  float sum = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float nearest = texture2D(uShadowMap, c.xy + vec2(float(x), float(y)) * uShadowTexel * 1.25).r;
      sum += step(c.z - 0.0015, nearest);
    }
  }
  return sum / 9.0;
}

/*
 * The plaster study: one lamp, and the value structure every cast drawing is built on.
 *
 *   light family                     shadow family
 *   highlight  -> light -> halftone | core shadow -> reflected light
 *                                   | cast shadow (another form blocks the lamp)
 *
 * Values are worked out on a 0 (black) .. 1 (paper white) scale, the way they are
 * judged by eye, then turned into light for the screen at the end.
 */
float plasterValue(vec3 n, out float spec) {
  vec3 L = normalize(uLight);
  float ndl = dot(n, L);
  float reach = lampReaches();

  // the terminator: crisp, like a single lamp on plaster, but not a hard cut
  float lit = smoothstep(-0.05, 0.14, ndl) * reach;

  // light family: halftone where the form turns away, full light where it faces the lamp
  float vLight = mix(0.58, 0.95, smoothstep(0.08, 0.8, ndl));

  // reflected light bounces back from the room on the far side and the table below
  vec3 bounceDir = normalize(vec3(-L.x, -0.7, -L.z * 0.3));
  float bounce = clamp(dot(n, bounceDir), 0.0, 1.0);
  bounce *= bounce;

  // core shadow: the darkest band just past the terminator, before any bounce reaches it
  float intoShadow = smoothstep(0.02, 0.5, -ndl);
  float vForm = 0.15 + 0.17 * bounce * intoShadow;

  // cast shadow on a side that faces the lamp: dark, with a little bounce, no core band
  float vCast = 0.19 + 0.08 * bounce;
  float vShadow = mix(vCast, vForm, smoothstep(0.08, -0.08, ndl));

  float v = mix(vShadow, vLight, lit);

  // a matte plaster sheen - broad and soft, only where the lamp lands
  vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
  spec = pow(max(dot(n, h), 0.0), 28.0) * 0.1 * lit;

  // the depth slider runs from a soft, flat lamp (0) to a hard one (1)
  float soft = mix(0.7, 0.93, lit);
  return mix(soft, v, uDepth);
}

void main() {
  vec3 n = normalize(vN);
  vec3 col;
  vec3 ink = uInk;
  vec3 fade = uPaper;
  if (uLightOn > 0.5) {
    vec3 base = mix(uColor, uPlasterColor, uPlaster);
    float spec;
    float v = plasterValue(n, spec);
    // value (as the eye judges it) -> light on screen
    col = base * pow(v, 2.2) + spec * uDepth;
    // guide lines become pencil; faded forms sink into the studio backdrop
    ink = mix(uInk, vec3(0.06, 0.06, 0.07), uPlaster);
    fade = uStudio;
  } else {
    col = referenceShade(n);
  }

  // ink the edges between planes
  float da = min(vC.y, 1.0 - vC.y) / max(fwidth(vC.y), 1e-5);
  float edge = 1.0 - smoothstep(0.4, 1.4, da);
  // cross-contour rings at every station
  float fx = abs(fract(vC.x + 0.5) - 0.5);
  float dr = fx / max(fwidth(vC.x), 1e-5);
  float ring = 1.0 - smoothstep(0.5, 1.5, dr);
  col = mix(col, ink, max(edge * uEdge, ring * uRing * mix(1.0, 0.55, uLightOn)));

  col = mix(col, fade, uDim);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

const OUTLINE_VERT = /* glsl */ `
attribute vec3 onormal;
uniform float uThickness;
uniform float uLightOn;
void main() {
  // under the lamp the outline becomes a thin seam where two forms meet
  vec3 p = position + onormal * uThickness * mix(1.0, 0.5, uLightOn);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uFill;
uniform vec3 uPaper;
uniform float uDim;
uniform float uLightOn;
uniform float uPlaster;
uniform vec3 uPlasterColor;
uniform vec3 uStudio;
void main() {
  // the seam is the material itself in deep shadow, not a cartoon line
  vec3 seam = mix(uFill, uPlasterColor, uPlaster) * 0.05;
  vec3 col = mix(uInk, seam, uLightOn);
  gl_FragColor = vec4(mix(col, mix(uPaper, uStudio, uLightOn), uDim), 1.0);
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

export function makeOutline(ink: Color, thickness: number, fill: Color): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...LIGHT,
      uInk: { value: ink.clone() },
      uFill: { value: fill.clone() },
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
