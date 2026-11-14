import type { RigDef, ViewDef } from './types'

/**
 * Which limb to show. Limbs are modelled as the left one; the right one is
 * the same rig mirrored across the body's midline (`RigDef.midX`).
 */
export type LimbSide = 'left' | 'right'

export function hasSides(rig: RigDef): boolean {
  return rig.midX !== undefined
}

/** The midline to mirror the rig across, or null to draw it as modelled. */
export function mirrorOf(rig: RigDef, side: LimbSide): number | null {
  return side === 'right' && rig.midX !== undefined ? rig.midX : null
}

/** A lesson's camera (set up for the left limb), moved to the chosen side. */
export function sideView(view: ViewDef, rig: RigDef, side: LimbSide): ViewDef {
  const mid = mirrorOf(rig, side)
  if (mid === null) return view
  // the mirror image: same distance on the other side of the midline, seen from the other side
  const [x, y, z] = view.target
  return { ...view, target: [2 * mid - x, y, z], az: -view.az }
}
