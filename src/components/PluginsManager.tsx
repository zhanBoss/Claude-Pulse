/**
 * Claude Code Plugins 管理组件
 * 支持启用/禁用/卸载操作
 */

import { useState, useEffect } from 'react'
import {
  Space,
  Typography,
  Empty,
  Tag,
  message,
  Tooltip,
  Button,
  Switch,
  Popconfirm
} from 'antd'
import {
  AppstoreOutlined,
  FolderOpenOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import { ClaudePlugin } from '../types'
import { getThemeVars } from '../theme'

const { Text } = Typography

interface PluginsManagerProps {
  darkMode: boolean
  onRefresh?: () => void
}

const PluginsManager = (props: PluginsManagerProps) => {
  const { darkMode, onRefresh } = props
  const themeVars = getThemeVars(darkMode)

  const [plugins, setPlugins] = useState<ClaudePlugin[]>([])

  // 加载 Plugins
  const loadPlugins = async () => {
    try {
      const result = await window.electronAPI.getClaudePlugins()
      if (result.success && result.plugins) {
        setPlugins(result.plugins)
      }
    } catch {
      message.error('加载 Plugins 失败')
    }
  }

  useEffect(() => {
    loadPlugins()
  }, [])

  // 切换启用/禁用
  const handleToggle = async (pluginName: string, enabled: boolean) => {
    try {
      const result = await window.electronAPI.toggleClaudePlugin(pluginName, enabled)
      if (result.success) {
        message.success(enabled ? '已启用' : '已禁用')
        loadPlugins()
        onRefresh?.()
      } else {
        message.error(result.error || '操作失败')
      }
    } catch {
      message.error('操作失败')
    }
  }

  // 卸载插件
  const handleUninstall = async (pluginName: string) => {
    try {
      const result = await window.electronAPI.uninstallClaudePlugin(pluginName)
      if (result.success) {
        message.success('卸载成功')
        loadPlugins()
        onRefresh?.()
      } else {
        message.error(result.error || '卸载失败')
      }
    } catch {
      message.error('卸载失败')
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Plugins 扩展 Claude Code 的功能，通过 enabledPlugins 管理启用状态
        </Text>
      </div>

      {plugins.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 11 }}>暂无已安装的 Plugins</Text>}
          style={{ margin: '12px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plugins.map(plugin => (
            <div
              key={plugin.name}
              style={{
                padding: '8px 10px',
                border: `1px solid ${themeVars.border}`,
                borderRadius: 6,
                backgroundColor: themeVars.bgSection,
                opacity: plugin.enabled ? 1 : 0.65
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={6}>
                    <AppstoreOutlined style={{ color: '#722ed1', fontSize: 14 }} />
                    <Text strong style={{ fontSize: 12 }}>{plugin.name}</Text>
                    {plugin.version && (
                      <Tag style={{ fontSize: 10, padding: '0 4px' }}>v{plugin.version}</Tag>
                    )}
                  </Space>
                  {plugin.description && (
                    <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                      {plugin.description}
                    </Text>
                  )}
                  {plugin.installPath && (
                    <Text
                      code
                      style={{
                        fontSize: 10,
                        backgroundColor: themeVars.codeBg,
                        padding: '1px 6px',
                        borderRadius: 3,
                        display: 'inline-block',
                        marginTop: 4,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {plugin.installPath}
                    </Text>
                  )}
                </div>
                <Space size={6} style={{ marginLeft: 8, flexShrink: 0 }}>
                  <Tooltip title={plugin.enabled ? '点击禁用' : '点击启用'}>
                    <Switch
                      size="small"
                      checked={plugin.enabled}
                      onChange={checked => handleToggle(plugin.name, checked)}
                    />
                  </Tooltip>
                  {plugin.installPath && (
                    <Tooltip title="打开目录">
                      <Button
                        type="text"
                        icon={<FolderOpenOutlined />}
                        size="small"
                        onClick={() => window.electronAPI.openInFinder(plugin.installPath!)}
                      />
                    </Tooltip>
                  )}
                  <Popconfirm
                    title="确定卸载此插件？"
                    onConfirm={() => handleUninstall(plugin.name)}
                    okText="卸载"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="卸载">
                      <Button type="text" icon={<DeleteOutlined />} size="small" danger />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default PluginsManager
