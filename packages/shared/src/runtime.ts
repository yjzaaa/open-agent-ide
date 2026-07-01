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
export type RuntimeMethod = 'agent.run' | 'agent.stop' | 'permission.respond'

/** runtime 请求 */
export interface RuntimeRequest<T = unknown> {
  version: string
  id: string
  method: RuntimeMethod
  params: T
}

/** 权限模式 */
export type PermissionMode = 'safe' | 'ask' | 'allow-all'

/** Agent 运行请求参数 */
export interface AgentRunParams {
  id: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  tools?: string[]
  model: string
  providerId: string
  workspace?: string
  permissionMode?: PermissionMode
  apiKey: string
  baseUrl?: string
}

/** 权限响应参数 */
export interface PermissionRespondParams {
  requestId: string
  decision: 'allow' | 'deny'
  duration?: 'once' | 'session' | 'always'
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

/** 思考增量事件 */
export interface ThinkingDeltaEvent extends RuntimeEventBase {
  type: 'thinking_delta'
  content: string
}

/** 权限请求事件 */
export interface PermissionRequestEvent extends RuntimeEventBase {
  type: 'permission_request'
  requestId: string
  tool: string
  input: unknown
}

/** 权限结果事件 */
export interface PermissionResultEvent extends RuntimeEventBase {
  type: 'permission_result'
  requestId: string
  decision: 'allow' | 'deny'
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
  | ThinkingDeltaEvent
  | ToolStartEvent
  | ToolResultEvent
  | PermissionRequestEvent
  | PermissionResultEvent
  | DoneEvent
  | RuntimeErrorEvent
