import { test, expect } from 'bun:test'
import { tmpdir } from 'os'
import { BashTool } from '../src/infrastructure/tools/BashTool.ts'

const workspace = tmpdir()

test('BashTool 判断只读命令', () => {
  const tool = new BashTool()
  expect(tool.isReadOnly({ command: 'ls -la' })).toBe(true)
  expect(tool.isReadOnly({ command: 'cat file.txt' })).toBe(true)
  expect(tool.isReadOnly({ command: 'git status' })).toBe(true)
  expect(tool.isReadOnly({ command: 'rm file.txt' })).toBe(false)
})

test('BashTool 权限检查', () => {
  const tool = new BashTool()

  expect(
    tool.checkPermissions({ command: 'ls' }, { mode: 'safe', workspace }),
  ).toBe('allow')

  expect(
    tool.checkPermissions({ command: 'rm file' }, { mode: 'safe', workspace }),
  ).toBe('deny')

  expect(
    tool.checkPermissions({ command: 'rm file' }, { mode: 'ask', workspace }),
  ).toBe('ask')

  expect(
    tool.checkPermissions({ command: 'rm file' }, { mode: 'allow-all', workspace }),
  ).toBe('allow')
})

test('BashTool 执行 echo 命令', async () => {
  const tool = new BashTool()
  const generator = tool.execute({ command: 'echo hello' }, { workspace })

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.done).toBe(true)
  expect(result.value.success).toBe(true)
  expect(result.value.output.trim()).toBe('hello')
})
