import type { PathPoint, RigDef, SweepDef } from '../engine/types'

export type Body = 'male' | 'female'

/** Rebuild a rig with every station passed through `fn`. */
export function reshape(rig: RigDef, fn: (def: SweepDef, pt: PathPoint) => PathPoint): RigDef {
  return {
    ...rig,
    sweeps: rig.sweeps.map((def) => ({ ...def, path: def.path.map((pt) => fn(def, pt)) })),
  }
}

/** Scale a station's width / thickness (and its key shape, if it has one). */
export function resize(pt: PathPoint, kw: number, kh: number): PathPoint {
  return {
    ...pt,
    w: pt.w * kw,
    h: pt.h * kh,
    alt: pt.alt
      ? {
          ...pt.alt,
          w: pt.alt.w === undefined ? undefined : pt.alt.w * kw,
          h: pt.alt.h === undefined ? undefined : pt.alt.h * kh,
        }
      : undefined,
  }
}

/**
 * The slimmer limb: same skeleton, same attachments, thinner blocks.
 * Muscle paths sit on the surface underneath, so shrinking width and
 * thickness is enough - nothing has to be moved.
 */
export function slim(rig: RigDef, soft = 0.86, hard = 0.92): RigDef {
  return reshape(rig, (def, pt) =>
    def.kind === 'muscle' || def.kind === 'tendon' ? resize(pt, soft, soft * 0.92) : resize(pt, hard, hard),
  )
}
