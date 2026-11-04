import { useEffect, useState } from 'react'
import { useTheme, type Theme } from '../../stores/theme'
import { Select } from '../../components/ui/Select'
export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [path, setPath] = useState('正在读取…')
  const [version, setVersion] = useState('')
  useEffect(() => { void window.api.app.getPaths().then(paths => setPath(paths.database)).catch(() => setPath('无法读取数据目录')); void window.api.app.getVersion().then(setVersion).catch(() => window.toast.error('无法读取版本')) }, [])
  return <div className="page settings-page"><h1>设置</h1><p className="page-description">工作台的外观与本地信息</p><section className="settings-row"><div><h2>外观</h2><p>选择主题，或跟随系统设置。</p></div><Select aria-label="外观主题" value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></Select></section><section className="settings-row"><div><h2>本地数据库</h2><p className="data-path">{path}</p></div><span className="status-label">仅保存在本机</span></section><section className="settings-row"><h2>WorkBase</h2><span className="muted">{version}</span></section></div>
}
