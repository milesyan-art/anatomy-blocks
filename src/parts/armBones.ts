import { bar, carve, egg, fuse, rod, sculpted } from '../engine/sdf'
import type { Shape } from '../engine/sdf'
import type { SolidDef, Vec3 } from '../engine/types'

/*
 * The bones of the LEFT arm, sculpted like the pelvis and the leg: simple forms fused
 * into one bone each, with the landmarks the arm's muscles hang from.
 *   +X = outside (thumb side)   +Y = up   +Z = front, arm hanging, palm forward.
 *
 *   humerus  upper arm bone: shoulder joint at the origin, elbow at y = -3
 *   ulna     forearm bone on the little-finger side: the elbow's hinge (frame 'fa')
 *   radius   forearm bone on the thumb side: turns round the ulna (frame 'rad')
 * The forearm frames have the elbow at the origin.
 */

/** Landmarks on the upper arm bone. */
export const HUMERUS = {
  /** Centre of the ball that sits in the shoulder socket. */
  head: [-0.06, 0.04, -0.02] as Vec3,
  /** The knob on the outside of the head (greater tubercle): the rotator cuff. */
  greaterTubercle: [0.2, 0.06, 0.0] as Vec3,
  /** The groove down the front (intertubercular groove): its lips take the chest muscle and the lat. */
  groove: [0.08, -0.35, 0.16] as Vec3,
  /** The rough patch halfway down the outside: the deltoid's point. */
  deltoidTuberosity: [0.16, -1.3, 0.03] as Vec3,
  /** The big bump on the inside of the elbow: the forearm flexors. */
  medialEpicondyle: [-0.44, -2.88, -0.03] as Vec3,
  /** The small bump on the outside of the elbow: the forearm extensors. */
  lateralEpicondyle: [0.36, -2.86, -0.01] as Vec3,
}

/** Landmarks on the forearm bones (elbow at the origin). */
export const FOREARM = {
  /** Point of the elbow (olecranon): the triceps. */
  olecranon: [-0.06, 0.18, -0.29] as Vec3,
  /** Front of the ulna below the elbow: brachialis. */
  ulnaTuberosity: [-0.08, -0.3, 0.1] as Vec3,
  /** Front-inside of the radius below its head: biceps. */
  radiusTuberosity: [0.12, -0.45, 0.12] as Vec3,
  /** The tip of the radius at the wrist, thumb side: the ridge muscle (brachioradialis). */
  radiusStyloid: [0.33, -2.56, 0.0] as Vec3,
}

function humerusShape(): Shape {
  const bone = fuse(0.05, [
    egg(HUMERUS.head, [0.24, 0.24, 0.24]),
    egg([0.16, 0.08, 0.0], [0.1, 0.14, 0.13]),
    egg([0.0, 0.0, 0.15], [0.06, 0.08, 0.05]),
    ...rod(
      [
        [0.04, -0.15, 0.0],
        [0.02, -0.6, 0.0],
        [0, -1.5, 0],
        [0, -2.3, -0.01],
      ],
      [0.17, 0.12, 0.11, 0.12],
    ),
    egg([0.12, -1.3, 0.03], [0.05, 0.18, 0.06]),
    // the elbow end: flat and wide, with a bump on each side and the joint underneath
    egg([0, -2.62, -0.02], [0.28, 0.28, 0.1]),
    bar([0.1, -2.2, 0], [0.3, -2.85, 0], 0.04, 0.05),
    bar([-0.1, -2.2, 0], [-0.36, -2.88, -0.03], 0.04, 0.06),
    egg([-0.36, -2.88, -0.03], [0.1, 0.08, 0.08]),
    egg([0.3, -2.86, -0.01], [0.07, 0.07, 0.07]),
    // the spool the ulna hinges on, and the ball the radius turns on
    bar([-0.25, -3.0, 0.02], [-0.02, -3.0, 0.02], 0.11, 0.1),
    egg([0.14, -2.98, 0.05], [0.1, 0.1, 0.1]),
  ])
  return carve(bone, 0.03, [
    // the groove at the front of the head, and the hollow behind the elbow for its point
    bar([0.09, 0.15, 0.17], [0.07, -0.45, 0.13], 0.035, 0.035),
    egg([-0.05, -2.75, -0.13], [0.1, 0.12, 0.06]),
  ])
}

function ulnaShape(): Shape {
  const bone = fuse(0.05, [
    // the point of the elbow, wrapped round the back of the humerus' spool
    egg([-0.06, 0.12, -0.2], [0.11, 0.17, 0.1]),
    egg([-0.08, -0.12, 0.1], [0.08, 0.07, 0.07]),
    ...rod(
      [
        [-0.07, -0.2, -0.1],
        [-0.12, -0.6, -0.08],
        [-0.18, -1.8, -0.05],
        [-0.2, -2.35, 0],
      ],
      [0.12, 0.09, 0.07, 0.075],
    ),
    egg([-0.2, -2.42, 0.0], [0.09, 0.08, 0.09]),
    bar([-0.22, -2.45, -0.05], [-0.24, -2.58, -0.06], 0.035, 0.025),
  ])
  // the hook the spool sits in
  return carve(bone, 0.03, [egg([-0.12, 0.0, 0.02], [0.14, 0.13, 0.13])])
}

function radiusShape(): Shape {
  return fuse(0.05, [
    // a disc-shaped head that spins against the humerus' ball
    egg([0.18, -0.12, 0.04], [0.11, 0.05, 0.11]),
    bar([0.18, -0.12, 0.04], [0.17, -0.38, 0.04], 0.065, 0.065),
    egg([0.12, -0.45, 0.07], [0.06, 0.08, 0.06]),
    // the shaft bows out, and the bone grows broad at the wrist
    ...rod(
      [
        [0.17, -0.4, 0.04],
        [0.22, -1.3, 0.02],
        [0.16, -2.1, 0],
      ],
      [0.075, 0.08, 0.1],
    ),
    egg([0.08, -2.42, 0.0], [0.24, 0.11, 0.13]),
    bar([0.26, -2.4, 0], [0.32, -2.56, 0], 0.04, 0.03),
  ])
}

const humerusMesh = sculpted('humerus', { field: () => humerusShape().f, lo: [-0.55, -3.2, -0.32], hi: [0.45, 0.32, 0.3], step: 0.02 })
const ulnaMesh = sculpted('ulna', { field: () => ulnaShape().f, lo: [-0.35, -2.7, -0.35], hi: [0.1, 0.35, 0.22], step: 0.018 })
const radiusMesh = sculpted('radius', { field: () => radiusShape().f, lo: [-0.2, -2.65, -0.17], hi: [0.4, -0.02, 0.2], step: 0.018 })

/** The upper arm bone on a frame (the arm rig's 'hum', the torso's 'armL'). */
export const humerusSolid = (frame: string): SolidDef => ({ frame, mesh: humerusMesh })
export const ulnaSolid = (frame: string): SolidDef => ({ frame, mesh: ulnaMesh })
export const radiusSolid = (frame: string): SolidDef => ({ frame, mesh: radiusMesh })
