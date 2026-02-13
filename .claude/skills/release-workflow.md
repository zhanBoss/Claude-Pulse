---
name: release-workflow
description: 发布新版本的完整工作流程
triggers:
  - '发布新版本'
  - '打包发布'
  - '推送远程'
  - '创建 release'
  - 'publish'
  - 'release'
---

# 发布工作流程

每次发布新版本时，必须按照以下步骤执行：

## 📋 发布前检查清单

### 1. 确认版本号

- 检查 `package.json` 中的版本号
- 确认版本号遵循语义化版本规范（semver）
  - 主版本号：不兼容的 API 修改
  - 次版本号：向下兼容的功能性新增
  - 修订号：向下兼容的问题修正

### 2. 更新文档（必做）

按以下顺序更新文档：

#### 2.1 更新 CHANGELOG.md

- 在文件开头添加新版本记录
- 格式示例：

```markdown
## [1.6.0] - 2026-02-05

### Added

- 新增功能描述
  - 具体功能点1
  - 具体功能点2

### Improved

- 改进功能描述
  - 具体改进点1
  - 具体改进点2

### Fixed

- 修复的问题描述
  - 具体修复点1
  - 具体修复点2
```

#### 2.2 创建/更新 RELEASE_NOTES_vX.X.X.md

- 文件名格式：`RELEASE_NOTES_v{版本号}.md`
- 内容应包括：
  - ✨ 新功能
  - 🎯 功能改进
  - 🐛 Bug 修复
  - 🛠️ 技术改进
  - 📚 文档更新
  - 📋 如何使用新功能
  - 📦 下载链接

#### 2.3 检查其他文档

- README.md（如有版本相关内容）
- 用户指南（如有更新）

### 3. 代码质量检查

- 运行 `npm run lint` 检查代码规范
- 运行 `npm run build` 确保构建成功
- 测试核心功能是否正常工作

## 🚀 发布步骤

### 步骤 1: 提交所有更改

```bash
git add -A
git status  # 确认要提交的文件
git commit -m "release: v{版本号}

主要更新：
- 功能1
- 功能2
- 修复3

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### 步骤 2: 创建版本标签

```bash
git tag -a v{版本号} -m "Release v{版本号}"
```

### 步骤 3: 推送到远程

```bash
# 推送代码
git push origin main

# 推送标签
git push origin v{版本号}
```

### 步骤 4: 构建发布包

```bash
# 构建生产版本
npm run build:prod

# 使用 electron-builder 打包
npm run dist
```

### 步骤 5: 创建 GitHub Release

1. 访问 https://github.com/zhanBoss/Claude-Pulse/releases/new
2. 选择刚创建的标签
3. 设置 Release 标题：`v{版本号}`
4. 复制 `RELEASE_NOTES_v{版本号}.md` 的内容到描述框
5. 上传打包好的安装包（在 `dist/` 目录下）：
   - macOS: `.dmg` 和 `.zip`
   - Windows: `.exe`
   - Linux: `.AppImage` 和 `.deb`
6. 点击 "Publish release"

## ⚠️ 重要提醒

### 必做事项（否则发布失败）

1. ✅ **更新 CHANGELOG.md**
2. ✅ **创建/更新 RELEASE_NOTES_vX.X.X.md**
3. ✅ **确认版本号一致性**（package.json、标签、发布说明）
4. ✅ **测试构建成功**
5. ✅ **推送标签到远程**

### 版本号规则

- **补丁版本** (1.0.x)：Bug 修复、小优化
- **次版本** (1.x.0)：新功能、功能改进
- **主版本** (x.0.0)：重大更新、破坏性变更

### 提交信息规范

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `style:` - 代码格式调整
- `refactor:` - 代码重构
- `perf:` - 性能优化
- `test:` - 测试相关
- `chore:` - 构建/工具相关
- `release:` - 版本发布

## 📝 快速检查表

发布前确认：

- [ ] 版本号已更新（package.json）
- [ ] CHANGELOG.md 已更新
- [ ] RELEASE_NOTES_vX.X.X.md 已创建/更新
- [ ] 代码已提交并推送
- [ ] 版本标签已创建并推送
- [ ] 构建成功（npm run build:prod）
- [ ] 安装包已生成（npm run dist）
- [ ] GitHub Release 已创建
- [ ] 安装包已上传

## 🔄 回滚方案

如果发布出现问题：

```bash
# 删除本地标签
git tag -d v{版本号}

# 删除远程标签
git push origin :refs/tags/v{版本号}

# 回退提交（如果需要）
git reset --hard HEAD~1
git push origin main --force  # 谨慎使用
```

## 💡 使用此 Skill

当你需要发布新版本时，只需说：

- "发布新版本"
- "创建 v1.6.0 release"
- "打包发布 1.6.0"

我会自动引导你完成所有必要步骤，确保不遗漏任何文档更新。
