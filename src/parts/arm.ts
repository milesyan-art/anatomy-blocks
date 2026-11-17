import { Matrix4, Vector3 } from 'three'
import { DEG, P, makeFrames, mul, rotAbout, rotX, rotZ, translate } from '../engine/frames'
import type { LessonDef, PathPoint, RigDef, SweepDef, Vec3 } from '../engine/types'
import { humerusSolid, radiusSolid, ulnaSolid } from './armBones'
import { SHOULDER, clavicleSolid, scapulaSolid } from './torsoBones'

/*
 * LEFT arm, hanging down, palm forward.
 *   +X = outside (thumb side)   +Y = up   +Z = front
 * 1 unit is roughly 10 cm. Shoulder joint sits at the origin, elbow at y = -3.
 *
 * Frames
 *   sh    shoulder girdle (never moves)
 *   hum   upper arm bone
 *   fa    forearm, glued to the ulna (follows the elbow hinge only)
 *   fa@k  forearm twisted by k x the full twist  (0 = ulna ... 1 = radius)
 *   rad   radius (= fa@1)
 *   hand  hand, rides on the radius
 */

const ELBOW_Y = -3
const CARRY = 6 * DEG
// The forearm twists around a line from the radius head (elbow) to the ulna head (wrist).
const RADIUS_HEAD = new Vector3(0.21, -0.08, 0.02)
const ULNA_HEAD = new Vector3(-0.2, -2.48, 0)
const TWIST_AXIS = ULNA_HEAD.clone().sub(RADIUS_HEAD).normalize()
const IDENTITY = new Matrix4()
/** From the torso's space to this rig's, where the shoulder joint is the origin. */
const TO_SHOULDER: Vec3 = [-SHOULDER[0], -SHOULDER[1], -SHOULDER[2]]

const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]
const OUT: PathPoint['n'] = [1, 0, 0]

const elbowKey = (p: [number, number, number], w: number, h: number) => ({
  alt: { drive: 'elbow', p, w, h },
})

const finger = (id: string, x: number, len: number): SweepDef => ({
  id,
  group: 'hand',
  kind: 'prop',
  section: 'box',
  seg: 2,
  path: [
    P('hand', x, -0.93, 0.02, 0.09, 0.075, { n: FRONT }),
    P('hand', x * 1.06, -0.93 - len * 0.5, 0.07, 0.085, 0.07, { n: FRONT }),
    P('hand', x * 1.1, -0.93 - len, 0.2, 0.07, 0.06, { n: FRONT }),
  ],
})

const sweeps: SweepDef[] = [
  // ───────────── bones ─────────────
  // the torso's collarbone and shoulder blade, moved so its shoulder joint sits at this
  // rig's origin; the arm bones are shared with the torso (see armBones.ts, torsoBones.ts)
  { id: 'clavicle', group: 'bone', kind: 'bone', path: [], solid: clavicleSolid('sh', TO_SHOULDER) },
  { id: 'scapula', group: 'bone', kind: 'bone', path: [], solid: scapulaSolid('sh', TO_SHOULDER) },
  { id: 'humerus', group: 'bone', kind: 'bone', path: [], solid: humerusSolid('hum') },
  { id: 'ulna', group: 'bone', kind: 'bone', path: [], solid: ulnaSolid('fa') },
  { id: 'radius', group: 'bone', kind: 'bone', path: [], solid: radiusSolid('rad') },

  // ───────────── hand (just a mitten of blocks, for orientation) ─────────────
  {
    id: 'palm',
    group: 'hand',
    kind: 'prop',
    section: 'box',
    path: [
      P('hand', 0, 0, 0, 0.29, 0.12, { n: FRONT }),
      P('hand', 0, -0.45, 0, 0.4, 0.13, { n: FRONT }),
      P('hand', -0.01, -0.95, 0.02, 0.42, 0.1, { n: FRONT }),
    ],
  },
  finger('finger-1', 0.3, 0.85),
  finger('finger-2', 0.1, 0.95),
  finger('finger-3', -0.1, 0.88),
  finger('finger-4', -0.3, 0.68),
  {
    id: 'thumb',
    group: 'hand',
    kind: 'prop',
    section: 'box',
    seg: 2,
    path: [
      P('hand', 0.27, -0.1, 0.06, 0.14, 0.12, { n: [0.5, 0, 0.85] }),
      P('hand', 0.5, -0.5, 0.16, 0.12, 0.1, { n: [0.5, 0, 0.85] }),
      P('hand', 0.62, -0.85, 0.24, 0.085, 0.075, { n: [0.5, 0, 0.85] }),
      P('hand', 0.68, -1.12, 0.3, 0.065, 0.06, { n: [0.5, 0, 0.85] }),
    ],
  },

  // ───────────── upper arm ─────────────
  {
    id: 'brachialis',
    group: 'brachialis',
    kind: 'muscle',
    path: [
      P('hum', 0.1, -1.4, 0.1, 0.1, 0.05, { n: [0.5, 0, 0.87] }),
      P('hum', 0.03, -2.0, 0.16, 0.33, 0.13, { n: [0.08, 0, 1], curl: 2.5 }),
      P('hum', 0, -2.6, 0.18, 0.34, 0.14, { n: FRONT, curl: 2.4, ...elbowKey([0, -2.35, 0.2], 0.34, 0.17) }),
      P('fa', -0.08, -0.4, 0.12, 0.1, 0.05, { n: FRONT }),
    ],
    label: 2,
  },
  {
    id: 'biceps',
    group: 'biceps',
    kind: 'muscle',
    path: [
      P('sh', -0.02, 0.18, 0.26, 0.08, 0.06, { n: [0.1, 0, 1] }),
      P('hum', 0.06, -0.35, 0.3, 0.14, 0.1, { n: [0.1, 0, 1] }),
      P('hum', 0.02, -0.9, 0.34, 0.25, 0.19, { n: [0.05, 0, 1], ...elbowKey([0.02, -0.8, 0.36], 0.26, 0.22) }),
      P('hum', -0.01, -1.6, 0.34, 0.3, 0.24, { n: FRONT, ...elbowKey([-0.01, -1.35, 0.38], 0.33, 0.38) }),
      P('hum', -0.01, -2.2, 0.36, 0.24, 0.17, { n: FRONT, ...elbowKey([-0.01, -1.9, 0.42], 0.27, 0.25) }),
      P('hum', 0, -2.7, 0.36, 0.1, 0.07, { n: FRONT, ...elbowKey([0.03, -2.35, 0.38], 0.09, 0.07) }),
      P('rad', 0.15, -0.45, 0.1, 0.05, 0.04, { n: FRONT }),
    ],
    label: 3,
  },
  {
    id: 'triceps-medial',
    group: 'triceps',
    kind: 'muscle',
    bulge: 0.4,
    path: [
      P('hum', -0.02, -1.5, -0.18, 0.2, 0.08, { n: BACK, curl: 1.4 }),
      P('hum', 0, -2.2, -0.17, 0.33, 0.11, { n: BACK, curl: 2.0 }),
      P('hum', 0, -2.75, -0.15, 0.33, 0.1, { n: BACK, curl: 2.0 }),
      P('fa', -0.05, 0.15, -0.26, 0.14, 0.05, { n: BACK }),
    ],
  },
  {
    id: 'triceps-long',
    group: 'triceps',
    kind: 'muscle',
    bulge: 0.5,
    path: [
      P('sh', -0.3, -0.12, -0.2, 0.1, 0.08, { n: [-0.6, 0, -0.8] }),
      P('hum', -0.26, -0.8, -0.22, 0.24, 0.21, { n: [-0.65, 0, -0.76] }),
      P('hum', -0.2, -1.45, -0.25, 0.25, 0.23, { n: [-0.55, 0, -0.84] }),
      P('hum', -0.1, -2.0, -0.27, 0.16, 0.1, { n: [-0.3, 0, -0.95] }),
    ],
    label: 2,
  },
  {
    id: 'triceps-lateral',
    group: 'triceps',
    kind: 'muscle',
    bulge: 0.5,
    path: [
      P('hum', 0.2, -0.55, -0.16, 0.1, 0.08, { n: [0.7, 0, -0.71] }),
      P('hum', 0.25, -1.05, -0.2, 0.25, 0.21, { n: [0.7, 0, -0.71] }),
      P('hum', 0.22, -1.55, -0.22, 0.24, 0.19, { n: [0.6, 0, -0.8] }),
      P('hum', 0.12, -2.05, -0.26, 0.14, 0.09, { n: [0.4, 0, -0.92] }),
    ],
  },
  {
    id: 'triceps-tendon',
    group: 'triceps',
    kind: 'tendon',
    bulge: 0.4,
    path: [
      P('hum', 0.02, -1.45, -0.34, 0.1, 0.08, { n: BACK }),
      P('hum', 0, -2.1, -0.3, 0.24, 0.12, { n: BACK }),
      P('hum', 0, -2.7, -0.24, 0.2, 0.1, { n: BACK }),
      P('fa', -0.05, 0.2, -0.3, 0.13, 0.06, { n: BACK }),
    ],
  },
  {
    id: 'deltoid',
    group: 'deltoid',
    kind: 'muscle',
    section: 'sheet7',
    path: [
      P('sh', 0.12, 0.42, 0, 0.58, 0.1, { n: [0.5, 0.85, 0], curl: 3.2 }),
      P('sh', 0.28, 0.1, 0, 0.5, 0.23, { n: [1, 0.15, 0], curl: 3.0 }),
      P('hum', 0.24, -0.5, 0, 0.36, 0.22, { n: OUT, curl: 2.5 }),
      P('hum', 0.19, -1.0, 0, 0.2, 0.15, { n: OUT, curl: 1.6 }),
      P('hum', 0.15, -1.42, 0.01, 0.06, 0.05, { n: OUT }),
    ],
    label: 2,
  },

  // ───────────── forearm ─────────────
  {
    id: 'flexors',
    group: 'flexors',
    kind: 'muscle',
    bulge: 0.5,
    path: [
      P('hum', -0.36, -2.9, 0, 0.09, 0.07, { n: [-0.75, 0, 0.66] }),
      P('fa@0.05', -0.26, -0.3, 0.08, 0.26, 0.23, { n: [-0.6, 0, 0.8] }),
      P('fa@0.2', -0.15, -0.85, 0.12, 0.31, 0.23, { n: [-0.4, 0, 0.92] }),
      P('fa@0.5', -0.07, -1.5, 0.11, 0.25, 0.15, { n: [-0.25, 0, 0.97] }),
      P('fa@0.85', 0, -2.1, 0.08, 0.2, 0.08, { n: [-0.1, 0, 1] }),
      P('fa@1', 0.03, -2.5, 0.07, 0.19, 0.05, { n: FRONT }),
    ],
    label: 2,
  },
  {
    id: 'extensors',
    group: 'extensors',
    kind: 'muscle',
    bulge: 0.5,
    path: [
      P('hum', 0.32, -2.9, -0.06, 0.07, 0.05, { n: [0.6, 0, -0.8] }),
      P('fa@0.05', 0.2, -0.35, -0.13, 0.18, 0.15, { n: [0.5, 0, -0.87] }),
      P('fa@0.25', 0.1, -0.9, -0.15, 0.24, 0.17, { n: [0.3, 0, -0.95] }),
      P('fa@0.55', 0.04, -1.6, -0.1, 0.2, 0.1, { n: [0.15, 0, -0.99] }),
      P('fa@0.9', 0.03, -2.2, -0.08, 0.18, 0.05, { n: BACK }),
      P('fa@1', 0.03, -2.5, -0.07, 0.18, 0.04, { n: BACK }),
    ],
    label: 2,
  },
  {
    id: 'ridge',
    group: 'ridge',
    kind: 'muscle',
    bulge: 0.6,
    path: [
      P('hum', 0.2, -2.1, 0, 0.07, 0.05, { n: [1, 0, 0.2] }),
      P('hum', 0.3, -2.52, 0.06, 0.15, 0.13, { n: [0.9, 0, 0.44] }),
      P('fa@0.1', 0.36, -0.3, 0.12, 0.2, 0.2, { n: [0.85, 0, 0.53] }),
      P('fa@0.3', 0.33, -0.85, 0.14, 0.2, 0.18, { n: [0.75, 0, 0.66] }),
      P('fa@0.65', 0.29, -1.45, 0.1, 0.12, 0.1, { n: [0.85, 0, 0.53] }),
      P('fa@1', 0.3, -2.3, 0.04, 0.05, 0.035, { n: OUT }),
    ],
    label: 3,
  },
]

/** The body's midline: the shoulder joints sit this far either side of it (matches the torso). */
export const ARM_MID_X = -1.85

export const armRig: RigDef = {
  id: 'arm',
  midX: ARM_MID_X,
  controls: [
    { id: 'elbow', label: 'Bend the elbow', min: 0, max: 145, def: 10, lo: 'straight', hi: 'bent' },
    { id: 'twist', label: 'Twist the forearm', min: 0, max: 160, def: 0, lo: 'palm up', hi: 'palm down' },
  ],
  presets: [
    { label: 'Palm up', pose: { elbow: 10, twist: 0 } },
    { label: 'Palm down', pose: { elbow: 10, twist: 160 } },
    { label: 'Thumb up', pose: { elbow: 90, twist: 80 } },
    { label: 'Flex!', pose: { elbow: 138, twist: 0 } },
  ],
  groups: [
    {
      id: 'deltoid',
      name: 'Deltoid',
      color: '#ef86b4',
      real: 'Deltoid (front, side and back heads)',
      where: 'Collarbone + shoulder blade → outside of the upper arm, about halfway down.',
      shape: 'An upside-down teardrop, like a shoulder pad. Its point pokes down between the biceps and triceps.',
      move: 'It caps the top of the arm, so the biceps and triceps both slide out from underneath it.',
    },
    {
      id: 'biceps',
      name: 'Biceps',
      color: '#6fb8ec',
      real: 'Biceps brachii',
      where: 'Under the deltoid → a cord-like tendon that dives into the forearm (onto the radius).',
      shape: 'A long box on the front of the arm. Straight arm = long and flat. Bent arm = short and tall.',
      move: 'Bend the elbow: it shortens and the peak climbs towards the shoulder. Because it grabs the radius, it also helps turn the palm up.',
    },
    {
      id: 'brachialis',
      name: 'Brachialis',
      color: '#f5a25a',
      real: 'Brachialis',
      where: 'Lower half of the upper arm bone → ulna, just past the elbow.',
      shape: 'A wide flat wedge hiding under the biceps. You only see its edges peeking out on both sides.',
      move: 'It is the hidden workhorse of bending. Look for the orange strip between biceps and triceps on the outside view.',
    },
    {
      id: 'triceps',
      name: 'Triceps',
      color: '#a9dd78',
      real: 'Triceps brachii (long + lateral heads) and its flat tendon',
      where: 'Shoulder blade + back of the upper arm → tip of the elbow (ulna).',
      shape: 'Two bellies up high and a flat tendon plate below - think of a horseshoe sitting on a board.',
      move: 'Straight arm: bunched up near the shoulder. Bend the elbow and it stretches long and flat around the back.',
    },
    {
      id: 'ridge',
      name: 'Ridge muscles',
      color: '#f0719f',
      real: 'Brachioradialis + extensor carpi radialis longus',
      where: 'Outside of the upper arm (above the elbow!) → thumb side of the wrist.',
      shape: 'A short fat teardrop that crosses the elbow and dives back into the forearm about halfway down.',
      move: 'It always chases the thumb. Twist to palm-down and watch it wrap over the top of the forearm.',
    },
    {
      id: 'flexors',
      name: 'Flexors',
      color: '#7fd9a4',
      real: 'Wrist + finger flexors and pronator teres',
      where: 'Inner bump of the elbow → palm side of the wrist.',
      shape: 'A big egg near the elbow that thins into flat tendons. Its outline is one long, smooth curve.',
      move: 'Starts on the inside of the elbow and always ends on the palm side - so it spirals when you twist.',
    },
    {
      id: 'extensors',
      name: 'Extensors',
      color: '#a2a9f2',
      real: 'Wrist + finger extensors',
      where: 'Outer bump of the elbow → back of the hand.',
      shape: 'A slimmer, flatter block on the back of the forearm, ending in a flat ribbon of tendons.',
      move: 'Always ends on the back of the hand. Between it and the flexors you can feel the ulna bone.',
    },
  ],
  sweeps,
  drives: (pose) => ({ elbow: pose.elbow / 145, twist: pose.twist / 160 }),
  frames: (pose) =>
    makeFrames((name, k, get) => {
      switch (name) {
        case 'fa': {
          const m = mul(translate(0, ELBOW_Y, 0), rotX(-pose.elbow * DEG), rotZ(CARRY))
          if (k > 0) m.multiply(rotAbout(RADIUS_HEAD, TWIST_AXIS, pose.twist * DEG * k))
          return m
        }
        case 'rad':
          return get('fa@1')
        case 'hand':
          return mul(get('fa@1'), translate(0.04, -2.58, 0))
        default:
          return IDENTITY
      }
    }),
}

const LIMB_SIDES: LessonDef['sides'] = ['Front', 'Outside', 'Back', 'Inside']

export const armLessons: LessonDef[] = [
  {
    id: 'forearm',
    rig: 'arm',
    section: 'Arm',
    title: 'Forearm',
    blurb: 'Three blocks: flexors on the palm side, extensors on the back, and the ridge muscles riding on the thumb side.',
    show: ['ridge', 'flexors', 'extensors'],
    view: { target: [0.15, -5.0, 0.1], fit: [3.4, 6.0], az: 22, el: 8 },
    sides: LIMB_SIDES,
    tips: [
      'The two sides are never mirror images: the flexor side is one long curve, the ridge side is a short bump up high.',
      'Slide Twist slowly. The elbow end stays put - only the wrist end travels.',
      'The wrist is boxy and bony. Let the muscles thin out before they reach it.',
    ],
  },
  {
    id: 'upper-arm',
    rig: 'arm',
    section: 'Arm',
    title: 'Upper arm',
    blurb: 'Biceps in front, triceps behind, the brachialis squeezed between them, and the deltoid capping the top.',
    show: ['deltoid', 'biceps', 'brachialis', 'triceps'],
    view: { target: [0, -1.4, 0], fit: [3.8, 4.8], az: 28, el: 6 },
    sides: LIMB_SIDES,
    tips: [
      'Front and back bumps sit at different heights: on a straight arm the triceps bulge is high, the biceps bulge is lower.',
      'The deltoid ends in a point about halfway down the arm - a handy landmark.',
      'Bend the elbow and watch biceps get short while triceps gets long.',
    ],
  },
  {
    id: 'arm',
    rig: 'arm',
    section: 'Arm',
    title: 'Whole arm',
    blurb: 'Everything together. Notice how the forearm blocks start above the elbow and overlap the upper-arm blocks like chain links.',
    show: ['deltoid', 'biceps', 'brachialis', 'triceps', 'ridge', 'flexors', 'extensors'],
    view: { target: [0.1, -3.5, 0], fit: [4.2, 8.8], az: 22, el: 6 },
    sides: LIMB_SIDES,
    tips: [
      'The arm tapers from shoulder to wrist - big blocks up top, thin tendons at the bottom.',
      'Upper arm is deep front-to-back; the forearm is wide side-to-side (when the palm faces forward).',
      'Try the four presets and compare the silhouettes.',
    ],
  },
]
