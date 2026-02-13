# ClaudePulse

<div align="center">

**Claude Code Configuration Management and Conversation Monitoring Tool**

A powerful desktop application that helps developers manage Claude Code configurations, monitor conversation history, and provides intelligent summary features.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/zhanBoss/Claude-Pulse/releases)
[![Version](https://img.shields.io/badge/version-2.0.0-green.svg)](https://github.com/zhanBoss/Claude-Pulse/releases)

[English](README.md) | [中文文档](README_zh.md)

</div>

## ✨ Core Features

### 📊 Real-time Monitoring & History

- **Real-time Conversation Monitoring**: Automatically monitors `~/.claude/history.jsonl`, displays conversations by rounds
- **Quick Search**: Support `Cmd+F` / `Ctrl+F` to quickly search Prompt content with keyword highlighting
- **Smart Filtering**: Filter conversation records by project, date, and session
- **Round-based Browsing**: Unified round card design, click to view complete conversation details
- **Image Support**: Automatically loads and displays images in conversations, supports round-based display
- **Export Function**: Export to Markdown format with code block syntax highlighting

### 📈 Global Statistics & Analysis

- **Statistics Panel**: Core metrics analysis including Token usage, API costs, tool call frequency
- **Project Comparison**: Multi-project radar charts and bar charts for intuitive project differences
- **Session Comparison**: Multi-select sessions for side-by-side comparison of statistics and tool usage
- **Session Board**: Session heatmap with pixel view showing all sessions, supports metric coloring and range filtering
- **Tool Analysis**: Tool call flow visualization, success rate statistics, average duration ranking

### 📝 File Modification Tracking

- **Recent Edits**: Independent page showing file modification history with quick jump to related sessions
- **File Snapshots**: Automatically saves file content before and after modifications
- **Diff Comparison**: Visual comparison of file changes before and after
- **File Restoration**: Support restoring files to their pre-modification state from snapshots

### ⚙️ Configuration Management

- **Claude Configuration**: Visual editor based on Monaco Editor, supports configuration backup and restore
- **MCP Management**: MCP service configuration management, supports marketplace capability extensions
- **Hooks / Skills / Plugins**: Independent management modules, supports configuration import/export and real-time preview
- **Real-time Preview**: Real-time syntax checking when editing configurations, takes effect immediately after saving

### 🤖 AI Assistant

- **Smart Summary**: AI-driven conversation summaries, extracting key information
- **AI Conversation**: Supports Markdown rendering, typewriter effect, code block copying, regenerate responses
- **@ Reference**: Support referencing historical conversation content to AI assistant for contextual dialogue
- **Multi-provider Support**: Supports DeepSeek, Groq, Gemini, and custom providers
- **Streaming Output**: Real-time display of AI generation process

### 🎯 Common Prompts

- **Quick Copy**: Click card to directly copy content
- **Drag & Sort**: Customize Prompt order
- **Search Function**: Quickly find desired Prompts, supports keyboard navigation

### 🎨 Interface Optimization

- **Theme Switching**: Supports light/dark/system three modes, unified theme color system
- **Responsive Design**: Adapts to different screen sizes, optimized for drawer and desktop scenarios
- **Elegant Animations**: Smooth transition effects and interaction feedback
- **macOS Native Feel**: Perfect adaptation to macOS window style

## 🛠️ Tech Stack

### Core Frameworks

- **[Electron 28](https://www.electronjs.org/)** - Cross-platform desktop application framework
- **[React 18](https://react.dev/)** - Modern user interface library
- **[TypeScript 5.3](https://www.typescriptlang.org/)** - Type-safe JavaScript superset
- **[Vite 5](https://vitejs.dev/)** - Next-generation frontend build tool

### UI & Styling

- **[Ant Design 6.x](https://ant.design/)** - Enterprise-level UI design language and component library
- **[@ant-design/x](https://x.ant.design/)** - AI-driven component extensions
- **[Tailwind CSS 3.3](https://tailwindcss.com/)** - Utility-first CSS framework
- **[@ant-design/icons](https://ant.design/components/icon/)** - Icon library

### Editor & Code

- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** - VS Code's editor
- **[@monaco-editor/react](https://github.com/suren-atoyan/monaco-react)** - React wrapper for Monaco
- **[React Syntax Highlighter](https://github.com/react-syntax-highlighter/react-syntax-highlighter)** - Code syntax highlighting
- **[React Markdown](https://github.com/remarkjs/react-markdown)** - Markdown renderer

### Markdown Enhancements

- **[remark-gfm](https://github.com/remarkjs/remark-gfm)** - GitHub Flavored Markdown support
- **[remark-math](https://github.com/remarkjs/remark-math)** - Math formula support
- **[rehype-katex](https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex)** - KaTeX math rendering
- **[rehype-slug](https://github.com/rehypejs/rehype-slug)** - Auto-generate heading IDs
- **[rehype-autolink-headings](https://github.com/rehypejs/rehype-autolink-headings)** - Auto-add heading anchors

### Utility Libraries

- **[electron-store](https://github.com/sindresorhus/electron-store)** - Electron data persistence
- **[dayjs](https://day.js.org/)** - Lightweight date handling library
- **[crypto-js](https://github.com/brix/crypto-js)** - Encryption library (API Key encryption)
- **[react-highlight-words](https://github.com/bvaughn/react-highlight-words)** - Keyword highlighting
- **[sortablejs](https://github.com/SortableJS/Sortable)** - Drag & drop sorting library
- **[recharts](https://recharts.org/)** - React charting library (statistics panel)
- **[diff](https://github.com/kpdecker/jsdiff)** - File diff comparison library

### Development Tools

- **[electron-builder](https://www.electron.build/)** - Electron app packaging
- **[vite-plugin-electron](https://github.com/electron-vite/vite-plugin-electron)** - Vite plugin for Electron
- **[concurrently](https://github.com/open-cli-tools/concurrently)** - Run multiple commands concurrently
- **[cross-env](https://github.com/kentcdodds/cross-env)** - Cross-platform environment variable setting
- **[rimraf](https://github.com/isaacs/rimraf)** - Cross-platform deletion tool

## 📦 Installation

### macOS

Download the latest DMG file from [Releases](https://github.com/zhanBoss/Claude-Pulse/releases).

**Important Note**: Since the app is not notarized by Apple, you may see a "damaged" warning on first launch. Please follow these steps:

#### Method 1: Using Terminal Command (Recommended)

```bash
# After downloading and installing ClaudePulse-x.x.x-arm64.dmg, run:
xattr -cr /Applications/ClaudePulse.app
```

#### Method 2: System Settings Allow

1. Try to open the app, click "Cancel"
2. Open "System Settings" → "Privacy & Security"
3. Find the prompt about ClaudePulse, click "Open Anyway"

### Windows & Linux

Download the installer for your platform from [Releases](https://github.com/zhanBoss/Claude-Pulse/releases).

## 🚀 Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0 (**pnpm is mandatory**)

### Quick Start

```bash
# Install pnpm (if not installed)
npm install -g pnpm

# Install dependencies
pnpm install

# Development mode (hot reload)
pnpm run dev

# Build application
pnpm run build

# Build development version (with DevTools enabled)
pnpm run build:dev

# Build production version
pnpm run build:prod

# Clean build artifacts
pnpm run clear:build
```

> ⚠️ **Note**: This project mandates pnpm as the package manager. Using npm or yarn will automatically error and block installation.

### Project Structure

```
claude-pulse/
├── electron/              # Electron main process and preload scripts
│   ├── main.ts           # Main process entry
│   └── preload.ts        # Preload script
├── src/                  # React renderer process
│   ├── components/       # React components
│   ├── types.ts          # TypeScript type definitions
│   ├── theme.ts          # Theme configuration
│   └── App.tsx           # Application entry
├── build/                # Build resources (icons, etc.)
├── scripts/              # Build and installation scripts
└── CLAUDE.md            # Development guidelines
```

### Development Guidelines

Please read [CLAUDE.md](CLAUDE.md) for detailed development guidelines and best practices.

## 📖 User Guide

### Basic Usage

1. **Launch App**: The app automatically detects Claude Code installation status
2. **Real-time Monitoring**: View current conversations in "Real-time Conversation" page, displayed by rounds
3. **History Browsing**: View all saved conversations in "History" page, supports project filtering and Prompt search
4. **Statistics Analysis**: View Token usage, costs, tool calls, and other data in "Statistics Panel"
5. **File Tracking**: View file modification history in "Recent Edits" page, supports snapshot comparison and restoration
6. **Configuration Management**: Manage Claude Code configuration, MCP, Hooks, Skills, Plugins in "App Settings"
7. **AI Features**: After configuring AI provider, use AI summary and AI conversation features

### AI Summary Feature

1. Go to "App Settings" → "AI Features"
2. Select AI provider (DeepSeek / Groq / Gemini / Custom)
3. Enter API Key:
   - DeepSeek: https://platform.deepseek.com/api_keys
   - Groq: https://console.groq.com/keys
   - Gemini: https://aistudio.google.com/app/apikey
4. Save settings to use AI summary feature

### Keyboard Shortcuts

- `Cmd+F` / `Ctrl+F` - Open search box
- `ESC` - Close search box or popup
- `Cmd+,` / `Ctrl+,` - Open settings (planned)

## 📝 Record Format

Conversation records are stored in JSONL format, filename: `{project-name}_{date}.jsonl`

```json
{
  "timestamp": "2026-02-07T10:55:00.000Z",
  "project": "/path/to/project",
  "sessionId": "session-id-123",
  "display": "User question or AI response",
  "pastedContents": {},
  "images": ["screenshot1.png"]
}
```

## 🔒 Privacy & Security

- ✅ All data stored locally, no server uploads
- ✅ API Keys encrypted with AES
- ✅ Fully open source, code is auditable
- ✅ No third-party tracking or analytics

## 🌟 Version History

See [Changelog](src/components/ChangelogView.tsx) for detailed version history.

### Latest Version v2.0.0 (2026-02-13)

#### 🎯 Global Statistics & Analysis System

- ✨ Added global statistics panel, supports Token/cost/tool call and other core metrics analysis
- ✨ Added project comparison, session comparison, and Session Board capabilities
- ✨ Added tool call flow visualization, supports call chain and input/output details viewing

#### 📝 File Modification Tracking System

- ✨ Added file modification tracking, snapshot viewing, Diff comparison, and file restoration complete workflow
- ✨ Added "Recent Edits" page with quick jump to related sessions

#### ⚙️ Configuration Management Enhancements

- ✨ Added MCP management system, supports service configuration and marketplace capability extensions
- ✨ Added Hooks / Skills / Plugins independent management modules with configuration import/export

#### 🎨 Interface & Interaction Refactoring

- 🔧 Refactored real-time conversation and history pages, unified round-based browsing and detail interaction experience
- 🔧 History supports project filtering, search upgraded to Prompt content search with highlighting
- 🔧 Settings page layout and navigation system refactored, optimized drawer and desktop scenario title alignment
- 🔧 Unified project naming to ClaudePulse, synchronized build configuration and documentation
- 🔧 Unified theme color system and cleaned up hardcoded colors, improved global visual consistency

#### 🐛 Bug Fixes

- 🐛 Fixed file monitoring not triggering, conversation detail rendering issues, and file snapshot reading problems
- 🐛 Fixed Prompt list internal message misidentification, duplicate counting, and sorting issues

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

This project is licensed under the [MIT](LICENSE) license.

## 🙏 Acknowledgments

Thanks to the following open source projects:

- [Electron](https://www.electronjs.org/) - Cross-platform desktop application framework
- [React](https://react.dev/) - User interface library
- [Ant Design](https://ant.design/) - Enterprise-level UI design language
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code's editor
- [Vite](https://vitejs.dev/) - Next-generation frontend build tool

## 📧 Contact

- GitHub: [@zhanBoss](https://github.com/zhanBoss)
- Issue Feedback: [GitHub Issues](https://github.com/zhanBoss/Claude-Pulse/issues)

---

<div align="center">

**If this project helps you, please give it a Star ⭐**

Made with ❤️ by [mrZhan](https://github.com/zhanBoss)

</div>
