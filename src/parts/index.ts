import type { LessonDef, Pose, RigDef } from '../engine/types'
import { armLessons, armRig } from './arm'
import { legLessons, legRig } from './leg'
import { torsoLessons, torsoRig } from './torso'

export const RIGS: Record<string, RigDef> = {
  [armRig.id]: armRig,
  [legRig.id]: legRig,
  [torsoRig.id]: torsoRig,
}

export const LESSONS: LessonDef[] = [...armLessons, ...legLessons, ...torsoLessons]

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
