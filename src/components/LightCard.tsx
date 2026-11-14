import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { DEFAULT_LIGHT } from '../engine/materials'
import type { LightSetting } from '../engine/materials'
import type { UiText } from '../i18n'

const PRESETS: { id: string; set: Partial<LightSetting> }[] = [
  { id: 'Top left', set: { x: DEFAULT_LIGHT.x, y: DEFAULT_LIGHT.y, behind: false } },
  { id: 'Top', set: { x: 0, y: 0.92, behind: false } },
  { id: 'Front', set: { x: 0, y: 0.1, behind: false } },
  { id: 'Side', set: { x: 0.95, y: 0.1, behind: false } },
  { id: 'Below', set: { x: 0, y: -0.85, behind: false } },
  { id: 'Rim', set: { x: -0.6, y: 0.45, behind: true } },
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
    const [x, y] = clampToDisc(light.x + step[0], light.y + step[1])
    // dragging always means a light in front; only the Rim preset puts it behind
    set({ x, y, behind: false })
  }

  const pad = {
    '--lx': `${50 + light.x * 42}%`,
    '--ly': `${50 - light.y * 42}%`,
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
              className={`light-pad${light.behind ? ' is-behind' : ''}`}
              style={pad}
              role="slider"
              tabIndex={0}
              aria-label={tr.lightPad}
              aria-valuetext={`${Math.round(light.x * 100)}, ${Math.round(light.y * 100)}`}
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

        </div>
      )}
    </div>
  )
}
