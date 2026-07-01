import { readFileSync, writeFileSync, existsSync } from 'fs'
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
 * 文件编辑工具
 *
 * 支持全量写入、追加、替换指定内容。
 */
export class EditTool implements Tool {
  readonly name = 'EditTool'

  readonly description =
    'Edit a text file within the workspace. Supports full write, append, or replacing specific content.'

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative or absolute path to the file to edit',
      },
      operation: {
        type: 'string',
        enum: ['write', 'append', 'replace'],
        description: '编辑操作类型：write 全量写入、append 追加、replace 替换',
      },
      content: {
        type: 'string',
        description: '要写入或追加的内容',
      },
      oldString: {
        type: 'string',
        description: 'replace 操作时要被替换的字符串',
      },
      newString: {
        type: 'string',
        description: 'replace 操作时用于替换的新字符串',
      },
    },
    required: ['path', 'operation'],
  }

  isReadOnly(_input: unknown): boolean {
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
    context: ToolExecutionContext,
  ): AsyncGenerator<ToolProgressEvent, ToolResult, unknown> {
    const parsed = input as {
      path?: string
      operation?: 'write' | 'append' | 'replace'
      content?: string
      oldString?: string
      newString?: string
    }
    const filePath = parsed.path
    const operation = parsed.operation

    if (!filePath || !operation) {
      return {
        success: false,
        output: '',
        error: '缺少 path 或 operation 参数',
      }
    }

    yield { type: 'progress', message: `正在编辑文件 ${filePath}...` }

    const fullPath = resolve(context.workspace, filePath)

    // 简单安全检查：确保文件在工作区内
    if (!fullPath.startsWith(resolve(context.workspace))) {
      return {
        success: false,
        output: '',
        error: '文件路径超出工作区范围',
      }
    }

    try {
      if (operation === 'write') {
        if (parsed.content === undefined) {
          return {
            success: false,
            output: '',
            error: 'write 操作需要提供 content 参数',
          }
        }

        writeFileSync(fullPath, parsed.content, 'utf-8')
        return {
          success: true,
          output: `已写入文件: ${filePath}`,
        }
      }

      if (operation === 'append') {
        if (parsed.content === undefined) {
          return {
            success: false,
            output: '',
            error: 'append 操作需要提供 content 参数',
          }
        }

        writeFileSync(fullPath, parsed.content, { encoding: 'utf-8', flag: 'a' })
        return {
          success: true,
          output: `已追加内容到文件: ${filePath}`,
        }
      }

      if (operation === 'replace') {
        if (parsed.oldString === undefined || parsed.newString === undefined) {
          return {
            success: false,
            output: '',
            error: 'replace 操作需要提供 oldString 和 newString 参数',
          }
        }

        if (!existsSync(fullPath)) {
          return {
            success: false,
            output: '',
            error: `文件不存在: ${filePath}`,
          }
        }

        const content = readFileSync(fullPath, 'utf-8')
        if (!content.includes(parsed.oldString)) {
          return {
            success: false,
            output: '',
            error: '未找到要替换的内容',
          }
        }

        const newContent = content.replace(parsed.oldString, parsed.newString)
        writeFileSync(fullPath, newContent, 'utf-8')
        return {
          success: true,
          output: `已替换文件内容: ${filePath}`,
        }
      }

      return {
        success: false,
        output: '',
        error: `不支持的编辑操作: ${operation}`,
      }
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : '编辑文件失败',
      }
    }
  }
}
