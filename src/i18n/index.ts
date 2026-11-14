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
  bodyParts: string
  lookFrom: string
  muscles: string
  bones: string
  guides: string
  labels: string
  neighbours: string
  hint: string
  moveIt: string
  blocks: string
  tips: string
  where: string
  drawItAs: string
  watch: string
  /** Section headings and view-button names, keyed by the English word. */
  sections: Record<string, string>
  sides: Record<string, string>
}

type GroupText = Pick<GroupDef, 'name' | 'real' | 'where' | 'shape' | 'move'>

/** Translated text for the lessons and models, keyed by id. */
export interface Content {
  lessons: Record<string, { title: string; blurb: string; tips: string[]; sides?: LessonDef['sides'] }>
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
  bodyParts: 'Body parts',
  lookFrom: 'Look from',
  muscles: 'Muscles',
  bones: 'Bones',
  guides: 'Guide lines',
  labels: 'Labels',
  neighbours: 'Neighbours',
  hint: 'drag to spin · scroll or pinch to zoom',
  moveIt: 'Move it',
  blocks: 'The blocks',
  tips: 'Drawing tips',
  where: 'Where',
  drawItAs: 'Draw it as',
  watch: 'Watch',
  sections: {},
  sides: {},
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
  if (!t) return { ...lesson, sides }
  return { ...lesson, title: t.title, blurb: t.blurb, tips: t.tips, sides }
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
