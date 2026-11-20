import { Matrix4, Quaternion, Vector3 } from 'three'
import { DEG, makeFrames, mirrorPoint, mirrorSkin, mul, rotAbout, rotX, rotY, rotZ, translate } from '../engine/frames'
import { mirrorSolid } from '../engine/solid'
import type { FrameGetter, GroupDef, LessonDef, PathPoint, Pose, RigDef, SweepDef, Vec3 } from '../engine/types'
import { CARRY, ELBOW_Y, RADIUS_HEAD, TWIST_AXIS, armRig } from './arm'
import { WRIST, radiusSolid, ulnaSolid } from './armBones'
import { footRig } from './foot'
import { handRig } from './hand'
import { handBones } from './handBones'
import { HIP_X, legRig } from './leg'
import { ANKLE, BALL, FEMUR, KNEE, PATELLA_TURN, patellaFrame } from './legBones'
import { pelvisBlocks } from './pelvis'
import { ARM_MUSCLES, LIFT_MAX, WAIST, leftBody, makeShoulder, middle, torsoGroups } from './torso'
import { SHOULDER } from './torsoBones'

/*
 * The whole male figure, put together from the other models so it can strike a pose:
 * the torso (with its head, shoulder girdle and upper arms), the arm's elbow and
 * forearm, the hands, both legs with the glutes, and the feet. Every block is the same
 * one the single-part lessons use; only the frames they ride on are new.
 *
 * Torso space: facing +Z, +X = the figure's left, +Y = up, the origin between the hip
 * joints. Everything is modelled on the left and mirrored, as in the torso.
 *
 * Frames (left side shown; the right side ends in R)
 *   pelvis          the hip block - the root, tipped and turned by the pose
 *   w@k, ribs       waist and rib cage, as in the torso
 *   neck@k          neck and head, turned by k x the head's turn (1 = the skull)
 *   clavL ... armL  shoulder girdle and upper arm, as in the torso
 *   foreL@k, radL   forearm, bent at the elbow and twisted by k x the forearm's twist
 *   handL, handL/x  hand and finger bones
 *   hipL            the leg's own space: its hip joint at the origin
 *   thighL@k ... toesL   the leg, as in the leg lesson; ankleL = the shin's frame at the ankle
 *
 * The pelvis is lifted or dropped so the lower foot always rests on the same floor.
 */

const IDENTITY = new Matrix4()
const FLIP = new Matrix4().makeScale(-1, 1, 1)
const Y = new Vector3(0, 1, 0)
const X = new Vector3(1, 0, 0)
const Z = new Vector3(0, 0, 1)

/** Where the neck bends and the head turns, in rib space (low in the neck). */
const NECK: Vec3 = [0, 5.0, -0.15]

type Side = 'L' | 'R'

/* ───────────────────────── frames of the blocks ───────────────────────── */

type FrameMap = (base: string) => string

/** Moves a block onto the figure's frames: every station, skin point and solid, and its key-shape drives. */
function onto(def: SweepDef, frame: FrameMap, drive: (d: string) => string = (d) => d, id = def.id): SweepDef {
  const mapF = (f: string) => {
    const at = f.indexOf('@')
    return at < 0 ? frame(f) : `${frame(f.slice(0, at))}${f.slice(at)}`
  }
  return {
    ...def,
    id,
    path: def.path.map((pt) => ({ ...pt, f: mapF(pt.f), alt: pt.alt && { ...pt.alt, drive: drive(pt.alt.drive) } })),
    skin: def.skin && { ...def.skin, rows: def.skin.rows.map((row) => row.map((pt) => ({ ...pt, f: mapF(pt.f) }))) },
    solid: def.solid && { ...def.solid, frame: mapF(def.solid.frame) },
  }
}

/** The torso's own key shapes follow how far the arm on that side is raised. */
const leftDrive = (d: string) => (d === 'arms' ? 'armsL' : d === 'elbow' ? 'elbowL' : d)

/** Puts some stations of a block on the neck (the head turns them); `at[i]` = how far up the neck station i rides. */
function onNeck(def: SweepDef, at: (number | null)[]): SweepDef {
  return {
    ...def,
    path: def.path.map((pt, i) => {
      const k = at[i]
      if (k === null || k === undefined) return pt
      return { ...pt, f: k === 1 ? 'neck@1' : `neck@${k}` }
    }),
  }
}

// ── torso: the head and the neck straps ride the neck ──
const torsoMiddle = middle.map((d) => (d.id === 'head' ? onNeck(d, [null, 0.45, 0.8, 1, 1, 1, 1]) : d))
const torsoLeft = leftBody.map((d) => {
  const moved = onto(d, (f) => f, leftDrive)
  if (d.id === 'scm') return onNeck(moved, [null, 0.4, 1])
  if (d.id === 'trap-upper') return onNeck(moved, [0.9, 0.2])
  return moved
})

// ── the arm below the shoulder: the arm lesson's muscles, with a working elbow ──
const ARM_FRAMES: Record<string, string> = { hum: 'armL', fa: 'foreL', rad: 'radL', hand: 'handL' }
const armMuscles = armRig.sweeps
  .filter((d) => ARM_MUSCLES.has(d.id))
  .map((d) => {
    // the biceps starts on the shoulder blade, written in the arm lesson's shoulder space
    const shifted: SweepDef = {
      ...d,
      path: d.path.map((pt): PathPoint =>
        pt.f === 'sh' ? { ...pt, f: 'scapL', p: [pt.p[0] + SHOULDER[0], pt.p[1] + SHOULDER[1], pt.p[2] + SHOULDER[2]] } : pt,
      ),
    }
    return onto(shifted, (f) => ARM_FRAMES[f] ?? f, leftDrive)
  })
const handFrame = (f: string) => (f === 'palm' ? 'handL' : `handL/${f}`)
const armLeft: SweepDef[] = [
  { id: 'ulna', group: 'bone', kind: 'bone', path: [], solid: ulnaSolid('foreL') },
  { id: 'radius', group: 'bone', kind: 'bone', path: [], solid: radiusSolid('radL') },
  ...handBones().map((d) => onto(d, handFrame)),
  ...armMuscles,
  // the hand's own pads and tendons
  ...handRig.sweeps
    .filter((d) => d.kind !== 'bone')
    .map((d) => onto({ ...d, group: d.group === 'tendons' ? 'finger-tendons' : d.group }, handFrame, undefined, `hand-${d.id}`)),
]

// ── the leg: everything but its copy of the pelvis, plus the foot lesson's pads ──
const LEG_FRAMES: Record<string, string> = {
  pelvis: 'hipL',
  femur: 'femurL',
  thigh: 'thighL',
  knee: 'kneeL',
  tibia: 'tibiaL',
  patella: 'patellaL',
  foot: 'footL',
  toes: 'toesL',
  shin: 'ankleL',
}
const pelvisIds = new Set(pelvisBlocks().map((d) => d.id))
const legLeft: SweepDef[] = [
  ...legRig.sweeps.filter((d) => !pelvisIds.has(d.id)).map((d) => onto(d, (f) => LEG_FRAMES[f] ?? f)),
  // the leg already has the Achilles tendon
  ...footRig.sweeps
    .filter((d) => d.kind !== 'bone' && d.id !== 'achilles')
    .map((d) => onto({ ...d, group: d.group === 'tendons' ? 'toe-tendons' : d.group }, (f) => LEG_FRAMES[f] ?? f, undefined, `foot-${d.id}`)),
]

const toRight = (f: string) => f.replace(/^([a-zA-Z]+)L(?=$|@|\/)/, '$1R')
const rightDrive = (d: string) => d.replace(/L$/, 'R')

function mirror(def: SweepDef): SweepDef {
  return {
    ...def,
    id: `${def.id}-r`,
    // only the left copy carries the label
    label: undefined,
    path: def.path.map((pt) => {
      const m = mirrorPoint(pt, toRight)
      return m.alt ? { ...m, alt: { ...m.alt, drive: rightDrive(m.alt.drive) } } : m
    }),
    skin: def.skin && mirrorSkin(def.skin, toRight),
    solid: def.solid && mirrorSolid(def.solid, toRight),
  }
}

const left = [...torsoLeft, ...armLeft, ...legLeft]
// labels read the left copy first, so list it first within each group
const sweeps: SweepDef[] = [...torsoMiddle, ...left, ...left.map(mirror)]

/* ───────────────────────── groups ───────────────────────── */

const groups: GroupDef[] = [
  ...torsoGroups,
  ...legRig.groups,
  ...footRig.groups
    .filter((g) => g.id !== 'achilles')
    .map((g) => (g.id === 'tendons' ? { ...g, id: 'toe-tendons' } : g)),
  ...handRig.groups.map((g) => (g.id === 'tendons' ? { ...g, id: 'finger-tendons' } : g)),
]
const MUSCLE_GROUPS = groups.map((g) => g.id)

/* ───────────────────────── controls ───────────────────────── */

type Ctl = [id: string, label: string, min: number, max: number, def: number, lo: string, hi: string]

/** Sliders shown in the Move card; the rest are set by the poses only. */
const SHOWN = new Set(['bend', 'lean', 'twist', 'headTurn'])

const perSide = (side: Side, name: string): Ctl[] => [
  [`raise${side}`, `${name} arm: raise`, 0, 165, 0, 'down', 'up'],
  [`fwd${side}`, `${name} arm: forward`, -100, 150, 25, 'back', 'across'],
  [`roll${side}`, `${name} arm: roll`, -70, 90, 0, 'in', 'out'],
  [`elbow${side}`, `${name} elbow`, 0, 145, 10, 'straight', 'bent'],
  [`twist${side}`, `${name} forearm twist`, 0, 160, 80, 'palm forward', 'palm back'],
  [`fist${side}`, `${name} hand`, 0, 100, 0, 'open', 'fist'],
  [`hip${side}`, `${name} leg: raise`, -35, 120, 0, 'back', 'forward'],
  [`spread${side}`, `${name} leg: out`, -15, 60, 0, 'in', 'out'],
  [`turn${side}`, `${name} leg: turn`, -40, 50, 0, 'in', 'out'],
  [`knee${side}`, `${name} knee`, 0, 140, 3, 'straight', 'bent'],
  [`ankle${side}`, `${name} foot: point`, -20, 45, 0, 'toes up', 'toes down'],
]

const CONTROLS: Ctl[] = [
  ['bend', 'Bend forward / back', -22, 40, 0, 'arch back', 'crunch'],
  ['lean', 'Lean sideways', -28, 28, 0, '◀', '▶'],
  ['twist', 'Twist', -40, 40, 0, '◀', '▶'],
  ['headTurn', 'Turn the head', -70, 70, 0, '◀', '▶'],
  ['headNod', 'Nod the head', -30, 35, 0, 'up', 'down'],
  ['headTilt', 'Tilt the head', -25, 25, 0, '◀', '▶'],
  ['hipTurn', 'Turn the hips', -40, 40, 0, '◀', '▶'],
  ['hipTip', 'Tip the hips forward', -20, 40, 0, 'back', 'forward'],
  ['hipTilt', 'Tilt the hips', -15, 15, 0, 'right up', 'left up'],
  ...perSide('L', 'Left'),
  ...perSide('R', 'Right'),
]

/* ───────────────────────── poses ───────────────────────── */

export interface FigurePose {
  id: string
  label: string
  pose: Pose
}

/** Both sides at once: `{ elbow: [left, right] }` -> `{ elbowL, elbowR }`. */
function sides(pairs: Record<string, [number, number]>): Pose {
  const out: Pose = {}
  for (const [k, [l, r]] of Object.entries(pairs)) {
    out[`${k}L`] = l
    out[`${k}R`] = r
  }
  return out
}

const STAND: Pose = Object.fromEntries(CONTROLS.map(([id, , , , def]) => [id, def]))

/** A pose: anything left out stays at the standing figure's value. */
const pose = (own: Pose): Pose => ({ ...STAND, ...own })

export const POSES: FigurePose[] = [
  { id: 'stand', label: 'Standing', pose: pose({}) },
  {
    // weight on the right leg: its hip rides up, the shoulders tip the other way
    id: 'contrapposto',
    label: 'Contrapposto',
    pose: pose({
      hipTilt: -9,
      lean: -13,
      twist: 6,
      headTurn: -20,
      headNod: 8,
      headTilt: -5,
      ...sides({
        raise: [10, 4],
        fwd: [45, 25],
        elbow: [62, 12],
        twist: [90, 85],
        fist: [45, 15],
        hip: [6, 0],
        spread: [12, -4],
        turn: [14, 2],
        knee: [36, 0],
        ankle: [22, 0],
      }),
    }),
  },
  {
    // seated, leaning forward: the right elbow comes down on the left knee, chin on the hand
    id: 'thinker',
    label: 'The Thinker',
    pose: pose({
      bend: 36,
      twist: 16,
      lean: 4,
      headNod: 22,
      headTurn: -6,
      ...sides({
        raise: [22, 36],
        fwd: [85, 140],
        roll: [0, -18],
        elbow: [70, 142],
        twist: [140, 150],
        fist: [35, 70],
        hip: [85, 92],
        spread: [10, 6],
        turn: [6, 4],
        knee: [92, 108],
        ankle: [0, 12],
      }),
    }),
  },
  {
    // the discus swung back at the top of the throw: a deep twist over a bent right leg
    id: 'discus',
    label: 'Discus thrower',
    pose: pose({
      hipTip: 18,
      hipTurn: -12,
      bend: 12,
      twist: -38,
      lean: -6,
      headTurn: -50,
      headNod: 8,
      ...sides({
        raise: [30, 88],
        fwd: [140, -100],
        roll: [0, 10],
        elbow: [35, 14],
        twist: [120, 130],
        fist: [40, 40],
        hip: [-5, 55],
        spread: [2, 6],
        turn: [-8, 5],
        knee: [25, 62],
        ankle: [40, -8],
      }),
    }),
  },
  {
    // the bronze god from Artemision: wide stance, arms spread, aiming along the left arm
    id: 'spear',
    label: 'Spear thrower',
    pose: pose({
      twist: 4,
      lean: 3,
      headTurn: 55,
      headNod: -2,
      ...sides({
        raise: [72, 70],
        fwd: [10, -15],
        roll: [0, 70],
        elbow: [5, 55],
        twist: [110, 80],
        fist: [20, 65],
        hip: [28, -22],
        spread: [10, 8],
        turn: [10, 5],
        knee: [12, 14],
        ankle: [0, 40],
      }),
    }),
  },
  {
    // the bodybuilder's front pose: upper arms out level, forearms up, fists clenched
    id: 'biceps',
    label: 'Double biceps',
    pose: pose({
      bend: -6,
      ...sides({
        raise: [72, 72],
        fwd: [12, 12],
        roll: [85, 85],
        elbow: [115, 115],
        twist: [20, 20],
        fist: [100, 100],
        spread: [7, 7],
        turn: [14, 14],
        knee: [5, 5],
      }),
    }),
  },
]

/* ───────────────────────── the skeleton ───────────────────────── */

const shoulderAt = makeShoulder(1, 1)

/** Quarter-turn helpers. */
const q = (axis: Vector3, deg: number) => new Quaternion().setFromAxisAngle(axis, deg * DEG)
const turnBy = (rot: Quaternion, k: number) => new Matrix4().makeRotationFromQuaternion(new Quaternion().slerp(rot, k))
const flipIf = (side: Side, m: Matrix4) => (side === 'L' ? m : mul(FLIP, m, FLIP))

/** The left-hand frames of one leg, in hip-block space, for that side's values. */
function legChain(pose: Pose, s: Side) {
  const head = FEMUR.head
  const hipRot = q(X, -pose[`hip${s}`]).multiply(q(Z, pose[`spread${s}`])).multiply(q(Y, pose[`turn${s}`]))
  const hip = translate(HIP_X, 0, 0)
  const thigh = (k: number) => mul(hip, translate(...head), turnBy(hipRot, k), translate(-head[0], -head[1], -head[2]))
  const femur = thigh(1)
  const knee = (k: number) => mul(femur, translate(...KNEE), rotX(pose[`knee${s}`] * DEG * k))
  const tibia = knee(1)
  const ankle = mul(tibia, translate(...ANKLE))
  const foot = mul(ankle, rotX(pose[`ankle${s}`] * DEG))
  const toes = mul(foot, translate(...BALL))
  const patella = mul(knee(PATELLA_TURN), translate(...patellaFrame(pose[`knee${s}`] / 135)))
  return { hip, thigh, femur, knee, tibia, ankle, foot, toes, patella }
}

/** Points on the sole (foot frame) and the toe tips (toes frame) that can touch the floor. */
const SOLE: Vec3[] = [
  [0, -0.7, -0.45],
  [-0.3, -0.7, 1.1],
  [0.35, -0.7, 0.9],
]
const TOE_TIP: Vec3 = [-0.25, -0.12, 0.5]

/** The lowest point of either foot, for a hip block placed by `root`. */
function lowest(pose: Pose, root: Matrix4): number {
  let low = Infinity
  for (const s of ['L', 'R'] as Side[]) {
    const c = legChain(pose, s)
    const at = (m: Matrix4, p: Vec3) => new Vector3(...p).applyMatrix4(mul(root, flipIf(s, m))).y
    for (const p of SOLE) low = Math.min(low, at(c.foot, p))
    low = Math.min(low, at(c.toes, TOE_TIP))
  }
  return low
}

const hipBlock = (pose: Pose) => mul(rotY(pose.hipTurn * DEG), rotX(pose.hipTip * DEG), rotZ(pose.hipTilt * DEG))

/** The height of the floor: where the feet are when the figure stands. */
const FLOOR = lowest(STAND, hipBlock(STAND))

/** The hand's finger frames for a fist of 0..100. */
function handPose(fist: number) {
  const t = fist / 100
  return handRig.frames({ curl: 14 + 76 * t, spread: 6 * (1 - t), thumb: 15 + 85 * t })
}

function frames(pose: Pose): FrameGetter {
  // the hip block, lifted so the lower foot stands on the floor
  const tilt = hipBlock(pose)
  const root = mul(translate(0, FLOOR - lowest(pose, tilt), 0), tilt)

  const legs = { L: legChain(pose, 'L'), R: legChain(pose, 'R') }
  const hands = { L: handPose(pose.fistL), R: handPose(pose.fistR) }
  const shoulder = (s: Side) => {
    const turn = q(new Vector3(-Math.sin(pose[`fwd${s}`] * DEG), 0, Math.cos(pose[`fwd${s}`] * DEG)), pose[`raise${s}`]).multiply(
      q(Y, pose[`roll${s}`]),
    )
    return shoulderAt(pose[`raise${s}`], turn)
  }
  const shoulders = { L: shoulder('L'), R: shoulder('R') }
  const headTurn = q(Y, pose.headTurn).multiply(q(X, pose.headNod)).multiply(q(Z, -pose.headTilt))

  const fore = (s: Side, k: number) => {
    const m = mul(translate(0, ELBOW_Y, 0), rotX(-pose[`elbow${s}`] * DEG), rotZ(CARRY))
    if (k > 0) m.multiply(rotAbout(RADIUS_HEAD, TWIST_AXIS, pose[`twist${s}`] * DEG * k))
    return m
  }

  return makeFrames((name, k, get) => {
    switch (name) {
      case 'pelvis':
        return root
      case 'w':
        if (k === 0) return root
        return mul(
          root,
          translate(...WAIST),
          rotX(pose.bend * DEG * k),
          rotZ(-pose.lean * DEG * k),
          rotY(pose.twist * DEG * k),
          translate(-WAIST[0], -WAIST[1], -WAIST[2]),
        )
      case 'ribs':
        return get('w@1')
      case 'neck':
        return mul(get('ribs'), translate(...NECK), turnBy(headTurn, k), translate(-NECK[0], -NECK[1], -NECK[2]))
    }
    const m = /^([a-z]+)([LR])(?:\/(.+))?$/.exec(name)
    if (!m) return IDENTITY
    const [, part, s, bone] = m as unknown as [string, string, Side, string | undefined]
    const fix = (t: Matrix4) => flipIf(s, t)
    switch (part) {
      // ── shoulder and arm ──
      case 'clav':
      case 'scap':
      case 'sh':
      case 'arm': {
        return mul(get('ribs'), fix(shoulders[s][part as 'clav' | 'scap' | 'sh' | 'arm']))
      }
      case 'hum':
        return mul(get('ribs'), fix(shoulders[s].hum(k)))
      case 'fore':
        return mul(get(`arm${s}`), fix(fore(s, k)))
      case 'rad':
        return get(`fore${s}@1`)
      case 'hand': {
        const hand = mul(get(`rad${s}`), fix(translate(...WRIST)))
        return bone ? mul(hand, fix(hands[s](bone))) : hand
      }
      // ── leg ──
      case 'hip':
        return mul(root, fix(legs[s].hip))
      case 'thigh':
        return mul(root, fix(legs[s].thigh(k)))
      case 'knee':
        return mul(root, fix(legs[s].knee(k)))
      case 'femur':
      case 'tibia':
      case 'patella':
      case 'ankle':
      case 'foot':
      case 'toes':
        return mul(root, fix(legs[s][part as 'femur' | 'tibia' | 'patella' | 'ankle' | 'foot' | 'toes']))
      default:
        return IDENTITY
    }
  })
}

export const figureRig: RigDef = {
  id: 'figure',
  controls: CONTROLS.map(([id, label, min, max, def, lo, hi]) => ({ id, label, min, max, def, lo, hi, hidden: !SHOWN.has(id) })),
  // the poses are picked in the side panel, each a lesson of its own
  presets: [],
  groups,
  sweeps,
  drives: (pose) => ({
    bend: pose.bend / 40,
    armsL: pose.raiseL / LIFT_MAX,
    armsR: pose.raiseR / LIFT_MAX,
    elbowL: pose.elbowL / 145,
    elbowR: pose.elbowR / 145,
  }),
  frames,
}

/* ───────────────────────── lessons ───────────────────────── */

const SIDES: LessonDef['sides'] = ['Front', 'Left side', 'Back', 'Right side']
const VIEW = { target: [0, -0.6, 0] as Vec3, fit: [9.5, 17.6] as [number, number], az: 22, el: 4 }

interface PoseText {
  title: string
  blurb: string
  tips: string[]
  /** The blocks worth a label in this pose. */
  labels: string[]
  view?: Partial<LessonDef['view']>
}

const TEXT: Record<string, PoseText> = {
  stand: {
    title: 'Standing figure',
    blurb: 'Every block in this site on one body. Pick a pose below and watch the same blocks carry it.',
    tips: [
      'The body is three masses - head, rib cage, hips - linked by the neck and the waist.',
      'Arms hang to the middle of the thigh; the elbow sits at the waist.',
      'Use this as the reference: in every pose, ask which of the three masses moved.',
    ],
    labels: ['pecs', 'delts', 'abs', 'obliques', 'biceps', 'quads', 'sartorius', 'shin', 'neck'],
  },
  contrapposto: {
    title: 'Contrapposto',
    blurb: 'All the weight on one leg. That hip rides up, the other drops - and the shoulders tilt the opposite way to keep the head over the foot.',
    tips: [
      'Draw the hip line and the shoulder line first: they tilt towards each other on the weight-bearing side.',
      'The weight leg is straight and sits under the pit of the neck.',
      'The free leg bends and its knee drops lower than the other one.',
      'The waist squeezes on the weight side and stretches on the free side.',
    ],
    labels: ['obliques', 'abs', 'pecs', 'delts', 'glute-med', 'tfl', 'quads', 'neck'],
  },
  thinker: {
    title: 'The Thinker',
    blurb: 'Seated and folded forward: the rib cage tips down over the hips and twists so the right elbow can land on the left knee.',
    tips: [
      'Look from the side: the back is one long curve from the hips to the head.',
      'The twist lives in the waist - the hips face forward, the chest turns.',
      'Thighs are level and foreshortened from the front; knees and feet carry the weight.',
    ],
    labels: ['abs', 'obliques', 'pecs', 'delts', 'triceps', 'flexors', 'quads', 'calf'],
    view: { target: [0, -3.4, 0.8], fit: [10, 14], az: 35 },
  },
  discus: {
    title: 'Discus thrower',
    blurb: 'The wound-up spring before the throw: hips turned one way, chest the other, the throwing arm swung high behind.',
    tips: [
      'Find the two boxes: the hips face forward-left, the rib cage is wrenched round to the right.',
      'The arms make one long curve through the shoulders, like a bow.',
      'The weight is on the bent right leg; the left trails on its toes.',
    ],
    labels: ['obliques', 'lats', 'serratus', 'delts', 'glute-max', 'quads', 'hamstrings', 'calf'],
    view: { target: [0, -1.2, 0], fit: [11, 16], az: 50 },
  },
  spear: {
    title: 'Spear thrower',
    blurb: 'A wide, steady stance with both arms spread level, sighting along the front arm before the throw.',
    tips: [
      'The arms make one straight line across the shoulders; the chest stays square between them.',
      'The weight sits between the feet - the back heel lifts as the body drives forward.',
      'The head turns to look along the front arm: watch the neck strap stand out.',
    ],
    labels: ['delts', 'pecs', 'neck', 'traps', 'biceps', 'triceps', 'abs', 'quads', 'tfl'],
    view: { target: [0, -0.6, 0], fit: [14, 17.6], az: 15 },
  },
  biceps: {
    title: 'Double biceps',
    blurb: 'Upper arms out level, forearms up, fists tight: every block of the arm and shoulder squeezed into view.',
    tips: [
      'The upper arm turns outward so the forearm can point up - the biceps faces the sky.',
      'With the arms up, the lats flare out under the armpits and the chest stretches wide.',
      'The deltoid caps the shoulder like a ball; the triceps hangs underneath.',
    ],
    labels: ['biceps', 'brachialis', 'delts', 'pecs', 'lats', 'traps', 'flexors', 'abs', 'obliques'],
    view: { target: [0, -0.2, 0], fit: [10.5, 17.6], az: 15 },
  },
}

export const figureLessons: LessonDef[] = POSES.map((p) => {
  const t = TEXT[p.id]
  return {
    id: p.id === 'stand' ? 'figure' : `pose-${p.id}`,
    rig: 'figure',
    section: 'Poses',
    title: t.title,
    short: p.label,
    blurb: t.blurb,
    show: MUSCLE_GROUPS,
    view: { ...VIEW, ...t.view },
    sides: SIDES,
    tips: t.tips,
    pose: p.pose,
    labels: t.labels,
  }
})
