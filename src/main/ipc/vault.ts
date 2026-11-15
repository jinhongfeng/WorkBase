import { app, ipcMain, powerMonitor } from 'electron'
import { z } from 'zod'
import { channels } from '@shared/ipc-contract'
import { logMain } from '../log'
import { accountInput, isVaultInitialized, isVaultUnlocked, listVaultAccounts, lockVault, openVault, removeVaultAccount, saveVaultAccount } from '../security/vault'
import { configureVaultBrowser, disconnectVaultBrowser, isBrowserConnected, restoreVaultBridge, stopVaultBridge } from '../security/vault-bridge'
import { fail } from './errors'
import { noArgs, validate } from './validation'

export function registerVaultIPC(): void {
  powerMonitor.on('lock-screen', lockVault)
  powerMonitor.on('suspend', lockVault)
  app.on('will-quit', () => { lockVault(); stopVaultBridge() })
  void restoreVaultBridge().catch(() => logMain('Could not start the password vault browser bridge'))

  ipcMain.handle(channels.vaultStatus, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return { initialized: isVaultInitialized(), unlocked: isVaultUnlocked(), browserConnected: isBrowserConnected() }
  })
  ipcMain.handle(channels.vaultOpen, (_event, ...args: unknown[]) => {
    const [passphrase, create] = validate(z.tuple([z.string().min(1).max(512), z.boolean()]), args)
    if (create && passphrase.length < 12) fail('VAULT_PASSWORD_SHORT', '主密码至少需要 12 个字符。')
    return openVault(passphrase, create)
  })
  ipcMain.handle(channels.vaultLock, (_event, ...args: unknown[]) => { validate(noArgs, args); lockVault() })
  ipcMain.handle(channels.vaultList, (_event, ...args: unknown[]) => { validate(noArgs, args); return listVaultAccounts() })
  ipcMain.handle(channels.vaultSave, (_event, ...args: unknown[]) => {
    const [input] = validate(z.tuple([accountInput]), args)
    saveVaultAccount(input)
  })
  ipcMain.handle(channels.vaultRemove, (_event, ...args: unknown[]) => {
    const [id] = validate(z.tuple([z.uuid()]), args)
    removeVaultAccount(id)
  })
  ipcMain.handle(channels.vaultConnect, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    if (!isVaultUnlocked()) fail('VAULT_LOCKED', '请先解锁密码库。')
    return configureVaultBrowser()
  })
  ipcMain.handle(channels.vaultDisconnect, (_event, ...args: unknown[]) => {
    validate(noArgs, args)
    return disconnectVaultBrowser()
  })
}
