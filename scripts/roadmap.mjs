// Screenshots docs/roadmap.html into the PNGs the READMEs show.
// Usage: npm run roadmap   (needs Google Chrome; set CHROME=/path/to/chrome to use another one)
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const candidates = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
const chrome = candidates.find((p) => existsSync(p))
if (!chrome) {
  console.error('Could not find Chrome. Set CHROME=/path/to/chrome and try again.')
  process.exit(1)
}

const page = pathToFileURL(resolve('docs/roadmap.html')).href
const shots = [
  { query: '', out: 'docs/images/roadmap.png' },
  { query: '?lang=zh', out: 'docs/images/roadmap.zh-CN.png' },
]

for (const { query, out } of shots) {
  execFileSync(chrome, [
    '--headless',
    '--hide-scrollbars',
    '--window-size=1200,560', // the board's size; 2× below makes a sharp 2400 × 1120 PNG
    '--force-device-scale-factor=2',
    '--virtual-time-budget=4000', // give the web fonts time to load
    `--screenshot=${resolve(out)}`,
    page + query,
  ], { stdio: 'ignore' })
  console.log(`saved ${out}`)
}
