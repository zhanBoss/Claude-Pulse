# 📦 ClaudePulse 发布完整指南

> **适用人群**: GitHub 新手、第一次发布应用的开发者
> **目标**: 从本地代码到 GitHub Release 的完整流程，保证一次成功

---

## 📚 目录

1. [前置准备](#前置准备)
2. [环境配置](#环境配置)
3. [发布流程](#发布流程)
4. [常见问题](#常见问题)
5. [快速检查清单](#快速检查清单)

---

## 🎯 前置准备

### 1. 必需工具安装

#### 1.1 安装 Node.js 和 pnpm

```bash
# 检查是否已安装 Node.js (需要 18.0.0 或更高版本)
node --version

# 如果未安装，访问 https://nodejs.org/ 下载安装

# 安装 pnpm (项目使用的包管理器)
npm install -g pnpm

# 验证安装
pnpm --version
```

#### 1.2 安装 GitHub CLI (gh)

```bash
# macOS 使用 Homebrew 安装
brew install gh

# 验证安装
gh --version

# 登录 GitHub 账号
gh auth login
# 按提示选择：
# 1. GitHub.com
# 2. HTTPS
# 3. Login with a web browser (推荐)
# 4. 在浏览器中完成授权
```

**为什么需要 gh CLI?**

- 可以直接从命令行上传文件到 GitHub Release
- 无需手动在网页上传大文件
- 支持自动化脚本

#### 1.3 配置 Git

```bash
# 检查 Git 配置
git config --global user.name
git config --global user.email

# 如果未配置，设置你的信息
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

### 2. 项目依赖安装

```bash
# 进入项目目录
cd /path/to/claude-pulse

# 安装项目依赖
pnpm install

# 验证安装成功
pnpm run dev  # 启动开发服务器测试
# 按 Ctrl+C 停止
```

---

## ⚙️ 环境配置

### 1. GitHub Token 配置 (可选)

如果你想使用自动发布功能，需要配置 GitHub Token。

#### 1.1 创建 GitHub Personal Access Token

1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" → "Generate new token (classic)"
3. 设置 Token 信息:
   - **Note**: `ClaudePulse Release Token`
   - **Expiration**: 选择过期时间 (建议 90 days)
   - **Select scopes**: 勾选 `repo` (完整权限)
4. 点击 "Generate token"
5. **重要**: 复制生成的 token (只显示一次!)

#### 1.2 配置 Token 到环境变量

**临时配置 (当前终端会话有效)**:

```bash
export GH_TOKEN=ghp_your_token_here
```

**永久配置 (推荐)**:

```bash
# 编辑 shell 配置文件
# 如果使用 zsh (macOS 默认)
nano ~/.zshrc

# 如果使用 bash
nano ~/.bash_profile

# 在文件末尾添加:
export GH_TOKEN=ghp_your_token_here

# 保存并退出 (Ctrl+O, Enter, Ctrl+X)

# 重新加载配置
source ~/.zshrc  # 或 source ~/.bash_profile
```

### 2. 验证配置

```bash
# 验证 gh CLI 已登录
gh auth status

# 验证 Token (如果配置了)
echo $GH_TOKEN

# 验证可以访问仓库
gh repo view zhanBoss/Claude-Pulse
```

---

## 🚀 发布流程

### 步骤 0: 发布前准备

#### 0.1 确定版本号

版本号遵循 [语义化版本规范](https://semver.org/lang/zh-CN/):

- **主版本号 (Major)**: 不兼容的 API 修改 (例: 1.0.0 → 2.0.0)
- **次版本号 (Minor)**: 向下兼容的功能新增 (例: 1.0.0 → 1.1.0)
- **修订号 (Patch)**: 向下兼容的问题修正 (例: 1.0.0 → 1.0.1)

**示例**:

- 修复了几个 Bug → 1.7.0 → 1.7.1
- 新增了新功能 → 1.7.0 → 1.8.0
- 重大架构调整 → 1.7.0 → 2.0.0

#### 0.2 更新版本号

```bash
# 编辑 package.json
nano package.json

# 找到 "version" 字段，修改为新版本号
# 例如: "version": "1.8.0"

# 保存并退出
```

#### 0.3 更新更新日志

创建或更新 `CHANGELOG.md`:

```bash
# 编辑 CHANGELOG.md
nano CHANGELOG.md
```

在文件开头添加新版本记录:

```markdown
## [1.8.0] - 2026-02-08

### ✨ 新功能

- 添加了 XXX 功能
- 支持 YYY 特性

### 🎯 改进

- 优化了 AAA 性能
- 改进了 BBB 体验

### 🐛 修复

- 修复了 CCC 问题
- 解决了 DDD 崩溃

---

## [1.7.0] - 2026-02-08

...
```

### 步骤 1: 提交代码

```bash
# 1. 查看当前修改
git status

# 2. 添加所有修改到暂存区
git add -A

# 3. 再次确认要提交的文件
git status

# 4. 提交代码 (使用规范的提交信息)
git commit -m "release: v1.8.0

主要更新:
- 新增 XXX 功能
- 优化 YYY 性能
- 修复 ZZZ 问题

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"

# 5. 推送到远程仓库
git push origin main
```

**提交信息规范**:

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `style:` - 代码格式
- `refactor:` - 代码重构
- `perf:` - 性能优化
- `release:` - 版本发布

### 步骤 2: 创建 Git 标签

```bash
# 1. 创建带注释的标签
git tag -a v1.8.0 -m "Release v1.8.0"

# 2. 查看标签是否创建成功
git tag -l

# 3. 推送标签到远程
git push origin v1.8.0

# 或者推送所有标签
git push origin --tags
```

**为什么需要标签?**

- GitHub Release 基于 Git 标签创建
- 标签标记了代码的特定版本
- 用户可以下载特定版本的源代码

### 步骤 3: 构建应用

```bash
# 1. 清理旧的构建产物
pnpm run clear:build

# 2. 构建生产版本
pnpm run build:prod

# 等待构建完成 (大约 1-2 分钟)
# 构建成功后会显示:
# ✓ built in XXs
# • building target=DMG arch=arm64 file=release/ClaudePulse-1.8.0-arm64.dmg
```

**构建产物位置**:

```
release/
├── ClaudePulse-1.8.0-arm64.dmg          # macOS 安装镜像 (95MB)
├── ClaudePulse-1.8.0-arm64-mac.zip      # macOS ZIP 包 (91MB)
├── latest-mac.yml                      # 自动更新配置
└── mac-arm64/
    └── ClaudePulse.app                   # macOS 应用
```

### 步骤 4: 创建 GitHub Release

#### 方法 1: 使用 gh CLI (推荐)

```bash
# 1. 创建 Release 并上传文件
gh release create v1.8.0 \
  --repo zhanBoss/Claude-Pulse \
  --title "ClaudePulse v1.8.0" \
  --notes "## v1.8.0 更新日志

### ✨ 新功能
- 添加了 XXX 功能
- 支持 YYY 特性

### 🎯 改进
- 优化了 AAA 性能
- 改进了 BBB 体验

### 🐛 修复
- 修复了 CCC 问题
- 解决了 DDD 崩溃

### 📦 下载
- macOS (Apple Silicon): ClaudePulse-1.8.0-arm64.dmg
- macOS (ZIP): ClaudePulse-1.8.0-arm64-mac.zip

---

完整更新日志: https://github.com/zhanBoss/Claude-Pulse/blob/main/CHANGELOG.md" \
  release/ClaudePulse-1.8.0-arm64.dmg \
  release/ClaudePulse-1.8.0-arm64-mac.zip \
  release/latest-mac.yml

# 2. 验证 Release 创建成功
gh release view v1.8.0 --repo zhanBoss/Claude-Pulse
```

#### 方法 2: 手动在网页创建 (备选)

如果 gh CLI 不可用,可以手动创建:

1. **访问 Release 页面**:

   ```
   https://github.com/zhanBoss/Claude-Pulse/releases/new
   ```

2. **填写 Release 信息**:
   - **Choose a tag**: 选择 `v1.8.0` (刚才推送的标签)
   - **Release title**: `ClaudePulse v1.8.0`
   - **Describe this release**: 复制更新日志内容

3. **上传文件**:
   - 拖拽或点击上传以下文件:
     - `release/ClaudePulse-1.8.0-arm64.dmg`
     - `release/ClaudePulse-1.8.0-arm64-mac.zip`
     - `release/latest-mac.yml`

4. **发布**:
   - 确认 "Set as the latest release" 已勾选
   - 点击 "Publish release"

### 步骤 5: 更新现有 Release (如果需要)

如果 Release 已存在,只需要更新构建产物:

```bash
# 上传新的构建文件 (会覆盖同名文件)
gh release upload v1.8.0 \
  --repo zhanBoss/Claude-Pulse \
  --clobber \
  release/ClaudePulse-1.8.0-arm64.dmg \
  release/ClaudePulse-1.8.0-arm64-mac.zip \
  release/latest-mac.yml

# 验证上传成功
gh release view v1.8.0 --repo zhanBoss/Claude-Pulse
```

**`--clobber` 参数说明**:

- 如果文件已存在,会覆盖旧文件
- 不加此参数,上传同名文件会报错

### 步骤 6: 验证发布

```bash
# 1. 查看所有 Release
gh release list --repo zhanBoss/Claude-Pulse

# 2. 查看最新 Release 详情
gh release view v1.8.0 --repo zhanBoss/Claude-Pulse

# 3. 在浏览器中打开 Release 页面
gh release view v1.8.0 --repo zhanBoss/Claude-Pulse --web
```

**验证清单**:

- ✅ Release 标记为 "Latest"
- ✅ 包含 3 个文件 (dmg, zip, yml)
- ✅ 文件大小正确 (dmg ~95MB, zip ~91MB)
- ✅ 更新日志显示正确
- ✅ 下载链接可用

---

## 🔧 常见问题

### Q1: `gh: command not found`

**原因**: 未安装 GitHub CLI

**解决**:

```bash
# macOS
brew install gh

# 验证安装
gh --version
```

### Q2: `gh auth login` 失败

**原因**: 网络问题或认证失败

**解决**:

```bash
# 重新登录
gh auth logout
gh auth login

# 选择 "Login with a web browser"
# 在浏览器中完成授权
```

### Q3: `git push` 被拒绝

**错误信息**:

```
! [rejected]        main -> main (fetch first)
```

**原因**: 远程仓库有新提交

**解决**:

```bash
# 拉取远程更新
git pull origin main

# 如果有冲突,解决冲突后再推送
git push origin main
```

### Q4: 构建失败 - `pnpm: command not found`

**原因**: 未安装 pnpm

**解决**:

```bash
# 安装 pnpm
npm install -g pnpm

# 验证安装
pnpm --version

# 重新安装依赖
pnpm install
```

### Q5: 构建失败 - 依赖错误

**错误信息**:

```
Error: Cannot find module 'xxx'
```

**解决**:

```bash
# 清理依赖
rm -rf node_modules pnpm-lock.yaml

# 重新安装
pnpm install

# 重新构建
pnpm run build:prod
```

### Q6: 上传文件失败 - 文件太大

**错误信息**:

```
HTTP 413: Request Entity Too Large
```

**解决**:

- GitHub Release 单个文件限制 2GB
- 我们的文件 ~95MB,不会超限
- 如果确实超限,考虑压缩或分割文件

### Q7: 标签已存在

**错误信息**:

```
fatal: tag 'v1.8.0' already exists
```

**解决**:

```bash
# 删除本地标签
git tag -d v1.8.0

# 删除远程标签
git push origin :refs/tags/v1.8.0

# 重新创建标签
git tag -a v1.8.0 -m "Release v1.8.0"
git push origin v1.8.0
```

### Q8: Release 已存在

**错误信息**:

```
release already exists
```

**解决**:

**方法 1: 更新现有 Release**

```bash
# 只上传新文件,不创建新 Release
gh release upload v1.8.0 \
  --repo zhanBoss/Claude-Pulse \
  --clobber \
  release/ClaudePulse-1.8.0-arm64.dmg
```

**方法 2: 删除并重新创建**

```bash
# 删除 Release (保留标签)
gh release delete v1.8.0 --repo zhanBoss/Claude-Pulse --yes

# 重新创建
gh release create v1.8.0 ...
```

### Q9: 权限被拒绝

**错误信息**:

```
HTTP 403: Forbidden
```

**原因**: GitHub Token 权限不足或未登录

**解决**:

```bash
# 检查登录状态
gh auth status

# 重新登录
gh auth login

# 确保 Token 有 repo 权限
```

### Q10: 构建产物找不到

**错误信息**:

```
file not found: release/ClaudePulse-1.8.0-arm64.dmg
```

**原因**: 构建失败或版本号不匹配

**解决**:

```bash
# 检查构建是否成功
ls -lh release/

# 检查版本号是否一致
cat package.json | grep version

# 重新构建
pnpm run clear:build
pnpm run build:prod
```

---

## ✅ 快速检查清单

### 发布前检查

- [ ] Node.js 已安装 (≥18.0.0)
- [ ] pnpm 已安装
- [ ] gh CLI 已安装并登录
- [ ] Git 已配置用户名和邮箱
- [ ] 项目依赖已安装 (`pnpm install`)
- [ ] 版本号已更新 (`package.json`)
- [ ] 更新日志已更新 (`CHANGELOG.md`)
- [ ] 代码已提交到本地
- [ ] 代码已推送到远程
- [ ] Git 标签已创建并推送

### 构建检查

- [ ] 旧构建产物已清理 (`pnpm run clear:build`)
- [ ] 生产版本构建成功 (`pnpm run build:prod`)
- [ ] 构建产物存在:
  - [ ] `release/ClaudePulse-{version}-arm64.dmg`
  - [ ] `release/ClaudePulse-{version}-arm64-mac.zip`
  - [ ] `release/latest-mac.yml`
- [ ] 文件大小正常 (dmg ~95MB, zip ~91MB)

### 发布检查

- [ ] GitHub Release 已创建
- [ ] Release 标记为 "Latest"
- [ ] 所有文件已上传 (3 个文件)
- [ ] 更新日志显示正确
- [ ] 下载链接可用
- [ ] 版本号一致 (package.json, 标签, Release)

### 发布后验证

- [ ] 在浏览器中访问 Release 页面
- [ ] 下载 dmg 文件测试安装
- [ ] 检查应用版本号是否正确
- [ ] 测试核心功能是否正常
- [ ] 检查自动更新是否工作

---

## 🎯 一键发布脚本 (高级)

如果你熟悉了流程,可以使用这个脚本一键发布:

```bash
#!/bin/bash
# release.sh - 一键发布脚本

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 读取版本号
VERSION=$(node -p "require('./package.json').version")

echo -e "${GREEN}🚀 开始发布 ClaudePulse v${VERSION}${NC}"

# 1. 检查工作区是否干净
if [[ -n $(git status -s) ]]; then
  echo -e "${RED}❌ 工作区有未提交的修改,请先提交${NC}"
  exit 1
fi

# 2. 确认发布
read -p "确认发布 v${VERSION}? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}❌ 取消发布${NC}"
  exit 1
fi

# 3. 创建标签
echo -e "${GREEN}📌 创建标签 v${VERSION}${NC}"
git tag -a "v${VERSION}" -m "Release v${VERSION}"
git push origin "v${VERSION}"

# 4. 清理并构建
echo -e "${GREEN}🔨 构建应用${NC}"
pnpm run clear:build
pnpm run build:prod

# 5. 创建 Release
echo -e "${GREEN}📦 创建 GitHub Release${NC}"
gh release create "v${VERSION}" \
  --repo zhanBoss/Claude-Pulse \
  --title "ClaudePulse v${VERSION}" \
  --notes-file CHANGELOG.md \
  release/ClaudePulse-${VERSION}-arm64.dmg \
  release/ClaudePulse-${VERSION}-arm64-mac.zip \
  release/latest-mac.yml

echo -e "${GREEN}✅ 发布成功!${NC}"
echo -e "${GREEN}🔗 查看 Release: https://github.com/zhanBoss/Claude-Pulse/releases/tag/v${VERSION}${NC}"
```

**使用方法**:

```bash
# 1. 保存脚本
nano release.sh

# 2. 添加执行权限
chmod +x release.sh

# 3. 运行脚本
./release.sh
```

---

## 📖 相关文档

- [BUILD.md](./BUILD.md) - 构建指南
- [CHANGELOG.md](./CHANGELOG.md) - 更新日志
- [.claude/skills/release-workflow.md](./.claude/skills/release-workflow.md) - 发布工作流 Skill

---

## 💡 最佳实践

### 1. 版本发布频率

- **补丁版本 (1.0.x)**: 随时发布,修复紧急 Bug
- **次版本 (1.x.0)**: 每 1-2 周发布,包含新功能
- **主版本 (x.0.0)**: 每 3-6 个月发布,重大更新

### 2. 发布时间选择

- **避免周五发布**: 如果出问题,周末无法及时修复
- **推荐周二/周三**: 有足够时间处理问题
- **避免节假日**: 用户反馈和支持不及时

### 3. 发布前测试

```bash
# 1. 本地测试
pnpm run dev

# 2. 构建测试
pnpm run build:dev
# 安装并测试 debug/ClaudePulse-Dev-{version}-arm64.dmg

# 3. 生产构建测试
pnpm run build:prod
# 安装并测试 release/ClaudePulse-{version}-arm64.dmg
```

### 4. 发布后监控

- 关注 GitHub Issues 中的用户反馈
- 检查下载量和使用情况
- 准备好快速发布补丁版本

### 5. 版本回滚

如果发布后发现严重问题:

```bash
# 1. 标记 Release 为 Pre-release
gh release edit v1.8.0 --repo zhanBoss/Claude-Pulse --prerelease

# 2. 快速修复并发布补丁版本
# 修改代码...
# 更新版本号为 1.8.1
pnpm run build:prod
gh release create v1.8.1 ...

# 3. 删除有问题的 Release (可选)
gh release delete v1.8.0 --repo zhanBoss/Claude-Pulse --yes
```

---

## 🎓 学习资源

- [GitHub CLI 文档](https://cli.github.com/manual/)
- [语义化版本规范](https://semver.org/lang/zh-CN/)
- [Electron Builder 文档](https://www.electron.build/)
- [Git 标签管理](https://git-scm.com/book/zh/v2/Git-%E5%9F%BA%E7%A1%80-%E6%89%93%E6%A0%87%E7%AD%BE)

---

## 🆘 获取帮助

如果遇到问题:

1. **查看本文档的常见问题部分**
2. **搜索 GitHub Issues**: https://github.com/zhanBoss/Claude-Pulse/issues
3. **创建新 Issue**: 描述问题、错误信息、操作步骤
4. **联系维护者**: 在 Issue 中 @zhanBoss

---

**祝你发布顺利! 🎉**
