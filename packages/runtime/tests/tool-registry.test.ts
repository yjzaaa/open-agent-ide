import { test, expect } from 'bun:test'
import { ToolRegistry } from '../src/application/tool/ToolRegistry.ts'
import { BashTool } from '../src/infrastructure/tools/BashTool.ts'

test('ToolRegistry 能注册和获取工具', () => {
  const registry = new ToolRegistry()
  const bashTool = new BashTool()

  registry.register(bashTool)
  expect(registry.list()).toContain('BashTool')
  expect(registry.get('BashTool')).toBe(bashTool)
})

test('ToolRegistry 批量注册工具', () => {
  const registry = new ToolRegistry()
  registry.registerAll([new BashTool()])
  expect(registry.has('BashTool')).toBe(true)
})

test('ToolRegistry 获取不存在的工具会抛出错误', () => {
  const registry = new ToolRegistry()
  expect(() => registry.get('UnknownTool')).toThrow('未找到工具')
})
