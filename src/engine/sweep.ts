import { BufferAttribute, BufferGeometry, CatmullRomCurve3, Sphere, Vector3 } from 'three'
import type { FrameGetter, SectionName, SweepDef } from './types'

type UV = [number, number]

/** Cross-sections, counter-clockwise. u = across the form, v = outward. */
function sheet(n: number): UV[] {
  const top: UV[] = []
  const bottom: UV[] = []
  for (let i = 0; i < n; i++) {
    const u = 0.9 - (1.8 * i) / (n - 1)
    top.push([u, 1])
    bottom.push([-u, -0.3])
  }
  return [...top, [-1, 0.35], ...bottom, [1, 0.35]]
}

function round(n: number): UV[] {
  const out: UV[] = []
  const r = 1 / Math.cos(Math.PI / n)
  for (let i = 0; i < n; i++) {
    const a = Math.PI / n + (i * 2 * Math.PI) / n
    out.push([Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96])
  }
  return out
}

const SECTIONS: Record<SectionName, UV[]> = {
  // A box with its corners knocked off: a clear top plane and two side planes.
  block: [
    [0.55, 1],
    [-0.55, 1],
    [-1, 0.5],
    [-1, -0.15],
    [-0.6, -0.45],
    [0.6, -0.45],
    [1, -0.15],
    [1, 0.5],
  ],
  box: [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ],
  round: round(8),
  sheet: sheet(5),
  sheet7: sheet(7),
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Catmull-Rom on plain numbers, kept from overshooting. */
function smoothAt(a: Float32Array, s: number, f: number): number {
  const last = a.length - 1
  const p0 = a[Math.max(s - 1, 0)]
  const p1 = a[s]
  const p2 = a[Math.min(s + 1, last)]
  const p3 = a[Math.min(s + 2, last)]
  const v =
    0.5 *
    (2 * p1 +
      (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
  return clamp(v, Math.min(p1, p2) * 0.85, Math.max(p1, p2) * 1.12)
}

const _a = new Vector3()
const _b = new Vector3()
const _t = new Vector3()
const _n = new Vector3()
const _bn = new Vector3()
const _c = new Vector3()

/**
 * A block shape swept along a path.
 * The geometry is allocated once; `update` only rewrites the numbers,
 * so dragging a slider stays cheap.
 */
export class Sweep {
  readonly def: SweepDef
  readonly geometry = new BufferGeometry()
  /** Where the label points at (top of the fattest station), in rig space. */
  readonly anchor = new Vector3()
  readonly anchorNormal = new Vector3(0, 0, 1)

  private readonly sec: UV[]
  private readonly K: number
  private readonly seg: number
  private readonly R: number
  private readonly n: number
  private readonly ctrl: Vector3[]
  private readonly ctrlN: Vector3[]
  private readonly cw: Float32Array
  private readonly ch: Float32Array
  private readonly cc: Float32Array
  private readonly curve: CatmullRomCurve3
  private readonly centers: Vector3[]
  private readonly tangents: Vector3[]
  private readonly rings: Float32Array
  private readonly centroids: Float32Array
  private readonly pos: Float32Array
  private readonly nor: Float32Array
  private readonly onor: Float32Array
  private readonly labelRing: number
  private restLen = 0

  constructor(def: SweepDef) {
    this.def = def
    this.sec = SECTIONS[def.section ?? 'block']
    const K = (this.K = this.sec.length)
    const n = (this.n = def.path.length)
    const seg = (this.seg = def.seg ?? 3)
    const R = (this.R = (n - 1) * seg + 1)

    this.ctrl = def.path.map(() => new Vector3())
    this.ctrlN = def.path.map(() => new Vector3())
    this.cw = new Float32Array(n)
    this.ch = new Float32Array(n)
    this.cc = new Float32Array(n)
    this.curve = new CatmullRomCurve3(this.ctrl, false, 'centripetal')
    this.centers = Array.from({ length: R }, () => new Vector3())
    this.tangents = Array.from({ length: R }, () => new Vector3())
    this.rings = new Float32Array(R * K * 3)
    this.centroids = new Float32Array(R * 3)

    const stripVerts = R * K * 2
    const capVerts = 2 * (K + 1)
    const V = stripVerts + capVerts
    this.pos = new Float32Array(V * 3)
    this.nor = new Float32Array(V * 3)
    this.onor = new Float32Array(V * 3)
    const coord = new Float32Array(V * 2)
    const index: number[] = []

    for (let i = 0; i < R; i++) {
      for (let k = 0; k < K; k++) {
        const v = (i * K + k) * 2
        coord[v * 2] = i / seg
        coord[v * 2 + 1] = 0
        coord[(v + 1) * 2] = i / seg
        coord[(v + 1) * 2 + 1] = 1
        if (i < R - 1) {
          const a = v
          const b = v + 1
          const c = v + K * 2 + 1
          const d = v + K * 2
          index.push(a, b, c, a, c, d)
        }
      }
    }
    // caps: [centre, ring...] for the start, then for the end
    const cap0 = stripVerts
    const cap1 = stripVerts + K + 1
    for (let v = cap0; v < V; v++) {
      coord[v * 2] = 0.5
      coord[v * 2 + 1] = 0.5
    }
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K
      index.push(cap0, cap0 + 1 + k2, cap0 + 1 + k)
      index.push(cap1, cap1 + 1 + k, cap1 + 1 + k2)
    }

    const g = this.geometry
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new BufferAttribute(this.nor, 3))
    g.setAttribute('onormal', new BufferAttribute(this.onor, 3))
    g.setAttribute('coord', new BufferAttribute(coord, 2))
    g.setIndex(index)
    g.boundingSphere = new Sphere()

    let li = def.label ?? -1
    if (li < 0) {
      li = 0
      def.path.forEach((pt, j) => {
        if (pt.h * pt.w > def.path[li].h * def.path[li].w) li = j
      })
    }
    this.labelRing = li * seg
  }

  /** Place the stations for a pose. Returns the straight-line length of the path. */
  private place(frames: FrameGetter, drives: Record<string, number>): number {
    const path = this.def.path
    for (let j = 0; j < this.n; j++) {
      const pt = path[j]
      const m = frames(pt.f)
      let [x, y, z] = pt.p
      let w = pt.w
      let h = pt.h
      if (pt.alt) {
        const d = clamp(drives[pt.alt.drive] ?? 0, 0, 1)
        if (pt.alt.p) {
          x += (pt.alt.p[0] - x) * d
          y += (pt.alt.p[1] - y) * d
          z += (pt.alt.p[2] - z) * d
        }
        if (pt.alt.w !== undefined) w += (pt.alt.w - w) * d
        if (pt.alt.h !== undefined) h += (pt.alt.h - h) * d
      }
      this.ctrl[j].set(x, y, z).applyMatrix4(m)
      const nn = this.ctrlN[j]
      if (pt.n) nn.set(pt.n[0], pt.n[1], pt.n[2])
      else nn.set(x, 0, z)
      if (nn.lengthSq() < 1e-8) nn.set(0, 0, 1)
      nn.transformDirection(m)
      this.cw[j] = w
      this.ch[j] = h
      this.cc[j] = pt.curl ?? 0
    }
    let len = 0
    for (let j = 1; j < this.n; j++) len += this.ctrl[j].distanceTo(this.ctrl[j - 1])
    return len
  }

  /** Remember how long the path is in the resting pose. */
  setRest(frames: FrameGetter, drives: Record<string, number>) {
    this.restLen = this.place(frames, drives)
  }

  update(frames: FrameGetter, drives: Record<string, number>) {
    const { K, R, seg, n, sec, centers, tangents, rings, centroids, pos, nor, onor } = this
    const len = this.place(frames, drives)

    // Shorter path -> fatter block (the "flexed muscle" effect).
    const bulge = this.def.bulge ?? 0
    let hs = 1
    let ws = 1
    if (bulge > 0 && this.restLen > 0 && len > 1e-4) {
      const ratio = clamp(this.restLen / len, 0.6, 1.7)
      hs = Math.pow(ratio, bulge)
      ws = Math.pow(ratio, bulge * 0.35)
    }

    for (let i = 0; i < R; i++) this.curve.getPoint(i / (R - 1), centers[i])
    for (let i = 0; i < R; i++) {
      const t = tangents[i]
      t.subVectors(centers[Math.min(i + 1, R - 1)], centers[Math.max(i - 1, 0)])
      if (t.lengthSq() < 1e-10) {
        if (i > 0) t.copy(tangents[i - 1])
        else t.set(0, -1, 0)
      } else t.normalize()
    }

    let maxR = 0
    _n.set(0, 0, 1)
    for (let i = 0; i < R; i++) {
      const s = Math.min(Math.floor(i / seg), n - 2)
      const f = i / seg - s
      const w = Math.max(smoothAt(this.cw, s, f) * ws, 0.004)
      const h = Math.max(smoothAt(this.ch, s, f) * hs, 0.004)
      const curl = this.cc[s] + (this.cc[s + 1] - this.cc[s]) * f
      const T = tangents[i]
      const C = centers[i]

      // outward direction: blend the stations' normals, keep it square to the path
      const sf = f * f * (3 - 2 * f)
      _a.copy(this.ctrlN[s]).lerp(this.ctrlN[s + 1], sf)
      _a.addScaledVector(T, -_a.dot(T))
      if (_a.lengthSq() > 1e-6) _n.copy(_a).normalize()
      else {
        _n.addScaledVector(T, -_n.dot(T))
        if (_n.lengthSq() < 1e-6) _n.set(T.y, T.z, T.x).cross(T)
        _n.normalize()
      }
      _bn.crossVectors(_n, T)

      let cx = 0
      let cy = 0
      let cz = 0
      const half = curl / 2
      for (let k = 0; k < K; k++) {
        const [u, v] = sec[k]
        let x: number
        let y: number
        if (half > 1e-3) {
          const rad = w / half
          const th = u * half
          const rr = rad + v * h
          x = rr * Math.sin(th)
          y = rr * Math.cos(th) - rad
        } else {
          x = u * w
          y = v * h
        }
        const o = (i * K + k) * 3
        const px = C.x + _bn.x * x + _n.x * y
        const py = C.y + _bn.y * x + _n.y * y
        const pz = C.z + _bn.z * x + _n.z * y
        rings[o] = px
        rings[o + 1] = py
        rings[o + 2] = pz
        cx += px
        cy += py
        cz += pz
      }
      centroids[i * 3] = cx / K
      centroids[i * 3 + 1] = cy / K
      centroids[i * 3 + 2] = cz / K
      maxR = Math.max(maxR, w * 1.3 + h * 1.3)

      if (i === this.labelRing) {
        this.anchor.copy(C).addScaledVector(_n, h)
        this.anchorNormal.copy(_n)
      }
    }

    // side strips: each strip gets its own flat-across / smooth-along normal
    for (let i = 0; i < R; i++) {
      const ip = Math.min(i + 1, R - 1)
      const im = Math.max(i - 1, 0)
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K
        const o0 = (i * K + k) * 3
        const o1 = (i * K + k2) * 3
        // across the strip
        _a.set(rings[o1] - rings[o0], rings[o1 + 1] - rings[o0 + 1], rings[o1 + 2] - rings[o0 + 2])
        // along the strip (mid-line, next ring minus previous ring)
        const p0 = (ip * K + k) * 3
        const p1 = (ip * K + k2) * 3
        const m0 = (im * K + k) * 3
        const m1 = (im * K + k2) * 3
        _b.set(
          rings[p0] + rings[p1] - rings[m0] - rings[m1],
          rings[p0 + 1] + rings[p1 + 1] - rings[m0 + 1] - rings[m1 + 1],
          rings[p0 + 2] + rings[p1 + 2] - rings[m0 + 2] - rings[m1 + 2],
        )
        _c.crossVectors(_a, _b)
        if (_c.lengthSq() < 1e-14) _c.crossVectors(_a, tangents[i])
        _c.normalize()

        const v = (i * K + k) * 2 * 3
        for (let e = 0; e < 2; e++) {
          const src = e === 0 ? o0 : o1
          const dst = v + e * 3
          pos[dst] = rings[src]
          pos[dst + 1] = rings[src + 1]
          pos[dst + 2] = rings[src + 2]
          nor[dst] = _c.x
          nor[dst + 1] = _c.y
          nor[dst + 2] = _c.z
          // outline direction: straight out from the middle of the ring
          let ox = rings[src] - centroids[i * 3]
          let oy = rings[src + 1] - centroids[i * 3 + 1]
          let oz = rings[src + 2] - centroids[i * 3 + 2]
          const ol = Math.hypot(ox, oy, oz)
          if (ol < 1e-6) {
            ox = _c.x
            oy = _c.y
            oz = _c.z
          } else {
            ox /= ol
            oy /= ol
            oz /= ol
          }
          onor[dst] = ox
          onor[dst + 1] = oy
          onor[dst + 2] = oz
        }
      }
    }

    // end caps
    const stripVerts = R * K * 2
    for (let cap = 0; cap < 2; cap++) {
      const i = cap === 0 ? 0 : R - 1
      const sign = cap === 0 ? -1 : 1
      const T = tangents[i]
      let v = (stripVerts + cap * (K + 1)) * 3
      _t.set(centroids[i * 3], centroids[i * 3 + 1], centroids[i * 3 + 2])
      for (let k = -1; k < K; k++) {
        const src = (i * K + k) * 3
        const px = k < 0 ? _t.x : rings[src]
        const py = k < 0 ? _t.y : rings[src + 1]
        const pz = k < 0 ? _t.z : rings[src + 2]
        pos[v] = px
        pos[v + 1] = py
        pos[v + 2] = pz
        nor[v] = T.x * sign
        nor[v + 1] = T.y * sign
        nor[v + 2] = T.z * sign
        let ox = px - _t.x + T.x * sign * 0.02
        let oy = py - _t.y + T.y * sign * 0.02
        let oz = pz - _t.z + T.z * sign * 0.02
        const ol = Math.hypot(ox, oy, oz) || 1
        ox /= ol
        oy /= ol
        oz /= ol
        onor[v] = ox
        onor[v + 1] = oy
        onor[v + 2] = oz
        v += 3
      }
    }

    const g = this.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.normal.needsUpdate = true
    g.attributes.onormal.needsUpdate = true

    // cheap bounding sphere so picking and culling keep working
    const sphere = g.boundingSphere as Sphere
    sphere.center.set(0, 0, 0)
    for (let i = 0; i < R; i++) sphere.center.add(centers[i])
    sphere.center.multiplyScalar(1 / R)
    let rad = 0
    for (let i = 0; i < R; i++) rad = Math.max(rad, sphere.center.distanceTo(centers[i]))
    sphere.radius = rad + maxR
  }

  dispose() {
    this.geometry.dispose()
  }
}
