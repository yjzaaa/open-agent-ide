# CHANGELOG 约定

本项目使用 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，并遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## 格式

```markdown
## [Unreleased]

### Added
- 新功能描述

### Changed
- 现有功能变更

### Deprecated
- 即将移除的功能

### Removed
- 已移除的功能

### Fixed
- Bug 修复

### Security
- 安全修复
```

---

## 版本号规则

- `MAJOR`：不兼容的 API 变更
- `MINOR`：向后兼容的功能新增
- `PATCH`：向后兼容的问题修复

---

## 提交分类

| 类型 | 对应 CHANGELOG 分类 |
|---|---|
| `feat:` | Added |
| `fix:` | Fixed |
| `docs:` | 不进入 CHANGELOG（除非重要文档重构） |
| `style:` | 不进入 CHANGELOG |
| `refactor:` | Changed |
| `perf:` | Changed |
| `test:` | 不进入 CHANGELOG |
| `chore:` | 不进入 CHANGELOG |
| `security:` | Security |

---

## 发布流程

1. 确定版本号
2. 更新 `CHANGELOG.md`：把 `[Unreleased]` 改为 `[vX.Y.Z] - YYYY-MM-DD`
3. 更新 `package.json` 和各 workspace 包版本号
4. 创建 PR 合并到主分支
5. 打 tag：`git tag vX.Y.Z`
6. 推送 tag：`git push origin vX.Y.Z`
7. 创建 GitHub Release
