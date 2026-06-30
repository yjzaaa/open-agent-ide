# Build System & Feature Flags 架构文档

## 1. 概述

Claude Code 项目使用基于 `scripts/build.ts` 的构建系统，通过 Bun 的编译管道和特性门控（feature flags）机制实现灵活的构建配置。该系统支持 54+ 个实验性功能标志，可根据构建类型（开发/发布）和目标用户（内部/外部）动态启用或禁用功能。

## 2. 构建管道

### 2.1 参数解析

构建脚本通过命令行参数控制构建行为：

```bash
bun run build              # 标准构建 (./cli)
bun run build:dev          # 开发构建 (./cli-dev)
bun run build:compile      # 编译构建 (./dist/cli)
bun run build --feature-set=dev-full  # 启用所有实验功能
bun run build --feature=VOICE_MODE    # 启用单个功能
```

- `--compile`: 生成编译后的二进制文件到 `./dist/` 目录
- `--dev`: 生成开发版本（包含时间戳和 Git SHA）
- `--feature=<NAME>`: 启用指定的功能标志
- `--feature-set=dev-full`: 启用所有实验性功能

### 2.2 版本计算

版本号根据构建类型动态生成：

**开发版本格式**:
```
{base}-dev.{date}.t{time}.sha{sha}
```

示例: `1.0.0-dev.20250110.t143052.sha-a1b2c3d4`

- `{date}`: ISO 日期，格式为 `YYYYMMDD`
- `{time}`: 24 小时制时间，格式为 `HHMMSS`
- `{sha}`: Git 短哈希（8 位）

**发布版本**:
直接使用 `package.json` 中定义的版本号。

### 2.3 外部依赖

以下包被标记为外部依赖，不打包到最终二进制文件中：

```typescript
const externals = [
  '@ant/*',                    // 内部工具包
  'audio-capture-napi',        // 音频捕获
  'image-processor-napi',      // 图像处理
  'modifiers-napi',            // 键盘修饰符
  'url-handler-napi',          // URL 处理
]
```

这些依赖需要在运行时环境中可用。

### 2.4 编译时常量注入

构建时注入以下全局常量：

```typescript
const defines = {
  // 环境变量
  'process.env.USER_TYPE': '"external"',           // 用户类型
  'process.env.CLAUDE_CODE_FORCE_FULL_LOGO': '"true"',
  'process.env.CLAUDE_CODE_VERIFY_PLAN': '"false"',
  'process.env.CCR_FORCE_BUNDLE': '"true"',
  
  // 开发版本特有
  'process.env.NODE_ENV': '"development"',         // 仅开发版本
  'process.env.CLAUDE_CODE_EXPERIMENTAL_BUILD': '"true"', // 仅开发版本
  
  // MACRO 常量
  'MACRO.VERSION': '"<version>"',                 // 版本号
  'MACRO.BUILD_TIME': '"<ISO timestamp>"',        // 构建时间
  'MACRO.PACKAGE_URL': '"claude-code"',           // 包名
  'MACRO.NATIVE_PACKAGE_URL': 'undefined',
  'MACRO.FEEDBACK_CHANNEL': '"github"',
  'MACRO.ISSUES_EXPLAINER': '"..."',
  'MACRO.VERSION_CHANGELOG': '"<git log or URL>"', // 版本变更日志
}
```

### 2.5 功能标志应用

功能标志通过 Bun 的 `--feature` 参数传递：

```bash
bun build --feature=VOICE_MODE --feature=BRIDGE_MODE ...
```

在代码中通过 `feature()` 函数检查：

```typescript
import { feature } from 'bun:bundle'

if (feature('VOICE_MODE')) {
  // 语音模式相关代码
}
```

### 2.6 最终构建命令

```bash
bun build ./src/entrypoints/cli.tsx \
  --compile \
  --target bun \
  --format esm \
  --outfile <outfile> \
  --minify \
  --bytecode \
  --packages bundle \
  --conditions bun \
  --external <externals>... \
  --feature <features>... \
  --define <defines>...
```

## 3. 构建产物

### 3.1 标准构建

- **./cli**: 标准发布版本（未编译，Bun 脚本）
- **./cli-dev**: 开发版本（包含版本变更日志）

### 3.2 编译构建

- **./dist/cli**: 编译后的发布版本（独立二进制）
- **./dist/cli-dev**: 编译后的开发版本

### 3.3 完整实验功能构建

使用 `--feature-set=dev-full` 生成的构建包含所有 54+ 个实验性功能，主要用于内部测试和开发。

## 4. Feature Flags 完整列表

### 4.1 Agent 相关 (3 个)
- `AGENT_MEMORY_SNAPSHOT`: Agent 内存快照功能
- `AGENT_TRIGGERS`: Agent 触发器
- `AGENT_TRIGGERS_REMOTE`: 远程 Agent 触发器

### 4.2 交互模式 (5 个)
- `VOICE_MODE`: 语音输入/输出模式
- `BRIDGE_MODE`: 远程控制桥接模式
- `KAIROS`: Kairos 功能集
- `KAIROS_BRIEF`: Kairos 简要模式
- `KAIROS_CHANNELS`: Kairos 通道

### 4.3 协作功能 (2 个)
- `TEAMMEM`: 团队成员功能
- `COORDINATOR_MODE`: 协调器模式

### 4.4 搜索功能 (4 个)
- `QUICK_SEARCH`: 快速搜索
- `TREE_SITTER_BASH`: Bash Tree-Sitter 解析
- `TREE_SITTER_BASH_SHADOW`: Bash Tree-Sitter 影子解析
- `BASH_CLASSIFIER`: Bash 分类器

### 4.5 上下文管理 (4 个)
- `CACHED_MICROCOMPACT`: 缓存微压缩
- `COMPACTION_REMINDERS`: 压缩提醒
- `EXTRACT_MEMORIES`: 提取记忆
- `TOKEN_BUDGET`: Token 预算管理

### 4.6 规划功能 (3 个)
- `ULTRAPLAN`: 超级规划功能
- `ULTRATHINK`: 深度思考模式
- `VERIFICATION_AGENT`: 验证 Agent

### 4.7 开发工具 (2 个)
- `BUILTIN_EXPLORE_PLAN_AGENTS`: 内置探索/规划 Agent
- `POWERSHELL_AUTO_MODE`: PowerShell 自动模式

### 4.8 平台集成 (3 个)
- `CCR_AUTO_CONNECT`: CCR 自动连接
- `CCR_MIRROR`: CCR 镜像模式
- `CCR_REMOTE_SETUP`: CCR 远程设置

### 4.9 UI/UX 功能 (7 个)
- `AWAY_SUMMARY`: 离开摘要
- `CONNECTOR_TEXT`: 连接器文本
- `HISTORY_PICKER`: 历史选择器
- `HOOK_PROMPTS`: Hook 提示
- `LODESTONE`: 磁石功能
- `MESSAGE_ACTIONS`: 消息操作
- `NATIVE_CLIPBOARD_IMAGE`: 原生剪贴板图像

### 4.10 其他功能 (21 个)
- `MCP_RICH_OUTPUT`: MCP 丰富输出
- `NEW_INIT`: 新初始化流程
- `PROMPT_CACHE_BREAK_DETECTION`: 提示缓存中断检测
- `SHOT_STATS`: Shot 统计
- `UNATTENDED_RETRY`: 无人值守重试
- `HISTORY_PICKER`: 历史记录选择器
- `LODESTONE`: 磁石功能
- 等等...

**总计**: 54 个功能标志（截至本文档编写时）

## 5. 死代码消除 (DCE)

### 5.1 feature() 函数内联

Bun 打包器会在编译时内联 `feature()` 函数调用：

```typescript
// 源代码
if (feature('VOICE_MODE')) {
  enableVoice()
}
```

当 `VOICE_MODE` 未启用时，编译后的代码变为：
```typescript
if (false) {
  enableVoice()
}
```

Bun 的 DCE 会完全移除这段代码。

### 5.2 条件导入

使用 `require()` 在 `feature()` 检查内部进行条件导入：

```typescript
if (feature('VOICE_MODE')) {
  const voice = require('./voice.js')
  voice.start()
}
```

如果功能未启用，整个模块都不会被加载。

### 5.3 环境变量 DCE

使用 `process.env.USER_TYPE` 进行环境特定的代码消除：

```typescript
if (process.env.USER_TYPE === 'ant') {
  // 内部工具专用代码
}
```

外部构建中这些代码会被完全移除。

## 6. 编译时常量 (Defines)

### 6.1 MACRO.* 常量

| 常量 | 类型 | 说明 |
|------|------|------|
| `MACRO.VERSION` | string | 当前版本号 |
| `MACRO.BUILD_TIME` | string | ISO 8601 构建时间戳 |
| `MACRO.PACKAGE_URL` | string | 包名 (claude-code) |
| `MACRO.NATIVE_PACKAGE_URL` | string | 原生包 URL |
| `MACRO.FEEDBACK_CHANNEL` | string | 反馈渠道 (github) |
| `MACRO.ISSUES_EXPLAINER` | string | 问题说明文本 |
| `MACRO.VERSION_CHANGELOG` | string | 版本变更日志 |

### 6.2 process.env.* 常量

| 环境变量 | 值 | 说明 |
|----------|-----|------|
| `USER_TYPE` | "external" / "ant" | 用户类型 |
| `NODE_ENV` | "development" / undefined | 仅开发版本 |
| `CLAUDE_CODE_EXPERIMENTAL_BUILD` | "true" / undefined | 仅开发版本 |
| `CLAUDE_CODE_FORCE_FULL_LOGO` | "true" | 强制完整 Logo |
| `CLAUDE_CODE_VERIFY_PLAN` | "false" | 验证计划标志 |
| `CCR_FORCE_BUNDLE` | "true" | CCR 强制打包 |

## 7. 版本管理

### 7.1 开发版本

开发版本号包含完整的构建信息：

```
1.0.0-dev.20250110.t143052.sha-a1b2c3d4
```

组成部分：
- `1.0.0`: package.json 中的基础版本
- `dev`: 开发版本标识
- `20250110`: 构建日期
- `t143052`: 构建时间（14:30:52）
- `sha-a1b2c3d4`: Git 短哈希

### 7.2 版本变更日志

开发版本的变更日志来自最近的 Git 提交：

```bash
git log --format='%h %s' -20
```

输出最近 20 条提交记录，格式为：
```
a1b2c3d Add new feature
b2d4e5f Fix bug in component
...
```

发布版本的变更日志为 GitHub URL：
```
https://github.com/paoloanzn/claude-code
```

### 7.3 版本比较

使用语义化版本比较进行最小版本检查：

```typescript
import { lt } from './utils/semver.js'

if (lt(MACRO.VERSION, minVersion)) {
  // 版本过低
}
```

## 8. 构建最佳实践

### 8.1 开发流程

```bash
# 1. 标准开发构建
bun run build:dev

# 2. 启用特定功能进行测试
bun run build:dev --feature=VOICE_MODE

# 3. 启用所有实验功能
bun run build:dev --feature-set=dev-full
```

### 8.2 发布流程

```bash
# 1. 标准发布构建
bun run build

# 2. 编译发布构建（生成独立二进制）
bun run compile
```

### 8.3 功能门控最佳实践

1. **使用正向模式**: `if (feature('FLAG'))` 而非 `if (!feature('FLAG'))`
2. **条件导入**: 在 feature() 检查内部使用 require()
3. **避免字符串字面量**: 未启用的功能中的字符串不会被外部构建打包
4. **文档化**: 为每个功能标志添加清晰的文档说明

## 9. 故障排查

### 9.1 功能未生效

1. 检查构建命令是否包含 `--feature`
2. 验证 `feature()` 调用使用正向模式
3. 确认没有使用会被 DCE 移除的负向模式

### 9.2 版本号问题

1. 开发版本：检查 Git 仓库是否可用
2. 发布版本：验证 package.json 中的版本号
3. 编译版本：确认 defines 正确注入

### 9.3 外部依赖问题

确保运行时环境中安装了所有外部依赖：
```bash
npm install @ant/* audio-capture-napi image-processor-napi modifiers-napi url-handler-napi
```

## 10. 相关文件

- `scripts/build.ts`: 主构建脚本
- `package.json`: 版本和依赖配置
- `src/utils/bundledMode.ts`: 打包模式检测
- `docs/feature-gating.md`: 功能门控详细文档
