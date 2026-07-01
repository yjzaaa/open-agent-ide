import { useAtom, useSetAtom } from 'jotai'
import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useRuntime } from '../hooks/useRuntime.ts'
import {
  inputTextAtom,
  sendAgentRunAtom,
  clearEventsAtom,
} from '../atoms/runtime-atoms.ts'
import { MessageList } from './MessageList.tsx'
import { ChatInput } from './ChatInput.tsx'

/**
 * Chat 视图组件
 */
export function ChatView(): JSX.Element {
  const { ready, events, isRunning, clearEvents } = useRuntime()
  const [inputText, setInputText] = useAtom(inputTextAtom)
  const sendAgentRun = useSetAtom(sendAgentRunAtom)
  const handleClear = useSetAtom(clearEventsAtom)

  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || !ready) {
      return
    }

    sendAgentRun({
      id: uuidv4(),
      messages: [{ role: 'user', content: text }],
      tools: ['BashTool', 'ReadTool'],
      model: 'claude-sonnet-4-6',
      providerId: 'anthropic',
      apiKey: '',
      permissionMode: 'ask',
    })

    setInputText('')
  }, [inputText, ready, sendAgentRun, setInputText])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="text-sm text-slate-600">
          {ready ? (
            <span className="text-green-600">● Runtime 已就绪</span>
          ) : (
            <span className="text-amber-600">● Runtime 连接中...</span>
          )}
        </div>
        <button
          type="button"
          onClick={clearEvents}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          清空
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <MessageList events={events} />
      </div>

      <ChatInput
        value={inputText}
        onChange={setInputText}
        onSend={handleSend}
        disabled={isRunning}
        ready={ready}
      />
    </div>
  )
}
