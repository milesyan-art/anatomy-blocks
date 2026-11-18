import { registerSculpts } from '../parts/sculpts'
import { buildSculpt } from './sdf'

/*
 * Builds sculpted parts off the main thread: meshing a distance field and simplifying
 * it takes up to a second per part, which would freeze the page. The mesh comes back
 * as transferred buffers (no copy).
 */
registerSculpts()

const scope = self as unknown as Worker

scope.onmessage = (e: MessageEvent<{ key: string }>) => {
  const { key } = e.data
  const mesh = buildSculpt(key)
  const buffers = [mesh.position.buffer, mesh.normal.buffer, mesh.index.buffer]
  if (mesh.ink) buffers.push(mesh.ink.buffer)
  scope.postMessage({ key, mesh }, buffers)
}
