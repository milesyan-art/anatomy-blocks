import { Matrix4 } from 'three'
import { DEG, P, makeFrames, mul, rotX, translate } from '../engine/frames'
import type { LessonDef, PathPoint, RigDef, SweepDef } from '../engine/types'

/*
 * LEFT foot.   +X = outside (little toe)   +Y = up   +Z = toes
 * Ankle joint at the origin, the floor is at y = -0.7.
 *
 * Frames
 *   shin   lower leg (never moves)
 *   foot   turns at the ankle
 *   toes   turn at the ball of the foot
 */

const BALL: [number, number, number] = [0, -0.6, 1.22]
const IDENTITY = new Matrix4()

const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]
const UP: PathPoint['n'] = [0, 1, 0]
const DOWN: PathPoint['n'] = [0, -1, 0]

interface Toe {
  id: string
  x: number
  /** how far back its joint sits - the joints slant away from the big toe */
  z: number
  len: number
  w: number
}

const TOES: Toe[] = [
  { id: 'big', x: -0.29, z: -0.03, len: 0.6, w: 0.14 },
  { id: 'two', x: -0.05, z: 0, len: 0.5, w: 0.075 },
  { id: 'three', x: 0.1, z: -0.05, len: 0.45, w: 0.07 },
  { id: 'four', x: 0.24, z: -0.13, len: 0.38, w: 0.07 },
  { id: 'little', x: 0.37, z: -0.23, len: 0.3, w: 0.07 },
]

const toeBlocks: SweepDef[] = TOES.map((t) => ({
  id: `toe-${t.id}`,
  group: 'bone',
  kind: 'bone',
  section: 'box',
  seg: 1,
  path: [
    P('toes', t.x, t.id === 'big' ? 0 : -0.02, t.z - 0.05, t.w, t.id === 'big' ? 0.11 : 0.08, { n: UP }),
    P('toes', t.x * 1.03, -0.03, t.z + t.len, t.w * 0.85, t.id === 'big' ? 0.075 : 0.055, { n: UP }),
  ],
}))

const toeTendons: SweepDef[] = TOES.map((t) => ({
  id: `tendon-${t.id}`,
  group: 'tendons',
  kind: 'tendon',
  path: [
    P('shin', t.x * 0.25, 0.55, 0.2, 0.03, 0.025, { n: FRONT }),
    P('foot', t.x * 0.4, -0.03, 0.24, 0.03, 0.025, { n: [0, 0.75, 0.66] }),
    P('foot', t.x * 0.75 + 0.03, -0.22, 0.66, 0.03, 0.025, { n: UP }),
    P('foot', t.x + 0.05, -0.44, 1.14, 0.03, 0.025, { n: UP }),
    P('toes', t.x, t.id === 'big' ? 0.11 : 0.06, t.z + 0.16, 0.025, 0.02, { n: UP }),
  ],
  label: t.id === 'two' ? 2 : undefined,
}))

const sweeps: SweepDef[] = [
  // ───────────── base blocks ─────────────
  {
    id: 'shin',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    seg: 2,
    path: [
      P('shin', 0, 2.3, 0, 0.25, 0.27, { n: FRONT }),
      P('shin', 0, 1.2, 0, 0.2, 0.22, { n: FRONT }),
      P('shin', 0, 0.3, 0, 0.17, 0.19, { n: FRONT }),
    ],
  },
  {
    // inner ankle bump high, outer bump low and further back
    id: 'ankle-bumps',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    seg: 1,
    path: [P('shin', -0.28, 0.05, 0.02, 0.13, 0.11, { n: FRONT }), P('shin', 0.28, -0.11, -0.08, 0.12, 0.1, { n: FRONT })],
  },
  {
    id: 'foot-block',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    seg: 2,
    path: [
      P('foot', 0, -0.45, -0.62, 0.22, 0.25, { n: UP }),
      P('foot', 0, -0.3, -0.1, 0.27, 0.3, { n: UP }),
      P('foot', 0.04, -0.42, 0.6, 0.36, 0.2, { n: UP }),
      P('foot', 0.06, -0.57, 1.24, 0.45, 0.12, { n: UP }),
    ],
  },
  ...toeBlocks,

  // ───────────── the soft parts ─────────────
  {
    id: 'achilles',
    group: 'achilles',
    kind: 'muscle',
    bulge: 0.4,
    path: [
      P('shin', 0, 2.1, -0.28, 0.22, 0.06, { n: BACK }),
      P('shin', 0, 0.75, -0.22, 0.09, 0.06, { n: BACK }),
      P('foot', 0, -0.22, -0.86, 0.11, 0.05, { n: BACK }),
    ],
    label: 1,
  },
  {
    id: 'heel-pad',
    group: 'heel',
    kind: 'muscle',
    path: [
      P('foot', 0, -0.62, -0.85, 0.13, 0.04, { n: [0, -0.5, -0.87] }),
      P('foot', 0, -0.7, -0.58, 0.21, 0.07, { n: DOWN }),
      P('foot', 0, -0.64, -0.2, 0.16, 0.05, { n: DOWN }),
    ],
    label: 1,
  },
  {
    id: 'ball-pad',
    group: 'ball',
    kind: 'muscle',
    path: [
      P('foot', -0.38, -0.67, 1.12, 0.17, 0.06, { n: DOWN }),
      P('foot', 0.05, -0.69, 1.08, 0.19, 0.07, { n: DOWN }),
      P('foot', 0.47, -0.67, 0.94, 0.14, 0.05, { n: DOWN }),
    ],
    label: 1,
  },
  {
    id: 'outer-edge',
    group: 'edge',
    kind: 'muscle',
    path: [
      P('foot', 0.2, -0.64, -0.25, 0.08, 0.05, { n: [0.5, -0.87, 0] }),
      P('foot', 0.37, -0.62, 0.35, 0.1, 0.07, { n: [0.6, -0.8, 0] }),
      P('foot', 0.48, -0.65, 0.9, 0.07, 0.05, { n: [0.6, -0.8, 0] }),
    ],
    label: 1,
  },
  {
    id: 'arch',
    group: 'arch',
    kind: 'muscle',
    path: [
      P('foot', -0.2, -0.56, -0.4, 0.08, 0.05, { n: [-1, 0, 0] }),
      P('foot', -0.31, -0.42, 0.3, 0.11, 0.08, { n: [-1, -0.2, 0] }),
      P('foot', -0.4, -0.58, 1.0, 0.06, 0.04, { n: [-1, 0, 0] }),
    ],
    label: 1,
  },
  {
    id: 'top-muscle',
    group: 'top',
    kind: 'muscle',
    path: [
      P('foot', 0.16, -0.06, 0.12, 0.08, 0.04, { n: [0.4, 0.9, 0.1] }),
      P('foot', 0.23, -0.2, 0.5, 0.13, 0.07, { n: [0.4, 0.9, 0.1] }),
      P('foot', 0.26, -0.4, 0.95, 0.07, 0.03, { n: [0.3, 0.95, 0] }),
    ],
    label: 1,
  },
  ...toeTendons,
]

export const footRig: RigDef = {
  id: 'foot',
  // the right foot stands about hip width away
  midX: -0.7,
  controls: [
    { id: 'ankle', label: 'Point the foot', min: -20, max: 45, def: 0, lo: 'toes up', hi: 'toes down' },
    { id: 'toes', label: 'Bend the toes', min: -25, max: 60, def: 0, lo: 'curl', hi: 'lift' },
  ],
  presets: [
    { label: 'Flat', pose: { ankle: 0, toes: 0 } },
    { label: 'Tiptoe', pose: { ankle: 42, toes: 55 } },
    { label: 'Pointed', pose: { ankle: 45, toes: -20 } },
    { label: 'Flexed', pose: { ankle: -18, toes: 25 } },
  ],
  groups: [
    {
      id: 'achilles',
      name: 'Achilles tendon',
      color: '#a2a9f2',
      real: 'Achilles tendon (the calf muscles end here)',
      where: 'Bottom of the calf → back of the heel bone.',
      shape: 'A strap that pinches in above the heel, leaving a hollow on each side in front of it.',
      move: 'Point the foot: the heel lifts and the strap shortens. It is the handle the calf pulls on.',
    },
    {
      id: 'heel',
      name: 'Heel pad',
      color: '#f0719f',
      real: 'Fat pad under the heel bone',
      where: 'Under and behind the heel.',
      shape: 'A rounded cushion. The heel sticks out behind the ankle further than you expect.',
      move: 'One of the three points the foot stands on: heel, ball, outer edge.',
    },
    {
      id: 'ball',
      name: 'Ball of the foot',
      color: '#ffd166',
      real: 'Pads under the toe joints',
      where: 'Across the sole, just behind the toes.',
      shape: 'A slanted sausage: furthest forward at the big toe, sweeping back towards the little toe.',
      move: 'On tiptoe the foot hinges exactly here - the toes stay flat on the ground.',
    },
    {
      id: 'edge',
      name: 'Outer edge',
      color: '#a9dd78',
      real: 'Abductor digiti minimi + side pad',
      where: 'Heel → little toe, along the outside of the sole.',
      shape: 'A long flat strip. The outside of the foot touches the ground all the way along.',
      move: 'Compare with the inside: outside flat on the floor, inside lifted into an arch.',
    },
    {
      id: 'arch',
      name: 'Inner arch',
      color: '#6fb8ec',
      real: 'Abductor hallucis',
      where: 'Inside of the heel → big toe.',
      shape: 'A slim spindle that bridges the arch - it is the line you draw for the inside of the foot.',
      move: 'It rises off the ground in the middle, so the inner footprint is hollow.',
    },
    {
      id: 'top',
      name: 'Top-of-foot muscle',
      color: '#f5a25a',
      real: 'Extensor digitorum brevis',
      where: 'In front of the outer ankle bump → towards the toes.',
      shape: 'A small soft lump on the outer top of the foot - the only muscle belly up here.',
      move: 'Easy to miss. It keeps the top of the foot from looking like a flat ramp.',
    },
    {
      id: 'tendons',
      name: 'Toe tendons',
      color: '#c9a0f0',
      real: 'Extensor tendons',
      where: 'Front of the ankle → fanning out to every toe.',
      shape: 'Cords in a fan, like the back of the hand.',
      move: 'Lift the toes and they stand up like tent ropes.',
    },
  ],
  sweeps,
  drives: (pose) => ({ ankle: pose.ankle / 45 }),
  frames: (pose) =>
    makeFrames((name, _k, get) => {
      switch (name) {
        case 'foot':
          return rotX(pose.ankle * DEG)
        case 'toes':
          return mul(get('foot'), translate(...BALL), rotX(-pose.toes * DEG))
        default:
          return IDENTITY
      }
    }),
}

export const footLessons: LessonDef[] = [
  {
    id: 'foot',
    rig: 'foot',
    section: 'Leg',
    title: 'Foot',
    blurb: 'A wedge with a heel block behind and a row of toe blocks in front. Like the hand, it is mostly bone, pads and tendons.',
    show: ['achilles', 'heel', 'ball', 'edge', 'arch', 'top', 'tendons'],
    view: { target: [0, 0.3, 0.45], fit: [4.2, 4.4], az: 62, el: 10 },
    sides: ['Front', 'Outside', 'Back', 'Inside'],
    tips: [
      'Think wedge: high at the ankle, sloping down to the toes, and wider at the front than at the heel.',
      'Inner ankle bump is high and forward; outer bump is low and back.',
      'The big toe is its own block and points straight ahead; the other four curl down and angle away.',
    ],
  },
]
