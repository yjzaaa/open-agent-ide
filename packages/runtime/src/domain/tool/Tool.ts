/**
 * 工具输入 schema
 */
export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

/**
 * 工具权限上下文
 */
export interface ToolPermissionContext {
  mode: 'safe' | 'ask' | 'allow-all'
  workspace: string
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  workspace: string
  abortSignal?: AbortSignal
}

/**
 * 工具进度事件
 */
export interface ToolProgressEvent {
  type: 'progress'
  message: string
}

/**
 * 工具结果
 */
export interface ToolResult {
  success: boolean
  output: string
  error?: string
}

/**
 * 工具接口
 */
export interface Tool {
  /** 工具名称 */
  name: string

  /** 工具描述 */
  description: string

  /** 输入 schema */
  inputSchema: ToolInputSchema

  /**
   * 判断该调用是否为只读操作
   */
  isReadOnly(input: unknown): boolean

  /**
   * 检查权限
   *
   * @returns 'allow' | 'ask' | 'deny'
   */
  checkPermissions(input: unknown, context: ToolPermissionContext): 'allow' | 'ask' | 'deny'

  /**
   * 执行工具
   */
  execute(
    input: unknown,
    context: ToolExecutionContext,
  ): AsyncGenerator<ToolProgressEvent, ToolResult, unknown>
}
