import { Matrix4, Vector3 } from 'three'
import type { FrameGetter, PathPoint, Vec3 } from './types'

export const DEG = Math.PI / 180

/**
 * Builds a cached frame lookup.
 * `fa@0.3` asks the resolver for frame `fa` with fraction k = 0.3 -
 * rigs use that for "30% of the twist" or "half of the bend".
 */
export function makeFrames(
  resolve: (name: string, k: number, get: FrameGetter) => Matrix4,
): FrameGetter {
  const cache = new Map<string, Matrix4>()
  const get: FrameGetter = (full) => {
    let m = cache.get(full)
    if (!m) {
      const at = full.indexOf('@')
      const name = at < 0 ? full : full.slice(0, at)
      const k = at < 0 ? 0 : Number(full.slice(at + 1))
      m = resolve(name, k, get)
      cache.set(full, m)
    }
    return m
  }
  return get
}

export const translate = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z)
export const rotX = (a: number) => new Matrix4().makeRotationX(a)
export const rotY = (a: number) => new Matrix4().makeRotationY(a)
export const rotZ = (a: number) => new Matrix4().makeRotationZ(a)

/** Rotation by `angle` around a line through `point` along `axis` (unit vector). */
export function rotAbout(point: Vector3, axis: Vector3, angle: number): Matrix4 {
  return translate(point.x, point.y, point.z)
    .multiply(new Matrix4().makeRotationAxis(axis, angle))
    .multiply(translate(-point.x, -point.y, -point.z))
}

/** Chain matrices left to right: mul(a, b, c) = a * b * c. */
export function mul(...ms: Matrix4[]): Matrix4 {
  const out = new Matrix4()
  for (const m of ms) out.multiply(m)
  return out
}

type Extra = Omit<PathPoint, 'f' | 'p' | 'w' | 'h'>

/** Short-hand for a station: frame, x, y, z, half-width, thickness. */
export function P(
  f: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  extra: Extra = {},
): PathPoint {
  return { f, p: [x, y, z], w, h, ...extra }
}

/** Mirror a station to the other side of the body (x -> -x). */
export function mirrorPoint(pt: PathPoint, mapFrame: (f: string) => string): PathPoint {
  const flip = (v: Vec3): Vec3 => [-v[0], v[1], v[2]]
  return {
    ...pt,
    f: mapFrame(pt.f),
    p: flip(pt.p),
    n: pt.n ? flip(pt.n) : undefined,
    alt: pt.alt ? { ...pt.alt, p: pt.alt.p ? flip(pt.alt.p) : undefined } : undefined,
  }
}
