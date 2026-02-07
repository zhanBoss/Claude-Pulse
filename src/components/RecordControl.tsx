import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { Card, Switch, Button, Typography, Space, Spin, Tag, Alert, message, Modal, InputNumber, Select, Divider } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { RecordConfig, AutoCleanupConfig } from '../types'
import { getElectronModalConfig } from './ElectronModal'

const { Title, Text } = Typography

interface RecordControlProps {
  // darkMode 参数保留以保持接口一致性，但当前未使用
}

export interface RecordControlRef {
  refresh: () => Promise<void>
}

// 时间单位选项
const TIME_UNIT_OPTIONS = [
  { label: '分钟', value: 'minutes', ms: 60 * 1000 },
  { label: '小时', value: 'hours', ms: 60 * 60 * 1000 },
  { label: '天', value: 'days', ms: 24 * 60 * 60 * 1000 },
]

/**
 * 将毫秒转换为最合适的时间值和单位
 */
const msToTimeUnit = (ms: number): { value: number; unit: string } => {
  const days = ms / (24 * 60 * 60 * 1000)
  if (days >= 1 && Number.isInteger(days)) {
    return { value: days, unit: 'days' }
  }
  const hours = ms / (60 * 60 * 1000)
  if (hours >= 1 && Number.isInteger(hours)) {
    return { value: hours, unit: 'hours' }
  }
  const minutes = ms / (60 * 1000)
  return { value: minutes, unit: 'minutes' }
}

/**
 * 将时间值和单位转换为毫秒
 */
const timeUnitToMs = (value: number, unit: string): number => {
  const unitConfig = TIME_UNIT_OPTIONS.find((u) => u.value === unit)
  return value * (unitConfig?.ms || 60 * 1000)
}

const RecordControl = forwardRef<RecordControlRef, RecordControlProps>((_, ref) => {
  const [config, setConfig] = useState<RecordConfig>({
    enabled: false,
    savePath: ''
  })
  const [loading, setLoading] = useState(true)

  // 自动清理配置
  const [autoCleanup, setAutoCleanup] = useState<AutoCleanupConfig>({
    enabled: false,
    intervalMs: 24 * 60 * 60 * 1000,
    retainMs: 12 * 60 * 60 * 1000,
    lastCleanupTime: null,
    nextCleanupTime: null,
  })

  // 时间输入状态
  const [intervalValue, setIntervalValue] = useState(24)
  const [intervalUnit, setIntervalUnit] = useState('hours')
  const [retainValue, setRetainValue] = useState(12)
  const [retainUnit, setRetainUnit] = useState('hours')

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

    // 加载自动清理配置
    try {
      const settings = await window.electronAPI.getAppSettings()
      if (settings.autoCleanup) {
        setAutoCleanup(settings.autoCleanup)
        // 解析时间值
        const interval = msToTimeUnit(settings.autoCleanup.intervalMs)
        setIntervalValue(interval.value)
        setIntervalUnit(interval.unit)
        const retain = msToTimeUnit(settings.autoCleanup.retainMs)
        setRetainValue(retain.value)
        setRetainUnit(retain.unit)
      }
    } catch (error) {
      console.error('加载自动清理配置失败:', error)
    }

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

  const handleClearCache = () => {
    Modal.confirm({
      title: '清除缓存',
      icon: <ExclamationCircleOutlined />,
      content: '将删除保存路径下的所有对话记录和图片缓存，不影响 Claude Code 原始数据。',
      okText: '确认',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await window.electronAPI.clearCache()
          if (result.success) {
            message.success(`已清除 ${result.deletedCount} 个文件`)
          } else {
            message.error(result.error || '清除失败')
          }
        } catch (error: any) {
          message.error(error?.message || '清除失败')
        }
      },
      ...getElectronModalConfig()
    })
  }

  // 保存自动清理配置
  const saveAutoCleanupConfig = async (newConfig: AutoCleanupConfig) => {
    try {
      const settings = await window.electronAPI.getAppSettings()
      const updatedSettings = {
        ...settings,
        autoCleanup: newConfig,
      }
      await window.electronAPI.saveAppSettings(updatedSettings)
      setAutoCleanup(newConfig)
    } catch (error: any) {
      message.error('保存自动清理配置失败')
      console.error('保存自动清理配置失败:', error)
    }
  }

  // 切换自动清理开关
  const handleAutoCleanupToggle = async (checked: boolean) => {
    const intervalMs = timeUnitToMs(intervalValue, intervalUnit)
    const retainMs = timeUnitToMs(retainValue, retainUnit)

    const newConfig: AutoCleanupConfig = {
      ...autoCleanup,
      enabled: checked,
      intervalMs,
      retainMs,
      nextCleanupTime: checked ? Date.now() + intervalMs : null,
    }
    await saveAutoCleanupConfig(newConfig)
    if (checked) {
      message.success('自动清理已开启')
    } else {
      message.info('自动清理已关闭')
    }
  }

  // 更新清理间隔
  const handleIntervalChange = async (value: number | null, unit?: string) => {
    const newValue = value || 1
    const newUnit = unit || intervalUnit
    setIntervalValue(newValue)
    if (unit !== undefined) setIntervalUnit(newUnit)

    if (!autoCleanup.enabled) return

    const intervalMs = timeUnitToMs(newValue, newUnit)

    // 移除实时校验，允许用户自由输入
    const newConfig: AutoCleanupConfig = {
      ...autoCleanup,
      intervalMs,
      nextCleanupTime: Date.now() + intervalMs,
    }
    await saveAutoCleanupConfig(newConfig)
  }

  // 更新保留时间
  const handleRetainChange = async (value: number | null, unit?: string) => {
    const newValue = value || 1
    const newUnit = unit || retainUnit
    setRetainValue(newValue)
    if (unit !== undefined) setRetainUnit(newUnit)

    if (!autoCleanup.enabled) return

    const retainMs = timeUnitToMs(newValue, newUnit)

    // 移除实时校验，允许用户自由输入
    const newConfig: AutoCleanupConfig = {
      ...autoCleanup,
      retainMs,
    }
    await saveAutoCleanupConfig(newConfig)
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin tip="加载中..." />
      </div>
    )
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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

      {config.savePath && (
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={handleClearCache}
          block
        >
          清除缓存
        </Button>
      )}

      {/* 自动清理缓存设置 */}
      {config.savePath && (
        <>
          <Divider style={{ margin: '8px 0' }} />
          <Card size="small">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: autoCleanup.enabled ? 16 : 0 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ClockCircleOutlined style={{ color: '#D97757' }} />
                  <Text strong>自动清理</Text>
                  {autoCleanup.enabled && (
                    <Tag color="processing" style={{ fontSize: 11 }}>已开启</Tag>
                  )}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  定时自动清理过期的对话记录缓存
                </Text>
              </div>
              <Switch
                checked={autoCleanup.enabled}
                onChange={handleAutoCleanupToggle}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </div>

            {autoCleanup.enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* 清理间隔 */}
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                    清理间隔（每隔多久执行一次清理）
                  </Text>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'inherit', whiteSpace: 'nowrap' }}>每</span>
                    <InputNumber
                      min={1}
                      max={999}
                      value={intervalValue}
                      onChange={(v) => handleIntervalChange(v)}
                      style={{ width: 80 }}
                      size="small"
                    />
                    <Select
                      value={intervalUnit}
                      onChange={(v) => handleIntervalChange(intervalValue, v)}
                      options={TIME_UNIT_OPTIONS}
                      style={{ width: 90 }}
                      size="small"
                    />
                    <span style={{ fontSize: 13, color: 'inherit', whiteSpace: 'nowrap' }}>清理一次</span>
                  </div>
                </div>

                {/* 保留范围 */}
                <div>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                    保留范围（保留最近多久的数据，清理更早的）
                  </Text>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'inherit', whiteSpace: 'nowrap' }}>保留最近</span>
                    <InputNumber
                      min={1}
                      max={999}
                      value={retainValue}
                      onChange={(v) => handleRetainChange(v)}
                      style={{ width: 80 }}
                      size="small"
                    />
                    <Select
                      value={retainUnit}
                      onChange={(v) => handleRetainChange(retainValue, v)}
                      options={TIME_UNIT_OPTIONS}
                      style={{ width: 90 }}
                      size="small"
                    />
                    <span style={{ fontSize: 13, color: 'inherit', whiteSpace: 'nowrap' }}>的数据</span>
                  </div>
                </div>

                {/* 说明 */}
                <Alert
                  type="info"
                  showIcon
                  message={
                    <span style={{ fontSize: 12 }}>
                      每 <strong>{intervalValue} {TIME_UNIT_OPTIONS.find(u => u.value === intervalUnit)?.label}</strong> 自动清理一次，
                      保留最近 <strong>{retainValue} {TIME_UNIT_OPTIONS.find(u => u.value === retainUnit)?.label}</strong> 的数据
                    </span>
                  }
                  style={{ padding: '6px 12px' }}
                />
              </div>
            )}
          </Card>
        </>
      )}
    </Space>
  )
})

RecordControl.displayName = 'RecordControl'

export default RecordControl
