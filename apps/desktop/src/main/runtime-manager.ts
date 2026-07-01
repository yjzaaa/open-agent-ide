import { spawn, type ChildProcess } from 'child_process'
import { resolve } from 'path'
import type { RuntimeReadyEvent, RuntimeEvent, RuntimeRequest } from '@open-agent-ide/shared'

/**
 * Runtime 管理器
 *
 * 负责启动、停止 Bun Agent Runtime 子进程，并通过 stdio 与其通信。
 */
export class RuntimeManager {
  private child: ChildProcess | null = null
  private buffer = ''
  private readyListeners: Array<(event: RuntimeReadyEvent) => void> = []
  private eventListeners: Array<(event: RuntimeEvent) => void> = []

  /**
   * 启动 runtime 子进程
   */
  start(runtimeEntryPath: string): void {
    if (this.child) {
      throw new Error('Runtime 已经启动')
    }

    this.child = spawn('bun', [runtimeEntryPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      this.flushBuffer()
    })

    this.child.on('exit', (code) => {
      console.log(`Runtime 进程退出，退出码: ${code}`)
      this.child = null
    })
  }

  /**
   * 发送 NDJSON 请求到 runtime 子进程
   */
  sendRequest(request: RuntimeRequest): void {
    if (!this.child || !this.child.stdin) {
      throw new Error('Runtime 未启动')
    }

    this.child.stdin.write(JSON.stringify(request) + '\n')
  }

  /**
   * 停止 runtime 子进程
   */
  stop(): void {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  }

  /**
   * 注册 ready 事件监听器
   */
  onReady(listener: (event: RuntimeReadyEvent) => void): () => void {
    this.readyListeners.push(listener)
    return () => {
      this.readyListeners = this.readyListeners.filter((l) => l !== listener)
    }
  }

  /**
   * 注册通用事件监听器
   */
  onEvent(listener: (event: RuntimeEvent) => void): () => void {
    this.eventListeners.push(listener)
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener)
    }
  }

  private flushBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as RuntimeEvent
      this.eventListeners.forEach((l) => l(event))

      if (event.type === 'runtime.ready') {
        this.readyListeners.forEach((l) => l(event as RuntimeReadyEvent))
      }
    }
  }
}
