import { P, mirrorPoint } from '../engine/frames'
import type { PathPoint, SweepDef } from '../engine/types'

/*
 * The hip block, shared by the torso and the leg.
 *
 * Drawn the way figure-drawing books simplify it: a box for the mass,
 * with the landmarks an artist actually looks for laid on top -
 *   the crest rim that the waist muscles sit on,
 *   the two groin lines running down to the pubic bone,
 *   the flat triangle of the sacrum at the back,
 *   the sockets the legs plug into, and the two sit bones.
 *
 * Modelled around the midline (x = 0) with the hip joints at x = +-0.85;
 * `dx` slides the whole thing sideways for rigs with a different origin.
 */

const FRONT: PathPoint['n'] = [0, 0, 1]
const BACK: PathPoint['n'] = [0, 0, -1]
const UP: PathPoint['n'] = [0, 1, 0]
const F = 'pelvis'

/** On the midline - not mirrored. */
const middle: SweepDef[] = [
  {
    id: 'pelvis-box',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    seg: 2,
    path: [
      P(F, 0, 1.42, -0.22, 1.28, 0.66, { n: FRONT }),
      P(F, 0, 1.0, -0.2, 1.32, 0.7, { n: FRONT }),
      P(F, 0, 0.45, -0.14, 1.24, 0.66, { n: FRONT }),
      P(F, 0, 0.02, -0.1, 1.02, 0.58, { n: FRONT }),
    ],
  },
  {
    // the wedge between the legs
    id: 'pelvis-crotch',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    seg: 2,
    path: [
      P(F, 0, 0.1, -0.08, 0.66, 0.5, { n: FRONT }),
      P(F, 0, -0.45, -0.1, 0.56, 0.46, { n: FRONT }),
      P(F, 0, -0.88, -0.14, 0.26, 0.34, { n: FRONT }),
    ],
  },
  {
    // lower-belly shield: wide under the navel, narrowing to the pubic bone
    id: 'pelvis-shield',
    group: 'bone',
    kind: 'bone',
    path: [
      P(F, 0, 1.05, 0.42, 0.6, 0.22, { n: FRONT }),
      P(F, 0, 0.5, 0.5, 0.5, 0.26, { n: FRONT }),
      P(F, 0, -0.1, 0.44, 0.22, 0.12, { n: [0, -0.2, 1] }),
      P(F, 0, -0.6, 0.25, 0.14, 0.08, { n: [0, -0.5, 0.87] }),
    ],
  },
  {
    // sacrum: the flat triangle between the two back dimples
    id: 'pelvis-sacrum',
    group: 'bone',
    kind: 'bone',
    path: [
      P(F, 0, 1.1, -0.9, 0.42, 0.07, { n: BACK }),
      P(F, 0, 0.5, -0.84, 0.3, 0.08, { n: BACK }),
      P(F, 0, -0.1, -0.64, 0.1, 0.05, { n: [0, -0.3, -0.95] }),
    ],
  },
]

/** The left side (+X). */
const left: SweepDef[] = [
  {
    // iliac crest: front corner -> over the top of the hip -> back dimple
    id: 'pelvis-crest',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    path: [
      P(F, 1.13, 0.7, 0.47, 0.1, 0.09, { n: [0.5, 0.3, 0.8] }),
      P(F, 1.4, 1.15, 0.3, 0.11, 0.1, { n: [0.9, 0.3, 0.3] }),
      P(F, 1.42, 1.45, -0.15, 0.12, 0.1, { n: [0.9, 0.45, 0] }),
      P(F, 1.0, 1.42, -0.72, 0.11, 0.1, { n: [0.5, 0.4, -0.75] }),
      P(F, 0.42, 1.05, -0.95, 0.1, 0.09, { n: [0.1, 0.2, -1] }),
    ],
  },
  {
    // groin line: front corner of the hip -> pubic bone
    id: 'pelvis-groin',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    seg: 2,
    path: [
      P(F, 1.1, 0.66, 0.5, 0.07, 0.06, { n: [0.3, 0.3, 0.9] }),
      P(F, 0.6, 0.2, 0.6, 0.07, 0.06, { n: [0.3, 0.3, 0.9] }),
      P(F, 0.14, -0.2, 0.56, 0.06, 0.05, { n: [0.2, 0.2, 0.95] }),
    ],
  },
  {
    // the socket the leg plugs into
    id: 'pelvis-socket',
    group: 'bone',
    kind: 'bone',
    section: 'hex',
    seg: 1,
    path: [P(F, 0.98, 0, 0, 0.3, 0.3, { n: UP }), P(F, 1.26, -0.02, 0, 0.26, 0.26, { n: UP })],
  },
  {
    id: 'pelvis-sit-bone',
    group: 'bone',
    kind: 'bone',
    section: 'crate',
    seg: 1,
    path: [P(F, 0.44, -0.42, -0.4, 0.16, 0.16, { n: BACK }), P(F, 0.42, -0.84, -0.44, 0.12, 0.13, { n: BACK })],
  },
]

const shift = (def: SweepDef, dx: number): SweepDef =>
  dx === 0 ? def : { ...def, path: def.path.map((pt) => ({ ...pt, p: [pt.p[0] + dx, pt.p[1], pt.p[2]] })) }

/** Ids of the pieces that straddle the midline (their width is a left-right measure). */
export const PELVIS_MIDLINE = middle.map((d) => d.id)

export function pelvisBlocks(dx = 0): SweepDef[] {
  const right = left.map((def) => ({
    ...def,
    id: `${def.id}-r`,
    path: def.path.map((pt) => mirrorPoint(pt, (f) => f)),
  }))
  return [...middle, ...left, ...right].map((def) => shift(def, dx))
}
