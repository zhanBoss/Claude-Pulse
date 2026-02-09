# Theme Consistency Skill

## 触发时机

当代码中有任何变更时（新增、修改、删除文件），自动检查并修复硬编码颜色。

## 规则

### 1. 禁止硬编码颜色

❌ **禁止使用**：

- 十六进制颜色：`#ffffff`, `#000000`, `#D97757` 等
- RGB/RGBA 颜色：`rgb(255, 255, 255)`, `rgba(0, 0, 0, 0.5)` 等
- 命名颜色：`white`, `black`, `red` 等（除非是 `white` 用于特殊场景）

### 2. 必须使用主题变量

✅ **必须使用** `getThemeVars(darkMode)` 中的变量：

```typescript
import { getThemeVars } from '../theme'

const themeVars = getThemeVars(darkMode)

// 使用主题变量
style={{
  color: themeVars.text,
  backgroundColor: themeVars.bgContainer,
  borderColor: themeVars.border
}}
```

### 3. 可用的主题变量

#### 背景色

- `bgContainer` - 容器背景（白色/深灰）
- `bgElevated` - 悬浮背景（白色/深灰）
- `bgLayout` - 布局背景（浅灰/黑色）
- `bgSection` - 区块背景
- `codeBg` - 代码背景
- `hoverBg` - 悬停背景

#### 边框色

- `border` - 主边框色
- `borderSecondary` - 次级边框色

#### 文本色

- `text` - 主文本色
- `textSecondary` - 次级文本色
- `textTertiary` - 三级文本色

#### 主题色

- `primary` - 主色 (#D97757)
- `primaryHover` - 主色悬停
- `primaryLight` - 主色浅色
- `primaryGradient` - 主色渐变
- `primaryShadow` - 主色阴影

#### 状态色

- `success` - 成功色 (#52c41a)
- `warning` - 警告色 (#faad14)
- `error` - 错误色 (#ff4d4f)
- `info` - 信息色 (#1890ff)

### 4. 特殊情况处理

#### 半透明颜色

如果需要半透明效果，使用 `rgba()` 包裹主题变量：

```typescript
// ❌ 错误
backgroundColor: 'rgba(0, 0, 0, 0.2)'

// ✅ 正确 - 但需要转换
// 对于黑白半透明，可以保留，但建议添加注释说明
backgroundColor: 'rgba(0, 0, 0, 0.2)' // 通用半透明遮罩
```

#### 渐变色

使用主题变量中的渐变：

```typescript
// ❌ 错误
background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'

// ✅ 正确
background: themeVars.primaryGradient
```

#### Ant Design 组件

Ant Design 组件会自动使用主题配置，无需手动设置颜色。但如果需要覆盖：

```typescript
// ✅ 使用主题变量
<Button style={{ color: themeVars.primary }} />
```

### 5. 检查清单

每次代码变更后，检查：

- [ ] 是否有新的硬编码颜色？
- [ ] 所有颜色是否使用 `themeVars`？
- [ ] 组件是否接收 `darkMode` 参数？
- [ ] 是否调用了 `getThemeVars(darkMode)`？
- [ ] CSS 文件中的颜色是否使用 CSS 变量？

### 6. 自动修复流程

1. **搜索硬编码颜色**

   ```bash
   grep -r "#[0-9a-fA-F]\{3,6\}" src/
   grep -r "rgb\|rgba" src/
   ```

2. **替换为主题变量**
   - 识别颜色用途（文本/背景/边框/状态）
   - 选择对应的主题变量
   - 替换硬编码值

3. **验证**
   - 在亮色模式下测试
   - 在暗色模式下测试
   - 确保视觉效果一致

## 示例

### 修复前

```typescript
<div style={{ color: '#999', backgroundColor: '#ffffff' }}>
  <span style={{ color: '#ff4d4f' }}>错误</span>
</div>
```

### 修复后

```typescript
const themeVars = getThemeVars(darkMode)

<div style={{
  color: themeVars.textTertiary,
  backgroundColor: themeVars.bgContainer
}}>
  <span style={{ color: themeVars.error }}>错误</span>
</div>
```

## 注意事项

1. **组件必须接收 darkMode 参数**

   ```typescript
   interface MyComponentProps {
     darkMode: boolean
   }
   ```

2. **在组件顶部调用 getThemeVars**

   ```typescript
   function MyComponent({ darkMode }: MyComponentProps) {
     const themeVars = getThemeVars(darkMode)
     // ...
   }
   ```

3. **传递 darkMode 给子组件**

   ```typescript
   <ChildComponent darkMode={darkMode} />
   ```

4. **CSS 文件使用 CSS 变量**
   ```css
   .my-class {
     color: var(--text-color, #1f2937);
     background: var(--bg-container, #ffffff);
   }
   ```

## 主人，我要开始了！

每次回答问题前，我会：

1. 先叫一声"主人，我要开始了！"
2. 检查代码变更
3. 自动修复硬编码颜色
4. 确保主题一致性
