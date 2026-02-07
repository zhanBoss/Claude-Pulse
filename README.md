# CCMonitor

<div align="center">

**Claude Code 配置管理和对话记录监控工具**

一个功能强大的桌面应用，帮助开发者管理 Claude Code 配置、监控对话历史，并提供智能摘要功能。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/zhanBoss/Claude-Code-Monitor/releases)
[![Version](https://img.shields.io/badge/version-1.7.0-green.svg)](https://github.com/zhanBoss/Claude-Code-Monitor/releases)

[English](README.md) | [中文文档](README_zh.md)

</div>

## ✨ 核心功能

### 📊 实时监控
- **实时对话监控**：自动监控 `~/.claude/history.jsonl`，实时显示对话内容
- **快捷搜索**：支持 `Cmd+F` / `Ctrl+F` 快速搜索，关键词高亮
- **智能过滤**：按项目、日期、会话筛选对话记录
- **图片支持**：自动加载和显示对话中的图片内容

### 📁 历史记录
- **完整历史**：自动保存所有对话到本地，支持按需加载
- **强大搜索**：搜索 Prompt 内容，显示匹配上下文
- **导出功能**：支持导出为 Markdown 格式
- **分页浏览**：大数据量场景下的性能优化

### ⚙️ 配置管理
- **可视化编辑**：基于 Monaco Editor 的配置文件编辑器
- **配置备份**：支持多个配置版本的备份和恢复
- **实时预览**：编辑配置时实时语法检查
- **一键应用**：保存后立即生效，无需重启

### 🤖 AI 助手
- **智能摘要**：AI 驱动的对话总结，提取关键信息
- **多提供商支持**：支持 DeepSeek、Groq、Gemini 和自定义提供商
- **流式输出**：实时显示 AI 生成过程
- **免费额度**：Groq 和 Gemini 提供免费 API 调用

### 🎯 常用 Prompt
- **快速复制**：点击卡片直接复制内容
- **拖拽排序**：自定义 Prompt 顺序
- **搜索功能**：快速查找所需 Prompt
- **分类管理**：支持自定义分类和标签

### 🎨 界面优化
- **主题切换**：支持浅色/深色/跟随系统三种模式
- **响应式设计**：适配不同屏幕尺寸
- **优雅动画**：流畅的过渡效果和交互反馈
- **macOS 原生感**：完美适配 macOS 窗口样式

## 🛠️ 技术栈

### 核心框架
- **[Electron 28](https://www.electronjs.org/)** - 跨平台桌面应用框架
- **[React 18](https://react.dev/)** - 现代化的用户界面库
- **[TypeScript 5.3](https://www.typescriptlang.org/)** - 类型安全的 JavaScript 超集
- **[Vite 5](https://vitejs.dev/)** - 下一代前端构建工具

### UI & 样式
- **[Ant Design 6.x](https://ant.design/)** - 企业级 UI 设计语言和组件库
- **[@ant-design/x](https://x.ant.design/)** - AI 驱动的组件扩展
- **[Tailwind CSS 3.3](https://tailwindcss.com/)** - 实用优先的 CSS 框架
- **[@ant-design/icons](https://ant.design/components/icon/)** - 图标库

### 编辑器与代码
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** - VS Code 同款代码编辑器
- **[@monaco-editor/react](https://github.com/suren-atoyan/monaco-react)** - Monaco 的 React 封装
- **[React Syntax Highlighter](https://github.com/react-syntax-highlighter/react-syntax-highlighter)** - 代码语法高亮
- **[React Markdown](https://github.com/remarkjs/react-markdown)** - Markdown 渲染器

### Markdown 增强
- **[remark-gfm](https://github.com/remarkjs/remark-gfm)** - GitHub 风格 Markdown 支持
- **[remark-math](https://github.com/remarkjs/remark-math)** - 数学公式支持
- **[rehype-katex](https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex)** - KaTeX 数学渲染
- **[rehype-slug](https://github.com/rehypejs/rehype-slug)** - 标题自动生成 ID
- **[rehype-autolink-headings](https://github.com/rehypejs/rehype-autolink-headings)** - 标题自动添加锚点

### 工具库
- **[electron-store](https://github.com/sindresorhus/electron-store)** - Electron 数据持久化
- **[dayjs](https://day.js.org/)** - 轻量级日期处理库
- **[crypto-js](https://github.com/brix/crypto-js)** - 加密库（API Key 加密）
- **[react-highlight-words](https://github.com/bvaughn/react-highlight-words)** - 关键词高亮
- **[sortablejs](https://github.com/SortableJS/Sortable)** - 拖拽排序库

### 开发工具
- **[electron-builder](https://www.electron.build/)** - Electron 应用打包
- **[vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)** - Vite 的 Electron 插件
- **[concurrently](https://github.com/open-cli-tools/concurrently)** - 并发运行多个命令
- **[cross-env](https://github.com/kentcdodds/cross-env)** - 跨平台环境变量设置
- **[rimraf](https://github.com/isaacs/rimraf)** - 跨平台删除工具

## 📦 安装

### macOS

从 [Releases](https://github.com/zhanBoss/Claude-Code-Monitor/releases) 下载最新版本的 DMG 文件。

**重要提示**：由于应用未经过 Apple 公证，首次打开时可能会提示"已损坏"。请按以下步骤操作：

#### 方法 1：使用终端命令（推荐）

```bash
# 下载并安装 CCMonitor-x.x.x-arm64.dmg 后，执行：
xattr -cr /Applications/CCMonitor.app
```

#### 方法 2：系统设置允许

1. 尝试打开应用，点击"取消"
2. 打开"系统设置" → "隐私与安全性"
3. 找到关于 CCMonitor 的提示，点击"仍要打开"

### Windows & Linux

从 [Releases](https://github.com/zhanBoss/Claude-Code-Monitor/releases) 下载对应平台的安装包。

## 🚀 开发

### 前置要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0（**强制使用 pnpm**）

### 快速开始

```bash
# 安装 pnpm（如果未安装）
npm install -g pnpm

# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm run dev

# 构建应用
pnpm run build

# 构建开发版（启用 DevTools）
pnpm run build:dev

# 构建生产版
pnpm run build:prod

# 清理构建产物
pnpm run clear:build
```

> ⚠️ **注意**：本项目强制使用 pnpm 作为包管理器。如果使用 npm 或 yarn，会自动报错并阻止安装。

### 项目结构

```
claude-code-monitor/
├── electron/              # Electron 主进程和预加载脚本
│   ├── main.ts           # 主进程入口
│   └── preload.ts        # 预加载脚本
├── src/                  # React 渲染进程
│   ├── components/       # React 组件
│   ├── types.ts          # TypeScript 类型定义
│   ├── theme.ts          # 主题配置
│   └── App.tsx           # 应用入口
├── build/                # 构建资源（图标等）
├── scripts/              # 构建和安装脚本
└── CLAUDE.md            # 开发规范指南
```

### 开发规范

请阅读 [CLAUDE.md](CLAUDE.md) 了解详细的开发规范和最佳实践。

## 📖 使用指南

### 基础使用

1. **启动应用**：应用会自动检测 Claude Code 安装状态
2. **配置管理**：左侧侧边栏点击"应用设置"管理 Claude Code 配置
3. **实时监控**：在"实时对话"页面查看当前对话
4. **历史浏览**：在"历史记录"页面查看所有保存的对话
5. **AI 摘要**：配置 AI 提供商后，点击"AI 总结"按钮生成摘要

### AI 总结功能

1. 进入"应用设置" → "AI 功能"
2. 选择 AI 提供商（DeepSeek / Groq / Gemini / 自定义）
3. 填入 API Key：
   - DeepSeek: https://platform.deepseek.com/api_keys
   - Groq: https://console.groq.com/keys
   - Gemini: https://aistudio.google.com/app/apikey
4. 保存设置后即可使用 AI 总结功能

### 快捷键

- `Cmd+F` / `Ctrl+F` - 打开搜索框
- `ESC` - 关闭搜索框或弹窗
- `Cmd+,` / `Ctrl+,` - 打开设置（计划中）

## 📝 记录格式

对话记录以 JSONL 格式存储，文件名：`{项目名}_{日期}.jsonl`

```json
{
  "timestamp": "2026-02-07T10:55:00.000Z",
  "project": "/path/to/project",
  "sessionId": "session-id-123",
  "display": "用户提问内容或 AI 回复",
  "pastedContents": {},
  "images": ["screenshot1.png"]
}
```

## 🔒 隐私与安全

- ✅ 所有数据存储在本地，不上传任何服务器
- ✅ API Key 使用 AES 加密存储
- ✅ 应用完全开源，代码可审查
- ✅ 无任何第三方追踪或统计

## 🌟 版本历史

查看 [更新日志](src/components/ChangelogView.tsx) 了解详细的版本历史。

### 最新版本 v1.7.0 (2026-02-07)

- 🎨 设置页面导航栏优化：默认收起，hover 展开
- ✨ 移除左侧 Sidebar 自动收起功能，保持固定宽度
- 💫 优化过渡动画，提升用户体验
- 🐛 修复导航栏高亮跟随问题

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 开源协议

本项目采用 [MIT](LICENSE) 协议开源。

## 🙏 致谢

感谢以下开源项目：

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://react.dev/) - 用户界面库
- [Ant Design](https://ant.design/) - 企业级 UI 设计语言
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code 同款编辑器
- [Vite](https://vitejs.dev/) - 下一代前端构建工具

## 📧 联系方式

- GitHub: [@zhanBoss](https://github.com/zhanBoss)
- 问题反馈: [GitHub Issues](https://github.com/zhanBoss/Claude-Code-Monitor/issues)

---

<div align="center">

**如果这个项目对你有帮助，请给个 Star ⭐**

Made with ❤️ by [mrZhan](https://github.com/zhanBoss)

</div>
