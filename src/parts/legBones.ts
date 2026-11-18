import { bar, brick, carve, clip, egg, fuse, rod, sculpted, squash } from '../engine/sdf'
import type { Shape } from '../engine/sdf'
import type { MeshRef, SweepDef, Vec3 } from '../engine/types'

/*
 * The bones of the leg and foot, sculpted the same way as the pelvis: simple artist
 * forms fused into one bone each, at full resolution, with every landmark a muscle
 * hangs from in place and exported by name.
 *
 * Each bone lives in the frame that carries it, so the rigs can move them:
 *   femur   'femur' - LEFT thigh bone, hip joint at the origin (the leg rig's own space)
 *   shin    'tibia' - shin bone and calf bone (fibula), knee joint at the origin
 *   kneecap 'patella' - slides down the front of the knee as it bends (shin space at rest)
 *   foot    'foot'  - ankle and foot bones, ankle joint at the origin, floor at y = -0.7
 *   toes    'toes'  - the toe bones, hinging at the ball of the foot (`BALL`)
 * +X = outside, +Y = up, +Z = front (the toes).
 */

/** Where the ankle sits in the shin's frame. */
export const ANKLE: Vec3 = [-0.02, -3.95, -0.05]
/** Where the knee hinges in the thigh's frame. */
export const KNEE: Vec3 = [-0.22, -4.3, 0]
/** Where the toes hinge, in the foot's frame. */
export const BALL: Vec3 = [0, -0.6, 1.22]

/** Landmarks on the thigh bone (femur frame). */
export const FEMUR = {
  /** Centre of the ball that sits in the hip socket. */
  head: [-0.05, 0.03, 0] as Vec3,
  /** The big knob on the outside of the hip (greater trochanter): gluteus medius, the hip's turning muscles. */
  greaterTrochanter: [0.55, 0.06, -0.07] as Vec3,
  /** The small knob at the back of the neck (lesser trochanter): the hip flexors. */
  lesserTrochanter: [0.12, -0.4, -0.16] as Vec3,
  /** The rough ridge down the back of the shaft (linea aspera): adductors, vasti. */
  lineaAspera: [0.1, -2.2, -0.13] as Vec3,
  /** The bump above the inner condyle: the big adductor's tendon. */
  adductorTubercle: [-0.54, -3.95, -0.1] as Vec3,
  /** Backs of the two knuckles of the knee: the two calf heads. */
  medialCondyleBack: [-0.41, -4.12, -0.27] as Vec3,
  lateralCondyleBack: [-0.03, -4.12, -0.28] as Vec3,
}

/** Landmarks on the shin bones (tibia frame: the knee at the origin). */
export const SHIN = {
  /** The bump below the kneecap (tibial tuberosity): the kneecap ligament. */
  tuberosity: [0.0, -0.62, 0.28] as Vec3,
  /** The bump on the outside of the shin top (Gerdy's tubercle): the IT band. */
  gerdy: [0.27, -0.45, 0.17] as Vec3,
  /** Inside of the shin below the knee (pes anserinus): sartorius, gracilis, semitendinosus. */
  pes: [-0.2, -0.8, 0.12] as Vec3,
  /** Back of the inner knuckle of the shin: semimembranosus. */
  medialCondyle: [-0.4, -0.38, -0.12] as Vec3,
  /** Head of the calf bone (fibula), outside and behind: biceps femoris. */
  fibulaHead: [0.4, -0.44, -0.2] as Vec3,
  /** Inner ankle bump - high and forward. */
  medialMalleolus: [-0.31, -3.95, -0.03] as Vec3,
  /** Outer ankle bump - low and back. */
  lateralMalleolus: [0.29, -4.1, -0.13] as Vec3,
}

/** Landmarks on the foot (foot frame: the ankle at the origin). */
export const FOOT = {
  /** Back of the heel bone: the Achilles tendon. */
  heel: [0.03, -0.42, -0.79] as Vec3,
  /** Underside of the inner cuneiform and the big toe's long bone: tibialis anterior. */
  medialCuneiform: [-0.33, -0.36, 0.64] as Vec3,
  /** The knob at the base of the little toe's long bone: peroneus brevis. */
  fifthMetatarsal: [0.43, -0.5, 0.53] as Vec3,
  /** Top of the heel bone in front of the outer ankle: the top-of-foot muscle. */
  sinusTarsi: [0.22, -0.3, 0.2] as Vec3,
}

/* ───────────────────────── thigh bone ───────────────────────── */

function femurShape(): Shape {
  const bone = fuse(0.06, [
    // ball and neck, angled up, in and a little forward to the hip socket
    egg(FEMUR.head, [0.235, 0.235, 0.235]),
    bar(FEMUR.head, [0.32, -0.15, -0.06], 0.12, 0.15),
    // the knobs at the top
    egg([0.47, 0.0, -0.07], [0.12, 0.2, 0.15], [0.15, 1, 0]),
    egg([0.16, -0.38, -0.12], [0.07, 0.07, 0.06]),
    // the shaft: leans in towards the knee and bows forward a little
    ...rod(
      [
        [0.4, -0.25, -0.04],
        [0.3, -0.75, 0.0],
        [0.12, -2.2, 0.05],
        [-0.1, -3.55, 0.0],
      ],
      [0.17, 0.14, 0.13, 0.15],
    ),
    // the rough ridge down the back
    ...rod(
      [
        [0.27, -0.9, -0.12],
        [0.11, -2.2, -0.08],
        [-0.05, -3.3, -0.11],
      ],
      [0.04, 0.05, 0.04],
    ),
    // the knee end: it flares into two knuckles (condyles), with a bump on each side
    egg([-0.2, -3.95, -0.03], [0.3, 0.32, 0.2]),
    egg([-0.41, -4.32, -0.06], [0.16, 0.2, 0.25]),
    egg([-0.03, -4.31, -0.06], [0.15, 0.2, 0.25]),
    egg([-0.56, -4.18, -0.06], [0.07, 0.08, 0.08]),
    egg([0.13, -4.18, -0.06], [0.06, 0.07, 0.07]),
    egg([-0.5, -3.95, -0.1], [0.05, 0.05, 0.05]),
    // the front of the knee end, where the kneecap glides
    egg([-0.22, -4.12, 0.1], [0.28, 0.2, 0.14]),
  ])
  return carve(bone, 0.04, [
    // the groove the kneecap runs in, and the notch between the knuckles at the back
    bar([-0.22, -3.92, 0.3], [-0.22, -4.36, 0.24], 0.06, 0.06),
    bar([-0.22, -4.55, -0.18], [-0.22, -4.24, -0.32], 0.075, 0.075),
  ])
}

/* ───────────────────────── shin bones ───────────────────────── */

function tibiaShape(): Shape {
  return fuse(0.06, [
    // the wide top (plateau) on two knuckles, flaring down into the shaft
    egg([-0.2, -0.36, -0.04], [0.22, 0.14, 0.27]),
    egg([0.2, -0.36, -0.05], [0.21, 0.13, 0.25]),
    egg([0, -0.56, 0.0], [0.3, 0.26, 0.22]),
    egg(SHIN.tuberosity, [0.08, 0.12, 0.07]),
    egg([0.25, -0.45, 0.14], [0.06, 0.06, 0.06]),
    // the shaft, with the sharp edge of the shin running down its front
    ...rod(
      [
        [0.0, -0.75, 0.02],
        [-0.05, -2.0, 0.03],
        [-0.05, -3.3, -0.03],
      ],
      [0.17, 0.13, 0.13],
    ),
    ...rod(
      [
        [0.0, -0.75, 0.15],
        [-0.04, -2.0, 0.14],
        [-0.05, -3.1, 0.08],
      ],
      [0.045, 0.04, 0.035],
    ),
    // the ankle end and the inner ankle bump
    egg([-0.06, -3.78, -0.05], [0.2, 0.22, 0.17]),
    egg([-0.29, -3.92, -0.03], [0.08, 0.14, 0.1]),
  ])
}

function fibulaShape(): Shape {
  return fuse(0.05, [
    egg([0.36, -0.46, -0.17], [0.09, 0.09, 0.09]),
    ...rod(
      [
        [0.36, -0.5, -0.17],
        [0.34, -1.2, -0.18],
        [0.31, -3.3, -0.15],
        [0.28, -3.85, -0.13],
      ],
      [0.07, 0.05, 0.05, 0.08],
    ),
    // the outer ankle bump, lower and further back than the inner one
    egg([0.27, -4.05, -0.13], [0.08, 0.15, 0.1]),
  ])
}

/** The kneecap: a flattened teardrop, point down. */
function patellaShape(): Shape {
  return squash(bar([0, 0.36, 0.33], [0, 0.1, 0.34], 0.16, 0.07), PATELLA_AT, [1, 1, 0.5])
}

/** Shin bone and calf bone touch at their ends without melting into each other. */
const shinShape = (): Shape => fuse(0, [tibiaShape(), fibulaShape()])

/*
 * The kneecap is not fixed to the shin: as the knee bends it slides down the groove
 * at the front of the thigh bone, into the notch between the knuckles. The rig gives
 * it its own frame (turning with part of the bend, drawn in towards the knee as it
 * goes, see `patellaFrame`); the quads' tendons and the kneecap ligament ride on it.
 * The frame is the shin's space at rest, so the kneecap is modelled in shin coordinates.
 */
export const PATELLA_FRAME = 'patella'
/** Where the kneecap sits in the shin's space at rest. */
const PATELLA_AT: Vec3 = [0, 0.23, 0.33]

/**
 * The kneecap's frame for a knee bend (0..1 of the full bend), given the knee's frame
 * turned by part of that bend: pulled in towards the knee, so it stays on the groove.
 */
export function patellaFrame(bend: number): Vec3 {
  const t = 0.3 * bend
  return [-PATELLA_AT[0] * t, -PATELLA_AT[1] * t, -PATELLA_AT[2] * t]
}
/** How much of the knee's bend the kneecap turns with. */
export const PATELLA_TURN = 0.6

/* ───────────────────────── foot ───────────────────────── */

export interface Ray {
  /** Long bone of the foot (metatarsal): base and head, and their radii. */
  base: Vec3
  head: Vec3
  rb: number
  rh: number
  /** The toe: its x, how far back its joint sits, length, bone radius, and bones in it. */
  x: number
  z: number
  len: number
  r: number
  bones: number
}

/** The five rays of the foot, big toe first. */
export const RAYS: Ray[] = [
  { base: [-0.25, -0.36, 0.74], head: [-0.29, -0.55, 1.19], rb: 0.09, rh: 0.1, x: -0.29, z: -0.03, len: 0.6, r: 0.062, bones: 2 },
  { base: [-0.08, -0.33, 0.72], head: [-0.05, -0.56, 1.22], rb: 0.06, rh: 0.065, x: -0.05, z: 0, len: 0.5, r: 0.038, bones: 3 },
  { base: [0.06, -0.36, 0.71], head: [0.1, -0.57, 1.17], rb: 0.06, rh: 0.06, x: 0.1, z: -0.05, len: 0.45, r: 0.036, bones: 3 },
  { base: [0.18, -0.42, 0.6], head: [0.24, -0.58, 1.09], rb: 0.06, rh: 0.06, x: 0.24, z: -0.13, len: 0.38, r: 0.035, bones: 3 },
  { base: [0.3, -0.48, 0.55], head: [0.37, -0.59, 0.99], rb: 0.07, rh: 0.06, x: 0.37, z: -0.23, len: 0.3, r: 0.034, bones: 3 },
]

/** Ankle bones and the long bones of the foot; each its own block, pressed together. */
function footShape(): Shape {
  const parts: Shape[] = [
    // ankle bone (talus): a dome under the shin, its head pointing forward and in
    fuse(0.04, [egg([0, -0.2, 0], [0.16, 0.15, 0.24]), bar([-0.02, -0.22, 0.15], [-0.14, -0.3, 0.36], 0.1, 0.11)]),
    // heel bone (calcaneus): a heavy block whose back end is the heel
    fuse(0.06, [
      egg([0.03, -0.43, -0.6], [0.15, 0.19, 0.17]),
      bar([0.03, -0.45, -0.5], [0.16, -0.42, 0.22], 0.16, 0.12),
      egg([-0.14, -0.33, -0.02], [0.08, 0.05, 0.1]),
    ]),
    // the small blocks of the midfoot
    egg([-0.17, -0.3, 0.47], [0.13, 0.1, 0.07]),
    brick([0.22, -0.44, 0.42], [0.11, 0.1, 0.12], 0.04),
    brick([-0.25, -0.33, 0.63], [0.075, 0.12, 0.09], 0.03),
    brick([-0.08, -0.3, 0.64], [0.06, 0.09, 0.07], 0.03),
    brick([0.06, -0.33, 0.62], [0.06, 0.09, 0.08], 0.03),
    // the knob at the base of the little toe's long bone
    egg([0.39, -0.5, 0.53], [0.06, 0.06, 0.07]),
  ]
  for (const r of RAYS) {
    parts.push(fuse(0.03, [egg(r.base, [r.rb, r.rb, r.rb * 1.2]), bar(r.base, r.head, r.rb * 0.7, r.rh * 0.65), egg(r.head, [r.rh, r.rh, r.rh])]))
  }
  // a hairline crease where bone meets bone, as in a real foot
  return fuse(0.012, parts)
}

/** The toe bones, in the toes' frame (origin at the ball of the foot). */
function toesShape(): Shape {
  const parts: Shape[] = []
  for (const r of RAYS) {
    // start just in front of the long bone's head, then step forward and a little down
    const z0 = r.head[2] - BALL[2] + r.rh
    const pts: Vec3[] = []
    for (let b = 0; b <= r.bones; b++) {
      const t = b / r.bones
      pts.push([r.x + r.x * 0.03 * t, r.head[1] - BALL[1] - 0.02 - 0.05 * t * t, z0 + (r.z + r.len - z0) * t])
    }
    for (let b = 0; b < r.bones; b++) {
      const k = b === r.bones - 1 ? 0.8 : 1
      // each bone a little spool: knobbed at both ends
      parts.push(
        fuse(0.02, [
          bar(pts[b], pts[b + 1], r.r * k, r.r * k * 0.8),
          egg(pts[b], [r.r * 1.15 * k, r.r * k, r.r * k]),
        ]),
      )
    }
  }
  return fuse(0.008, parts)
}

/* ───────────────────────── the parts ───────────────────────── */

const femurMesh = sculpted('femur', { field: () => femurShape().f, lo: [-0.75, -4.65, -0.45], hi: [0.75, 0.32, 0.4], step: 0.022 })
const shinMesh = sculpted('shin', { field: () => shinShape().f, lo: [-0.5, -4.3, -0.42], hi: [0.55, 0.6, 0.55], step: 0.02 })
/** The lower half of the shin only, for the foot on its own. */
const patellaMesh = sculpted('patella', { field: () => patellaShape().f, lo: [-0.22, -0.05, 0.2], hi: [0.22, 0.56, 0.46], step: 0.012 })
const shinStubMesh = sculpted('shin-stub', {
  field: () => clip(fuse(0, [tibiaShape(), fibulaShape()]), 0.06, (_x, y) => y + 1.6).f,
  lo: [-0.5, -4.3, -0.42],
  hi: [0.55, -1.5, 0.3],
  step: 0.02,
})
const footMesh = sculpted('foot', { field: () => footShape().f, lo: [-0.45, -0.72, -0.85], hi: [0.55, 0.0, 1.32], step: 0.016 })
const toesMesh = sculpted('toes', { field: () => toesShape().f, lo: [-0.42, -0.2, -0.15], hi: [0.5, 0.15, 0.7], step: 0.012 })

const bone = (id: string, frame: string, mesh: MeshRef, offset?: Vec3): SweepDef => ({
  id,
  group: 'bone',
  kind: 'bone',
  path: [],
  solid: { frame, mesh, offset },
})

/** Thigh bone, shin bones + kneecap, and the foot - for the whole leg. */
export function legBones(): SweepDef[] {
  return [
    bone('femur', 'femur', femurMesh),
    bone('shin', 'tibia', shinMesh),
    bone('patella', PATELLA_FRAME, patellaMesh),
    bone('foot-bones', 'foot', footMesh),
    bone('toe-bones', 'toes', toesMesh),
  ]
}

/** The foot on its own: its bones, and the bottom of the shin in a frame with the ankle at the origin. */
export function footBones(): SweepDef[] {
  return [
    bone('shin', 'shin', shinStubMesh, [-ANKLE[0], -ANKLE[1], -ANKLE[2]]),
    bone('foot-bones', 'foot', footMesh),
    bone('toe-bones', 'toes', toesMesh),
  ]
}
