import { BufferAttribute, BufferGeometry, Matrix4, Sphere, Vector3 } from 'three'
import type { Form, FrameGetter, SolidDef, SolidMesh, SweepDef } from './types'

const _m = new Matrix4()
const _v = new Vector3()

/**
 * A form that is sculpted once and then only carried around: a bone whose shape
 * never changes, built at full resolution (see `sdf.ts`) and glued to one frame.
 *
 * It has no plane lines of its own - it reads by its silhouette, its shading and
 * the ink outline - and it looks the same in the reference and the plaster model.
 */
export class Solid implements Form {
  readonly def: SweepDef
  readonly geometry = new BufferGeometry()
  readonly anchor = new Vector3()
  readonly anchorNormal = new Vector3(0, 0, 1)

  private readonly solid: SolidDef
  private readonly base: Float32Array
  private readonly baseN: Float32Array
  private readonly pos: Float32Array
  private readonly nor: Float32Array
  private readonly last = new Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  private readonly center = new Vector3()
  private radius = 0

  constructor(def: SweepDef, solid: SolidDef) {
    this.def = def
    this.solid = solid
    const mesh = solid.mesh()
    const [ox, oy, oz] = solid.offset ?? [0, 0, 0]
    const [sx, sy, sz] = solid.scale ?? [1, 1, 1]
    const V = mesh.position.length / 3
    this.base = new Float32Array(mesh.position)
    for (let v = 0; v < V; v++) {
      this.base[v * 3] = this.base[v * 3] * sx + ox
      this.base[v * 3 + 1] = this.base[v * 3 + 1] * sy + oy
      this.base[v * 3 + 2] = this.base[v * 3 + 2] * sz + oz
    }
    this.baseN = mesh.normal
    if (solid.scale) {
      // a stretched surface's normals lean the other way
      this.baseN = new Float32Array(mesh.normal)
      for (let v = 0; v < V; v++) {
        const nx = this.baseN[v * 3] / sx
        const ny = this.baseN[v * 3 + 1] / sy
        const nz = this.baseN[v * 3 + 2] / sz
        const l = Math.hypot(nx, ny, nz) || 1
        this.baseN[v * 3] = nx / l
        this.baseN[v * 3 + 1] = ny / l
        this.baseN[v * 3 + 2] = nz / l
      }
    }
    this.pos = new Float32Array(V * 3)
    this.nor = new Float32Array(V * 3)

    // no plane lines unless the mesh brings its own (every vertex mid-band otherwise; see the fill shader)
    const coord = new Float32Array(V * 2).fill(0.5)
    if (mesh.ink) coord.set(mesh.ink)
    const g = this.geometry
    g.setAttribute('position', new BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new BufferAttribute(this.nor, 3))
    // the outline pushes out along the true normal: the surface is smooth, so the hull is too
    g.setAttribute('onormal', g.getAttribute('normal'))
    g.setAttribute('coord', new BufferAttribute(coord, 2))
    g.setIndex(new BufferAttribute(mesh.index, 1))
    g.boundingSphere = new Sphere()

    // a sphere round the resting mesh, moved along with it
    let lo = [Infinity, Infinity, Infinity]
    let hi = [-Infinity, -Infinity, -Infinity]
    for (let v = 0; v < V; v++) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], this.base[v * 3 + a])
        hi[a] = Math.max(hi[a], this.base[v * 3 + a])
      }
    }
    if (V === 0) lo = hi = [0, 0, 0]
    this.center.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2)
    this.radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2
    this.anchor.copy(this.center)
  }

  setRest() {}

  update(frames: FrameGetter) {
    _m.copy(frames(this.solid.frame))
    // the shape never changes, so only a moved frame needs new numbers
    if (_m.equals(this.last)) return
    this.last.copy(_m)
    const e = _m.elements
    const { base, baseN, pos, nor } = this
    const V = base.length / 3
    for (let v = 0; v < V; v++) {
      const o = v * 3
      const x = base[o]
      const y = base[o + 1]
      const z = base[o + 2]
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12]
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      const nx = baseN[o]
      const ny = baseN[o + 1]
      const nz = baseN[o + 2]
      // frames are rigid, so the normals turn with the same rotation
      const rx = e[0] * nx + e[4] * ny + e[8] * nz
      const ry = e[1] * nx + e[5] * ny + e[9] * nz
      const rz = e[2] * nx + e[6] * ny + e[10] * nz
      const l = Math.hypot(rx, ry, rz) || 1
      nor[o] = rx / l
      nor[o + 1] = ry / l
      nor[o + 2] = rz / l
    }
    const g = this.geometry
    g.attributes.position.needsUpdate = true
    g.attributes.normal.needsUpdate = true
    const sphere = g.boundingSphere as Sphere
    sphere.center.copy(_v.copy(this.center).applyMatrix4(_m))
    sphere.radius = this.radius
    this.anchor.copy(sphere.center)
  }

  dispose() {
    this.geometry.dispose()
  }
}

const mirrors = new WeakMap<() => SolidMesh, () => SolidMesh>()

/**
 * The same solid on the other side of the body (x -> -x): the mesh is mirrored once
 * (and its triangles turned round so they still face out), the frame is renamed.
 */
export function mirrorSolid(solid: SolidDef, mapFrame: (f: string) => string): SolidDef {
  let mesh = mirrors.get(solid.mesh)
  if (!mesh) {
    let cached: SolidMesh | null = null
    const src = solid.mesh
    mesh = () => {
      if (!cached) {
        const m = src()
        const position = new Float32Array(m.position)
        const normal = new Float32Array(m.normal)
        for (let i = 0; i < position.length; i += 3) {
          position[i] = -position[i]
          normal[i] = -normal[i]
        }
        const index = new Uint32Array(m.index)
        for (let i = 0; i < index.length; i += 3) {
          const t = index[i + 1]
          index[i + 1] = index[i + 2]
          index[i + 2] = t
        }
        cached = { position, normal, index, ink: m.ink }
      }
      return cached
    }
    mirrors.set(solid.mesh, mesh)
  }
  const o = solid.offset
  return { ...solid, frame: mapFrame(solid.frame), mesh, offset: o ? [-o[0], o[1], o[2]] : undefined }
}
