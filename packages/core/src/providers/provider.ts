/**
 * Provider 消息角色
 */
export type ProviderMessageRole = 'user' | 'assistant' | 'system'

/**
 * Provider 消息
 */
export interface ProviderMessage {
  role: ProviderMessageRole
  content: string
}

/**
 * Provider 配置
 */
export interface ProviderConfig {
  providerId: string
  model: string
  apiKey?: string
  baseUrl?: string
}

/**
 * Provider 适配器接口
 *
 * 所有模型 Provider 必须实现此接口。
 */
export interface ProviderAdapter {
  readonly providerId: string

  /**
   * 发送消息并返回异步生成器
   *
   * @param messages - 消息列表
   * @param config - Provider 配置
   * @returns 文本增量流
   */
  sendMessage(
    messages: ProviderMessage[],
    config: ProviderConfig,
  ): AsyncGenerator<string, void, unknown>
}
