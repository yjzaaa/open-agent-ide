import { test, expect } from 'bun:test'
import { tmpdir } from 'os'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { EditTool } from '../src/infrastructure/tools/EditTool.ts'

const tempDir = mkdtempSync(join(tmpdir(), 'edittool-'))
const testFile = join(tempDir, 'test.txt')
writeFileSync(testFile, 'hello world\n', 'utf-8')

test('EditTool 不是只读', () => {
  const tool = new EditTool()

  expect(tool.isReadOnly({ path: 'test.txt', operation: 'write' })).toBe(false)
  expect(
    tool.checkPermissions({ path: 'test.txt', operation: 'write' }, { mode: 'safe', workspace: tempDir }),
  ).toBe('deny')
  expect(
    tool.checkPermissions({ path: 'test.txt', operation: 'write' }, { mode: 'ask', workspace: tempDir }),
  ).toBe('ask')
  expect(
    tool.checkPermissions({ path: 'test.txt', operation: 'write' }, { mode: 'allow-all', workspace: tempDir }),
  ).toBe('allow')
})

test('EditTool 全量写入', async () => {
  const tool = new EditTool()
  const generator = tool.execute(
    { path: 'test.txt', operation: 'write', content: 'new content' },
    { workspace: tempDir },
  )

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.value.success).toBe(true)
  expect(readFileSync(testFile, 'utf-8')).toBe('new content')
})

test('EditTool 追加内容', async () => {
  const tool = new EditTool()
  const generator = tool.execute(
    { path: 'test.txt', operation: 'append', content: ' appended' },
    { workspace: tempDir },
  )

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.value.success).toBe(true)
  expect(readFileSync(testFile, 'utf-8')).toBe('new content appended')
})

test('EditTool 替换内容', async () => {
  const tool = new EditTool()
  const generator = tool.execute(
    { path: 'test.txt', operation: 'replace', oldString: 'new', newString: 'updated' },
    { workspace: tempDir },
  )

  let result = await generator.next()
  while (!result.done) {
    result = await generator.next()
  }

  expect(result.value.success).toBe(true)
  expect(readFileSync(testFile, 'utf-8')).toBe('updated content appended')
})

test('EditTool 拒绝工作区外的路径', async () => {
  const tool = new EditTool()
  const generator = tool.execute(
    { path: '../outside.txt', operation: 'write', content: 'x' },
    { workspace: tempDir },
  )

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
