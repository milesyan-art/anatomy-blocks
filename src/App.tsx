import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { LightCard } from './components/LightCard'
import { Viewer } from './components/Viewer'
import type { ViewOptions } from './components/Viewer'
import { DEFAULT_LIGHT } from './engine/materials'
import { wrap180 } from './components/viewStore'
import { hasSides, sideView } from './engine/mirror'
import type { LimbSide } from './engine/mirror'
import type { LightSetting } from './engine/materials'
import type { GroupDef, LessonDef, Pose, RigDef, ViewDef } from './engine/types'
import { LANGS, UI, detectLang, localizeLesson, localizeRig, rememberLang } from './i18n'
import type { Lang, UiText } from './i18n'
import { LESSONS, NAV, RIG_IDS, defaultPose, getRig } from './parts'
import type { Body } from './parts'

const SIDE_ANGLES = [0, 90, 180, -90]
const DEFAULT_SIDES: NonNullable<LessonDef['sides']> = ['Front', 'Left', 'Back', 'Right']
/** Degrees the camera must be nearer to the other lesson's view before the app follows it there. */
const FOLLOW_LEAD = 20

function lessonFromHash(): string {
  const id = window.location.hash.replace('#', '')
  return LESSONS.some((l) => l.id === id) ? id : NAV[0].main
}

export default function App() {
  const [lessonId, setLessonId] = useState(lessonFromHash)
  const [body, setBody] = useState<Body>('male')
  const [side, setSide] = useState<LimbSide>('left')

  // language: saved choice, else the browser's, else English
  const [lang, setLang] = useState<Lang>(detectLang)
  const tr = UI[lang]
  const lessons = useMemo(() => LESSONS.map((l) => localizeLesson(l, lang)), [lang])
  const lesson = lessons.find((l) => l.id === lessonId) ?? lessons[0]
  const rig = useMemo(() => localizeRig(getRig(lesson.rig, body), lang), [lesson.rig, body, lang])

  useEffect(() => {
    document.documentElement.lang = LANGS.find((l) => l.id === lang)?.html ?? lang
    document.title = tr.title
  }, [lang, tr])

  const pickLang = (next: Lang) => {
    setLang(next)
    rememberLang(next)
  }

  const [poses, setPoses] = useState<Record<string, Pose>>(() =>
    Object.fromEntries(RIG_IDS.map((id) => [id, defaultPose(getRig(id, 'male'))])),
  )
  const pose = poses[rig.id]

  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [options, setOptions] = useState<ViewOptions>({
    bones: true,
    guides: true,
    labels: true,
    neighbours: false,
    muscles: true,
  })
  const [light, setLight] = useState<LightSetting>(DEFAULT_LIGHT)
  const [view, setView] = useState<{ def: ViewDef; nonce: number }>({ def: lesson.view, nonce: 0 })

  const pickLesson = useCallback((l: LessonDef) => {
    setLessonId(l.id)
    setSelected(null)
    setHovered(null)
    document.body.style.cursor = ''
    // a new lesson starts level
    setView((v) => ({ def: { ...l.view, roll: 0 }, nonce: v.nonce + 1 }))
    window.history.replaceState(null, '', `#${l.id}`)
  }, [])

  /*
   * A lesson can have a partner that covers the other side of the same model (torso
   * front / back). Turn the model far enough to face the partner and the app moves
   * over to it - title, tips and list - without touching the camera.
   */
  const followCamera = (az: number) => {
    const other = lesson.otherSide && LESSONS.find((l) => l.id === lesson.otherSide)
    if (!other) return
    const off = (v: ViewDef) => Math.abs(wrap180(az - v.az))
    // a clear lead, so it does not flicker back and forth around the side view
    if (off(other.view) + FOLLOW_LEAD >= off(lesson.view)) return
    setLessonId(other.id)
    window.history.replaceState(null, '', `#${other.id}`)
  }

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
    setPoses((all) => {
      const pose = all[rig.id]
      return { ...all, [rig.id]: rig.couple ? rig.couple(pose, id, value) : { ...pose, [id]: value } }
    })
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

  // the gizmo's home button: the lesson's starting view, level
  const goHome = () => setView((v) => ({ def: { ...lesson.view, roll: 0 }, nonce: v.nonce + 1 }))

  // the camera glides over to the other limb
  const pickSide = (next: LimbSide) => {
    setSide(next)
    setView((v) => ({ def: lesson.view, nonce: v.nonce + 1 }))
  }
  const limb = hasSides(rig)

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
        side: setSide,
      },
    })
  }, [rig, lesson, pickLesson])

  const toggle = (key: keyof ViewOptions) => setOptions((o) => ({ ...o, [key]: !o[key] }))

  // listed in the lesson's own order: what it is about first
  const shown = useMemo(
    () => lesson.show.flatMap((id) => rig.groups.find((g) => g.id === id) ?? []),
    [rig, lesson],
  )
  // only some lessons leave muscles out; the others have no neighbours to offer
  const hasNeighbours = rig.groups.some((g) => !lesson.show.includes(g.id))
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
            <h1>{tr.title}</h1>
            <p>{tr.tagline}</p>
          </div>
        </div>
        <div className="body-switch" role="group" aria-label={tr.bodyType}>
          {(['male', 'female'] as const).map((b) => (
            <button
              key={b}
              type="button"
              className={body === b ? 'is-on' : ''}
              aria-pressed={body === b}
              onClick={() => setBody(b)}
            >
              {b === 'male' ? tr.male : tr.female}
            </button>
          ))}
        </div>
        <div
          className={`body-switch side-switch${limb ? '' : ' is-disabled'}`}
          role="group"
          aria-label={tr.limbSide}
          title={limb ? undefined : tr.sideTorso}
        >
          {(['left', 'right'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={limb && side === s ? 'is-on' : ''}
              aria-pressed={limb && side === s}
              disabled={!limb}
              onClick={() => pickSide(s)}
            >
              {tr[s]}
            </button>
          ))}
        </div>
        <nav className="parts" aria-label={tr.bodyParts}>
          {NAV.map(({ main, subs }) => {
            const head = lessons.find((l) => l.id === main)!
            const inside = lesson.id === main || subs.includes(lesson.id)
            // the head button is fully on only when no sub-option stands for the lesson
            const headOn = lesson.id === main && !subs.includes(main)
            return (
              <div className="parts-group" key={main}>
                <button
                  type="button"
                  className={`part${headOn ? ' is-on' : inside ? ' is-in' : ''}`}
                  aria-current={headOn ? 'page' : undefined}
                  onClick={() => pickLesson(head)}
                >
                  {subs.length ? (tr.sections[head.section] ?? head.section) : head.title}
                </button>
                {subs.length > 0 && (
                  <div className="parts-sub">
                    {subs.map((id) => {
                      const l = lessons.find((x) => x.id === id)!
                      const on = l.id === lesson.id
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`part-sub${on ? ' is-on' : ''}`}
                          aria-current={on ? 'page' : undefined}
                          onClick={() => pickLesson(l)}
                        >
                          {l.short ?? l.title}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      <main className={`stage${light.on ? ' is-studio' : ''}`}>
        <Viewer
          rig={rig}
          lesson={lesson}
          pose={pose}
          side={side}
          options={options}
          light={light}
          focus={focus}
          view={sideView(view.def, rig, side)}
          viewNonce={view.nonce}
          gizmo={tr.gizmo}
          shortcuts={tr.shortcuts}
          onHome={goHome}
          onFace={followCamera}
          onHover={setHovered}
          onSelect={(g) => setSelected((cur) => (g === cur ? null : g))}
        />
        <div className="stage-top" role="group" aria-label={tr.lookFrom}>
          {sides.map((name, i) => (
            <button key={name} type="button" className="chip" onClick={() => lookFrom(SIDE_ANGLES[i])}>
              {name}
            </button>
          ))}
        </div>
        <div className="stage-bar">
          <div className="stage-bottom">
            <Toggle on={options.muscles} onClick={() => toggle('muscles')}>
              {tr.muscles}
            </Toggle>
            <Toggle on={options.bones} onClick={() => toggle('bones')}>
              {tr.bones}
            </Toggle>
            <Toggle on={options.guides} onClick={() => toggle('guides')}>
              {tr.guides}
            </Toggle>
            <Toggle on={options.labels} onClick={() => toggle('labels')}>
              {tr.labels}
            </Toggle>
            {hasNeighbours && (
              <Toggle on={options.neighbours} onClick={() => toggle('neighbours')}>
                {tr.neighbours}
              </Toggle>
            )}
          </div>
          <div className="stage-corner">
            <p className="stage-hint">{tr.hint}</p>
            <label className="lang-pick" title={tr.language}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M1.5 8h13M8 1.5c-2.2 2.4-2.2 10.6 0 13M8 1.5c2.2 2.4 2.2 10.6 0 13" />
              </svg>
              <span className="sr-only">{tr.language}</span>
              <select value={lang} onChange={(e) => pickLang(e.target.value as Lang)}>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </main>

      <section className="panel">
        <div className="card intro">
          <span className="eyebrow">{tr.sections[lesson.section] ?? lesson.section}</span>
          <h2>{lesson.title}</h2>
          <p>{lesson.blurb}</p>
        </div>

        <MoveCard title={tr.moveIt} rig={rig} pose={pose} onChange={setControl} onPreset={glideTo} />

        <LightCard light={light} tr={tr} onChange={setLight} />

        <div className="card">
          <h3>{tr.blocks}</h3>
          <ul className="blocks">
            {shown.map((g) => (
              <BlockRow
                key={g.id}
                group={g}
                tr={tr}
                open={selected === g.id}
                onToggle={() => setSelected((cur) => (cur === g.id ? null : g.id))}
                onHover={setHovered}
              />
            ))}
          </ul>
        </div>

        <div className="card tips">
          <h3>{tr.tips}</h3>
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
  title,
  rig,
  pose,
  onChange,
  onPreset,
}: {
  title: string
  rig: RigDef
  pose: Pose
  onChange: (id: string, value: number) => void
  onPreset: (pose: Pose) => void
}) {
  return (
    <div className="card move">
      <h3>{title}</h3>
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
  tr,
  open,
  onToggle,
  onHover,
}: {
  group: GroupDef
  tr: UiText
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
          <dt>{tr.where}</dt>
          <dd>{group.where}</dd>
          <dt>{tr.drawItAs}</dt>
          <dd>{group.shape}</dd>
          <dt>{tr.watch}</dt>
          <dd>{group.move}</dd>
        </dl>
      )}
    </li>
  )
}
