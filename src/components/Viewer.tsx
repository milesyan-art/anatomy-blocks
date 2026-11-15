import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { Box3, Color, DepthTexture, DoubleSide, Matrix4, MeshBasicMaterial, OrthographicCamera, Sphere, Spherical, Vector3, WebGLRenderTarget } from 'three'
import type { Mesh, Object3D, PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { DEG } from '../engine/frames'
import {
  BONE,
  BONE_INK,
  applyLight,
  inkOf,
  lampViewStore,
  lightInView,
  makeFill,
  makeGhost,
  makeOutline,
  paleOf,
  setShadow,
} from '../engine/materials'
import type { LightSetting } from '../engine/materials'
import { mirrorOf } from '../engine/mirror'
import type { LimbSide } from '../engine/mirror'
import { makeForm } from '../engine/sweep'
import type { Form, GroupDef, LessonDef, Pose, RigDef, Vec3, ViewDef } from '../engine/types'
import { restPose } from '../parts'
import type { UiText } from '../i18n'
import { createLabelStore } from './labels'
import type { LabelAnchor, LabelStore } from './labels'
import { ShortcutTips } from './ShortcutTips'
import { ViewGizmo } from './ViewGizmo'
import { createViewStore, wrap180 } from './viewStore'
import type { ViewStore } from './viewStore'

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
  /** Words on the view gizmo. */
  gizmo: UiText['gizmo']
  /** Words on the shortcut tips card. */
  shortcuts: UiText['shortcuts']
  /** Back to the lesson's starting view, level. */
  onHome: () => void
  /** Which way the model is being looked at, once the camera is in the user's hands (degrees round it, 0 = front). */
  onFace: (az: number) => void
  onHover: (group: string | null) => void
  onSelect: (group: string | null) => void
}

export function Viewer(props: ViewerProps) {
  const { rig, lesson, options, focus, onSelect } = props
  const store = useMemo(() => createLabelStore(), [])
  const viewStore = useMemo(() => createViewStore(), [])
  const shown = rig.groups.filter((g) => lesson.show.includes(g.id))

  return (
    <div className="stage-canvas">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 26, near: 0.5, far: 200, position: [0, 0, 14] }}
        onPointerMissed={() => onSelect(null)}
      >
        <Orbit view={props.view} nonce={props.viewNonce} store={viewStore} onFace={props.onFace} />
        <Lighting light={props.light} store={viewStore} />
        {props.light.on && <CastShadows />}
        <RigModel {...props} store={store} />
        <LabelProjector store={store} center={props.view.target} />
      </Canvas>
      <LabelLayer store={store} groups={shown} visible={options.labels && options.muscles} focus={focus} onSelect={onSelect} />
      <ViewGizmo store={viewStore} text={props.gizmo} onHome={props.onHome} />
      <ShortcutTips text={props.shortcuts} />
    </div>
  )
}

/* ───────────────────────── camera ───────────────────────── */

interface Glide {
  t0: number
  ms: number
  fromT: Vector3
  toT: Vector3
  from: Spherical
  to: Spherical
  fromRoll: number
  toRoll: number
}

/** OrbitControls' own turning steps (left out of its public types). */
interface Turning {
  _rotateLeft: (angle: number) => void
  _rotateUp: (angle: number) => void
}

const clampEl = (el: number) => Math.max(-89, Math.min(89, el))
const _look = new Spherical()
const _eye = new Vector3()
/** OrbitControls' state while a mouse drag pans. */
const PAN = 2

/**
 * On a tilted picture, turn each drag back by the tilt first, so the model moves the
 * way your hand does on screen. For one pointer move OrbitControls always turns
 * left-right and then up-down, so hold the first and turn the pair together.
 */
function followHand(controls: OrbitControls, roll: () => number) {
  const t = controls as unknown as Turning
  const left = t._rotateLeft.bind(controls)
  const up = t._rotateUp.bind(controls)
  let held: number | null = null
  t._rotateLeft = (a) => {
    if (held !== null) left(held)
    held = a
  }
  t._rotateUp = (b) => {
    const a = held ?? 0
    held = null
    const r = roll() * DEG
    const c = Math.cos(r)
    const s = Math.sin(r)
    left(c * a + s * b)
    up(-s * a + c * b)
  }
  const update = controls.update.bind(controls)
  controls.update = (dt) => {
    if (held !== null) left(held)
    held = null
    return update(dt)
  }
}

function Orbit({
  view,
  nonce,
  store,
  onFace,
}: {
  view: ViewDef
  nonce: number
  store: ViewStore
  onFace: (az: number) => void
}) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const getState = useThree((s) => s.get)
  const ready = useThree((s) => s.size.width > 0 && s.size.height > 0)
  const first = useRef(true)
  const anim = useRef<Glide | null>(null)
  /** The last requested view the camera has set off for, and the last direction reported. */
  const taken = useRef(nonce)
  const faced = useRef(NaN)

  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.12
    c.rotateSpeed = 0.9
    c.zoomSpeed = 0.8
    c.minDistance = 3
    c.maxDistance = 45
    followHand(c, () => store.roll)
    return c
  }, [camera, gl, store])

  useEffect(() => {
    const onChange = () => invalidate()
    const onStart = () => {
      // a drag stops any glide where it is
      if (anim.current) store.rollGoal = store.roll
      anim.current = null
      // a move cursor while panning (right-drag, or Shift / Ctrl / ⌘ + left-drag)
      if ((controls as unknown as { state: number }).state === PAN) gl.domElement.style.cursor = 'move'
    }
    const onEnd = () => {
      gl.domElement.style.cursor = ''
    }
    controls.connect(gl.domElement)
    controls.addEventListener('change', onChange)
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)
    return () => {
      controls.removeEventListener('change', onChange)
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      controls.disconnect()
      onEnd()
    }
  }, [controls, gl, invalidate, store])

  const startGlide = (toT: Vector3, to: Spherical, toRoll: number, ms: number) => {
    const from = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    // take the short way round
    while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2
    while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2
    const fromRoll = store.roll
    toRoll = fromRoll + wrap180(toRoll - fromRoll)
    store.rollGoal = toRoll
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 1
    anim.current = { t0: performance.now(), ms, fromT: controls.target.clone(), toT, from, to, fromRoll, toRoll }
    invalidate()
  }

  // what the gizmo can ask of the camera
  useEffect(() => {
    store.glide = (aim, ms = 460) => {
      const to = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
      if (aim.el !== undefined) to.phi = Math.PI / 2 - clampEl(aim.el) * DEG
      if (aim.az !== undefined) to.theta = aim.az * DEG
      startGlide(controls.target.clone(), to, aim.roll ?? store.rollGoal, ms)
    }
    store.turn = (dx, dy) => {
      const t = controls as unknown as Turning
      t._rotateLeft(dx * DEG)
      t._rotateUp(dy * DEG)
      controls.update()
      invalidate()
    }
    store.setRoll = (deg) => {
      if (anim.current) anim.current.fromRoll = anim.current.toRoll = deg
      store.roll = store.rollGoal = deg
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, controls, camera, invalidate])

  // on a phone, a two-finger twist tilts the picture (once it is clearly a twist, not a pinch)
  useEffect(() => {
    const el = gl.domElement
    const fingers = new Map<number, { x: number; y: number }>()
    let twist: { angle: number; turned: number; on: boolean } | null = null
    const angle = () => {
      const [a, b] = [...fingers.values()]
      return Math.atan2(b.y - a.y, b.x - a.x) / DEG
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      twist = fingers.size === 2 ? { angle: angle(), turned: 0, on: false } : null
    }
    const move = (e: PointerEvent) => {
      const f = fingers.get(e.pointerId)
      if (!f) return
      f.x = e.clientX
      f.y = e.clientY
      if (!twist || fingers.size !== 2) return
      const a = angle()
      let d = wrap180(a - twist.angle)
      twist.angle = a
      if (!twist.on) {
        twist.turned += d
        if (Math.abs(twist.turned) < 10) return
        twist.on = true
        d = twist.turned
      }
      store.setRoll(store.roll + d)
    }
    const up = (e: PointerEvent) => {
      fingers.delete(e.pointerId)
      if (fingers.size < 2) twist = null
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [gl, store])

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
    // a set view keeps the tilt unless it asks for one
    const roll = view.roll ?? store.rollGoal
    taken.current = nonce
    if (first.current) {
      first.current = false
      controls.target.copy(toT)
      camera.position.setFromSpherical(to).add(toT)
      store.roll = store.rollGoal = roll
      controls.update()
      invalidate()
      return
    }
    startGlide(toT, to, roll, 520)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ready])

  useFrame(() => {
    const a = anim.current
    if (a) {
      const t = Math.min(1, (performance.now() - a.t0) / a.ms)
      const e = 1 - Math.pow(1 - t, 3)
      const s = new Spherical(
        a.from.radius + (a.to.radius - a.from.radius) * e,
        a.from.phi + (a.to.phi - a.from.phi) * e,
        a.from.theta + (a.to.theta - a.from.theta) * e,
      )
      controls.target.lerpVectors(a.fromT, a.toT, e)
      camera.position.setFromSpherical(s).add(controls.target)
      store.roll = a.fromRoll + (a.toRoll - a.fromRoll) * e
      if (t >= 1) anim.current = null
      invalidate()
    }
    // the controls aim the camera level; the tilt turns the picture after that
    controls.update()
    camera.rotateZ(store.roll * DEG)
    camera.updateMatrixWorld()
    store.quat.copy(camera.quaternion)
    store.listeners.forEach((fn) => fn())

    // say which way the model is seen from - but only once the camera has arrived where it
    // was sent, and not from straight above or below, where "which side" means nothing
    if (!anim.current && taken.current === nonce) {
      _look.setFromVector3(_eye.copy(camera.position).sub(controls.target))
      const az = _look.theta / DEG
      const el = 90 - _look.phi / DEG
      if (Math.abs(el) < 65 && !(Math.abs(wrap180(az - faced.current)) < 1)) {
        faced.current = az
        onFace(az)
      }
    }
  })

  return null
}

/* ───────────────────────── light ───────────────────────── */

/** A locked lamp's direction in world space. */
const _lampWorld = new Vector3()
/** The lamp as seen in the picture: the view before any tilt, the way the light ball shows it. */
const _lampPicture = new Vector3()
const _level = new Matrix4()
const _untilt = new Matrix4()
const _forward = new Vector3(0, 0, 1)

/** The camera's world matrix with the tilt taken out. */
function levelCamera(camera: Object3D, roll: number) {
  camera.updateMatrixWorld()
  return _level.multiplyMatrices(camera.matrixWorld, _untilt.makeRotationZ(-roll * DEG))
}

function Lighting({ light, store }: { light: LightSetting; store: ViewStore }) {
  const invalidate = useThree((s) => s.invalidate)
  const camera = useThree((s) => s.camera)
  const locked = useRef(false)

  // the lamp is set in the picture, so tilting the view turns the light with it,
  // like turning a drawing; the shader wants it in the tilted view
  const tiltLamp = () => lightInView().copy(_lampPicture).applyAxisAngle(_forward, -store.roll * DEG)

  useLayoutEffect(() => {
    // the ball always sets the lamp relative to the current view...
    applyLight(light)
    _lampPicture.copy(lightInView())
    locked.current = light.on && light.locked
    // ...and locking pins that direction into the room
    if (locked.current) {
      _lampWorld.copy(_lampPicture).transformDirection(levelCamera(camera, store.roll))
      lampViewStore.set(_lampPicture)
    }
    tiltLamp()
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light, camera, invalidate, store])

  useFrame(() => {
    // a locked lamp stays put in the room: work out where it is from the current view
    if (locked.current) {
      _lampPicture.copy(_lampWorld).transformDirection(levelCamera(camera, store.roll).invert())
      lampViewStore.set(_lampPicture)
    }
    tiltLamp()
  })

  return null
}

/* ─────────────────────── cast shadows ─────────────────────── */

/** Meshes on this layer cast shadows: the solid fills only, never outlines or labels. */
const CASTER_LAYER = 1
const SHADOW_SIZE = 2048

const castsShadow = (m: Mesh | null) => {
  m?.layers.enable(CASTER_LAYER)
}

interface Lamp {
  target: WebGLRenderTarget
  eye: OrthographicCamera
  depthOnly: MeshBasicMaterial
}
let _lamp: Lamp | null = null

/** The lamp's camera and its depth picture - made once, on first use. */
function lamp(): Lamp {
  if (!_lamp) {
    const target = new WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE)
    target.depthTexture = new DepthTexture(SHADOW_SIZE, SHADOW_SIZE)
    const eye = new OrthographicCamera(-1, 1, 1, -1, 0.01, 10)
    eye.layers.set(CASTER_LAYER)
    _lamp = { target, eye, depthOnly: new MeshBasicMaterial({ colorWrite: false, side: DoubleSide }) }
  }
  return _lamp
}

const _box = new Box3()
const _sphere = new Sphere()
const _point = new Vector3()
const _center = new Vector3()
const _dir = new Vector3()
const _clip = new Matrix4()

/** A box around everything that casts a shadow, built from the blocks' bounding spheres. */
function castersBox(scene: Object3D): Box3 {
  _box.makeEmpty()
  scene.traverseVisible((o) => {
    const mesh = o as Mesh
    if (!mesh.isMesh || !mesh.layers.isEnabled(CASTER_LAYER)) return
    const bs = mesh.geometry.boundingSphere
    if (!bs) return
    _sphere.copy(bs).applyMatrix4(mesh.matrixWorld)
    _box.expandByPoint(_point.copy(_sphere.center).addScalar(_sphere.radius))
    _box.expandByPoint(_point.copy(_sphere.center).addScalar(-_sphere.radius))
  })
  return _box
}

/**
 * Before every frame, take a depth picture of the model from the lamp, so a form
 * that blocks the lamp throws a cast shadow onto the forms behind it - the way the
 * nose of a cast shades the cheek. Shadows land on the model only, never the backdrop.
 */
function CastShadows() {
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    invalidate()
    return () => {
      setShadow(null, null, SHADOW_SIZE)
      invalidate()
    }
  }, [invalidate])

  // priority 1: we draw the frame ourselves - the lamp's view first, then the real one
  useFrame(({ gl, scene, camera }) => {
    const { target, eye, depthOnly } = lamp()
    scene.updateMatrixWorld()
    const box = castersBox(scene)
    if (box.isEmpty()) {
      setShadow(null, null, SHADOW_SIZE)
    } else {
      box.getCenter(_center)
      const radius = Math.max(box.getSize(_point).length() / 2, 0.5)
      // the light rides on the camera; turn its direction into world space
      _dir.copy(lightInView()).transformDirection(camera.matrixWorld)
      eye.up.set(0, 1, 0)
      if (Math.abs(_dir.y) > 0.98) eye.up.set(0, 0, 1)
      eye.position.copy(_center).addScaledVector(_dir, radius * 2)
      eye.lookAt(_center)
      eye.left = eye.bottom = -radius
      eye.right = eye.top = radius
      eye.near = radius * 0.5
      eye.far = radius * 3.5
      eye.updateProjectionMatrix()
      eye.updateMatrixWorld()

      setShadow(null, null, SHADOW_SIZE) // never read the picture while drawing into it
      scene.overrideMaterial = depthOnly
      gl.setRenderTarget(target)
      gl.clear()
      gl.render(scene, eye)
      gl.setRenderTarget(null)
      scene.overrideMaterial = null
      _clip.multiplyMatrices(eye.projectionMatrix, eye.matrixWorldInverse)
      setShadow(target.depthTexture, _clip, SHADOW_SIZE)
    }
    gl.render(scene, camera)
  }, 1)

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
      const s = makeForm(def, solid)
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

  function renderSweep(s: Form) {
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
  sweep: Form
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
      outline: makeOutline(ink, thickness, fill),
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
      <mesh ref={castsShadow} geometry={sweep.geometry} {...handlers}>
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
