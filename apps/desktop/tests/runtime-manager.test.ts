import { test, expect } from 'bun:test'
import { RuntimeManager } from '../src/main/runtime-manager.ts'
import { resolve } from 'path'

const runtimePath = resolve(
  import.meta.dir,
  '../../../packages/runtime/src/interfaces/stdio-server.ts',
)

test('RuntimeManager 能启动 runtime 并收到 ready 事件', async () => {
  const manager = new RuntimeManager()

  const readyEvent = await new Promise<RuntimeManager['onReady']>(
    (resolvePromise, reject) => {
      const unsubscribe = manager.onReady((event) => {
        unsubscribe()
        manager.stop()
        resolvePromise(event as unknown as RuntimeManager['onReady'])
      })

      manager.start(runtimePath)

      setTimeout(() => {
        manager.stop()
        reject(new Error('timeout'))
      }, 5000)
    },
  )

  expect(readyEvent).toBeDefined()
})
