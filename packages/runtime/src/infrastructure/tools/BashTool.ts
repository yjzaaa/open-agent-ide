import type {
  Tool,
  ToolExecutionContext,
  ToolInputSchema,
  ToolPermissionContext,
  ToolProgressEvent,
  ToolResult,
} from '../../domain/tool/Tool.ts'
import { executeShell } from './shell-executor.ts'

/**
 * Bash 工具
 *
 * 执行 Bash 命令并返回输出。
 */
export class BashTool implements Tool {
  readonly name = 'BashTool'

  readonly description =
    'Execute a bash command in the workspace. Use this for file operations, running scripts, git commands, etc.'

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The bash command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (optional)',
      },
    },
    required: ['command'],
  }

  isReadOnly(input: unknown): boolean {
    const parsed = input as { command?: string }
    const command = parsed.command ?? ''

    // 只读命令白名单
    const readOnlyPrefixes = [
      'ls',
      'cat',
      'pwd',
      'echo',
      'find',
      'grep',
      'git status',
      'git log',
      'git diff',
      'git branch',
      'head',
      'tail',
      'wc',
    ]

    return readOnlyPrefixes.some((prefix) => command.trim().startsWith(prefix))
  }

  checkPermissions(
    input: unknown,
    context: ToolPermissionContext,
  ): 'allow' | 'ask' | 'deny' {
    if (context.mode === 'allow-all') {
      return 'allow'
    }

    if (this.isReadOnly(input)) {
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
    const parsed = input as { command?: string; timeout?: number }
    const command = parsed.command

    if (!command) {
      return {
        success: false,
        output: '',
        error: '缺少 command 参数',
      }
    }

    const result = yield* executeShell(command, context.workspace, {
      signal: context.abortSignal,
    })

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined,
    }
  }
}
