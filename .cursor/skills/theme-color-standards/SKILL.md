# CCMonitor 主题颜色规范

本 Skill 定义了 CCMonitor 项目的主题色使用规范。**所有涉及颜色的代码都必须使用主题变量，禁止硬编码颜色值。**

## 触发条件

当以下情况时应使用此 Skill：
- 添加新的 UI 组件或样式
- 修改现有组件的颜色
- 创建图表、数据可视化
- 处理状态颜色（成功、警告、错误）

## 核心原则

### 1. 禁止硬编码颜色

```tsx
// ❌ 错误 - 硬编码颜色
<div style={{ color: '#1677ff' }}>
<div style={{ background: '#52c41a' }}>

// ✅ 正确 - 使用主题变量
<div style={{ color: themeVars.primary }}>
<div style={{ background: themeVars.success }}>
```

### 2. 主题色系统

项目使用 **Claude Code 橙棕色** 作为主色调：

| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| primary | `#D97757` | 主题色，品牌色，强调色 |
| primaryHover | `#C86847` | 主色悬停状态 |
| primaryLight | `#E88B6F` | 浅色主题色 |
| primaryBg | 明/暗自适应 | 主色背景 |

## 使用方法

### 获取主题变量

```tsx
import { getThemeVars } from '@/theme'

const MyComponent = (props: Props) => {
  const { darkMode } = props
  const themeVars = getThemeVars(darkMode)
  
  return (
    <div style={{ 
      color: themeVars.text,
      background: themeVars.bgContainer,
      borderColor: themeVars.border
    }}>
      内容
    </div>
  )
}
```

### 图表颜色

```tsx
import { CHART_COLORS, STAT_COLORS } from '@/theme'

// 图表系列颜色
<Bar fill={CHART_COLORS[0]} />

// 语义化统计颜色
<Statistic valueStyle={{ color: STAT_COLORS.tokens }} />
```

## 颜色变量参考

### 背景色

| 变量名 | 用途 |
|--------|------|
| `bgContainer` | 容器背景 |
| `bgElevated` | 浮层背景 |
| `bgLayout` | 布局背景 |
| `bgSection` | 区块背景 |
| `bgCode` | 代码块背景 |
| `codeBg` | 行内代码背景 |
| `hoverBg` | 悬停背景 |
| `primaryBg` | 主色相关背景 |

### 边框色

| 变量名 | 用途 |
|--------|------|
| `border` | 主边框 |
| `borderSecondary` | 次级边框 |
| `borderCode` | 代码边框 |
| `itemBorder` | 列表项边框 |
| `itemHoverBorder` | 列表项悬停边框 |

### 文本色

| 变量名 | 用途 |
|--------|------|
| `text` | 主文本 |
| `textSecondary` | 次级文本 |
| `textTertiary` | 三级文本 |
| `textWhite` | 白色文本 |
| `textError` | 错误文本 |
| `link` | 链接文本 |

### 主题色

| 变量名 | 用途 |
|--------|------|
| `primary` | 主色 `#D97757` |
| `primaryHover` | 主色悬停 |
| `primaryLight` | 浅主色 |
| `primaryBg` | 主色背景 |
| `primaryGradient` | 主色渐变 |
| `primaryShadow` | 主色阴影 |

### 状态色

| 变量名 | 用途 |
|--------|------|
| `success` | 成功色 `#52c41a` |
| `successLight` | 成功浅色背景 |
| `successBorder` | 成功边框色 |
| `warning` | 警告色 `#faad14` |
| `warningLight` | 警告浅色背景 |
| `warningBorder` | 警告边框色 |
| `error` | 错误色 `#ff4d4f` |
| `errorLight` | 错误浅色背景 |
| `errorBorder` | 错误边框色 |
| `info` | 信息色（蓝色）|

### 语义化统计色

| 变量名 | 用途 |
|--------|------|
| `statTokens` | Token 相关 `#D97757` |
| `statCost` | 成本相关 `#52c41a` |
| `statSessions` | 会话相关 `#722ed1` |
| `statProjects` | 项目相关 `#E88B6F` |
| `statTools` | 工具相关 `#13c2c2` |
| `statTime` | 时间相关 `#2f54eb` |

### 进度条颜色

| 变量名 | 用途 |
|--------|------|
| `progressBg` | 进度条背景 |
| `progressSuccess` | 进度条成功 |
| `progressWarning` | 进度条警告 |
| `progressError` | 进度条错误 |

### Diff 颜色（代码对比）

| 变量名 | 用途 |
|--------|------|
| `diffAddBg` | 新增行背景 |
| `diffRemoveBg` | 删除行背景 |
| `diffAddText` | 新增行文本 |
| `diffRemoveText` | 删除行文本 |
| `diffNeutralText` | 无变化行文本 |
| `diffAddBorder` | 新增行边框 `#2ea043` |
| `diffRemoveBorder` | 删除行边框 `#da3633` |

## 图表颜色常量

### CHART_COLORS

用于图表系列，按顺序使用：

```tsx
export const CHART_COLORS = [
  '#D97757', // primary
  '#52c41a', // success
  '#722ed1', // purple
  '#E88B6F', // primaryLight
  '#eb2f96', // pink
  '#13c2c2', // cyan
  '#2f54eb', // geekblue
  '#C86847', // primaryHover
  '#a0d911', // lime
  '#f5222d'  // red
]
```

### STAT_COLORS

用于语义化统计展示：

```tsx
export const STAT_COLORS = {
  tokens: '#D97757',   // Token 相关
  cost: '#52c41a',     // 成本相关
  sessions: '#722ed1', // 会话相关
  projects: '#E88B6F', // 项目相关
  tools: '#13c2c2',    // 工具调用
  time: '#2f54eb'      // 时间相关
}
```

## Ant Design Tag 颜色

**禁止使用 `color="blue"`**，应使用主题色 `#D97757`：

```tsx
// ❌ 错误 - 使用默认蓝色
<Tag color="blue">项目名称</Tag>
<Tag color="blue">第 1 轮</Tag>

// ✅ 正确 - 使用主题色
<Tag color="#D97757">项目名称</Tag>
<Tag color="#D97757">第 1 轮</Tag>
```

### 保留的语义化颜色

以下 Ant Design Tag 颜色保留使用（语义正确）：

| 颜色值 | 用途 |
|--------|------|
| `color="green"` | 成功、AI 助手、输出 tokens |
| `color="gold"` | 成本、金额 |
| `color="purple"` | 工具调用次数 |
| `color="red"` / `color="error"` | 错误、失败 |
| `color="success"` | 成功状态 |
| `color="processing"` | 处理中、生成中 |
| `color="warning"` | 警告 |
| `color="default"` | 默认灰色 |

## Tailwind CSS 颜色

在 `tailwind.config.js` 中已定义：

```js
// Claude 主题色
className="bg-claude"      // #D97757
className="bg-claude-50"   // #FFF5ED
className="bg-claude-400"  // #E88B6F
className="text-claude"    // #D97757

// 统计颜色
className="text-stat-tokens"   // #D97757
className="text-stat-cost"     // #52c41a
className="text-stat-sessions" // #722ed1
```

## 交互状态示例

### 列表项悬停

```tsx
<div
  style={{
    border: `1px solid ${themeVars.itemBorder}`,
    background: themeVars.itemBg,
  }}
  onMouseEnter={e => {
    e.currentTarget.style.borderColor = themeVars.itemHoverBorder
    e.currentTarget.style.background = themeVars.itemHoverBg
  }}
  onMouseLeave={e => {
    e.currentTarget.style.borderColor = themeVars.itemBorder
    e.currentTarget.style.background = themeVars.itemBg
  }}
>
```

### 搜索高亮

```tsx
<span style={{
  color: themeVars.primary,
  background: themeVars.highlightBg,
  borderRadius: 2,
  padding: '0 1px'
}}>
  匹配文本
</span>
```

### 状态进度条

```tsx
<div style={{
  background: themeVars.progressBg,
  borderRadius: 6
}}>
  <div style={{
    width: `${percentage}%`,
    background: percentage >= 90 
      ? themeVars.progressSuccess 
      : percentage >= 70 
        ? themeVars.progressWarning 
        : themeVars.progressError
  }} />
</div>
```

## 常见错误

### ❌ 使用 Ant Design 默认蓝色

```tsx
// ❌ 错误 - #1677ff 是 Ant Design 默认蓝色，不是项目主题色
style={{ color: '#1677ff' }}

// ✅ 正确 - 使用项目主题色
style={{ color: themeVars.primary }}
```

### ❌ 暗色模式硬编码

```tsx
// ❌ 错误 - 硬编码暗色模式颜色
background: darkMode ? '#1e2a3a' : '#f0f5ff'

// ✅ 正确 - 使用主题变量
background: themeVars.itemHoverBg
```

### ❌ 图表颜色硬编码

```tsx
// ❌ 错误
<Bar fill="#1677ff" />

// ✅ 正确
import { STAT_COLORS } from '@/theme'
<Bar fill={STAT_COLORS.tokens} />
```

## 检查清单

添加颜色相关代码时，确保：

- [ ] 使用 `getThemeVars(darkMode)` 获取主题变量
- [ ] 背景色使用 `themeVars.bg*` 系列
- [ ] 边框色使用 `themeVars.border*` 系列
- [ ] 文本色使用 `themeVars.text*` 系列
- [ ] 主题色使用 `themeVars.primary*` 系列
- [ ] 状态色使用 `themeVars.success/warning/error`
- [ ] 图表使用 `CHART_COLORS` 或 `STAT_COLORS`
- [ ] 没有硬编码的十六进制颜色值
