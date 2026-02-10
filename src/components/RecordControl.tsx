import { useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import {
  Switch,
  Button,
  Typography,
  Space,
  Spin,
  Tag,
  message,
  Modal,
  InputNumber,
  Select,
  Divider
} from 'antd'
import {
  DeleteOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import { AutoCleanupConfig } from '../types'
import { getElectronModalConfig } from './ElectronModal'
import { getThemeVars } from '../theme'

const { Text } = Typography

interface RecordControlProps {
  darkMode: boolean
}

export interface RecordControlRef {
  refresh: () => Promise<void>
}

// 时间单位选项
const TIME_UNIT_OPTIONS = [
  { label: '分钟', value: 'minutes', ms: 60 * 1000 },
  { label: '小时', value: 'hours', ms: 60 * 60 * 1000 },
  { label: '天', value: 'days', ms: 24 * 60 * 60 * 1000 }
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
  const unitConfig = TIME_UNIT_OPTIONS.find(u => u.value === unit)
  return value * (unitConfig?.ms || 60 * 1000)
}

const RecordControl = forwardRef<RecordControlRef, RecordControlProps>((props, ref) => {
  const { darkMode } = props
  const themeVars = getThemeVars(darkMode)
  const [loading, setLoading] = useState(true)
  const [cleanupLoading, setCleanupLoading] = useState(false)

  // 自动清理配置
  const [autoCleanup, setAutoCleanup] = useState<AutoCleanupConfig>({
    enabled: false,
    intervalMs: 24 * 60 * 60 * 1000,
    retainMs: 12 * 60 * 60 * 1000,
    lastCleanupTime: null,
    nextCleanupTime: null,
    showFloatingBall: true
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
    try {
      const settings = await window.electronAPI.getAppSettings()
      if (settings.autoCleanup) {
        setAutoCleanup(settings.autoCleanup)
        const interval = msToTimeUnit(settings.autoCleanup.intervalMs)
        setIntervalValue(interval.value)
        setIntervalUnit(interval.unit)
        const retain = msToTimeUnit(settings.autoCleanup.retainMs)
        setRetainValue(retain.value)
        setRetainUnit(retain.unit)
      }
    } catch (error) {
      console.error('加载配置失败:', error)
    }

    setLoading(false)
  }

  // 清除所有缓存（本项目用到或可能用到的所有资源）
  const [clearing, setClearing] = useState(false)

  const handleClearAllCache = () => {
    Modal.confirm({
      title: '清除所有缓存',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p style={{ marginBottom: 8 }}>将清除本应用涉及的所有缓存资源：</p>
          <ul style={{ paddingLeft: 20, fontSize: 13, lineHeight: 2, color: themeVars.textSecondary }}>
            <li>对话历史记录（history.jsonl）</li>
            <li>会话详情文件（projects 目录）</li>
            <li>图片缓存（image-cache）</li>
            <li>粘贴内容缓存（paste-cache）</li>
            <li>应用内部缓存</li>
          </ul>
          <p style={{ fontSize: 12, color: themeVars.textTertiary, marginTop: 4 }}>
            Claude Code 的配置文件（settings.json）不受影响
          </p>
        </div>
      ),
      okText: '确认清除',
      okType: 'danger',
      cancelText: '取消',
      width: 420,
      onOk: async () => {
        setClearing(true)
        try {
          const result = await window.electronAPI.clearAllCache()
          if (result.success) {
            const cleared: string[] = []
            const r = result.result
            if (r?.historyCleared) cleared.push('历史记录')
            if (r?.projectsCleared) cleared.push('会话文件')
            if (r?.imageCacheCleared) cleared.push('图片缓存')
            if (r?.pasteCacheCleared) cleared.push('粘贴缓存')
            if (r?.appCacheCleared) cleared.push('应用缓存')

            if (cleared.length > 0) {
              message.success(`已清除：${cleared.join('、')}`)
            } else {
              message.info('没有需要清除的缓存')
            }
          } else {
            message.error(result.error || '清除失败')
          }
        } catch (error: any) {
          message.error(error?.message || '清除失败')
        } finally {
          setClearing(false)
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
        autoCleanup: newConfig
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
      nextCleanupTime: checked ? Date.now() + intervalMs : null
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

    const newConfig: AutoCleanupConfig = {
      ...autoCleanup,
      intervalMs,
      nextCleanupTime: Date.now() + intervalMs
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

    const newConfig: AutoCleanupConfig = {
      ...autoCleanup,
      retainMs
    }
    await saveAutoCleanupConfig(newConfig)
  }

  // 手动触发清理
  const handleManualCleanup = async () => {
    Modal.confirm({
      title: '立即执行清理',
      icon: <ExclamationCircleOutlined />,
      content: `将立即清理超过保留时间（${retainValue} ${TIME_UNIT_OPTIONS.find(u => u.value === retainUnit)?.label}）的图片缓存。确定继续？`,
      okText: '立即清理',
      okType: 'primary',
      cancelText: '取消',
      onOk: async () => {
        setCleanupLoading(true)
        try {
          const result = await window.electronAPI.triggerAutoCleanup()
          if (result.success) {
            if (result.deletedCount && result.deletedCount > 0) {
              message.success(`清理完成，清理了 ${result.deletedCount} 个缓存目录`)
            } else {
              message.info('没有需要清理的缓存')
            }
            await loadConfig()
          } else {
            message.error(result.error || '清理失败')
          }
        } catch (error: any) {
          message.error(error?.message || '清理失败')
        } finally {
          setCleanupLoading(false)
        }
      },
      ...getElectronModalConfig()
    })
  }

  // 切换悬浮球显示
  const handleFloatingBallToggle = async (checked: boolean) => {
    const newConfig: AutoCleanupConfig = {
      ...autoCleanup,
      showFloatingBall: checked
    }
    await saveAutoCleanupConfig(newConfig)
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <Spin size="small" tip="加载中..."><div style={{ padding: 16 }} /></Spin>
      </div>
    )
  }

  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Text strong style={{ fontSize: 13 }}>缓存管理</Text>

      {/* 数据来源说明 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CheckCircleOutlined style={{ color: themeVars.primary, fontSize: 14 }} />
        <Text style={{ fontSize: 12 }}>数据来源</Text>
        <Tag color="success" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>自动读取</Tag>
      </div>
      <Text type="secondary" style={{ fontSize: 11, marginTop: -6, display: 'block' }}>
        直接读取 Claude Code 本地数据（~/.claude），无需额外配置
      </Text>

      <Divider style={{ margin: '4px 0' }} />

      {/* 缓存清理 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <DeleteOutlined style={{ color: themeVars.textSecondary, fontSize: 14 }} />
          <Text style={{ fontSize: 12, fontWeight: 500 }}>资源清理</Text>
        </div>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
          清除本应用涉及的所有缓存资源（历史记录、会话文件、图片缓存等）
        </Text>
        <Button
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={handleClearAllCache}
          loading={clearing}
          block
        >
          清除所有缓存
        </Button>
      </div>

      <Divider style={{ margin: '4px 0' }} />

      {/* 自动清理缓存设置 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: autoCleanup.enabled ? 10 : 0
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockCircleOutlined style={{ color: themeVars.primary, fontSize: 14 }} />
            <Text style={{ fontSize: 12, fontWeight: 500 }}>自动清理</Text>
            {autoCleanup.enabled && (
              <Tag color="processing" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
                已开启
              </Tag>
            )}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            定时自动清理过期的图片缓存
          </Text>
        </div>
        <Switch
          size="small"
          checked={autoCleanup.enabled}
          onChange={handleAutoCleanupToggle}
        />
      </div>

      {autoCleanup.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {/* 清理间隔和保留范围 - 并排显示 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                清理间隔
              </Text>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <InputNumber
                  min={1}
                  max={999}
                  value={intervalValue}
                  onChange={v => handleIntervalChange(v)}
                  style={{ width: 60 }}
                  size="small"
                />
                <Select
                  value={intervalUnit}
                  onChange={v => handleIntervalChange(intervalValue, v)}
                  options={TIME_UNIT_OPTIONS}
                  style={{ width: 70 }}
                  size="small"
                />
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                保留范围
              </Text>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <InputNumber
                  min={1}
                  max={999}
                  value={retainValue}
                  onChange={v => handleRetainChange(v)}
                  style={{ width: 60 }}
                  size="small"
                />
                <Select
                  value={retainUnit}
                  onChange={v => handleRetainChange(retainValue, v)}
                  options={TIME_UNIT_OPTIONS}
                  style={{ width: 70 }}
                  size="small"
                />
              </div>
            </div>
          </div>

          {/* 悬浮球开关和清理按钮 - 并排 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11 }}>悬浮球倒计时</Text>
              <Switch
                size="small"
                checked={autoCleanup.showFloatingBall ?? true}
                onChange={handleFloatingBallToggle}
              />
            </div>
            <Button
              type="primary"
              size="small"
              onClick={handleManualCleanup}
              loading={cleanupLoading}
              style={{ fontSize: 11 }}
            >
              立即清理
            </Button>
          </div>
        </div>
      )}
    </Space>
  )
})

RecordControl.displayName = 'RecordControl'

export default RecordControl
