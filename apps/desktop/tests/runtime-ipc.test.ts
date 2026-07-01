import { test, expect } from 'bun:test'
import { RUNTIME_IPC_CHANNELS } from '../src/main/ipc/runtime-ipc-channels.ts'

test('RUNTIME_IPC_CHANNELS 包含预期通道', () => {
  expect(RUNTIME_IPC_CHANNELS.SEND_REQUEST).toBe('runtime:send-request')
  expect(RUNTIME_IPC_CHANNELS.SUBSCRIBE_EVENTS).toBe('runtime:subscribe-events')
  expect(RUNTIME_IPC_CHANNELS.EVENT).toBe('runtime:event')
})
