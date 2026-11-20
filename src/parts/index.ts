import type { LessonDef, Pose, RigDef } from '../engine/types'
import { ARM_MID_X, armLessons, armRig } from './arm'
import { slim } from './body'
import type { Body } from './body'
import { figureLessons, figureRig } from './figure'
import { footLessons, footRig } from './foot'
import { handLessons, handRig } from './hand'
import { legLessons, legRig } from './leg'
import { RIBS_X, torsoLessons, torsoRig, torsoRigFemale } from './torso'

export type { Body } from './body'

const RIGS: Record<Body, Record<string, RigDef>> = {
  male: {
    arm: armRig,
    hand: handRig,
    leg: legRig,
    foot: footRig,
    torso: torsoRig,
    figure: figureRig,
  },
  female: {
    // narrower shoulders, so the midline is closer
    arm: { ...slim(armRig, 0.84), midX: ARM_MID_X * RIBS_X },
    hand: slim(handRig, 0.9, 0.9),
    leg: slim(legRig, 0.9),
    foot: slim(footRig, 0.92, 0.92),
    torso: torsoRigFemale,
    // the posed figure is built on the male skeleton only, for now
    figure: figureRig,
  },
}

export const RIG_IDS = Object.keys(RIGS.male)

export function getRig(id: string, body: Body): RigDef {
  return RIGS[body][id]
}

export const LESSONS: LessonDef[] = [...armLessons, ...handLessons, ...legLessons, ...footLessons, ...torsoLessons, ...figureLessons]

/**
 * The side panel: one button per body part, opening its whole-part lesson, with the
 * close-ups as smaller sub-options under it. Hand and foot stand on their own. The torso has no whole lesson, so its
 * button opens the front and its two sides are the sub-options.
 */
export const NAV: { main: string; subs: string[] }[] = [
  { main: 'arm', subs: ['upper-arm', 'forearm'] },
  { main: 'hand', subs: [] },
  { main: 'leg', subs: ['thigh', 'lower-leg'] },
  { main: 'foot', subs: [] },
  { main: 'torso-front', subs: ['torso-front', 'torso-back'] },
  { main: 'figure', subs: figureLessons.filter((l) => l.id !== 'figure').map((l) => l.id) },
]

export function defaultPose(rig: RigDef): Pose {
  const pose: Pose = {}
  for (const c of rig.controls) pose[c.id] = c.def
  return pose
}

/** The pose every muscle's resting length is measured in. */
export function restPose(rig: RigDef): Pose {
  const pose: Pose = {}
  for (const c of rig.controls) pose[c.id] = 0
  return pose
}
