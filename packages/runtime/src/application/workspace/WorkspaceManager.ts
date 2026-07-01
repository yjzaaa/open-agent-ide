import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { WorkspaceMcpConfig } from '../../domain/workspace/McpServerConfig.ts'

/**
 * 工作区管理器
 *
 * 负责加载工作区目录下的配置文件（如 MCP 配置）。
 */
export class WorkspaceManager {
  /**
   * 加载工作区 MCP 配置
   *
   * @param workspacePath - 工作区根目录
   * @returns MCP 配置，如果不存在则返回空配置
   */
  loadMcpConfig(workspacePath: string): WorkspaceMcpConfig {
    const configPath = resolve(workspacePath, 'mcp.json')

    if (!existsSync(configPath)) {
      return { servers: [] }
    }

    try {
      const content = readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(content) as WorkspaceMcpConfig

      return {
        servers: parsed.servers ?? [],
      }
    } catch (error) {
      console.error(`[WorkspaceManager] 读取 ${configPath} 失败:`, error)
      return { servers: [] }
    }
  }
}
