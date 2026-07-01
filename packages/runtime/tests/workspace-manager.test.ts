import { test, expect } from 'bun:test'
import { tmpdir } from 'os'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { WorkspaceManager } from '../src/application/workspace/WorkspaceManager.ts'

const tempDir = mkdtempSync(join(tmpdir(), 'workspace-'))

const configContent = JSON.stringify({
  servers: [
    {
      name: 'test-server',
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    },
  ],
})

writeFileSync(join(tempDir, 'mcp.json'), configContent, 'utf-8')

test('WorkspaceManager 能读取 mcp.json', () => {
  const manager = new WorkspaceManager()
  const config = manager.loadMcpConfig(tempDir)

  expect(config.servers).toHaveLength(1)
  expect(config.servers[0].name).toBe('test-server')
  expect(config.servers[0].type).toBe('stdio')
})

test('WorkspaceManager 对工作区外的路径读取失败', () => {
  const manager = new WorkspaceManager()
  const config = manager.loadMcpConfig(join(tempDir, 'non-existent'))

  expect(config.servers).toHaveLength(0)
})

// 清理临时目录
process.on('exit', () => {
  rmSync(tempDir, { recursive: true, force: true })
})
