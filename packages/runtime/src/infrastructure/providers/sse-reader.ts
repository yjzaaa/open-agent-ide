/**
 * 通用 SSE 流读取器
 *
 * 参考 Proma 的 sse-reader.ts，但简化为只返回原始 SSE 行。
 */

export interface SSEReaderOptions {
  url: string
  headers: Record<string, string>
  body: string
  signal?: AbortSignal
}

export interface SSELine {
  event?: string
  data: string
}

/**
 * 读取 SSE 流
 *
 * @param options - 请求选项
 * @returns 异步生成器，产出 SSE 行
 */
export async function* readSSE(options: SSEReaderOptions): AsyncGenerator<SSELine, void, unknown> {
  const response = await fetch(options.url, {
    method: 'POST',
    headers: options.headers,
    body: options.body,
    signal: options.signal,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('响应没有 body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent: string | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        yield {
          event: currentEvent,
          data: line.slice(5).trim(),
        }
      } else if (line.trim() === '') {
        currentEvent = undefined
      }
    }
  }

  // 处理剩余 buffer
  if (buffer.trim()) {
    if (buffer.startsWith('data:')) {
      yield {
        data: buffer.slice(5).trim(),
      }
    }
  }
}
