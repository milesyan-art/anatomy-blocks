import type { Matrix4 } from 'three'

export type Vec3 = [number, number, number]

/** Slider values for one rig, keyed by control id (degrees). */
export type Pose = Record<string, number>

/** Returns the matrix of a named frame ("bone space" -> rig space). */
export type FrameGetter = (name: string) => Matrix4

/**
 * One station along a muscle / bone.
 * The shape is swept through these stations, so each one says
 * "at this spot on this bone, the block is this wide and this thick".
 */
export interface PathPoint {
  /** Frame the point is glued to, e.g. `hum`, or `fa@0.3` for a partly twisted frame. */
  f: string
  /** Position inside that frame. */
  p: Vec3
  /** Half width (across the form). */
  w: number
  /** Thickness, measured outward from the path. */
  h: number
  /** Outward direction in frame space. Default: straight out from the frame's Y axis. */
  n?: Vec3
  /** Wrap angle in radians - bends the cross-section around the form underneath. */
  curl?: number
  /** A second "key shape" that a drive (0..1, e.g. how bent the elbow is) blends towards. */
  alt?: { drive: string; p?: Vec3; w?: number; h?: number }
}

export type SectionName = 'block' | 'round' | 'hex' | 'crate' | 'box' | 'sheet' | 'sheet7'

export type SweepKind = 'muscle' | 'tendon' | 'bone' | 'prop'

export interface SweepDef {
  id: string
  /** Legend group id for muscles/tendons, anything for bones and props. */
  group: string
  kind: SweepKind
  path: PathPoint[]
  section?: SectionName
  /** Rings per span between two stations. */
  seg?: number
  /** How strongly the block thickens when its path gets shorter. */
  bulge?: number
  /** Index of the station that carries the group's label. */
  label?: number
}

export interface ControlDef {
  id: string
  label: string
  min: number
  max: number
  def: number
  /** Captions for the two ends of the slider. */
  lo: string
  hi: string
}

export interface PresetDef {
  label: string
  pose: Pose
}

export interface GroupDef {
  id: string
  name: string
  color: string
  /** The real muscles hiding inside this simplified block. */
  real: string
  /** Where it starts and ends. */
  where: string
  /** How to draw it as a block. */
  shape: string
  /** What to watch while moving the sliders. */
  move: string
}

export interface RigDef {
  id: string
  controls: ControlDef[]
  presets: PresetDef[]
  groups: GroupDef[]
  sweeps: SweepDef[]
  frames: (pose: Pose) => FrameGetter
  /** Normalised 0..1 values that key shapes can follow. */
  drives: (pose: Pose) => Record<string, number>
  /**
   * Single limbs only: where the body's midline is (x) in this rig's space.
   * Limbs are modelled as the LEFT one; the right one is the same rig mirrored across this line.
   */
  midX?: number
}

export interface ViewDef {
  target: Vec3
  /** Width and height of the thing to frame; the camera backs off until it fits. */
  fit: [number, number]
  /** Degrees around the model: 0 = front, 90 = outside, 180 = back. */
  az: number
  /** Degrees above the horizon. */
  el: number
}

export interface LessonDef {
  id: string
  rig: string
  section: string
  title: string
  blurb: string
  /** Muscle groups this lesson is about. */
  show: string[]
  view: ViewDef
  tips: string[]
  /** Names for the four view buttons: az 0, 90, 180, -90. */
  sides?: [string, string, string, string]
}
