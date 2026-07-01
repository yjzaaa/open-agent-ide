import type { ProviderAdapter } from './ProviderConfig.ts'

/**
 * Provider 注册表
 *
 * 管理所有 Provider 适配器，按 providerId 查找。
 */
export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>()

  /**
   * 注册 Provider 适配器
   */
  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.providerId, adapter)
  }

  /**
   * 获取 Provider 适配器
   */
  get(providerId: string): ProviderAdapter {
    const adapter = this.adapters.get(providerId)
    if (!adapter) {
      throw new Error(`未找到 Provider 适配器: ${providerId}`)
    }
    return adapter
  }

  /**
   * 获取所有已注册的 providerId
   */
  list(): string[] {
    return Array.from(this.adapters.keys())
  }
}
