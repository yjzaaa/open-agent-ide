import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type {
  Tool,
  ToolExecutionContext,
  ToolInputSchema,
  ToolPermissionContext,
  ToolProgressEvent,
  ToolResult,
} from '../../domain/tool/Tool.ts'

/**
 * 文件读取工具
 *
 * 读取工作区内的文本文件内容。
 */
export class ReadTool implements Tool {
  readonly name = 'ReadTool'

  readonly description =
    'Read the contents of a text file within the workspace. Use this to inspect code, logs, configuration files, etc.'

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative or absolute path to the file to read',
      },
      offset: {
        type: 'number',
        description: 'Line offset to start reading from (optional, 1-based)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of lines to read (optional)',
      },
    },
    required: ['path'],
  }

  isReadOnly(_input: unknown): boolean {
    return true
  }

  checkPermissions(
    _input: unknown,
    context: ToolPermissionContext,
  ): 'allow' | 'ask' | 'deny' {
    // ReadTool 始终是只读的
    if (context.mode === 'safe' || context.mode === 'ask' || context.mode === 'allow-all') {
      return 'allow'
    }

    return 'deny'
  }

  async *execute(
    input: unknown,
    context: ToolExecutionContext,
  ): AsyncGenerator<ToolProgressEvent, ToolResult, unknown> {
    const parsed = input as {
      path?: string
      offset?: number
      limit?: number
    }
    const filePath = parsed.path

    if (!filePath) {
      return {
        success: false,
        output: '',
        error: '缺少 path 参数',
      }
    }

    yield { type: 'progress', message: `正在读取文件 ${filePath}...` }

    const fullPath = resolve(context.workspace, filePath)

    // 简单安全检查：确保文件在工作区内
    if (!fullPath.startsWith(resolve(context.workspace))) {
      return {
        success: false,
        output: '',
        error: '文件路径超出工作区范围',
      }
    }

    if (!existsSync(fullPath)) {
      return {
        success: false,
        output: '',
        error: `文件不存在: ${filePath}`,
      }
    }

    try {
      let content = readFileSync(fullPath, 'utf-8')

      if (parsed.offset !== undefined || parsed.limit !== undefined) {
        const lines = content.split('\n')
        const offset = Math.max(0, (parsed.offset ?? 1) - 1)
        const limit = parsed.limit ?? lines.length
        content = lines.slice(offset, offset + limit).join('\n')
      }

      return {
        success: true,
        output: content,
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : '读取文件失败',
      }
    }
  }
}
