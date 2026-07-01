#!/usr/bin/env bun
/**
 * Runtime stdio 入口
 *
 * 启动后先输出 runtime.ready，然后监听 stdin 上的 NDJSON 请求。
 */

import {
  createRuntimeReadyEvent,
} from '../domain/event.ts'
import { serializeEvent } from '../application/event-streamer.ts'
import { AgentLoop } from '../application/agent-loop/AgentLoop.ts'
import { ProviderRegistry } from '../application/provider/ProviderRegistry.ts'
import { AnthropicAdapter } from '../infrastructure/providers/AnthropicAdapter.ts'
import { ToolRegistry } from '../application/tool/ToolRegistry.ts'
import { BashTool, PowerShellTool, ReadTool, EditTool } from '../infrastructure/tools/index.ts'
import { WorkspaceManager } from '../application/workspace/WorkspaceManager.ts'
import { McpClientManager } from '../infrastructure/mcp/McpClientManager.ts'
import {
  DefaultPermissionService,
  InMemoryPermissionStore,
} from '../application/permission/PermissionService.ts'
import type {
  AgentRunParams,
  PermissionMode,
  PermissionRespondParams,
  RuntimeRequest,
} from '@open-agent-ide/shared'

/**
 * stdio server 运行时状态
 */
interface ServerState {
  providerRegistry: ProviderRegistry
  toolRegistry: ToolRegistry
  permissionService: DefaultPermissionService
  pendingPermissions: Map<
    string,
    {
      resolve: (decision: 'allow' | 'deny') => void
      reject: (reason: Error) => void
    }
  >
}

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

  const providerRegistry = new ProviderRegistry()
  providerRegistry.register(new AnthropicAdapter())

  const toolRegistry = new ToolRegistry()
  toolRegistry.register(new BashTool())
  toolRegistry.register(new PowerShellTool())
  toolRegistry.register(new ReadTool())
  toolRegistry.register(new EditTool())

  const permissionStore = new InMemoryPermissionStore()
  const permissionService = new DefaultPermissionService(permissionStore)

  const state: ServerState = {
    providerRegistry,
    toolRegistry,
    permissionService,
    pendingPermissions: new Map(),
  }

  let buffer = ''

  process.stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      void handleRequest(line, state)
    }
  })
}

/**
 * 处理单个 NDJSON 请求
 */
async function handleRequest(line: string, state: ServerState): Promise<void> {
  let request: RuntimeRequest
  try {
    request = JSON.parse(line) as RuntimeRequest
  } catch (error) {
    process.stdout.write(
      serializeEvent({
        version: '1.0',
        type: 'error',
        code: 'INVALID_JSON',
        message: `无法解析 JSON: ${error instanceof Error ? error.message : '未知错误'}`,
      }),
    )
    return
  }

  if (request.method === 'agent.run') {
    await handleAgentRun(request as RuntimeRequest<AgentRunParams>, state)
  } else if (request.method === 'permission.respond') {
    handlePermissionRespond(request as RuntimeRequest<PermissionRespondParams>)
  } else {
    process.stdout.write(
      serializeEvent({
        version: '1.0',
        id: request.id,
        type: 'error',
        code: 'UNKNOWN_METHOD',
        message: `未知方法: ${request.method}`,
      }),
    )
  }

  function handlePermissionRespond(
    request: RuntimeRequest<PermissionRespondParams>,
  ): void {
    const { requestId, decision } = request.params
    const pending = state.pendingPermissions.get(requestId)

    if (!pending) {
      process.stdout.write(
        serializeEvent({
          version: '1.0',
          id: request.id,
          type: 'error',
          code: 'PERMISSION_REQUEST_NOT_FOUND',
          message: `未找到权限请求: ${requestId}`,
        }),
      )
      return
    }

    state.pendingPermissions.delete(requestId)
    pending.resolve(decision)
  }
}

/**
 * 处理 agent.run 请求
 */
async function handleAgentRun(
  request: RuntimeRequest<AgentRunParams>,
  state: ServerState,
): Promise<void> {
  const params = request.params
  const id = params.id ?? request.id
  const workspace = params.workspace ?? process.cwd()

  const toolRegistry = new ToolRegistry()
  toolRegistry.register(new BashTool())
  toolRegistry.register(new PowerShellTool())
  toolRegistry.register(new ReadTool())
  toolRegistry.register(new EditTool())

  const workspaceManager = new WorkspaceManager()
  const mcpConfig = workspaceManager.loadMcpConfig(workspace)

  if (mcpConfig.servers.length > 0) {
    const mcpManager = new McpClientManager()
    try {
      const mcpTools = await mcpManager.loadServers(mcpConfig.servers)
      for (const tool of mcpTools) {
        toolRegistry.register(tool)
      }
    } catch (error) {
      console.error('[stdio-server] 加载 MCP servers 失败:', error)
    }
  }

  try {
    const provider = state.providerRegistry.get(params.providerId)
    const agentLoop = new AgentLoop()

    for await (const event of agentLoop.run({
      id,
      messages: params.messages,
      tools: params.tools ?? [],
      model: params.model,
      providerId: params.providerId,
      provider,
      toolRegistry,
      permissionService: state.permissionService,
      permissionMode: (params.permissionMode ?? 'ask') as PermissionMode,
      workspace,
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      requestPermission: (requestId, tool, input) =>
        new Promise<'allow' | 'deny'>((resolve, reject) => {
          state.pendingPermissions.set(requestId, { resolve, reject })
        }),
    })) {
      process.stdout.write(serializeEvent(event))
    }
  } catch (error) {
    process.stdout.write(
      serializeEvent({
        version: '1.0',
        id,
        type: 'error',
        code: 'AGENT_RUN_FAILED',
        message: error instanceof Error ? error.message : '未知错误',
      }),
    )
  }
}

// 如果是直接运行此文件，则启动 server
if (import.meta.main) {
  startStdioServer()
}
