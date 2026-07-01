import { Send } from 'lucide-react'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  ready?: boolean
}

/**
 * 聊天输入组件
 */
export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  ready = false,
}: ChatInputProps): JSX.Element {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSend()
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-end gap-2">
        <textarea
          className="max-h-40 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          rows={2}
          placeholder={ready ? '输入消息...' : '等待 runtime 就绪...'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || !ready}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !ready || !value.trim()}
          className="flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
