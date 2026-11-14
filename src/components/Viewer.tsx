import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Color, Spherical, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DEG } from '../engine/frames'
import { BONE, BONE_INK, applyLight, inkOf, makeFill, makeGhost, makeOutline, paleOf } from '../engine/materials'
import type { LightSetting } from '../engine/materials'
import { mirrorOf } from '../engine/mirror'
import type { LimbSide } from '../engine/mirror'
import { Sweep } from '../engine/sweep'
import type { GroupDef, LessonDef, Pose, RigDef, Vec3, ViewDef } from '../engine/types'
import { restPose } from '../parts'
import { createLabelStore } from './labels'
import type { LabelAnchor, LabelStore } from './labels'

export interface ViewOptions {
  muscles: boolean
  bones: boolean
  guides: boolean
  labels: boolean
  neighbours: boolean
}

interface ViewerProps {
  rig: RigDef
  lesson: LessonDef
  pose: Pose
  /** Left or right limb (single-limb rigs only). */
  side: LimbSide
  options: ViewOptions
  light: LightSetting
  /** Group to spotlight (hovered or selected). */
  focus: string | null
  view: ViewDef
  viewNonce: number
  onHover: (group: string | null) => void
  onSelect: (group: string | null) => void
}

export function Viewer(props: ViewerProps) {
  const { rig, lesson, options, focus, onSelect } = props
  const store = useMemo(() => createLabelStore(), [])
  const shown = rig.groups.filter((g) => lesson.show.includes(g.id))

  return (
    <div className="stage-canvas">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 26, near: 0.5, far: 200, position: [0, 0, 14] }}
        onPointerMissed={() => onSelect(null)}
      >
        <Orbit view={props.view} nonce={props.viewNonce} />
        <Lighting light={props.light} />
        <RigModel {...props} store={store} />
        <LabelProjector store={store} center={props.view.target} />
      </Canvas>
      <LabelLayer store={store} groups={shown} visible={options.labels && options.muscles} focus={focus} onSelect={onSelect} />
    </div>
  )
}

/* ───────────────────────── camera ───────────────────────── */

function Orbit({ view, nonce }: { view: ViewDef; nonce: number }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const getState = useThree((s) => s.get)
  const ready = useThree((s) => s.size.width > 0 && s.size.height > 0)
  const first = useRef(true)
  const anim = useRef<{
    t0: number
    fromT: Vector3
    toT: Vector3
    from: Spherical
    to: Spherical
  } | null>(null)

  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.12
    c.rotateSpeed = 0.9
    c.zoomSpeed = 0.8
    c.minDistance = 3
    c.maxDistance = 45
    return c
  }, [camera, gl])

  useEffect(() => {
    const onChange = () => invalidate()
    const onStart = () => {
      anim.current = null
    }
    controls.connect(gl.domElement)
    controls.addEventListener('change', onChange)
    controls.addEventListener('start', onStart)
    return () => {
      controls.removeEventListener('change', onChange)
      controls.removeEventListener('start', onStart)
      controls.disconnect()
    }
  }, [controls, gl, invalidate])

  // glide to the requested view (snap on first load)
  useEffect(() => {
    if (!ready) return
    const toT = new Vector3(...view.target)
    // back off until the lesson's box fits both ways
    const { width, height } = getState().size
    const tan = Math.tan(((camera as PerspectiveCamera).fov * DEG) / 2)
    const aspect = width / Math.max(height, 1)
    const dist = Math.max(view.fit[1] / (2 * tan), view.fit[0] / (2 * tan * aspect)) * 1.2
    const to = new Spherical(dist, Math.PI / 2 - view.el * DEG, view.az * DEG)
    if (first.current) {
      first.current = false
      controls.target.copy(toT)
      camera.position.setFromSpherical(to).add(toT)
      controls.update()
      invalidate()
      return
    }
    const from = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    // take the short way round
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2
    while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2
    anim.current = { t0: performance.now(), fromT: controls.target.clone(), toT, from, to }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ready])

  useFrame(() => {
    const a = anim.current
    if (a) {
      const t = Math.min(1, (performance.now() - a.t0) / 520)
      const e = 1 - Math.pow(1 - t, 3)
      const s = new Spherical(
        a.from.radius + (a.to.radius - a.from.radius) * e,
        a.from.phi + (a.to.phi - a.from.phi) * e,
        a.from.theta + (a.to.theta - a.from.theta) * e,
      )
      controls.target.lerpVectors(a.fromT, a.toT, e)
      camera.position.setFromSpherical(s).add(controls.target)
      if (t >= 1) anim.current = null
      invalidate()
    }
    controls.update()
  })

  return null
}

/* ───────────────────────── light ───────────────────────── */

function Lighting({ light }: { light: LightSetting }) {
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    applyLight(light)
    invalidate()
  }, [light, invalidate])
  return null
}

/* ───────────────────────── model ───────────────────────── */

function RigModel({
  rig,
  lesson,
  pose,
  side,
  options,
  light,
  focus,
  onHover,
  onSelect,
  store,
}: ViewerProps & { store: LabelStore }) {
  const invalidate = useThree((s) => s.invalidate)
  // light on = a smooth, solid model so the light can roll across the forms
  const solid = light.on

  const sweeps = useMemo(() => {
    const rest = restPose(rig)
    const frames = rig.frames(rest)
    const drives = rig.drives(rest)
    return rig.sweeps.map((def) => {
      const s = new Sweep(def, solid)
      s.setRest(frames, drives)
      return s
    })
  }, [rig, solid])

  useEffect(() => () => sweeps.forEach((s) => s.dispose()), [sweeps])

  const groups = useMemo(() => new Map(rig.groups.map((g) => [g.id, g])), [rig])
  const mirror = mirrorOf(rig, side)

  // re-shape every block whenever the pose changes
  useLayoutEffect(() => {
    const frames = rig.frames(pose)
    const drives = rig.drives(pose)
    for (const s of sweeps) s.update(frames, drives)
    invalidate()
  }, [rig, sweeps, pose, invalidate])

  // tell the label layer where to point
  useLayoutEffect(() => {
    store.anchors.clear()
    for (const id of lesson.show) {
      const all = sweeps.filter((s) => s.def.group === id)
      const muscles = all.filter((s) => s.def.kind === 'muscle')
      const mine = muscles.length ? muscles : all
      const carrier = mine.find((s) => s.def.label !== undefined) ?? mine[0]
      if (carrier) store.anchors.set(id, { pos: carrier.anchor, n: carrier.anchorNormal, mirror })
    }
    invalidate()
  }, [store, sweeps, lesson, mirror, invalidate])

  return (
    // the right limb is the left one reflected across the midline: x -> 2 * mid - x
    <group position={[mirror === null ? 0 : 2 * mirror, 0, 0]} scale={[mirror === null ? 1 : -1, 1, 1]}>
      {sweeps.map(renderSweep)}
    </group>
  )

  function renderSweep(s: Sweep) {
    const { kind, group } = s.def
    if (kind === 'bone') {
      return options.bones ? <SweepMesh key={s.def.id} sweep={s} guides={false} dim={0} solid={solid} /> : null
    }
    if (kind === 'prop') return <SweepMesh key={s.def.id} sweep={s} guides={false} dim={0} solid={solid} />
    const g = groups.get(group)
    const inLesson = lesson.show.includes(group)
    // muscles switched off = study the base forms on their own
    if (!options.muscles) return null
    if (!inLesson && !options.neighbours) return null
    const dim = !inLesson ? 0.82 : focus && focus !== group ? 0.66 : 0
    return (
      <SweepMesh
        key={s.def.id}
        sweep={s}
        group={g}
        guides={options.guides && inLesson}
        dim={dim}
        solid={solid}
        onHover={inLesson ? onHover : undefined}
        onSelect={inLesson ? onSelect : undefined}
      />
    )
  }
}

interface SweepMeshProps {
  sweep: Sweep
  group?: GroupDef
  guides: boolean
  dim: number
  /** Light mode: smooth shading, no plane edges, no see-through bones. */
  solid?: boolean
  onHover?: (group: string | null) => void
  onSelect?: (group: string | null) => void
}

function SweepMesh({ sweep, group, guides, dim, solid = false, onHover, onSelect }: SweepMeshProps) {
  const kind = sweep.def.kind
  const color = group?.color

  const mats = useMemo(() => {
    let fill: Color
    let ink: Color
    let thickness = 0.03
    if (kind === 'bone' || kind === 'prop') {
      // the white mannequin everything else is attached to
      fill = new Color(BONE)
      ink = new Color(BONE_INK)
      thickness = 0.024
    } else if (kind === 'tendon') {
      fill = paleOf(color ?? '#cccccc', 0.6)
      ink = inkOf(color ?? '#cccccc').lerp(new Color('#ffffff'), 0.25)
    } else {
      fill = new Color(color ?? '#cccccc')
      ink = inkOf(color ?? '#cccccc')
    }
    return {
      fill: makeFill(fill, ink),
      outline: makeOutline(ink, thickness),
      ghost: kind === 'bone' ? makeGhost() : null,
    }
  }, [kind, color])

  useEffect(
    () => () => {
      mats.fill.dispose()
      mats.outline.dispose()
      mats.ghost?.dispose()
    },
    [mats],
  )

  // the smooth model has no plane edges to ink
  const edge = solid ? 0 : kind === 'bone' || kind === 'prop' ? 0.3 : 0.5
  const ring = guides ? (kind === 'tendon' ? 0.45 : 0.7) : 0

  const id = sweep.def.group
  const handlers = onHover
    ? {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          // a finger has no hover - taps select instead
          if (e.nativeEvent.pointerType === 'touch') return
          onHover(id)
          document.body.style.cursor = 'pointer'
        },
        onPointerOut: () => {
          onHover(null)
          document.body.style.cursor = ''
        },
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSelect?.(id)
        },
      }
    : {}

  return (
    <>
      <mesh geometry={sweep.geometry} {...handlers}>
        <primitive
          object={mats.fill}
          attach="material"
          uniforms-uDim-value={dim}
          uniforms-uEdge-value={edge}
          uniforms-uRing-value={ring}
        />
      </mesh>
      <mesh geometry={sweep.geometry}>
        <primitive object={mats.outline} attach="material" uniforms-uDim-value={dim * 0.85} />
      </mesh>
      {/* see-through bones only in the reference look; the solid model hides what is inside */}
      {mats.ghost && !solid && <mesh geometry={sweep.geometry} material={mats.ghost} renderOrder={10} />}
    </>
  )
}

/* ───────────────────────── labels ───────────────────────── */

const _v = new Vector3()
const _w = new Vector3()
const _p = new Vector3()
const _n = new Vector3()

function LabelProjector({ store, center }: { store: LabelStore; center: Vec3 }) {
  useFrame(({ camera, size }) => {
    const rows: {
      id: string
      ax: number
      ay: number
      pw: number
      lx: number
      ly: number
      side: number
      on: boolean
    }[] = []
    // the middle of the model on screen
    const cx = (_v.set(center[0], center[1], center[2]).project(camera).x * 0.5 + 0.5) * size.width

    for (const [id, a] of store.anchors) {
      placeAnchor(a)
      _v.copy(_p).project(camera)
      const ax = (_v.x * 0.5 + 0.5) * size.width
      const ay = (-_v.y * 0.5 + 0.5) * size.height
      const behind = _v.z > 1
      _w.copy(_p).addScaledVector(_n, 0.6).project(camera)
      const dx = (_w.x * 0.5 + 0.5) * size.width - ax
      const dy = (-_w.y * 0.5 + 0.5) * size.height - ay
      _w.copy(camera.position).sub(_p).normalize()
      const facing = _n.dot(_w)
      // labels go outwards: away from the middle of the model, nudged by which way the block faces
      let side = ax - cx + dx * 0.6 >= 0 ? 1 : -1
      // no room on that side (narrow screens)? hop over to the other one
      const pw = store.pills.get(id)?.offsetWidth ?? 0
      const fitsLeft = ax - 14 - pw > 4
      const fitsRight = ax + 14 + pw < size.width - 4
      if (side < 0 && !fitsLeft && fitsRight) side = 1
      else if (side > 0 && !fitsRight && fitsLeft) side = -1
      rows.push({
        id,
        ax,
        ay,
        pw,
        lx: ax + side * 74,
        ly: ay + Math.max(-26, Math.min(26, dy * 0.6)),
        side,
        on: !behind && facing > 0.12,
      })
    }
    // keep labels on the same side from sitting on top of each other
    for (const side of [-1, 1]) {
      const col = rows.filter((r) => r.on && r.side === side).sort((p, q) => p.ly - q.ly)
      for (let i = 1; i < col.length; i++) {
        if (col[i].ly - col[i - 1].ly < 30) col[i].ly = col[i - 1].ly + 30
      }
    }
    for (const r of rows) {
      const pill = store.pills.get(r.id)
      const line = store.lines.get(r.id)
      const dot = store.dots.get(r.id)
      if (!pill || !line || !dot) continue
      // keep the pill inside the stage on narrow screens
      if (r.side > 0) r.lx = Math.max(r.ax + 14, Math.min(r.lx, size.width - r.pw - 6))
      else r.lx = Math.min(r.ax - 14, Math.max(r.lx, r.pw + 6))
      const op = r.on ? '1' : '0'
      pill.style.opacity = op
      pill.style.pointerEvents = r.on ? 'auto' : 'none'
      pill.style.transform = `translate(${r.lx.toFixed(1)}px, ${r.ly.toFixed(1)}px) translate(${r.side > 0 ? '0' : '-100%'}, -50%)`
      line.style.opacity = op
      dot.style.opacity = op
      line.setAttribute('x1', r.ax.toFixed(1))
      line.setAttribute('y1', r.ay.toFixed(1))
      line.setAttribute('x2', r.lx.toFixed(1))
      line.setAttribute('y2', r.ly.toFixed(1))
      dot.setAttribute('cx', r.ax.toFixed(1))
      dot.setAttribute('cy', r.ay.toFixed(1))
    }
  })
  return null
}

/** Where a label points, in the scene: the anchor, reflected for the right limb. Writes _p and _n. */
function placeAnchor(a: LabelAnchor) {
  _p.copy(a.pos)
  _n.copy(a.n)
  if (a.mirror !== null) {
    _p.x = 2 * a.mirror - _p.x
    _n.x = -_n.x
  }
}

function LabelLayer({
  store,
  groups,
  visible,
  focus,
  onSelect,
}: {
  store: LabelStore
  groups: GroupDef[]
  visible: boolean
  focus: string | null
  onSelect: (group: string | null) => void
}) {
  const setRef = <T,>(map: Map<string, T>, id: string) => (el: T | null) => {
    if (el) map.set(id, el)
    else map.delete(id)
  }
  return (
    <div className={`labels${visible ? '' : ' labels-off'}`} aria-hidden={!visible}>
      <svg className="label-lines">
        {groups.map((g) => (
          <g key={g.id} className={focus && focus !== g.id ? 'faded' : ''}>
            <line ref={setRef(store.lines, g.id)} />
            <circle r="3.5" ref={setRef(store.dots, g.id)} />
          </g>
        ))}
      </svg>
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          ref={setRef(store.pills, g.id)}
          className={`label-pill${focus === g.id ? ' is-focus' : ''}${focus && focus !== g.id ? ' faded' : ''}`}
          style={{ '--chip': g.color } as CSSProperties}
          onClick={() => onSelect(g.id)}
        >
          {g.name}
        </button>
      ))}
    </div>
  )
}
