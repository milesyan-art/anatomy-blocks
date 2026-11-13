import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Viewer } from './components/Viewer'
import type { ViewOptions } from './components/Viewer'
import type { GroupDef, LessonDef, Pose, RigDef, ViewDef } from './engine/types'
import { LESSONS, RIGS, defaultPose } from './parts'

const SECTIONS = [...new Set(LESSONS.map((l) => l.section))]
const SIDE_ANGLES = [0, 90, 180, -90]
const DEFAULT_SIDES: NonNullable<LessonDef['sides']> = ['Front', 'Left', 'Back', 'Right']

function lessonFromHash(): string {
  const id = window.location.hash.replace('#', '')
  return LESSONS.some((l) => l.id === id) ? id : LESSONS[0].id
}

export default function App() {
  const [lessonId, setLessonId] = useState(lessonFromHash)
  const lesson = LESSONS.find((l) => l.id === lessonId) ?? LESSONS[0]
  const rig = RIGS[lesson.rig]

  const [poses, setPoses] = useState<Record<string, Pose>>(() =>
    Object.fromEntries(Object.values(RIGS).map((r) => [r.id, defaultPose(r)])),
  )
  const pose = poses[rig.id]

  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [options, setOptions] = useState<ViewOptions>({
    bones: true,
    guides: true,
    labels: true,
    neighbours: false,
  })
  const [view, setView] = useState<{ def: ViewDef; nonce: number }>({ def: lesson.view, nonce: 0 })

  const pickLesson = useCallback((l: LessonDef) => {
    setLessonId(l.id)
    setSelected(null)
    setHovered(null)
    document.body.style.cursor = ''
    setView((v) => ({ def: l.view, nonce: v.nonce + 1 }))
    window.history.replaceState(null, '', `#${l.id}`)
  }, [])

  // follow the address bar (back / forward, or a pasted #link)
  useEffect(() => {
    const onHash = () => {
      const next = LESSONS.find((l) => l.id === lessonFromHash())
      if (next && next.id !== lessonId) pickLesson(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [lessonId, pickLesson])

  // ── pose: sliders set it directly, presets glide to it ──
  const raf = useRef(0)
  const stopGlide = () => cancelAnimationFrame(raf.current)
  useEffect(() => stopGlide, [])

  const setControl = (id: string, value: number) => {
    stopGlide()
    setPoses((all) => ({ ...all, [rig.id]: { ...all[rig.id], [id]: value } }))
  }

  const glideTo = (target: Pose) => {
    stopGlide()
    const from = { ...pose }
    const to = { ...pose, ...target }
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 650)
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      const next: Pose = {}
      for (const k of Object.keys(to)) next[k] = from[k] + (to[k] - from[k]) * e
      setPoses((all) => ({ ...all, [rig.id]: next }))
      if (t < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }

  const lookFrom = (az: number) =>
    setView((v) => ({ def: { ...lesson.view, az, el: 4 }, nonce: v.nonce + 1 }))

  // dev-only handle for poking at poses and camera from the console
  useEffect(() => {
    if (!import.meta.env.DEV) return
    Object.assign(window, {
      __dbg: {
        pose: (p: Pose) => setPoses((all) => ({ ...all, [rig.id]: { ...all[rig.id], ...p } })),
        view: (v: Partial<ViewDef>) => setView((s) => ({ def: { ...lesson.view, ...v }, nonce: s.nonce + 1 })),
        lesson: (id: string) => {
          const l = LESSONS.find((x) => x.id === id)
          if (l) pickLesson(l)
        },
      },
    })
  }, [rig, lesson, pickLesson])

  const toggle = (key: keyof ViewOptions) => setOptions((o) => ({ ...o, [key]: !o[key] }))

  const shown = useMemo(
    () => rig.groups.filter((g) => lesson.show.includes(g.id)),
    [rig, lesson],
  )
  const focus = hovered ?? selected
  const sides = lesson.sides ?? DEFAULT_SIDES

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <h1>Block Anatomy</h1>
            <p>one body part at a time</p>
          </div>
        </div>
        <nav className="parts" aria-label="Body parts">
          {SECTIONS.map((section) => (
            <div className="parts-group" key={section}>
              <h2>{section}</h2>
              <div className="parts-list">
                {LESSONS.filter((l) => l.section === section).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`part${l.id === lesson.id ? ' is-on' : ''}`}
                    onClick={() => pickLesson(l)}
                  >
                    {l.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="stage">
        <Viewer
          rig={rig}
          lesson={lesson}
          pose={pose}
          options={options}
          focus={focus}
          view={view.def}
          viewNonce={view.nonce}
          onHover={setHovered}
          onSelect={(g) => setSelected((cur) => (g === cur ? null : g))}
        />
        <div className="stage-top">
          <span className="stage-caption">Look from</span>
          {sides.map((name, i) => (
            <button key={name} type="button" className="chip" onClick={() => lookFrom(SIDE_ANGLES[i])}>
              {name}
            </button>
          ))}
        </div>
        <div className="stage-bottom">
          <Toggle on={options.bones} onClick={() => toggle('bones')}>
            Bones
          </Toggle>
          <Toggle on={options.guides} onClick={() => toggle('guides')}>
            Guide lines
          </Toggle>
          <Toggle on={options.labels} onClick={() => toggle('labels')}>
            Labels
          </Toggle>
          <Toggle on={options.neighbours} onClick={() => toggle('neighbours')}>
            Neighbours
          </Toggle>
        </div>
        <p className="stage-hint">drag to spin · scroll or pinch to zoom</p>
      </main>

      <section className="panel">
        <div className="card intro">
          <span className="eyebrow">{lesson.section}</span>
          <h2>{lesson.title}</h2>
          <p>{lesson.blurb}</p>
        </div>

        <MoveCard rig={rig} pose={pose} onChange={setControl} onPreset={glideTo} />

        <div className="card">
          <h3>The blocks</h3>
          <ul className="blocks">
            {shown.map((g) => (
              <BlockRow
                key={g.id}
                group={g}
                open={selected === g.id}
                onToggle={() => setSelected((cur) => (cur === g.id ? null : g.id))}
                onHover={setHovered}
              />
            ))}
          </ul>
        </div>

        <div className="card tips">
          <h3>Drawing tips</h3>
          <ul>
            {lesson.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`toggle${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick}>
      <span className="toggle-box" aria-hidden="true" />
      {children}
    </button>
  )
}

function MoveCard({
  rig,
  pose,
  onChange,
  onPreset,
}: {
  rig: RigDef
  pose: Pose
  onChange: (id: string, value: number) => void
  onPreset: (pose: Pose) => void
}) {
  return (
    <div className="card move">
      <h3>Move it</h3>
      {rig.controls.map((c) => {
        const value = pose[c.id]
        const pct = ((value - c.min) / (c.max - c.min)) * 100
        return (
          <label className="slider" key={c.id}>
            <span className="slider-head">
              <span>{c.label}</span>
              <output>{Math.round(value)}°</output>
            </span>
            <input
              type="range"
              min={c.min}
              max={c.max}
              step={1}
              value={value}
              style={{ '--pct': `${pct}%` } as CSSProperties}
              onChange={(e) => onChange(c.id, Number(e.target.value))}
            />
            <span className="slider-ends">
              <span>{c.lo}</span>
              <span>{c.hi}</span>
            </span>
          </label>
        )
      })}
      <div className="presets">
        {rig.presets.map((p) => (
          <button key={p.label} type="button" className="chip" onClick={() => onPreset(p.pose)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function BlockRow({
  group,
  open,
  onToggle,
  onHover,
}: {
  group: GroupDef
  open: boolean
  onToggle: () => void
  onHover: (id: string | null) => void
}) {
  return (
    <li className={`block${open ? ' is-open' : ''}`} style={{ '--chip': group.color } as CSSProperties}>
      <button
        type="button"
        className="block-head"
        aria-expanded={open}
        onClick={onToggle}
        onPointerEnter={() => onHover(group.id)}
        onPointerLeave={() => onHover(null)}
      >
        <span className="swatch" aria-hidden="true" />
        <span className="block-name">{group.name}</span>
        <span className="block-real">{group.real}</span>
      </button>
      {open && (
        <dl className="block-body">
          <dt>Where</dt>
          <dd>{group.where}</dd>
          <dt>Draw it as</dt>
          <dd>{group.shape}</dd>
          <dt>Watch</dt>
          <dd>{group.move}</dd>
        </dl>
      )}
    </li>
  )
}
