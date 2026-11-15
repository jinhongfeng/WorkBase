import { createHash } from 'node:crypto'
import { watch, type FSWatcher } from 'node:fs'
import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { z } from 'zod'
import { PLUGIN_SCHEME, type InstalledPlugin } from '@shared/plugins'
import { contentTypeFor, serveAssetFile } from '../assets'

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
  name: z.string().trim().min(1).max(80),
  entry: z.string().max(240).default('index.html')
})
const WEB_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
}
const FILE_SEGMENT = /^[^<>:"/\\|?*\p{Cc}]+$/u
const PLUGIN_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; sandbox allow-scripts allow-same-origin"

interface PluginPackage {
  details: InstalledPlugin
  root: string
  files: Map<string, string>
}

function safeSegment(name: string): boolean {
  return FILE_SEGMENT.test(name) && !/[. ]$/.test(name)
}

async function inspectPlugin(root: string): Promise<PluginPackage | null> {
  const manifestFile = join(root, 'plugin.json')
  const manifestStat = await lstat(manifestFile)
  if (!manifestStat.isFile() || manifestStat.size > 16 * 1024) return null
  const manifest = manifestSchema.parse(JSON.parse((await readFile(manifestFile, 'utf8')).replace(/^\uFEFF/, '')))
  const entry = manifest.entry.split('/')
  if (!entry.every(safeSegment) || !/\.html?$/i.test(manifest.entry)) return null

  const files = new Map<string, string>()
  let entryReady = false
  const revision = createHash('sha256').update(JSON.stringify(manifest))
  const directories = [root]
  for (const directory of directories) {
    const children = await readdir(directory, { withFileTypes: true })
    children.sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children) {
      if (!safeSegment(child.name)) continue
      const path = join(directory, child.name)
      if (child.isDirectory()) directories.push(path)
      if (!child.isFile() || path === manifestFile) continue
      const stat = await lstat(path)
      if (!stat.isFile()) continue
      const name = relative(root, path).split(sep).join('/')
      files.set(name, path)
      if (name === manifest.entry) entryReady = stat.size > 0
      revision.update(JSON.stringify([name, stat.size, stat.mtimeMs, stat.ctimeMs]))
    }
  }
  if (!entryReady) return null
  const entryUrl = `${PLUGIN_SCHEME}://${manifest.id}/${entry.map(encodeURIComponent).join('/')}?v=${revision.digest('hex')}`
  return { details: { id: manifest.id, name: manifest.name, entryUrl }, root, files }
}

export function startPluginLibrary(directory: string, notifyChanged: () => void) {
  let packages = new Map<string, PluginPackage>()
  let watcher: FSWatcher | undefined
  let watchedRoot: string | undefined
  let timer: NodeJS.Timeout | undefined
  let scanning = false
  let pending = false
  let stopped = false

  function queueScan(): void {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => { timer = undefined; void scan() }, 400)
  }

  async function scan(): Promise<void> {
    if (scanning) { pending = true; return }
    scanning = true
    try {
      await mkdir(directory, { recursive: true })
      if (!(await lstat(directory)).isDirectory()) { update(new Map()); return }
      const root = await realpath(directory)
      if (stopped) return
      if (watchedRoot !== root || !watcher) {
        watcher?.close()
        try {
          const current = watch(root, { recursive: true }, queueScan)
          watcher = current
          watchedRoot = root
          current.on('error', () => {
            current.close()
            if (watcher === current) watcher = undefined
            queueScan()
          })
        } catch { watcher = undefined }
      }

      const entries = await readdir(root, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))
      const next = new Map<string, PluginPackage>()
      const duplicateIds = new Set<string>()
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const path = join(root, entry.name)
        if (await realpath(path).catch(() => null) !== path) continue
        const plugin = await inspectPlugin(path).catch(() => null)
        if (!plugin) continue
        const { id } = plugin.details
        if (next.has(id)) { next.delete(id); duplicateIds.add(id) }
        if (!duplicateIds.has(id)) next.set(id, plugin)
      }
      if (stopped || timer || pending) return
      update(next)
    } catch {
      if (!stopped && !timer) update(new Map())
    } finally {
      scanning = false
      if (pending) { pending = false; queueScan() }
    }
  }

  function update(next: Map<string, PluginPackage>): void {
    const changed = next.size !== packages.size || [...next].some(([id, plugin]) => {
      const previous = packages.get(id)
      return previous?.root !== plugin.root || previous.details.entryUrl !== plugin.details.entryUrl
    })
    packages = next
    if (changed) notifyChanged()
  }

  async function serve(request: Request): Promise<Response> {
    const notFound = (): Response => new Response('插件文件不可用', { status: 404 })
    if (request.method !== 'GET') return new Response(null, { status: 405 })
    const url = new URL(request.url)
    const plugin = packages.get(url.hostname)
    if (!plugin || url.port || url.username || url.password) return notFound()
    try {
      const parts = url.pathname.slice(1).split('/').map(decodeURIComponent)
      if (!parts.every(safeSegment)) return notFound()
      const path = plugin.files.get(parts.join('/'))
      if (!path || await realpath(path) !== path || !(await lstat(path)).isFile()) return notFound()
      const type = WEB_TYPES[extname(path).toLowerCase()] ?? contentTypeFor(path)
      if (type === 'application/octet-stream') return notFound()
      const response = serveAssetFile(path, type.startsWith('text/html') ? null : request.headers.get('range'))
      response.headers.set('Content-Type', type)
      response.headers.set('Content-Security-Policy', PLUGIN_CSP)
      response.headers.set('X-Content-Type-Options', 'nosniff')
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch { return notFound() }
  }

  const fallback = setInterval(() => { if (!timer) void scan() }, 10000)
  const ready = scan()
  return {
    ready,
    list: () => [...packages.values()].map(plugin => plugin.details),
    serve,
    close: () => {
      stopped = true
      clearInterval(fallback)
      clearTimeout(timer)
      watcher?.close()
    }
  }
}
