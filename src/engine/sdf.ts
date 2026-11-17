import type { SolidMesh, Vec3 } from './types'

/*
 * Sculpting with distance fields.
 *
 * A form is described as a function that says, for any point, how far it is from the
 * surface: negative inside, positive outside. Simple forms (a ball, a bar, a plate)
 * are easy to write that way, and they can be fused with a soft fillet where they
 * meet - the way bone grows into bone - which a swept block or a skin cannot do.
 *
 * `meshField` turns the finished field into a dense triangle mesh once, at load.
 * It is meant for forms that never change shape (bones), not for muscles.
 */

/** Distance to the surface: negative inside, positive outside. */
export type Field = (x: number, y: number, z: number) => number

/** A field together with a box that holds the whole of its inside, so far-away parts can be skipped. */
export interface Shape {
  f: Field
  lo: Vec3
  hi: Vec3
}

/* ───────────────────────── blending ───────────────────────── */

// Math.hypot is slow in V8, and fields are evaluated a million times per mesh
const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
const len2 = (x: number, y: number) => Math.sqrt(x * x + y * y)

/** Union with a fillet of size k. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/** Intersection (or, with -b, subtraction) with a fillet of size k. */
export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k)
}

/**
 * True when the point is at least `d` away from the shape's box - so nothing in the
 * shape can come closer than that, and it can be skipped. (Squared, to spare a root.)
 */
function beyond(s: Shape, x: number, y: number, z: number, d: number): boolean {
  if (d <= 0) return false
  const dx = Math.max(s.lo[0] - x, 0, x - s.hi[0])
  const dy = Math.max(s.lo[1] - y, 0, y - s.hi[1])
  const dz = Math.max(s.lo[2] - z, 0, z - s.hi[2])
  return dx * dx + dy * dy + dz * dz >= d * d
}

function bounds(shapes: Shape[]): [Vec3, Vec3] {
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const s of shapes) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], s.lo[a])
      hi[a] = Math.max(hi[a], s.hi[a])
    }
  }
  return [lo, hi]
}

/** Fuse shapes with fillets of size k. Shapes too far away to matter are not evaluated. */
export function fuse(k: number, shapes: Shape[]): Shape {
  const [lo, hi] = bounds(shapes)
  return {
    lo,
    hi,
    f: (x, y, z) => {
      let d = 1e9
      for (const s of shapes) {
        // smin(d, b) is just d once b is k or more above it
        if (beyond(s, x, y, z, d + k)) continue
        d = smin(d, s.f(x, y, z), k)
      }
      return d
    },
  }
}

/** Carve `holes` out of `base`, with fillets of size k round the cut. */
export function carve(base: Shape, k: number, holes: Shape[]): Shape {
  return {
    lo: base.lo,
    hi: base.hi,
    f: (x, y, z) => {
      let d = base.f(x, y, z)
      for (const s of holes) {
        // a hole only changes d where it reaches within k of the surface
        if (beyond(s, x, y, z, k - d)) continue
        d = smax(d, -s.f(x, y, z), k)
      }
      return d
    },
  }
}

/** Keep only the part of `base` inside `mask` (fillet k). The mask's own box is not used. */
export function clip(base: Shape, k: number, mask: Field): Shape {
  return { lo: base.lo, hi: base.hi, f: (x, y, z) => smax(base.f(x, y, z), mask(x, y, z), k) }
}

/** Mirror a shape across x = 0, keeping both halves. */
export function mirrored(s: Shape): Shape {
  const r = Math.max(Math.abs(s.lo[0]), Math.abs(s.hi[0]))
  const lo: Vec3 = [-r, s.lo[1], s.lo[2]]
  const hi: Vec3 = [r, s.hi[1], s.hi[2]]
  return { lo, hi, f: (x, y, z) => s.f(Math.abs(x), y, z) }
}

/** Scale a shape by k about c (e.g. flatten a teardrop into a kneecap). */
export function squash(s: Shape, c: Vec3, k: Vec3): Shape {
  const m = Math.min(k[0], k[1], k[2])
  const lo: Vec3 = [c[0] + (s.lo[0] - c[0]) * k[0], c[1] + (s.lo[1] - c[1]) * k[1], c[2] + (s.lo[2] - c[2]) * k[2]]
  const hi: Vec3 = [c[0] + (s.hi[0] - c[0]) * k[0], c[1] + (s.hi[1] - c[1]) * k[1], c[2] + (s.hi[2] - c[2]) * k[2]]
  return {
    lo,
    hi,
    f: (x, y, z) => s.f(c[0] + (x - c[0]) / k[0], c[1] + (y - c[1]) / k[1], c[2] + (z - c[2]) / k[2]) * m,
  }
}

/* ───────────────────────── primitives ───────────────────────── */

const grow = (lo: Vec3, hi: Vec3, r: number): [Vec3, Vec3] => [
  [lo[0] - r, lo[1] - r, lo[2] - r],
  [hi[0] + r, hi[1] + r, hi[2] + r],
]

/** A ball. */
export function ball(c: Vec3, r: number): Shape {
  const [lo, hi] = grow(c, c, r)
  return {
    lo,
    hi,
    f: (x, y, z) => len3(x - c[0], y - c[1], z - c[2]) - r,
  }
}

/**
 * A bar from a to b whose radius goes from ra to rb, with round ends
 * (a "round cone"; exact distance, after Inigo Quilez).
 */
export function bar(a: Vec3, b: Vec3, ra: number, rb: number): Shape {
  const bax = b[0] - a[0]
  const bay = b[1] - a[1]
  const baz = b[2] - a[2]
  const l2 = bax * bax + bay * bay + baz * baz
  const rr = ra - rb
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  const r = Math.max(ra, rb)
  const lo: Vec3 = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.min(a[2], b[2]) - r]
  const hi: Vec3 = [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r]
  return {
    lo,
    hi,
    f: (x, y, z) => {
      const pax = x - a[0]
      const pay = y - a[1]
      const paz = z - a[2]
      const yy = pax * bax + pay * bay + paz * baz
      const zz = yy - l2
      const qx = pax * l2 - bax * yy
      const qy = pay * l2 - bay * yy
      const qz = paz * l2 - baz * yy
      const x2 = qx * qx + qy * qy + qz * qz
      const y2 = yy * yy * l2
      const z2 = zz * zz * l2
      const k = Math.sign(rr) * rr * rr * x2
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - ra
    },
  }
}

/** A chain of bars through the points, each with its own radius. */
export function rod(points: Vec3[], radii: number[]): Shape[] {
  const out: Shape[] = []
  for (let i = 0; i < points.length - 1; i++) out.push(bar(points[i], points[i + 1], radii[i], radii[i + 1]))
  return out
}

/** Unit vector. */
export function unit(v: Vec3): Vec3 {
  const l = len3(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/**
 * An axis frame whose second axis (local y) points along `up` and whose third
 * (local z) is as close to `front` as it can be.
 */
function axes(up: Vec3, front: Vec3): [Vec3, Vec3, Vec3] {
  const v = unit(up)
  const u = unit(cross(v, front))
  const w = cross(u, v)
  return [u, v, w]
}

/**
 * An egg: an ellipsoid with half sizes r, its local y axis along `up`
 * (approximate distance, after Inigo Quilez - good near the surface).
 */
export function egg(c: Vec3, r: Vec3, up: Vec3 = [0, 1, 0], front: Vec3 = [0, 0, 1]): Shape {
  const [u, v, w] = axes(up, front)
  const m = Math.max(r[0], r[1], r[2])
  const [lo, hi] = grow(c, c, m)
  return {
    lo,
    hi,
    f: (x, y, z) => {
      const px = x - c[0]
      const py = y - c[1]
      const pz = z - c[2]
      const lx = px * u[0] + py * u[1] + pz * u[2]
      const ly = px * v[0] + py * v[1] + pz * v[2]
      const lz = px * w[0] + py * w[1] + pz * w[2]
      const k0 = len3(lx / r[0], ly / r[1], lz / r[2])
      const k1 = len3(lx / (r[0] * r[0]), ly / (r[1] * r[1]), lz / (r[2] * r[2]))
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2])
    },
  }
}

/** A box with rounded edges: half sizes b, corner radius rad, local y along `up`. */
export function brick(c: Vec3, b: Vec3, rad: number, up: Vec3 = [0, 1, 0], front: Vec3 = [0, 0, 1]): Shape {
  const [u, v, w] = axes(up, front)
  const m = len3(b[0], b[1], b[2])
  const [lo, hi] = grow(c, c, m)
  const qx0 = b[0] - rad
  const qy0 = b[1] - rad
  const qz0 = b[2] - rad
  return {
    lo,
    hi,
    f: (x, y, z) => {
      const px = x - c[0]
      const py = y - c[1]
      const pz = z - c[2]
      const qx = Math.abs(px * u[0] + py * u[1] + pz * u[2]) - qx0
      const qy = Math.abs(px * v[0] + py * v[1] + pz * v[2]) - qy0
      const qz = Math.abs(px * w[0] + py * w[1] + pz * w[2]) - qz0
      const out = len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0))
      return out + Math.min(Math.max(qx, qy, qz), 0) - rad
    },
  }
}

/** A flat plate: the triangle a, b, c thickened by r all round (exact distance, after Inigo Quilez). */
export function slab(a: Vec3, b: Vec3, c: Vec3, r: number): Shape {
  const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
  const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
  const ba = sub(b, a)
  const cb = sub(c, b)
  const ac = sub(a, c)
  const nor = cross(ba, ac)
  const e0 = cross(ba, nor)
  const e1 = cross(cb, nor)
  const e2 = cross(ac, nor)
  const nn = dot(nor, nor)
  const lo: Vec3 = [Math.min(a[0], b[0], c[0]) - r, Math.min(a[1], b[1], c[1]) - r, Math.min(a[2], b[2], c[2]) - r]
  const hi: Vec3 = [Math.max(a[0], b[0], c[0]) + r, Math.max(a[1], b[1], c[1]) + r, Math.max(a[2], b[2], c[2]) + r]
  const edge = (e: Vec3, o: Vec3, x: number, y: number, z: number) => {
    const px = x - o[0]
    const py = y - o[1]
    const pz = z - o[2]
    const t = Math.min(1, Math.max(0, (e[0] * px + e[1] * py + e[2] * pz) / dot(e, e)))
    const dx = e[0] * t - px
    const dy = e[1] * t - py
    const dz = e[2] * t - pz
    return dx * dx + dy * dy + dz * dz
  }
  return {
    lo,
    hi,
    f: (x, y, z) => {
      const s0 = Math.sign(e0[0] * (x - a[0]) + e0[1] * (y - a[1]) + e0[2] * (z - a[2]))
      const s1 = Math.sign(e1[0] * (x - b[0]) + e1[1] * (y - b[1]) + e1[2] * (z - b[2]))
      const s2 = Math.sign(e2[0] * (x - c[0]) + e2[1] * (y - c[1]) + e2[2] * (z - c[2]))
      let d2: number
      if (s0 + s1 + s2 < 2) d2 = Math.min(edge(ba, a, x, y, z), edge(cb, b, x, y, z), edge(ac, c, x, y, z))
      else {
        const h = nor[0] * (x - a[0]) + nor[1] * (y - a[1]) + nor[2] * (z - a[2])
        d2 = (h * h) / nn
      }
      return Math.sqrt(d2) - r
    },
  }
}

/** A ring (torus) round `c`, in the plane square to `n`: big radius R, thickness r. */
export function ring(c: Vec3, n: Vec3, R: number, r: number): Shape {
  const nn = unit(n)
  const [lo, hi] = grow(c, c, R + r)
  return {
    lo,
    hi,
    f: (x, y, z) => {
      const px = x - c[0]
      const py = y - c[1]
      const pz = z - c[2]
      const h = px * nn[0] + py * nn[1] + pz * nn[2]
      const rad = len3(px - h * nn[0], py - h * nn[1], pz - h * nn[2])
      return len2(rad - R, h) - r
    },
  }
}

/** A round-ended rod of radius r, `len` long beyond `c` along `n` (and `back` behind it). */
export function plug(c: Vec3, n: Vec3, r: number, len: number, back = 0): Shape {
  const nn = unit(n)
  return bar(
    [c[0] - nn[0] * back, c[1] - nn[1] * back, c[2] - nn[2] * back],
    [c[0] + nn[0] * len, c[1] + nn[1] * len, c[2] + nn[2] * len],
    r,
    r,
  )
}

/* ───────────────────────── 2D outlines ───────────────────────── */

/** Closed Catmull-Rom through the points, `sub` samples per span: a smooth outline from a few clicks. */
export function smoothLoop(pts: [number, number][], sub = 4): [number, number][] {
  const n = pts.length
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    for (let s = 0; s < sub; s++) {
      const t = s / sub
      const t2 = t * t
      const t3 = t2 * t
      const at = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([at(p0[0], p1[0], p2[0], p3[0]), at(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  return out
}

/** Signed distance to a closed polygon in 2D (negative inside; after Inigo Quilez). */
export function polygon2(v: [number, number][]): (px: number, py: number) => number {
  const n = v.length
  const vx = Float64Array.from(v, (p) => p[0])
  const vy = Float64Array.from(v, (p) => p[1])
  return (px, py) => {
    let d = (px - vx[0]) ** 2 + (py - vy[0]) ** 2
    let s = 1
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const ex = vx[j] - vx[i]
      const ey = vy[j] - vy[i]
      const wx = px - vx[i]
      const wy = py - vy[i]
      const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / (ex * ex + ey * ey)))
      const bx = wx - ex * t
      const by = wy - ey * t
      d = Math.min(d, bx * bx + by * by)
      const c1 = py >= vy[i]
      const c2 = py < vy[j]
      const c3 = ex * wy > ey * wx
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s
    }
    return s * Math.sqrt(d)
  }
}

/**
 * Bake a 2D distance function into a grid over [x0, x1] x [y0, y1] and read it back
 * bilinearly - an outline with many points then costs the same as one. Outside the
 * grid the function itself is used.
 */
export function baked2(
  fn: (x: number, y: number) => number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  step: number,
): (x: number, y: number) => number {
  const nx = Math.ceil((x1 - x0) / step) + 1
  const ny = Math.ceil((y1 - y0) / step) + 1
  const v = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = fn(x0 + i * step, y0 + j * step)
  return (x, y) => {
    const fx = (x - x0) / step
    const fy = (y - y0) / step
    if (fx < 0 || fy < 0 || fx >= nx - 1 || fy >= ny - 1) return fn(x, y)
    const i = Math.floor(fx)
    const j = Math.floor(fy)
    const tx = fx - i
    const ty = fy - j
    const o = j * nx + i
    const a = v[o] + (v[o + 1] - v[o]) * tx
    const b = v[o + nx] + (v[o + nx + 1] - v[o + nx]) * tx
    return a + (b - a) * ty
  }
}

/* ───────────────────────── meshing ───────────────────────── */

/**
 * Turn a field into a triangle mesh (surface nets): one vertex in every grid cell
 * the surface passes through, pulled onto the surface, joined into quads.
 *
 * The grid is only filled in near the surface: a coarse pass first finds the cells
 * the surface can reach, so a big, mostly empty box stays cheap.
 * `symmetric` = the field is mirror-symmetric across x = 0, so only half is evaluated.
 */
export function meshField(field: Field, lo: Vec3, hi: Vec3, step: number, symmetric = false): SolidMesh {
  const C = 4
  // node counts, rounded up to whole coarse cells
  const cells = (a: number) => Math.ceil((hi[a] - lo[a]) / step / C) * C
  let nxc = cells(0)
  let x0 = lo[0]
  if (symmetric) {
    // put a node row exactly on x = 0, and the same number either side
    const half = Math.ceil(Math.max(-lo[0], hi[0]) / step / C) * C
    nxc = half * 2
    x0 = -half * step
  }
  const nx = nxc + 1
  const ny = cells(1) + 1
  const nz = cells(2) + 1
  const y0 = lo[1]
  const z0 = lo[2]
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i

  const value = new Float32Array(nx * ny * nz).fill(NaN)
  const sample = (i: number, j: number, k: number): number => {
    const o = at(i, j, k)
    let v = value[o]
    if (v === v) return v
    const mi = symmetric ? nx - 1 - i : i
    const om = at(mi, j, k)
    v = value[om]
    if (v !== v) {
      v = field(x0 + i * step, y0 + j * step, z0 + k * step)
      value[om] = v
    }
    value[o] = v
    return v
  }

  // coarse pass: which coarse cells can the surface reach? (no point of a cube is
  // further from its nearest corner than half the cube's diagonal)
  const cx = nxc / C
  const cy = (ny - 1) / C
  const cz = (nz - 1) / C
  const reach = C * step * Math.sqrt(3) * 0.5 * 1.25
  const near: number[] = []
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let lo = Infinity
        let hi = -Infinity
        for (let c = 0; c < 8; c++) {
          const v = sample((i + (c & 1)) * C, (j + ((c >> 1) & 1)) * C, (k + ((c >> 2) & 1)) * C)
          lo = Math.min(lo, v)
          hi = Math.max(hi, v)
        }
        if (lo < reach && hi > -reach) near.push(i, j, k)
      }
    }
  }

  // a vertex in every cell the surface goes through, worked out the first time it is asked for
  const vertOf = new Map<number, number>()
  const cellsWithVert: number[] = []
  const pos: number[] = []
  const corner = new Float64Array(8)
  const vertexIn = (i: number, j: number, k: number): number => {
    if (i < 0 || j < 0 || k < 0 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) return -1
    const key = at(i, j, k)
    const known = vertOf.get(key)
    if (known !== undefined) return known
    let inside = 0
    for (let c = 0; c < 8; c++) {
      const v = sample(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))
      corner[c] = v
      if (v < 0) inside++
    }
    if (inside === 0 || inside === 8) {
      vertOf.set(key, -1)
      return -1
    }
    // average of the points where the 12 edges cross the surface
    let sx = 0
    let sy = 0
    let sz = 0
    let n = 0
    for (let c = 0; c < 8; c++) {
      for (let a = 0; a < 3; a++) {
        const bit = 1 << a
        if (c & bit) continue
        const va = corner[c]
        const vb = corner[c | bit]
        if (va < 0 === vb < 0) continue
        const t = va / (va - vb)
        sx += (c & 1) + (a === 0 ? t : 0)
        sy += ((c >> 1) & 1) + (a === 1 ? t : 0)
        sz += ((c >> 2) & 1) + (a === 2 ? t : 0)
        n++
      }
    }
    const id = pos.length / 3
    vertOf.set(key, id)
    cellsWithVert.push(key)
    pos.push(x0 + (i + sx / n) * step, y0 + (j + sy / n) * step, z0 + (k + sz / n) * step)
    return id
  }
  for (let c = 0; c < near.length; c += 3) {
    const ci = near[c] * C
    const cj = near[c + 1] * C
    const ck = near[c + 2] * C
    for (let k = ck; k < ck + C; k++) for (let j = cj; j < cj + C; j++) for (let i = ci; i < ci + C; i++) vertexIn(i, j, k)
  }

  // quads: every grid edge the surface crosses joins the four cells round it.
  // A neighbour outside the coarse band is filled in on the spot, and its own edges
  // are then visited too, so the mesh closes up wherever the band was too thin.
  const around = [
    // for an edge along x, y, z: the offsets of the four cells round it, in turn
    [
      [0, 0, 0],
      [0, -1, 0],
      [0, -1, -1],
      [0, 0, -1],
    ],
    [
      [0, 0, 0],
      [0, 0, -1],
      [-1, 0, -1],
      [-1, 0, 0],
    ],
    [
      [0, 0, 0],
      [-1, 0, 0],
      [-1, -1, 0],
      [0, -1, 0],
    ],
  ]
  const quads: number[] = []
  for (let w = 0; w < cellsWithVert.length; w++) {
    const key = cellsWithVert[w]
    const i = key % nx
    const j = Math.floor(key / nx) % ny
    const k = Math.floor(key / (nx * ny))
    const v0 = value[key]
    for (let a = 0; a < 3; a++) {
      const v1 = value[at(i + (a === 0 ? 1 : 0), j + (a === 1 ? 1 : 0), k + (a === 2 ? 1 : 0))]
      if (v0 < 0 === v1 < 0) continue
      const q0 = vertexIn(i + around[a][0][0], j + around[a][0][1], k + around[a][0][2])
      const q1 = vertexIn(i + around[a][1][0], j + around[a][1][1], k + around[a][1][2])
      const q2 = vertexIn(i + around[a][2][0], j + around[a][2][1], k + around[a][2][2])
      const q3 = vertexIn(i + around[a][3][0], j + around[a][3][1], k + around[a][3][2])
      if (q0 < 0 || q1 < 0 || q2 < 0 || q3 < 0) continue
      // facing out of the form: wound one way if the inside is behind the edge, the other if in front
      if (v0 >= 0) quads.push(q0, q3, q2, q1)
      else quads.push(q0, q1, q2, q3)
    }
  }

  // pull every vertex onto the surface and take its normal from the field
  const V = pos.length / 3
  const position = new Float32Array(V * 3)
  const normal = new Float32Array(V * 3)
  const e = step * 0.25
  const grad = (x: number, y: number, z: number, out: number[]) => {
    // four-point (tetrahedron) gradient
    const a = field(x + e, y - e, z - e)
    const b = field(x - e, y - e, z + e)
    const c = field(x - e, y + e, z - e)
    const d = field(x + e, y + e, z + e)
    out[0] = a - b - c + d
    out[1] = -a - b + c + d
    out[2] = -a + b - c + d
    out[3] = (a + b + c + d) * 0.25
  }
  const g = [0, 0, 0, 0]
  for (let v = 0; v < V; v++) {
    let x = pos[v * 3]
    let y = pos[v * 3 + 1]
    let z = pos[v * 3 + 2]
    grad(x, y, z, g)
    const l = len3(g[0], g[1], g[2]) || 1
    // one step towards the surface; the vertex moves along its own normal, so the normal still holds
    const move = Math.max(-step, Math.min(step, g[3]))
    x -= (g[0] / l) * move
    y -= (g[1] / l) * move
    z -= (g[2] / l) * move
    position[v * 3] = x
    position[v * 3 + 1] = y
    position[v * 3 + 2] = z
    normal[v * 3] = g[0] / l
    normal[v * 3 + 1] = g[1] / l
    normal[v * 3 + 2] = g[2] / l
  }

  // each quad becomes two triangles, split along its shorter diagonal
  const dist = (p: number, r: number) => {
    const dx = position[p * 3] - position[r * 3]
    const dy = position[p * 3 + 1] - position[r * 3 + 1]
    const dz = position[p * 3 + 2] - position[r * 3 + 2]
    return dx * dx + dy * dy + dz * dz
  }
  const index = new Uint32Array((quads.length / 4) * 6)
  for (let o = 0, t = 0; o < quads.length; o += 4, t += 6) {
    const a = quads[o]
    const b = quads[o + 1]
    const c = quads[o + 2]
    const d = quads[o + 3]
    if (dist(a, c) < dist(b, d)) index.set([a, b, c, a, c, d], t)
    else index.set([a, b, d, b, c, d], t)
  }

  return { position, normal, index }
}

/** Colour a graph with four colours so neighbours always differ (backtracking; small graphs). */
function fourColour(n: number, near: Set<number>[]): number[] {
  const colour = new Array<number>(n).fill(-1)
  const order = [...Array(n).keys()].sort((a, b) => near[b].size - near[a].size)
  const place = (k: number): boolean => {
    if (k === order.length) return true
    const i = order[k]
    for (let c = 0; c < 4; c++) {
      if ([...near[i]].some((j) => colour[j] === c)) continue
      colour[i] = c
      if (place(k + 1)) return true
    }
    colour[i] = -1
    return false
  }
  if (!place(0)) for (let i = 0; i < n; i++) if (colour[i] < 0) colour[i] = i % 4
  return colour
}

/**
 * Ink the edges of a carved form - a base shape cut by planes - and nothing else.
 *
 * Every vertex belongs to the face (field) that is highest there. Its two ink values
 * start at 0 on an edge (where the two highest fields meet) and rise to 0.5 inside a
 * face, each with a sign taken from the face's colour; touching faces get different
 * colours, so at least one value changes sign across every edge - a crossing the fill
 * shader inks - while inside a face both stay at a steady +-0.5 and draw nothing.
 */
export function facetInk(mesh: SolidMesh, fields: Field[], width = 0.03): Float32Array {
  const p = mesh.position
  const V = p.length / 3
  const face = new Int32Array(V)
  const rise = new Float32Array(V)
  for (let v = 0; v < V; v++) {
    let a = -Infinity
    let b = -Infinity
    let top = 0
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i](p[v * 3], p[v * 3 + 1], p[v * 3 + 2])
      if (f > a) {
        b = a
        a = f
        top = i
      } else if (f > b) b = f
    }
    face[v] = top
    rise[v] = Math.min(0.5, (a - b) / width)
  }
  const near = fields.map(() => new Set<number>())
  const idx = mesh.index
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const i = face[idx[t + e]]
      const j = face[idx[t + ((e + 1) % 3)]]
      if (i !== j) {
        near[i].add(j)
        near[j].add(i)
      }
    }
  }
  const colour = fourColour(fields.length, near)
  const ink = new Float32Array(V * 2)
  for (let v = 0; v < V; v++) {
    const c = colour[face[v]]
    ink[v * 2] = (c & 1 ? -1 : 1) * rise[v]
    ink[v * 2 + 1] = (c & 2 ? -1 : 1) * rise[v]
  }
  return ink
}

/* ───────────────────────── sculpted parts ───────────────────────── */

/** How to build one sculpted part: its field (made on demand), the box to mesh, and the grid step. */
export interface Sculpt {
  field: () => Field
  lo: Vec3
  hi: Vec3
  step: number
  /** Mirror-symmetric across x = 0 (only half is evaluated). */
  symmetric?: boolean
  /**
   * For a carved form: the fields it was cut from (its base and each cutting plane).
   * The edges where two of them meet are inked (see `facetInk`).
   */
  facets?: () => Field[]
}

const sculpts = new Map<string, Sculpt>()
const sculptMeshes = new Map<string, SolidMesh>()

function buildSculpt(key: string): SolidMesh {
  let mesh = sculptMeshes.get(key)
  if (!mesh) {
    const s = sculpts.get(key) as Sculpt
    mesh = meshField(s.field(), s.lo, s.hi, s.step, s.symmetric)
    if (s.facets) mesh.ink = facetInk(mesh, s.facets())
    sculptMeshes.set(key, mesh)
  }
  return mesh
}

/*
 * Parts are meshed while the browser is idle, one per idle moment, so opening a
 * lesson - or switching body - rarely has to wait. Whatever is not built yet when
 * a rig needs it is built on the spot.
 */
let warming = false
function warmUp() {
  if (warming || typeof window === 'undefined') return
  warming = true
  const idle: (fn: () => void) => void =
    'requestIdleCallback' in window ? (fn) => window.requestIdleCallback(fn, { timeout: 4000 }) : (fn) => setTimeout(fn, 200)
  const next = () => {
    const key = [...sculpts.keys()].find((k) => !sculptMeshes.has(k))
    if (key === undefined) {
      warming = false
      return
    }
    buildSculpt(key)
    idle(next)
  }
  idle(next)
}

/** Register a sculpted part under a unique key; returns the function that hands out its (cached) mesh. */
export function sculpted(key: string, s: Sculpt): () => SolidMesh {
  if (!sculpts.has(key)) sculpts.set(key, s)
  warmUp()
  return () => buildSculpt(key)
}
