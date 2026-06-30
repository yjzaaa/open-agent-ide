/** Runtime 协议版本 */
export const RUNTIME_PROTOCOL_VERSION = '1.0'

/** Runtime 能力枚举 */
export type RuntimeCapability =
  | 'bash'
  | 'powershell'
  | 'mcp'
  | 'anthropic'
  | 'openai'
  | 'bedrock'
  | 'vertex'
  | 'foundry'

/** runtime.ready 事件 */
export interface RuntimeReadyEvent {
  version: string
  type: 'runtime.ready'
  capabilities: RuntimeCapability[]
}

/** runtime 请求方法 */
export type RuntimeMethod = 'agent.run' | 'agent.stop'

/** runtime 请求 */
export interface RuntimeRequest<T = unknown> {
  version: string
  id: string
  method: RuntimeMethod
  params: T
}

/** 通用事件基础 */
export interface RuntimeEventBase {
  version: string
  id?: string
  type: string
}

/** 文本增量事件 */
export interface TextDeltaEvent extends RuntimeEventBase {
  type: 'text_delta'
  content: string
}

/** 工具开始事件 */
export interface ToolStartEvent extends RuntimeEventBase {
  type: 'tool_start'
  tool: string
  input: unknown
}

/** 工具结果事件 */
export interface ToolResultEvent extends RuntimeEventBase {
  type: 'tool_result'
  tool: string
  output: unknown
  success: boolean
}

/** 完成事件 */
export interface DoneEvent extends RuntimeEventBase {
  type: 'done'
}

/** 错误事件 */
export interface RuntimeErrorEvent extends RuntimeEventBase {
  type: 'error'
  code: string
  message: string
}

/** 所有 runtime 事件联合类型 */
export type RuntimeEvent =
  | RuntimeReadyEvent
  | TextDeltaEvent
  | ToolStartEvent
  | ToolResultEvent
  | DoneEvent
  | RuntimeErrorEvent
