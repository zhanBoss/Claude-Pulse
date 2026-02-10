import { useState, useEffect } from 'react'
import { Input, Typography, Button, message, Space } from 'antd'
import { DollarOutlined, ReloadOutlined } from '@ant-design/icons'
import { TokenPricingConfig } from '../types'
import { getThemeVars } from '../theme'
import { ElectronModal } from './ElectronModal'

const { Text } = Typography

interface TokenPriceModalProps {
  open: boolean
  onClose: () => void
  darkMode: boolean
}

/* Token 价格配置弹窗 */
const TokenPriceModal = (props: TokenPriceModalProps) => {
  const { open, onClose, darkMode } = props
  const themeVars = getThemeVars(darkMode)

  const [tokenPricing, setTokenPricing] = useState<TokenPricingConfig>({
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheWritePrice: 3.75,
    cacheReadPrice: 0.3
  })
  const [loading, setLoading] = useState(false)

  /* 加载当前设置 */
  useEffect(() => {
    if (open) {
      loadSettings()
    }
  }, [open])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getSettings()
      if (result.success && result.settings?.tokenPricing) {
        setTokenPricing(result.settings.tokenPricing)
      } else {
        // 使用默认值
        setTokenPricing({
          inputPrice: 3.0,
          outputPrice: 15.0,
          cacheWritePrice: 3.75,
          cacheReadPrice: 0.3
        })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setLoading(false)
    }
  }

  /* 保存设置 */
  const handleSave = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getSettings()
      if (result.success) {
        const newSettings = {
          ...result.settings,
          tokenPricing
        }
        const saveResult = await window.electronAPI.saveSettings(newSettings)
        if (saveResult.success) {
          message.success('Token 价格已保存')
          onClose()
        } else {
          message.error('保存失败: ' + saveResult.error)
        }
      }
    } catch (error) {
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  /* 重置为默认值 */
  const handleReset = () => {
    setTokenPricing({
      inputPrice: 3.0,
      outputPrice: 15.0,
      cacheWritePrice: 3.75,
      cacheReadPrice: 0.3
    })
    message.info('已重置为默认价格')
  }

  /* 更新价格字段 */
  const updatePrice = (field: keyof TokenPricingConfig, value: string) => {
    const numValue = value === '' ? 0 : parseFloat(value)
    setTokenPricing(prev => ({
      ...prev,
      [field]: numValue
    }))
  }

  return (
    <ElectronModal
      title={
        <Space size={8}>
          <DollarOutlined style={{ color: themeVars.primary }} />
          <span>Token 价格配置</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={400}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleReset}
            disabled={loading}
          >
            重置默认
          </Button>
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" onClick={handleSave} loading={loading}>
              保存
            </Button>
          </Space>
        </div>
      }
    >
      <Text
        type="secondary"
        style={{
          fontSize: 12,
          display: 'block',
          marginBottom: 16
        }}
      >
        配置 Token 价格以计算使用成本，单位: USD/MTok (百万 Token)
      </Text>

      {/* 2x2 网格布局 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12
        }}
      >
        <div>
          <Text
            style={{
              color: themeVars.text,
              fontWeight: 500,
              fontSize: 12,
              display: 'block',
              marginBottom: 4
            }}
          >
            输入价格
          </Text>
          <Input
            type="number"
            size="small"
            min={0}
            step={0.01}
            placeholder="3.0"
            value={tokenPricing.inputPrice || ''}
            onChange={e => updatePrice('inputPrice', e.target.value)}
            suffix="$/MTok"
          />
        </div>

        <div>
          <Text
            style={{
              color: themeVars.text,
              fontWeight: 500,
              fontSize: 12,
              display: 'block',
              marginBottom: 4
            }}
          >
            输出价格
          </Text>
          <Input
            type="number"
            size="small"
            min={0}
            step={0.01}
            placeholder="15.0"
            value={tokenPricing.outputPrice || ''}
            onChange={e => updatePrice('outputPrice', e.target.value)}
            suffix="$/MTok"
          />
        </div>

        <div>
          <Text
            style={{
              color: themeVars.text,
              fontWeight: 500,
              fontSize: 12,
              display: 'block',
              marginBottom: 4
            }}
          >
            缓存写入
          </Text>
          <Input
            type="number"
            size="small"
            min={0}
            step={0.01}
            placeholder="3.75"
            value={tokenPricing.cacheWritePrice || ''}
            onChange={e => updatePrice('cacheWritePrice', e.target.value)}
            suffix="$/MTok"
          />
        </div>

        <div>
          <Text
            style={{
              color: themeVars.text,
              fontWeight: 500,
              fontSize: 12,
              display: 'block',
              marginBottom: 4
            }}
          >
            缓存读取
          </Text>
          <Input
            type="number"
            size="small"
            min={0}
            step={0.01}
            placeholder="0.3"
            value={tokenPricing.cacheReadPrice || ''}
            onChange={e => updatePrice('cacheReadPrice', e.target.value)}
            suffix="$/MTok"
          />
        </div>
      </div>
    </ElectronModal>
  )
}

export default TokenPriceModal
