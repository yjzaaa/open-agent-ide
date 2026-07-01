import { spawn } from 'child_process'
import type {
  ToolExecutionContext,
  ToolPermissionContext,
  ToolProgressEvent,
  ToolResult,
} from '../../domain/tool/Tool.ts'

/**
 * 跨平台 shell 执行结果
 */
export interface ShellExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

/**
 * shell 执行选项
 */
export interface ExecuteShellOptions {
  /** shell 可执行文件，默认 Windows 用 cmd.exe，Unix 用 bash */
  shell?: string
  /** shell 标志列表，默认 Windows 用 ['/c']，Unix 用 ['-c'] */
  shellFlags?: string[]
  /** 中止信号 */
  signal?: AbortSignal
}

/**
 * 执行 shell 命令
 *
 * @param command - 命令字符串
 * @param cwd - 工作目录
 * @param options - 执行选项
 * @returns 异步生成器，产出进度事件，返回执行结果
 */
export async function* executeShell(
  command: string,
  cwd: string,
  options: ExecuteShellOptions = {},
): AsyncGenerator<ToolProgressEvent, ShellExecResult, unknown> {
  yield { type: 'progress', message: '正在执行命令...' }

  const isWindows = process.platform === 'win32'
  const shell = options.shell ?? (isWindows ? 'cmd.exe' : 'bash')
  const shellFlags = options.shellFlags ?? (isWindows ? ['/c'] : ['-c'])

  const child = spawn(shell, [...shellFlags, command], {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''

  child.stdout?.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })

  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      child.kill()
    })
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      resolve(code ?? -1)
    })
  })

  return {
    exitCode,
    stdout,
    stderr,
  }
}
