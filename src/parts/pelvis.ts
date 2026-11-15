import { cage } from '../engine/frames'
import type { PathPoint, SweepDef } from '../engine/types'

/*
 * The hip block, shared by the torso and the leg.
 *
 * Drawn the way it is blocked in for painting: one bowl, not a skeleton. It is
 * wide at the rim, narrower underneath, closed and upright at the back, and cut
 * down in a V at the front - so from the front it reads as a heart, with the two
 * lobes ending in the front points of the hips.
 *
 * Modelled around the midline (x = 0) with the hip joints at x = +-0.85, just inside
 * its wall, so a thigh bone simply plugs into the side of the bowl - no separate sockets.
 * `dx` slides the whole thing sideways for rigs with a different origin.
 */

const F = 'pelvis'

/*
 * The bowl, ring by ring from the rim down:
 *   y, back z, outer width, outer depth (half sizes), half-width of the front cut in degrees
 * The cut is widest at the rim and closes at the pubic bone. Below that the two ends
 * of the wall overlap a little (a negative cut), so the front is one unbroken surface.
 */
const BOWL: [number, number, number, number, number][] = [
  [1.5, -0.93, 1.36, 0.72, 84],
  [1.2, -0.95, 1.36, 0.75, 68],
  [0.8, -0.95, 1.32, 0.78, 52],
  [0.45, -0.93, 1.2, 0.74, 30],
  [0.15, -0.9, 1.08, 0.68, -18],
  [-0.15, -0.86, 0.92, 0.58, -18],
  [-0.42, -0.8, 0.62, 0.42, -18],
  [-0.56, -0.74, 0.2, 0.16, -18],
]

/**
 * The bowl's stations. `rimX` and `baseX` widen or narrow the rim and the
 * underside separately: that is where a female pelvis differs from a male one.
 */
export function pelvisBowl(rimX = 1, baseX = 1): PathPoint[] {
  return BOWL.map(([y, back, w, d, open]) => {
    const t = Math.min(1, Math.max(0, (y - 0.15) / (1.2 - 0.15)))
    const kx = baseX + (rimX - baseX) * t
    return cage(F, y, back + d, w * kx, d, open, Math.min(0.09, d * 0.5), 0.78)
  })
}

const bowl: SweepDef = {
  id: 'pelvis',
  group: 'bone',
  kind: 'bone',
  section: 'shell',
  path: pelvisBowl(),
}

export function pelvisBlocks(dx = 0): SweepDef[] {
  if (dx === 0) return [bowl]
  // slide the whole bowl sideways
  return [{ ...bowl, path: bowl.path.map((pt) => ({ ...pt, p: [pt.p[0] + dx, pt.p[1], pt.p[2]] })) }]
}
