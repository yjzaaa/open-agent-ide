import { test, expect } from 'bun:test'
import { tmpdir } from 'os'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { ReadTool } from '../src/infrastructure/tools/ReadTool.ts'

const tempDir = mkdtempSync(join(tmpdir(), 'readtool-'))
const testFile = join(tempDir, 'test.txt')
writeFileSync(testFile, 'line 1\nline 2\nline 3\n', 'utf-8')

test('ReadTool 始终为只读', () => {
  const tool = new ReadTool()

  expect(tool.isReadOnly({ path: 'test.txt' })).toBe(true)
  expect(
    tool.checkPermissions({ path: 'test.txt' }, { mode: 'safe', workspace: tempDir }),
  ).toBe('allow')
})

test('ReadTool 读取文件内容', async () => {
  const tool = new ReadTool()
  const generator = tool.execute({ path: 'test.txt' }, { workspace: tempDir })

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.value.success).toBe(true)
  expect(result.value.output).toBe('line 1\nline 2\nline 3\n')
})

test('ReadTool 支持 offset 和 limit', async () => {
  const tool = new ReadTool()
  const generator = tool.execute(
    { path: 'test.txt', offset: 2, limit: 1 },
    { workspace: tempDir },
  )

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.value.success).toBe(true)
  expect(result.value.output).toBe('line 2')
})

test('ReadTool 拒绝工作区外的路径', async () => {
  const tool = new ReadTool()
  const generator = tool.execute({ path: '../outside.txt' }, { workspace: tempDir })

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.value.success).toBe(false)
  expect(result.value.error).toContain('超出工作区范围')
})

// 清理临时目录
process.on('exit', () => {
  rmSync(tempDir, { recursive: true, force: true })
})
