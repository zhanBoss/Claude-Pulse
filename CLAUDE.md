# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 开发八荣八耻

✅ 以认真查阅为荣，❌ 以暗猜接口为耻
✅ 以寻求确认为荣，❌ 以模糊执行为耻
✅ 以人类确认为荣，❌ 以盲想业务为耻
✅ 以复用现有为荣，❌ 以创造接口为耻
✅ 以主动测试为荣，❌ 以跳过验证为耻
✅ 以遵循规范为荣，❌ 以破坏架构为耻
✅ 以诚实无知为荣，❌ 以假装理解为耻
✅ 以谨慎重构为荣，❌ 以盲目修改为耻

## 核心开发原则

### 0. 遵循以下设计原则

- **单一职责原则 (SRP)**：每个模块只做一件事
- **开闭原则 (OCP)**：对扩展开放，对修改关闭
- **依赖倒置原则 (DIP)**：依赖抽象而非具体实现
- **函数式编程**：
  - 使用箭头函数
  - 避免副作用
  - 数据不可变
  - 组合优于继承

### 1. 代码新增前

- **检查现有逻辑**：新增功能前，必须先检查项目中是否已有类似实现
- **复用优先**：优先使用现有组件、工具函数、API 接口
- **查阅文档**：仔细阅读相关代码和注释，理解业务逻辑
- **确认需求**：不确定的需求必须向用户确认，不要自行臆测

### 2. 代码实现中

- **遵循规范**：严格遵守项目的命名规范、文件结构、代码风格
- **类型安全**：使用 TypeScript，避免使用 any，确保类型完整
- **函数式编程**：项目使用函数式编程，不要使用 function 声明
- **组件化思维**：合理拆分组件，保持单一职责原则

### 3. 代码完成后

- **自查漏洞**：检查逻辑漏洞、边界条件、错误处理
- **清理冗余**：删除无用代码、注释掉的代码、console.log
- **代码合并**：识别可以合并的相似逻辑，使用设计模式统筹管理
- **主动测试**：验证功能是否正常工作，检查是否有 linter 错误

## 开发流程规范

### Step 1: 理解与调研

1. 仔细阅读用户需求
2. 搜索项目中是否有类似功能
3. 查看相关 API 接口定义
4. 确认技术栈和依赖库

### Step 2: 设计与规划

1. 确定文件存放位置（遵循项目结构）
2. 设计组件/函数接口
3. 确认依赖关系
4. 规划复用策略

### Step 3: 编码实现

1. 创建类型定义（types.ts）
2. 实现核心逻辑
3. 添加错误处理
4. 编写必要注释

### Step 4: 测试与优化

1. 运行 linter 检查
2. 手动测试功能
3. 优化代码结构
4. 清理冗余代码

## 常见问题处理

### 遇到不确定的情况

- ❌ 不要：随意猜测、假装理解、盲目实现
- ✅ 应该：明确告知用户不确定的地方，请求澄清

### 遇到复杂的重构

- ❌ 不要：大刀阔斧修改、破坏现有架构
- ✅ 应该：小步迭代、保持向后兼容、充分测试

### 遇到新技术栈

- ❌ 不要：凭经验直接写代码
- ✅ 应该：先查阅项目文档、示例代码、现有实现

---

## 项目概述

CCMonitor 是一个基于 Electron 的桌面应用程序，用于监控和管理 Claude Code 的配置和对话历史。它提供实时监控 Claude Code 的 `history.jsonl` 文件、配置管理和 AI 驱动的对话摘要功能。

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **UI 框架**: Ant Design + Tailwind CSS
- **桌面框架**: Electron 28
- **代码编辑器**: Monaco Editor
- **状态管理**: electron-store 用于持久化设置
- **构建工具**: Vite + electron 插件

## 开发命令

```bash
# 安装依赖
npm install

# 开发模式（运行 Vite 开发服务器 + Electron）
npm run dev

# 构建生产应用
npm run build

# 构建开发版本（启用 DevTools）
npm run build:dev

# 构建生产版本
npm run build:prod

# 清理构建产物
npm run clear:build

# 预览生产构建
npm run preview
```

## 架构设计

### 进程架构

应用遵循 Electron 的多进程架构：

1. **主进程** (`electron/main.ts`):
   - 窗口管理和生命周期
   - 文件系统操作（读写 Claude Code 配置）
   - 所有渲染进程请求的 IPC 处理器
   - 文件监控（通过 `fs.FSWatcher` 监控 `history.jsonl`）
   - electron-store 用于持久化应用设置

2. **渲染进程** (`src/`):
   - React 应用，包含三个主要路由：realtime、history、settings
   - 通过 `window.electronAPI` 与主进程通信（通过 preload 暴露）

3. **预加载脚本** (`electron/preload.ts`):
   - 使用 `contextBridge` 桥接主进程和渲染进程
   - 将安全的 IPC 方法暴露给渲染进程作为 `window.electronAPI`

### 关键文件位置

应用与 Claude Code 的文件交互位置：

- `~/.claude/settings.json` - Claude Code 配置
- `~/.claude/history.jsonl` - 对话历史（JSONL 格式）

### 数据流

1. **配置管理**:
   - 用户在 Monaco Editor 中编辑配置 → IPC 到主进程 → 验证 JSON → 写入 `~/.claude/settings.json`
   - 支持多个 Claude Code 配置的备份/恢复

2. **历史监控**:
   - 主进程使用 `fs.FSWatcher` 监控 `~/.claude/history.jsonl`
   - 文件变化时，读取新行 → 解析 JSONL → 通过 IPC 发送到渲染进程
   - 渲染进程实时显示记录，带语法高亮

3. **AI 摘要**:
   - 支持多个提供商（DeepSeek、Groq、Gemini、自定义）
   - 通过 IPC 事件流式响应（`summary-stream-chunk`、`summary-stream-complete`）
   - API 密钥加密存储在 electron-store 中

### 组件结构

- `App.tsx`: 根组件，处理路由（realtime/history/settings）和主题管理
- `MainLayout.tsx`: 布局包装器，带侧边栏导航
- `LogViewer.tsx`: 实时对话显示
- `HistoryViewer.tsx`: 历史对话浏览器，带搜索功能
- `SettingsView.tsx`: 设置管理（主题、自动启动、AI 配置、Claude 配置备份）
- `ConfigEditor.tsx`: 基于 Monaco 的 JSON 编辑器，用于 Claude Code 设置
- `ConfigFileEditor.tsx`: 基于文件的配置编辑器，带语法高亮

### 状态管理

- **本地状态**: React hooks（`useState`、`useEffect`）用于 UI 状态
- **持久化状态**: electron-store 用于：
  - `recordEnabled`: 历史监控是否激活
  - `savePath`: 保存对话备份的目录
  - 应用设置（主题、自动启动、AI 提供商配置）
  - Claude Code 配置备份

### 主题系统

- 支持 light/dark/system 模式
- 主题定义在 `src/theme.ts`（Ant Design token 自定义）
- 通过 `window.matchMedia('(prefers-color-scheme: dark)')` 检测系统主题

## 重要实现细节

### 文件监控

主进程使用 `fs.FSWatcher` 监控 `history.jsonl`。当文件增长时：

1. 比较当前大小与 `lastFileSize`
2. 只读取新内容（从 `lastFileSize` 到末尾）
3. 解析新的 JSONL 行
4. 通过 `new-record` IPC 事件发送解析后的记录到渲染进程

### JSONL 格式

`history.jsonl` 中的每一行都是一个 JSON 对象：

```json
{
  "timestamp": 1234567890000,
  "project": "/path/to/project",
  "sessionId": "session-id",
  "display": "用户提示或助手响应",
  "pastedContents": {},
  "images": []
}
```

### 构建模式

- **开发模式** (`npm run dev`): Vite 开发服务器 + 热重载
- **开发构建** (`npm run build:dev`): 打包的应用，启用 DevTools（通过 `ELECTRON_DEV_BUILD` 环境变量控制）
- **生产构建** (`npm run build:prod`): 优化的打包应用，不含 DevTools

`__IS_DEV_BUILD__` 全局变量通过 Vite 配置注入，用于显示/隐藏 DevFooter 组件。

### IPC 通信模式

所有渲染进程到主进程的通信遵循此模式：

1. 渲染进程调用 `window.electronAPI.methodName(args)`
2. Preload 转发到 `ipcRenderer.invoke('handler-name', args)`
3. 主进程通过 `ipcMain.handle('handler-name', async (_, args) => {...})` 处理
4. 返回 `{ success: boolean, data?: any, error?: string }`

对于流式传输（AI 摘要），使用基于事件的 IPC：

- 主进程发出：`summary-stream-chunk`、`summary-stream-complete`、`summary-stream-error`
- 渲染进程监听并逐步更新 UI

## 配置文件

- `vite.config.ts`: Vite + Electron 插件配置，定义 `@` 别名为 `./src`
- `tailwind.config.js`: Tailwind CSS 配置
- `package.json`: 脚本、依赖、electron-builder 配置
- `electron-builder.{dev,prod}.yml`: 平台特定的构建配置（如果存在）

## 常见开发模式

### 添加新的 IPC 处理器

1. 在 `electron/main.ts` 中添加处理器：

   ```typescript
   ipcMain.handle('my-handler', async (_, arg) => {
     try {
       // 逻辑
       return { success: true, data: result }
     } catch (error) {
       return { success: false, error: error.message }
     }
   })
   ```

2. 在 `electron/preload.ts` 中暴露：

   ```typescript
   myMethod: arg => ipcRenderer.invoke('my-handler', arg)
   ```

3. 在 `src/types.ts` 中添加类型：

   ```typescript
   export interface ElectronAPI {
     myMethod: (arg: string) => Promise<{ success: boolean; data?: any; error?: string }>
   }
   ```

4. 在渲染进程中使用：
   ```typescript
   const result = await window.electronAPI.myMethod(arg)
   ```

### 读取 Claude Code 文件

读取前始终检查文件是否存在：

```typescript
if (!fs.existsSync(SETTINGS_FILE)) {
  throw new Error('配置文件不存在')
}
const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
```

### 验证 JSON 配置

写入 `settings.json` 前进行验证：

```typescript
JSON.parse(config) // 无效时抛出异常
fs.writeFileSync(SETTINGS_FILE, config, 'utf-8')
```

## 平台特定说明

- **macOS**: 使用 `titleBarStyle: 'hiddenInset'` 实现原生窗口控件
- **窗口管理**: 最小尺寸 800x600，默认 1200x800
- **自动启动**: 通过 Electron 的 `app.setLoginItemSettings()` 管理

## 测试注意事项

- 通过手动追加内容到 `history.jsonl` 测试文件监控
- 使用格式错误的 JSON 测试配置验证
- 测试 system/light/dark 模式下的主题切换
- 测试不同提供商的 AI 摘要
- 验证所有处理器的 IPC 错误处理
