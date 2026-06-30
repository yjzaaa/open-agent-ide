#!/usr/bin/env bun
/**
 * Runtime stdio 入口
 *
 * 启动后先输出 runtime.ready，然后监听 stdin 上的请求。
 * 本阶段只实现 ready 握手，不处理实际请求。
 */

import { createRuntimeReadyEvent } from '../domain/event.ts'
import { serializeEvent } from '../application/event-streamer.ts'

/**
 * 启动 stdio server
 */
export function startStdioServer(): void {
  const readyEvent = createRuntimeReadyEvent([
    'bash',
    'powershell',
    'mcp',
    'anthropic',
    'openai',
  ])

  process.stdout.write(serializeEvent(readyEvent))

  // 本阶段不处理请求，只保持进程运行
  process.stdin.on('data', (chunk: Buffer) => {
    // 忽略输入
    void chunk
  })
}

// 如果是直接运行此文件，则启动 server
if (import.meta.main) {
  startStdioServer()
}
