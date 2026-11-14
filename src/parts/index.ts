import type { LessonDef, Pose, RigDef } from '../engine/types'
import { armLessons, armRig } from './arm'
import { slim } from './body'
import type { Body } from './body'
import { footLessons, footRig } from './foot'
import { handLessons, handRig } from './hand'
import { legLessons, legRig } from './leg'
import { torsoLessons, torsoRig, torsoRigFemale } from './torso'

export type { Body } from './body'

const RIGS: Record<Body, Record<string, RigDef>> = {
  male: {
    arm: armRig,
    hand: handRig,
    leg: legRig,
    foot: footRig,
    torso: torsoRig,
  },
  female: {
    arm: slim(armRig, 0.84),
    hand: slim(handRig, 0.9, 0.9),
    leg: slim(legRig, 0.9),
    foot: slim(footRig, 0.92, 0.92),
    torso: torsoRigFemale,
  },
}

export const RIG_IDS = Object.keys(RIGS.male)

export function getRig(id: string, body: Body): RigDef {
  return RIGS[body][id]
}

export const LESSONS: LessonDef[] = [...armLessons, ...handLessons, ...legLessons, ...footLessons, ...torsoLessons]

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
