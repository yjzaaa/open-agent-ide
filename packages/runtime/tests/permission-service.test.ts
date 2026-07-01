import { test, expect } from 'bun:test'
import {
  DefaultPermissionService,
  InMemoryPermissionStore,
} from '../src/application/permission/PermissionService.ts'
import { BashTool } from '../src/infrastructure/tools/BashTool.ts'

test('safe 模式只允许只读工具', () => {
  const service = new DefaultPermissionService(new InMemoryPermissionStore())
  const bashTool = new BashTool()

  expect(
    service.checkTool(bashTool, { command: 'ls' }, '/tmp', 'safe'),
  ).toBe('allow')

  expect(
    service.checkTool(bashTool, { command: 'rm file' }, '/tmp', 'safe'),
  ).toBe('deny')
})

test('allow-all 模式允许所有工具', () => {
  const service = new DefaultPermissionService(new InMemoryPermissionStore())
  const bashTool = new BashTool()

  expect(
    service.checkTool(bashTool, { command: 'rm file' }, '/tmp', 'allow-all'),
  ).toBe('allow')
})

test('ask 模式对非只写工具返回 ask', () => {
  const service = new DefaultPermissionService(new InMemoryPermissionStore())
  const bashTool = new BashTool()

  expect(
    service.checkTool(bashTool, { command: 'rm file' }, '/tmp', 'ask'),
  ).toBe('ask')
})

test('grantPermission 后工具被允许', () => {
  const store = new InMemoryPermissionStore()
  const service = new DefaultPermissionService(store)
  const bashTool = new BashTool()

  service.grantPermission('BashTool', 'session')
  expect(
    service.checkTool(bashTool, { command: 'rm file' }, '/tmp', 'ask'),
  ).toBe('allow')
})
