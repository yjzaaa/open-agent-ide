import type { Tool } from '../../domain/tool/Tool.ts'

/**
 * 工具注册表
 *
 * 管理所有可用工具，按名称查找。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>()

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }

  /**
   * 获取工具
   */
  get(name: string): Tool {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`未找到工具: ${name}`)
    }
    return tool
  }

  /**
   * 判断工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * 获取所有工具名称
   */
  list(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * 获取所有工具（用于构造 Provider 工具定义）
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values())
  }
}
