/**
 * Provider 配置值对象
 */
export interface ProviderConfig {
  providerId: string
  model: string
  apiKey: string
  baseUrl?: string
}

/**
 * Provider 消息
 */
export interface ProviderMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Provider 流事件类型
 */
export type ProviderStreamEventType =
  | 'text_delta'
  | 'thinking_delta'
  | 'tool_use_start'
  | 'tool_use_delta'
  | 'tool_use_done'
  | 'done'

/**
 * Provider 流事件基础
 */
export interface ProviderStreamEventBase {
  type: ProviderStreamEventType
}

/**
 * 文本增量事件
 */
export interface ProviderTextDeltaEvent extends ProviderStreamEventBase {
  type: 'text_delta'
  content: string
}

/**
 * 思考增量事件
 */
export interface ProviderThinkingDeltaEvent extends ProviderStreamEventBase {
  type: 'thinking_delta'
  content: string
}

/**
 * 工具使用开始事件
 */
export interface ProviderToolUseStartEvent extends ProviderStreamEventBase {
  type: 'tool_use_start'
  toolName: string
  toolInput: unknown
}

/**
 * 工具使用增量事件（流式 JSON）
 */
export interface ProviderToolUseDeltaEvent extends ProviderStreamEventBase {
  type: 'tool_use_delta'
  toolName: string
  partialInput: string
}

/**
 * 工具使用完成事件
 */
export interface ProviderToolUseDoneEvent extends ProviderStreamEventBase {
  type: 'tool_use_done'
  toolName: string
  toolInput: unknown
}

/**
 * 完成事件
 */
export interface ProviderDoneEvent extends ProviderStreamEventBase {
  type: 'done'
}

/**
 * Provider 流事件联合类型
 */
export type ProviderStreamEvent =
  | ProviderTextDeltaEvent
  | ProviderThinkingDeltaEvent
  | ProviderToolUseStartEvent
  | ProviderToolUseDeltaEvent
  | ProviderToolUseDoneEvent
  | ProviderDoneEvent

/**
 * Provider 适配器接口
 */
export interface ProviderAdapter {
  readonly providerId: string

  /**
   * 流式调用模型
   *
   * @param messages - 消息列表
   * @param config - Provider 配置
   * @param tools - 工具定义列表（可选）
   * @returns 异步生成器，产出流事件
   */
  stream(
    messages: ProviderMessage[],
    config: ProviderConfig,
    tools?: Array<{ name: string; description: string; inputSchema: unknown }>,
  ): AsyncGenerator<ProviderStreamEvent, void, unknown>
}
