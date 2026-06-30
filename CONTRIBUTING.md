# 贡献指南

感谢你对 `open-agent-ide` 感兴趣！

---

## 开始之前

1. 阅读 `docs/process/development-workflow.md`
2. 阅读 `CLAUDE.md` 了解项目架构和约束
3. 确保你安装了 Bun >= 1.3.11

## 开发环境

```bash
# 克隆仓库
git clone https://github.com/your-username/open-agent-ide.git
cd open-agent-ide

# 安装依赖
bun install

# 运行测试
bun test

# 运行类型检查
bun run typecheck

# 启动开发模式
bun run dev
```

## 贡献流程

1. **查看现有 Issue**：避免重复工作
2. **创建或认领 Issue**：对于较大功能，先写 PRD
3. **创建设计文档**：路径 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
4. **写实施计划**：路径 `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
5. **实现并测试**：遵循 TDD
6. **提交 PR**：使用 PR 模板
7. **通过审查**：至少 1 个 approving review

## 代码规范

- 使用 TypeScript，禁止使用 `any`
- 优先使用 `interface` 而不是 `type`
- 仅类型导入使用 `import type`
- 导入 `.ts` 文件
- 中文注释优先，保留必要专业术语
- 单文件单职责

## 提交信息

使用约定式提交：

```
feat(scope): 新增功能
fix(scope): 修复 bug
docs(scope): 文档更新
refactor(scope): 重构
test(scope): 测试
chore(scope): 杂项
```

## 提问

如果你有任何问题，欢迎：

- 开一个 GitHub Issue（选择 question 模板）
- 在 Discussion 中讨论

---

再次感谢你的贡献！
