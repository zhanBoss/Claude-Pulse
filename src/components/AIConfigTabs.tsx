import { useState } from 'react'
import { Card, Tabs, Space, Tag } from 'antd'
import { RobotOutlined } from '@ant-design/icons'
import { AIChatSettings, AISummarySettings } from '../types'
import { getThemeVars } from '../theme'
import AIChatConfigSection from './AIChatConfigSection'
import AIConfigSection from './AIConfigSection'

interface AIConfigTabsProps {
  aiChat: AIChatSettings
  aiSummary: AISummarySettings
  darkMode: boolean
  onAIChatChange: (settings: AIChatSettings) => void
  onAISummaryChange: (settings: AISummarySettings) => void
}

const AIConfigTabs = ({
  aiChat,
  aiSummary,
  darkMode,
  onAIChatChange,
  onAISummaryChange
}: AIConfigTabsProps) => {
  const themeVars = getThemeVars(darkMode)
  const [activeTab, setActiveTab] = useState<string>('chat')

  // AI 对话无 enabled，总结有 enabled
  const anyEnabled = aiSummary.enabled

  return (
    <Card
      id="ai-settings"
      size="small"
      title={
        <Space size={8}>
          <RobotOutlined style={{ color: themeVars.primary, fontSize: 16 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>AI 功能配置</span>
          <Tag
            color={anyEnabled ? 'success' : 'default'}
            style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
          >
            {anyEnabled ? '已启用' : '未启用'}
          </Tag>
        </Space>
      }
      style={{
        backgroundColor: themeVars.bgContainer,
        borderColor: themeVars.border,
        borderRadius: 10,
        boxShadow: darkMode
          ? '0 1px 4px rgba(0, 0, 0, 0.12)'
          : '0 1px 4px rgba(0, 0, 0, 0.04)'
      }}
      styles={{
        header: {
          borderBottom: `1px solid ${themeVars.borderSecondary}`,
          padding: '10px 16px',
          minHeight: 'auto'
        },
        body: {
          padding: '12px 16px'
        }
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        items={[
          {
            key: 'chat',
            label: <span style={{ fontSize: 12 }}>AI 对话</span>,
            children: (
              <AIChatConfigSection
                settings={aiChat}
                darkMode={darkMode}
                onSettingsChange={onAIChatChange}
              />
            )
          },
          {
            key: 'summary',
            label: (
              <Space size={4}>
                <span style={{ fontSize: 12 }}>AI 总结</span>
                {aiSummary.enabled && (
                  <Tag color="success" style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px' }}>
                    已启用
                  </Tag>
                )}
              </Space>
            ),
            children: (
              <AIConfigSection
                description="使用 AI 自动生成会话总结，适合使用快速经济的模型（如 Groq、Gemini Flash）"
                settings={aiSummary}
                darkMode={darkMode}
                onSettingsChange={newSettings => onAISummaryChange(newSettings)}
                showEnabled={true}
              />
            )
          }
        ]}
      />
    </Card>
  )
}

export default AIConfigTabs
