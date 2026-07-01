import { test, expect } from 'bun:test'
import { RuntimeManager } from '../src/main/runtime-manager.ts'
import { resolve } from 'path'
import type { RuntimeEvent, RuntimeReadyEvent } from '@open-agent-ide/shared'

const runtimePath = resolve(
  import.meta.dir,
  '../../../packages/runtime/src/interfaces/stdio-server.ts',
)

function waitForReady(runtime: RuntimeManager): Promise<RuntimeReadyEvent> {
  return new Promise((resolvePromise, reject) => {
    const unsubscribe = runtime.onReady((event) => {
      unsubscribe()
      resolvePromise(event)
    })

    setTimeout(() => {
      unsubscribe()
      reject(new Error('等待 runtime.ready 超时'))
    }, 5000)
  })
}

function waitForEvent(
  runtime: RuntimeManager,
  predicate: (event: RuntimeEvent) => boolean,
): Promise<RuntimeEvent> {
  return new Promise((resolvePromise, reject) => {
    const unsubscribe = runtime.onEvent((event) => {
      if (predicate(event)) {
        unsubscribe()
        resolvePromise(event)
      }
    })

    setTimeout(() => {
      unsubscribe()
      reject(new Error('等待指定事件超时'))
    }, 5000)
  })
}

test('RuntimeManager 能启动 runtime 并收到 ready 事件', async () => {
  const manager = new RuntimeManager()

  try {
    manager.start(runtimePath)
    const event = await waitForReady(manager)

    expect(event.type).toBe('runtime.ready')
    expect(event.capabilities).toContain('bash')
  } finally {
    manager.stop()
  }
})

test('RuntimeManager 发送 agent.run 请求后子进程返回错误事件', async () => {
  const manager = new RuntimeManager()

  try {
    manager.start(runtimePath)
    await waitForReady(manager)

    manager.sendRequest({
      version: '1.0',
      id: 'test-req-1',
      method: 'agent.run',
      params: {
        id: 'test-run-1',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        model: 'test-model',
        providerId: 'unknown-provider',
        apiKey: 'test-key',
      },
    })

    const errorEvent = await waitForEvent(
      manager,
      (event) =>
        event.type === 'error' &&
        'code' in event &&
        event.code === 'AGENT_RUN_FAILED',
    )

    expect(errorEvent.type).toBe('error')
  } finally {
    manager.stop()
  }
})

test('RuntimeManager 未启动时 sendRequest 抛出错误', () => {
  const manager = new RuntimeManager()

  expect(() => {
    manager.sendRequest({
      version: '1.0',
      id: 'test-req-2',
      method: 'agent.run',
      params: {
        id: 'test-run-2',
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        providerId: 'unknown-provider',
        apiKey: 'test-key',
      },
    })
  }).toThrow('Runtime 未启动')
})
