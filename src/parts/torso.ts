import { Matrix4 } from 'three'
import { DEG, P, arc, cage, makeFrames, mirrorPoint, mirrorSkin, mul, rotX, rotY, rotZ, translate } from '../engine/frames'
import type { GroupDef, LessonDef, PathPoint, RigDef, SkinDef, SkinPoint, SweepDef } from '../engine/types'
import { resize } from './body'
import { pelvisBlocks, pelvisBowl } from './pelvis'

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
const ARM_OUT = 15 * DEG
const IDENTITY = new Matrix4()

const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]
const UP: PathPoint['n'] = [0, 1, 0]
const OUT: PathPoint['n'] = [1, 0, 0]

/*
 * The spine between the rib cage and the hips, as one bendy block - not a stack of
 * vertebrae. Each station rides its own share of the waist turn, so it curves with a bend.
 */
const spine: SweepDef = {
  id: 'spine',
  group: 'bone',
  kind: 'bone',
  section: 'crate',
  path: [
    P('ribs', 0, 3.05, -0.62, 0.22, 0.24, { n: FRONT }),
    P('w@0.8', 0, 2.5, -0.58, 0.23, 0.24, { n: FRONT }),
    P('w@0.5', 0, 1.95, -0.52, 0.25, 0.24, { n: FRONT }),
    P('w@0.2', 0, 1.45, -0.52, 0.26, 0.24, { n: FRONT }),
    P('pelvis', 0, 1.0, -0.56, 0.27, 0.22, { n: FRONT }),
  ],
}

/*
 * The rib cage in one piece: a hollow egg, closed round the top, that opens at the
 * front below the breastbone into the arch of the lower ribs. The back stays nearly
 * upright and the front does the sloping - as on the real cage - which also keeps
 * every ring level.
 *   y, back z, outer width, outer depth (half sizes), half-width of the front gap in degrees
 */
const CAGE: [number, number, number, number, number][] = [
  [5.16, -0.8, 0.58, 0.42, 0],
  [4.8, -0.86, 1.12, 0.78, 0],
  [4.15, -0.94, 1.34, 0.94, 0],
  [3.6, -0.97, 1.38, 0.98, 0],
  [3.25, -0.97, 1.39, 0.97, 2.5],
  [2.85, -0.96, 1.36, 0.94, 13.6],
  [2.45, -0.94, 1.24, 0.89, 31.7],
  [2.15, -0.9, 1.12, 0.82, 50],
  [1.98, -0.87, 1.0, 0.75, 65.6],
]

/** The rib cage's stations, narrowed by kx and made shallower by kz. */
function ribcage(kx: number, kz: number): PathPoint[] {
  // a slightly boxy oval: broad, flattish back and sides, like the real cage
  return CAGE.map(([y, back, w, d, open]) =>
    cage('ribs', y, (back + d) * kz, w * kx, d * kz, open, 0.1 * kz, 0.78),
  )
}

/*
 * The flank is not swept like the other blocks: it has to hug the ribs, pinch in at
 * the waist and settle on the hip bone, and a block pushed along a path creases
 * where those meet. It is a skin instead - a smooth pad pinned to the outline of the
 * trunk - so each body only has to say what its outline is.
 *
 * The trunk seen from above, at a few heights, as a slightly boxy oval:
 *   y, half width, z of the front, z of the back, z of the widest point, thickness of the pad
 */
type Trunk = [number, number, number, number, number, number][]

const TRUNK: Trunk = [
  [3.45, 1.445, 1.08, -1.02, -0.02, 0.06],
  [2.85, 1.41, 1.08, -1.02, -0.04, 0.08],
  [2.45, 1.33, 1.06, -1.0, -0.06, 0.11],
  [2.05, 1.27, 1.03, -0.98, -0.08, 0.13],
  [1.78, 1.31, 1.0, -0.98, -0.1, 0.12],
  // from here down the outline is the hip bone itself: its rim, then its front point
  [1.5, 1.43, 0.98, -0.98, -0.12, 0.08],
  [1.26, 1.39, 0.95, -0.96, -0.1, 0.08],
  [0.81, 1.37, 0.9, -0.95, -0.1, 0.07],
  [0.38, 1.3, 0.8, -0.95, -0.1, 0.05],
  [0.0, 1.1, 0.68, -0.95, -0.1, 0.04],
]

const TRUNK_FEMALE: Trunk = [
  [3.45, 1.26, 1.0, -0.95, -0.02, 0.05],
  [2.85, 1.23, 1.0, -0.95, -0.04, 0.06],
  [2.45, 1.12, 0.97, -0.94, -0.06, 0.08],
  [2.15, 1.04, 0.94, -0.93, -0.08, 0.1],
  [1.85, 1.1, 0.92, -0.94, -0.1, 0.1],
  [1.5, 1.33, 0.9, -0.96, -0.12, 0.07],
  [1.26, 1.3, 0.89, -0.96, -0.1, 0.07],
  [0.81, 1.28, 0.88, -0.95, -0.1, 0.06],
  [0.38, 1.24, 0.8, -0.95, -0.1, 0.045],
  [0.0, 1.08, 0.68, -0.95, -0.1, 0.035],
]

/** How boxy the oval is (1 = a true oval; smaller = flatter front, side and back). */
const TRUNK_SQUARE = 0.8

/**
 * The columns of the flank's grid, from the edge of the abs round to the back.
 * Each is: angle round the trunk and height at its top, then at its bottom
 * (degrees; 90 = front, 0 = straight out to the side, -90 = back).
 *
 * The bottom ends trace the rim of the hip bone from the back to its front point,
 * then run down the groin line - so the rows of the grid fan down and forward,
 * the way the muscle's fibres do ("hands in pockets").
 */
const FLANK: [number, number, number, number][] = [
  [68, 3.42, 84, 0.0],
  [50, 3.36, 64, 0.38],
  [33, 3.28, 33, 0.81],
  [15, 3.2, 13, 1.26],
  [-5, 3.12, -6, 1.5],
  [-26, 3.05, -28, 1.5],
  [-46, 3.0, -50, 1.5],
  // far enough round to tuck under the spine columns, so the back never shows a gap
  [-70, 2.95, -73, 1.46],
]
const FLANK_ROWS = 7

/** A point on the outline of the trunk: `deg` round it, at height y. Rides the waist by its height. */
function onTrunk(trunk: Trunk, deg: number, y: number): SkinPoint {
  let i = 0
  while (i < trunk.length - 2 && y < trunk[i + 1][0]) i++
  const a = trunk[i]
  const b = trunk[i + 1]
  const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0])))
  const at = (k: number) => a[k] + (b[k] - a[k]) * t
  const [half, front, back, mid, h] = [at(1), at(2), at(3), at(4), at(5)]
  const th = deg * DEG
  const c = Math.pow(Math.abs(Math.cos(th)), TRUNK_SQUARE)
  const s = Math.pow(Math.abs(Math.sin(th)), TRUNK_SQUARE)
  const z = th >= 0 ? mid + (front - mid) * s : mid - (mid - back) * s
  // the waist turns a little at a time, from the hip bone (0) up to the ribs (1)
  const k = Math.round(Math.min(1, Math.max(0, (y - 1.2) / (3.05 - 1.2))) * 100) / 100
  return { f: k === 0 ? 'pelvis' : k === 1 ? 'ribs' : `w@${k}`, p: [half * c, y, z], h }
}

function flank(trunk: Trunk): SkinDef {
  return {
    rows: Array.from({ length: FLANK_ROWS }, (_, r) => {
      const t = r / (FLANK_ROWS - 1)
      return FLANK.map(([a0, y0, a1, y1]) => onTrunk(trunk, a0 + (a1 - a0) * t, y0 + (y1 - y0) * t))
    }),
    // five planes round the waist, like the strips of a swept sheet
    lines: [1.5, 3, 4.5, 6],
    label: [2, 3],
  }
}

/** Things that sit on the midline (not mirrored). */
const middle: SweepDef[] = [
  ...pelvisBlocks(),
  spine,
  {
    id: 'ribcage',
    group: 'bone',
    kind: 'bone',
    section: 'shell',
    path: ribcage(1, 1),
  },
  {
    id: 'sternum',
    group: 'bone',
    kind: 'bone',
    section: 'box',
    seg: 2,
    path: [
      P('ribs', 0, 4.92, 0.63, 0.24, 0.04, { n: [0, 0.3, 0.95] }),
      P('ribs', 0, 4.1, 0.93, 0.16, 0.04, { n: [0, 0.2, 0.98] }),
      P('ribs', 0, 3.4, 1.04, 0.08, 0.04, { n: FRONT }),
    ],
  },
  {
    id: 'head',
    group: 'head',
    kind: 'prop',
    section: 'crate',
    path: [
      // a strong neck column, leaning forward out of the rib cage
      P('ribs', 0, 4.95, -0.2, 0.4, 0.38, { n: FRONT }),
      P('ribs', 0, 5.65, -0.06, 0.35, 0.35, { n: FRONT }),
      P('ribs', 0, 6.0, 0.12, 0.42, 0.5, { n: FRONT }),
      P('ribs', 0, 6.55, 0.16, 0.57, 0.7, { n: FRONT }),
      P('ribs', 0, 7.2, 0.1, 0.6, 0.74, { n: FRONT }),
      P('ribs', 0, 7.68, 0.02, 0.46, 0.58, { n: FRONT }),
      P('ribs', 0, 7.88, -0.02, 0.24, 0.32, { n: FRONT }),
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
      P('ribs', 0.13, 4.92, 0.62, 0.09, 0.08, { n: UP }),
      P('ribs', 0.8, 4.98, 0.66, 0.085, 0.075, { n: UP }),
      P('ribs', 1.42, 5.04, 0.36, 0.08, 0.07, { n: UP }),
      P('ribs', 1.8, 5.0, 0.0, 0.1, 0.07, { n: UP }),
    ],
  },
  {
    // a triangle on the back of the ribs: upright inner edge, lower tip, outer corner at the shoulder
    id: 'scapula',
    group: 'bone',
    kind: 'bone',
    section: 'box',
    path: [
      P('ribs', 1.08, 4.72, -0.76, 0.5, 0.045, { n: [0.42, 0, -0.91] }),
      P('ribs', 1.0, 4.1, -0.86, 0.36, 0.045, { n: [0.36, 0, -0.93] }),
      P('ribs', 0.86, 3.38, -0.9, 0.06, 0.04, { n: [0.3, 0, -0.95] }),
    ],
  },
  {
    id: 'scapula-spine',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    seg: 2,
    // the ridge across the shoulder blade, ending in the flat tip (acromion) that meets the collarbone
    path: [
      P('ribs', 0.68, 4.52, -0.98, 0.05, 0.06, { n: UP }),
      P('ribs', 1.3, 4.78, -0.86, 0.07, 0.09, { n: [0, 0.6, -0.8] }),
      P('ribs', 1.7, 4.94, -0.42, 0.1, 0.08, { n: UP }),
      P('ribs', 1.9, 4.96, -0.08, 0.14, 0.06, { n: UP }),
    ],
  },
  {
    id: 'arm',
    group: 'arm',
    kind: 'prop',
    section: 'crate',
    path: [
      // the ball of the upper arm sits right under the shoulder tip
      P('armL', 0, 0.3, 0, 0.18, 0.2, { n: FRONT }),
      P('armL', 0, 0.04, 0, 0.32, 0.36, { n: FRONT }),
      P('armL', 0.02, -0.8, 0, 0.35, 0.42, { n: FRONT }),
      P('armL', 0, -1.8, 0, 0.33, 0.4, { n: FRONT }),
      P('armL', 0, -2.6, 0, 0.29, 0.33, { n: FRONT }),
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
      P('ribs', 0.35, 3.62, 1.04, 0.31, 0.08, { n: [0, 0.25, 1] }),
      P('ribs', 0.35, 3.05, 1.07, 0.32, 0.12, { n: FRONT }),
      P('w@0.75', 0.33, 2.42, 1.05, 0.31, 0.13, { n: FRONT }),
      P('w@0.5', 0.31, 1.78, 1.0, 0.29, 0.12, { n: FRONT }),
      P('w@0.25', 0.28, 1.14, 0.95, 0.26, 0.1, { n: FRONT }),
      P('pelvis', 0.2, 0.42, 0.84, 0.2, 0.08, { n: [0, -0.2, 1] }),
      P('pelvis', 0.1, -0.12, 0.64, 0.1, 0.06, { n: [0, -0.4, 0.9] }),
    ],
    label: 2,
  },
  {
    id: 'obliques',
    group: 'obliques',
    kind: 'muscle',
    bulge: 0.5,
    // one pad from the side of the ribs to the rim of the hip bone; see `flank`
    path: [],
    skin: flank(TRUNK),
    label: 0,
  },
  {
    id: 'serratus',
    group: 'serratus',
    kind: 'muscle',
    section: 'sheet',
    seg: 2,
    path: [
      arc('ribs', 3.95, 0.3, 0.02, 1.12, -8, 26, 0.08),
      arc('ribs', 3.5, 0.36, 0.02, 1.06, 2, 42, 0.11),
      arc('ribs', 3.05, 0.38, 0.0, 1.0, 22, 52, 0.08),
    ],
    label: 1,
  },
  {
    id: 'pec',
    group: 'pecs',
    kind: 'muscle',
    section: 'sheet',
    path: [
      P('ribs', 0.1, 4.26, 0.98, 0.64, 0.12, { n: [0, 0.1, 1], curl: 0.6 }),
      P('ribs', 0.72, 4.26, 1.06, 0.68, 0.28, { n: [0.12, 0.04, 1], curl: 1.0 }),
      P('ribs', 1.3, 4.5, 0.86, 0.38, 0.3, { n: [0.55, 0.05, 0.83], curl: 0.8 }),
      P('armL', 0.12, -0.55, 0.18, 0.16, 0.12, { n: [0.3, 0, 0.95] }),
    ],
    label: 1,
  },
  {
    id: 'scm',
    group: 'neck',
    kind: 'muscle',
    seg: 2,
    path: [
      P('ribs', 0.14, 4.95, 0.6, 0.08, 0.06, { n: [0.2, 0, 1] }),
      P('ribs', 0.38, 5.6, 0.26, 0.11, 0.08, { n: [0.7, 0, 0.7] }),
      P('ribs', 0.5, 6.12, -0.12, 0.09, 0.06, { n: OUT }),
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
      // narrow at the small of the back, so the two lats make a V
      P('w@0.3', 0.36, 1.7, -0.97, 0.45, 0.05, { n: BACK }),
      P('w@0.6', 0.76, 2.3, -0.98, 0.62, 0.1, { n: [0.3, 0, -0.95] }),
      P('ribs', 1.16, 3.0, -0.86, 0.66, 0.18, { n: [0.55, 0, -0.84], curl: 0.7 }),
      P('ribs', 1.5, 3.75, -0.45, 0.42, 0.28, { n: [0.85, 0, -0.53], curl: 0.7 }),
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
      P('ribs', 0.14, 6.1, -0.42, 0.18, 0.08, { n: [0.2, 0, -1] }),
      P('ribs', 0.42, 5.58, -0.52, 0.32, 0.18, { n: [0.2, 0.5, -0.85] }),
      P('ribs', 1.12, 5.16, -0.42, 0.38, 0.2, { n: [0, 0.9, -0.44] }),
      P('ribs', 1.88, 5.04, -0.12, 0.14, 0.08, { n: [0.2, 0.95, -0.2] }),
    ],
  },

  // ───────────── shoulder cap ─────────────
  {
    id: 'deltoid',
    group: 'delts',
    kind: 'muscle',
    section: 'sheet7',
    path: [
      P('shL', 0.12, 0.44, 0, 0.62, 0.12, { n: [0.5, 0.85, 0], curl: 3.2 }),
      P('shL', 0.3, 0.1, 0, 0.58, 0.3, { n: [1, 0.15, 0], curl: 3.0 }),
      P('armL', 0.27, -0.5, 0, 0.44, 0.3, { n: OUT, curl: 2.6 }),
      P('armL', 0.21, -1.02, 0, 0.26, 0.2, { n: OUT, curl: 1.8 }),
      P('armL', 0.16, -1.48, 0.01, 0.06, 0.05, { n: OUT }),
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
  skin: def.skin && mirrorSkin(def.skin, toRight),
})

/*
 * The female figure uses the same blocks, re-proportioned:
 * narrower ribs and shoulders, a pinched waist, wider hips, thinner muscles.
 */
export const RIBS_X = 0.87
const WAIST_X = 0.78
const HIPS_X = 1.07
const RIM_X = 0.93
/** Pieces whose width is a left-right measure, so it narrows along with the body. */
const SCALED = new Set(['scapula', 'sternum', 'head'])

/*
 * Forms that cannot simply be squeezed: the waist is so much narrower than the
 * ribs and hips that the flank and the rib cage are rebuilt in female proportions.
 */
const FEMALE_FORMS: Record<string, Partial<SweepDef>> = {
  obliques: { skin: flank(TRUNK_FEMALE) },
  // a narrower rim, a wider underside: female hips are widest low down, at the top of the thigh
  pelvis: { path: pelvisBowl(RIM_X, HIPS_X) },
  ribcage: { path: ribcage(RIBS_X, 0.93) },
}

function feminize(def: SweepDef): SweepDef {
  const own = FEMALE_FORMS[def.id]
  if (own) return { ...def, ...own }
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
      // a slimmer, longer-looking neck
      if (def.id === 'head' && pt.p[1] < 5.9) return resize(moved, 0.8, 0.86)
      if (SCALED.has(def.id)) return resize(moved, kx, kz)
      if (def.id === 'spine') return resize(moved, 0.9, 0.9)
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

/*
 * Both torso lessons show every muscle of the torso: people turn the model round, and
 * a bare back (or a bare front) reads as something missing. The two lessons differ in
 * where the camera starts, what the text is about, and which muscles are listed first -
 * and each names the other, so the app swaps them as the model is turned.
 */
const FRONT_MUSCLES = ['breast', 'pecs', 'delts', 'abs', 'obliques', 'serratus', 'neck', 'traps']
const BACK_MUSCLES = ['traps', 'delts', 'scap', 'lats', 'erectors', 'obliques']
const firstThen = (first: string[], rest: string[]) => [...first, ...rest.filter((id) => !first.includes(id))]

export const torsoLessons: LessonDef[] = [
  {
    id: 'torso-front',
    rig: 'torso',
    section: 'Torso',
    title: 'Torso front',
    blurb: 'Two solid masses - rib cage and hips - with a soft, stretchy middle. Chest and shoulders ride on the ribs; abs and obliques bridge the gap.',
    show: firstThen(FRONT_MUSCLES, BACK_MUSCLES),
    otherSide: 'torso-back',
    view: { target: [0, 3.3, 0], fit: [6.2, 9.8], az: 20, el: 4 },
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
    show: firstThen(BACK_MUSCLES, FRONT_MUSCLES),
    otherSide: 'torso-front',
    view: { target: [0, 3.3, 0], fit: [6.2, 9.8], az: 200, el: 4 },
    sides: SIDES,
    tips: [
      'The spine is a groove, not a ridge - the muscles on both sides stand up higher than the bone.',
      'Lats make the V-shape of the back: wide under the armpits, narrow at the waist.',
      'Twist the torso and watch the kite stay square to the shoulders while the hips stay put.',
    ],
  },
]
