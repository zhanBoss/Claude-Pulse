import { Menu } from 'antd'
import {
  ThunderboltOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  EditOutlined,
  StarOutlined,
  CommentOutlined,
  SettingOutlined,
  FileTextOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import { getThemeVars } from '../theme'

interface SidebarProps {
  currentRoute: string
  onNavigate: (route: string) => void
  darkMode: boolean
  showRecentEditsEntry?: boolean
  /** 是否在 Drawer 中渲染（移动端），不需要 macOS 安全区处理 */
  inDrawer?: boolean
}

/* macOS hiddenInset 模式下交通灯高度 */
const TRAFFIC_LIGHT_HEIGHT = 38

const Sidebar = (props: SidebarProps) => {
  const { currentRoute, onNavigate, darkMode, showRecentEditsEntry = false, inDrawer = false } = props
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
      key: 'statistics',
      icon: <BarChartOutlined />,
      label: '使用统计'
    },
    {
      key: 'prompts',
      icon: <StarOutlined />,
      label: '常用Prompt'
    },
    {
      key: 'chat',
      icon: <CommentOutlined />,
      label: 'AI 助手'
    },
    ...(showRecentEditsEntry
      ? [
          {
            key: 'recent-edits',
            icon: <EditOutlined />,
            label: '最近编辑'
          }
        ]
      : []),
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '应用设置'
    },
    {
      key: 'changelog',
      icon: <FileTextOutlined />,
      label: '更新日志'
    },
    {
      key: 'about',
      icon: <InfoCircleOutlined />,
      label: '关于'
    }
  ]

  return (
    <div
      style={{
        width: 200,
        height: inDrawer ? '100%' : '100vh',
        background: themeVars.bgContainer,
        borderRight: inDrawer ? 'none' : `1px solid ${themeVars.borderSecondary}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      {/* 顶部区域：交通灯 + Logo 同行，Logo 避开交通灯 */}
      {/* macOS 交通灯是窗口级的，Drawer 弹出层也会被遮挡，统一右对齐 */}
      <div
        style={
          {
            height: TRAFFIC_LIGHT_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 24,
            fontSize: 18,
            fontWeight: 600,
            fontFamily: 'Fira Code, monospace',
            color: themeVars.primary,
            flexShrink: 0,
            ...(inDrawer ? {} : { WebkitAppRegion: 'drag' as const })
          } as React.CSSProperties
        }
      >
        CCMonitor
      </div>

      {/* 分割线 */}
      <div
        style={{
          height: 1,
          flexShrink: 0,
          background: themeVars.borderSecondary,
          margin: '0 16px'
        }}
      />

      {/* 导航菜单 - 占满剩余空间，仅超出时滚动 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingTop: 4
        }}
      >
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
    </div>
  )
}

export default Sidebar
