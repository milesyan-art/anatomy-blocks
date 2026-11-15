import { useEffect, useRef, useState } from 'react'
import type { UiText } from '../i18n'

/**
 * A small "?" under the view gizmo: hover (or tap) for the mouse and key shortcuts.
 * Clicking pins it open; clicking anywhere else or Escape closes it.
 */
export function ShortcutTips({ text }: { text: UiText['shortcuts'] }) {
  const [pinned, setPinned] = useState(false)
  const [hover, setHover] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pinned) return
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setPinned(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false)
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [pinned])

  const open = pinned || hover

  return (
    <div
      ref={wrap}
      className="shortcuts"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
    >
      <button
        type="button"
        className={`shortcuts-button${open ? ' is-on' : ''}`}
        aria-expanded={open}
        aria-controls="shortcut-tips"
        aria-label={text.button}
        title={text.button}
        onClick={() => setPinned((p) => !p)}
      >
        ?
      </button>
      <div id="shortcut-tips" className="shortcuts-card" role="dialog" aria-label={text.title} hidden={!open}>
        <h3>{text.title}</h3>
        <dl>
          {text.rows.map(([action, keys]) => (
            <div key={action}>
              <dt>{action}</dt>
              <dd>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p>{text.touch}</p>
      </div>
    </div>
  )
}
