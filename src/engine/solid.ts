import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three'
import type { Object3D } from 'three'
import type { Form, FrameGetter, SolidDef, SolidMesh, SweepDef } from './types'

/**
 * A form that is sculpted once and then only carried around: a bone whose shape
 * never changes, glued to one frame.
 *
 * Its mesh is built off the main thread and arrives a little later (see
 * `engine/meshes.ts`); until then it is not drawn at all (`loaded`). Once there, the geometry
 * never changes again: the frame moves it as a whole, through the matrix of the
 * objects that draw it (`attach`), so posing costs nothing per vertex.
 *
 * It has no plane lines of its own - it reads by its silhouette, its shading and
 * the ink outline - and it looks the same in the reference and the plaster model.
 */
export class Solid implements Form {
  readonly def: SweepDef
  readonly geometry = new BufferGeometry()
  readonly anchor = new Vector3()
  readonly anchorNormal = new Vector3(0, 0, 1)
  /** Mesh space -> rig space, for the current pose. */
  readonly matrix = new Matrix4()
  /** Resolves when the mesh has arrived and been filled in. */
  readonly ready: Promise<void>

  private readonly solid: SolidDef
  /** Mesh space -> the frame's space: mirrored, slid and stretched. */
  private readonly local: Matrix4
  private readonly center = new Vector3()
  private readonly objects = new Set<Object3D>()
  private disposed = false
  loaded = false

  constructor(def: SweepDef, solid: SolidDef) {
    this.def = def
    this.solid = solid
    const [ox, oy, oz] = solid.offset ?? [0, 0, 0]
    const [sx, sy, sz] = solid.scale ?? [1, 1, 1]
    this.local = new Matrix4()
      .makeScale(solid.mirror ? -1 : 1, 1, 1)
      .multiply(new Matrix4().makeTranslation(ox, oy, oz))
      .multiply(new Matrix4().makeScale(sx, sy, sz))

    const mesh = solid.mesh.current()
    if (mesh) {
      this.fill(mesh)
      this.ready = Promise.resolve()
    } else {
      this.ready = solid.mesh.load().then((m) => {
        if (!this.disposed) this.fill(m)
      })
    }
  }

  private fill(mesh: SolidMesh) {
    const V = mesh.position.length / 3
    // no plane lines unless the mesh brings its own (every vertex mid-band otherwise; see the fill shader)
    const coord = new Float32Array(V * 2).fill(0.5)
    if (mesh.ink) coord.set(mesh.ink)
    const g = this.geometry
    const normal = new BufferAttribute(mesh.normal, 3)
    g.setAttribute('position', new BufferAttribute(mesh.position, 3))
    g.setAttribute('normal', normal)
    // the outline pushes out along the true normal: the surface is smooth, so the hull is too
    g.setAttribute('onormal', normal)
    g.setAttribute('coord', new BufferAttribute(coord, 2))
    g.setIndex(new BufferAttribute(mesh.index, 1))
    g.computeBoundingSphere()
    this.center.copy(g.boundingSphere!.center)
    this.anchor.copy(this.center).applyMatrix4(this.matrix)
    this.loaded = true
  }

  /** Draw through this object: it is moved with the form (its own matrix is taken over). */
  attach(obj: Object3D) {
    obj.matrixAutoUpdate = false
    obj.matrix.copy(this.matrix)
    obj.matrixWorldNeedsUpdate = true
    this.objects.add(obj)
  }

  detach(obj: Object3D) {
    this.objects.delete(obj)
  }

  setRest() {}

  update(frames: FrameGetter) {
    this.matrix.multiplyMatrices(frames(this.solid.frame), this.local)
    for (const obj of this.objects) {
      obj.matrix.copy(this.matrix)
      obj.matrixWorldNeedsUpdate = true
    }
    this.anchor.copy(this.center).applyMatrix4(this.matrix)
  }

  dispose() {
    this.disposed = true
    this.geometry.dispose()
  }
}

/** The same solid on the other side of the body (x -> -x), on the matching frame. */
export function mirrorSolid(solid: SolidDef, mapFrame: (f: string) => string): SolidDef {
  return { ...solid, frame: mapFrame(solid.frame), mirror: !solid.mirror }
}
