import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from 'three'
import type { Form, FrameGetter, SkinDef, SweepDef } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** x, y, z and thickness travel together through the spline. */
const C = 4

/**
 * Catmull-Rom through `n` evenly spaced control values, `sub` samples per span.
 * Past either end the curve carries straight on, so the border is not pinched.
 */
function resample(
  src: Float32Array,
  so: number,
  ss: number,
  n: number,
  dst: Float32Array,
  d0: number,
  ds: number,
  sub: number,
) {
  const at = (k: number, c: number) =>
    k < 0
      ? 2 * src[so + c] - src[so + ss + c]
      : k >= n
        ? 2 * src[so + (n - 1) * ss + c] - src[so + (n - 2) * ss + c]
        : src[so + k * ss + c]
  const count = (n - 1) * sub
  for (let i = 0; i <= count; i++) {
    const k = Math.min(Math.floor(i / sub), n - 2)
    const t = i / sub - k
    const t2 = t * t
    const t3 = t2 * t
    const w0 = 0.5 * (-t + 2 * t2 - t3)
    const w1 = 0.5 * (2 - 5 * t2 + 3 * t3)
    const w2 = 0.5 * (t + 4 * t2 - 3 * t3)
    const w3 = 0.5 * (-t2 + t3)
    for (let c = 0; c < C; c++) {
      dst[d0 + i * ds + c] = w0 * at(k - 1, c) + w1 * at(k, c) + w2 * at(k + 1, c) + w3 * at(k + 2, c)
    }
  }
}

/** Guide rings are inked where this hits a whole number: map the chosen rows onto 0, 1, 2 ... */
function ringCoord(v: number, rings: number[], last: number): number {
  const n = rings.length
  if (n === 0) return 0.5
  if (v <= rings[0]) return rings[0] > 0 ? (-0.5 * (rings[0] - v)) / rings[0] : 0
  for (let k = 0; k < n - 1; k++) {
    if (v <= rings[k + 1]) return k + (v - rings[k]) / (rings[k + 1] - rings[k])
  }
  const end = rings[n - 1]
  return n - 1 + (last > end ? (0.5 * (v - end)) / (last - end) : 0)
}

const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()

/**
 * A smooth, finely divided pad laid over the body - for the forms a swept block
 * cannot follow (the flank: it has to hug the ribs, pinch in at the waist and sit
 * on the hip bone, all in one piece).
 *
 * A small grid of control points says where the outside of the pad is. A spline
 * turns that into a dense surface, the pad gets its thickness inwards, and its
 * border is rolled over like the edge of a cushion. Ink lines along chosen columns
 * give it planes, so it still reads as a block next to the swept forms.
 *
 * Like a sweep, the geometry is allocated once and `update` only rewrites numbers.
 */
export class Skin implements Form {
  readonly def: SweepDef
  readonly geometry = new BufferGeometry()
  readonly anchor = new Vector3()
  readonly anchorNormal = new Vector3(0, 0, 1)

  private readonly skin: SkinDef
  private readonly N: number
  private readonly M: number
  private readonly sub: number
  private readonly NV: number
  private readonly NU: number
  /** Posed control points. */
  private readonly ctrl: Float32Array
  /** Control rows, already splined across. */
  private readonly mid: Float32Array
  /** The dense grid before the edge is rolled over. */
  private readonly base: Float32Array
  private readonly baseN: Float32Array
  private readonly outer: Float32Array
  private readonly outerN: Float32Array
  private readonly inner: Float32Array
  /** How far each grid point is rolled in towards the body (0 = not at all, 1 = fully). */
  private readonly roll: Float32Array
  /** Grid points round the border, in order, and the way out of the pad at each. */
  private readonly loop: Int32Array
  private readonly loopOf: Int32Array
  private readonly loopDir: Float32Array
  /** Grid point of every vertex of the outer face. */
  private readonly outerMap: Int32Array
  private readonly pos: Float32Array
  private readonly nor: Float32Array
  private readonly onor: Float32Array
  private readonly labelAt: number
  /** First and last grid column of every band of the outer face. */
  private readonly bounds: number[]
  /** Shade each band as one plane (the block look) instead of as a smooth curve. */
  private readonly facet: boolean
  private restLen = 0

  constructor(def: SweepDef, skin: SkinDef, smooth = false) {
    this.def = def
    this.skin = skin
    this.facet = !smooth
    const N = (this.N = skin.rows.length)
    const M = (this.M = skin.rows[0].length)
    const sub = (this.sub = skin.sub ?? 8)
    const NV = (this.NV = (N - 1) * sub + 1)
    const NU = (this.NU = (M - 1) * sub + 1)
    const G = NV * NU

    this.ctrl = new Float32Array(N * M * C)
    this.mid = new Float32Array(N * NU * C)
    this.base = new Float32Array(G * C)
    this.baseN = new Float32Array(G * 3)
    this.outer = new Float32Array(G * 3)
    this.outerN = new Float32Array(G * 3)
    this.inner = new Float32Array(G * 3)

    // the cushion edge: a quarter-round over the last `round` control spans
    const round = Math.max(skin.round ?? 0.7, 1e-3)
    this.roll = new Float32Array(G)
    for (let i = 0; i < NV; i++) {
      for (let j = 0; j < NU; j++) {
        const ru = clamp(Math.min(j, NU - 1 - j) / sub / round, 0, 1)
        const rv = clamp(Math.min(i, NV - 1 - i) / sub / round, 0, 1)
        const d = Math.min(1, Math.hypot(1 - ru, 1 - rv))
        this.roll[i * NU + j] = 1 - Math.sqrt(1 - d * d)
      }
    }

    // the border, walked clockwise as seen from outside
    const loop: number[] = []
    for (let j = 0; j < NU - 1; j++) loop.push(j)
    for (let i = 0; i < NV - 1; i++) loop.push(i * NU + NU - 1)
    for (let j = NU - 1; j > 0; j--) loop.push((NV - 1) * NU + j)
    for (let i = NV - 1; i > 0; i--) loop.push(i * NU)
    const L = loop.length
    this.loop = Int32Array.from(loop)
    this.loopOf = new Int32Array(G).fill(-1)
    loop.forEach((g, k) => (this.loopOf[g] = k))
    this.loopDir = new Float32Array(L * 3)

    // the outer face is cut into bands at the plane lines, so each line can be inked
    const cuts = [...new Set((skin.lines ?? []).map((l) => Math.round(l * sub)))]
      .filter((g) => g > 0 && g < NU - 1)
      .sort((a, b) => a - b)
    const bounds = (this.bounds = [0, ...cuts, NU - 1])
    const B = bounds.length - 1
    const rings = [...(skin.rings ?? Array.from({ length: N - 2 }, (_, k) => k + 1))].sort((a, b) => a - b)

    let outerVerts = 0
    for (let b = 0; b < B; b++) outerVerts += NV * (bounds[b + 1] - bounds[b] + 1)
    const V = outerVerts + G + L * 2
    this.pos = new Float32Array(V * 3)
    this.nor = new Float32Array(V * 3)
    this.onor = new Float32Array(V * 3)
    this.outerMap = new Int32Array(outerVerts)
    const coord = new Float32Array(V * 2).fill(0.5)
    const index: number[] = []

    let v0 = 0
    for (let b = 0; b < B; b++) {
      const lo = bounds[b]
      const hi = bounds[b + 1]
      const W = hi - lo + 1
      for (let i = 0; i < NV; i++) {
        for (let j = lo; j <= hi; j++) {
          const v = v0 + i * W + (j - lo)
          this.outerMap[v] = i * NU + j
          const t = (j - lo) / (hi - lo)
          // 0 and 1 are inked: only the cuts get there, never the border of the pad
          coord[v * 2] = ringCoord(i / sub, rings, N - 1)
          coord[v * 2 + 1] = B === 1 ? 0.5 : b === 0 ? 0.5 + 0.5 * t : b === B - 1 ? 0.5 * t : t
          if (i < NV - 1 && j < hi) index.push(v, v + W, v + W + 1, v, v + W + 1, v + 1)
        }
      }
      v0 += NV * W
    }
    // inner face, facing the body
    for (let i = 0; i < NV - 1; i++) {
      for (let j = 0; j < NU - 1; j++) {
        const v = outerVerts + i * NU + j
        index.push(v, v + NU + 1, v + NU, v, v + 1, v + NU + 1)
      }
    }
    // the wall that joins the two round the border
    const wall = outerVerts + G
    for (let k = 0; k < L; k++) {
      const k2 = (k + 1) % L
      const o0 = wall + k * 2
      const o1 = wall + k2 * 2
      index.push(o0, o1, o1 + 1, o0, o1 + 1, o0 + 1)
    }

    const g = this.geometry
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new BufferAttribute(this.nor, 3))
    g.setAttribute('onormal', new BufferAttribute(this.onor, 3))
    g.setAttribute('coord', new BufferAttribute(coord, 2))
    g.setIndex(index)
    g.boundingSphere = new Sphere()

    const [lr, lc] = skin.label ?? [(N - 1) / 2, (M - 1) / 2]
    this.labelAt = Math.round(lr * sub) * NU + Math.round(lc * sub)
  }

  /** Place the control points for a pose. Returns the average length of the pad from top to bottom. */
  private place(frames: FrameGetter): number {
    const { N, M, ctrl } = this
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < M; c++) {
        const pt = this.skin.rows[r][c]
        _a.set(pt.p[0], pt.p[1], pt.p[2]).applyMatrix4(frames(pt.f))
        const o = (r * M + c) * C
        ctrl[o] = _a.x
        ctrl[o + 1] = _a.y
        ctrl[o + 2] = _a.z
        ctrl[o + 3] = pt.h
      }
    }
    let len = 0
    for (let c = 0; c < M; c++) {
      for (let r = 1; r < N; r++) {
        const a = (r * M + c) * C
        const b = a - M * C
        len += Math.hypot(ctrl[a] - ctrl[b], ctrl[a + 1] - ctrl[b + 1], ctrl[a + 2] - ctrl[b + 2])
      }
    }
    return len / M
  }

  setRest(frames: FrameGetter) {
    this.restLen = this.place(frames)
  }

  /** Normals of a grid of points: rows run down, columns run to the right as seen from outside. */
  private gridNormals(p: Float32Array, stride: number, out: Float32Array) {
    const { NV, NU } = this
    for (let i = 0; i < NV; i++) {
      const iu = Math.max(i - 1, 0) * NU
      const id = Math.min(i + 1, NV - 1) * NU
      for (let j = 0; j < NU; j++) {
        const l = (i * NU + Math.max(j - 1, 0)) * stride
        const r = (i * NU + Math.min(j + 1, NU - 1)) * stride
        const u = (iu + j) * stride
        const d = (id + j) * stride
        _a.set(p[d] - p[u], p[d + 1] - p[u + 1], p[d + 2] - p[u + 2])
        _b.set(p[r] - p[l], p[r + 1] - p[l + 1], p[r + 2] - p[l + 2])
        _c.crossVectors(_a, _b)
        if (_c.lengthSq() < 1e-16) _c.set(0, 0, 1)
        else _c.normalize()
        const o = (i * NU + j) * 3
        out[o] = _c.x
        out[o + 1] = _c.y
        out[o + 2] = _c.z
      }
    }
  }

  update(frames: FrameGetter) {
    const { N, M, sub, NV, NU, ctrl, mid, base, baseN, outer, outerN, inner, roll, pos, nor, onor } = this
    const G = NV * NU
    const len = this.place(frames)

    // shorter pad -> thicker pad (the "flexed muscle" effect)
    const bulge = this.def.bulge ?? 0
    let hs = 1
    if (bulge > 0 && this.restLen > 0 && len > 1e-4) hs = Math.pow(clamp(this.restLen / len, 0.6, 1.7), bulge)

    // control grid -> dense grid: across every control row first, then down every column
    for (let r = 0; r < N; r++) resample(ctrl, r * M * C, C, M, mid, r * NU * C, C, sub)
    for (let j = 0; j < NU; j++) resample(mid, j * C, NU * C, N, base, j * C, NU * C, sub)
    this.gridNormals(base, C, baseN)

    const rim = this.skin.rim ?? 0.3
    for (let g = 0; g < G; g++) {
      const h = Math.max(base[g * C + 3], 0.004)
      // the control points mark the outside of the pad at rest; flexing pushes it further out
      const out = h * (hs - 1) - h * hs * (1 - rim) * roll[g]
      for (let c = 0; c < 3; c++) {
        const p = base[g * C + c]
        const n = baseN[g * 3 + c]
        outer[g * 3 + c] = p + n * out
        inner[g * 3 + c] = p - n * h
      }
    }
    this.gridNormals(outer, 3, outerN)

    // the way out of the pad at every border point: along the surface, away from the middle
    const L = this.loop.length
    for (let k = 0; k < L; k++) {
      const g = this.loop[k]
      const i = Math.floor(g / NU)
      const j = g - i * NU
      const ii = clamp(i + (i === 0 ? 2 : i === NV - 1 ? -2 : 0), 0, NV - 1)
      const jj = clamp(j + (j === 0 ? 2 : j === NU - 1 ? -2 : 0), 0, NU - 1)
      const q = (ii * NU + jj) * C
      _a.set(base[g * C] - base[q], base[g * C + 1] - base[q + 1], base[g * C + 2] - base[q + 2])
      _b.set(baseN[g * 3], baseN[g * 3 + 1], baseN[g * 3 + 2])
      _a.addScaledVector(_b, -_a.dot(_b))
      if (_a.lengthSq() < 1e-14) _a.copy(_b)
      else _a.normalize()
      this.loopDir[k * 3] = _a.x
      this.loopDir[k * 3 + 1] = _a.y
      this.loopDir[k * 3 + 2] = _a.z
    }

    /** Outline direction: straight off the face, leaning out of the pad along its border. */
    const lean = (dst: number, g: number, nx: number, ny: number, nz: number) => {
      const k = this.loopOf[g]
      if (k >= 0) {
        nx += this.loopDir[k * 3]
        ny += this.loopDir[k * 3 + 1]
        nz += this.loopDir[k * 3 + 2]
        const l = Math.hypot(nx, ny, nz) || 1
        nx /= l
        ny /= l
        nz /= l
      }
      onor[dst] = nx
      onor[dst + 1] = ny
      onor[dst + 2] = nz
    }

    // the outer face, band by band. On the block model every band is shaded as one plane -
    // flat across, smooth along, like the strips of a swept block - and only the rolled
    // edge keeps its true roundness.
    const outerVerts = this.outerMap.length
    let v = 0
    for (let b = 0; b < this.bounds.length - 1; b++) {
      const lo = this.bounds[b]
      const hi = this.bounds[b + 1]
      for (let i = 0; i < NV; i++) {
        if (this.facet) {
          const l = (i * NU + lo) * C
          const r = (i * NU + hi) * C
          const ul = (Math.max(i - 1, 0) * NU + lo) * C
          const ur = (Math.max(i - 1, 0) * NU + hi) * C
          const dl = (Math.min(i + 1, NV - 1) * NU + lo) * C
          const dr = (Math.min(i + 1, NV - 1) * NU + hi) * C
          _a.set(
            base[dl] + base[dr] - base[ul] - base[ur],
            base[dl + 1] + base[dr + 1] - base[ul + 1] - base[ur + 1],
            base[dl + 2] + base[dr + 2] - base[ul + 2] - base[ur + 2],
          )
          _b.set(base[r] - base[l], base[r + 1] - base[l + 1], base[r + 2] - base[l + 2])
          _c.crossVectors(_a, _b).normalize()
        }
        for (let j = lo; j <= hi; j++, v++) {
          const g = i * NU + j
          const d = v * 3
          let nx = outerN[g * 3]
          let ny = outerN[g * 3 + 1]
          let nz = outerN[g * 3 + 2]
          for (let c = 0; c < 3; c++) pos[d + c] = outer[g * 3 + c]
          lean(d, g, nx, ny, nz)
          if (this.facet) {
            const w = Math.min(1, roll[g] * 3)
            nx = _c.x + (nx - _c.x) * w
            ny = _c.y + (ny - _c.y) * w
            nz = _c.z + (nz - _c.z) * w
            const len = Math.hypot(nx, ny, nz) || 1
            nx /= len
            ny /= len
            nz /= len
          }
          nor[d] = nx
          nor[d + 1] = ny
          nor[d + 2] = nz
        }
      }
    }
    for (let g = 0; g < G; g++) {
      const d = (outerVerts + g) * 3
      for (let c = 0; c < 3; c++) {
        pos[d + c] = inner[g * 3 + c]
        nor[d + c] = -baseN[g * 3 + c]
      }
      lean(d, g, -baseN[g * 3], -baseN[g * 3 + 1], -baseN[g * 3 + 2])
    }
    for (let k = 0; k < L; k++) {
      const g = this.loop[k]
      for (let e = 0; e < 2; e++) {
        const src = e === 0 ? outer : inner
        const d = (outerVerts + G + k * 2 + e) * 3
        for (let c = 0; c < 3; c++) {
          pos[d + c] = src[g * 3 + c]
          nor[d + c] = this.loopDir[k * 3 + c]
        }
        const s = e === 0 ? 1 : -1
        lean(d, g, s * baseN[g * 3], s * baseN[g * 3 + 1], s * baseN[g * 3 + 2])
      }
    }

    const la = this.labelAt * 3
    this.anchor.set(outer[la], outer[la + 1], outer[la + 2])
    this.anchorNormal.set(outerN[la], outerN[la + 1], outerN[la + 2])

    const geo = this.geometry
    geo.attributes.position.needsUpdate = true
    geo.attributes.normal.needsUpdate = true
    geo.attributes.onormal.needsUpdate = true

    // cheap bounding sphere so picking and culling keep working
    const sphere = geo.boundingSphere as Sphere
    sphere.center.set(0, 0, 0)
    const count = N * M
    for (let k = 0; k < count; k++) sphere.center.add(_a.set(ctrl[k * C], ctrl[k * C + 1], ctrl[k * C + 2]))
    sphere.center.multiplyScalar(1 / count)
    let rad = 0
    let thick = 0
    for (let k = 0; k < count; k++) {
      rad = Math.max(rad, sphere.center.distanceTo(_a.set(ctrl[k * C], ctrl[k * C + 1], ctrl[k * C + 2])))
      thick = Math.max(thick, ctrl[k * C + 3])
    }
    sphere.radius = (rad + thick * hs) * 1.15
  }

  dispose() {
    this.geometry.dispose()
  }
}
