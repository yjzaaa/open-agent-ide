import { test, expect } from 'bun:test'
import { tmpdir } from 'os'
import { AgentLoop } from '../src/application/agent-loop/AgentLoop.ts'
import { ToolRegistry } from '../src/application/tool/ToolRegistry.ts'
import { BashTool } from '../src/infrastructure/tools/BashTool.ts'
import {
  DefaultPermissionService,
  InMemoryPermissionStore,
} from '../src/application/permission/PermissionService.ts'
import type {
  ProviderAdapter,
  ProviderStreamEvent,
} from '../src/application/provider/ProviderConfig.ts'

const workspace = tmpdir()

function createMockProvider(events: ProviderStreamEvent[]): ProviderAdapter {
  return {
    providerId: 'mock',
    async *stream() {
      for (const event of events) {
        yield event
      }
    },
  }
}

test('AgentLoop 能返回文本增量和 done 事件', async () => {
  const toolRegistry = new ToolRegistry()
  toolRegistry.register(new BashTool())

  const agentLoop = new AgentLoop()
  const events: Array<{ type: string; content?: string }> = []

  for await (const event of agentLoop.run({
    id: 'req-1',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [],
    model: 'mock-model',
    providerId: 'mock',
    provider: createMockProvider([
      { type: 'text_delta', content: 'Hi' },
      { type: 'done' },
    ]),
    toolRegistry,
    permissionService: new DefaultPermissionService(new InMemoryPermissionStore()),
    permissionMode: 'allow-all',
    workspace,
    apiKey: 'test-key',
  })) {
    events.push({ type: event.type, content: 'content' in event ? event.content : undefined })
  }

  expect(events.some((e) => e.type === 'text_delta' && e.content === 'Hi')).toBe(true)
  expect(events.some((e) => e.type === 'done')).toBe(true)
})

test('AgentLoop 能执行 BashTool 并返回 tool_result', async () => {
  const toolRegistry = new ToolRegistry()
  toolRegistry.register(new BashTool())

  const agentLoop = new AgentLoop()
  const events: Array<{ type: string; tool?: string; success?: boolean }> = []

  for await (const event of agentLoop.run({
    id: 'req-1',
    messages: [{ role: 'user', content: 'List files' }],
    tools: ['BashTool'],
    model: 'mock-model',
    providerId: 'mock',
    provider: createMockProvider([
      {
        type: 'tool_use_start',
        toolName: 'BashTool',
        toolInput: {},
      },
      {
        type: 'tool_use_done',
        toolName: 'BashTool',
        toolInput: { command: 'echo hello' },
      },
      { type: 'done' },
    ]),
    toolRegistry,
    permissionService: new DefaultPermissionService(new InMemoryPermissionStore()),
    permissionMode: 'allow-all',
    workspace,
    apiKey: 'test-key',
  })) {
    events.push({
      type: event.type,
      tool: 'tool' in event ? (event as { tool: string }).tool : undefined,
      success: 'success' in event ? (event as { success: boolean }).success : undefined,
    })
  }

  expect(events.some((e) => e.type === 'tool_start' && e.tool === 'BashTool')).toBe(true)
  expect(events.some((e) => e.type === 'tool_result' && e.tool === 'BashTool' && e.success === true)).toBe(true)
})

test('AgentLoop ask 模式会发送 permission_request 并等待用户决策', async () => {
  const toolRegistry = new ToolRegistry()
  toolRegistry.register(new BashTool())

  const agentLoop = new AgentLoop()
  const events: Array<{ type: string; requestId?: string; decision?: string }> = []

  for await (const event of agentLoop.run({
    id: 'req-1',
    messages: [{ role: 'user', content: 'Remove file' }],
    tools: ['BashTool'],
    model: 'mock-model',
    providerId: 'mock',
    provider: createMockProvider([
      {
        type: 'tool_use_start',
        toolName: 'BashTool',
        toolInput: {},
      },
      {
        type: 'tool_use_done',
        toolName: 'BashTool',
        toolInput: { command: 'rm file' },
      },
      { type: 'done' },
    ]),
    toolRegistry,
    permissionService: new DefaultPermissionService(new InMemoryPermissionStore()),
    permissionMode: 'ask',
    workspace,
    apiKey: 'test-key',
    requestPermission: async (_requestId, tool) => {
      return tool === 'BashTool' ? 'allow' : 'deny'
    },
  })) {
    events.push({
      type: event.type,
      requestId: 'requestId' in event ? (event as { requestId: string }).requestId : undefined,
      decision: 'decision' in event ? (event as { decision: string }).decision : undefined,
    })
  }

  expect(events.some((e) => e.type === 'permission_request' && e.requestId)).toBe(true)
  expect(events.some((e) => e.type === 'permission_result' && e.decision === 'allow')).toBe(true)
  expect(events.some((e) => e.type === 'tool_result' && e.decision === undefined)).toBe(true)
})
