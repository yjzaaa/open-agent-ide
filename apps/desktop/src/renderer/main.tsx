import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import { App } from './App.tsx'
import './index.css'

/**
 * 渲染进程入口
 */
const root = createRoot(document.getElementById('root') as HTMLElement)

root.render(
  <StrictMode>
    <JotaiProvider>
      <App />
    </JotaiProvider>
  </StrictMode>,
)
