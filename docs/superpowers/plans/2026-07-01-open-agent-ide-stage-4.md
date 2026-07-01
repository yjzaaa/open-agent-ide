# open-agent-ide 阶段 4 实施计划：项目交付基础设施

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐可交付开源项目的工程基础设施：GitHub Issues / PR 模板、CI 工作流、构建与打包配置、使用文档，并完成最小端到端验证。

**Architecture:** `.github/` 存放社区协作模板与 CI；`electron-builder.yml` 配置打包；`README.md` 描述安装、开发与贡献流程。

**Tech Stack:** GitHub Actions, electron-builder, Bun workspace.

## Global Constraints

- 所有包 `"type": "module"`，导入使用 `.ts` 扩展名
- 禁止使用 `any`，优先使用 `interface`
- 中文注释优先，保留必要专业术语
- 每个新模块必须附带测试
- 不修改 `D:\Proma` 和 `D:\free-code-main`
- 状态管理采用 Jotai
- 提交时递增受影响包的 patch 版本

---

### Task 1: GitHub 社区模板

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/config.yml`

- [ ] **Step 1: 创建 bug_report.md**

包含：复现步骤、期望行为、实际行为、环境信息、日志。

- [ ] **Step 2: 创建 feature_request.md**

包含：功能描述、使用场景、可能的实现方案、是否愿意贡献。

- [ ] **Step 3: 创建 PR 模板**

包含：变更摘要、类型、测试、检查清单、关联 issue。

- [ ] **Step 4: 创建 config.yml**

禁用空白 issue，引导到 Discussion 或文档。

- [ ] **Step 5: 提交**

---

### Task 2: CI 工作流

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: 编写 CI**

在 Ubuntu/Windows/macOS 上运行：

```yaml
- uses: oven-sh/setup-bun@v2
- bun install
- bun run typecheck
- bun test
- bun run build --filter open-agent-ide-desktop
```

- [ ] **Step 2: 本地验证 `act` 或手动运行命令**

- [ ] **Step 3: 提交**

---

### Task 3: 构建与打包配置

**Files:**
- Create: `apps/desktop/electron-builder.yml`
- Modify: `apps/desktop/package.json` 增加 dist 脚本
- Modify: `apps/desktop/electron.vite.config.ts` 确保生产构建正确

- [ ] **Step 1: 安装 electron-builder**

```bash
cd apps/desktop
bun add -D electron-builder@^25.1.8
```

- [ ] **Step 2: 创建 electron-builder.yml**

配置 appId、productName、files、mac/win/linux targets。

- [ ] **Step 3: 增加打包脚本**

```json
"dist": "electron-builder"
"dist:fast": "electron-builder --dir"
```

- [ ] **Step 4: 本地运行 `bun run build` 验证**

- [ ] **Step 5: 提交**

---

### Task 4: README 与使用文档

**Files:**
- Modify: `README.md`
- Create: `docs/getting-started.md`
- Create: `docs/architecture.md`

- [ ] **Step 1: 重写 README.md**

包含：项目简介、功能特性、快速开始、开发指南、贡献指南、许可证。

- [ ] **Step 2: 创建 getting-started.md**

详细说明安装 Bun、配置 Anthropic API Key、运行 dev、打包。

- [ ] **Step 3: 创建 architecture.md**

描述 Electron 三进程架构、DDD runtime 分层、数据流。

- [ ] **Step 4: 提交**

---

### Task 5: 端到端验证

**Files:**
- 无新增文件

- [ ] **Step 1: 运行全部测试与类型检查**

```bash
bun test
bun run typecheck
```

- [ ] **Step 2: 运行 `bun run build` 验证生产构建**

- [ ] **Step 3: 运行 `bun run dev` 验证窗口启动**

- [ ] **Step 4: 提交并推送**

---

## 验证步骤

1. `bun test` 全绿
2. `bun run typecheck` 全绿
3. `bun run build` 成功
4. `bun run dev` 打开窗口
5. GitHub 仓库具备 issue/PR 模板与 CI

## 交付标准

阶段 4 完成后，项目应具备可交付的完整形态：代码、测试、文档、CI、打包配置齐全，用户克隆仓库后即可按 README 开发或打包。
