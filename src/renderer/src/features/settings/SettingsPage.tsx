import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, Cpu, Database, Download, FolderOpen, HardDrive, Keyboard, Palette, RefreshCw, Sparkles, X
} from 'lucide-react'
import type { AIConfig, BackupResult, StorageInfo, WallpaperScope } from '@shared/types'
import { ACCENTS, useTheme, type Accent, type Theme, type WorkspaceStyle } from '../../stores/theme'
import { useShortcuts } from '../../stores/shortcuts'
import { useNavigation } from '../../stores/navigation'
import { registry } from '../../modules/registry'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { PageHeader } from '../../components/ui/PageHeader'
import { WallpaperSettings } from './WallpaperSettings'
import { humanError } from '../../lib/utils'
import './settings.css'

const THEMES: { id: Theme; label: string }[] = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'system', label: '跟随系统' }
]

const WORKSPACE_STYLES: { id: WorkspaceStyle; label: string }[] = [
  { id: 'standard', label: '标准' },
  { id: 'paper', label: '纸面工作台' },
  { id: 'neumorphism', label: '拟态' },
  { id: 'apple', label: '苹果' }
]

const ACCENT_OPTIONS: { id: Accent; label: string }[] = [
  { id: 'default', label: '风格默认' },
  ...ACCENTS.map(item => ({ id: item.id as Accent, label: item.name }))
]

type TabId = 'ai' | 'appearance' | 'data' | 'about'

const TABS: { id: TabId; label: string; icon: typeof Cpu }[] = [
  { id: 'ai', label: 'AI 接口', icon: Sparkles },
  { id: 'appearance', label: '外观', icon: Palette },
  { id: 'data', label: '数据与备份', icon: Database },
  { id: 'about', label: '关于与快捷键', icon: Keyboard }
]

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

interface ShortcutItem { id: string; label: string; fallback: string }

const COMMAND_SHORTCUT: ShortcutItem = { id: 'command', label: '快速跳转', fallback: 'f' }

/** 快捷键只读行：展示当前生效的组合键，不再提供修改入口。 */
function ShortcutRow({ item, value }: { item: ShortcutItem; value: string }) {
  return <div>
    <dt>{item.label}</dt>
    <dd><span className="kbd-group"><kbd>Ctrl</kbd><kbd>{value.toUpperCase()}</kbd></span></dd>
  </div>
}

export function SettingsPage() {
  const closePage = useNavigation(state => state.closePage)
  const theme = useTheme(state => state.theme)
  const setTheme = useTheme(state => state.setTheme)
  const workspaceStyle = useTheme(state => state.workspaceStyle)
  const setWorkspaceStyle = useTheme(state => state.setWorkspaceStyle)
  const accent = useTheme(state => state.accent)
  const setAccent = useTheme(state => state.setAccent)
  const [tab, setTab] = useState<TabId>('ai')
  const [wallpaperTab, setWallpaperTab] = useState<WallpaperScope>('workspace')
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [apiKey, setApiKey] = useState('')
  const [removeKey, setRemoveKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [aiTestError, setAiTestError] = useState('')
  const [moving, setMoving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [backup, setBackup] = useState<BackupResult | null>(null)
  const [version, setVersion] = useState('')
  const [migrateTarget, setMigrateTarget] = useState<'choose' | 'default' | null>(null)
  const [loginItem, setLoginItemState] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const shortcutsMap = useShortcuts(state => state.map)

  const commandItem = COMMAND_SHORTCUT
  const moduleShortcutItems = useMemo<ShortcutItem[]>(() => registry
    .filter(item => item.shortcutKey && item.path)
    .map(item => ({ id: item.id, label: item.name, fallback: item.shortcutKey as string })), [])

  const aiConfigChanged = !config || baseUrl.trim() !== config.baseUrl || model.trim() !== config.model
    || temperature !== config.temperature || maxTokens !== config.maxTokens || Boolean(apiKey.trim()) || removeKey
  const canTestAi = Boolean(config?.configured && !aiConfigChanged && !saving)
  const aiNeedsSetup = config?.configured === false
  const connectionError = aiConfigChanged ? '' : aiTestError

  const loadStorage = async (): Promise<void> => {
    try { setStorage(await window.api.data.storage()) }
    catch { setStorage(null) }
  }

  useEffect(() => {
    void loadStorage()
    void window.api.app.getVersion().then(setVersion).catch(() => undefined)
    void window.api.app.getLoginItem().then(setLoginItemState).catch(() => undefined)
    void window.api.ai.config().then(value => {
      setConfig(value)
      setBaseUrl(value.baseUrl)
      setModel(value.model)
      setTemperature(value.temperature)
      setMaxTokens(value.maxTokens)
    }).catch(error => window.toast.error(humanError(error)))
  }, [])

  /** 各 tab 共用同一滚动容器，切换后回到顶部，避免沿用上一页的滚动位置。 */
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0
  }, [tab])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const next = await window.api.ai.saveConfig({ baseUrl, model, temperature, maxTokens, apiKey: removeKey ? '' : apiKey.trim() || undefined })
      setConfig(next)
      setAiTestError('')
      setApiKey('')
      setRemoveKey(false)
      window.toast.success('AI 配置已保存')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  const test = async (): Promise<void> => {
    if (!canTestAi || testing) return
    setTesting(true)
    setAiTestError('')
    try {
      const reply = await window.api.ai.test()
      window.toast.success(`连接成功：${reply}`)
    } catch (error) {
      setAiTestError(humanError(error))
    } finally {
      setTesting(false)
    }
  }

  const exportData = async (): Promise<void> => {
    if (exporting) return
    setExporting(true)
    try {
      const result = await window.api.data.export()
      if (result) {
        setBackup(result)
        window.toast.success(`备份完成（${formatBytes(result.size)}）`)
      }
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setExporting(false)
    }
  }

  /** 开机自启由系统登录项承载，保存后读回实际状态（系统拒绝时以返回值为准）。 */
  const setLoginItem = async (enabled: boolean): Promise<void> => {
    setLoginBusy(true)
    try {
      const applied = await window.api.app.setLoginItem(enabled)
      setLoginItemState(applied)
      window.toast.success(applied ? '已开启开机自启' : '已关闭开机自启')
    } catch (error) {
      window.toast.error(humanError(error))
    } finally {
      setLoginBusy(false)
    }
  }

  /** 迁移数据目录：主进程复制数据并改写指针，随后自动重启生效。 */
  const relocate = async (run: () => Promise<string | null>): Promise<void> => {
    setMoving(true)
    try {
      const directory = await run()
      if (!directory) { setMoving(false); return }
      await loadStorage()
      window.toast.success(`数据已复制到 ${directory}，应用即将重启`)
      await window.api.app.relaunch()
    } catch (error) {
      window.toast.error(humanError(error))
      setMoving(false)
    }
  }

  return (
    <div className="page preferences-page">
      <div className="preferences-shell">
        <PageHeader
          title="设置"
          actions={<Button type="button" variant="ghost" className="icon" aria-label="关闭设置" title="关闭设置" onClick={closePage}><X size={18} aria-hidden="true" /></Button>}
        />
        <div className="preferences-layout">
          <nav className="preferences-nav" aria-label="设置导航">
            {TABS.map(item => (
              <button
                type="button"
                key={item.id}
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => setTab(item.id)}
              >
                <item.icon size={16} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="preferences-content" ref={contentRef}>
            {tab === 'ai' && (
              <section className="preferences-section" id="ai">
                <header>
                  <h2>AI 接口</h2>
                  <p className="preferences-section-desc">配置兼容 OpenAI 协议的接口地址、模型与密钥。</p>
                </header>
                <div className="preferences-ai-fields">
                  <div className="field">
                    <label htmlFor="ai-base">接口地址</label>
                    <input id="ai-base" className="input" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.deepseek.com/v1" />
                  </div>
                  <div className="field">
                    <label htmlFor="ai-model">模型</label>
                    <input id="ai-model" className="input" value={model} onChange={event => setModel(event.target.value)} placeholder="deepseek-chat" />
                  </div>
                  <div className="field">
                    <label htmlFor="ai-key">API 密钥 {config?.hasKey && <span className="status-label"><Check size={12} />已保存</span>}</label>
                    <input id="ai-key" className="input" type="password" aria-describedby="ai-key-hint" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={config?.hasKey ? '已配置，留空则不修改' : '按服务要求填写'} autoComplete="off" disabled={removeKey} />
                    <div className="preferences-key-info">
                      <p className="input-hint" id="ai-key-hint">密钥由 Windows 加密并保存在本机。</p>
                      {config?.hasKey && <label className="row"><input type="checkbox" checked={removeKey} onChange={event => setRemoveKey(event.target.checked)} />保存时移除已存密钥</label>}
                    </div>
                  </div>
                </div>
                <div className="preferences-group">
                  <h3>生成参数</h3>
                  <div className="preferences-ai-options">
                    <div className="field">
                      <label htmlFor="ai-temp">温度</label>
                      <div className="preferences-number-field">
                        <input id="ai-temp" className="input num" type="number" aria-describedby="ai-temp-hint" min={0} max={2} step={0.1} value={temperature} onChange={event => setTemperature(Number(event.target.value))} />
                        <span aria-hidden="true">0–2</span>
                      </div>
                      <p className="input-hint" id="ai-temp-hint">0 稳定 · 2 发散</p>
                    </div>
                    <div className="field">
                      <label htmlFor="ai-max-tokens">最大输出 <span className="sr-only">（token）</span></label>
                      <div className="preferences-number-field">
                        <input id="ai-max-tokens" className="input num" type="number" inputMode="numeric" min={1} max={131072} step={1} value={maxTokens} onChange={event => setMaxTokens(Number(event.target.value))} />
                        <span aria-hidden="true">token</span>
                      </div>
                    </div>
                  </div>
                </div>
                {aiNeedsSetup && <div className="empty-state-region preferences-ai-status" id="ai-test-hint" role="status">
                  <strong>尚未配置 AI 接口</strong>
                  <p className="input-hint">保存接口地址和模型后即可测试连接。</p>
                </div>}
                {connectionError && <div className="empty-state-region preferences-ai-status" role="alert">
                  <strong>AI 接口连接失败</strong>
                  <p className="input-hint">{connectionError}</p>
                </div>}
                <div className="preferences-group preferences-ai-footer">
                  {!canTestAi && !aiNeedsSetup && <p className="input-hint" id="ai-test-hint">保存接口地址和模型后即可测试连接。</p>}
                  <div className="row preferences-actions">
                    <Button loading={testing} disabled={!canTestAi} aria-describedby={!canTestAi ? 'ai-test-hint' : undefined} onClick={() => void test()}><Cpu size={14} aria-hidden="true" />测试连接</Button>
                    <Button variant="primary" loading={saving} disabled={testing} onClick={() => void save()}>保存配置</Button>
                  </div>
                </div>
              </section>
            )}

            {tab === 'appearance' && (
              <section className="preferences-section" id="appearance">
                <header>
                  <h2>外观</h2>
                  <p className="preferences-section-desc">设置主题、界面风格和壁纸。</p>
                </header>
                <h3 className="preferences-group-title" id="preferences-theme">主题</h3>
                <div className="preferences-themes" role="group" aria-labelledby="preferences-theme">
                  {THEMES.map(item => (
                    <button type="button" key={item.id} aria-pressed={theme === item.id} onClick={() => setTheme(item.id)}>
                      <span>{item.label}</span>
                      <Check size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <div className="preferences-group">
                  <h3 id="preferences-workspace-style">界面风格</h3>
                  <div className="preferences-themes preferences-workspace-styles" role="group"
                    aria-labelledby="preferences-workspace-style" aria-describedby="preferences-workspace-style-hint">
                    {WORKSPACE_STYLES.map(item => (
                      <button type="button" key={item.id} data-style={item.id} aria-pressed={workspaceStyle === item.id} onClick={() => setWorkspaceStyle(item.id)}>
                        <span>{item.label}</span>
                        <Check size={14} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <p className="preferences-section-desc" id="preferences-workspace-style-hint">四种界面风格均作用于全部界面；纸面风格的横线、胶带等装饰仅出现在首页、笔记和待办。</p>
                </div>
                <div className="preferences-group">
                  <h3 id="preferences-accent">主题色</h3>
                  <div className="preferences-themes preferences-accents" role="group"
                    aria-labelledby="preferences-accent" aria-describedby="preferences-accent-hint">
                    {ACCENT_OPTIONS.map(item => (
                      <button type="button" key={item.id} data-accent={item.id}
                        aria-pressed={accent === item.id} onClick={() => setAccent(item.id)}>
                        <span className="accent-swatch" data-accent={item.id} aria-hidden="true" />
                        <span>{item.label}</span>
                        <Check size={14} aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  <p className="preferences-section-desc" id="preferences-accent-hint">主题色替换侧栏选中、主按钮等强调色，浅深色与四种界面风格都会跟随；「风格默认」恢复当前界面风格自带的颜色。</p>
                </div>
                <div className="preferences-wallpaper-tabs" role="group" aria-label="壁纸类型">
                  <button type="button" aria-pressed={wallpaperTab === 'workspace'} onClick={() => setWallpaperTab('workspace')}>工作台壁纸</button>
                  <button type="button" aria-pressed={wallpaperTab === 'immersive'} onClick={() => setWallpaperTab('immersive')}>沉浸背景</button>
                </div>
                <WallpaperSettings key={wallpaperTab} scope={wallpaperTab} />
              </section>
            )}

            {tab === 'data' && (
              <section className="preferences-section" id="data">
                <header>
                  <h2>数据与备份</h2>
                  <p className="preferences-section-desc">查看数据存放位置，迁移目录或导出备份。</p>
                </header>
                <div className="field">
                  <h3>数据目录</h3>
                  <p className="preferences-path">{storage?.directory ?? '正在读取…'}</p>
                  <p className="input-hint">
                    {storage && !storage.isDefault
                      ? `自定义位置，默认位置为 ${storage.defaultDirectory}`
                      : '默认位置（应用数据目录下）'}
                  </p>
                </div>
                <div className="row preferences-actions">
                  <Button disabled={moving} onClick={() => void window.api.data.reveal()}><FolderOpen size={13} />打开数据目录</Button>
                </div>
                <div className="preferences-group preferences-migrate">
                  <h3>迁移目录</h3>
                  <p className="input-hint">更改位置会复制现有数据，保留原目录，并自动重启应用。</p>
                  <div className="row preferences-actions">
                    <Button loading={moving} onClick={() => setMigrateTarget('choose')}>
                      <HardDrive size={13} />更改保存位置
                    </Button>
                    {storage && !storage.isDefault && (
                      <Button loading={moving} onClick={() => setMigrateTarget('default')}>
                        <RefreshCw size={13} />用回默认位置
                      </Button>
                    )}
                  </div>
                </div>
                <div className="preferences-group preferences-backup">
                  <h3>备份</h3>
                  <Button loading={exporting} onClick={() => void exportData()}><Download size={13} />导出备份</Button>
                </div>
                {backup && <p className="preferences-path" role="status">备份完成 · {formatBytes(backup.size)}<br />{backup.path}</p>}
              </section>
            )}

            {tab === 'about' && (
              <section className="preferences-section" id="about">
                <header>
                  <h2>关于与快捷键</h2>
                  <p className="preferences-section-desc">应用版本、全局快捷键与数据位置。</p>
                </header>
                <div className="preferences-group preferences-login-item">
                  <h3>应用行为</h3>
                  <label className="row preferences-login-row">
                    <input type="checkbox" checked={loginItem} disabled={loginBusy}
                      onChange={event => void setLoginItem(event.target.checked)} />
                    开机自动启动 WorkBase
                  </label>
                </div>
                <dl className="preferences-shortcuts">
                  {[commandItem, ...moduleShortcutItems].map(item => (
                    <ShortcutRow key={item.id} item={item}
                      value={shortcutsMap[item.id] ?? item.fallback} />
                  ))}
                  <div><dt>首页 / 常用功能</dt><dd><span className="kbd-group"><kbd>Ctrl</kbd><kbd>1</kbd>–<kbd>9</kbd></span></dd></div>
                  <div><dt>智能助手</dt><dd><span className="kbd-group"><kbd>Ctrl</kbd><kbd>0</kbd></span></dd></div>
                  <div><dt>保存笔记</dt><dd><span className="kbd-group"><kbd>Ctrl</kbd><kbd>S</kbd></span></dd></div>
                  <div><dt>关闭浮层</dt><dd><span className="kbd-group"><kbd>Esc</kbd></span></dd></div>
                </dl>
                <p className="input-hint">Ctrl + 1–9 / 0 按常用顺序跳转，Ctrl + S 与 Esc 保持固定。</p>
                <div className="preferences-group">
                  <h3>应用信息</h3>
                  <dl className="preferences-app-info">
                    <div><dt>版本</dt><dd>WorkBase v{version || '—'}</dd></div>
                    <div><dt>数据目录</dt><dd className="preferences-path">{storage?.directory ?? '正在读取数据目录…'}</dd></div>
                  </dl>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={migrateTarget !== null}
        title="迁移数据目录"
        description="将复制现有数据到新位置，保留原目录，完成后自动重启应用。"
        confirmLabel="迁移并重启"
        loading={moving}
        onClose={() => setMigrateTarget(null)}
        onConfirm={() => {
          const target = migrateTarget
          setMigrateTarget(null)
          void relocate(target === 'choose' ? () => window.api.data.chooseDirectory() : () => window.api.data.relocateDefault())
        }}
      />
    </div>
  )
}
