import { useEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { UiText } from '../i18n'
import { wrap180 } from './viewStore'
import type { ViewAim, ViewStore } from './viewStore'

/*
 * The view gizmo: a ball of view dots to look from any side, wrapped in a ring
 * whose arc tilts the picture on screen, the way you turn a sketchbook to draw.
 */

type Side = keyof UiText['gizmo']['dots']

/** The six view dots. The model faces +Z, so +X is its left side. */
const AXES: { id: Side; dir: Vector3; color: string; solid: boolean; aim: ViewAim }[] = [
  { id: 'left', dir: new Vector3(1, 0, 0), color: 'var(--pink)', solid: true, aim: { az: 90, el: 0 } },
  { id: 'right', dir: new Vector3(-1, 0, 0), color: 'var(--pink)', solid: false, aim: { az: -90, el: 0 } },
  { id: 'top', dir: new Vector3(0, 1, 0), color: 'var(--green)', solid: true, aim: { az: 0, el: 89 } },
  { id: 'bottom', dir: new Vector3(0, -1, 0), color: 'var(--green)', solid: false, aim: { az: 0, el: -89 } },
  { id: 'front', dir: new Vector3(0, 0, 1), color: 'var(--blue)', solid: true, aim: { az: 0, el: 0 } },
  { id: 'back', dir: new Vector3(0, 0, -1), color: 'var(--blue)', solid: false, aim: { az: 180, el: 0 } },
]

/* ── geometry, in the svg's units (viewBox -95..95) ── */

const BALL_R = 48
const DOT_R = 33
const RING_R = 68
/** Half the tilt arc, in degrees either side of the top. */
const ARC_SPAN = 50
const ARC_W = 11
const STEP = 15

const DEG = Math.PI / 180
/** A point on a circle; angles run clockwise from straight up. */
const pt = (a: number, r: number): [number, number] => [Math.sin(a * DEG) * r, -Math.cos(a * DEG) * r]
const arc = (r: number) => {
  const [x0, y0] = pt(-ARC_SPAN, r)
  const [x1, y1] = pt(ARC_SPAN, r)
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}
const tick = (a: number, r0: number, r1: number) => {
  const [x1, y1] = pt(a, r0)
  const [x2, y2] = pt(a, r1)
  return { x1, y1, x2, y2 }
}
const endAt = (side: -1 | 1) => {
  const a = side * (ARC_SPAN + 12)
  const [x, y] = pt(a, RING_R)
  return `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${a})`
}

const NS = 'http://www.w3.org/2000/svg'
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const n = document.createElementNS(NS, tag)
  for (const k in attrs) n.setAttribute(k, String(attrs[k]))
  parent.appendChild(n)
  return n
}

const pressKeys = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/** A step arrow at one end of the tilt arc: 15° per click. */
function TiltStep({ side, label, onPress }: { side: -1 | 1; label: string; onPress: (dir: -1 | 1) => void }) {
  const press = () => onPress(side)
  return (
    <g className="gizmo-end" transform={endAt(side)} role="button" tabIndex={0} aria-label={label} onClick={press} onKeyDown={pressKeys(press)}>
      <circle r={10} />
      <path
        d={
          side < 0
            ? 'M 4 -3.5 A 5 5 0 1 0 4.5 3 M 4 -3.5 L 4.6 -7.6 M 4 -3.5 L 0.2 -4.6'
            : 'M -4 -3.5 A 5 5 0 1 1 -4.5 3 M -4 -3.5 L -4.6 -7.6 M -4 -3.5 L -0.2 -4.6'
        }
      />
      <title>{label}</title>
    </g>
  )
}

const _inv = new Quaternion()
const _v = new Vector3()

interface Props {
  store: ViewStore
  text: UiText['gizmo']
  /** Back to the lesson's starting view, level. */
  onHome: () => void
}

export function ViewGizmo({ store, text, onHome }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const axesRef = useRef<SVGGElement>(null)
  const tiltRef = useRef<SVGGElement>(null)
  const turnRef = useRef<SVGGElement>(null)
  const levelRef = useRef<SVGGElement>(null)
  const readoutRef = useRef<SVGGElement>(null)
  const arcRef = useRef<SVGPathElement>(null)
  // the angle tag shows while tilting, then fades
  const tilting = useRef<{ last: number; raw: number } | null>(null)
  const showUntil = useRef(0)
  const timer = useRef(0)
  const redraw = useRef<() => void>(() => {})
  const ballDrag = useRef<{ x: number; y: number } | null>(null)

  const flash = (ms = 900) => {
    showUntil.current = performance.now() + ms
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => redraw.current(), ms + 20)
  }

  const tiltStep = (dir: 1 | -1) => {
    // to the next 15° mark that way
    const g = store.rollGoal
    const next = dir > 0 ? Math.floor(g / STEP + 1e-6) * STEP + STEP : Math.ceil(g / STEP - 1e-6) * STEP - STEP
    store.glide({ roll: next }, 280)
    flash()
  }
  const level = () => {
    store.glide({ roll: store.rollGoal - wrap180(store.rollGoal) })
    flash()
  }

  // the dots, and drawing everything that moves with the camera
  useEffect(() => {
    const axes = axesRef.current
    if (!axes) return
    axes.replaceChildren()
    const dots = AXES.map((ax) => {
      const [short, full] = text.dots[ax.id]
      const g = svgEl('g', { class: `gizmo-dot${ax.solid ? '' : ' is-hollow'}`, tabindex: 0, role: 'button', 'aria-label': full }, axes)
      const line = ax.solid ? svgEl('line', { class: 'gizmo-axis', x1: 0, y1: 0 }, g) : null
      if (line) line.style.stroke = ax.color
      const circle = svgEl('circle', { r: 10 }, g)
      if (ax.solid) circle.style.fill = ax.color
      const label = svgEl('text', {}, g)
      label.textContent = short
      svgEl('title', {}, g).textContent = full
      const go = () => store.glide(ax.aim)
      g.addEventListener('click', go)
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          go()
        }
      })
      return { ax, g, line, circle, label, depth: 0 }
    })

    const draw = () => {
      _inv.copy(store.quat).invert()
      for (const d of dots) {
        _v.copy(d.ax.dir).applyQuaternion(_inv)
        d.depth = _v.z
        const x = (_v.x * DOT_R).toFixed(2)
        const y = (-_v.y * DOT_R).toFixed(2)
        // dots on the far side shrink and fade, so the near side reads first
        const f = (_v.z + 1) / 2
        d.circle.setAttribute('cx', x)
        d.circle.setAttribute('cy', y)
        d.circle.setAttribute('r', (7 + 3.5 * f).toFixed(2))
        d.label.setAttribute('x', x)
        d.label.setAttribute('y', y)
        d.label.style.fontSize = `${(8.5 + 2.5 * f).toFixed(1)}px`
        d.line?.setAttribute('x2', (_v.x * DOT_R * 0.72).toFixed(2))
        d.line?.setAttribute('y2', (-_v.y * DOT_R * 0.72).toFixed(2))
        d.g.style.opacity = (0.45 + 0.55 * f).toFixed(2)
      }
      // the far side first
      dots
        .slice()
        .sort((p, q) => p.depth - q.depth)
        .forEach((d) => axes.appendChild(d.g))

      const r = wrap180(store.roll)
      tiltRef.current?.setAttribute('transform', `rotate(${store.roll.toFixed(2)})`)
      arcRef.current?.setAttribute('aria-valuenow', String(Math.round(r)))
      const off = Math.abs(r) > 0.5
      levelRef.current?.toggleAttribute('data-off', off)
      const show = tilting.current !== null || performance.now() < showUntil.current
      readoutRef.current?.toggleAttribute('data-on', show)
      levelRef.current?.toggleAttribute('data-hidden', show)
      const t = readoutRef.current?.querySelector('text')
      if (t) t.textContent = `${Math.round(r)}°`
    }
    redraw.current = draw
    store.listeners.add(draw)
    draw()
    return () => {
      store.listeners.delete(draw)
    }
  }, [store, text])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // keys: Q / E tilt, arrows turn, 0 goes home
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const turns: Record<string, [number, number]> = {
        ArrowLeft: [-STEP, 0],
        ArrowRight: [STEP, 0],
        ArrowUp: [0, STEP],
        ArrowDown: [0, -STEP],
      }
      if (turns[key]) {
        e.preventDefault()
        store.turn(...turns[key])
      } else if (key === 'q') tiltStep(-1)
      else if (key === 'e') tiltStep(1)
      else if (key === '0') onHome()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* ── the tilt arc: grab it and turn, like a steering wheel ── */
  const angleAt = (e: PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) / DEG
  }
  const arcDown = (e: PointerEvent<SVGPathElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    tilting.current = { last: angleAt(e), raw: store.roll }
    turnRef.current?.setAttribute('data-on', '')
    store.setRoll(store.roll)
  }
  const arcMove = (e: PointerEvent<SVGPathElement>) => {
    const t = tilting.current
    if (!t) return
    const a = angleAt(e)
    t.raw += wrap180(a - t.last)
    t.last = a
    let r = t.raw
    if (e.shiftKey) r = Math.round(r / STEP) * STEP
    else if (Math.abs(wrap180(r)) < 3) r -= wrap180(r) // a little catch at level
    store.setRoll(r)
  }
  const arcUp = () => {
    if (!tilting.current) return
    tilting.current = null
    turnRef.current?.removeAttribute('data-on')
    flash(700)
    redraw.current()
  }
  const arcKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') tiltStep(-1)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') tiltStep(1)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  /* ── the ball: drag it to turn the model ── */
  const ballDown = (e: PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    ballDrag.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setAttribute('data-on', '')
  }
  const ballMove = (e: PointerEvent<SVGCircleElement>) => {
    const b = ballDrag.current
    if (!b) return
    store.turn((e.clientX - b.x) * 1.4, (e.clientY - b.y) * 1.4)
    b.x = e.clientX
    b.y = e.clientY
  }
  const ballUp = (e: PointerEvent<SVGCircleElement>) => {
    ballDrag.current = null
    e.currentTarget.removeAttribute('data-on')
  }

  return (
    <svg ref={svgRef} className="gizmo" viewBox="-95 -95 190 190" role="group" aria-label={text.label}>
      {/* the ring and its tilt arc turn with the picture */}
      <g ref={turnRef} className="gizmo-tilt">
        <g ref={tiltRef}>
          <circle className="gizmo-ring" r={RING_R} />
          {[90, 180, 270].map((a) => (
            <line key={a} className="gizmo-tick" {...tick(a, RING_R - 4, RING_R + 4)} />
          ))}
          <path className="gizmo-arc" d={arc(RING_R)} />
          <path className="gizmo-arc-edge" d={arc(RING_R + ARC_W / 2)} />
          <path className="gizmo-arc-edge" d={arc(RING_R - ARC_W / 2)} />
          {[-5, 0, 5].map((a) => (
            <line key={a} className="gizmo-grip" {...tick(a, RING_R - 3, RING_R + 3)} />
          ))}
          <path
            ref={arcRef}
            className="gizmo-arc-hit"
            d={arc(RING_R)}
            tabIndex={0}
            role="slider"
            aria-label={text.tiltName}
            aria-valuemin={-180}
            aria-valuemax={180}
            aria-valuenow={0}
            onPointerDown={arcDown}
            onPointerMove={arcMove}
            onPointerUp={arcUp}
            onPointerCancel={arcUp}
            onDoubleClick={level}
            onKeyDown={arcKey}
          >
            <title>{text.tilt}</title>
          </path>
          <TiltStep side={-1} label={text.tiltLeft} onPress={tiltStep} />
          <TiltStep side={1} label={text.tiltRight} onPress={tiltStep} />
        </g>
      </g>

      {/* the ball: a flat filled circle with the six view dots */}
      <circle
        className="gizmo-ball"
        r={BALL_R}
        onPointerDown={ballDown}
        onPointerMove={ballMove}
        onPointerUp={ballUp}
        onPointerCancel={ballUp}
      >
        <title>{text.turn}</title>
      </circle>
      <g ref={axesRef} />

      {/* home, fixed at the bottom to balance the arc on top */}
      <g className="gizmo-home" transform={`translate(0 ${RING_R})`} role="button" tabIndex={0} aria-label={text.home} onClick={onHome} onKeyDown={pressKeys(onHome)}>
        <circle r={10} />
        <path d="M -4.5 0.5 L 0 -4 L 4.5 0.5 M -3 -0.8 V 4 H 3 V -0.8" />
        <title>{text.home}</title>
      </g>

      {/* level mark, fixed to the screen: lights up once the picture is tilted */}
      <g ref={levelRef} className="gizmo-level" role="button" aria-label={text.level} onClick={level}>
        <path d="M -6.5 -93 L 6.5 -93 L 0 -84 Z" />
        <title>{text.level}</title>
      </g>
      <g ref={readoutRef} className="gizmo-readout" aria-hidden="true">
        <rect x={-19} y={-93} width={38} height={16} rx={8} />
        <text x={0} y={-81.5}>
          0°
        </text>
      </g>
    </svg>
  )
}
