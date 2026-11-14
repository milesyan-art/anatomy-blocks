import { Matrix4 } from 'three'
import { DEG, P, makeFrames, mul, rotX, rotY, rotZ, translate } from '../engine/frames'
import type { LessonDef, PathPoint, RigDef, SweepDef } from '../engine/types'

/*
 * LEFT hand, fingers pointing down, palm facing +Z, thumb on +X.
 * Wrist at the origin. 1 unit is roughly 10 cm.
 *
 * Frames
 *   palm              the palm block (never moves)
 *   indexA/B/C ...    the three finger bones, knuckle to tip
 *   thA/B/C           thumb: base bone (inside the thumb pad), then two free bones
 */

const IDENTITY = new Matrix4()
const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]

interface Finger {
  id: string
  /** knuckle position on the palm */
  x: number
  y: number
  /** bone lengths, knuckle to tip */
  a: number
  b: number
  c: number
  /** which way (and how much) it fans out */
  fan: number
}

const FINGERS: Finger[] = [
  { id: 'index', x: 0.3, y: -0.98, a: 0.46, b: 0.27, c: 0.23, fan: 1 },
  { id: 'middle', x: 0.1, y: -1.02, a: 0.5, b: 0.31, c: 0.25, fan: 0.3 },
  { id: 'ring', x: -0.1, y: -0.98, a: 0.46, b: 0.29, c: 0.24, fan: -0.4 },
  { id: 'pinky', x: -0.29, y: -0.9, a: 0.36, b: 0.21, c: 0.21, fan: -1 },
]

const THUMB = { base: [0.3, -0.2, 0.08] as const, a: 0.42, b: 0.3, c: 0.27 }

const bone = (id: string, f: string, len: number, w0: number, w1: number, tip = false): SweepDef => ({
  id,
  group: 'bone',
  kind: 'bone',
  section: 'box',
  seg: 1,
  path: [
    P(f, 0, 0.03, 0, w0, w0 * 0.9, { n: FRONT }),
    P(f, 0, -len, tip ? 0.01 : 0, w1, tip ? w1 * 0.7 : w1 * 0.9, { n: FRONT }),
  ],
})

const fingerBones = FINGERS.flatMap((f) => [
  bone(`${f.id}-1`, `${f.id}A`, f.a, 0.1, 0.09),
  bone(`${f.id}-2`, `${f.id}B`, f.b, 0.09, 0.082),
  bone(`${f.id}-3`, `${f.id}C`, f.c, 0.082, 0.07, true),
])

const tendons: SweepDef[] = FINGERS.map((f) => ({
  id: `tendon-${f.id}`,
  group: 'tendons',
  kind: 'tendon',
  path: [
    P('palm', f.x * 0.25, -0.02, -0.14, 0.035, 0.025, { n: BACK }),
    P('palm', f.x * 0.7, -0.5, -0.15, 0.035, 0.025, { n: BACK }),
    P('palm', f.x, f.y + 0.03, -0.12, 0.04, 0.035, { n: BACK }),
    P(`${f.id}A`, 0, -0.14, -0.09, 0.03, 0.02, { n: BACK }),
  ],
  label: f.id === 'middle' ? 1 : undefined,
}))

const sweeps: SweepDef[] = [
  // ───────────── base blocks ─────────────
  {
    id: 'forearm',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    seg: 2,
    path: [P('palm', 0, 0.75, 0, 0.33, 0.21, { n: FRONT }), P('palm', 0, 0.1, 0, 0.29, 0.15, { n: FRONT })],
  },
  {
    id: 'palm',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    seg: 2,
    path: [
      P('palm', 0, 0.04, 0, 0.3, 0.13, { n: FRONT }),
      P('palm', 0, -0.5, 0, 0.42, 0.14, { n: FRONT }),
      P('palm', 0, -1.0, 0, 0.44, 0.11, { n: FRONT }),
    ],
  },
  ...fingerBones,
  bone('thumb-1', 'thA', THUMB.a, 0.11, 0.1),
  bone('thumb-2', 'thB', THUMB.b, 0.1, 0.09),
  bone('thumb-3', 'thC', THUMB.c, 0.09, 0.075, true),

  // ───────────── the soft parts ─────────────
  {
    id: 'thenar',
    group: 'thenar',
    kind: 'muscle',
    bulge: 0.5,
    path: [
      P('palm', 0.1, -0.06, 0.1, 0.12, 0.07, { n: [0.2, 0, 1] }),
      P('palm', 0.24, -0.36, 0.12, 0.21, 0.17, { n: [0.3, 0, 0.95] }),
      P('thA', 0, -0.4, 0.05, 0.12, 0.07, { n: FRONT }),
    ],
    label: 1,
  },
  {
    id: 'hypothenar',
    group: 'hypothenar',
    kind: 'muscle',
    path: [
      P('palm', -0.18, -0.06, 0.1, 0.1, 0.06, { n: [-0.3, 0, 0.95] }),
      P('palm', -0.3, -0.42, 0.11, 0.15, 0.13, { n: [-0.4, 0, 0.92] }),
      P('palm', -0.35, -0.82, 0.08, 0.08, 0.06, { n: [-0.4, 0, 0.92] }),
    ],
    label: 1,
  },
  {
    id: 'pads',
    group: 'pads',
    kind: 'muscle',
    path: [
      P('palm', 0.4, -0.88, 0.09, 0.11, 0.06, { n: FRONT }),
      P('palm', 0.05, -0.93, 0.1, 0.12, 0.08, { n: FRONT }),
      P('palm', -0.38, -0.84, 0.08, 0.1, 0.06, { n: FRONT }),
    ],
    label: 1,
  },
  {
    id: 'web',
    group: 'web',
    kind: 'muscle',
    bulge: 0.5,
    path: [
      P('palm', 0.3, -0.8, -0.07, 0.07, 0.04, { n: [0.5, 0, -0.87] }),
      P('palm', 0.37, -0.52, -0.03, 0.13, 0.09, { n: [0.6, 0, -0.8] }),
      P('thA', 0.02, -0.38, -0.06, 0.07, 0.04, { n: [0.3, 0, -0.95] }),
    ],
    label: 1,
  },
  ...tendons,
]

export const handRig: RigDef = {
  id: 'hand',
  controls: [
    { id: 'curl', label: 'Curl the fingers', min: 0, max: 90, def: 14, lo: 'open', hi: 'fist' },
    { id: 'spread', label: 'Spread the fingers', min: 0, max: 20, def: 6, lo: 'together', hi: 'fanned' },
    { id: 'thumb', label: 'Move the thumb', min: 0, max: 100, def: 15, lo: 'out', hi: 'across' },
  ],
  presets: [
    { label: 'Relaxed', pose: { curl: 14, spread: 6, thumb: 15 } },
    { label: 'Flat', pose: { curl: 0, spread: 16, thumb: 0 } },
    { label: 'Grip', pose: { curl: 55, spread: 2, thumb: 60 } },
    { label: 'Fist', pose: { curl: 90, spread: 0, thumb: 100 } },
  ],
  groups: [
    {
      id: 'thenar',
      name: 'Thumb pad',
      color: '#f0719f',
      real: 'Thenar muscles',
      where: 'Heel of the palm → base of the thumb.',
      shape: 'A fat egg - the biggest soft form in the hand. It wraps the hidden first bone of the thumb.',
      move: 'Slide the thumb across and the egg rolls into the palm and gets rounder.',
    },
    {
      id: 'hypothenar',
      name: 'Pinky pad',
      color: '#6fb8ec',
      real: 'Hypothenar muscles',
      where: 'Heel of the palm → base of the little finger.',
      shape: 'A long thin wedge down the little-finger edge. It is the part that rests on the table when you write.',
      move: 'With the thumb pad it makes a V at the wrist; the hollow of the palm sits between them.',
    },
    {
      id: 'pads',
      name: 'Knuckle pad',
      color: '#ffd166',
      real: 'Pads over the finger joints (fat, not muscle)',
      where: 'Straight across the palm, just under the fingers.',
      shape: 'A soft sausage. From the palm side it hides the knuckles, so fingers look shorter here than from the back.',
      move: 'Curl the fingers: they fold at the far edge of this pad, not at the top of the palm.',
    },
    {
      id: 'web',
      name: 'Thumb web',
      color: '#a9dd78',
      real: 'First dorsal interosseous',
      where: 'Back of the hand, between the thumb and the index knuckle.',
      shape: 'A little teardrop bump - the only real muscle you see on the back of the hand.',
      move: 'Thumb in: it bunches into a mound. Thumb out: it stretches into a flat web.',
    },
    {
      id: 'tendons',
      name: 'Finger tendons',
      color: '#a2a9f2',
      real: 'Extensor tendons',
      where: 'Middle of the wrist → fanning out to each knuckle.',
      shape: 'Thin cords in a fan. Draw them as light lines, not ridges.',
      move: 'They aim at the knuckles, so they bend over the top of the fist when the fingers curl.',
    },
  ],
  sweeps,
  drives: (pose) => ({ curl: pose.curl / 90, thumb: pose.thumb / 100 }),
  frames: (pose) => {
    const curl = pose.curl
    const t = pose.thumb / 100
    const fan = pose.spread * (1 - (curl / 90) * 0.8)
    const lerp = (a: number, b: number) => a + (b - a) * t
    return makeFrames((name, _k, get) => {
      if (name === 'thA') {
        return mul(
          translate(THUMB.base[0], THUMB.base[1], THUMB.base[2]),
          rotZ(lerp(40, -4) * DEG),
          rotX(lerp(-12, -52) * DEG),
          rotY(lerp(-55, -85) * DEG),
        )
      }
      if (name === 'thB') return mul(get('thA'), translate(0, -THUMB.a, 0), rotX(-(8 + t * 32 + curl * 0.2) * DEG))
      if (name === 'thC') return mul(get('thB'), translate(0, -THUMB.b, 0), rotX(-(6 + t * 44 + curl * 0.3) * DEG))
      const f = FINGERS.find((x) => name.startsWith(x.id))
      if (!f) return IDENTITY
      switch (name.slice(f.id.length)) {
        case 'A':
          return mul(translate(f.x, f.y, 0), rotZ(fan * f.fan * DEG), rotX(-curl * 0.95 * DEG))
        case 'B':
          return mul(get(`${f.id}A`), translate(0, -f.a, 0), rotX(-curl * 1.1 * DEG))
        default:
          return mul(get(`${f.id}B`), translate(0, -f.b, 0), rotX(-curl * 0.75 * DEG))
      }
    })
  },
}

export const handLessons: LessonDef[] = [
  {
    id: 'hand',
    rig: 'hand',
    section: 'Arm',
    title: 'Hand',
    blurb: 'A box for the palm, stacked boxes for the fingers, and three soft pads. Almost everything you see on a hand is bone and padding - very little muscle.',
    show: ['thenar', 'hypothenar', 'pads', 'web', 'tendons'],
    view: { target: [0.1, -0.8, 0], fit: [3.0, 3.5], az: 18, el: 6 },
    sides: ['Palm', 'Thumb side', 'Back', 'Pinky side'],
    tips: [
      'The knuckles sit on a curve, not a straight line - the middle finger is the top of the arch.',
      'Each finger is three boxes that get shorter towards the tip. The thumb only shows two.',
      'The thumb starts down at the wrist, not at the side of the palm: its first bone is buried in the thumb pad.',
    ],
  },
]
