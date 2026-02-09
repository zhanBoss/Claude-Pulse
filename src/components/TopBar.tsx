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
    <div
      style={{
        height: 64,
        background: themeVars.bgContainer,
        borderBottom: `1px solid ${themeVars.borderSecondary}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px'
      }}
    >
      <Space>
        {showMenuButton && <Button icon={<MenuOutlined />} onClick={onMenuClick} type="text" />}
        <span
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: themeVars.text
          }}
        >
          {title}
        </span>
      </Space>
    </div>
  )
}

export default TopBar
