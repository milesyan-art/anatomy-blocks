import type { GroupDef, LessonDef, RigDef } from '../engine/types'
import { zh } from './zh'

/*
 * English is the source language: it lives next to the models in src/parts.
 * Every other language is one file here that overrides text by id.
 * Anything a language leaves out simply falls back to English.
 *
 * To add a language: copy zh.ts, translate it, then add it to LANGS,
 * UI and CONTENT below, plus one line in detectLang().
 */

export type Lang = 'en' | 'zh'

export const LANGS: { id: Lang; label: string; html: string }[] = [
  { id: 'en', label: 'English', html: 'en' },
  { id: 'zh', label: '简体中文', html: 'zh-Hans' },
]

/** Fixed words in the page chrome. */
export interface UiText {
  title: string
  tagline: string
  male: string
  female: string
  language: string
  bodyType: string
  /** Name of the left / right switch (read out by screen readers). */
  limbSide: string
  left: string
  right: string
  /** Tooltip on the switch when the torso is showing. */
  sideTorso: string
  bodyParts: string
  lookFrom: string
  muscles: string
  bones: string
  guides: string
  labels: string
  neighbours: string
  hint: string
  /** The view gizmo in the corner of the stage. */
  gizmo: {
    label: string
    /** Each view dot: [the letter on the dot, its full name]. */
    dots: Record<'front' | 'back' | 'left' | 'right' | 'top' | 'bottom', [string, string]>
    turn: string
    tiltName: string
    tilt: string
    tiltLeft: string
    tiltRight: string
    level: string
    home: string
  }
  /** The "?" card of mouse and key shortcuts under the gizmo. */
  shortcuts: {
    button: string
    title: string
    /** [what it does, the ways to do it] */
    rows: [string, string[]][]
    touch: string
  }
  moveIt: string
  blocks: string
  tips: string
  light: string
  lightHint: string
  lightPad: string
  lightDepth: string
  lightFlat: string
  lightDeep: string
  lightLock: string
  lightLockHint: string
  lightSurface: string
  lightPlaster: string
  lightColour: string
  valuesTitle: string
  values: { highlight: string; light: string; halftone: string; core: string; reflected: string; cast: string }
  where: string
  drawItAs: string
  watch: string
  /** Section headings and view-button names, keyed by the English word. */
  sections: Record<string, string>
  sides: Record<string, string>
  lightPresets: Record<string, string>
}

type GroupText = Pick<GroupDef, 'name' | 'real' | 'where' | 'shape' | 'move'>

/** Translated text for the lessons and models, keyed by id. */
export interface Content {
  lessons: Record<string, { title: string; short?: string; blurb: string; tips: string[]; sides?: LessonDef['sides'] }>
  rigs: Record<
    string,
    {
      groups: Record<string, GroupText>
      controls: Record<string, { label: string; lo: string; hi: string }>
      /** keyed by the English preset label */
      presets: Record<string, string>
    }
  >
}

const en: UiText = {
  title: 'Block Anatomy',
  tagline: 'one body part at a time',
  male: 'Male',
  female: 'Female',
  language: 'Language',
  bodyType: 'Body type',
  limbSide: 'Which side',
  left: 'Left',
  right: 'Right',
  sideTorso: 'The torso already shows both sides',
  bodyParts: 'Body parts',
  lookFrom: 'Look from',
  muscles: 'Muscles',
  bones: 'Bones',
  guides: 'Guide lines',
  labels: 'Labels',
  neighbours: 'Neighbours',
  hint: 'drag to spin · right-drag to pan · scroll to zoom · Q / E to tilt',
  shortcuts: {
    button: 'Mouse and key shortcuts',
    title: 'Mouse & keys',
    rows: [
      ['Rotate', ['Left-drag', '← → ↑ ↓']],
      ['Pan', ['Right-drag', 'Shift + drag']],
      ['Zoom', ['Scroll']],
      ['Tilt', ['Q', 'E', 'Drag the arc']],
      ['Start view', ['0']],
    ],
    touch: 'On a touch screen: one finger rotates, two fingers pan and zoom, a two-finger twist tilts.',
  },
  gizmo: {
    label: 'View',
    dots: {
      front: ['F', 'Look from the front'],
      back: ['Bk', 'Look from the back'],
      left: ['L', 'Look from the left'],
      right: ['R', 'Look from the right'],
      top: ['T', 'Look from the top'],
      bottom: ['B', 'Look from below'],
    },
    turn: 'Drag to turn the model',
    tiltName: 'Tilt the picture',
    tilt: 'Drag to tilt the picture · double-click to level',
    tiltLeft: 'Tilt anticlockwise 15°',
    tiltRight: 'Tilt clockwise 15°',
    level: 'Level the picture',
    home: 'Back to the starting view',
  },
  moveIt: 'Move it',
  blocks: 'The blocks',
  tips: 'Drawing tips',
  light: 'Light',
  lightHint: 'A plaster cast under one lamp',
  lightPad: 'Light direction',
  lightDepth: 'Shadow depth',
  lightFlat: 'soft',
  lightDeep: 'deep',
  lightLock: 'Lock light',
  lightLockHint: 'The lamp stays put when you turn the model',
  lightSurface: 'Surface',
  lightPlaster: 'Plaster',
  lightColour: 'Colour',
  valuesTitle: 'Read the values',
  values: {
    highlight: 'Highlight',
    light: 'Light',
    halftone: 'Halftone',
    core: 'Core shadow',
    reflected: 'Reflected light',
    cast: 'Cast shadow',
  },
  where: 'Where',
  drawItAs: 'Draw it as',
  watch: 'Watch',
  sections: {},
  sides: {},
  lightPresets: {},
}

export const UI: Record<Lang, UiText> = { en, zh: zh.ui }

const CONTENT: Partial<Record<Lang, Content>> = { zh: zh.content }

const STORAGE_KEY = 'block-anatomy-lang'

/** The visitor's saved choice, else the first browser language we speak, else English. */
export function detectLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (LANGS.some((l) => l.id === saved)) return saved as Lang
  } catch {
    // storage can be blocked (private mode) - fall through to the browser setting
  }
  const wanted = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of wanted) {
    const code = (tag ?? '').toLowerCase()
    if (code.startsWith('zh')) return 'zh'
    if (code.startsWith('en')) return 'en'
  }
  return 'en'
}

export function rememberLang(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // not being able to remember is fine
  }
}

export function localizeLesson(lesson: LessonDef, lang: Lang): LessonDef {
  const t = CONTENT[lang]?.lessons[lesson.id]
  const ui = UI[lang]
  const sides = t?.sides ?? (lesson.sides?.map((s) => ui.sides[s] ?? s) as LessonDef['sides'])
  const short = t?.short ?? (lesson.short && (ui.sides[lesson.short] ?? lesson.short))
  if (!t) return { ...lesson, sides, short }
  return { ...lesson, title: t.title, blurb: t.blurb, tips: t.tips, sides, short }
}

export function localizeRig(rig: RigDef, lang: Lang): RigDef {
  const t = CONTENT[lang]?.rigs[rig.id]
  if (!t) return rig
  return {
    ...rig,
    groups: rig.groups.map((g) => ({ ...g, ...t.groups[g.id] })),
    controls: rig.controls.map((c) => ({ ...c, ...t.controls[c.id] })),
    presets: rig.presets.map((p) => ({ ...p, label: t.presets[p.label] ?? p.label })),
  }
}
