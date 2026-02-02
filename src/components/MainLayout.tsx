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
