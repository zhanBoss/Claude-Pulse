import { Tag, Space, Button, Tooltip } from 'antd'
import { FolderOutlined, MessageOutlined, SettingOutlined } from '@ant-design/icons'
import type { CSSProperties } from 'react'

interface StatusBarProps {
  claudeDir: string
  darkMode: boolean
  onThemeToggle: () => void
  onOpenSettings: () => void
}

function StatusBar({ claudeDir, darkMode, onThemeToggle, onOpenSettings }: StatusBarProps) {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        WebkitAppRegion: 'drag',
        padding: '12px 16px',
        minHeight: 64,
        flexShrink: 0
      } as CSSProperties}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <Space size="middle">
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            background: 'rgba(255,255,255,0.2)',
            borderRadius: 8,
            fontSize: 20,
            flexShrink: 0
          }}>
            <MessageOutlined style={{ color: 'white' }} />
          </div>
          <div>
            <div style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'white',
              letterSpacing: 0.5,
              whiteSpace: 'nowrap'
            }}>
              Claude Code Monitor
            </div>
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.85)',
              marginTop: 2
            }}>
              对话记录监控工具
            </div>
          </div>
        </Space>

        <Space size="middle">
          <Tooltip title="设置">
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={onOpenSettings}
              style={{
                WebkitAppRegion: 'no-drag',
                color: 'white',
                background: 'rgba(255,255,255,0.15)',
                borderColor: 'rgba(255,255,255,0.3)',
                backdropFilter: 'blur(10px)'
              } as CSSProperties}
            />
          </Tooltip>

          <Tooltip title={darkMode ? '切换到亮色模式' : '切换到暗色模式'}>
            <button
              onClick={onThemeToggle}
              aria-label={darkMode ? '切换到亮色模式' : '切换到暗色模式'}
              style={{
                WebkitAppRegion: 'no-drag',
                position: 'relative',
                width: 56,
                height: 28,
                background: darkMode
                  ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(147, 51, 234, 0.2) 100%)'
                  : 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 146, 60, 0.2) 100%)',
                border: `2px solid ${darkMode ? 'rgba(147, 197, 253, 0.4)' : 'rgba(252, 211, 77, 0.4)'}`,
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                backdropFilter: 'blur(10px)',
                padding: 0,
                outline: 'none',
                boxShadow: darkMode
                  ? '0 0 12px rgba(59, 130, 246, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                  : '0 0 12px rgba(251, 191, 36, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.1)'
              } as CSSProperties}
              onMouseEnter={(e) => {
                const target = e.currentTarget
                target.style.transform = 'scale(1.05)'
                target.style.boxShadow = darkMode
                  ? '0 0 20px rgba(59, 130, 246, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                  : '0 0 20px rgba(251, 191, 36, 0.5), inset 0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
              onMouseLeave={(e) => {
                const target = e.currentTarget
                target.style.transform = 'scale(1)'
                target.style.boxShadow = darkMode
                  ? '0 0 12px rgba(59, 130, 246, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.1)'
                  : '0 0 12px rgba(251, 191, 36, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.1)'
              }}
              onFocus={(e) => {
                e.currentTarget.style.outline = '3px solid rgba(255, 255, 255, 0.6)'
                e.currentTarget.style.outlineOffset = '2px'
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = 'none'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: darkMode ? 'calc(100% - 26px)' : '2px',
                  width: 20,
                  height: 20,
                  background: darkMode
                    ? 'linear-gradient(135deg, #3B82F6 0%, #9333EA 100%)'
                    : 'linear-gradient(135deg, #FCD34D 0%, #FB923C 100%)',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: darkMode
                    ? '0 2px 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(147, 51, 234, 0.4)'
                    : '0 2px 8px rgba(251, 191, 36, 0.6), 0 0 16px rgba(251, 146, 60, 0.4)',
                  fontSize: 11,
                  color: 'white',
                  fontWeight: 600
                }}
              >
                {darkMode ? '🌙' : '☀️'}
              </div>
            </button>
          </Tooltip>

          <Tag
            icon={<FolderOutlined />}
            color="blue"
            style={{
              background: 'rgba(255,255,255,0.15)',
              borderColor: 'rgba(255,255,255,0.3)',
              color: 'white',
              padding: '6px 12px',
              fontSize: 12,
              fontFamily: 'monospace',
              backdropFilter: 'blur(10px)',
              maxWidth: 300,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {claudeDir}
          </Tag>
        </Space>
      </div>
    </div>
  )
}

export default StatusBar
