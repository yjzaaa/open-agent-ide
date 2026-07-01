import { test, expect } from 'bun:test'
import { tmpdir } from 'os'
import { PowerShellTool } from '../src/infrastructure/tools/PowerShellTool.ts'

const workspace = tmpdir()

test('PowerShellTool 判断只读命令', () => {
  const tool = new PowerShellTool()

  expect(tool.isReadOnly({ command: 'Get-ChildItem' })).toBe(true)
  expect(tool.isReadOnly({ command: 'Get-Content file.txt' })).toBe(true)
  expect(tool.isReadOnly({ command: 'git status' })).toBe(true)
  expect(tool.isReadOnly({ command: 'Remove-Item file.txt' })).toBe(false)
})

test('PowerShellTool 权限检查', () => {
  const tool = new PowerShellTool()

  expect(
    tool.checkPermissions({ command: 'Get-ChildItem' }, { mode: 'safe', workspace }),
  ).toBe('allow')

  expect(
    tool.checkPermissions({ command: 'Remove-Item file' }, { mode: 'safe', workspace }),
  ).toBe('deny')

  expect(
    tool.checkPermissions({ command: 'Remove-Item file' }, { mode: 'ask', workspace }),
  ).toBe('ask')

  expect(
    tool.checkPermissions({ command: 'Remove-Item file' }, { mode: 'allow-all', workspace }),
  ).toBe('allow')
})

test('PowerShellTool 执行 Write-Output 命令', async () => {
  const tool = new PowerShellTool()
  const generator = tool.execute({ command: 'Write-Output hello' }, { workspace })

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.done).toBe(true)
  expect(result.value.success).toBe(true)
  expect(result.value.output.trim()).toBe('hello')
})
