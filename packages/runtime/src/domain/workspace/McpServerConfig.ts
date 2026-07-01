/** MCP Server 传输类型 */
export type McpTransportType = 'stdio' | 'sse'

/** MCP Server 基础配置 */
export interface McpServerConfigBase {
  /** 服务器名称 */
  name: string

  /** 传输类型 */
  type: McpTransportType
}

/** stdio 类型 MCP Server 配置 */
export interface McpStdioServerConfig extends McpServerConfigBase {
  type: 'stdio'

  /** 可执行命令 */
  command: string

  /** 命令参数 */
  args?: string[]

  /** 环境变量 */
  env?: Record<string, string>

  /** 工作目录 */
  cwd?: string
}

/** SSE 类型 MCP Server 配置 */
export interface McpSseServerConfig extends McpServerConfigBase {
  type: 'sse'

  /** SSE 端点 URL */
  url: string
}

/** MCP Server 配置联合类型 */
export type McpServerConfig = McpStdioServerConfig | McpSseServerConfig

/** 工作区 MCP 配置 */
export interface WorkspaceMcpConfig {
  /** MCP Server 列表 */
  servers: McpServerConfig[]
}
