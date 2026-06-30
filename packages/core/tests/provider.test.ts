import { test, expect } from 'bun:test'
import type { ProviderAdapter, ProviderMessage } from '../src/providers/provider.ts'

test('ProviderMessage 类型约束正确', () => {
  const message: ProviderMessage = {
    role: 'user',
    content: 'hello',
  }
  expect(message.role).toBe('user')
})

test('ProviderAdapter 可被实现', () => {
  const adapter: ProviderAdapter = {
    providerId: 'mock',
    async *sendMessage() {
      yield 'hello'
    },
  }
  expect(adapter.providerId).toBe('mock')
})
