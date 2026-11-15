import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

if (process.platform === 'win32') {
  const directory = resolve('dist/vault-host')
  mkdirSync(directory, { recursive: true })
  const compiler = join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
  execFileSync(compiler, ['/nologo', '/target:exe', '/optimize+', '/platform:x64',
    `/out:${join(directory, 'WorkBaseVaultHost.exe')}`, resolve('scripts/vault-host.cs')], { stdio: 'inherit' })
}
