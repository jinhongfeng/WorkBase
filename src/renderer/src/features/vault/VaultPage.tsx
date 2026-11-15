import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Lock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { VaultAccount, VaultStatus } from '@shared/vault'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { humanError } from '../../lib/utils'
import './vault.css'

const vault = window.api.vault

const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/'
} as const
type CharsetKey = keyof typeof CHARSETS
const CHARSET_LABELS: { key: CharsetKey; label: string }[] = [
  { key: 'upper', label: '大写' }, { key: 'digits', label: '数字' }, { key: 'symbols', label: '符号' }
]

/** 本地随机生成密码：crypto 随机源，启用中的每类字符至少出现一次。 */
function generatePassword(length: number, enabled: Record<CharsetKey, boolean>): string {
  const pools = (Object.keys(CHARSETS) as CharsetKey[]).filter(key => enabled[key]).map(key => CHARSETS[key])
  if (!pools.length || length < 4) return ''
  const random = (max: number): number => {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    return bytes[0] % max
  }
  const chars: string[] = []
  if (length >= pools.length) for (const pool of pools) chars.push(pool[random(pool.length)])
  const all = pools.join('')
  while (chars.length < length) chars.push(all[random(all.length)])
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** 按字符集 × 长度的熵值分四档，仅作参考提示。 */
function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 30
  const entropy = password.length * Math.log2(pool || 1)
  if (entropy < 40) return { score: 0, label: '弱' }
  if (entropy < 60) return { score: 1, label: '一般' }
  if (entropy < 80) return { score: 2, label: '强' }
  return { score: 3, label: '极强' }
}

export default function VaultPage() {
  const [status, setStatus] = useState<VaultStatus>()
  const [accounts, setAccounts] = useState<VaultAccount[]>([])
  const [editor, setEditor] = useState<{ entry?: VaultAccount }>()
  const [deleting, setDeleting] = useState<VaultAccount>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async (includeAccounts: boolean) => {
    const current = await vault.status()
    setStatus(current)
    if (!current.unlocked) {
      setAccounts([])
      setEditor(undefined)
      setDeleting(undefined)
    } else if (includeAccounts) {
      setAccounts(await vault.list())
    }
  }, [])

  useEffect(() => {
    const update = (includeAccounts: boolean) => {
      void refresh(includeAccounts).catch(cause => setError(humanError(cause)))
    }
    const onFocus = () => update(true)
    onFocus()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(() => update(false), 2000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [refresh])

  async function act(action?: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action?.(); await refresh(true) }
    catch (cause) { setError(humanError(cause)) }
    finally { setBusy(false) }
  }

  const unlocked = status?.unlocked
  const addButton = <Button type="button" variant="primary" disabled={busy} onClick={() => setEditor({})}><Plus size={16} />添加网站账号</Button>
  return <div className="page vault-page">
    <PageHeader title="密码库" actions={unlocked && <>
      <Button type="button" disabled={busy} onClick={() => void act(vault.lock)}><Lock size={16} />锁定</Button>{addButton}
    </>} />
    {!unlocked && <div className="empty-state-region">
      {status ? <UnlockForm create={!status.initialized} busy={busy} requestError={error} clearRequestError={() => setError('')}
        onSubmit={(password, create) => void act(() => vault.open(password, create))} /> :
        error ? <Alert tone="danger">{error}</Alert> : <p role="status">正在读取密码库…</p>}
    </div>}
    {unlocked && <>
      {error && <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>}
      <section className="vault-card vault-accounts" aria-label="网站账号">
        <div className="vault-section-heading"><h2>网站账号</h2>
          <Button variant="ghost" className="sm" disabled={busy} onClick={() => void act()}>刷新列表</Button>
        </div>
        {!accounts.length && <EmptyState compact icon={KeyRound} title="还没有网站账号" description="你可以手动添加，也可以在浏览器里确认保存。" />}
        {accounts.length > 0 && <ul className="vault-list">{accounts.map(entry => <li key={entry.id}>
          <div className="vault-entry"><strong title={entry.origin}>{entry.origin}</strong><span title={entry.username}>{entry.username}</span></div>
          {entry.autoFill && <small>已开启自动填充</small>}
          <Button variant="ghost" className="icon" aria-label={`编辑 ${entry.username}`} onClick={() => setEditor({ entry })}><Pencil size={15} /></Button>
          <Button variant="ghost" className="icon" aria-label={`删除 ${entry.username}`} onClick={() => setDeleting(entry)}><Trash2 size={15} /></Button>
        </li>)}</ul>}
      </section>
      <section className="vault-card" aria-label="浏览器连接">
        <div className="vault-section-heading"><h2>浏览器连接</h2><span>{status.browserConnected ? '已开启' : '未开启'}</span></div>
        <p>在 Chrome 或 Edge 的扩展管理页加载下方文件夹。到网站登录页打开 WorkBase 扩展，点击「允许此网站」。登录后有待保存账号时，点击扩展确认。</p>
        <div className="actions">
          <Button disabled={busy} onClick={() => void act(vault.connectBrowser)}>{status.browserConnected ? '打开扩展文件夹' : '连接浏览器'}</Button>
          {status.browserConnected && <Button disabled={busy} variant="ghost" onClick={() => void act(vault.disconnectBrowser)}>断开浏览器</Button>}
        </div>
      </section>
      {editor && <AccountEditor entry={editor.entry} onClose={() => setEditor(undefined)} onSaved={() => {
        setEditor(undefined)
        void refresh(true).catch(cause => setError(humanError(cause)))
      }} />}
      {deleting && <ConfirmDialog open title="删除网站账号" description={`删除 ${deleting.origin} 的账号「${deleting.username}」？`}
        onClose={() => setDeleting(undefined)} confirmLabel="删除账号" loading={busy} onConfirm={() => void act(async () => {
          await vault.remove(deleting.id)
          setDeleting(undefined)
        })} />}
    </>}
  </div>
}

function UnlockForm({ create, busy, requestError, clearRequestError, onSubmit }: {
  create: boolean; busy: boolean; requestError: string; clearRequestError(): void; onSubmit(password: string, create: boolean): void
}) {
  const [error, setError] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    clearRequestError()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password'))
    if (create && password !== data.get('confirm')) { setError('两次输入的主密码不一致。'); return }
    setError('')
    event.currentTarget.reset()
    onSubmit(password, create)
  }
  return <form className="vault-card vault-unlock" onSubmit={submit}>
    <h2>{create ? '创建本地密码库' : '解锁密码库'}</h2>
    <p>{create ? '设置一个至少 12 个字符的主密码。请妥善保管，忘记后将无法解密已保存的账号。' : '解锁后可以在浏览器填充。15 分钟后，或电脑锁屏、休眠时，密码库会自动锁定。'}</p>
    {(error || requestError) && <Alert tone="danger">{error || requestError}</Alert>}
    <div className="field"><label htmlFor="vault-master">主密码</label><Input id="vault-master" name="password" type="password"
      autoComplete={create ? 'new-password' : 'current-password'} minLength={create ? 12 : undefined} maxLength={512} required /></div>
    {create && <div className="field"><label htmlFor="vault-confirm">确认主密码</label><Input id="vault-confirm" name="confirm" type="password"
      autoComplete="new-password" minLength={12} maxLength={512} required /></div>}
    <div className="actions"><Button type="submit" variant="primary" loading={busy}>{create ? '创建密码库' : '解锁'}</Button></div>
  </form>
}

function AccountEditor({ entry, onClose, onSaved }: { entry?: VaultAccount; onClose(): void; onSaved(): void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [password, setPassword] = useState('')
  const [length, setLength] = useState(16)
  const [charsets, setCharsets] = useState<Record<CharsetKey, boolean>>({ lower: true, upper: true, digits: true, symbols: true })
  const strength = passwordStrength(password)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const password = String(data.get('password'))
    setBusy(true)
    setError('')
    try {
      await vault.save({ id: entry?.id, origin: String(data.get('origin')).trim(), username: String(data.get('username')),
        password: password || undefined, autoFill: data.has('autoFill') })
      form.reset()
      onSaved()
    } catch (cause) { setError(humanError(cause)) }
    finally { setBusy(false) }
  }
  return <Dialog open title={entry ? '编辑网站账号' : '添加网站账号'} onClose={onClose}>
    <form className="vault-edit" onSubmit={submit}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="field"><label htmlFor="vault-site">网站地址</label><Input id="vault-site" name="origin" type="url"
        placeholder="https://example.com" defaultValue={entry?.origin} pattern="https://.+" maxLength={1024} required data-dialog-autofocus /></div>
      <div className="field"><label htmlFor="vault-username">用户名</label><Input id="vault-username" name="username"
        defaultValue={entry?.username} autoComplete="off" maxLength={512} required /></div>
      <div className="field">
        <label htmlFor="vault-password">网站密码</label>
        <div className="vault-password-row">
          <Input id="vault-password" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)}
            autoComplete="new-password" placeholder={entry ? '留空保留原密码' : undefined} maxLength={4096} required={!entry} />
          <Button type="button" variant="secondary" className="sm" title="用本地随机源生成密码" disabled={busy}
            onClick={() => setPassword(generatePassword(length, charsets))}><RefreshCw size={14} />生成</Button>
        </div>
        <div className="vault-strength" data-score={password ? strength.score : undefined} aria-live="polite">
          <span className="vault-strength-bar" aria-hidden="true"><i /><i /><i /></span>
          <span className="input-hint">{password ? `${strength.label} · ${password.length} 位` : '可手动输入，或点击「生成」'}</span>
        </div>
      </div>
      <div className="vault-generator" aria-label="密码生成选项">
        <label className="vault-length">长度
          <input className="input num" type="number" min={4} max={64} value={length}
            onChange={event => setLength(Math.max(4, Math.min(64, event.target.valueAsNumber || 16)))} />
        </label>
        {CHARSET_LABELS.map(item => <label key={item.key} className="vault-checkbox">
          <input type="checkbox" checked={charsets[item.key]} onChange={event => setCharsets(current => ({ ...current, [item.key]: event.target.checked }))} />{item.label}
        </label>)}
      </div>
      <label className="vault-checkbox"><input name="autoFill" type="checkbox" defaultChecked={entry?.autoFill} />此网站只有一个已存账号时自动填充</label>
      <div className="actions"><Button type="button" onClick={onClose}>取消</Button><Button type="submit" variant="primary" loading={busy}>保存</Button></div>
    </form>
  </Dialog>
}
