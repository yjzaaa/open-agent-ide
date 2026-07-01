import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type {
  Tool,
  ToolExecutionContext,
  ToolInputSchema,
  ToolPermissionContext,
  ToolProgressEvent,
  ToolResult,
} from '../../domain/tool/Tool.ts'

/**
 * MCP Tool 包装器
 *
 * 把 MCP server 提供的 tool 包装为 domain Tool 接口。
 */
export class McpToolAdapter implements Tool {
  readonly name: string

  readonly description: string

  readonly inputSchema: ToolInputSchema

  private readonly client: Client

  constructor(
    /** MCP server 名称 */
    serverName: string,
    /** MCP tool 原始名称 */
    toolName: string,
    description: string,
    inputSchema: ToolInputSchema,
    client: Client,
  ) {
    this.name = `mcp__${serverName}__${toolName}`
    this.description = `[${serverName}] ${description}`
    this.inputSchema = inputSchema
    this.client = client
  }

  isReadOnly(): boolean {
    // MCP tool 默认不视为只读，除非描述中有明确提示
    return false
  }

  checkPermissions(
    _input: unknown,
    context: ToolPermissionContext,
  ): 'allow' | 'ask' | 'deny' {
    if (context.mode === 'allow-all') {
      return 'allow'
    }

    if (context.mode === 'safe') {
      return 'deny'
    }

    return 'ask'
  }

  async *execute(
    input: unknown,
    _context: ToolExecutionContext,
  ): AsyncGenerator<ToolProgressEvent, ToolResult, unknown> {
    yield { type: 'progress', message: `正在调用 MCP tool ${this.name}...` }

    try {
      const result = await this.client.callTool(
        {
          name: this.extractOriginalName(),
          arguments: input as Record<string, unknown>,
        },
        undefined,
        { timeout: 60_000 },
      )

      const content = (result.content ?? []) as Array<unknown>
      const text = content
        .map((item) => {
          if (typeof item === 'object' && item !== null && 'text' in item) {
            return String((item as { text: unknown }).text)
          }
          return JSON.stringify(item)
        })
        .join('\n')

      const isError = 'isError' in result && Boolean(result.isError)

      return {
        success: !isError,
        output: text,
        error: isError ? text : undefined,
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'MCP tool 调用失败',
      }
    }
  }

  private extractOriginalName(): string {
    const parts = this.name.split('__')
    return parts[parts.length - 1] ?? this.name
  }
}
