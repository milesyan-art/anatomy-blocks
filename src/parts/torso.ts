import { Matrix4 } from 'three'
import { DEG, P, makeFrames, mirrorPoint, mul, rotX, rotY, rotZ, translate } from '../engine/frames'
import type { GroupDef, LessonDef, PathPoint, RigDef, SweepDef } from '../engine/types'
import { resize } from './body'
import { PELVIS_MIDLINE, pelvisBlocks } from './pelvis'

/*
 * Torso, facing +Z.   +X = the figure's left   +Y = up
 * The origin sits between the two hip joints. Rib cage spans y = 2 ... 5.
 *
 * Frames
 *   pelvis   hip block (never moves)
 *   w@k      waist, turned by k x the bend / lean / twist   (0 = pelvis ... 1 = ribs)
 *   ribs     rib cage (= w@1); neck and head ride along
 *   shL/shR  shoulder joint, still square to the ribs
 *   armL/R   upper arm, hanging slightly away from the body
 *
 * Everything is modelled on the left (+X) and mirrored.
 */

const WAIST: [number, number, number] = [0, 1.6, -0.35]
const SHOULDER: [number, number, number] = [1.85, 4.55, -0.05]
const ARM_OUT = 12 * DEG
const IDENTITY = new Matrix4()

const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]
const UP: PathPoint['n'] = [0, 1, 0]
const OUT: PathPoint['n'] = [1, 0, 0]

/** Things that sit on the midline (not mirrored). */
const middle: SweepDef[] = [
  ...pelvisBlocks(),
  {
    id: 'spine',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    path: [
      P('pelvis', 0, 1.0, -0.7, 0.22, 0.2, { n: FRONT }),
      P('w@0.5', 0, 1.6, -0.58, 0.2, 0.2, { n: FRONT }),
      P('ribs', 0, 2.3, -0.7, 0.2, 0.2, { n: FRONT }),
    ],
  },
  {
    id: 'ribcage',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    path: [
      P('ribs', 0, 5.12, -0.1, 0.6, 0.42, { n: FRONT }),
      P('ribs', 0, 4.75, -0.05, 1.18, 0.78, { n: FRONT }),
      P('ribs', 0, 4.0, 0, 1.36, 0.95, { n: FRONT }),
      P('ribs', 0, 3.2, 0.05, 1.36, 1.0, { n: FRONT }),
      P('ribs', 0, 2.5, 0.05, 1.26, 0.93, { n: FRONT }),
      P('ribs', 0, 2.05, 0, 1.08, 0.78, { n: FRONT }),
    ],
  },
  {
    // the soft middle between the two hard masses
    id: 'belly',
    group: 'belly',
    kind: 'prop',
    // rounder than the hard masses, so the waist muscles can wrap it
    section: 'round',
    path: [
      P('ribs', 0, 2.5, 0.05, 1.3, 0.9, { n: FRONT }),
      P('w@0.6', 0, 2.0, 0.08, 1.14, 0.84, { n: FRONT }),
      P('w@0.3', 0, 1.55, 0.08, 1.16, 0.84, { n: FRONT }),
      P('pelvis', 0, 1.1, -0.05, 1.3, 0.78, { n: FRONT }),
    ],
  },
  {
    id: 'sternum',
    group: 'bone',
    kind: 'bone',
    section: 'box',
    seg: 2,
    path: [
      P('ribs', 0, 4.92, 0.6, 0.24, 0.04, { n: [0, 0.3, 0.95] }),
      P('ribs', 0, 4.1, 0.9, 0.16, 0.04, { n: [0, 0.2, 0.98] }),
      P('ribs', 0, 3.4, 1.02, 0.08, 0.04, { n: FRONT }),
    ],
  },
  {
    id: 'head',
    group: 'head',
    kind: 'prop',
    section: 'crate',
    path: [
      P('ribs', 0, 5.0, -0.22, 0.3, 0.3, { n: FRONT }),
      P('ribs', 0, 5.72, -0.06, 0.27, 0.3, { n: FRONT }),
      P('ribs', 0, 5.95, 0.12, 0.36, 0.46, { n: FRONT }),
      P('ribs', 0, 6.45, 0.12, 0.5, 0.62, { n: FRONT }),
      P('ribs', 0, 7.05, 0.06, 0.53, 0.67, { n: FRONT }),
      P('ribs', 0, 7.5, 0, 0.4, 0.52, { n: FRONT }),
    ],
  },
]

/** The left half. */
const left: SweepDef[] = [
  // ───────────── bones + props ─────────────
  {
    id: 'clavicle',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    path: [
      P('ribs', 0.14, 4.9, 0.62, 0.08, 0.07, { n: UP }),
      P('ribs', 0.9, 4.97, 0.62, 0.07, 0.06, { n: UP }),
      P('ribs', 1.5, 5.03, 0.3, 0.07, 0.06, { n: UP }),
      P('ribs', 1.98, 5.0, -0.08, 0.1, 0.06, { n: UP }),
    ],
  },
  {
    id: 'scapula',
    group: 'bone',
    kind: 'bone',
    section: 'box',
    path: [
      P('ribs', 1.25, 4.75, -0.8, 0.55, 0.04, { n: [0.3, 0, -0.95] }),
      P('ribs', 1.15, 4.1, -0.92, 0.36, 0.04, { n: [0.3, 0, -0.95] }),
      P('ribs', 1.05, 3.5, -0.96, 0.08, 0.035, { n: [0.3, 0, -0.95] }),
    ],
  },
  {
    id: 'scapula-spine',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    seg: 2,
    path: [
      P('ribs', 0.75, 4.55, -0.95, 0.05, 0.06, { n: UP }),
      P('ribs', 1.5, 4.85, -0.7, 0.07, 0.07, { n: UP }),
      P('ribs', 2.0, 4.98, -0.2, 0.12, 0.05, { n: UP }),
    ],
  },
  {
    id: 'arm',
    group: 'arm',
    kind: 'prop',
    section: 'crate',
    path: [
      P('armL', 0, 0.1, 0, 0.3, 0.32, { n: FRONT }),
      P('armL', 0.02, -0.8, 0, 0.38, 0.46, { n: FRONT }),
      P('armL', 0, -1.8, 0, 0.36, 0.44, { n: FRONT }),
      P('armL', 0, -2.6, 0, 0.32, 0.36, { n: FRONT }),
    ],
  },

  // ───────────── front ─────────────
  {
    id: 'abs',
    group: 'abs',
    kind: 'muscle',
    bulge: 0.6,
    seg: 2,
    path: [
      P('ribs', 0.3, 3.45, 0.98, 0.26, 0.07, { n: [0, 0.2, 1] }),
      P('ribs', 0.3, 2.9, 1.06, 0.28, 0.1, { n: FRONT }),
      P('w@0.75', 0.3, 2.3, 1.04, 0.28, 0.11, { n: FRONT }),
      P('w@0.5', 0.3, 1.7, 1.0, 0.28, 0.11, { n: FRONT }),
      P('w@0.25', 0.28, 1.1, 0.96, 0.26, 0.1, { n: FRONT }),
      P('pelvis', 0.2, 0.4, 0.86, 0.2, 0.08, { n: [0, -0.2, 1] }),
      P('pelvis', 0.1, -0.12, 0.66, 0.1, 0.06, { n: [0, -0.4, 0.9] }),
    ],
    label: 2,
  },
  {
    id: 'obliques',
    group: 'obliques',
    kind: 'muscle',
    section: 'sheet',
    bulge: 0.5,
    path: [
      P('ribs', 1.15, 3.05, 0.6, 0.8, 0.08, { n: [0.8, 0, 0.6], curl: 1.6 }),
      P('w@0.6', 1.15, 2.25, 0.5, 0.95, 0.12, { n: [0.8, 0, 0.6], curl: 1.9 }),
      P('w@0.2', 1.22, 1.6, 0.42, 0.92, 0.18, { n: [0.85, 0, 0.53], curl: 1.9 }),
      P('pelvis', 1.25, 1.15, 0.4, 0.7, 0.1, { n: [0.85, 0, 0.53], curl: 1.5 }),
    ],
    label: 1,
  },
  {
    id: 'serratus',
    group: 'serratus',
    kind: 'muscle',
    seg: 2,
    path: [
      P('ribs', 1.38, 3.9, 0.35, 0.3, 0.07, { n: [0.9, 0, 0.44] }),
      P('ribs', 1.36, 3.4, 0.55, 0.3, 0.09, { n: [0.8, 0, 0.6] }),
      P('ribs', 1.22, 2.95, 0.72, 0.2, 0.07, { n: [0.7, 0, 0.71] }),
    ],
    label: 1,
  },
  {
    id: 'pec',
    group: 'pecs',
    kind: 'muscle',
    section: 'sheet',
    path: [
      P('ribs', 0.12, 4.15, 0.9, 0.72, 0.1, { n: [0, 0.15, 1] }),
      P('ribs', 0.75, 4.2, 0.98, 0.7, 0.24, { n: [0.15, 0.1, 1], curl: 0.5 }),
      P('ribs', 1.35, 4.3, 0.75, 0.5, 0.26, { n: [0.5, 0, 0.87], curl: 0.6 }),
      P('armL', 0.1, -0.6, 0.16, 0.2, 0.1, { n: [0.3, 0, 0.95] }),
    ],
    label: 1,
  },
  {
    id: 'scm',
    group: 'neck',
    kind: 'muscle',
    seg: 2,
    path: [
      P('ribs', 0.14, 4.95, 0.56, 0.07, 0.05, { n: [0.2, 0, 1] }),
      P('ribs', 0.36, 5.6, 0.2, 0.1, 0.07, { n: [0.8, 0, 0.6] }),
      P('ribs', 0.5, 6.15, -0.12, 0.08, 0.05, { n: OUT }),
    ],
    label: 1,
  },

  // ───────────── back ─────────────
  {
    id: 'erector',
    group: 'erectors',
    kind: 'muscle',
    bulge: 0.6,
    path: [
      P('pelvis', 0.3, 0.75, -0.95, 0.22, 0.08, { n: BACK }),
      P('w@0.3', 0.32, 1.4, -0.93, 0.26, 0.14, { n: BACK }),
      P('w@0.7', 0.32, 2.1, -0.9, 0.24, 0.13, { n: BACK }),
      P('ribs', 0.3, 2.9, -1.0, 0.2, 0.07, { n: BACK }),
    ],
    label: 1,
  },
  {
    id: 'lat',
    group: 'lats',
    kind: 'muscle',
    section: 'sheet',
    path: [
      P('w@0.4', 0.5, 1.9, -0.95, 0.75, 0.05, { n: BACK }),
      P('w@0.6', 0.85, 2.2, -0.97, 0.8, 0.1, { n: [0.3, 0, -0.95] }),
      P('ribs', 1.2, 2.95, -0.85, 0.7, 0.16, { n: [0.55, 0, -0.84], curl: 0.7 }),
      P('ribs', 1.5, 3.75, -0.45, 0.4, 0.2, { n: [0.85, 0, -0.53], curl: 0.7 }),
      P('armL', -0.1, -0.6, 0, 0.12, 0.07, { n: [-0.7, 0, -0.7] }),
    ],
    label: 2,
  },
  {
    id: 'scap-muscles',
    group: 'scap',
    kind: 'muscle',
    path: [
      P('ribs', 0.95, 4.1, -1.0, 0.3, 0.1, { n: [0.2, 0, -1] }),
      P('ribs', 1.45, 4.25, -0.75, 0.32, 0.14, { n: [0.5, 0, -0.87] }),
      P('armL', 0, -0.35, -0.25, 0.12, 0.08, { n: [0.3, 0, -0.95] }),
    ],
    label: 1,
  },
  {
    id: 'trap-lower',
    group: 'traps',
    kind: 'muscle',
    section: 'sheet',
    path: [
      P('ribs', 0.06, 3.95, -1.02, 1.2, 0.07, { n: BACK }),
      P('ribs', 0.7, 4.35, -1.02, 0.7, 0.12, { n: [0.1, 0, -1] }),
      P('ribs', 1.4, 4.75, -0.7, 0.3, 0.12, { n: [0.3, 0.4, -0.87] }),
      P('ribs', 1.9, 4.95, -0.3, 0.1, 0.06, { n: [0.4, 0.7, -0.6] }),
    ],
    label: 1,
  },
  {
    id: 'trap-upper',
    group: 'traps',
    kind: 'muscle',
    path: [
      P('ribs', 0.14, 6.15, -0.3, 0.16, 0.08, { n: [0.2, 0, -1] }),
      P('ribs', 0.4, 5.55, -0.5, 0.3, 0.12, { n: [0.2, 0.5, -0.85] }),
      P('ribs', 1.15, 5.12, -0.45, 0.36, 0.12, { n: [0, 0.9, -0.44] }),
      P('ribs', 1.9, 5.05, -0.15, 0.14, 0.07, { n: [0.2, 0.95, -0.2] }),
    ],
  },

  // ───────────── shoulder cap ─────────────
  {
    id: 'deltoid',
    group: 'delts',
    kind: 'muscle',
    section: 'sheet7',
    path: [
      P('shL', 0.12, 0.42, 0, 0.58, 0.1, { n: [0.5, 0.85, 0], curl: 3.2 }),
      P('shL', 0.28, 0.1, 0, 0.5, 0.23, { n: [1, 0.15, 0], curl: 3.0 }),
      P('armL', 0.24, -0.5, 0, 0.36, 0.22, { n: OUT, curl: 2.5 }),
      P('armL', 0.19, -1.0, 0, 0.2, 0.15, { n: OUT, curl: 1.6 }),
      P('armL', 0.15, -1.42, 0.01, 0.06, 0.05, { n: OUT }),
    ],
    label: 2,
  },
]

const toRight = (f: string) => f.replace('armL', 'armR').replace('shL', 'shR')

const mirror = (def: SweepDef): SweepDef => ({
  ...def,
  id: `${def.id}-r`,
  // only the left copy carries the label
  label: undefined,
  path: def.path.map((pt) => mirrorPoint(pt, toRight)),
})

/*
 * The female figure uses the same blocks, re-proportioned:
 * narrower ribs and shoulders, a pinched waist, wider hips, thinner muscles.
 */
export const RIBS_X = 0.87
const WAIST_X = 0.78
const HIPS_X = 1.07
const MIDLINE = new Set([...PELVIS_MIDLINE, 'spine', 'ribcage', 'belly', 'sternum', 'head'])

/*
 * Blocks that cannot simply be squeezed: the waist is so much narrower than
 * the ribs and hips that the obliques need their own, tighter wrap.
 * These stations are already in female proportions.
 */
const FEMALE_PATHS: Record<string, PathPoint[]> = {
  // each station sits on the corner between the front-side and side planes of the block beneath
  obliques: [
    P('ribs', 1.2, 3.05, 0.7, 0.5, 0.07, { n: [0.92, 0, 0.38], curl: 1.2 }),
    P('ribs', 1.15, 2.5, 0.4, 0.68, 0.11, { n: [0.92, 0, 0.38], curl: 1.6 }),
    P('w@0.6', 0.93, 2.0, 0.4, 0.58, 0.12, { n: [0.92, 0, 0.38], curl: 1.6 }),
    P('w@0.3', 0.95, 1.55, 0.4, 0.6, 0.14, { n: [0.92, 0, 0.38], curl: 1.6 }),
    P('pelvis', 1.47, 1.15, 0.35, 0.45, 0.07, { n: [0.92, 0, 0.38], curl: 1.0 }),
  ],
}

function feminize(def: SweepDef): SweepDef {
  const own = FEMALE_PATHS[def.id]
  if (own) return { ...def, path: own }
  const soft = def.kind === 'muscle' || def.kind === 'tendon'
  return {
    ...def,
    path: def.path.map((pt) => {
      const base = pt.f.split('@')[0]
      let kx = 1
      let kz = 1
      if (base === 'ribs') {
        kx = pt.p[1] > 5.4 ? 0.93 : RIBS_X
        kz = 0.93
      } else if (base === 'w') {
        kx = WAIST_X
        // the spine columns bridge the hollow of the back, so they keep their depth
        kz = def.id === 'erector' ? 1 : 0.9
      } else if (base === 'pelvis') {
        kx = HIPS_X
      }
      const moved: PathPoint = { ...pt, p: [pt.p[0] * kx, pt.p[1], pt.p[2] * kz] }
      if (soft) return resize(moved, Math.min(kx, 0.93), def.group === 'pecs' ? 0.55 : 0.72)
      if (MIDLINE.has(def.id)) return resize(moved, kx, kz)
      if (def.id === 'arm') return resize(moved, 0.8, 0.8)
      return moved
    }),
  }
}

const breast: SweepDef = {
  id: 'breast',
  group: 'breast',
  kind: 'muscle',
  path: [
    P('ribs', 0.5, 4.36, 1.0, 0.14, 0.04, { n: [0, 0.3, 0.95] }),
    P('ribs', 0.58, 4.0, 1.07, 0.32, 0.22, { n: [0.1, 0.1, 1] }),
    P('ribs', 0.64, 3.66, 1.08, 0.38, 0.36, { n: [0.15, -0.1, 1] }),
    P('ribs', 0.64, 3.38, 1.0, 0.24, 0.14, { n: [0.1, -0.5, 0.85] }),
  ],
  label: 2,
}

const breastGroup: GroupDef = {
  id: 'breast',
  name: 'Breast',
  color: '#ffd166',
  real: 'Fat and gland, not muscle - it sits on top of the chest muscle',
  where: 'On the lower, outer part of the chest block; the top blends in below the collarbone.',
  shape: 'A water-balloon teardrop: flat slope on top, full and round underneath. Each one points slightly outward.',
  move: 'It is attached to the rib cage, so it tilts and turns with the ribs. The chest muscle still shows above and towards the armpit.',
}

const groups: GroupDef[] = [
  {
    id: 'pecs',
    name: 'Chest',
    color: '#ef86b4',
    real: 'Pectoralis major',
    where: 'Collarbone + breastbone → front of the upper arm, tucked under the deltoid.',
    shape: 'A thick, slightly squashed box whose outer corner is pulled out to the arm, like a fan.',
    move: 'It belongs to the rib cage, so it tilts and turns with the ribs - never with the hips.',
  },
  {
    id: 'delts',
    name: 'Deltoid',
    color: '#f5a25a',
    real: 'Deltoid',
    where: 'Outer collarbone + shoulder blade → halfway down the outside of the upper arm.',
    shape: 'A shoulder pad: an upside-down teardrop that caps the corner of the torso.',
    move: 'Chest slides under its front edge, the back muscles slide under its back edge.',
  },
  {
    id: 'abs',
    name: 'Abs',
    color: '#6fb8ec',
    real: 'Rectus abdominis',
    where: 'Lower ribs → pubic bone.',
    shape: 'Two long strips of stacked pillows. The guide lines mark where the pillows divide.',
    move: 'Crunch and they squash short and thick; arch back and they stretch long and flat.',
  },
  {
    id: 'obliques',
    name: 'Obliques',
    color: '#a9dd78',
    real: 'External obliques',
    where: 'Side of the lower ribs → top rim of the hip bone.',
    shape: 'A curved sheet wrapping the waist, ending in a soft bulge that sits on the hip bone.',
    move: 'Lean sideways: one side pinches into folds, the other pulls taut. Twist: they spiral.',
  },
  {
    id: 'serratus',
    name: 'Serratus',
    color: '#f0719f',
    real: 'Serratus anterior',
    where: 'Side of the ribs, under the armpit, between chest and lats.',
    shape: 'A row of little finger shapes pointing forward and down, like a zipper against the obliques.',
    move: 'Mostly hidden by the arm - you see it when the arm lifts.',
  },
  {
    id: 'neck',
    name: 'Neck strap',
    color: '#c9a0f0',
    real: 'Sternocleidomastoid',
    where: 'Behind the ear → the notch between the collarbones.',
    shape: 'A slim strap on each side; together they make a V on the front of the neck.',
    move: 'The V always points at the pit of the neck, wherever the rib cage goes.',
  },
  {
    id: 'traps',
    name: 'Trapezius',
    color: '#a2a9f2',
    real: 'Trapezius (upper + middle / lower)',
    where: 'Skull and spine → shoulder blade and outer collarbone.',
    shape: 'A kite on the upper back, plus two sloping wedges from neck to shoulder that you also see from the front.',
    move: 'The kite stays glued to the rib cage. Its bottom tip points at the middle of the back.',
  },
  {
    id: 'lats',
    name: 'Lats',
    color: '#7fd9a4',
    real: 'Latissimus dorsi',
    where: 'Lower spine and hip rim → sweeps up into the armpit, onto the arm.',
    shape: 'A big triangle sheet: wide and thin at the bottom, narrow and thick at the armpit.',
    move: 'It links hips to arm, so it stretches on the outside of a side bend and twists like a towel.',
  },
  {
    id: 'scap',
    name: 'Shoulder blade',
    color: '#6fb8ec',
    real: 'Infraspinatus + teres major / minor',
    where: 'Shoulder blade → top of the upper arm.',
    shape: 'A chunky block filling the gap between trapezius, deltoid and lats.',
    move: 'Marks where the shoulder blade is. Its lower edge sits on top of the lats.',
  },
  {
    id: 'erectors',
    name: 'Spine columns',
    color: '#ffd166',
    real: 'Erector spinae',
    where: 'Back of the hip bone → up along both sides of the spine.',
    shape: 'Two ropes with a groove (the spine) between them. Thickest in the small of the back.',
    move: 'Arch back and they bunch up; crunch forward and they stretch and flatten.',
  },
]

function build(female: boolean): RigDef {
  const shape = female ? feminize : (d: SweepDef) => d
  const leftSide = [...left.map(shape), ...(female ? [breast] : [])]
  // labels read the left copy first, so list it first within each group
  const sweeps: SweepDef[] = [...middle.map(shape), ...leftSide, ...leftSide.map(mirror)]
  const shoulderX = SHOULDER[0] * (female ? RIBS_X : 1)

  return {
    id: 'torso',
    controls: [
      { id: 'bend', label: 'Bend forward / back', min: -22, max: 40, def: 0, lo: 'arch back', hi: 'crunch' },
      { id: 'lean', label: 'Lean sideways', min: -28, max: 28, def: 0, lo: '◀', hi: '▶' },
      { id: 'twist', label: 'Twist', min: -40, max: 40, def: 0, lo: '◀', hi: '▶' },
    ],
    presets: [
      { label: 'Upright', pose: { bend: 0, lean: 0, twist: 0 } },
      { label: 'Crunch', pose: { bend: 38, lean: 0, twist: 0 } },
      { label: 'Arch', pose: { bend: -20, lean: 0, twist: 0 } },
      { label: 'Side bend', pose: { bend: 0, lean: 26, twist: 0 } },
      { label: 'Twist', pose: { bend: 5, lean: 0, twist: 36 } },
    ],
    groups: female ? [breastGroup, ...groups] : groups,
    sweeps,
    drives: (pose) => ({ bend: pose.bend / 40 }),
    frames: (pose) =>
      makeFrames((name, k, get) => {
        switch (name) {
          case 'w':
            if (k === 0) return IDENTITY
            return mul(
              translate(...WAIST),
              rotX(pose.bend * DEG * k),
              rotZ(-pose.lean * DEG * k),
              rotY(pose.twist * DEG * k),
              translate(-WAIST[0], -WAIST[1], -WAIST[2]),
            )
          case 'ribs':
            return get('w@1')
          case 'shL':
            return mul(get('w@1'), translate(shoulderX, SHOULDER[1], SHOULDER[2]))
          case 'shR':
            return mul(get('w@1'), translate(-shoulderX, SHOULDER[1], SHOULDER[2]))
          case 'armL':
            return mul(get('shL'), rotZ(ARM_OUT))
          case 'armR':
            return mul(get('shR'), rotZ(-ARM_OUT))
          default:
            return IDENTITY
        }
      }),
  }
}

export const torsoRig = build(false)
export const torsoRigFemale = build(true)

const SIDES: LessonDef['sides'] = ['Front', 'Left side', 'Back', 'Right side']

export const torsoLessons: LessonDef[] = [
  {
    id: 'torso-front',
    rig: 'torso',
    section: 'Torso',
    title: 'Torso front',
    blurb: 'Two solid masses - rib cage and hips - with a soft, stretchy middle. Chest and shoulders ride on the ribs; abs and obliques bridge the gap.',
    show: ['breast', 'pecs', 'delts', 'abs', 'obliques', 'serratus', 'neck', 'traps'],
    view: { target: [0, 3.2, 0], fit: [6.2, 9.4], az: 20, el: 4 },
    sides: SIDES,
    tips: [
      'Draw the rib cage and the hip block first. Every pose is just those two boxes tilting against each other.',
      'Only the waist changes length. Chest stays the same size whatever the pose.',
      'On a side bend, look for the pinch on one side and the long stretch on the other.',
    ],
  },
  {
    id: 'torso-back',
    rig: 'torso',
    section: 'Torso',
    title: 'Torso back',
    blurb: 'A kite on top, two big triangles sweeping up to the armpits, and two ropes along the spine.',
    show: ['traps', 'delts', 'scap', 'lats', 'erectors', 'obliques'],
    view: { target: [0, 3.2, 0], fit: [6.2, 9.4], az: 200, el: 4 },
    sides: SIDES,
    tips: [
      'The spine is a groove, not a ridge - the muscles on both sides stand up higher than the bone.',
      'Lats make the V-shape of the back: wide under the armpits, narrow at the waist.',
      'Twist the torso and watch the kite stay square to the shoulders while the hips stay put.',
    ],
  },
]
