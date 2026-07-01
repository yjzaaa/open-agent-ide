import { test, expect } from 'bun:test'
import { ProviderRegistry } from '../src/application/provider/ProviderRegistry.ts'
import type { ProviderAdapter, ProviderConfig, ProviderMessage, ProviderStreamEvent } from '../src/application/provider/ProviderConfig.ts'

test('ProviderRegistry 能注册和获取适配器', () => {
  const registry = new ProviderRegistry()
  const adapter: ProviderAdapter = {
    providerId: 'mock',
    async *stream() {
      yield { type: 'done' }
    },
  }

  registry.register(adapter)
  expect(registry.list()).toContain('mock')
  expect(registry.get('mock')).toBe(adapter)
})

test('ProviderRegistry 获取不存在的适配器会抛出错误', () => {
  const registry = new ProviderRegistry()
  expect(() => registry.get('unknown')).toThrow('未找到 Provider 适配器')
})
