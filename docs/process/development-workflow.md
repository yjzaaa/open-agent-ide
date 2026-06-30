# 开发流程

本文档定义 `open-agent-ide` 的标准开发流程。所有贡献者必须遵守。

---

## 1. 需求与规划

### 1.1 功能来源

所有功能必须来自以下之一：

- **GitHub Issue**：bug 报告、功能请求、优化建议
- **PRD（产品需求文档）**：较大功能或版本规划
- **架构决策记录（ADR）**：影响架构的重要决策

### 1.2 PRD 流程

对于影响多个模块、改变用户交互、或需要设计决策的功能，必须先写 PRD：

1. 在 `docs/prds/YYYY-MM-DD-<feature-name>.md` 创建 PRD
2. PRD 必须包含：背景、目标、非目标、用户场景、验收标准、技术方案、风险
3. PRD 经过讨论和确认后再进入开发
4. PRD 模板见 `docs/process/prd-template.md`

### 1.3 任务拆解

PRD 确认后，拆分为 GitHub Issues：

- 每个 Issue 对应一个可独立交付的工作单元
- Issue 标题使用动词开头，如 "实现..."、"修复..."
- Issue 描述必须引用相关 PRD

---

## 2. 设计与实现

### 2.1 设计文档

实现前必须写设计文档：

- 路径：`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- 内容：架构、数据流、接口契约、测试策略、风险
- 设计文档需经过审阅

### 2.2 实施计划

设计确认后，写实施计划：

- 路径：`docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
- 内容：任务列表、文件变更、接口定义、测试命令、提交步骤

### 2.3 编码规范

- 语言：TypeScript
- 运行时：Bun
- 包管理：Bun workspace
- 注释：中文优先，保留必要专业术语
- 类型：禁止使用 `any`，优先使用 `interface`
- 导入：仅类型导入使用 `import type`，导入 `.ts` 文件
- 单文件单职责
- 接口与实现分离

### 2.4 DDD 分层

`packages/runtime` 按领域驱动设计分层：

- `domain/`：实体、值对象、领域服务
- `application/`：用例、工作流编排
- `infrastructure/`：外部依赖实现
- `interfaces/`：协议适配、入口

---

## 3. 测试

### 3.1 TDD

优先使用测试驱动开发：

1. 写失败测试
2. 写最小实现让测试通过
3. 重构

### 3.2 测试层级

| 层级 | 范围 | 命令 |
|---|---|---|
| 单元测试 | 单个函数/类 | `bun test` |
| 集成测试 | 多个模块协作 | `bun test` |
| 端到端测试 | Electron + Runtime | `bun run e2e` |

### 3.3 测试要求

- 每个新模块必须附带测试
- 测试覆盖率目标：
  - domain 层：>= 80%
  - application 层：>= 70%
  - infrastructure 层：核心路径覆盖
- CI 必须全绿才能合并

---

## 4. 代码审查

### 4.1 PR 要求

- 每个 PR 必须关联至少一个 Issue
- PR 描述使用模板（见 `.github/pull_request_template.md`）
- 所有 CI 检查通过
- 至少 1 个 approving review

### 4.2 审查维度

1. 功能等价性：是否满足 PRD/设计文档
2. 接口稳定性：公共导出是否变化
3. 代码可读性：是否简洁、职责单一
4. 测试覆盖：是否有测试、测试是否有价值
5. 安全：权限、命令注入、密钥泄漏

---

## 5. 版本与发布

### 5.1 版本号

使用 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

- `MAJOR`：不兼容的 API 变更
- `MINOR`：向后兼容的功能新增
- `PATCH`：向后兼容的问题修复

### 5.2 CHANGELOG

- 每次发布更新 `CHANGELOG.md`
- 格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
- 条目按类别：Added / Changed / Deprecated / Removed / Fixed / Security

### 5.3 发布流程

1. 更新版本号（`package.json` 和各 workspace 包）
2. 更新 `CHANGELOG.md`
3. 打 tag：`git tag v0.x.x`
4. 推送到 GitHub
5. 创建 GitHub Release
6. 构建分发包（Electron 应用）

---

## 6. 沟通与协作

### 6.1 Issue 标签

| 标签 | 用途 |
|---|---|
| `bug` | 缺陷 |
| `feature` | 新功能 |
| `enhancement` | 改进 |
| `docs` | 文档 |
| `refactor` | 重构 |
| `good first issue` | 适合新手 |
| `help wanted` | 需要帮助 |
| `blocked` | 阻塞中 |

### 6.2 讨论场所

- 功能讨论：GitHub Discussions 或 Issue
- 设计评审：PR 评论或 Discussion
- 紧急问题：Issue 标签 `priority/high`

---

## 7. 代码探索工具

开发时必须优先使用代码智能工具：

- **CodeGraph**：`mcp__codegraph__codegraph_explore`
- **GitNexus**：`mcp__gitnexus__query`、`context`、`impact`

禁止无脑批量 grep/cat 读文件。
