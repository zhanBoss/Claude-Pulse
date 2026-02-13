import { useState } from 'react'
import { Input, Button, Typography, Space, message } from 'antd'
import { SaveOutlined, ApiOutlined } from '@ant-design/icons'
import { AIChatSettings } from '../types'
import { getThemeVars } from '../theme'

const { Text } = Typography

interface AIChatConfigSectionProps {
  settings: AIChatSettings
  darkMode: boolean
  onSettingsChange: (newSettings: AIChatSettings) => void
}

const AIChatConfigSection = ({
  settings,
  darkMode,
  onSettingsChange
}: AIChatConfigSectionProps) => {
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const themeVars = getThemeVars(darkMode)

  // 遮罩 API Key
  const maskApiKey = (key: string): string => {
    if (!key || key.length <= 8) return key
    return `${key.slice(0, 4)}...${key.slice(-4)}`
  }

  // 更新设置
  const updateSetting = (key: keyof AIChatSettings, value: string) => {
    const newSettings = {
      ...settings,
      [key]: value
    }
    onSettingsChange(newSettings)
    setIsEditing(true)
  }

  // 保存配置
  const handleSave = async () => {
    setApiKeySaving(true)
    try {
      message.success('配置保存成功')
      setIsEditing(false)
    } catch (error) {
      message.error('保存配置失败')
    } finally {
      setApiKeySaving(false)
    }
  }

  // 判断配置是否完整
  const isConfigComplete = settings.apiKey && settings.apiBaseUrl && settings.model

  return (
    <div style={{ padding: '8px 0' }}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {/* API Key */}
        <div>
          <Text style={{ color: themeVars.text, fontWeight: 500, fontSize: 12 }}>
            <ApiOutlined style={{ marginRight: 6 }} />
            API Key
          </Text>
          <Input.Password
            size="small"
            value={settings.apiKey}
            onChange={e => updateSetting('apiKey', e.target.value)}
            placeholder="请输入 API Key"
            visibilityToggle={{
              visible: apiKeyVisible,
              onVisibleChange: setApiKeyVisible
            }}
            onPressEnter={handleSave}
            onFocus={() => setIsEditing(true)}
            style={{ marginTop: 4 }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {settings.apiKey && !isEditing
              ? `已设置: ${maskApiKey(settings.apiKey)}`
              : '你的 API Key 将加密存储在本地'}
          </Text>
        </div>

        {/* API 地址 */}
        <div>
          <Text style={{ color: themeVars.text, fontWeight: 500, fontSize: 12 }}>API 地址</Text>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
            （支持任意服务、代理、中转）
          </Text>
          <Input
            size="small"
            value={settings.apiBaseUrl}
            onChange={e => updateSetting('apiBaseUrl', e.target.value)}
            placeholder="https://api.groq.com/openai/v1"
            onPressEnter={handleSave}
            onFocus={() => setIsEditing(true)}
            style={{ marginTop: 4 }}
          />
        </div>

        {/* 模型名称 */}
        <div>
          <Text style={{ color: themeVars.text, fontWeight: 500, fontSize: 12 }}>模型名称</Text>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
            （例如: deepseek-chat, gpt-4, claude-3 等）
          </Text>
          <Input
            size="small"
            value={settings.model}
            onChange={e => updateSetting('model', e.target.value)}
            placeholder="llama-3.3-70b-versatile"
            onPressEnter={handleSave}
            onFocus={() => setIsEditing(true)}
            style={{ marginTop: 4 }}
          />
        </div>

        {/* 保存按钮 */}
        <div style={{ textAlign: 'right', marginTop: 4 }}>
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={apiKeySaving}
            disabled={!isEditing && !!isConfigComplete}
            style={{ fontSize: 12 }}
          >
            保存配置
          </Button>
        </div>
      </Space>
    </div>
  )
}

export default AIChatConfigSection
