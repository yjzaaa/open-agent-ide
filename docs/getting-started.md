# 快速开始

本指南介绍如何在本地开发 Open Agent IDE。

## 环境要求

- **Bun**: 1.3.11 或更高版本
- **Git**
- **Anthropic API Key**（或其他支持的 Provider 的 API Key）

## 克隆与安装

```bash
git clone https://github.com/yjzaaa/open-agent-ide.git
cd open-agent-ide
bun install
```

## 常用命令

```bash
# 运行所有测试
bun test

# 类型检查
bun run typecheck

# 启动桌面应用开发模式
bun run dev

# 构建桌面应用
bun run build --filter open-agent-ide-desktop

# 打包桌面应用（需要额外配置 runtime 打包路径）
cd apps/desktop
bun run dist:fast
```

## 配置 API Key

当前版本需要在渲染进程的 `ChatView.tsx` 中设置 `apiKey`：

```typescript
sendAgentRun({
  id: uuidv4(),
  messages: [{ role: 'user', content: text }],
  tools: ['BashTool', 'ReadTool'],
  model: 'claude-sonnet-4-6',
  providerId: 'anthropic',
  apiKey: 'your-api-key-here', // ← 替换为你的 API Key
  permissionMode: 'ask',
})
```

> **注意**：未来版本将通过设置面板安全存储 API Key。

## 工作区 MCP 配置

在任意目录创建 `mcp.json` 即可让该工作区加载 MCP servers：

```json
{
  "servers": [
    {
      "name": "filesystem",
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]
    }
  ]
}
```

然后在 `agent.run` 请求中传入 `workspace` 参数指向该目录。

## 开发 workflow

1. 修改代码
2. 运行 `bun test` 和 `bun run typecheck`
3. 运行 `bun run dev` 手动验证
4. 遵循 [Pull Request 模板](../.github/pull_request_template.md) 提交

## 常见问题

### Q: `bun run dev` 提示找不到 runtime？

A: 确保在仓库根目录或 `apps/desktop` 目录运行。开发脚本通过 `RUNTIME_ENTRY_PATH` 环境变量指定 runtime 入口。

### Q: 测试在 Windows 上失败？

A: 确保 `cmd.exe` 在 PATH 中。部分测试依赖系统 shell。

### Q: 如何添加新的 Provider？

A: 在 `packages/runtime/src/infrastructure/providers/` 实现 `ProviderAdapter` 接口，并在 `stdio-server.ts` 注册。
