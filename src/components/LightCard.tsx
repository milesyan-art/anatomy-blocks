import { useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { DEFAULT_LIGHT, lampViewStore } from '../engine/materials'
import type { LightSetting } from '../engine/materials'
import type { UiText } from '../i18n'

const PRESETS: { id: string; set: Partial<LightSetting> }[] = [
  { id: 'Top left', set: { x: DEFAULT_LIGHT.x, y: DEFAULT_LIGHT.y, behind: false } },
  { id: 'Top', set: { x: 0, y: 0.92, behind: false } },
  { id: 'Front', set: { x: 0, y: 0.1, behind: false } },
  // a true split light: the lamp level with the side, half the form in shadow
  { id: 'Side', set: { x: 1, y: 0.05, behind: false } },
  { id: 'Below', set: { x: 0, y: -0.85, behind: false } },
  { id: 'Rim', set: { x: -0.6, y: 0.45, behind: true } },
]

/** The value structure of a cast under one lamp - the swatches match the shader. */
const VALUES: { id: keyof UiText['values']; tone: string }[] = [
  { id: 'highlight', tone: '#fbfaf6' },
  { id: 'light', tone: '#e4e0d8' },
  { id: 'halftone', tone: '#b3afa7' },
  { id: 'core', tone: '#55524d' },
  { id: 'reflected', tone: '#86827b' },
  { id: 'cast', tone: '#625f59' },
]

const STEPS: Record<string, [number, number]> = {
  ArrowLeft: [-0.1, 0],
  ArrowRight: [0.1, 0],
  ArrowUp: [0, 0.1],
  ArrowDown: [0, -0.1],
}

const clampToDisc = (x: number, y: number): [number, number] => {
  const len = Math.hypot(x, y)
  return len > 1 ? [x / len, y / len] : [x, y]
}

/**
 * The light is an add-on: switched off, the card folds to one line and the model
 * keeps its reference look. Switched on, the model turns smooth and solid and
 * the card opens with a little ball you light by dragging the sun around it.
 */
export function LightCard({
  light,
  tr,
  onChange,
}: {
  light: LightSetting
  tr: UiText
  onChange: (next: LightSetting) => void
}) {
  const set = (patch: Partial<LightSetting>) => onChange({ ...light, ...patch })

  // a locked lamp moves across the ball as you turn the model, so read where it is now
  const live = useSyncExternalStore(lampViewStore.subscribe, lampViewStore.get)
  const shown = light.locked ? live : light

  const toggleLock = () =>
    light.locked
      ? // unlocking keeps the lamp exactly where it is now, relative to your view
        set({ locked: false, x: live.x, y: live.y, behind: live.behind })
      : set({ locked: true })

  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const [x, y] = clampToDisc(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -(((e.clientY - box.top) / box.height) * 2 - 1),
    )
    // dragging always means a light in front; only the Rim preset puts it behind
    set({ x, y, behind: false })
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[e.key]
    if (!step) return
    e.preventDefault()
    const [x, y] = clampToDisc(shown.x + step[0], shown.y + step[1])
    // dragging always means a light in front; only the Rim preset puts it behind
    set({ x, y, behind: false })
  }

  const pad = {
    '--lx': `${50 + shown.x * 42}%`,
    '--ly': `${50 - shown.y * 42}%`,
    '--depth': light.depth,
  } as CSSProperties

  return (
    <div className={`card light${light.on ? ' is-on' : ''}`}>
      <div className="light-head">
        <div>
          <h3>{tr.light}</h3>
          <p className="light-hint">{tr.lightHint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={light.on}
          aria-label={tr.light}
          className={`switch${light.on ? ' is-on' : ''}`}
          onClick={() => set({ on: !light.on })}
        >
          <span className="switch-knob" aria-hidden="true" />
        </button>
      </div>

      {light.on && (
        <div className="light-body">
          <div className="light-row">
            <div
              className={`light-pad${shown.behind ? ' is-behind' : ''}${light.locked ? ' is-locked' : ''}`}
              style={pad}
              role="slider"
              tabIndex={0}
              aria-label={tr.lightPad}
              aria-valuetext={`${Math.round(shown.x * 100)}, ${Math.round(shown.y * 100)}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                moveTo(e)
              }}
              onPointerMove={(e) => {
                if (e.buttons || e.pointerType === 'touch') moveTo(e)
              }}
              onKeyDown={onKey}
            >
              <span className="light-sun" aria-hidden="true" />
            </div>
            <div className="light-presets">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => set(p.set)}>
                  {tr.lightPresets[p.id] ?? p.id}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={`toggle lock-toggle${light.locked ? ' is-on' : ''}`}
            aria-pressed={light.locked}
            title={tr.lightLockHint}
            onClick={toggleLock}
          >
            <span className="toggle-box" aria-hidden="true" />
            {tr.lightLock}
            <span className="lock-hint">{tr.lightLockHint}</span>
          </button>

          <div className="segmented" role="group" aria-label={tr.lightSurface}>
            {([true, false] as const).map((plaster) => (
              <button
                key={String(plaster)}
                type="button"
                className={light.plaster === plaster ? 'is-on' : ''}
                aria-pressed={light.plaster === plaster}
                onClick={() => set({ plaster })}
              >
                {plaster ? tr.lightPlaster : tr.lightColour}
              </button>
            ))}
          </div>

          <label className="slider">
            <span className="slider-head">
              <span>{tr.lightDepth}</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(light.depth * 100)}
              style={{ '--pct': `${light.depth * 100}%` } as CSSProperties}
              onChange={(e) => set({ depth: Number(e.target.value) / 100 })}
            />
            <span className="slider-ends">
              <span>{tr.lightFlat}</span>
              <span>{tr.lightDeep}</span>
            </span>
          </label>

          <div className="value-key">
            <span className="value-key-title">{tr.valuesTitle}</span>
            <ul>
              {VALUES.map((v) => (
                <li key={v.id}>
                  <span className="value-swatch" style={{ background: v.tone }} aria-hidden="true" />
                  {tr.values[v.id]}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
