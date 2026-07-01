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
 * PowerShell 工具
 *
 * 执行 PowerShell 命令并返回输出，主要用于 Windows 环境。
 */
export class PowerShellTool implements Tool {
  readonly name = 'PowerShellTool'

  readonly description =
    'Execute a PowerShell command in the workspace. Use this for Windows-specific operations, file management, registry queries, etc.'

  readonly inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The PowerShell command to execute',
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
      'Get-ChildItem',
      'Get-Content',
      'Get-Location',
      'Get-Process',
      'Get-Service',
      'Get-Item',
      'Get-ItemProperty',
      'Test-Path',
      'Write-Output',
      'Select-String',
      'Where-Object',
      'git status',
      'git log',
      'git diff',
      'git branch',
    ]

    return readOnlyPrefixes.some((prefix) =>
      command.trim().toLowerCase().startsWith(prefix.toLowerCase()),
    )
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

    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'powershell.exe' : 'pwsh'

    const result = yield* executeShell(command, context.workspace, {
      shell,
      shellFlags: ['-NoProfile', '-Command'],
      signal: context.abortSignal,
    })

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr || undefined,
    }
  }
}
