import type { BufferGeometry, Matrix4, Object3D, Vector3 } from 'three'

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
  /** Stretches a wrapped cross-section across (1 = round, >1 = wider than deep), so it can hug an oval. */
  wide?: number
  /** Squares off a wrapped cross-section (1 = true oval, smaller = boxier, with flatter sides). */
  square?: number
  /** A second "key shape" that a drive (0..1, e.g. how bent the elbow is) blends towards. */
  alt?: { drive: string; p?: Vec3; w?: number; h?: number }
}

export type SectionName = 'block' | 'round' | 'hex' | 'crate' | 'box' | 'sheet' | 'sheet7' | 'shell'

export type SweepKind = 'muscle' | 'tendon' | 'bone' | 'prop'

/** One control point of a skin: where the outside of the pad is, and how thick the pad is there. */
export interface SkinPoint {
  /** Frame the point is glued to. */
  f: string
  p: Vec3
  /** Thickness, measured inwards from the point. */
  h: number
}

/**
 * A smooth pad laid over the body, for forms a swept block cannot follow.
 * It is drawn from a small grid of control points instead of a path.
 */
export interface SkinDef {
  /**
   * The control grid. Rows run down the form; within a row the points run to the
   * right as seen from outside (front to back on the figure's left side).
   */
  rows: SkinPoint[][]
  /** Columns that carry an inked plane line (control index, fractions allowed). */
  lines?: number[]
  /** Rows that carry a guide ring (control index). Left out = every row but the first and last. */
  rings?: number[]
  /** How far in from the border the edge starts to roll over, in control spans. */
  round?: number
  /** Thickness left at the very edge, as a share of the full thickness. */
  rim?: number
  /** Samples per control span. */
  sub?: number
  /** The control point the group's label points at: [row, column]. */
  label?: [number, number]
}

/** A ready-made mesh, in the coordinates of its frame. */
export interface SolidMesh {
  position: Float32Array
  normal: Float32Array
  index: Uint32Array
  /**
   * Optional ink, two values per vertex (the fill shader's line coordinates): lines are
   * drawn wherever either value crosses a whole number - see `facetInk`.
   */
  ink?: Float32Array
}

/**
 * A form sculpted once at full resolution and then only carried along by one frame -
 * for bones whose shape never changes (see `engine/sdf.ts`).
 */
/**
 * A sculpted mesh that may not be built yet: it is meshed off the main thread (or read
 * from the browser's cache) and arrives later. See `engine/meshes.ts`.
 */
export interface MeshRef {
  readonly key: string
  /** The mesh, if it has arrived. */
  current(): SolidMesh | null
  /** The mesh, once it has arrived. */
  load(): Promise<SolidMesh>
}

export interface SolidDef {
  /** The frame it is glued to. */
  frame: string
  mesh: MeshRef
  /** Slides the whole mesh (in frame space), for rigs with a different origin. */
  offset?: Vec3
  /** Stretches the mesh about the frame's origin before sliding it (e.g. narrower female ribs). */
  scale?: Vec3
  /** Reflected across x = 0 after it is slid and stretched: the right-hand copy of a left part. */
  mirror?: boolean
}

export interface SweepDef {
  id: string
  /** Legend group id for muscles/tendons, anything for bones and props. */
  group: string
  kind: SweepKind
  path: PathPoint[]
  /** Draw this form as a skin instead of sweeping a block along `path` (which then stays empty). */
  skin?: SkinDef
  /** Draw this form as a sculpted solid instead (`path` then stays empty). */
  solid?: SolidDef
  section?: SectionName
  /** Rings per span between two stations. */
  seg?: number
  /** How strongly the block thickens when its path gets shorter. */
  bulge?: number
  /**
   * Flat facets per span along the length, joined by narrow bevels (0 = smooth along the
   * length). Muscles default to `MUSCLE_FACETS`; the plaster model is always smooth.
   */
  facets?: number
  /** Index of the station that carries the group's label. */
  label?: number
}

/** A form on screen, whichever way it is built: a swept block or a skin. */
export interface Form {
  readonly def: SweepDef
  readonly geometry: BufferGeometry
  /** Where the label points at, in rig space. */
  readonly anchor: Vector3
  readonly anchorNormal: Vector3
  /**
   * Forms that are moved as a whole (sculpted bones) take over the matrix of the objects
   * that draw them; others leave it alone.
   */
  attach?(obj: Object3D): void
  detach?(obj: Object3D): void
  /** For forms whose geometry arrives later: resolves when it has. */
  readonly ready?: Promise<void>
  /** False while the geometry is still on its way (nothing to draw yet). */
  readonly loaded?: boolean
  /** Remember the resting pose (flexing is measured against it). */
  setRest(frames: FrameGetter, drives: Record<string, number>): void
  update(frames: FrameGetter, drives: Record<string, number>): void
  dispose(): void
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
  /** Set only by presets (the full figure has too many joints to list). */
  hidden?: boolean
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
   * Sliders that move together: called when the control `id` is dragged to `value`,
   * returns the whole new pose (e.g. raising the leg also bends the knee, as people do).
   * Left out = only that slider changes.
   */
  couple?: (pose: Pose, id: string, value: number) => Pose
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
  /** Screen tilt in degrees (+ = picture turned clockwise). Left out = keep the current tilt. */
  roll?: number
}

export interface LessonDef {
  id: string
  rig: string
  section: string
  title: string
  /** A shorter name for the side panel, where the part's name is already shown above it. */
  short?: string
  blurb: string
  /** Muscle groups this lesson is about. */
  show: string[]
  view: ViewDef
  tips: string[]
  /**
   * The lesson that covers the other side of the same model. When the camera turns
   * to face that lesson's view, the app follows it there.
   */
  otherSide?: string
  /** Names for the four view buttons: az 0, 90, 180, -90. */
  sides?: [string, string, string, string]
  /** The pose the model glides into when the lesson opens. */
  pose?: Pose
  /** The groups that get a label on the model, when not all of `show` should. */
  labels?: string[]
}
