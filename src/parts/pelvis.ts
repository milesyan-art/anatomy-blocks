import { baked2, bar, brick, carve, egg, fuse, mirrored, plug, polygon2, ring, rod, sculpted, smax, smoothLoop, unit } from '../engine/sdf'
import type { Field, Shape } from '../engine/sdf'
import type { SolidDef, SweepDef, Vec3 } from '../engine/types'

/*
 * The pelvis, shared by the torso and the leg.
 *
 * Built the way an artist constructs it, from a handful of simple forms fused into
 * one bone - not a medical model, but every landmark a muscle hangs from is there
 * and in the right place, so the muscles have something definite to start from:
 *
 *   iliac blade   a curved fan on each side, rising from the hip socket. Its inside is
 *                 the shallow bowl you see from the front; its top edge is the crest.
 *   crest         a thick lip along the top of the blade, from the front point (ASIS)
 *                 round to the dimple points at the back (PSIS).
 *   hip socket    a deep cup (acetabulum) facing out, down and a little forward; the
 *                 ball of the thigh bone sits in it.
 *   pubis         two bars from the socket to the middle, where the two halves meet
 *                 in front (the symphysis). The upper bar, the lower bar and the
 *                 ischium ring the big oval hole (obturator foramen).
 *   ischium       a thick post under the socket ending in the sitting bone.
 *   sacrum        a curved wedge of five fused blocks, wedged between the two blades
 *                 at the back, with the little tail (coccyx) under it.
 *
 * Coordinates: the midline is x = 0, the hip sockets sit at x = +-0.8, y = 0;
 * +X = the figure's left, +Y = up, +Z = front. Modelled as the left half and mirrored.
 * `dx` slides the whole thing sideways for rigs with a different origin.
 */

/* ───────────────────────── the blade ───────────────────────── */

/*
 * The blade, seen from above at a few heights, is part of an oval wall:
 *   y, centre x, centre z, half width, half depth towards the front, half depth
 *   towards the back, half thickness of the blade.
 * Low down it is a narrow, thick neck over the socket; at the top it flares out wide
 * and curls round at the back towards the sacrum.
 */
const WALL: number[][] = [
  [-0.05, 0.4, -0.06, 0.3, 0.6, 0.55, 0.11],
  [0.35, 0.47, -0.08, 0.56, 0.98, 0.78, 0.075],
  [0.8, 0.45, -0.12, 0.84, 1.2, 0.85, 0.052],
  [1.25, 0.39, -0.17, 0.92, 1.06, 0.86, 0.045],
  [1.65, 0.36, -0.2, 0.96, 0.95, 0.86, 0.045],
]

let wcx = 0
let wcz = 0
let wrx = 0
let wrf = 0
let wrb = 0
let wt = 0
/** Look the wall up at height y (into the w* scratch numbers), smoothly from row to row. */
function wallAt(y: number) {
  const last = WALL.length - 1
  let i = 0
  while (i < last - 1 && y > WALL[i + 1][0]) i++
  const t = Math.min(1, Math.max(0, (y - WALL[i][0]) / (WALL[i + 1][0] - WALL[i][0])))
  const r0 = WALL[Math.max(i - 1, 0)]
  const r1 = WALL[i]
  const r2 = WALL[i + 1]
  const r3 = WALL[Math.min(i + 2, last)]
  // Catmull-Rom, so the blade bends without a crease at every row
  const t2 = t * t
  const t3 = t2 * t
  const w0 = 0.5 * (-t + 2 * t2 - t3)
  const w1 = 0.5 * (2 - 5 * t2 + 3 * t3)
  const w2 = 0.5 * (t + 4 * t2 - 3 * t3)
  const w3 = 0.5 * (-t2 + t3)
  const at = (k: number) => w0 * r0[k] + w1 * r1[k] + w2 * r2[k] + w3 * r3[k]
  wcx = at(1)
  wcz = at(2)
  wrx = at(3)
  wrf = at(4)
  wrb = at(5)
  wt = at(6)
}

/** Where the middle of the blade is (x) at height y and depth z. */
function wallX(y: number, z: number): number {
  wallAt(y)
  const r = z > wcz ? wrf : wrb
  const s = (z - wcz) / r
  return wcx + wrx * Math.sqrt(Math.max(0, 1 - s * s))
}

/** A point on the middle of the blade, `out` further out along x. */
const onBlade = (y: number, z: number, out = 0): Vec3 => [wallX(y, z) + out, y, z]

/*
 * The blade seen from the side (z, y), going round from the front point:
 * up and back along the crest, down the back edge, into the deep notch behind the
 * socket (greater sciatic notch), under the socket, and up the front edge past the
 * lower front knob (AIIS) and the little notch above it.
 */
const CREST: [number, number][] = [
  [0.52, 0.8], // front point (ASIS)
  [0.4, 1.0],
  [0.22, 1.18],
  [0.02, 1.32], // the outer bump of the crest, its widest point (iliac tubercle)
  [-0.2, 1.44],
  [-0.42, 1.51], // highest point
  [-0.62, 1.47],
  [-0.78, 1.33],
  [-0.9, 1.12],
  [-0.97, 0.9], // back point (PSIS)
]
const OUTLINE: [number, number][] = [
  ...CREST,
  [-0.97, 0.74],
  [-0.93, 0.6], // lower back point (PIIS)
  [-0.82, 0.48],
  [-0.68, 0.37],
  [-0.56, 0.24],
  [-0.44, 0.1],
  // under here the blade runs into the socket and the ischium, so its end never shows
  [-0.3, 0.06],
  [0.0, 0.12],
  [0.25, 0.1],
  [0.38, 0.18],
  [0.45, 0.26],
  [0.47, 0.34], // lower front knob (AIIS)
  [0.42, 0.44],
  [0.42, 0.56],
  [0.48, 0.7],
]
const outline = baked2(polygon2(smoothLoop(OUTLINE, 5)), -1.2, 0.75, -0.45, 1.8, 0.008)

const blade: Shape = {
  lo: [0.2, -0.3, -1.1],
  hi: [1.5, 1.65, 0.65],
  f: (x, y, z) => {
    wallAt(y)
    const qx = x - wcx
    const qz = z - wcz
    const rz = qz > 0 ? wrf : wrb
    // distance to an oval (close to the curve, which is all that matters here)
    const ax = qx / wrx
    const az = qz / rz
    const k0 = Math.sqrt(ax * ax + az * az)
    const k1 = Math.sqrt((ax * ax) / (wrx * wrx) + (az * az) / (rz * rz))
    const d = k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(wrx, rz)
    const shell = Math.abs(d) - wt
    // cut to the outline, and keep only the outer half of the oval
    return smax(smax(shell, outline(z, y), 0.03), wcx - x, 0.03)
  },
}

/* ───────────────────────── landmarks ───────────────────────── */

/** The hip socket: its centre, and the way it opens (out, down and a little forward). */
const SOCKET: Vec3 = [0.8, 0.03, 0.0]
const SOCKET_N = unit([0.74, -0.57, 0.35])

/**
 * Where the muscles hang from, in pelvis space (left side; x -> -x for the right).
 * Every one sits on the surface of the bone.
 */
export const PELVIS = {
  /** Front point of the hip bone (anterior superior iliac spine): sartorius, TFL, the groin line. */
  asis: onBlade(0.8, 0.54, 0.02),
  /** The smaller knob below it (anterior inferior iliac spine): rectus femoris. */
  aiis: onBlade(0.33, 0.5, 0.0),
  /** Outer lip of the crest, a hand's width behind the front point: TFL, gluteus medius, obliques. */
  crestFront: onBlade(1.12, 0.25, 0.04),
  /** Highest point of the crest, at the side. */
  crestTop: onBlade(1.51, -0.42, 0.04),
  /** Back part of the crest: lats, gluteus maximus. */
  crestBack: onBlade(1.36, -0.76, 0.04),
  /** Back point of the hip bone (posterior superior iliac spine) - the dimple. */
  psis: [0.5, 0.88, -1.02] as Vec3,
  /** Middle of the outer face of the blade: gluteus medius. */
  gluteal: onBlade(0.95, -0.15, 0.06),
  /** Centre of the hip socket. */
  socket: SOCKET,
  /** Pubic body, next to the joint in front: adductors. */
  pubis: [0.14, -0.2, 0.53] as Vec3,
  /** Pubic crest, on top of the joint: abs. */
  pubicCrest: [0.1, 0.0, 0.5] as Vec3,
  /** Sitting bone (ischial tuberosity): hamstrings, the deep part of the adductors. */
  ischium: [0.62, -0.7, -0.3] as Vec3,
  /** Back of the sacrum, between the dimples: gluteus maximus, erectors. */
  sacrum: [0.0, 0.62, -0.95] as Vec3,
  /** Tip of the tail bone: the lowest fibres of gluteus maximus. */
  coccyx: [0.0, -0.14, -0.82] as Vec3,
}

/** Height of the top of the crest at depth z, as seen from the side. */
export function crestHeight(z: number): number {
  // CREST runs from front to back, so z falls along it
  if (z >= CREST[0][0]) return CREST[0][1]
  for (let i = 0; i < CREST.length - 1; i++) {
    const [za, ya] = CREST[i]
    const [zb, yb] = CREST[i + 1]
    if (z >= zb) return ya + ((yb - ya) * (z - za)) / (zb - za)
  }
  return CREST[CREST.length - 1][1]
}

/**
 * A point `lift` out from the outer face of the blade (the side the glutes lie on),
 * at height y and depth z - for laying muscles flat on the bone.
 */
export function bladePoint(y: number, z: number, lift = 0): Vec3 {
  const x = wallX(y, z)
  // the oval's own outward direction at that point
  const qx = x - wcx
  const qz = z - wcz
  const rz = qz > 0 ? wrf : wrb
  let nx = qx / (wrx * wrx)
  let nz = qz / (rz * rz)
  const l = Math.sqrt(nx * nx + nz * nz) || 1
  nx /= l
  nz /= l
  const out = wt + lift
  return [x + nx * out, y, z + nz * out]
}

/* ───────────────────────── assembly ───────────────────────── */

/** The crest: a rounded lip along the top of the blade, thick at the front point and at the back. */
function crest(): Shape[] {
  const pts = CREST.map(([z, y]) => onBlade(y, z))
  const radii = [0.075, 0.062, 0.066, 0.074, 0.066, 0.062, 0.064, 0.072, 0.085, 0.09]
  return rod(pts, radii)
}

/** The left hip bone: blade, crest, socket, pubis and ischium. */
function hipBone(): Shape {
  const { asis, aiis } = PELVIS
  const ilium = fuse(0.05, [
    blade,
    ...crest(),
    // the front point juts forward; the knob below it is smaller
    egg([asis[0] - 0.02, asis[1] - 0.01, asis[2] + 0.01], [0.07, 0.085, 0.085], [0, 1, 0.3]),
    egg(aiis, [0.065, 0.075, 0.07]),
    // the wing of the sacrum on this side, locked into the back of the blade (sacroiliac joint)
    egg([0.4, 0.9, -0.72], [0.2, 0.17, 0.17], [0, 1, 0.5]),
    // the thick back of the blade, round the dimple point down to the lower back point
    ...rod(
      [
        [0.6, 1.12, -0.9],
        [0.52, 0.9, -0.97],
        [0.5, 0.62, -0.92],
        [0.56, 0.44, -0.8],
      ],
      [0.06, 0.095, 0.085, 0.07],
    ),
  ])

  const s = SOCKET
  const n = SOCKET_N
  const along = (d: number): Vec3 => [s[0] + n[0] * d, s[1] + n[1] * d, s[2] + n[2] * d]
  const socket = fuse(0.04, [
    // the solid round the cup, and its raised rim
    egg(along(-0.1), [0.31, 0.33, 0.31]),
    ring(along(0.06), n, 0.3, 0.065),
  ])

  const pubisIschium = fuse(0.06, [
    // upper bar of the pubis, from the socket to the middle
    ...rod(
      [
        [0.68, -0.06, 0.18],
        [0.45, -0.06, 0.33],
        [0.24, -0.08, 0.44],
      ],
      [0.1, 0.075, 0.08],
    ),
    // the pubic body: meets its twin at the midline
    brick([0.11, -0.2, 0.46], [0.12, 0.2, 0.08], 0.075, [0, 1, 0.12]),
    egg([0.24, -0.04, 0.5], [0.05, 0.045, 0.045]),
    // lower bar, down and back to the sitting bone
    ...rod(
      [
        [0.14, -0.36, 0.42],
        [0.3, -0.54, 0.24],
        [0.47, -0.66, 0.02],
        [0.56, -0.68, -0.16],
      ],
      [0.06, 0.055, 0.06, 0.08],
    ),
    // the ischium: a thick post from the socket down to the sitting bone
    ...rod(
      [
        [0.74, -0.06, -0.12],
        [0.68, -0.26, -0.22],
        [0.61, -0.5, -0.27],
      ],
      [0.15, 0.12, 0.11],
    ),
    egg([0.6, -0.6, -0.27], [0.1, 0.14, 0.12], [0.1, 1, -0.4]),
    // the little spine pointing in, behind the socket
    bar([0.6, -0.2, -0.36], [0.48, -0.26, -0.46], 0.05, 0.02),
  ])

  const bone = fuse(0.07, [ilium, socket, pubisIschium])
  // hollow out the cup, open towards the thigh
  return carve(bone, 0.035, [egg(s, [0.27, 0.27, 0.27]), plug(s, n, 0.27, 0.6)])
}

/** The sacrum and the tail bone, on the midline. */
function sacrum(): Shape {
  // a curved wedge running down and back, flat front to back, narrowing to the tail;
  // the soft bulges between its parts are the fused vertebrae
  return fuse(0.1, [
    egg([0, 0.9, -0.66], [0.42, 0.17, 0.2], [0, 1, 0.55]),
    egg([0, 0.7, -0.77], [0.36, 0.16, 0.15], [0, 1, 0.45]),
    egg([0, 0.5, -0.85], [0.27, 0.15, 0.12], [0, 1, 0.35]),
    egg([0, 0.32, -0.89], [0.18, 0.13, 0.09], [0, 1, 0.2]),
    egg([0, 0.16, -0.9], [0.11, 0.1, 0.07]),
    egg([0, 0.04, -0.88], [0.07, 0.065, 0.05]),
    egg([0, -0.06, -0.85], [0.05, 0.05, 0.04]),
    egg([0, -0.14, -0.8], [0.035, 0.04, 0.03]),
  ])
}

/**
 * The female pelvis is wider low down and a little narrower at the crest:
 * widen or narrow x by height, from `baseX` under the socket to `rimX` at the crest.
 */
function widthAt(y: number, rimX: number, baseX: number): number {
  const t = Math.min(1, Math.max(0, (y + 0.1) / 1.6))
  return baseX + (rimX - baseX) * t
}

/** Move a landmark into a re-proportioned pelvis (see `pelvisSolid`). */
export function pelvisPoint(p: Vec3, rimX = 1, baseX = 1): Vec3 {
  return [p[0] * widthAt(p[1], rimX, baseX), p[1], p[2]]
}

function pelvisField(rimX: number, baseX: number): Field {
  const whole = fuse(0.08, [mirrored(hipBone()), sacrum()])
  if (rimX === 1 && baseX === 1) return whole.f
  return (x, y, z) => {
    const k = widthAt(y, rimX, baseX)
    return whole.f(x / k, y, z) * Math.min(1, k)
  }
}

/** The pelvis as one sculpted solid. `rimX` / `baseX` re-proportion it (the female pelvis). */
export function pelvisSolid(rimX = 1, baseX = 1, dx = 0): SolidDef {
  const w = 1.6 * Math.max(rimX, baseX, 1)
  const mesh = sculpted(`pelvis/${rimX}/${baseX}`, {
    field: () => pelvisField(rimX, baseX),
    lo: [-w, -0.9, -1.15],
    hi: [w, 1.72, 0.72],
    step: 0.024,
    symmetric: true,
  })
  return { frame: 'pelvis', mesh, offset: [dx, 0, 0] }
}

export function pelvisBlocks(dx = 0): SweepDef[] {
  return [{ id: 'pelvis', group: 'bone', kind: 'bone', path: [], solid: pelvisSolid(1, 1, dx) }]
}
