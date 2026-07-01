import { ChatView } from './components/ChatView.tsx'

/**
 * 应用根组件
 */
export function App(): JSX.Element {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-800">Open Agent IDE</h1>
      </header>
      <main className="flex-1 overflow-hidden">
        <ChatView />
      </main>
    </div>
  )
}
