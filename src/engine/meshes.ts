import { preloadAll, setMeshLoader } from './sdf'
import type { SolidMesh } from './types'

/*
 * Where the sculpted bones' meshes come from.
 *
 * Building one (meshing a distance field, then simplifying it) takes up to a second,
 * so it never happens on the main thread: a few workers build them, the parts that a
 * lesson is waiting to draw first, the rest in the background. Finished meshes are
 * kept in the browser (IndexedDB), so the next visit reads them back in moments.
 * The cache is tied to the build (`__MESH_VERSION__` hashes the code that shapes the
 * bones), and left out in development, where that code keeps changing.
 */

const CACHE = !import.meta.env.DEV && typeof indexedDB !== 'undefined'
const DB = 'anatomy-blocks'
const STORE = 'meshes'

let db: Promise<IDBDatabase | null> | null = null
function openDb(): Promise<IDBDatabase | null> {
  if (!CACHE) return Promise.resolve(null)
  db ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onerror = () => resolve(null)
      req.onsuccess = () => {
        const d = req.result
        // forget meshes from older builds
        try {
          const tx = d.transaction(STORE, 'readwrite')
          const cur = tx.objectStore(STORE).openKeyCursor()
          cur.onsuccess = () => {
            const c = cur.result
            if (!c) return
            if (!String(c.key).startsWith(`${__MESH_VERSION__}:`)) tx.objectStore(STORE).delete(c.key)
            c.continue()
          }
        } catch {
          // a cache that cannot be cleaned is still a cache
        }
        resolve(d)
      }
    } catch {
      resolve(null)
    }
  })
  return db
}

async function readCache(key: string): Promise<SolidMesh | null> {
  const d = await openDb()
  if (!d) return null
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(`${__MESH_VERSION__}:${key}`)
      req.onsuccess = () => resolve((req.result as SolidMesh | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeCache(key: string, mesh: SolidMesh) {
  const d = await openDb()
  if (!d) return
  try {
    d.transaction(STORE, 'readwrite').objectStore(STORE).put(mesh, `${__MESH_VERSION__}:${key}`)
  } catch {
    // out of space or private mode: just build it again next time
  }
}

/* ───────────────────────── the workers ───────────────────────── */

interface Job {
  key: string
  resolve: (m: SolidMesh) => void
  reject: (e: unknown) => void
}

const queue: Job[] = []
const waiting = new Map<string, Job>()
const idle: Worker[] = []
const working = new Map<Worker, Job>()
let workers: Worker[] | null = null

function startWorkers() {
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))
  workers = []
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ key: string; mesh: SolidMesh }>) => {
      const job = working.get(w)
      working.delete(w)
      idle.push(w)
      if (job) {
        job.resolve(e.data.mesh)
        writeCache(job.key, e.data.mesh)
      }
      next()
    }
    w.onerror = (e) => {
      const job = working.get(w)
      working.delete(w)
      idle.push(w)
      job?.reject(e)
      next()
    }
    workers.push(w)
    idle.push(w)
  }
}

function next() {
  while (idle.length && queue.length) {
    const job = queue.shift()!
    waiting.delete(job.key)
    const w = idle.pop()!
    working.set(w, job)
    w.postMessage({ key: job.key })
  }
}

function build(key: string, urgent: boolean): Promise<SolidMesh> {
  if (!workers) startWorkers()
  return new Promise((resolve, reject) => {
    const job = { key, resolve, reject }
    waiting.set(key, job)
    if (urgent) queue.unshift(job)
    else queue.push(job)
    next()
  })
}

setMeshLoader({
  async load(key, urgent) {
    const cached = await readCache(key)
    const mesh = cached ?? (await build(key, urgent))
    // visible in the browser's performance tools: when each part arrived, and from where
    performance.mark(`mesh ${cached ? 'cache' : 'built'} ${key}`)
    return mesh
  },
  hurry(key) {
    // a part queued for the background is now wanted on screen: to the front
    const job = waiting.get(key)
    if (!job) return
    queue.splice(queue.indexOf(job), 1)
    queue.unshift(job)
  },
})

// once the first lesson has asked for its parts, fetch the rest in the background
setTimeout(preloadAll, 800)
