import { useState, useEffect } from 'react'
import { Layout, Drawer, Button } from 'antd'
import { MenuOutlined } from '@ant-design/icons'
import Sidebar from './Sidebar'
import { getThemeVars } from '../theme'

interface MainLayoutProps {
  currentRoute: string
  onRouteChange: (route: string) => void
  darkMode: boolean
  showRecentEditsEntry?: boolean
  children: React.ReactNode
}

/* 侧边栏折叠阈值 */
const MOBILE_BREAKPOINT = 768

const MainLayout = (props: MainLayoutProps) => {
  const { currentRoute, onRouteChange, darkMode, showRecentEditsEntry = false, children } = props
  const themeVars = getThemeVars(darkMode)
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // 监听窗口大小变化
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <Layout style={{ height: '100vh', display: 'flex', flexDirection: 'row' }}>
      {/* 桌面端：固定侧边栏 */}
      {!isMobile && (
        <Sidebar
          currentRoute={currentRoute}
          onNavigate={onRouteChange}
          darkMode={darkMode}
          showRecentEditsEntry={showRecentEditsEntry}
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
            body: { padding: 0, overflow: 'hidden' }
          }}
        >
          <Sidebar
            currentRoute={currentRoute}
            onNavigate={route => {
              onRouteChange(route)
              setSidebarVisible(false)
            }}
            darkMode={darkMode}
            showRecentEditsEntry={showRecentEditsEntry}
            inDrawer
          />
        </Drawer>
      )}

      {/* 右侧内容区 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* 移动端顶栏：macOS 安全区 + 汉堡菜单 */}
        {isMobile && (
          <div
            style={
              {
                height: 44,
                display: 'flex',
                alignItems: 'center',
                /* macOS hiddenInset 模式下，交通灯占据左侧约 76px */
                paddingLeft: 76,
                paddingRight: 16,
                background: themeVars.bgContainer,
                borderBottom: `1px solid ${themeVars.borderSecondary}`,
                flexShrink: 0,
                WebkitAppRegion: 'drag'
              } as React.CSSProperties
            }
          >
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setSidebarVisible(true)}
              style={
                {
                  color: themeVars.text,
                  width: 32,
                  height: 32,
                  padding: 0,
                  borderRadius: 8,
                  WebkitAppRegion: 'no-drag'
                } as React.CSSProperties
              }
            />
            <span
              style={{
                marginLeft: 12,
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'Fira Code, monospace',
                color: themeVars.primary
              }}
            >
              ClaudePulse
            </span>
          </div>
        )}

        {/* 页面内容 */}
        <Layout.Content
          style={{
            flex: 1,
            background: themeVars.bgContainer,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {children}
        </Layout.Content>
      </div>
    </Layout>
  )
}

export default MainLayout
