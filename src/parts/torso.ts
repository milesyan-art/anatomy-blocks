import { Matrix4, Quaternion, Vector3 } from 'three'
import {
  DEG,
  P,
  arc,
  makeFrames,
  mirrorPoint,
  mirrorSkin,
  mul,
  rotAbout,
  rotX,
  rotY,
  rotZ,
  translate,
} from '../engine/frames'
import type { GroupDef, LessonDef, PathPoint, RigDef, SkinDef, SkinPoint, SweepDef, Vec3 } from '../engine/types'
import { mirrorSolid } from '../engine/solid'
import { resize } from './body'
import { CARRY, ELBOW_Y, armRig } from './arm'
import { WRIST, humerusSolid, radiusSolid, ulnaSolid } from './armBones'
import { relaxedHand } from './hand'
import { handBones } from './handBones'
import { pelvisBlocks, pelvisSolid } from './pelvis'
import { SHOULDER, clavicleSolid, lumbarSolids, ribCageSolid, scapulaSolid } from './torsoBones'

/*
 * Torso, facing +Z.   +X = the figure's left   +Y = up
 * The origin sits between the two hip joints. Rib cage spans y = 2 ... 5.
 *
 * Frames
 *   pelvis    hip block (never moves)
 *   w@k       waist, turned by k x the bend / lean / twist   (0 = pelvis ... 1 = ribs)
 *   ribs      rib cage (= w@1); neck and head ride along
 *   clavL/R   collarbone, lifted at the breastbone joint as the arm goes up
 *   scapL/R   shoulder blade: hangs off the collarbone's tip and turns its socket upward
 *   shL/shR   shoulder joint: carried by the blade, still square to the ribs
 *   humL@k    the shoulder joint turned by k x the arm's swing, for flesh that wraps
 *             the joint (0 = square to the ribs ... 1 = with the arm)
 *   armL/R    upper arm, hanging slightly away from the body (or raised)
 *
 * The collarbone, blade and shoulder frames are all identity (in rib space) at rest,
 * so their stations are written in the same coordinates as the ribs.
 * Everything is modelled on the left (+X) and mirrored.
 */

const WAIST: [number, number, number] = [0, 1.6, -0.35]
/** The collarbone's inner end, where it meets the breastbone. */
const COLLAR_ROOT: [number, number, number] = [0.13, 4.92, 0.62]
/** The tip of the shoulder (acromion), where the collarbone holds the shoulder blade. */
const ACROMION: [number, number, number] = [1.85, 4.98, -0.06]
/** How far the arm hangs away from the body at rest, in degrees. */
const ARM_HANG = 15
const ARM_OUT = ARM_HANG * DEG
/*
 * The arm lifts in the plane of the shoulder blade, a little forward of straight out
 * to the side - the natural way to raise an arm.
 */
const LIFT_AXIS = new Vector3(-0.4, 0, 0.92).normalize()
/** How far the arm can lift above its resting hang. */
const LIFT_MAX = 180 - ARM_HANG
/** The collarbone hinges up about a level line square to itself; this far with the arm overhead. */
const COLLAR_AXIS = new Vector3(0.35, 0, 0.94).normalize()
const COLLAR_LIFT = 20 * DEG
/*
 * The shoulder blade, hanging from the tip of the collarbone, turns so the socket faces
 * up: its lower tip swings out and round the side of the ribs, while the top corner
 * by the spine drops a little. Where those two corners sit with the arm overhead:
 */
const BLADE_TOP: [number, number, number] = [1.08, 4.72, -0.76]
const BLADE_TIP: [number, number, number] = [0.86, 3.38, -0.9]
const BLADE_TOP_UP: [number, number, number] = [0.95, 4.6, -0.8]
const BLADE_TIP_UP: [number, number, number] = [1.3, 3.62, -0.42]
const IDENTITY = new Matrix4()
/** Mirror across the midline, to turn a left-side transform into the right one. */
const FLIP = new Matrix4().makeScale(-1, 1, 1)

/** A station's key shape for the arms raised all the way. */
const armsUp = (p: Vec3, w: number, h: number) => ({ alt: { drive: 'arms', p, w, h } })

const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]
const OUT: PathPoint['n'] = [1, 0, 0]


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
  [15, 3.2, 13, 1.19],
  [-5, 3.12, -6, 1.46],
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
  // the rib cage with the thoracic spine and the breastbone, and the five lumbar
  // vertebrae below it, each riding its share of the bend (see torsoBones.ts)
  { id: 'ribcage', group: 'bone', kind: 'bone', path: [], solid: ribCageSolid() },
  ...lumbarSolids().map(({ id, solid }): SweepDef => ({ id, group: 'bone', kind: 'bone', path: [], solid })),
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

/*
 * The whole arm, borrowed from the arm lesson: forearm bones, the hand, and the muscles
 * of the upper arm and forearm - so raising the arms shows what they do. The torso's arm
 * hangs straight at the elbow (with its natural carrying angle), palm forward; the
 * forearm's frames (`foreL`, `radL`, `handL`, `handL/<finger bone>`) are worked out
 * in `armFrame`. Muscle tops on the shoulder blade are moved into the trunk's space.
 */
const ARM_MUSCLES = new Set([
  'brachialis',
  'biceps',
  'triceps-medial',
  'triceps-long',
  'triceps-lateral',
  'triceps-tendon',
  'flexors',
  'extensors',
  'ridge',
])
const FROM_ARM: Record<string, string> = { hum: 'armL', fa: 'foreL', rad: 'radL', hand: 'handL' }
const fromArm = (pt: PathPoint): PathPoint => {
  const base = pt.f.replace(/@.*/, '')
  if (base === 'sh') return { ...pt, f: 'scapL', p: [pt.p[0] + SHOULDER[0], pt.p[1] + SHOULDER[1], pt.p[2] + SHOULDER[2]] }
  return { ...pt, f: FROM_ARM[base] ?? 'armL' }
}
/** A hand bone's frame on the torso's left hand. */
const handFrame = (f: string) => (f === 'palm' ? 'handL' : `handL/${f}`)
const wholeArm: SweepDef[] = [
  { id: 'ulna', group: 'bone', kind: 'bone', path: [], solid: ulnaSolid('foreL') },
  { id: 'radius', group: 'bone', kind: 'bone', path: [], solid: radiusSolid('radL') },
  ...handBones().map((d) => ({ ...d, solid: d.solid && { ...d.solid, frame: handFrame(d.solid.frame) } })),
  ...armRig.sweeps.filter((d) => ARM_MUSCLES.has(d.id)).map((d) => ({ ...d, path: d.path.map(fromArm) })),
]

/** The left half. */
const left: SweepDef[] = [
  // ───────────── bones + props ─────────────
  { id: 'clavicle', group: 'bone', kind: 'bone', path: [], solid: clavicleSolid('clavL') },
  { id: 'scapula', group: 'bone', kind: 'bone', path: [], solid: scapulaSolid('scapL') },
  // the upper arm bone (shared with the arm rig, see armBones.ts)
  { id: 'arm', group: 'bone', kind: 'bone', path: [], solid: humerusSolid('armL') },


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
      // ends on the pubic crest, on top of the joint between the two hip bones
      P('pelvis', 0.11, 0.02, 0.58, 0.1, 0.05, { n: [0, -0.2, 1] }),
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
      P('scapL', 0.95, 4.1, -1.0, 0.3, 0.1, { n: [0.2, 0, -1] }),
      P('scapL', 1.45, 4.25, -0.75, 0.32, 0.14, { n: [0.5, 0, -0.87] }),
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
      P('scapL', 1.4, 4.75, -0.7, 0.3, 0.12, { n: [0.3, 0.4, -0.87] }),
      P('scapL', 1.9, 4.95, -0.3, 0.1, 0.06, { n: [0.4, 0.7, -0.6] }),
    ],
    label: 1,
  },
  {
    id: 'trap-upper',
    group: 'traps',
    kind: 'muscle',
    path: [
      P('ribs', 0.14, 6.1, -0.42, 0.18, 0.08, { n: [0.2, 0, -1] }),
      // arms overhead shrug the shoulders: the slope bunches up, wider and thicker
      P('ribs', 0.42, 5.58, -0.52, 0.32, 0.18, { n: [0.2, 0.5, -0.85], ...armsUp([0.42, 5.5, -0.56], 0.46, 0.26) }),
      P('clavL', 1.12, 5.16, -0.42, 0.38, 0.2, { n: [0, 0.9, -0.44], ...armsUp([1.12, 5.12, -0.44], 0.46, 0.26) }),
      P('clavL', 1.88, 5.04, -0.12, 0.14, 0.08, { n: [0.2, 0.95, -0.2] }),
    ],
  },

  // ───────────── shoulder cap ─────────────
  {
    id: 'deltoid',
    group: 'delts',
    kind: 'muscle',
    section: 'sheet7',
    path: [
      /*
       * With the arm overhead the insertion ends up above the origin, packed in next
       * to the shoulder tip, and a pad that still ran over the ball would fold on
       * itself. So the top two stations turn with the arm, and their key shapes line
       * them up along it: overhead, the deltoid is a straight teardrop on the arm with
       * its root tucked in under the shoulder tip.
       */
      P('humL@0.8', 0.12, 0.44, 0, 0.62, 0.12, { n: [0.5, 0.85, 0], curl: 3.2, ...armsUp([0.34, 0.09, 0], 0.42, 0.06) }),
      P('humL@1', 0.3, 0.1, 0, 0.58, 0.3, { n: [1, 0.15, 0], curl: 3.0, ...armsUp([0.37, -0.25, 0], 0.52, 0.3) }),
      P('armL', 0.27, -0.5, 0, 0.44, 0.3, { n: OUT, curl: 2.6 }),
      P('armL', 0.21, -1.02, 0, 0.26, 0.2, { n: OUT, curl: 1.8 }),
      P('armL', 0.16, -1.48, 0.01, 0.06, 0.05, { n: OUT }),
    ],
    label: 2,
  },
  ...wholeArm,
]

const toRight = (f: string) => f.replace(/^(clav|scap|sh|hum|arm|fore|rad|hand)L/, '$1R')

const mirror = (def: SweepDef): SweepDef => ({
  ...def,
  id: `${def.id}-r`,
  // only the left copy carries the label
  label: undefined,
  path: def.path.map((pt) => mirrorPoint(pt, toRight)),
  skin: def.skin && mirrorSkin(def.skin, toRight),
  solid: def.solid && mirrorSolid(def.solid, toRight),
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

/*
 * Forms that cannot simply be squeezed: the waist is so much narrower than the
 * ribs and hips that the flank and the rib cage are rebuilt in female proportions.
 */
const FEMALE_FORMS: Record<string, Partial<SweepDef>> = {
  obliques: { skin: flank(TRUNK_FEMALE) },
  // a narrower rim, a wider underside: female hips are widest low down, at the top of the thigh
  pelvis: { solid: pelvisSolid(RIM_X, HIPS_X) },
}

function feminize(def: SweepDef): SweepDef {
  const own = FEMALE_FORMS[def.id]
  if (own) return { ...def, ...own }
  if (def.solid) {
    // sculpted bones keep their shape and are stretched with the space they sit in
    const base = def.solid.frame.replace(/@.*/, '')
    const k: Vec3 | null = base === 'ribs' || base === 'clavL' || base === 'scapL' ? [RIBS_X, 1, 0.93] : base === 'w' ? [WAIST_X, 1, 0.9] : null
    return k ? { ...def, solid: { ...def.solid, scale: k } } : def
  }
  const soft = def.kind === 'muscle' || def.kind === 'tendon'
  return {
    ...def,
    path: def.path.map((pt) => {
      const base = pt.f.split('@')[0]
      let kx = 1
      let kz = 1
      // the collarbone and shoulder blade frames are written in rib coordinates
      if (base === 'ribs' || base === 'clavL' || base === 'scapL') {
        kx = pt.p[1] > 5.4 ? 0.93 : RIBS_X
        kz = 0.93
      } else if (base === 'w') {
        kx = WAIST_X
        // the spine columns bridge the hollow of the back, so they keep their depth
        kz = def.id === 'erector' ? 1 : 0.9
      } else if (base === 'pelvis') {
        kx = HIPS_X
      }
      const squeeze = (p: Vec3): Vec3 => [p[0] * kx, p[1], p[2] * kz]
      const moved: PathPoint = {
        ...pt,
        p: squeeze(pt.p),
        alt: pt.alt?.p ? { ...pt.alt, p: squeeze(pt.alt.p) } : pt.alt,
      }
      if (soft) return resize(moved, Math.min(kx, 0.93), def.group === 'pecs' ? 0.55 : 0.72)
      // a slimmer, longer-looking neck
      if (def.id === 'head' && pt.p[1] < 5.9) return resize(moved, 0.8, 0.86)
      if (def.id === 'head') return resize(moved, kx, kz)
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
    // arms overhead lift it and draw it a little flatter against the chest
    P('ribs', 0.5, 4.36, 1.0, 0.14, 0.04, { n: [0, 0.3, 0.95], ...armsUp([0.52, 4.42, 1.0], 0.14, 0.04) }),
    P('ribs', 0.58, 4.0, 1.07, 0.32, 0.22, { n: [0.1, 0.1, 1], ...armsUp([0.62, 4.14, 1.06], 0.32, 0.2) }),
    P('ribs', 0.64, 3.66, 1.08, 0.38, 0.36, { n: [0.15, -0.1, 1], ...armsUp([0.68, 3.82, 1.07], 0.37, 0.32) }),
    P('ribs', 0.64, 3.38, 1.0, 0.24, 0.14, { n: [0.1, -0.5, 0.85], ...armsUp([0.68, 3.56, 1.0], 0.24, 0.14) }),
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

/*
 * Their groups, as in the arm lesson - recoloured where they would match a neighbour
 * here, and with what to watch when the arm goes up rather than when the elbow bends.
 */
const ARM_GROUPS: Record<string, Partial<GroupDef>> = {
  biceps: {
    move: 'Raise the arm and it swings up with the arm bone, its top tucked under the chest muscle and the deltoid.',
  },
  brachialis: {
    color: '#c9a0f0',
    move: 'From the front it peeks out on both sides of the biceps, just above the elbow.',
  },
  triceps: {
    color: '#ffd166',
    move: 'Raise the arm: the long head stretches out from under the shoulder blade, and the armpit opens between it and the lat.',
  },
  flexors: {},
  extensors: {},
  ridge: {},
}
const upperArmGroups: GroupDef[] = armRig.groups.filter((g) => g.id in ARM_GROUPS).map((g) => ({ ...g, ...ARM_GROUPS[g.id] }))

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
  ...upperArmGroups,
]

/** A turn that carries the pair of directions (a1, a2) onto (b1, b2), as near as a turn can. */
function turnOnto(a1: Vector3, a2: Vector3, b1: Vector3, b2: Vector3): Quaternion {
  const basis = (u: Vector3, v: Vector3) => {
    const x = u.clone().normalize()
    const z = x.clone().cross(v).normalize()
    return new Matrix4().makeBasis(x, z.clone().cross(x), z)
  }
  const m = basis(b1, b2).multiply(basis(a1, a2).transpose())
  return new Quaternion().setFromRotationMatrix(m)
}

/** Builds the left shoulder for one body. `kx` / `kz` narrow the girdle along with the ribs. */
function makeShoulder(kx: number, kz: number) {
  const at = (p: [number, number, number]) => new Vector3(p[0] * kx, p[1], p[2] * kz)
  const root = at(COLLAR_ROOT)
  const tip = at(ACROMION)
  const joint = at(SHOULDER)
  // the blade's full turn, worked out once from where its corners go
  const tipUp = tip.clone().applyMatrix4(rotAbout(root, COLLAR_AXIS, COLLAR_LIFT))
  const bladeUp = turnOnto(
    at(BLADE_TIP).sub(tip),
    at(BLADE_TOP).sub(tip),
    at(BLADE_TIP_UP).sub(tipUp),
    at(BLADE_TOP_UP).sub(tipUp),
  )
  const still = new Quaternion()

  /**
   * The left shoulder's frames, relative to the rib cage, for an arm raised `lift`
   * degrees above its resting hang.
   */
  return (lift: number) => {
    const t = Math.min(1, Math.max(0, lift / LIFT_MAX))
    const clav = rotAbout(root, COLLAR_AXIS, COLLAR_LIFT * t)
    // the blade hangs from the collarbone's tip and turns about it
    const lifted = tip.clone().applyMatrix4(clav)
    const turn = new Matrix4().makeRotationFromQuaternion(still.clone().slerp(bladeUp, t))
    const scap = mul(translate(lifted.x, lifted.y, lifted.z), turn, translate(-tip.x, -tip.y, -tip.z))
    // the socket rides on the blade; the arm's own angle comes straight from the slider
    const socket = joint.clone().applyMatrix4(scap)
    const hum = (k: number) => mul(translate(socket.x, socket.y, socket.z), new Matrix4().makeRotationAxis(LIFT_AXIS, lift * DEG * k))
    return { clav, scap, sh: hum(0), hum, arm: mul(hum(1), rotZ(ARM_OUT)) }
  }
}

type ShoulderFrames = ReturnType<ReturnType<typeof makeShoulder>>

/** Picks one shoulder frame (`clavL`, `humR@0.3`...), mirrored for the right side. */
function shoulderFrame(sh: ShoulderFrames, name: string, k: number): Matrix4 | null {
  const m = /^(clav|scap|sh|hum|arm)([LR])$/.exec(name)
  if (!m) return null
  const part = m[1] as keyof ShoulderFrames
  const local = part === 'hum' ? sh.hum(k) : sh[part]
  return m[2] === 'L' ? local : mul(FLIP, local, FLIP)
}

/** The forearm hangs straight from the elbow, with its carrying angle (left side, in the arm's frame). */
const FOREARM_AT = mul(translate(0, ELBOW_Y, 0), rotZ(CARRY))

/**
 * The forearm and hand frames (`foreL`, `radL`, `handL`, `handL/indexA`...), riding on
 * the arm; mirrored for the right side. The fingers keep the hand lesson's relaxed pose.
 */
function armFrame(name: string, get: (n: string) => Matrix4): Matrix4 | null {
  const m = /^(fore|rad|hand)([LR])(?:\/(.+))?$/.exec(name)
  if (!m) return null
  const side = m[2]
  const fix = (t: Matrix4) => (side === 'L' ? t : mul(FLIP, t, FLIP))
  const fore = mul(get(`arm${side}`), fix(FOREARM_AT))
  if (m[1] !== 'hand') return fore
  const hand = mul(fore, fix(translate(...WRIST)))
  return m[3] ? mul(hand, fix(relaxedHand(m[3]))) : hand
}

function build(female: boolean): RigDef {
  const shape = female ? feminize : (d: SweepDef) => d
  const leftSide = [...left.map(shape), ...(female ? [breast] : [])]
  // labels read the left copy first, so list it first within each group
  const sweeps: SweepDef[] = [...middle.map(shape), ...leftSide, ...leftSide.map(mirror)]
  const shoulderAt = female ? makeShoulder(RIBS_X, 0.93) : makeShoulder(1, 1)

  return {
    id: 'torso',
    controls: [
      { id: 'bend', label: 'Bend forward / back', min: -22, max: 40, def: 0, lo: 'arch back', hi: 'crunch' },
      { id: 'lean', label: 'Lean sideways', min: -28, max: 28, def: 0, lo: '◀', hi: '▶' },
      { id: 'twist', label: 'Twist', min: -40, max: 40, def: 0, lo: '◀', hi: '▶' },
      // the angle between arm and body, so 90° is straight out to the side
      { id: 'arms', label: 'Raise the arms', min: ARM_HANG, max: 180, def: ARM_HANG, lo: 'down', hi: 'overhead' },
    ],
    presets: [
      { label: 'Upright', pose: { bend: 0, lean: 0, twist: 0, arms: ARM_HANG } },
      { label: 'Crunch', pose: { bend: 38, lean: 0, twist: 0 } },
      { label: 'Arch', pose: { bend: -20, lean: 0, twist: 0 } },
      { label: 'Side bend', pose: { bend: 0, lean: 26, twist: 0 } },
      { label: 'Twist', pose: { bend: 5, lean: 0, twist: 36 } },
      { label: 'Arms out', pose: { arms: 90 } },
      { label: 'Arms up', pose: { arms: 170 } },
    ],
    groups: female ? [breastGroup, ...groups] : groups,
    sweeps,
    drives: (pose) => ({ bend: pose.bend / 40, arms: (pose.arms - ARM_HANG) / LIFT_MAX }),
    frames: (pose) => {
      // the rest pose (every control at 0) counts as the resting hang
      const shoulder = shoulderAt(Math.max(0, pose.arms - ARM_HANG))
      return makeFrames((name, k, get) => {
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
          default: {
            const arm = armFrame(name, get)
            if (arm) return arm
            const local = shoulderFrame(shoulder, name, k)
            return local ? mul(get('w@1'), local) : IDENTITY
          }
        }
      })
    },
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
const FRONT_MUSCLES = ['breast', 'pecs', 'delts', 'abs', 'obliques', 'serratus', 'neck', 'traps', 'biceps', 'brachialis', 'flexors', 'ridge']
const BACK_MUSCLES = ['traps', 'delts', 'scap', 'lats', 'erectors', 'obliques', 'triceps', 'extensors']
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
    view: { target: [0, 3.05, 0], fit: [6.6, 10.6], az: 20, el: 4 },
    sides: SIDES,
    tips: [
      'Draw the rib cage and the hip block first. Every pose is just those two boxes tilting against each other.',
      'Only the waist changes length. Chest stays the same size whatever the pose.',
      'On a side bend, look for the pinch on one side and the long stretch on the other.',
      'Raise the arms: the collarbones tip up into a V and the chest muscle swings up into the armpit.',
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
    view: { target: [0, 3.05, 0], fit: [6.6, 10.6], az: 200, el: 4 },
    sides: SIDES,
    tips: [
      'The spine is a groove, not a ridge - the muscles on both sides stand up higher than the bone.',
      'Lats make the V-shape of the back: wide under the armpits, narrow at the waist.',
      'Twist the torso and watch the kite stay square to the shoulders while the hips stay put.',
      'Raise the arms and the shoulder blades turn: their lower tips swing out round the side of the ribs.',
    ],
  },
]
