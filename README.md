# open-agent-ide

桌面优先、后端可独立运行的 AI Agent IDE。

## 定位

融合两个参考项目的优势：

- **[Proma](https://github.com/your-username/proma)** 的 Electron 桌面架构、Jotai 状态管理、类型安全 IPC、多 Provider 适配器
- **[free-code-main](https://github.com/paoloanzn/free-code)** 的开放 Agent runtime、Bash/PowerShell/MCP 工具链、权限系统、实验性功能

`open-agent-ide` 不是简单拼接，而是把 free-code-main 的 CLI-first runtime 改造成无头后端服务，由 Proma 风格的 Electron 前端驱动。

## 架构

```text
渲染进程 (React UI)
    ↓ IPC
Electron 主进程 (IPC 路由器 + 文件持久化)
    ↓ spawn + stdio
Bun Agent Runtime 子进程 (模型、工具、MCP)
```

## 技术栈

- **桌面框架**: Electron
- **前端**: React 18+、Jotai、Tailwind CSS、Radix UI / Shadcn UI
- **后端运行时**: Bun
- **语言**: TypeScript
- **通信协议**: stdio + NDJSON（可扩展）
- **构建工具**: Vite、esbuild

## 快速开始

```bash
# 安装依赖
bun install

# 运行测试
bun test

# 运行类型检查
bun run typecheck

# 启动开发模式
bun run dev
```

## 项目结构

```text
open-agent-ide/
├── apps/desktop/          # Electron 桌面应用
├── packages/
│   ├── shared/            # IPC 协议类型、NDJSON 事件类型
│   ├── core/              # Provider 适配器接口
│   └── runtime/           # Bun Agent Runtime（源自 free-code-main）
├── docs/
│   ├── process/           # 开发流程、PRD 模板
│   ├── prds/              # 产品需求文档
│   ├── superpowers/
│   │   ├── specs/         # 设计文档
│   │   └── plans/         # 实施计划
│   └── decisions/         # 架构决策记录
├── .github/
│   ├── workflows/         # CI 工作流
│   ├── ISSUE_TEMPLATE/    # Issue 模板
│   └── pull_request_template.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── CLAUDE.md              # 项目架构与约束
```

## 开发流程

见 [docs/process/development-workflow.md](docs/process/development-workflow.md)。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[待定]
