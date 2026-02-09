# 🔨 构建指南

CCMonitor 提供了三种构建脚本，满足不同场景的需求。

---

## 📦 构建脚本

### 1️⃣ `npm run build:dev` - 开发调试版本

**用途**：构建带有开发者工具的版本，方便调试和测试。

**特性**：

- ✅ 自动打开开发者控制台 (DevTools)
- ✅ 应用名称：CCMonitor-Dev
- ✅ 输出目录：`debug/`
- ✅ 文件名：`CCMonitor-Dev-1.3.0-arm64.dmg`

**使用场景**：

- 给测试人员使用，方便他们查看控制台日志
- 自己调试问题时使用
- 分享给其他开发者协作调试

**命令**：

```bash
npm run clear:build && npm run build:dev
```

**输出文件**：

- macOS: `debug/CCMonitor-Dev-1.3.0-arm64.dmg`
- macOS: `debug/CCMonitor-Dev-1.3.0-arm64-mac.zip`

---

### 2️⃣ `npm run build:prod` - 正式发布版本

**用途**：构建正式的生产版本，用于发布和分享给最终用户。

**特性**：

- ❌ 不显示开发者控制台
- ✅ 应用名称：CCMonitor
- ✅ 输出目录：`release/`
- ✅ 文件名：`CCMonitor-1.3.0-arm64.dmg`
- ✅ 用户体验友好，无调试信息

**使用场景**：

- 上传到 GitHub Release
- 分享给最终用户
- 正式发布新版本

**命令**：

```bash
npm run clear:build && npm run build:prod
```

**输出文件**：

- macOS: `release/CCMonitor-1.3.0-arm64.dmg`
- macOS: `release/CCMonitor-1.3.0-arm64-mac.zip`

---

### 3️⃣ `npm run clear:build` - 清理构建产物

**用途**：清理所有构建产物，保持项目目录整洁。

**清理内容**：

- `release/` - 生产版本输出目录
- `debug/` - 开发版本输出目录
- `dist/` - 前端构建产物
- `dist-electron/` - Electron 构建产物
- `build/icons/` - 临时图标文件
- `build/icons-rounded/` - 临时圆角图标文件

**使用场景**：

- 每次构建前清理旧文件
- 避免旧版本文件混淆
- 释放磁盘空间

**命令**：

```bash
npm run clear:build
```

---

## 🎯 典型工作流程

### 场景 1：给测试人员构建调试版本

```bash
# 1. 清理旧文件
npm run clear:build

# 2. 构建开发版本
npm run build:dev

# 3. 分享文件
# debug/CCMonitor-Dev-1.3.0-arm64.dmg
```

### 场景 2：发布新版本到 GitHub Release

```bash
# 1. 清理旧文件
npm run clear:build

# 2. 构建生产版本
npm run build:prod

# 3. 上传到 GitHub Release
# release/CCMonitor-1.3.0-arm64.dmg
```

### 场景 3：同时构建两个版本

```bash
# 1. 清理
npm run clear:build

# 2. 构建开发版
npm run build:dev

# 3. 构建生产版
npm run build:prod

# 现在你有两个版本：
# - debug/CCMonitor-Dev-1.3.0-arm64.dmg (带 DevTools)
# - release/CCMonitor-1.3.0-arm64.dmg (不带 DevTools)
```

---

## 📊 版本对比

| 特性               | 开发版 (build:dev)            | 生产版 (build:prod)       |
| ------------------ | ----------------------------- | ------------------------- |
| **应用名称**       | CCMonitor-Dev                 | CCMonitor                 |
| **文件名**         | CCMonitor-Dev-1.3.0-arm64.dmg | CCMonitor-1.3.0-arm64.dmg |
| **输出目录**       | debug/                        | release/                  |
| **DevTools**       | ✅ 自动打开                   | ❌ 不显示                 |
| **适用对象**       | 测试人员、开发者              | 最终用户                  |
| **App ID**         | com.ccmonitor.dev             | com.ccmonitor.app         |
| **GitHub Release** | ❌ 不推荐上传                 | ✅ 推荐上传               |

---

## 🔍 文件位置

构建完成后，你可以在这些位置找到安装包：

### 开发版本

```
debug/
├── CCMonitor-Dev-1.3.0-arm64.dmg          # macOS 安装镜像
├── CCMonitor-Dev-1.3.0-arm64-mac.zip      # macOS ZIP 压缩包
└── mac-arm64/
    └── CCMonitor-Dev.app                   # macOS 应用程序
```

### 生产版本

```
release/
├── CCMonitor-1.3.0-arm64.dmg               # macOS 安装镜像
├── CCMonitor-1.3.0-arm64-mac.zip           # macOS ZIP 压缩包
└── mac-arm64/
    └── CCMonitor.app                        # macOS 应用程序
```

---

## 💡 提示

1. **构建前清理**：建议每次构建前运行 `npm run clear:build`，避免旧文件干扰。

2. **文件名区分**：开发版文件名包含 `-Dev` 后缀，一眼就能区分。

3. **目录隔离**：开发版和生产版存放在不同目录，不会相互覆盖。

4. **版本号**：版本号来自 `package.json` 的 `version` 字段。

5. **跨平台**：虽然目前只构建 macOS 版本，但配置文件已支持 Windows 和 Linux。

---

## ❓ 常见问题

**Q: 为什么需要两个版本？**
A: 开发版方便调试查看控制台，生产版提供纯净的用户体验。

**Q: 可以同时安装两个版本吗？**
A: 可以！它们的 App ID 不同（com.ccmonitor.dev vs com.ccmonitor.app），可以共存。

**Q: 如何在 GitHub Actions 中使用？**
A: 使用 `npm run build:prod` 构建生产版本并上传 `release/` 目录下的文件。

**Q: 构建失败怎么办？**
A: 先运行 `npm run clear:build` 清理，然后重新构建。

---

## 🚀 下一步

构建完成后，你可以：

1. **本地测试**：直接双击 `.dmg` 文件安装测试
2. **分享给小伙伴**：将 `.dmg` 文件发送给他们
3. **上传 GitHub Release**：使用 `gh release upload` 命令
4. **自动化构建**：通过 GitHub Actions 自动构建全平台版本
