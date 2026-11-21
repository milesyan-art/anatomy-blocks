// Writes the small README badges into docs/images/ (same look as the site: cream, navy outline, hard offset shadow).
// Usage: node scripts/badges.mjs [stars]   e.g. node scripts/badges.mjs 28
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/images')
const stars = process.argv[2] ?? '28'

const NAVY = '#1f2a5c'
const CREAM = '#fdfcf7'
const YELLOW = '#ffd84d'
const GREEN = '#a9dd78'
const PINK = '#f0719f'
const LATIN = "Nunito, system-ui, -apple-system, 'Segoe UI', sans-serif"
const CJK = "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif"

const H = 22 // badge height
const R = H / 2
const FS = 11 // font size
const PAD = 9 // side padding inside a segment

// rough text width: CJK glyphs are one em wide, latin about 0.6 em
const textW = (s) => [...s].reduce((n, c) => n + (/[　-鿿]/.test(c) ? FS : FS * 0.62), 0)
const seg = (s, extra = 0) => Math.round(textW(s) + PAD * 2 + extra)

function badge(name, label, value, { aria, labelFill = CREAM, valueFill = YELLOW, cjk = false, star = false }) {
  const font = cjk ? CJK : LATIN
  const lw = label ? seg(label, star ? 14 : 0) : 0
  const vw = seg(value)
  const w = lw + vw
  const W = w + 3
  const ty = H / 2 + 4 // text baseline
  const t = (x, s, f) =>
    `<text x="${x}" y="${ty}" text-anchor="middle" font-family="${f}" font-size="${FS}" font-weight="800" fill="${NAVY}">${s}</text>`
  const starPath = `<path transform="translate(${PAD - 2} 3.2) scale(0.82)" d="M6 .5l1.6 3.8 4.1.4-3.1 2.7.9 4-3.5-2.1-3.5 2.1.9-4L.3 4.7l4.1-.4z" fill="${YELLOW}" stroke="${NAVY}" stroke-width="1.4" stroke-linejoin="round"/>`
  const labelX = star ? lw / 2 + 7 : lw / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 3}" viewBox="0 0 ${W} ${H + 3}" role="img" aria-label="${aria}">
  <defs><clipPath id="c"><rect x="1" y="1" width="${w - 2}" height="${H - 2}" rx="${R - 1}"/></clipPath></defs>
  <rect x="3" y="3" width="${w}" height="${H}" rx="${R}" fill="${NAVY}"/>
  <g clip-path="url(#c)" transform="translate(0 0)">
    ${label ? `<rect x="1" y="1" width="${lw}" height="${H - 2}" fill="${labelFill}"/>` : ''}
    <rect x="${lw + 1}" y="1" width="${vw}" height="${H - 2}" fill="${valueFill}"/>
    ${label ? `<line x1="${lw}" y1="0" x2="${lw}" y2="${H}" stroke="${NAVY}" stroke-width="1.5"/>` : ''}
  </g>
  <rect x="0.75" y="0.75" width="${w - 1.5}" height="${H - 1.5}" rx="${R - 0.75}" fill="none" stroke="${NAVY}" stroke-width="1.5"/>
  ${star ? starPath : ''}
  ${label ? t(labelX, label, font) : ''}
  ${t(lw + vw / 2, value, font)}
</svg>
`
  writeFileSync(resolve(out, name), svg)
  console.log(name, `${W}x${H + 3}`)
}

// language buttons: the current page is yellow, the other is cream
badge('badge-lang-en.svg', '', 'English', { aria: 'English (current)', valueFill: YELLOW })
badge('badge-lang-en-link.svg', '', 'English', { aria: 'Switch to English', valueFill: CREAM })
badge('badge-lang-zh.svg', '', '简体中文', { aria: '简体中文（当前）', valueFill: YELLOW, cjk: true })
badge('badge-lang-zh-link.svg', '', '简体中文', { aria: '切换到简体中文', valueFill: CREAM, cjk: true })

badge('badge-license.svg', 'license', 'MIT', { aria: 'License: MIT', valueFill: GREEN })
badge('badge-license-zh.svg', '许可证', 'MIT', { aria: '许可证：MIT', valueFill: GREEN, cjk: true })
badge('badge-stars.svg', 'stars', stars, { aria: `GitHub stars: ${stars}`, valueFill: PINK, star: true })
badge('badge-stars-zh.svg', '星标', stars, { aria: `GitHub 星标：${stars}`, valueFill: PINK, cjk: true, star: true })
