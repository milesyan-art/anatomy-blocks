import { footBones, legBones } from './legBones'
import { handBones } from './handBones'
import { FEMALE_HIPS_X, FEMALE_RIM_X, pelvisBlocks, pelvisSolid } from './pelvis'
import './armBones'
import './torsoBones'

/*
 * Registers every sculpted part without loading the rigs (or three.js) - for the mesh
 * workers, which only need to know how to build each part. Parts register themselves
 * when their module loads or when the function that hands them out first runs, so
 * this touches each of those once.
 */
export function registerSculpts() {
  pelvisBlocks()
  pelvisSolid(FEMALE_RIM_X, FEMALE_HIPS_X)
  legBones()
  footBones()
  handBones()
}
