import type { PermissionMode } from '@open-agent-ide/shared'
import type { Tool } from '../../domain/tool/Tool.ts'

/**
 * 权限服务接口
 */
export interface PermissionService {
  /**
   * 检查工具权限
   */
  checkTool(
    tool: Tool,
    input: unknown,
    workspace: string,
    mode: PermissionMode,
  ): 'allow' | 'ask' | 'deny'

  /**
   * 授予工具权限
   *
   * @param toolName - 工具名称
   * @param duration - 权限持续时间
   */
  grantPermission(toolName: string, duration: 'once' | 'session' | 'always'): void

  /**
   * 撤销工具权限
   */
  revokePermission(toolName: string): void
}

/**
 * 内存权限存储
 */
export class InMemoryPermissionStore {
  private readonly alwaysAllowed = new Set<string>()
  private readonly sessionAllowed = new Set<string>()
  private onceAllowed: string | null = null

  /**
   * 授予权限
   */
  grant(toolName: string, duration: 'once' | 'session' | 'always'): void {
    if (duration === 'once') {
      this.onceAllowed = toolName
      return
    }

    if (duration === 'session') {
      this.sessionAllowed.add(toolName)
      return
    }

    this.alwaysAllowed.add(toolName)
  }

  /**
   * 检查是否允许
   */
  isAllowed(toolName: string): boolean {
    if (this.onceAllowed === toolName) {
      this.onceAllowed = null
      return true
    }

    return this.sessionAllowed.has(toolName) || this.alwaysAllowed.has(toolName)
  }

  /**
   * 撤销权限
   */
  revoke(toolName: string): void {
    this.alwaysAllowed.delete(toolName)
    this.sessionAllowed.delete(toolName)
    if (this.onceAllowed === toolName) {
      this.onceAllowed = null
    }
  }
}

/**
 * 默认权限服务实现
 */
export class DefaultPermissionService implements PermissionService {
  constructor(private readonly store: InMemoryPermissionStore) {}

  checkTool(
    tool: Tool,
    input: unknown,
    workspace: string,
    mode: PermissionMode,
  ): 'allow' | 'ask' | 'deny' {
    if (mode === 'allow-all' || this.store.isAllowed(tool.name)) {
      return 'allow'
    }

    const toolDecision = tool.checkPermissions(input, { mode, workspace })

    if (toolDecision === 'allow') {
      return 'allow'
    }

    if (mode === 'safe') {
      return 'deny'
    }

    return 'ask'
  }

  grantPermission(toolName: string, duration: 'once' | 'session' | 'always'): void {
    this.store.grant(toolName, duration)
  }

  revokePermission(toolName: string): void {
    this.store.revoke(toolName)
  }
}
