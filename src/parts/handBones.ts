import { bar, egg, fuse, sculpted } from '../engine/sdf'
import type { Shape } from '../engine/sdf'
import type { SweepDef, Vec3 } from '../engine/types'

/*
 * The bones of the LEFT hand, sculpted like the rest of the skeleton.
 *   Fingers pointing down, palm facing +Z, thumb on +X; the wrist at the origin.
 *
 *   palm   'palm'   the eight little wrist bones in two rows, and the four long bones
 *                   of the palm (metacarpals), each ending in a knuckle
 *   finger `${id}A/B/C` three bones each, from the knuckle to the tip
 *   thumb  'thA/B/C'  its long bone (inside the thumb pad), then two finger bones
 * Each finger bone runs from its frame's origin down -Y.
 */

export interface Finger {
  id: string
  /** knuckle position on the palm */
  x: number
  y: number
  /** bone lengths, knuckle to tip */
  a: number
  b: number
  c: number
  /** which way (and how much) it fans out */
  fan: number
  /** where its long bone starts at the wrist (x), and how thick its knuckle is */
  base: number
  knuckle: number
}

export const FINGERS: Finger[] = [
  { id: 'index', x: 0.3, y: -0.98, a: 0.46, b: 0.27, c: 0.23, fan: 1, base: 0.17, knuckle: 0.066 },
  { id: 'middle', x: 0.1, y: -1.02, a: 0.5, b: 0.31, c: 0.25, fan: 0.3, base: 0.04, knuckle: 0.068 },
  { id: 'ring', x: -0.1, y: -0.98, a: 0.46, b: 0.29, c: 0.24, fan: -0.4, base: -0.08, knuckle: 0.06 },
  { id: 'pinky', x: -0.29, y: -0.9, a: 0.36, b: 0.21, c: 0.21, fan: -1, base: -0.18, knuckle: 0.055 },
]

export const THUMB = { base: [0.3, -0.2, 0.08] as const, a: 0.42, b: 0.3, c: 0.27 }

/** Wrist bones and the long bones of the palm, each its own little block, pressed together. */
function palmShape(): Shape {
  const parts: Shape[] = [
    // the near row, under the end of the radius
    egg([0.2, -0.1, 0.0], [0.1, 0.07, 0.08]),
    egg([0.04, -0.06, -0.01], [0.08, 0.07, 0.08]),
    egg([-0.13, -0.1, -0.02], [0.07, 0.06, 0.07]),
    egg([-0.16, -0.12, 0.08], [0.04, 0.04, 0.04]),
    // the far row, where the long bones start
    egg([0.27, -0.24, 0.04], [0.07, 0.07, 0.07]),
    egg([0.16, -0.25, 0.0], [0.06, 0.06, 0.06]),
    egg([0.03, -0.24, -0.01], [0.08, 0.1, 0.08]),
    egg([-0.13, -0.24, -0.01], [0.08, 0.08, 0.08]),
    egg([-0.12, -0.26, 0.08], [0.03, 0.03, 0.04]),
  ]
  for (const f of FINGERS) {
    const base: Vec3 = [f.base, -0.36, -0.01]
    const head: Vec3 = [f.x, f.y + f.knuckle, -0.01]
    parts.push(
      fuse(0.03, [egg(base, [0.06, 0.05, 0.06]), bar(base, head, 0.04, 0.035), egg(head, [f.knuckle * 0.95, f.knuckle, f.knuckle])]),
    )
  }
  return fuse(0.01, parts)
}

/** One finger bone `len` long down its frame: knobbed at the near end, `tip` = a rounded tuft. */
function phalanxShape(len: number, r: number, tip: boolean): Shape {
  const end: Vec3 = [0, -len + (tip ? 0.03 : 0.02), 0]
  return fuse(0.02, [
    egg([0, -0.02, 0], [r * 1.15, r, r]),
    bar([0, -0.02, 0], end, r * 0.8, tip ? r * 0.55 : r * 0.75),
    tip ? egg(end, [r * 0.85, r * 0.7, r * 0.6]) : egg(end, [r * 0.95, r * 0.8, r * 0.8]),
  ])
}

const palmMesh = sculpted('palm', { field: () => palmShape().f, lo: [-0.32, -1.02, -0.12], hi: [0.4, 0.04, 0.14], step: 0.012 })

const phalanx = (key: string, len: number, r: number, tip = false) =>
  sculpted(`phalanx/${key}`, { field: () => phalanxShape(len, r, tip).f, lo: [-r * 1.3, -len - 0.02, -r * 1.2], hi: [r * 1.3, r * 0.4, r * 1.2], step: 0.01 })

const bone = (id: string, frame: string, mesh: ReturnType<typeof phalanx>): SweepDef => ({
  id,
  group: 'bone',
  kind: 'bone',
  path: [],
  solid: { frame, mesh },
})

/** Every bone of the hand, on the hand rig's frames ('palm', `${finger}A/B/C`, 'thA/B/C'). */
export function handBones(): SweepDef[] {
  return [
    bone('palm', 'palm', palmMesh),
    ...FINGERS.flatMap((f) => [
      bone(`${f.id}-1`, `${f.id}A`, phalanx(`${f.id}-1`, f.a, 0.05)),
      bone(`${f.id}-2`, `${f.id}B`, phalanx(`${f.id}-2`, f.b, 0.043)),
      bone(`${f.id}-3`, `${f.id}C`, phalanx(`${f.id}-3`, f.c, 0.037, true)),
    ]),
    // the thumb's long bone sits inside the thumb pad; it is a little stouter
    bone('thumb-1', 'thA', phalanx('thumb-1', THUMB.a, 0.058)),
    bone('thumb-2', 'thB', phalanx('thumb-2', THUMB.b, 0.05)),
    bone('thumb-3', 'thC', phalanx('thumb-3', THUMB.c, 0.044, true)),
  ]
}
