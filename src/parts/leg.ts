import { Matrix4 } from 'three'
import { DEG, P, makeFrames, mul, rotX, translate } from '../engine/frames'
import type { LessonDef, PathPoint, RigDef, SweepDef } from '../engine/types'
import { pelvisBlocks } from './pelvis'

/*
 * LEFT leg, standing.
 *   +X = outside   +Y = up   +Z = front
 * Hip joint at the origin, knee 4.3 below it, ankle 3.95 below the knee.
 *
 * Frames
 *   pelvis  hip block (never moves) - shared with the torso, see pelvis.ts
 *   femur   thigh bone (fixed here - the knee and ankle do the moving)
 *   knee@k  sits at the knee, turned by k x the knee bend (0 = thigh ... 1 = shin)
 *   tibia   shin (= knee@1). The kneecap rides on this one.
 *   foot    turns at the ankle
 */

const KNEE: [number, number, number] = [-0.22, -4.3, 0]
const ANKLE: [number, number, number] = [-0.02, -3.95, -0.05]
/** How far the hip joint sits from the body's midline. */
const HIP_X = 0.85
const IDENTITY = new Matrix4()

const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]
const UP: PathPoint['n'] = [0, 1, 0]
const OUT: PathPoint['n'] = [1, 0, 0]

const sweeps: SweepDef[] = [
  // ───────────── bones ─────────────
  // the whole hip block, slid over so this leg hangs from its left socket
  ...pelvisBlocks(-HIP_X),
  {
    id: 'femur-neck',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    path: [
      P('femur', -0.22, 0.05, 0, 0.12, 0.12, { n: UP }),
      P('femur', -0.05, 0.03, 0, 0.25, 0.25, { n: UP }),
      P('femur', 0.15, -0.05, 0, 0.17, 0.16, { n: UP }),
      P('femur', 0.4, -0.12, -0.02, 0.15, 0.14, { n: UP }),
    ],
  },
  {
    id: 'femur',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    path: [
      P('femur', 0.46, 0.12, -0.03, 0.1, 0.12, { n: FRONT }),
      P('femur', 0.43, -0.15, -0.02, 0.2, 0.2, { n: FRONT }),
      P('femur', 0.3, -0.7, 0, 0.15, 0.15, { n: FRONT }),
      P('femur', 0.12, -2.2, 0.06, 0.14, 0.14, { n: FRONT }),
      P('femur', -0.12, -3.6, 0, 0.17, 0.15, { n: FRONT }),
      P('femur', -0.2, -4.0, 0, 0.36, 0.26, { n: FRONT }),
      P('femur', -0.22, -4.3, -0.02, 0.42, 0.33, { n: FRONT }),
      P('femur', -0.22, -4.52, -0.02, 0.36, 0.28, { n: FRONT }),
    ],
  },
  {
    id: 'patella',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    seg: 2,
    path: [
      P('tibia', 0, 0.42, 0.42, 0.1, 0.05, { n: FRONT }),
      P('tibia', 0, 0.24, 0.44, 0.2, 0.09, { n: FRONT }),
      P('tibia', 0, 0.04, 0.42, 0.12, 0.07, { n: FRONT }),
    ],
  },
  {
    id: 'tibia',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    path: [
      P('tibia', 0, -0.2, -0.02, 0.42, 0.3, { n: FRONT }),
      P('tibia', 0, -0.45, 0.02, 0.36, 0.28, { n: FRONT }),
      P('tibia', -0.02, -0.85, 0.1, 0.2, 0.22, { n: FRONT }),
      P('tibia', -0.06, -2.0, 0.05, 0.14, 0.16, { n: FRONT }),
      P('tibia', -0.05, -3.3, -0.02, 0.13, 0.13, { n: FRONT }),
      P('tibia', -0.08, -3.8, -0.05, 0.22, 0.17, { n: FRONT }),
      P('tibia', -0.16, -4.05, -0.05, 0.12, 0.12, { n: FRONT }),
    ],
  },
  {
    id: 'fibula',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    path: [
      P('tibia', 0.36, -0.42, -0.18, 0.09, 0.09, { n: FRONT }),
      P('tibia', 0.36, -0.7, -0.18, 0.06, 0.06, { n: FRONT }),
      P('tibia', 0.33, -3.3, -0.15, 0.055, 0.055, { n: FRONT }),
      P('tibia', 0.3, -3.95, -0.12, 0.1, 0.1, { n: FRONT }),
      P('tibia', 0.3, -4.14, -0.12, 0.06, 0.06, { n: FRONT }),
    ],
  },
  {
    id: 'foot',
    group: 'foot',
    kind: 'prop',
    section: 'box',
    path: [
      P('foot', 0, -0.45, -0.62, 0.22, 0.25, { n: UP }),
      P('foot', 0, -0.3, -0.1, 0.27, 0.3, { n: UP }),
      P('foot', 0.04, -0.42, 0.6, 0.36, 0.2, { n: UP }),
      P('foot', 0.06, -0.58, 1.2, 0.45, 0.12, { n: UP }),
      P('foot', 0.08, -0.63, 1.75, 0.4, 0.07, { n: UP }),
    ],
  },

  // ───────────── hip ─────────────
  {
    id: 'glute-max',
    group: 'glutes',
    kind: 'muscle',
    path: [
      P('pelvis', -0.5, 0.75, -0.95, 0.3, 0.12, { n: [-0.2, 0, -1] }),
      P('pelvis', -0.1, 0.1, -0.85, 0.55, 0.38, { n: [0.1, 0, -1] }),
      P('femur', 0.4, -0.7, -0.55, 0.42, 0.28, { n: [0.6, 0, -0.8] }),
      P('femur', 0.62, -1.5, -0.2, 0.14, 0.08, { n: [0.95, 0, -0.3] }),
    ],
    label: 1,
  },
  {
    id: 'glute-med',
    group: 'glutes',
    kind: 'muscle',
    section: 'sheet',
    path: [
      P('pelvis', 0.45, 1.3, -0.15, 0.5, 0.08, { n: [0.9, 0.3, -0.2], curl: 1.2 }),
      P('pelvis', 0.62, 0.6, -0.1, 0.42, 0.16, { n: [1, 0, -0.1], curl: 1.2 }),
      P('femur', 0.6, 0.02, -0.08, 0.14, 0.1, { n: OUT }),
    ],
  },
  {
    id: 'tfl',
    group: 'tfl',
    kind: 'muscle',
    path: [
      P('pelvis', 0.45, 0.72, 0.4, 0.1, 0.07, { n: [0.8, 0, 0.6] }),
      P('femur', 0.62, 0.1, 0.25, 0.17, 0.12, { n: [0.9, 0, 0.44] }),
      P('femur', 0.7, -0.7, 0.14, 0.12, 0.07, { n: [1, 0, 0.2] }),
    ],
    label: 1,
  },
  {
    id: 'it-band',
    group: 'tfl',
    kind: 'tendon',
    path: [
      P('femur', 0.7, -0.5, 0.05, 0.16, 0.04, { n: OUT }),
      P('femur', 0.78, -2.0, 0.08, 0.17, 0.035, { n: OUT }),
      P('femur', 0.56, -3.6, 0.02, 0.13, 0.035, { n: OUT }),
      P('knee@0.5', 0.44, 0, 0.1, 0.1, 0.035, { n: OUT }),
      P('tibia', 0.3, -0.38, 0.18, 0.08, 0.04, { n: [0.8, 0, 0.6] }),
    ],
  },

  // ───────────── thigh ─────────────
  {
    id: 'adductors',
    group: 'adductors',
    kind: 'muscle',
    path: [
      P('pelvis', -0.62, -0.15, 0.45, 0.24, 0.12, { n: [-0.3, 0, 0.95] }),
      P('femur', -0.5, -1.0, 0.22, 0.46, 0.34, { n: [-0.65, 0, 0.76] }),
      P('femur', -0.56, -2.1, 0.02, 0.36, 0.3, { n: [-0.95, 0, 0.3] }),
      P('femur', -0.56, -3.1, -0.08, 0.18, 0.14, { n: [-1, 0, 0] }),
      P('femur', -0.5, -3.9, -0.1, 0.06, 0.05, { n: [-1, 0, 0] }),
    ],
    label: 1,
  },
  {
    id: 'vastus-lateralis',
    group: 'quads',
    kind: 'muscle',
    bulge: 0.3,
    path: [
      P('femur', 0.46, -0.45, 0.1, 0.12, 0.1, { n: [0.9, 0, 0.44] }),
      P('femur', 0.52, -1.5, 0.22, 0.3, 0.26, { n: [0.85, 0, 0.53] }),
      P('femur', 0.4, -2.7, 0.3, 0.3, 0.24, { n: [0.75, 0, 0.66] }),
      P('femur', 0.12, -3.6, 0.3, 0.2, 0.14, { n: [0.6, 0, 0.8] }),
      P('knee@0.5', 0.2, 0.4, 0.22, 0.12, 0.06, { n: [0.4, 0.6, 0.7] }),
      P('tibia', 0.14, 0.3, 0.42, 0.06, 0.04, { n: [0.3, 0.4, 0.86] }),
    ],
  },
  {
    id: 'vastus-medialis',
    group: 'quads',
    kind: 'muscle',
    bulge: 0.3,
    path: [
      P('femur', -0.2, -1.6, 0.4, 0.12, 0.1, { n: [-0.5, 0, 0.87] }),
      P('femur', -0.4, -2.6, 0.34, 0.24, 0.2, { n: [-0.6, 0, 0.8] }),
      P('femur', -0.5, -3.7, 0.28, 0.24, 0.22, { n: [-0.55, 0, 0.84] }),
      P('knee@0.5', -0.3, 0.25, 0.3, 0.14, 0.1, { n: [-0.4, 0.5, 0.77] }),
      P('tibia', -0.14, 0.22, 0.42, 0.06, 0.04, { n: [-0.3, 0.3, 0.9] }),
    ],
  },
  {
    id: 'rectus-femoris',
    group: 'quads',
    kind: 'muscle',
    bulge: 0.3,
    path: [
      P('pelvis', 0.22, 0.42, 0.42, 0.1, 0.07, { n: [0.1, 0, 1] }),
      P('femur', 0.1, -0.8, 0.52, 0.27, 0.22, { n: [0.1, 0, 1] }),
      P('femur', 0.02, -2.0, 0.58, 0.29, 0.24, { n: FRONT }),
      P('femur', -0.1, -2.9, 0.5, 0.22, 0.15, { n: FRONT }),
      P('femur', -0.16, -3.45, 0.42, 0.16, 0.07, { n: FRONT }),
      P('knee@0.5', 0, 0.36, 0.25, 0.15, 0.05, { n: [0, 0.8, 0.6] }),
      P('tibia', 0, 0.4, 0.46, 0.12, 0.04, { n: [0, 0.65, 0.76] }),
    ],
    label: 2,
  },
  {
    id: 'patellar-ligament',
    group: 'quads',
    kind: 'tendon',
    seg: 2,
    path: [
      P('tibia', 0, 0.06, 0.45, 0.1, 0.04, { n: FRONT }),
      P('tibia', 0.01, -0.5, 0.36, 0.08, 0.04, { n: FRONT }),
    ],
  },
  {
    id: 'sartorius',
    group: 'sartorius',
    kind: 'muscle',
    path: [
      P('pelvis', 0.34, 0.7, 0.52, 0.08, 0.05, { n: [0.3, 0, 0.95] }),
      P('femur', 0.08, -0.6, 0.72, 0.1, 0.06, { n: FRONT }),
      P('femur', -0.42, -1.8, 0.52, 0.1, 0.06, { n: [-0.5, 0, 0.87] }),
      P('femur', -0.74, -3.0, 0.1, 0.1, 0.06, { n: [-0.9, 0, 0.44] }),
      P('femur', -0.74, -3.9, -0.2, 0.09, 0.05, { n: [-0.95, 0, -0.3] }),
      P('knee@0.8', -0.5, -0.3, -0.15, 0.08, 0.05, { n: [-1, 0, 0] }),
      P('tibia', -0.3, -0.75, 0.15, 0.07, 0.04, { n: [-0.8, 0, 0.6] }),
    ],
    label: 2,
  },
  {
    id: 'biceps-femoris',
    group: 'hamstrings',
    kind: 'muscle',
    bulge: 0.8,
    path: [
      P('pelvis', -0.25, -0.72, -0.45, 0.1, 0.08, { n: BACK }),
      P('femur', 0.05, -1.6, -0.5, 0.22, 0.22, { n: [0.2, 0, -1] }),
      P('femur', 0.22, -2.8, -0.48, 0.2, 0.2, { n: [0.4, 0, -0.92] }),
      P('femur', 0.3, -3.7, -0.42, 0.1, 0.08, { n: [0.6, 0, -0.8] }),
      P('tibia', 0.4, -0.38, -0.2, 0.06, 0.05, { n: [0.8, 0, -0.6] }),
    ],
  },
  {
    id: 'semis',
    group: 'hamstrings',
    kind: 'muscle',
    bulge: 0.8,
    path: [
      P('pelvis', -0.35, -0.72, -0.45, 0.1, 0.08, { n: BACK }),
      P('femur', -0.35, -1.6, -0.48, 0.24, 0.22, { n: [-0.25, 0, -0.97] }),
      P('femur', -0.42, -2.8, -0.42, 0.2, 0.2, { n: [-0.45, 0, -0.9] }),
      P('femur', -0.5, -3.7, -0.38, 0.1, 0.08, { n: [-0.6, 0, -0.8] }),
      P('tibia', -0.36, -0.4, -0.1, 0.06, 0.05, { n: [-0.9, 0, -0.4] }),
    ],
    label: 1,
  },

  // ───────────── lower leg ─────────────
  {
    id: 'soleus',
    group: 'soleus',
    kind: 'muscle',
    bulge: 0.6,
    path: [
      P('tibia', 0.05, -0.7, -0.25, 0.22, 0.1, { n: BACK }),
      P('tibia', 0, -1.7, -0.26, 0.38, 0.15, { n: BACK, curl: 1.6 }),
      P('tibia', -0.02, -2.5, -0.26, 0.28, 0.12, { n: BACK, curl: 1.2 }),
      P('tibia', -0.02, -3.1, -0.3, 0.12, 0.08, { n: BACK }),
    ],
    label: 2,
  },
  {
    id: 'achilles',
    group: 'soleus',
    kind: 'tendon',
    path: [
      P('tibia', -0.03, -1.9, -0.4, 0.2, 0.05, { n: BACK }),
      P('tibia', -0.02, -2.8, -0.38, 0.11, 0.06, { n: BACK }),
      P('tibia', -0.02, -3.6, -0.42, 0.08, 0.07, { n: BACK }),
      P('foot', 0, -0.2, -0.72, 0.1, 0.06, { n: BACK }),
    ],
  },
  {
    id: 'gastroc-medial',
    group: 'calf',
    kind: 'muscle',
    bulge: 1,
    path: [
      P('femur', -0.42, -4.1, -0.3, 0.1, 0.08, { n: [-0.3, 0, -0.95] }),
      P('tibia', -0.25, -0.7, -0.42, 0.2, 0.2, { n: [-0.35, 0, -0.94] }),
      P('tibia', -0.24, -1.4, -0.42, 0.23, 0.22, { n: [-0.35, 0, -0.94] }),
      P('tibia', -0.14, -2.05, -0.36, 0.14, 0.08, { n: [-0.2, 0, -0.98] }),
    ],
    label: 2,
  },
  {
    id: 'gastroc-lateral',
    group: 'calf',
    kind: 'muscle',
    bulge: 1,
    path: [
      P('femur', 0, -4.1, -0.32, 0.1, 0.08, { n: [0.3, 0, -0.95] }),
      P('tibia', 0.2, -0.65, -0.42, 0.19, 0.19, { n: [0.35, 0, -0.94] }),
      P('tibia', 0.2, -1.25, -0.42, 0.2, 0.2, { n: [0.35, 0, -0.94] }),
      P('tibia', 0.1, -1.85, -0.36, 0.12, 0.08, { n: [0.2, 0, -0.98] }),
    ],
  },
  {
    id: 'tibialis-anterior',
    group: 'shin',
    kind: 'muscle',
    bulge: 0.8,
    path: [
      P('tibia', 0.24, -0.5, 0.18, 0.12, 0.07, { n: [0.55, 0, 0.83] }),
      P('tibia', 0.23, -1.3, 0.22, 0.2, 0.14, { n: [0.55, 0, 0.83] }),
      P('tibia', 0.15, -2.3, 0.19, 0.13, 0.08, { n: [0.45, 0, 0.89] }),
      P('tibia', -0.02, -3.5, 0.16, 0.05, 0.04, { n: FRONT }),
      P('foot', -0.18, -0.1, 0.35, 0.05, 0.04, { n: [-0.3, 1, 0.2] }),
    ],
    label: 1,
  },
  {
    id: 'peroneals',
    group: 'peroneals',
    kind: 'muscle',
    bulge: 0.6,
    path: [
      P('tibia', 0.42, -0.55, -0.1, 0.08, 0.07, { n: OUT }),
      P('tibia', 0.44, -1.5, -0.1, 0.12, 0.11, { n: [1, 0, -0.1] }),
      P('tibia', 0.4, -2.6, -0.14, 0.08, 0.06, { n: [1, 0, -0.2] }),
      P('tibia', 0.34, -3.8, -0.26, 0.05, 0.04, { n: [0.7, 0, -0.7] }),
      P('foot', 0.3, -0.45, 0.25, 0.05, 0.04, { n: [1, 0.3, 0] }),
    ],
    label: 1,
  },
]

export const legRig: RigDef = {
  id: 'leg',
  controls: [
    { id: 'knee', label: 'Bend the knee', min: 0, max: 135, def: 5, lo: 'straight', hi: 'bent' },
    { id: 'ankle', label: 'Point the foot', min: -20, max: 45, def: 0, lo: 'toes up', hi: 'toes down' },
  ],
  presets: [
    { label: 'Standing', pose: { knee: 5, ankle: 0 } },
    { label: 'Tiptoe', pose: { knee: 0, ankle: 42 } },
    { label: 'Sitting', pose: { knee: 90, ankle: 0 } },
    { label: 'Deep bend', pose: { knee: 132, ankle: -15 } },
  ],
  groups: [
    {
      id: 'glutes',
      name: 'Glutes',
      color: '#f5a25a',
      real: 'Gluteus maximus + gluteus medius',
      where: 'Back of the hip bone and its top rim → side of the thigh bone.',
      shape: 'A big slanted box for the buttock, plus a small fan on the side of the hip above it.',
      move: 'The big block runs diagonally - high near the spine, low on the outside of the thigh.',
    },
    {
      id: 'tfl',
      name: 'Side band',
      color: '#ffd166',
      real: 'Tensor fasciae latae + iliotibial (IT) band',
      where: 'Front corner of the hip bone → a long flat strap down the outside of the thigh to the shin.',
      shape: 'A small teardrop at the hip that turns into a flat ribbon. The ribbon makes the outside of the thigh look flat.',
      move: 'Bend the knee: the ribbon stays tight on the outside and always points at the shin bone.',
    },
    {
      id: 'quads',
      name: 'Quads',
      color: '#6fb8ec',
      real: 'Rectus femoris, vastus lateralis, vastus medialis (+ kneecap tendon)',
      where: 'Hip bone and thigh bone → kneecap → bump at the top of the shin.',
      shape: 'Three blocks: a long one down the middle, a big one outside, and a teardrop low on the inside just above the knee.',
      move: 'Outside block ends high above the knee, inside teardrop ends low. Bend the knee and the whole group stretches over it.',
    },
    {
      id: 'sartorius',
      name: 'Sartorius',
      color: '#f0719f',
      real: 'Sartorius',
      where: 'Front corner of the hip bone → inside of the knee.',
      shape: 'A thin ribbon that crosses the thigh diagonally, like a sash.',
      move: 'It is the dividing line: quads on one side, inner-thigh muscles on the other.',
    },
    {
      id: 'adductors',
      name: 'Inner thigh',
      color: '#a2a9f2',
      real: 'Adductor group + gracilis',
      where: 'Pubic bone → inside of the thigh bone.',
      shape: 'A wedge - thick at the groin, thinning to nothing above the knee.',
      move: 'Fills the triangle between the sartorius and the hamstrings. It gives the upper thigh its width from the front.',
    },
    {
      id: 'hamstrings',
      name: 'Hamstrings',
      color: '#a9dd78',
      real: 'Biceps femoris (outside) + semitendinosus / semimembranosus (inside)',
      where: 'Sit bone → both sides of the knee.',
      shape: 'Two long blocks that start together and split apart like tongs behind the knee.',
      move: 'Bend the knee and the two tendons stand out like cords on each side of the knee pit.',
    },
    {
      id: 'calf',
      name: 'Calf',
      color: '#ef86b4',
      real: 'Gastrocnemius (inner + outer heads)',
      where: 'Back of the thigh bone, just above the knee → Achilles tendon.',
      shape: 'Two eggs side by side. The inner egg is bigger and hangs lower than the outer one.',
      move: 'Point the foot and both eggs bunch up. They start above the knee, so they poke out between the hamstring tendons.',
    },
    {
      id: 'soleus',
      name: 'Soleus + Achilles',
      color: '#a2a9f2',
      real: 'Soleus and the Achilles tendon',
      where: 'Back of the shin bones → heel.',
      shape: 'A flat wide block under the calf eggs - it peeks out on both sides - narrowing into a strap to the heel.',
      move: 'The heel is the handle: toes down pulls the strap short, toes up stretches it.',
    },
    {
      id: 'shin',
      name: 'Shin muscle',
      color: '#6fb8ec',
      real: 'Tibialis anterior + toe extensors',
      where: 'Outside of the shin bone → crosses the ankle to the inside of the foot.',
      shape: 'A slim spindle beside the shin bone. The bone itself stays bare on the inside - draw that edge sharp.',
      move: 'Toes up: its tendon pops out at the front of the ankle.',
    },
    {
      id: 'peroneals',
      name: 'Outer leg',
      color: '#ffd166',
      real: 'Peroneus (fibularis) longus + brevis',
      where: 'Outside of the lower leg → hooks behind the outer ankle bone.',
      shape: 'A narrow strip straight down the outside, ending in a cord behind the ankle bump.',
      move: 'The outer ankle bump sits lower and further back than the inner one.',
    },
  ],
  sweeps,
  drives: (pose) => ({ knee: pose.knee / 135, ankle: pose.ankle / 45 }),
  frames: (pose) =>
    makeFrames((name, k, get) => {
      switch (name) {
        case 'knee':
          return mul(translate(...KNEE), rotX(pose.knee * DEG * k))
        case 'tibia':
          return get('knee@1')
        case 'foot':
          return mul(get('knee@1'), translate(...ANKLE), rotX(pose.ankle * DEG))
        default:
          return IDENTITY
      }
    }),
}

const LIMB_SIDES: LessonDef['sides'] = ['Front', 'Outside', 'Back', 'Inside']

export const legLessons: LessonDef[] = [
  {
    id: 'thigh',
    rig: 'leg',
    section: 'Leg',
    title: 'Thigh',
    blurb: 'Quads in front, hamstrings behind, the inner-thigh wedge between them - and the sartorius ribbon drawing the border.',
    show: ['glutes', 'tfl', 'quads', 'sartorius', 'adductors', 'hamstrings'],
    view: { target: [-0.1, -1.9, 0], fit: [4.6, 7], az: 25, el: 5 },
    sides: LIMB_SIDES,
    tips: [
      'The thigh bone slants inward from hip to knee, so the whole thigh leans in.',
      'Above the knee: outside quad ends high, inside teardrop ends low. That diagonal is everywhere in leg drawings.',
      'From the side the front is a long bulge and the back is flatter - the bumps are not opposite each other.',
    ],
  },
  {
    id: 'lower-leg',
    rig: 'leg',
    section: 'Leg',
    title: 'Lower leg',
    blurb: 'Calf eggs at the back, a bare shin bone at the front, and thin tendons funnelling into the ankle.',
    show: ['calf', 'soleus', 'shin', 'peroneals'],
    view: { target: [-0.2, -6.7, 0.3], fit: [4.4, 5.8], az: 25, el: 5 },
    sides: LIMB_SIDES,
    tips: [
      'Calf: the inside egg is lower. Ankle: the inside bump is higher. The two diagonals cross.',
      'All the muscle is in the top half - the bottom half is mostly bone and tendon.',
      'The shin is not straight: seen from the front it curves like a gentle S.',
    ],
  },
  {
    id: 'leg',
    rig: 'leg',
    section: 'Leg',
    title: 'Whole leg',
    blurb: 'Hip to heel. Follow the zig-zag: thigh leans in, knee is a bony box, calf swings out, ankle tucks back in.',
    show: ['glutes', 'tfl', 'quads', 'sartorius', 'adductors', 'hamstrings', 'calf', 'soleus', 'shin', 'peroneals'],
    view: { target: [-0.1, -3.9, 0.2], fit: [5.2, 11.4], az: 25, el: 5 },
    sides: LIMB_SIDES,
    tips: [
      'The knee is mostly bone: kneecap, the ends of two big bones, and tendons passing by.',
      'Muscles of the lower leg start above the knee, and thigh muscles end below it - the blocks overlap like chain links.',
      'Use Sitting and Deep bend to see what stretches and what bunches up.',
    ],
  },
]
