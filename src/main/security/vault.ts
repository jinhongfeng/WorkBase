import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scrypt } from 'node:crypto'
import { z } from 'zod'
import type { VaultAccount, VaultAccountInput } from '@shared/vault'
import { getDatabase } from '../db'
import { fail } from '../ipc/errors'

const lockDelay = 15 * 60 * 1000
const maxAccounts = 1000
const cipherContext = Buffer.from('WorkBase password vault v1')
const accountId = z.uuid()
export const webPassword = z.string().min(1).max(4096)
export const username = z.string().min(1).max(512)
export const webOrigin = z.string().max(1024).transform((value, context) => {
  const url = URL.parse(value)
  if (!url || url.protocol !== 'https:' || url.username || url.password) {
    context.addIssue({ code: 'custom', message: '请输入有效的 HTTPS 网站地址。' })
    return z.NEVER
  }
  return url.origin
})

export const accountInput = z.object({
  id: accountId.optional(), origin: webOrigin, username, password: webPassword.optional(), autoFill: z.boolean()
})
const storedAccounts = z.array(accountInput.extend({ id: accountId, password: webPassword })).max(maxAccounts)
type StoredAccount = z.infer<typeof storedAccounts>[number]
interface VaultRow { salt: Buffer; encrypted: Buffer }

let key: Buffer | undefined
let lockAt = 0
let lockTimer: NodeJS.Timeout | undefined
let lockGeneration = 0
let deriving = false

function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, 32, { N: 65536, r: 8, p: 2, maxmem: 96 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

function readVault(): VaultRow | undefined {
  return getDatabase().prepare('SELECT salt, encrypted FROM password_vault WHERE id = 1').get() as VaultRow | undefined
}

export function isVaultInitialized(): boolean {
  return Boolean(getDatabase().prepare('SELECT 1 FROM password_vault WHERE id = 1').get())
}

export function lockVault(): void {
  lockGeneration++
  key?.fill(0)
  key = undefined
  lockAt = 0
  clearTimeout(lockTimer)
}

export function isVaultUnlocked(): boolean {
  if (key && Date.now() >= lockAt) lockVault()
  return Boolean(key)
}

function requireKey(): Buffer {
  if (!isVaultUnlocked() || !key) fail('VAULT_LOCKED', '请先在 WorkBase 解锁密码库。')
  return key
}

function encrypt(entries: StoredAccount[], vaultKey: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', vaultKey, iv).setAAD(cipherContext)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(entries), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

function decrypt(data: Buffer, vaultKey: Buffer): StoredAccount[] {
  const decipher = createDecipheriv('aes-256-gcm', vaultKey, data.subarray(0, 12))
    .setAAD(cipherContext).setAuthTag(data.subarray(12, 28))
  const plaintext = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()])
  try { return storedAccounts.parse(JSON.parse(plaintext.toString('utf8'))) }
  finally { plaintext.fill(0) }
}

export async function openVault(passphrase: string, create: boolean): Promise<void> {
  if (deriving) fail('VAULT_BUSY', '密码库正在解锁，请稍候。')
  const row = readVault()
  if (Boolean(row) === create) fail('VAULT_STATE', '密码库状态已变化，请刷新后再试。')
  lockVault()
  const generation = lockGeneration
  const salt = row?.salt ?? randomBytes(16)
  deriving = true
  let derived: Buffer | undefined
  try {
    derived = await deriveKey(passphrase, salt)
    if (generation !== lockGeneration) fail('VAULT_LOCKED', '密码库已锁定，请重新解锁。')
    if (row) {
      try { decrypt(row.encrypted, derived) }
      catch { fail('VAULT_PASSWORD', '主密码有误，或密码库数据已损坏。') }
    } else {
      getDatabase().prepare('INSERT INTO password_vault (id, salt, encrypted) VALUES (1, ?, ?)')
        .run(salt, encrypt([], derived))
    }
    key = derived
    lockAt = Date.now() + lockDelay
    lockTimer = setTimeout(lockVault, lockDelay)
  } finally {
    deriving = false
    if (derived !== key) derived?.fill(0)
  }
}

function readAccounts(vaultKey: Buffer): StoredAccount[] {
  const row = readVault()
  if (!row) fail('VAULT_STATE', '密码库尚未创建。')
  return decrypt(row.encrypted, vaultKey)
}

function writeAccounts(entries: StoredAccount[], vaultKey: Buffer): void {
  getDatabase().prepare('UPDATE password_vault SET encrypted = ? WHERE id = 1').run(encrypt(entries, vaultKey))
}

function summary({ id, origin, username, autoFill }: StoredAccount): VaultAccount {
  return { id, origin, username, autoFill }
}

export function listVaultAccounts(origin?: string): VaultAccount[] {
  return readAccounts(requireKey()).filter(entry => !origin || entry.origin === origin).map(summary)
}

export function saveVaultAccount(input: VaultAccountInput, fromBrowser = false): void {
  const vaultKey = requireKey()
  const entries = readAccounts(vaultKey)
  const duplicate = entries.find(entry => entry.origin === input.origin && entry.username === input.username)
  const previous = input.id ? entries.find(entry => entry.id === input.id) : fromBrowser ? duplicate : undefined
  if (input.id && !previous) fail('VAULT_MISSING', '该账号已被删除。')
  if (duplicate && duplicate !== previous) fail('VAULT_DUPLICATE', '该网站已有相同用户名。')
  if (!previous && entries.length >= maxAccounts) fail('VAULT_LIMIT', '密码库最多保存 1000 个账号。')
  if (previous?.origin !== input.origin && entries.filter(entry => entry.origin === input.origin).length >= 50) {
    fail('VAULT_SITE_LIMIT', '同一网站最多保存 50 个账号。')
  }
  const password = input.password ?? previous?.password
  if (!password) fail('VAULT_PASSWORD_REQUIRED', '请输入网站密码。')
  if (previous && previous.origin !== input.origin && !input.password) {
    fail('VAULT_PASSWORD_REQUIRED', '更换网站地址时请重新填写密码。')
  }
  const autoFill = fromBrowser ? (previous?.autoFill ?? false) : input.autoFill
  const entry = { ...input, id: previous?.id ?? randomUUID(), password, autoFill }
  writeAccounts([...entries.filter(item => item !== previous), entry], vaultKey)
}

export function removeVaultAccount(id: string): void {
  const vaultKey = requireKey()
  writeAccounts(readAccounts(vaultKey).filter(entry => entry.id !== id), vaultKey)
}

export function getBrowserCredential(origin: string, id?: string): { username: string; password: string } | null {
  const matches = readAccounts(requireKey()).filter(entry => entry.origin === origin)
  const entry = id ? matches.find(item => item.id === id) : matches.length === 1 && matches[0].autoFill ? matches[0] : undefined
  return entry ? { username: entry.username, password: entry.password } : null
}

export function needsBrowserSave(origin: string, username: string, password: string): boolean {
  return !readAccounts(requireKey()).some(entry => entry.origin === origin && entry.username === username && entry.password === password)
}
