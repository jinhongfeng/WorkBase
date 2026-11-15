import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { AppError, fail } from '../ipc/errors'
import { logMain } from '../log'
import { getBrowserCredential, isVaultInitialized, isVaultUnlocked, listVaultAccounts, needsBrowserSave, saveVaultAccount, username, webOrigin, webPassword } from './vault'

const run = promisify(execFile)
const hostName = 'com.workbase.vault'
const maxRequest = 32768
const requestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('status') }),
  z.object({ type: z.literal('list'), origin: webOrigin }),
  z.object({ type: z.literal('fill'), origin: webOrigin, id: z.uuid().optional() }),
  z.object({ type: z.literal('check'), origin: webOrigin, username, password: webPassword }),
  z.object({ type: z.literal('save'), origin: webOrigin, username, password: webPassword })
])
const sessionName = 'session.bin'
let server: Server | undefined
let configuring = false
const clients = new Set<Socket>()

function bridgeDirectory(): string { return join(app.getPath('userData'), 'vault-browser') }

export function isBrowserConnected(): boolean { return server?.listening ?? false }

function handleRequest(bytes: Buffer): object {
  try {
    const request = requestSchema.parse(JSON.parse(bytes.toString('utf8')))
    if (request.type === 'status') return { ok: true, initialized: isVaultInitialized(), unlocked: isVaultUnlocked() }
    if (request.type === 'list') return { ok: true, accounts: listVaultAccounts(request.origin) }
    if (request.type === 'fill') return { ok: true, credential: getBrowserCredential(request.origin, request.id) }
    if (request.type === 'check') return { ok: true, changed: needsBrowserSave(request.origin, request.username, request.password) }
    saveVaultAccount({ ...request, autoFill: false }, true)
    return { ok: true }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, ...JSON.parse(error.message) }
    return { ok: false, message: 'WorkBase 无法处理这次密码库请求。' }
  }
}

function receiveRequest(socket: Socket, token: Buffer): void {
  clients.add(socket)
  socket.on('close', () => clients.delete(socket))
  socket.on('error', () => socket.destroy())
  socket.setTimeout(2500, () => socket.destroy())
  let packet = Buffer.alloc(0)
  socket.on('data', (chunk: Buffer) => {
    packet = Buffer.concat([packet, chunk])
    if (packet.length > 36 + maxRequest) { socket.destroy(); return }
    if (packet.length < 36) return
    const length = packet.readUInt32LE(32)
    if (!timingSafeEqual(token, packet.subarray(0, 32)) || length === 0 || length > maxRequest) {
      socket.destroy()
      return
    }
    if (packet.length < 36 + length) return
    socket.pause()
    const response = Buffer.from(JSON.stringify(handleRequest(packet.subarray(36, 36 + length))))
    packet.fill(0)
    const header = Buffer.alloc(4)
    header.writeUInt32LE(response.length)
    socket.end(Buffer.concat([header, response]))
  })
}

async function startBridge(): Promise<void> {
  if (server) return
  const token = randomBytes(32)
  const name = createHash('sha256').update(token).digest('hex').slice(0, 32)
  const instance = createServer(socket => receiveRequest(socket, token))
  instance.maxConnections = 24
  server = instance
  try {
    await new Promise<void>((resolve, reject) => {
      instance.once('error', reject)
      instance.listen({ path: `\\\\.\\pipe\\WorkBaseVault-${name}`, readableAll: false, writableAll: false }, () => {
        instance.removeListener('error', reject)
        instance.on('error', stopVaultBridge)
        resolve()
      })
    })
    await writeFile(join(bridgeDirectory(), sessionName), token)
  } catch (error) {
    stopVaultBridge()
    throw error
  }
}

export function stopVaultBridge(): void {
  for (const client of clients) client.destroy()
  server?.close()
  server = undefined
}

export async function restoreVaultBridge(): Promise<void> {
  if (process.platform !== 'win32') return
  const manifest = await readFile(join(bridgeDirectory(), 'host.json')).catch(() => undefined)
  if (manifest) await startBridge()
}

export async function configureVaultBrowser(): Promise<void> {
  if (configuring) fail('VAULT_BROWSER_BUSY', '正在连接浏览器，请稍候。')
  configuring = true
  try {
    const directory = bridgeDirectory()
    const resources = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const extension = join(resources, 'browser-extension')
    const host = await readFile(join(resources, app.isPackaged ? 'vault-host' : 'dist/vault-host', 'WorkBaseVaultHost.exe'))
    const extensionManifest = z.object({ key: z.string() }).parse(JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8')))
    const id = createHash('sha256').update(Buffer.from(extensionManifest.key, 'base64')).digest('hex').slice(0, 32)
      .replace(/./g, digit => String.fromCharCode(97 + Number.parseInt(digit, 16)))
    const buildId = createHash('sha256').update(host).digest('hex').slice(0, 16)
    const hostPath = join(directory, `host-${buildId}.exe`)
    const manifestPath = join(directory, 'host.json')
    const extensionPath = join(directory, 'extension')
    await mkdir(directory, { recursive: true })
    await writeFile(hostPath, host, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
    await cp(extension, extensionPath, { recursive: true })
    for (const browser of ['Google\\Chrome', 'Microsoft\\Edge']) {
      const key = `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${hostName}`
      const registryTool = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'reg.exe')
      await run(registryTool, ['ADD', key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f', '/reg:32'], { windowsHide: true })
    }
    await writeFile(manifestPath, JSON.stringify({
      name: hostName, description: 'WorkBase password vault', type: 'stdio', path: hostPath,
      allowed_origins: [`chrome-extension://${id}/`]
    }))
    await startBridge()
    if (await shell.openPath(extensionPath)) fail('VAULT_BROWSER_FOLDER', '浏览器已连接，但无法打开扩展文件夹。')
  } catch (error) {
    if (error instanceof AppError) throw error
    logMain('Could not configure the password vault browser bridge')
    fail('VAULT_BROWSER_SETUP', '浏览器连接失败，请检查当前 Windows 用户能否安装本地扩展。')
  } finally {
    configuring = false
  }
}

export async function disconnectVaultBrowser(): Promise<void> {
  if (configuring) fail('VAULT_BROWSER_BUSY', '正在配置浏览器，请稍候。')
  configuring = true
  try {
    stopVaultBridge()
    await rm(join(bridgeDirectory(), 'host.json'), { force: true })
    await rm(join(bridgeDirectory(), sessionName), { force: true })
  } finally {
    configuring = false
  }
}
