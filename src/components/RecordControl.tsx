import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { Card, Switch, Button, Typography, Space, Spin, Tag, Alert } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, EditOutlined } from '@ant-design/icons'
import { RecordConfig } from '../types'
import { getThemeVars } from '../theme'

const { Title, Text } = Typography

interface RecordControlProps {
  darkMode: boolean
}

export interface RecordControlRef {
  refresh: () => Promise<void>
}

const RecordControl = forwardRef<RecordControlRef, RecordControlProps>(({ darkMode }, ref) => {
  const themeVars = getThemeVars(darkMode)
  const [config, setConfig] = useState<RecordConfig>({
    enabled: false,
    savePath: ''
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadConfig()
  }, [])

  // 暴露 refresh 方法给父组件
  useImperativeHandle(ref, () => ({
    refresh: async () => {
      await loadConfig()
    }
  }))

  const loadConfig = async () => {
    const result = await window.electronAPI.getRecordConfig()
    setConfig(result)
    setLoading(false)
  }

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      // 开启记录，选择路径
      const result = await window.electronAPI.selectSavePath()
      if (result.canceled || !result.path) {
        return
      }

      const newConfig = {
        enabled: true,
        savePath: result.path
      }

      const saveResult = await window.electronAPI.saveRecordConfig(newConfig)
      if (saveResult.success) {
        setConfig(newConfig)
      } else {
        alert('保存失败：' + saveResult.error)
      }
    } else {
      // 关闭记录
      const newConfig = {
        enabled: false,
        savePath: config.savePath
      }

      const saveResult = await window.electronAPI.saveRecordConfig(newConfig)
      if (saveResult.success) {
        setConfig(newConfig)
      }
    }
  }

  const handleChangePath = async () => {
    const result = await window.electronAPI.selectSavePath()
    if (result.canceled || !result.path) {
      return
    }

    const newConfig = {
      ...config,
      savePath: result.path
    }

    const saveResult = await window.electronAPI.saveRecordConfig(newConfig)
    if (saveResult.success) {
      setConfig(newConfig)
    } else {
      alert('保存失败：' + saveResult.error)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin tip="加载中..." />
      </div>
    )
  }

  return (
    <Space vertical size="middle" style={{ width: '100%' }}>
      <Title level={4} style={{ margin: 0 }}>对话记录控制</Title>

      {!config.enabled && (
        <Alert
          message="此功能必须开启才能使用应用"
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
        />
      )}

      <Card size="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text strong>启用记录</Text>
              {config.enabled ? (
                <Tag icon={<PlayCircleOutlined />} color="success">运行中</Tag>
              ) : (
                <Tag icon={<PauseCircleOutlined />} color="default">未开启</Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {config.enabled ? '正在记录所有对话' : '开启后自动记录所有 Claude Code 对话'}
            </Text>
          </div>
          <Switch
            checked={config.enabled}
            onChange={handleToggle}
            checkedChildren="开"
            unCheckedChildren="关"
          />
        </div>
      </Card>

      {config.savePath && (
        <Card size="small">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <div style={{ marginBottom: 4 }}>
                <Text strong>保存路径</Text>
              </div>
              <Text
                code
                style={{
                  fontSize: 12,
                  wordBreak: 'break-all',
                  display: 'block'
                }}
              >
                {config.savePath}
              </Text>
            </div>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={handleChangePath}
            >
              更改
            </Button>
          </div>
        </Card>
      )}

      <Card styles={{ body: { padding: 12, background: themeVars.bgSection } }} size="small">
        <Space vertical size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💡 自动记录所有 Claude Code 对话
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            📁 按项目和日期分类保存
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            📝 格式：JSONL
          </Text>
        </Space>
      </Card>
    </Space>
  )
})

RecordControl.displayName = 'RecordControl'

export default RecordControl
