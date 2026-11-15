import { Component, type ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import { EmptyState } from './EmptyState'
import { Button } from './Button'
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="error-fallback"><EmptyState icon={CircleAlert} title="页面暂时无法显示" description="本地数据仍保留，可以重新加载应用。"><Button onClick={() => location.reload()}>重新加载</Button></EmptyState></div>
      : this.props.children
  }
}
