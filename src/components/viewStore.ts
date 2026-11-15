import { Quaternion } from 'three'

/** Where to glide the camera. Degrees; anything left out stays as it is. */
export interface ViewAim {
  /** Round the model: 0 = front, 90 = its left side. */
  az?: number
  /** Above the horizon. */
  el?: number
  /** Screen tilt: + turns the picture clockwise. */
  roll?: number
}

/**
 * Shared scratch-pad between the camera (inside the canvas) and the gizmo (HTML on top).
 * The camera writes its orientation every frame and fills in the commands;
 * the gizmo redraws from it without re-rendering React.
 */
export interface ViewStore {
  /** Screen tilt in degrees, as drawn this frame. + = picture turned clockwise. */
  roll: number
  /** The tilt the camera is gliding to (equal to roll when still). */
  rollGoal: number
  /** The camera's orientation this frame. */
  quat: Quaternion
  listeners: Set<() => void>
  glide: (to: ViewAim, ms?: number) => void
  /** Turn the model as if dragged on screen by (dx, dy) degrees. */
  turn: (dx: number, dy: number) => void
  setRoll: (deg: number) => void
}

export function createViewStore(): ViewStore {
  const noop = () => {}
  return { roll: 0, rollGoal: 0, quat: new Quaternion(), listeners: new Set(), glide: noop, turn: noop, setRoll: noop }
}

export const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180
