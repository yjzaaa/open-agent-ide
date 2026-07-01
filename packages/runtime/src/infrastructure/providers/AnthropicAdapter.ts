import type {
  ProviderAdapter,
  ProviderConfig,
  ProviderMessage,
  ProviderStreamEvent,
} from '../../application/provider/ProviderConfig.ts'
import { readSSE } from './sse-reader.ts'

/**
 * Anthropic Provider 适配器
 *
 * 调用 Anthropic Messages API，解析 SSE 流。
 */
export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = 'anthropic'

  async *stream(
    messages: ProviderMessage[],
    config: ProviderConfig,
    tools?: Array<{ name: string; description: string; inputSchema: unknown }>,
  ): AsyncGenerator<ProviderStreamEvent, void, unknown> {
    const url = config.baseUrl ?? 'https://api.anthropic.com/v1/messages'
    const body = JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      messages,
      tools: tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
      stream: true,
    })

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      Accept: 'text/event-stream',
    }

    let currentToolName: string | undefined
    let currentToolInput = ''

    for await (const line of readSSE({ url, headers, body })) {
      if (!line.data || line.data === '[DONE]') continue

      let event: unknown
      try {
        event = JSON.parse(line.data)
      } catch {
        continue
      }

      const parsed = event as Record<string, unknown>

      if (parsed.type === 'content_block_start') {
        const block = parsed.content_block as Record<string, unknown> | undefined
        if (block?.type === 'text') {
          // 文本块开始，不发送事件
        } else if (block?.type === 'thinking') {
          // 思考块开始
        } else if (block?.type === 'tool_use') {
          currentToolName = block.name as string
          currentToolInput = ''
          yield {
            type: 'tool_use_start',
            toolName: currentToolName,
            toolInput: {},
          }
        }
      } else if (parsed.type === 'content_block_delta') {
        const delta = parsed.delta as Record<string, unknown> | undefined
        if (delta?.type === 'text_delta') {
          yield {
            type: 'text_delta',
            content: (delta.text as string) ?? '',
          }
        } else if (delta?.type === 'thinking_delta') {
          yield {
            type: 'thinking_delta',
            content: (delta.thinking as string) ?? '',
          }
        } else if (delta?.type === 'input_json_delta') {
          const partial = (delta.partial_json as string) ?? ''
          currentToolInput += partial
          if (currentToolName) {
            yield {
              type: 'tool_use_delta',
              toolName: currentToolName,
              partialInput: partial,
            }
          }
        }
      } else if (parsed.type === 'content_block_stop') {
        if (currentToolName) {
          let parsedInput: unknown
          try {
            parsedInput = JSON.parse(currentToolInput)
          } catch {
            parsedInput = {}
          }
          yield {
            type: 'tool_use_done',
            toolName: currentToolName,
            toolInput: parsedInput,
          }
          currentToolName = undefined
          currentToolInput = ''
        }
      } else if (parsed.type === 'message_stop') {
        yield { type: 'done' }
      }
    }

    // 如果流结束但没有 message_stop，也发送 done
    yield { type: 'done' }
  }
}
