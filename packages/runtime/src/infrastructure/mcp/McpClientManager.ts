import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { McpServerConfig, McpStdioServerConfig } from '../../domain/workspace/McpServerConfig.ts'
import { McpToolAdapter } from './McpToolAdapter.ts'
import type { Tool } from '../../domain/tool/Tool.ts'

/**
 * MCP 客户端连接状态
 */
export interface McpConnection {
  /** 配置名称 */
  name: string

  /** MCP 客户端 */
  client: Client

  /** 传输层 */
  transport: StdioClientTransport | SSEClientTransport

  /** 已注册的 tools */
  tools: Tool[]
}

/**
 * MCP Client Manager
 *
 * 负责按工作区配置启动 MCP servers，并将其 tools 包装为 domain Tool。
 */
export class McpClientManager {
  private readonly connections: Map<string, McpConnection> = new Map()

  /**
   * 连接并加载所有 MCP servers
   *
   * @param configs - MCP server 配置列表
   * @returns 加载到的所有 tools
   */
  async loadServers(configs: McpServerConfig[]): Promise<Tool[]> {
    const allTools: Tool[] = []

    for (const config of configs) {
      try {
        const tools = await this.connectServer(config)
        allTools.push(...tools)
      } catch (error) {
        console.error(`[McpClientManager] 连接 MCP server ${config.name} 失败:`, error)
      }
    }

    return allTools
  }

  /**
   * 关闭所有 MCP 连接
   */
  async closeAll(): Promise<void> {
    for (const connection of this.connections.values()) {
      try {
        await connection.client.close()
      } catch (error) {
        console.error(`[McpClientManager] 关闭 ${connection.name} 失败:`, error)
      }
    }

    this.connections.clear()
  }

  /**
   * 连接单个 MCP server
   */
  private async connectServer(config: McpServerConfig): Promise<Tool[]> {
    const existing = this.connections.get(config.name)
    if (existing) {
      return existing.tools
    }

    const transport = this.createTransport(config)
    const client = new Client(
      { name: 'open-agent-ide-runtime', version: '0.1.0' },
      { capabilities: {} },
    )

    await client.connect(transport)

    const toolsResponse = await client.listTools()
    const tools = (toolsResponse.tools ?? []).map(
      (tool) =>
        new McpToolAdapter(
          config.name,
          tool.name,
          tool.description ?? '',
          {
            type: 'object',
            properties: (tool.inputSchema?.properties as Record<string, unknown>) ?? {},
            required: (tool.inputSchema?.required as string[]) ?? [],
          },
          client,
        ),
    )

    const connection: McpConnection = {
      name: config.name,
      client,
      transport,
      tools,
    }

    this.connections.set(config.name, connection)

    return tools
  }

  private createTransport(
    config: McpServerConfig,
  ): StdioClientTransport | SSEClientTransport {
    if (config.type === 'stdio') {
      return this.createStdioTransport(config)
    }

    return new SSEClientTransport(new URL(config.url))
  }

  private createStdioTransport(config: McpStdioServerConfig): StdioClientTransport {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
      cwd: config.cwd,
      stderr: 'pipe',
    })
  }
}
