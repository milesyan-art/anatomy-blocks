import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { defineConfig } from 'vite'

/** A hash of the code that shapes the sculpted bones, so the browser's mesh cache knows when to start over. */
function meshVersion() {
  const files = [
    ...['sdf.ts', 'simplify.ts'].map((f) => `src/engine/${f}`),
    ...readdirSync('src/parts')
      .filter((f) => /Bones\.ts$|^pelvis\.ts$|^sculpts\.ts$/.test(f))
      .map((f) => `src/parts/${f}`),
  ].sort()
  const h = createHash('sha256')
  for (const f of files) h.update(readFileSync(f))
  return h.digest('hex').slice(0, 12)
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __MESH_VERSION__: JSON.stringify(meshVersion()) },
  worker: { format: 'es' },
  build: {
    // three.js is ~1 MB before gzip (about 330 kB over the wire) - that is the whole budget
    chunkSizeWarningLimit: 1400,
  },
})
