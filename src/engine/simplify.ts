import type { SolidMesh } from './types'

/*
 * Mesh simplification: quadric error edge collapse (Garland & Heckbert), collapsing
 * each edge onto one of its two ends.
 *
 * The sculpted bones come out of the mesher with an even, fine grid of triangles - far
 * more than a smooth bone needs. Collapsing the edges where the surface is nearly flat,
 * and keeping them where it bends, gives the same shape from a fraction of the
 * triangles. Every kept vertex is an original one, so its normal (taken from the
 * distance field) stays exact.
 */

/** Keep about `keep` of the triangles (never fewer than `min`). */
export function simplify(mesh: SolidMesh, keep: number, min = 600): SolidMesh {
  const P = mesh.position
  const V = P.length / 3
  const F0 = mesh.index.length / 3
  const target = Math.max(min, Math.round(F0 * keep))
  if (F0 <= target) return mesh

  const faces = Int32Array.from(mesh.index)
  const faceAlive = new Uint8Array(F0).fill(1)
  let alive = F0

  // the faces round every vertex
  const around: number[][] = Array.from({ length: V }, () => [])
  for (let f = 0; f < F0; f++) for (let c = 0; c < 3; c++) around[faces[f * 3 + c]].push(f)

  // each vertex's quadric: the sum of its faces' planes (area weighted), as 10 numbers
  const Q = new Float64Array(V * 10)
  const normalOf = (f: number, out: number[]) => {
    const a = faces[f * 3] * 3
    const b = faces[f * 3 + 1] * 3
    const c = faces[f * 3 + 2] * 3
    const ux = P[b] - P[a]
    const uy = P[b + 1] - P[a + 1]
    const uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a]
    const vy = P[c + 1] - P[a + 1]
    const vz = P[c + 2] - P[a + 2]
    out[0] = uy * vz - uz * vy
    out[1] = uz * vx - ux * vz
    out[2] = ux * vy - uy * vx
  }
  const n = [0, 0, 0]
  for (let f = 0; f < F0; f++) {
    normalOf(f, n)
    const len = Math.hypot(n[0], n[1], n[2])
    if (len < 1e-14) continue
    const nx = n[0] / len
    const ny = n[1] / len
    const nz = n[2] / len
    const a = faces[f * 3] * 3
    const d = -(nx * P[a] + ny * P[a + 1] + nz * P[a + 2])
    const w = len * 0.5
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d]
    for (let c = 0; c < 3; c++) {
      const o = faces[f * 3 + c] * 10
      for (let k = 0; k < 10; k++) Q[o + k] += q[k] * w
    }
  }
  /** The error of moving the quadrics of a and b to the position of vertex p. */
  const cost = (a: number, b: number, p: number) => {
    const x = P[p * 3]
    const y = P[p * 3 + 1]
    const z = P[p * 3 + 2]
    let e = 0
    for (const v of [a, b]) {
      const q = v * 10
      e +=
        Q[q] * x * x +
        2 * Q[q + 1] * x * y +
        2 * Q[q + 2] * x * z +
        2 * Q[q + 3] * x +
        Q[q + 4] * y * y +
        2 * Q[q + 5] * y * z +
        2 * Q[q + 6] * y +
        Q[q + 7] * z * z +
        2 * Q[q + 8] * z +
        Q[q + 9]
    }
    return e
  }

  // a binary heap of candidate collapses: [cost, from, to, from's version, to's version]
  const version = new Int32Array(V)
  const hCost: number[] = []
  const hFrom: number[] = []
  const hTo: number[] = []
  const hVf: number[] = []
  const hVt: number[] = []
  const swap = (i: number, j: number) => {
    for (const h of [hCost, hFrom, hTo, hVf, hVt]) {
      const t = h[i]
      h[i] = h[j]
      h[j] = t
    }
  }
  const push = (c: number, from: number, to: number) => {
    let i = hCost.length
    hCost.push(c)
    hFrom.push(from)
    hTo.push(to)
    hVf.push(version[from])
    hVt.push(version[to])
    while (i > 0) {
      const p = (i - 1) >> 1
      if (hCost[p] <= hCost[i]) break
      swap(i, p)
      i = p
    }
  }
  const pop = () => {
    const last = hCost.length - 1
    swap(0, last)
    const r = [hCost.pop()!, hFrom.pop()!, hTo.pop()!, hVf.pop()!, hVt.pop()!]
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const rr = l + 1
      let m = i
      if (l < hCost.length && hCost[l] < hCost[m]) m = l
      if (rr < hCost.length && hCost[rr] < hCost[m]) m = rr
      if (m === i) break
      swap(i, m)
      i = m
    }
    return r
  }
  /** Offer the edge a-b, collapsing onto whichever end costs less. */
  const offer = (a: number, b: number) => {
    const ca = cost(a, b, b)
    const cb = cost(a, b, a)
    if (ca <= cb) push(ca, a, b)
    else push(cb, b, a)
  }

  const neighbours = (v: number, out: Set<number>) => {
    out.clear()
    for (const f of around[v]) {
      if (!faceAlive[f]) continue
      for (let c = 0; c < 3; c++) {
        const u = faces[f * 3 + c]
        if (u !== v) out.add(u)
      }
    }
    return out
  }

  const nbA = new Set<number>()
  const nbB = new Set<number>()
  for (let v = 0; v < V; v++) for (const u of neighbours(v, nbA)) if (u > v) offer(v, u)

  const removed = new Uint8Array(V)
  const before = [0, 0, 0]
  const after = [0, 0, 0]
  while (alive > target && hCost.length) {
    const [, from, to, vf, vt] = pop()
    if (removed[from] || removed[to] || vf !== version[from] || vt !== version[to]) continue

    // the faces shared by the edge disappear; the others of `from` move onto `to`
    const shared: number[] = []
    const moving: number[] = []
    for (const f of around[from]) {
      if (!faceAlive[f]) continue
      let hasTo = false
      for (let c = 0; c < 3; c++) if (faces[f * 3 + c] === to) hasTo = true
      if (hasTo) shared.push(f)
      else moving.push(f)
    }
    if (shared.length === 0) continue

    // keep the surface a clean sheet: the ends may only share the edge's own opposite corners
    neighbours(from, nbA)
    neighbours(to, nbB)
    let common = 0
    for (const u of nbA) if (nbB.has(u)) common++
    if (common !== shared.length) continue

    // never fold a triangle over
    let flips = false
    for (const f of moving) {
      normalOf(f, before)
      for (let c = 0; c < 3; c++) if (faces[f * 3 + c] === from) faces[f * 3 + c] = to
      normalOf(f, after)
      for (let c = 0; c < 3; c++) if (faces[f * 3 + c] === to) faces[f * 3 + c] = from
      const lb = Math.hypot(before[0], before[1], before[2])
      const la = Math.hypot(after[0], after[1], after[2])
      if (la < 1e-14 || (before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) / (lb * la) < 0.3) {
        flips = true
        break
      }
    }
    if (flips) continue

    // collapse
    for (const f of shared) {
      faceAlive[f] = 0
      alive--
    }
    for (const f of moving) {
      for (let c = 0; c < 3; c++) if (faces[f * 3 + c] === from) faces[f * 3 + c] = to
      around[to].push(f)
    }
    around[from] = []
    around[to] = around[to].filter((f) => faceAlive[f])
    removed[from] = 1
    for (let k = 0; k < 10; k++) Q[to * 10 + k] += Q[from * 10 + k]
    version[to]++
    for (const u of neighbours(to, nbA)) offer(to, u)
  }

  // keep only the vertices still in use, renumbered
  const remap = new Int32Array(V).fill(-1)
  let count = 0
  const index: number[] = []
  for (let f = 0; f < F0; f++) {
    if (!faceAlive[f]) continue
    for (let c = 0; c < 3; c++) {
      const v = faces[f * 3 + c]
      if (remap[v] < 0) remap[v] = count++
      index.push(remap[v])
    }
  }
  const position = new Float32Array(count * 3)
  const normal = new Float32Array(count * 3)
  for (let v = 0; v < V; v++) {
    const r = remap[v]
    if (r < 0) continue
    for (let c = 0; c < 3; c++) {
      position[r * 3 + c] = P[v * 3 + c]
      normal[r * 3 + c] = mesh.normal[v * 3 + c]
    }
  }
  return { position, normal, index: Uint32Array.from(index) }
}
