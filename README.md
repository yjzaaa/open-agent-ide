# Open Agent IDE

桌面优先、后端可独立运行的开源 AI Agent IDE。

## 项目定位

Open Agent IDE 融合了两个参考项目的优势：

- **[Proma](D:/Proma)** 的 Electron 桌面架构、Jotai 状态管理、类型安全 IPC、多 Provider 适配器模式
- **[free-code-main](D:/free-code-main)** 的开放 Agent Runtime、Bash/PowerShell/MCP 工具链、权限系统

本项目没有直接修改上述两个目录，而是新建了一个独立仓库，把 free-code-main 的 CLI-first Runtime 改造成无头后端服务，由 Proma 风格的 Electron 前端通过 stdio + NDJSON 协议驱动。

## 已实现功能

- ✅ Electron 三进程架构（渲染进程 + 主进程 + Bun Runtime 子进程）
- ✅ stdio + NDJSON 通信协议
- ✅ Agent 主循环：模型调用 → 工具检测 → 执行 → 循环
- ✅ 多 Provider 适配器注册表（已接入 Anthropic）
- ✅ SSE 流式响应读取器
- ✅ 内置工具：BashTool、PowerShellTool、ReadTool、EditTool
- ✅ 权限模式：safe / ask / allow-all
- ✅ MCP Client Manager（可加载工作区 `mcp.json`）
- ✅ Jotai 状态管理的 Chat UI
- ✅ GitHub Issue / PR 模板、CI 工作流

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 39 |
| 前端 | React 18、Jotai 2、Tailwind CSS 3、Radix UI、Lucide React |
| 后端运行时 | Bun 1.3.11+ |
| 语言 | TypeScript 5 |
| 通信协议 | stdio + NDJSON |
| 构建工具 | electron-vite、Vite 6 |
| 打包工具 | electron-builder 25 |

## 快速开始

### 前置要求

- [Bun](https://bun.sh) 1.3.11+
- Anthropic API Key（或其他支持的 Provider）

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/yjzaaa/open-agent-ide.git
cd open-agent-ide

# 安装依赖
bun install

# 运行测试
bun test

# 类型检查
bun run typecheck

# 启动开发模式
bun run dev
```

### 使用 Agent

1. 在桌面应用输入框中输入任务，例如：
   > List files in current workspace
2. 应用会调用 Anthropic API（需配置 API Key）
3. 模型可调用 `BashTool`、`ReadTool` 等工具
4. 文本增量和工具结果会实时展示在消息列表中

### 配置 API Key

当前版本在 UI 中直接硬编码 API Key 于 `ChatView.tsx` 的 `apiKey` 字段。后续版本将提供设置面板。

## 项目结构

```text
open-agent-ide/
├── apps/desktop/              # Electron 桌面应用
│   ├── src/main/              # 主进程：窗口、RuntimeManager、IPC
│   ├── src/preload/           # 预加载脚本：安全 IPC 桥接
│   ├── src/renderer/          # 渲染进程：React + Jotai UI
│   └── electron-builder.yml   # 打包配置
├── packages/
│   ├── shared/                # IPC 协议类型、NDJSON 事件类型
│   ├── core/                  # Provider 适配器接口
│   └── runtime/               # Bun Agent Runtime（源自 free-code-main）
│       ├── src/application/   # 应用层：AgentLoop、PermissionService、ToolRegistry
│       ├── src/domain/        # 领域层：Tool、McpServerConfig
│       ├── src/infrastructure/# 基础设施层：Provider、Tools、MCP
│       └── src/interfaces/    # 接口层：stdio-server
├── docs/
│   ├── getting-started.md     # 详细入门指南
│   ├── architecture.md        # 架构说明
│   └── superpowers/
│       ├── specs/             # 设计文档
│       └── plans/             # 实施计划
├── .github/
│   ├── workflows/             # CI 工作流
│   ├── ISSUE_TEMPLATE/        # Issue 模板
│   └── pull_request_template.md
├── README.md
├── CHANGELOG.md
└── CLAUDE.md                  # 项目架构与约束
```

## 开发指南

见 [docs/getting-started.md](docs/getting-started.md) 和 [CLAUDE.md](CLAUDE.md)。

## 贡献

欢迎提交 Issue 和 PR。请遵循：

- Issue 模板：[Bug 报告](.github/ISSUE_TEMPLATE/bug_report.md) / [功能请求](.github/ISSUE_TEMPLATE/feature_request.md)
- [Pull Request 模板](.github/pull_request_template.md)
- 每次提交递增受影响包的 patch 版本
- 所有代码变更需通过 `bun test` 和 `bun run typecheck`

## 许可证

MIT
