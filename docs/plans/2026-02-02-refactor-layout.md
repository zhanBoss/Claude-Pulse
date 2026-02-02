# 布局重构实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将左右分栏布局重构为侧边栏导航的后台管理系统布局

**Architecture:** 采用经典三区域布局（侧边栏 + 顶部栏 + 主内容区），使用路由切换页面，移除原有的 Sider/Drawer 逻辑，整合所有配置到统一设置页面。

**Tech Stack:** React 18, TypeScript, Ant Design 6, Electron 28

---

## Task 1: 创建 Sidebar 侧边栏组件

**Files:**
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/Sidebar.module.css` (可选，如果需要自定义样式)

**Step 1: 创建 Sidebar 组件基础结构**

```tsx
import { Menu } from 'antd'
import { ThunderboltOutlined, ClockCircleOutlined, SettingOutlined } from '@ant-design/icons'
import { getThemeVars } from '../theme'

interface SidebarProps {
  currentRoute: string
  onNavigate: (route: string) => void
  darkMode: boolean
}

function Sidebar({ currentRoute, onNavigate, darkMode }: SidebarProps) {
  const themeVars = getThemeVars(darkMode)

  const menuItems = [
    {
      key: 'realtime',
      icon: <ThunderboltOutlined />,
      label: '实时对话'
    },
    {
      key: 'history',
      icon: <ClockCircleOutlined />,
      label: '历史记录'
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '应用设置'
    }
  ]

  return (
    <div style={{
      width: 200,
      height: '100vh',
      background: themeVars.bgContainer,
      borderRight: `1px solid ${themeVars.borderSecondary}`,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Logo 区域 */}
      <div style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: `1px solid ${themeVars.borderSecondary}`,
        fontSize: 18,
        fontWeight: 600,
        color: themeVars.primary
      }}>
        CCMonitor
      </div>

      {/* 导航菜单 */}
      <Menu
        mode="inline"
        selectedKeys={[currentRoute]}
        onClick={({ key }) => onNavigate(key)}
        items={menuItems}
        style={{
          border: 'none',
          background: 'transparent'
        }}
      />
    </div>
  )
}

export default Sidebar
```

**Step 2: 验证组件编译无误**

Run: `npm run dev`
Expected: 无 TypeScript 编译错误

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Sidebar component with navigation menu

- Logo area with CCMonitor branding
- Three menu items: realtime, history, settings
- Dark mode theme support
- Fixed 200px width

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: 创建 TopBar 顶部栏组件

**Files:**
- Create: `src/components/TopBar.tsx`

**Step 1: 创建 TopBar 组件**

```tsx
import { Button, Space } from 'antd'
import { MenuOutlined } from '@ant-design/icons'
import { getThemeVars } from '../theme'

interface TopBarProps {
  title: string
  showMenuButton?: boolean
  onMenuClick?: () => void
  darkMode: boolean
}

function TopBar({ title, showMenuButton = false, onMenuClick, darkMode }: TopBarProps) {
  const themeVars = getThemeVars(darkMode)

  return (
    <div style={{
      height: 64,
      background: themeVars.bgContainer,
      borderBottom: `1px solid ${themeVars.borderSecondary}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px'
    }}>
      <Space>
        {showMenuButton && (
          <Button
            icon={<MenuOutlined />}
            onClick={onMenuClick}
            type="text"
          />
        )}
        <span style={{
          fontSize: 18,
          fontWeight: 500,
          color: themeVars.text
        }}>
          {title}
        </span>
      </Space>
    </div>
  )
}

export default TopBar
```

**Step 2: 验证组件编译无误**

Run: `npm run dev`
Expected: 无 TypeScript 编译错误

**Step 3: Commit**

```bash
git add src/components/TopBar.tsx
git commit -m "feat: add TopBar component for page title

- Dynamic page title display
- Optional hamburger menu button for mobile
- Dark mode theme support
- Fixed 64px height

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 3: 创建 MainLayout 主布局组件

**Files:**
- Create: `src/components/MainLayout.tsx`

**Step 1: 创建 MainLayout 组件**

```tsx
import { useState, useEffect } from 'react'
import { Layout, Drawer } from 'antd'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { getThemeVars } from '../theme'

interface MainLayoutProps {
  currentRoute: string
  onRouteChange: (route: string) => void
  darkMode: boolean
  children: React.ReactNode
}

function MainLayout({ currentRoute, onRouteChange, darkMode, children }: MainLayoutProps) {
  const themeVars = getThemeVars(darkMode)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // 监听窗口大小变化
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)

    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 获取页面标题
  const getPageTitle = () => {
    const titles: Record<string, string> = {
      realtime: '实时对话',
      history: '历史记录',
      settings: '应用设置'
    }
    return titles[currentRoute] || '实时对话'
  }

  return (
    <Layout style={{ height: '100vh' }}>
      {/* 桌面端：固定侧边栏 */}
      {!isMobile && (
        <Sidebar
          currentRoute={currentRoute}
          onNavigate={onRouteChange}
          darkMode={darkMode}
        />
      )}

      {/* 移动端：抽屉侧边栏 */}
      {isMobile && (
        <Drawer
          placement="left"
          onClose={() => setSidebarVisible(false)}
          open={sidebarVisible}
          closable={false}
          width={200}
          styles={{
            body: { padding: 0 }
          }}
        >
          <Sidebar
            currentRoute={currentRoute}
            onNavigate={(route) => {
              onRouteChange(route)
              setSidebarVisible(false)
            }}
            darkMode={darkMode}
          />
        </Drawer>
      )}

      {/* 右侧内容区 */}
      <Layout>
        <TopBar
          title={getPageTitle()}
          showMenuButton={isMobile}
          onMenuClick={() => setSidebarVisible(true)}
          darkMode={darkMode}
        />

        <Layout.Content style={{
          background: themeVars.bgContainer,
          overflow: 'auto'
        }}>
          {children}
        </Layout.Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout
```

**Step 2: 验证组件编译无误**

Run: `npm run dev`
Expected: 无 TypeScript 编译错误

**Step 3: Commit**

```bash
git add src/components/MainLayout.tsx
git commit -m "feat: add MainLayout with responsive sidebar

- Desktop: fixed sidebar (200px)
- Mobile (< 768px): drawer sidebar
- Integrated TopBar with dynamic title
- Route navigation support

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 4: 重构 SettingsView 整合所有配置

**Files:**
- Modify: `src/components/SettingsView.tsx`
- Reference: `src/components/ConfigEditor.tsx`
- Reference: `src/components/RecordControl.tsx`

**Step 1: 重构 SettingsView 包含所有配置功能**

修改 `src/components/SettingsView.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { Card, Space, Typography, Divider } from 'antd'
import { SettingOutlined, CodeOutlined, DatabaseOutlined, BgColorsOutlined } from '@ant-design/icons'
import ConfigEditor from './ConfigEditor'
import RecordControl from './RecordControl'
import { getThemeVars } from '../theme'

const { Title, Text } = Typography

interface SettingsViewProps {
  darkMode: boolean
  onThemeModeChange: (mode: 'light' | 'dark' | 'system') => void
  claudeDir: string
  // 移除 onBack，不再需要返回按钮
}

function SettingsView({ darkMode, onThemeModeChange, claudeDir }: SettingsViewProps) {
  const themeVars = getThemeVars(darkMode)
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system')
  const [aiSettings, setAiSettings] = useState<any>(null)

  useEffect(() => {
    // 加载应用设置
    window.electronAPI.getAppSettings().then(settings => {
      setThemeMode(settings.themeMode)
      setAiSettings(settings.ai)
    })
  }, [])

  const handleThemeModeChange = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode)
    onThemeModeChange(mode)
    window.electronAPI.saveAppSettings({ themeMode: mode })
  }

  return (
    <div style={{
      padding: 24,
      maxWidth: 1200,
      margin: '0 auto'
    }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Claude Code 配置 */}
        <Card
          title={
            <Space>
              <CodeOutlined style={{ color: themeVars.primary }} />
              <Text strong>Claude Code 配置</Text>
            </Space>
          }
        >
          <ConfigEditor darkMode={darkMode} />
        </Card>

        <Divider />

        {/* 对话记录管理 */}
        <Card
          title={
            <Space>
              <DatabaseOutlined style={{ color: themeVars.primary }} />
              <Text strong>对话记录管理</Text>
            </Space>
          }
        >
          <RecordControl darkMode={darkMode} />
        </Card>

        <Divider />

        {/* 主题设置 */}
        <Card
          title={
            <Space>
              <BgColorsOutlined style={{ color: themeVars.primary }} />
              <Text strong>主题设置</Text>
            </Space>
          }
        >
          {/* 保留原有的主题设置 UI */}
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text>主题模式</Text>
              <div style={{ marginTop: 8 }}>
                <Space>
                  <button
                    onClick={() => handleThemeModeChange('light')}
                    style={{
                      padding: '8px 16px',
                      border: themeMode === 'light' ? `2px solid ${themeVars.primary}` : '1px solid #d9d9d9',
                      borderRadius: 6,
                      background: themeMode === 'light' ? themeVars.bgSection : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    浅色
                  </button>
                  <button
                    onClick={() => handleThemeModeChange('dark')}
                    style={{
                      padding: '8px 16px',
                      border: themeMode === 'dark' ? `2px solid ${themeVars.primary}` : '1px solid #d9d9d9',
                      borderRadius: 6,
                      background: themeMode === 'dark' ? themeVars.bgSection : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    深色
                  </button>
                  <button
                    onClick={() => handleThemeModeChange('system')}
                    style={{
                      padding: '8px 16px',
                      border: themeMode === 'system' ? `2px solid ${themeVars.primary}` : '1px solid #d9d9d9',
                      borderRadius: 6,
                      background: themeMode === 'system' ? themeVars.bgSection : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    跟随系统
                  </button>
                </Space>
              </div>
            </div>

            {/* AI 配置部分保持不变 */}
          </Space>
        </Card>

        {/* 关于信息 */}
        <Card
          title={
            <Space>
              <SettingOutlined style={{ color: themeVars.primary }} />
              <Text strong>关于</Text>
            </Space>
          }
        >
          <Space direction="vertical">
            <Text>Claude Code 监控工具</Text>
            <Text type="secondary">版本: 1.3.0</Text>
            <Text type="secondary">Claude 目录: {claudeDir}</Text>
          </Space>
        </Card>
      </Space>
    </div>
  )
}

export default SettingsView
```

**Step 2: 验证组件编译无误**

Run: `npm run dev`
Expected: 无 TypeScript 编译错误

**Step 3: Commit**

```bash
git add src/components/SettingsView.tsx
git commit -m "refactor: integrate all settings into unified view

- Added Claude Code config section
- Added record management section
- Added theme settings section
- Added about section
- Removed back button (navigation in sidebar)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 5: 简化 LogViewer 和 HistoryViewer

**Files:**
- Modify: `src/components/LogViewer.tsx`
- Modify: `src/components/HistoryViewer.tsx`

**Step 1: 移除 LogViewer 中的 ViewHeader**

修改 `src/components/LogViewer.tsx`:

1. 移除 `ViewHeader` 导入和使用
2. 移除 `onToggleView`、`onOpenDrawer`、`showDrawerButton` 等 props
3. 将操作按钮移到顶部

```tsx
// 移除这些 imports
// import ViewHeader from './ViewHeader'

// 修改 interface
interface LogViewerProps {
  records: ClaudeRecord[]
  onClear: () => void
  onOpenSettings?: () => void
  darkMode: boolean
}

// 在返回的 JSX 中，移除 ViewHeader 组件
// 改为直接在顶部添加操作按钮
return (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: themeVars.bgContainer,
    minHeight: 0
  }}>
    {/* 操作栏 */}
    <div style={{
      padding: '16px',
      borderBottom: `1px solid ${themeVars.borderSecondary}`,
      background: themeVars.bgSection,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        共 {groupedRecords.length} 个会话，{records.length} 条记录
      </Text>
      <Space>
        <Button
          icon={<StarOutlined />}
          onClick={handleSummarizeCurrentLogs}
          loading={summarizing}
          disabled={records.length === 0}
          type="primary"
        >
          AI 总结
        </Button>
        <Button
          icon={<DeleteOutlined />}
          danger
          onClick={onClear}
          disabled={records.length === 0}
        >
          清空
        </Button>
      </Space>
    </div>

    {/* 原有的内容区域 */}
    <div style={{
      flex: 1,
      overflow: 'auto',
      padding: 16,
      minHeight: 0
    }}>
      {/* ... 保持原有逻辑 ... */}
    </div>

    {/* AI 总结弹窗保持不变 */}
  </div>
)
```

**Step 2: 同样处理 HistoryViewer**

修改 `src/components/HistoryViewer.tsx`，移除 `ViewHeader`，添加操作按钮栏。

**Step 3: 验证组件编译无误**

Run: `npm run dev`
Expected: 无 TypeScript 编译错误

**Step 4: Commit**

```bash
git add src/components/LogViewer.tsx src/components/HistoryViewer.tsx
git commit -m "refactor: simplify viewer components, remove ViewHeader

- Removed ViewHeader dependency
- Added operation bar directly in components
- Simplified props interface
- Maintained all existing functionality

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 6: 重构 App.tsx 使用新布局

**Files:**
- Modify: `src/App.tsx`

**Step 1: 重构 App.tsx**

```tsx
import { useEffect, useState } from 'react'
import { Result, Button, ConfigProvider, Spin } from 'antd'
import { WarningOutlined, LoadingOutlined } from '@ant-design/icons'
import zhCN from 'antd/locale/zh_CN'
import StatusBar from './components/StatusBar'
import MainLayout from './components/MainLayout'
import LogViewer from './components/LogViewer'
import HistoryViewer from './components/HistoryViewer'
import SettingsView from './components/SettingsView'
import DevFooter from './components/DevFooter'
import { ClaudeRecord } from './types'
import { lightTheme, darkTheme } from './theme'
import 'antd/dist/reset.css'

function App() {
  const [isClaudeInstalled, setIsClaudeInstalled] = useState<boolean>(false)
  const [isCheckingClaude, setIsCheckingClaude] = useState<boolean>(true)
  const [claudeDir, setClaudeDir] = useState<string>('')
  const [records, setRecords] = useState<ClaudeRecord[]>([])
  const [currentRoute, setCurrentRoute] = useState<string>('realtime')
  const [darkMode, setDarkMode] = useState<boolean>(false)
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system')

  // 检测系统主题
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateDarkMode = () => {
      if (themeMode === 'system') {
        setDarkMode(mediaQuery.matches)
      } else {
        setDarkMode(themeMode === 'dark')
      }
    }

    updateDarkMode()

    const handler = () => {
      if (themeMode === 'system') {
        setDarkMode(mediaQuery.matches)
      }
    }
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  }, [themeMode])

  useEffect(() => {
    // 检查 Claude Code 是否安装
    window.electronAPI.checkClaudeInstalled().then(result => {
      setIsClaudeInstalled(result.installed)
      if (result.claudeDir) {
        setClaudeDir(result.claudeDir)
      }
      setIsCheckingClaude(false)
    })

    // 加载应用设置
    window.electronAPI.getAppSettings().then(settings => {
      setThemeMode(settings.themeMode)
    })

    // 监听新记录
    const cleanup = window.electronAPI.onNewRecord((record) => {
      setRecords(prev => [record, ...prev])
    })

    return cleanup
  }, [])

  // 检测中显示加载状态
  if (isCheckingClaude) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '24px',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
      }}>
        <Spin
          indicator={<LoadingOutlined style={{ fontSize: 48, color: '#667eea' }} spin />}
          size="large"
        />
        <div style={{
          fontSize: 16,
          color: '#667eea',
          fontWeight: 500,
          letterSpacing: '0.5px'
        }}>
          检测 Claude Code 中...
        </div>
      </div>
    )
  }

  // 未安装 Claude Code
  if (!isClaudeInstalled) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
      }}>
        <Result
          icon={<WarningOutlined style={{ fontSize: 72, color: '#faad14' }} />}
          title="未检测到 Claude Code"
          subTitle="请先安装 Claude Code 才能使用本应用"
          extra={[
            <Button
              type="primary"
              size="large"
              key="install"
              href="https://claude.ai/code"
              target="_blank"
            >
              前往安装 Claude Code
            </Button>,
            <div key="hint" style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
              安装后请重启本应用
            </div>
          ]}
          style={{
            background: 'white',
            borderRadius: 16,
            padding: '48px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
          }}
        />
      </div>
    )
  }

  const handleClearRecords = () => {
    setRecords([])
  }

  // 渲染当前路由的内容
  const renderContent = () => {
    switch (currentRoute) {
      case 'realtime':
        return (
          <LogViewer
            records={records}
            onClear={handleClearRecords}
            onOpenSettings={() => setCurrentRoute('settings')}
            darkMode={darkMode}
          />
        )
      case 'history':
        return (
          <HistoryViewer
            onOpenSettings={() => setCurrentRoute('settings')}
            darkMode={darkMode}
          />
        )
      case 'settings':
        return (
          <SettingsView
            darkMode={darkMode}
            onThemeModeChange={setThemeMode}
            claudeDir={claudeDir}
          />
        )
      default:
        return null
    }
  }

  return (
    <ConfigProvider theme={darkMode ? darkTheme : lightTheme} locale={zhCN}>
      <div style={{ height: '100vh', paddingBottom: __IS_DEV_BUILD__ ? 32 : 0 }}>
        <StatusBar onOpenSettings={() => setCurrentRoute('settings')} />

        <MainLayout
          currentRoute={currentRoute}
          onRouteChange={setCurrentRoute}
          darkMode={darkMode}
        >
          {renderContent()}
        </MainLayout>

        {__IS_DEV_BUILD__ && <DevFooter />}
      </div>
    </ConfigProvider>
  )
}

export default App
```

**Step 2: 验证应用运行正常**

Run: `npm run dev`
Expected: 应用正常启动，可以切换路由

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: use new MainLayout and route-based navigation

- Replaced Sider/Drawer with MainLayout
- Route-based navigation (realtime, history, settings)
- Removed viewMode state, using currentRoute
- Simplified state management

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 7: 删除废弃组件和清理代码

**Files:**
- Delete: `src/components/ViewHeader.tsx`
- Modify: `src/components/LogViewer.tsx` (移除 ViewHeader 引用)
- Modify: `src/components/HistoryViewer.tsx` (移除 ViewHeader 引用)

**Step 1: 删除 ViewHeader 组件**

```bash
rm src/components/ViewHeader.tsx
```

**Step 2: 确保没有 ViewHeader 的引用残留**

搜索并移除所有对 `ViewHeader` 的导入和使用。

**Step 3: 验证编译无错误**

Run: `npm run dev`
Expected: 无 TypeScript 编译错误，无 console 警告

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated ViewHeader component

- Deleted ViewHeader.tsx
- Cleaned up all references
- Verified no import errors

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 8: 应用设计系统样式

**Files:**
- Create: `src/fonts.css`
- Modify: `src/main.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/theme.ts`

**Step 1: 引入 Google Fonts**

创建 `src/fonts.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600;700&family=Fira+Sans:wght@300;400;500;600;700&display=swap');
```

在 `src/main.tsx` 中导入:

```tsx
import './fonts.css'
```

**Step 2: 更新主题配置**

修改 `src/theme.ts`，应用设计系统色彩：

```tsx
// 添加/更新深色主题色彩
export const darkTheme = {
  token: {
    colorPrimary: '#3B82F6',
    colorBgBase: '#0F172A',
    colorTextBase: '#F1F5F9',
    colorBorder: '#1E293B',
    fontFamily: "'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontFamilyCode: "'Fira Code', 'Courier New', monospace"
  }
}

// 更新亮色主题
export const lightTheme = {
  token: {
    colorPrimary: '#3B82F6',
    fontFamily: "'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontFamilyCode: "'Fira Code', 'Courier New', monospace"
  }
}
```

**Step 3: 优化 Sidebar 样式**

修改 `src/components/Sidebar.tsx`，添加更好的视觉效果：

```tsx
// Logo 区域增加字体样式
<div style={{
  height: 64,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderBottom: `1px solid ${themeVars.borderSecondary}`,
  fontSize: 18,
  fontWeight: 600,
  fontFamily: "'Fira Code', monospace",
  color: '#3B82F6',
  letterSpacing: '0.5px'
}}>
  CCMonitor
</div>
```

**Step 4: 验证样式应用正确**

Run: `npm run dev`
Expected:
- 字体正确加载 (Fira Code, Fira Sans)
- 深色主题背景为 #0F172A
- Primary 颜色为 #3B82F6

**Step 5: Commit**

```bash
git add src/fonts.css src/main.tsx src/theme.ts src/components/Sidebar.tsx
git commit -m "style: apply design system colors and fonts

- Added Google Fonts (Fira Code, Fira Sans)
- Updated theme with design system colors
- Primary: #3B82F6, Background: #0F172A
- Applied fonts to UI components

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 9: 测试和优化

**Files:**
- Test all features

**Step 1: 功能测试清单**

- [ ] 侧边栏导航切换正常（实时对话、历史记录、设置）
- [ ] 响应式：窗口缩小时侧边栏自动隐藏
- [ ] 移动端（< 768px）汉堡菜单可以打开侧边栏
- [ ] 实时对话功能正常（监控、清空、AI 总结）
- [ ] 历史记录功能正常（查询、导出、刷新）
- [ ] 设置页面：Claude 配置编辑正常
- [ ] 设置页面：记录管理功能正常
- [ ] 设置页面：主题切换正常（浅色/深色/系统）
- [ ] 深色主题样式正确
- [ ] 字体加载正确

**Step 2: 性能检查**

- 检查是否有不必要的重渲染
- 确保路由切换流畅（无卡顿）
- 验证动画过渡时长合理（150-300ms）

**Step 3: 构建测试**

Run: `npm run build:dev`
Expected: 构建成功，无错误

Run: `npm run build:prod`
Expected: 构建成功，无错误

**Step 4: 记录测试结果**

创建测试报告或更新 README。

**Step 5: Final Commit**

```bash
git add -A
git commit -m "test: verify all features and responsive behavior

- Tested navigation, routing, and mobile responsiveness
- Verified all existing features work correctly
- Build tests passed (dev and prod)
- Performance optimized, no unnecessary rerenders

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## 验收标准

完成后验证：

- [ ] 侧边栏固定 200px，响应式正常
- [ ] 3 个菜单项点击切换路由正常
- [ ] 小屏幕（< 768px）侧边栏自动隐藏
- [ ] 汉堡菜单在移动端正常工作
- [ ] 所有现有功能保持不变
- [ ] 设计系统色彩和字体应用正确
- [ ] 动画流畅，无卡顿
- [ ] 构建无错误，无 console 警告
- [ ] Git 提交历史清晰，符合规范

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-02-02-refactor-layout.md`.**

两种执行方式：

**1. Subagent-Driven (当前会话)** - 我在当前会话中为每个任务分发新的 subagent，任务间进行代码审查，快速迭代

**2. Parallel Session (独立会话)** - 在新会话中使用 executing-plans 技能，批量执行并在检查点审查

你选择哪种方式？
