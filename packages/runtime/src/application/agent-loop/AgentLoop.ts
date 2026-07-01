import type { RuntimeEvent } from '@open-agent-ide/shared'
import type { PermissionMode } from '@open-agent-ide/shared'
import type { ProviderAdapter, ProviderStreamEvent } from '../provider/ProviderConfig.ts'
import type { PermissionService } from '../permission/PermissionService.ts'
import type { ToolRegistry } from '../tool/ToolRegistry.ts'

/**
 * AgentLoop 输入
 */
export interface AgentLoopInput {
  /** 请求 ID */
  id: string

  /** 初始消息列表 */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>

  /** 可用工具名称列表 */
  tools: string[]

  /** 模型名称 */
  model: string

  /** Provider ID */
  providerId: string

  /** Provider 适配器 */
  provider: ProviderAdapter

  /** 工具注册表 */
  toolRegistry: ToolRegistry

  /** 权限服务 */
  permissionService: PermissionService

  /** 权限模式 */
  permissionMode: PermissionMode

  /** 工作区目录 */
  workspace: string

  /** Provider API Key */
  apiKey: string

  /** Provider base URL（可选） */
  baseUrl?: string

  /** 最大循环轮数 */
  maxIterations?: number

  /**
   * 请求用户授权
   *
   * @returns Promise<'allow' | 'deny'>
   */
  requestPermission?: (requestId: string, tool: string, input: unknown) => Promise<'allow' | 'deny'>
}

/**
 * Agent 主循环
 *
 * 负责调用模型、处理流事件、执行工具、循环直到完成。
 */
export class AgentLoop {
  /**
   * 运行 Agent 循环
   */
  async *run(input: AgentLoopInput): AsyncGenerator<RuntimeEvent, void, unknown> {
    const maxIterations = input.maxIterations ?? 10
    let messages = [...input.messages]

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const toolDefinitions = input.tools
        .map((name) => {
          try {
            return input.toolRegistry.get(name)
          } catch {
            return null
          }
        })
        .filter(Boolean)
        .map((tool) => ({
          name: tool!.name,
          description: tool!.description,
          inputSchema: tool!.inputSchema,
        }))

      const providerMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const providerConfig = {
        providerId: input.providerId,
        model: input.model,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
      }

      let toolUseBuffer: {
        toolName: string
        toolInput: unknown
      } | null = null

      let hasToolUse = false

      for await (const event of input.provider.stream(
        providerMessages,
        providerConfig,
        toolDefinitions,
      )) {
        const runtimeEvent = this.mapProviderEvent(event, input.id)
        if (runtimeEvent) {
          yield runtimeEvent
        }

        if (event.type === 'tool_use_done') {
          toolUseBuffer = {
            toolName: event.toolName,
            toolInput: event.toolInput,
          }
          hasToolUse = true
        }
      }

      if (!hasToolUse) {
        // 没有工具调用，结束循环
        yield { version: '1.0', id: input.id, type: 'done' }
        return
      }

      if (toolUseBuffer) {
        // 执行工具
        const tool = input.toolRegistry.get(toolUseBuffer.toolName)
        const permission = input.permissionService.checkTool(
          tool,
          toolUseBuffer.toolInput,
          input.workspace,
          input.permissionMode,
        )

        if (permission === 'deny') {
          yield {
            version: '1.0',
            id: input.id,
            type: 'tool_result',
            tool: tool.name,
            output: '权限被拒绝',
            success: false,
          }
          messages.push({
            role: 'user',
            content: `Tool ${tool.name} execution denied by permission settings.`,
          })
          continue
        }

        if (permission === 'ask') {
          const requestPermission = input.requestPermission
          if (!requestPermission) {
            // 没有提供授权回调，按 deny 处理
            yield {
              version: '1.0',
              id: input.id,
              type: 'tool_result',
              tool: tool.name,
              output: 'ask 模式需要 requestPermission 回调，但未提供',
              success: false,
            }
            messages.push({
              role: 'user',
              content: `Tool ${tool.name} requires user permission, but no requestPermission callback was provided.`,
            })
            continue
          }

          const requestId = `${input.id}--${tool.name}--${iteration}`
          yield {
            version: '1.0',
            id: input.id,
            type: 'permission_request',
            requestId,
            tool: tool.name,
            input: toolUseBuffer.toolInput,
          }

          const decision = await requestPermission(
            requestId,
            tool.name,
            toolUseBuffer.toolInput,
          )

          if (decision === 'deny') {
            yield {
              version: '1.0',
              id: input.id,
              type: 'permission_result',
              requestId,
              decision: 'deny',
            }
            yield {
              version: '1.0',
              id: input.id,
              type: 'tool_result',
              tool: tool.name,
              output: '用户拒绝了工具执行',
              success: false,
            }
            messages.push({
              role: 'user',
              content: `Tool ${tool.name} execution denied by user.`,
            })
            continue
          }

          yield {
            version: '1.0',
            id: input.id,
            type: 'permission_result',
            requestId,
            decision: 'allow',
          }
        }

        yield {
          version: '1.0',
          id: input.id,
          type: 'tool_start',
          tool: tool.name,
          input: toolUseBuffer.toolInput,
        }

        const result = await this.executeTool(tool, toolUseBuffer.toolInput, input.workspace)

        yield {
          version: '1.0',
          id: input.id,
          type: 'tool_result',
          tool: tool.name,
          output: result.output,
          success: result.success,
        }

        messages.push({
          role: 'user',
          content: `[Tool ${tool.name} result]\n${result.output}`,
        })
      }
    }

    // 达到最大迭代次数
    yield {
      version: '1.0',
      id: input.id,
      type: 'error',
      code: 'MAX_ITERATIONS_REACHED',
      message: '达到最大迭代次数',
    }
  }

  private mapProviderEvent(
    event: ProviderStreamEvent,
    id: string,
  ): RuntimeEvent | null {
    switch (event.type) {
      case 'text_delta':
        return { version: '1.0', id, type: 'text_delta', content: event.content }
      case 'thinking_delta':
        return { version: '1.0', id, type: 'thinking_delta', content: event.content }
      case 'done':
        return null // AgentLoop 自己控制 done 时机
      default:
        return null
    }
  }

  private async executeTool(
    tool: import('../../domain/tool/Tool.ts').Tool,
    input: unknown,
    workspace: string,
  ): Promise<import('../../domain/tool/Tool.ts').ToolResult> {
    const generator = tool.execute(input, { workspace })
    let result = await generator.next()

    while (!result.done) {
      result = await generator.next()
    }

    return result.value
  }
}
