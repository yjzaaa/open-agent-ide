# Changelog

所有 notable 变更都会记录在这个文件中。

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 和 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 初始化 monorepo 骨架
- 创建 `@open-agent-ide/shared` 包：Runtime NDJSON 协议类型
- 创建 `@open-agent-ide/core` 包：Provider 适配器接口
- 完整复制 `free-code-main` 作为 `@open-agent-ide/runtime` 起点
- 创建 Runtime stdio server，实现 `runtime.ready` 握手
- 创建 Electron Desktop 骨架，实现 `RuntimeManager` 启动 Bun 子进程
- 建立项目管理流程文档、PRD 模板、Issue/PR 模板、CI 工作流

### Changed

- 无

### Fixed

- 无

### Removed

- 无

### Security

- 无
