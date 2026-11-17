import { bar, brick, clip, egg, fuse, mirrored, ring, rod, sculpted, slab, squash, unit } from '../engine/sdf'
import type { Field, Shape } from '../engine/sdf'
import type { SolidDef, Vec3 } from '../engine/types'

/*
 * The bones of the trunk, sculpted like the pelvis and the leg.
 *   +X = the figure's left, +Y = up, +Z = front; the origin sits between the hip joints.
 *
 *   rib cage   twelve ribs a side on the thoracic spine, the breastbone in front
 *              (frame 'ribs'). The ribs slope down from the spine; the cartilages of the
 *              lower ones climb back up to the breastbone and close the arch under it.
 *   lumbar     five separate vertebrae, each riding its own share of the waist bend
 *   neck       seven vertebrae up into the base of the head (frame 'ribs')
 *   head       a carved mannequin head - planes, no skull (frame 'ribs')
 *   collarbone an S-curved strut (frames 'clavL' / 'clavR')
 *   blade      the shoulder blade: a thin triangle with its ridge (spine), the shelf
 *              over the joint (acromion), the hook in front (coracoid) and the socket
 *              (frames 'scapL' / 'scapR')
 * Shoulder pieces are modelled on the left and mirrored by the rig.
 */

/*
 * The cage seen from above at a few heights (outer sizes, as the muscles see it):
 *   y, back z, half width, half depth
 */
const CAGE: [number, number, number, number][] = [
  [5.16, -0.8, 0.58, 0.42],
  [4.8, -0.86, 1.12, 0.78],
  [4.15, -0.94, 1.34, 0.94],
  [3.6, -0.97, 1.38, 0.98],
  [3.25, -0.97, 1.39, 0.97],
  [2.85, -0.96, 1.36, 0.94],
  [2.45, -0.94, 1.24, 0.89],
  [2.15, -0.9, 1.12, 0.82],
  [1.98, -0.87, 1.0, 0.75],
]

/**
 * A point on the cage's outline at height y, `phi` radians round it from the back
 * (pi / 2 = the side, pi = the front), `inset` in from the outer surface.
 */
function onCage(y: number, phi: number, inset: number): Vec3 {
  let i = 0
  while (i < CAGE.length - 2 && y < CAGE[i + 1][0]) i++
  const a = CAGE[i]
  const b = CAGE[i + 1]
  const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0])))
  const at = (k: number) => a[k] + (b[k] - a[k]) * t
  const [back, w, d] = [at(1), at(2), at(3)]
  // a slightly boxy oval, like the real cage
  const s = Math.sin(phi)
  const c = Math.cos(phi)
  const x = (w - inset) * Math.pow(Math.abs(s), 0.78)
  const z = back + d - (d - inset) * Math.sign(c) * Math.pow(Math.abs(c), 0.78)
  return [x, y, z]
}

/** The breastbone's centre line: z at height y. */
const sternumZ = (y: number) => (y > 4.1 ? 0.9 + ((y - 4.1) / 0.82) * -0.3 : 0.9 + ((4.1 - y) / 0.7) * 0.1)

/*
 * Each rib: how far its front end (where bone turns into cartilage) drops below its
 * head at the spine, and how far round it goes (degrees from the back). Ribs 1-7 then
 * join the breastbone at height `sternum`; 8-10 join the cartilage above; 11-12 float.
 */
const RIBS: { drop: number; at: number; sternum?: number }[] = [
  { drop: 0.16, at: 132, sternum: 4.86 },
  { drop: 0.4, at: 138, sternum: 4.62 },
  { drop: 0.55, at: 141, sternum: 4.38 },
  { drop: 0.7, at: 141, sternum: 4.13 },
  { drop: 0.82, at: 139, sternum: 3.88 },
  { drop: 0.92, at: 137, sternum: 3.65 },
  { drop: 1.0, at: 134, sternum: 3.45 },
  { drop: 1.02, at: 128 },
  { drop: 1.0, at: 120 },
  { drop: 0.95, at: 112 },
  { drop: 0.62, at: 84 },
  { drop: 0.42, at: 64 },
]
/** Height of rib i's head at the spine (and of its vertebra). */
const ribHead = (i: number) => 5.18 - 0.245 * i

/** Landmarks on the trunk's bones. */
export const TRUNK = {
  /** Top of the breastbone (jugular notch): the neck straps. */
  sternumTop: [0, 4.94, 0.6] as Vec3,
  /** Bottom of the breastbone (xiphoid): the top of the abs. */
  xiphoid: [0, 3.36, 0.98] as Vec3,
}

function ribCageShape(): Shape {
  const parts: Shape[] = []
  // where each cartilage runs, so the lower ribs can join the one above
  const cartilage: [Vec3, Vec3][] = []
  RIBS.forEach((rib, i) => {
    const yb = ribHead(i)
    const yj = yb - rib.drop
    const phi0 = (25 * Math.PI) / 180
    const phiJ = (rib.at * Math.PI) / 180
    // from the side of the vertebra, back past the transverse process, then round the cage
    const pts: Vec3[] = [
      [0.13, yb + 0.02, -0.6],
      [0.3, yb - 0.01, -0.8],
    ]
    const n = 7
    for (let k = 0; k <= n; k++) {
      const t = k / n
      // the rib falls fastest near the spine and levels out towards the front
      const y = yb + (yj - yb) * (1 - (1 - t) * (1 - t))
      pts.push(onCage(y, phi0 + (phiJ - phi0) * t, 0.06))
    }
    const r = i === 0 ? 0.055 : i >= 10 ? 0.045 : 0.05
    const radii = pts.map((_, k) => (i >= 10 && k === pts.length - 1 ? 0.025 : r))
    parts.push(...rod(pts, radii))

    const end = pts[pts.length - 1]
    let to: Vec3 | null = null
    if (rib.sternum !== undefined) {
      to = [Math.max(0.08, 0.22 - 0.02 * i), rib.sternum, sternumZ(rib.sternum) - 0.02]
    } else if (i <= 9) {
      // joins the cartilage of the rib above, part-way along: this edge is the rib arch
      const [a, b] = cartilage[i - 1]
      const f = i === 7 ? 0.55 : 0.6
      to = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
    }
    if (to) {
      cartilage[i] = [end, to]
      parts.push(bar(end, to, 0.042, 0.038))
    }

    // the vertebra this rib hangs from
    const yv = yb - 0.04
    const g = i / 11
    parts.push(
      egg([0, yv, -0.48], [0.12 + 0.07 * g, 0.095, 0.11 + 0.06 * g]),
      bar([0, yv, -0.6], [0, yv - 0.16, -0.92], 0.035, 0.03),
      bar([0.06, yv, -0.62], [0.3, yv, -0.78], 0.035, 0.03),
    )
  })

  // the breastbone: handle, blade and the little tip, sloping forward as it goes down
  const up: Vec3 = [0, 0.965, -0.26]
  parts.push(
    brick([0, 4.74, 0.63], [0.22, 0.17, 0.05], 0.045, up),
    brick([0, 4.06, 0.86], [0.15, 0.5, 0.045], 0.04, up),
    egg(TRUNK.xiphoid, [0.06, 0.1, 0.03], up),
  )
  return mirrored(fuse(0.03, parts))
}

/* ───────────────────────── lower back ───────────────────────── */

/** The five lumbar vertebrae: height, and the share of the waist bend each one rides. */
const LUMBAR: [number, number][] = [
  [2.22, 0.64],
  [1.95, 0.47],
  [1.68, 0.3],
  [1.42, 0.14],
  [1.17, 0],
]

function lumbarShape(y: number): Shape {
  return mirrored(
    fuse(0.04, [
      egg([0, y, -0.45], [0.23, 0.11, 0.17]),
      // the arch, its flat hatchet of a spine, and the long side processes
      bar([0.06, y + 0.02, -0.56], [0, y, -0.66], 0.05, 0.05),
      squash(bar([0, y, -0.6], [0, y - 0.05, -0.88], 0.07, 0.065), [0, y, -0.74], [0.45, 1, 1]),
      bar([0.12, y, -0.56], [0.42, y + 0.02, -0.6], 0.035, 0.03),
      egg([0.12, y + 0.08, -0.62], [0.05, 0.05, 0.05]),
    ]),
  )
}

/* ───────────────────────── neck ───────────────────────── */

/*
 * The seven neck vertebrae, from the top of the chest spine up into the base of the
 * head: small blocks stacked in a gentle forward curve, the lowest with the long spine
 * you can feel at the base of the neck, the top two the ring (atlas) and the peg (axis)
 * the head turns on.  y, z of each body, and how far back its spine reaches.
 */
const NECK: [number, number, number][] = [
  [5.36, -0.44, -0.84],
  [5.56, -0.38, -0.66],
  [5.75, -0.33, -0.6],
  [5.94, -0.3, -0.58],
  [6.12, -0.29, -0.58],
]

function cervicalShape(): Shape {
  const parts: Shape[] = []
  NECK.forEach(([y, z, back], i) => {
    parts.push(
      egg([0, y, z], [0.15 - 0.008 * i, 0.075, 0.12]),
      bar([0, y, z - 0.1], [0, y - 0.07 - (i === 0 ? 0.08 : 0), back], 0.035, 0.03),
      bar([0.08, y, z - 0.04], [0.24, y + 0.01, z - 0.04], 0.03, 0.025),
    )
  })
  // the axis, with its peg pointing up through the ring above, and its heavy spine
  parts.push(
    egg([0, 6.3, -0.29], [0.13, 0.1, 0.11]),
    bar([0, 6.3, -0.28], [0, 6.48, -0.27], 0.045, 0.035),
    bar([0, 6.28, -0.38], [0, 6.2, -0.62], 0.05, 0.04),
  )
  // the atlas: a ring with two thick sides and wide wings, the head sits on it
  parts.push(ring([0, 6.5, -0.33], [0, 1, 0], 0.16, 0.035), egg([0.15, 6.5, -0.3], [0.06, 0.05, 0.07]), bar([0.15, 6.5, -0.32], [0.3, 6.5, -0.33], 0.04, 0.035))
  return mirrored(fuse(0.03, parts))
}

/* ───────────────────────── head ───────────────────────── */


/*
 * The head: not a skull and no features - a chiselled mannequin head, like a block an
 * artist carves to find the big planes. A round cranium and a jaw mass, cut by flat
 * planes (each a direction and a point on it, left side), and the creases between the
 * planes inked so it reads like a drawing. It sits on the ring at the top of the neck.
 */
const HEAD_PLANES: [Vec3, Vec3][] = [
  [[1, 0, 0], [0.55, 0, 0]], // side of the head (temple)
  [[0, 0.1, 1], [0, 6.9, 0.8]], // face
  [[0, 0.55, 0.83], [0, 7.55, 0.66]], // forehead, breaking back at the brow
  [[0, 1, 0.12], [0, 7.88, 0]], // top
  [[0.68, 0.73, 0], [0.42, 7.66, 0]], // crown, at the side
  [[0.6, 0.4, 0.69], [0.42, 7.45, 0.55]], // corner of the forehead
  [[0.62, -0.05, 0.78], [0.43, 6.85, 0.6]], // cheek
  [[0.74, -0.5, 0.45], [0.44, 6.45, 0.32]], // jaw, narrowing to the chin
  [[0, -0.55, 0.83], [0, 6.22, 0.68]], // chin
  [[0.5, -0.5, 0.7], [0.18, 6.22, 0.62]], // corner of the chin
  [[0, -1, 0.3], [0, 6.2, 0.4]], // under the jaw
  [[0, -0.72, -0.7], [0, 6.48, -0.36]], // under the back of the head
  [[0, 0.15, -1], [0, 7.1, -0.68]], // back
  [[0.62, 0.2, -0.76], [0.42, 7.15, -0.5]], // back corner
  [[0, 0.7, -0.72], [0, 7.7, -0.48]], // back of the crown
]

/** The mass the head is carved from - generous, so the planes cut deep and meet in straight edges. */
const headBase = (): Shape => fuse(0.18, [egg([0, 7.16, 0.02], [0.76, 0.9, 0.96]), egg([0, 6.6, 0.3], [0.6, 0.62, 0.7])])

/** Each plane as a field: positive on its outer side. */
const headPlaneFields = (): Field[] =>
  HEAD_PLANES.map(([n, at]) => {
    const u = unit(n)
    const d = u[0] * at[0] + u[1] * at[1] + u[2] * at[2]
    return (x: number, y: number, z: number) => u[0] * x + u[1] * y + u[2] * z - d
  })

function headShape(): Shape {
  let h = headBase()
  for (const f of headPlaneFields()) h = clip(h, 0.02, f)
  return mirrored(h)
}

/** The fields the head is carved from, for inking its edges (on both halves). */
const headFacets = (): Field[] => [headBase().f, ...headPlaneFields()].map((f) => (x: number, y: number, z: number) => f(Math.abs(x), y, z))

/* ───────────────────────── shoulder ───────────────────────── */

function clavicleShape(): Shape {
  // an S: bowed forward near the breastbone, backward near the shoulder
  return fuse(
    0.03,
    rod(
      [
        [0.13, 4.92, 0.62],
        [0.45, 4.96, 0.68],
        [0.85, 4.99, 0.64],
        [1.3, 5.03, 0.42],
        [1.62, 5.03, 0.16],
        [1.82, 5.0, -0.02],
      ],
      [0.085, 0.07, 0.065, 0.065, 0.075, 0.08],
    ),
  )
}

/** The shoulder joint (centre of the socket) at rest, in the trunk's space. */
export const SHOULDER: Vec3 = [1.85, 4.55, -0.05]

/** The blade's three corners: by the spine at the top, at the socket, and the tip at the bottom. */
const BLADE: Record<'top' | 'socket' | 'tip', Vec3> = {
  top: [0.66, 4.78, -0.98],
  socket: [1.4, 4.5, -0.55],
  tip: [0.86, 3.38, -0.92],
}

function scapulaShape(): Shape {
  const { top, socket, tip } = BLADE
  return fuse(0.035, [
    // the thin blade, with thicker borders
    slab(top, socket, tip, 0.022),
    bar(top, tip, 0.035, 0.035),
    bar(socket, tip, 0.055, 0.04),
    bar(top, [1.25, 4.62, -0.62], 0.028, 0.025),
    // the ridge across the back (spine of the scapula), standing up off the blade
    slab([0.68, 4.52, -0.98], [1.3, 4.8, -0.86], [1.32, 4.64, -0.62], 0.022),
    slab([1.3, 4.8, -0.86], [1.68, 4.92, -0.45], [1.32, 4.64, -0.62], 0.022),
    ...rod(
      [
        [0.68, 4.52, -1.0],
        [1.3, 4.8, -0.88],
        [1.7, 4.94, -0.44],
      ],
      [0.03, 0.055, 0.05],
    ),
    // the shelf over the shoulder joint (acromion), where the collarbone meets it
    egg([1.8, 4.97, -0.18], [0.12, 0.045, 0.17]),
    // the socket on its short neck, and the hook that points forward under the collarbone
    bar(socket, [1.52, 4.53, -0.2], 0.08, 0.07),
    egg([1.53, 4.55, -0.16], [0.05, 0.15, 0.1]),
    ...rod(
      [
        [1.45, 4.62, -0.32],
        [1.55, 4.7, -0.05],
        [1.6, 4.66, 0.12],
      ],
      [0.05, 0.045, 0.04],
    ),
  ])
}

/* ───────────────────────── the parts ───────────────────────── */

const ribCageMesh = sculpted('ribcage', { field: () => ribCageShape().f, lo: [-1.45, 2.0, -1.02], hi: [1.45, 5.32, 1.12], step: 0.022, symmetric: true })
const lumbarMeshes = LUMBAR.map(([y]) =>
  sculpted(`lumbar/${y}`, { field: () => lumbarShape(y).f, lo: [-0.5, y - 0.2, -0.95], hi: [0.5, y + 0.2, -0.25], step: 0.016, symmetric: true }),
)
const clavicleMesh = sculpted('clavicle', { field: () => clavicleShape().f, lo: [0.0, 4.8, -0.15], hi: [1.95, 5.15, 0.8], step: 0.016 })
const scapulaMesh = sculpted('scapula', { field: () => scapulaShape().f, lo: [0.55, 3.25, -1.1], hi: [2.0, 5.08, 0.2], step: 0.016 })

const cervicalMesh = sculpted('cervical', { field: () => cervicalShape().f, lo: [-0.42, 5.2, -0.9], hi: [0.42, 6.62, -0.12], step: 0.014, symmetric: true })
const headMesh = sculpted('head', {
  field: () => headShape().f,
  facets: headFacets,
  lo: [-0.72, 6.0, -0.9],
  hi: [0.72, 7.98, 1.0],
  step: 0.016,
  symmetric: true,
})

export const ribCageSolid = (): SolidDef => ({ frame: 'ribs', mesh: ribCageMesh })
/** The neck vertebrae, riding with the rib cage. */
export const cervicalSolid = (): SolidDef => ({ frame: 'ribs', mesh: cervicalMesh })
/** The carved head, riding with the rib cage. */
export const headSolid = (): SolidDef => ({ frame: 'ribs', mesh: headMesh })
/** The lumbar vertebrae, each on its share of the waist bend ('w@k'). */
export const lumbarSolids = (): { id: string; solid: SolidDef }[] =>
  LUMBAR.map(([, k], i) => ({ id: `L${i + 1}`, solid: { frame: k === 0 ? 'pelvis' : `w@${k}`, mesh: lumbarMeshes[i] } }))
export const clavicleSolid = (frame: string, offset?: Vec3): SolidDef => ({ frame, mesh: clavicleMesh, offset })
export const scapulaSolid = (frame: string, offset?: Vec3): SolidDef => ({ frame, mesh: scapulaMesh, offset })
