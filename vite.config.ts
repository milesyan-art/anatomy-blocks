import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // three.js is ~1 MB before gzip (about 330 kB over the wire) - that is the whole budget
    chunkSizeWarningLimit: 1400,
  },
})
