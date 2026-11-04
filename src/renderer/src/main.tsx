import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initializeTheme } from './stores/theme'
import { initializeToast } from './components/ui/Toast'
import './index.css'
initializeTheme()
initializeToast()
createRoot(document.getElementById('root')!).render(<App/>)
