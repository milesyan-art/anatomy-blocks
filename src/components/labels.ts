import type { Vector3 } from 'three'

/**
 * Shared scratch-pad between the 3D scene and the HTML label layer.
 * The scene writes where each label should point; the projector moves the DOM nodes
 * directly, so labels follow the camera without re-rendering React.
 */
export interface LabelAnchor {
  pos: Vector3
  n: Vector3
  /** Midline the model is mirrored across (the right limb), or null as modelled. */
  mirror: number | null
}

export interface LabelStore {
  anchors: Map<string, LabelAnchor>
  pills: Map<string, HTMLElement>
  lines: Map<string, SVGLineElement>
  dots: Map<string, SVGCircleElement>
}

export function createLabelStore(): LabelStore {
  return { anchors: new Map(), pills: new Map(), lines: new Map(), dots: new Map() }
}
