# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - 2026-02-05

### Added
- 实时对话页面新增快捷搜索功能
  - 支持 Cmd+F / Ctrl+F 快捷键唤起搜索
  - 居中弹窗式搜索界面，体验优雅
  - 实时搜索 Prompt 内容，支持关键词高亮
  - 搜索结果显示匹配上下文，快速定位
  - 点击结果直接查看 Prompt 详情

- 历史记录页面搜索功能全面升级
  - 改用弹窗搜索方案，与实时对话保持一致
  - 从搜索会话改为搜索 Prompt 内容
  - 异步加载所有会话记录进行全文搜索
  - 显示匹配的 Prompt 片段（带上下文）
  - 点击结果直接查看 Prompt 详情

### Improved
- 搜索功能三大优化
  - 打开搜索时自动关闭所有其他弹窗，界面更清爽
  - 搜索结果关键词高亮（蓝色背景 + 白色文字）
  - 搜索支持防抖（300ms），减少不必要的计算

- Modal 组件优化
  - 封装 ElectronModal 组件，统一 Modal 使用方式
  - 重构 9 个组件，删除 200+ 行冗余代码
  - Modal 代码量减少 80%（从 20-25 行 → 3-5 行）

### Fixed
- 改进图片匹配逻辑，支持无标记的图片识别
- 修复图片关联错误，只关联当前 prompt 使用的图片
- 修复实时对话清空后刷新数据回显问题

### Changed
- 实时对话页面只显示当前会话记录，不加载历史数据
- 优化历史记录页面 UI 和智能内容渲染

## [1.4.2] - 2026-02-03

### Fixed
- 修复实时对话图片加载失败问题
  - 解决图片路径重复拼接导致文件找不到的问题
  - 移除发送到前端时的路径拼接，保持相对路径
  - 添加图片加载轮询机制，确保图片最终能成功加载
  - 图片现在可以立即显示，无需刷新页面

## [1.4.1] - 2026-02-03

### Fixed
- 修复 TypeScript 编译错误
  - 添加 `downlevelIteration` 支持 Map/Set 迭代
  - 添加 `esModuleInterop` 和 `allowSyntheticDefaultImports` 支持模块导入
  - 为 Electron 主进程创建独立的 TypeScript 配置 (`tsconfig.electron.json`)
  - 修复 `global.processedImages` 类型声明问题

## [1.4.0] - 2026-02-03

### Added
- 添加清除缓存功能和独立的关于/更新日志页面
- 添加历史记录删除功能
- 实现历史记录按需加载优化

### Changed
- 优化图片处理和显示逻辑
- 优化 LogViewer 布局和交互体验
- 优化设置页面布局和交互体验
- 优化配置管理和数据刷新机制

### Fixed
- 修复实时对话图片加载时序问题

### Documentation
- 添加 CLAUDE.md 开发指南和主题一致性优化
