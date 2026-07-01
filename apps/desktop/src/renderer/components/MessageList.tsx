import type { RuntimeEvent } from '@open-agent-ide/shared'

interface MessageListProps {
  events: RuntimeEvent[]
}

/**
 * 渲染单条事件为可读文本
 */
function renderEvent(event: RuntimeEvent): { type: string; content: string } {
  switch (event.type) {
    case 'text_delta':
      return { type: '文本', content: event.content }
    case 'thinking_delta':
      return { type: '思考', content: event.content }
    case 'tool_start':
      return {
        type: '工具开始',
        content: `${event.tool}: ${JSON.stringify(event.input)}`,
      }
    case 'tool_result':
      return {
        type: event.success ? '工具结果' : '工具失败',
        content: String(event.output),
      }
    case 'permission_request':
      return {
        type: '权限请求',
        content: `${event.tool} (${event.requestId})`,
      }
    case 'permission_result':
      return {
        type: '权限结果',
        content: `${event.decision === 'allow' ? '允许' : '拒绝'} (${event.requestId})`,
      }
    case 'done':
      return { type: '完成', content: 'Agent 执行完成' }
    case 'error':
      return { type: '错误', content: `${event.code}: ${event.message}` }
    case 'runtime.ready':
      return { type: '就绪', content: `capabilities: ${event.capabilities.join(', ')}` }
    default:
      return { type: '未知', content: JSON.stringify(event) }
  }
}

/**
 * 消息列表组件
 */
export function MessageList({ events }: MessageListProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3 p-4">
      {events.length === 0 && (
        <div className="text-center text-sm text-slate-400">暂无消息</div>
      )}
      {events.map((event, index) => {
        const { type, content } = renderEvent(event)
        return (
          <div
            key={index}
            className="rounded-lg bg-white p-3 shadow-sm"
          >
            <div className="mb-1 text-xs font-medium text-slate-500">{type}</div>
            <div className="whitespace-pre-wrap text-sm text-slate-800">{content}</div>
          </div>
        )
      })}
    </div>
  )
}
