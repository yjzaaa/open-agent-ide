import { test, expect } from 'bun:test'
import { RUNTIME_PROTOCOL_VERSION, type RuntimeReadyEvent } from '../src/runtime.ts'

test('RUNTIME_PROTOCOL_VERSION 为 1.0', () => {
  expect(RUNTIME_PROTOCOL_VERSION).toBe('1.0')
})

test('RuntimeReadyEvent 类型符合协议', () => {
  const event: RuntimeReadyEvent = {
    version: '1.0',
    type: 'runtime.ready',
    capabilities: ['bash', 'anthropic'],
  }
  expect(event.type).toBe('runtime.ready')
  expect(event.capabilities).toContain('bash')
})
