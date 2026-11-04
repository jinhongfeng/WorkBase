import { AppShell } from './components/layout/AppShell'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
export function App() { return <ErrorBoundary><AppShell/></ErrorBoundary> }
