import { test, expect } from 'bun:test'
import { spawn } from 'child_process'
import { resolve } from 'path'

const runtimePath = resolve(
  import.meta.dir,
  '../src/interfaces/stdio-server.ts',
)

test('stdio server 启动后输出 runtime.ready', async () => {
  const child = spawn('bun', [runtimePath], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const output = await new Promise<string>((resolve, reject) => {
    let buffer = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      if (buffer.includes('\n')) {
        resolve(buffer)
        child.kill()
      }
    })
    child.on('error', reject)
    setTimeout(() => {
      child.kill()
      reject(new Error('timeout'))
    }, 5000)
  })

  const event = JSON.parse(output.trim())
  expect(event.type).toBe('runtime.ready')
  expect(event.version).toBe('1.0')
  expect(event.capabilities).toContain('bash')
})
