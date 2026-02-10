/**
 * Claude Code 配置管理组件
 * 提供 MCP 服务器、Skills、Plugins 的可视化管理
 */

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import {
  Tabs,
  Space,
  Typography,
  Button,
  Empty,
  Tag,
  Spin,
  message,
  Tooltip
} from 'antd'
import {
  CloudServerOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  CodeOutlined,
  EditOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  CopyOutlined,
  ShopOutlined,
  StarOutlined
} from '@ant-design/icons'
import { getThemeVars } from '../theme'
import { MCPServer, ClaudeSkill, ClaudePlugin, OnlineMCPServer, MCPInstallConfig } from '../types'
import ElectronModal from './ElectronModal'
import Editor from '@monaco-editor/react'
import MCPInstalledList from './MCPInstalledList'
import MCPMarketList from './MCPMarketList'
import MCPInstallModal from './MCPInstallModal'

const { Text } = Typography

interface ClaudeConfigManagerProps {
  darkMode: boolean
}

export interface ClaudeConfigManagerRef {
  refresh: () => Promise<void>
}

const ClaudeConfigManager = forwardRef<ClaudeConfigManagerRef, ClaudeConfigManagerProps>(
  (props, ref) => {
    const { darkMode } = props
    const themeVars = getThemeVars(darkMode)

    // 状态
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('settings')
    const [config, setConfig] = useState<string>('')
    const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
    const [skills, setSkills] = useState<ClaudeSkill[]>([])
    const [plugins, setPlugins] = useState<ClaudePlugin[]>([])

    // 编辑器状态
    const [editorVisible, setEditorVisible] = useState(false)
    const [editedConfig, setEditedConfig] = useState<string>('')
    const [saving, setSaving] = useState(false)

    // MCP Tab 子 Tab 状态
    const [mcpSubTab, setMcpSubTab] = useState('installed')
    const [installModalVisible, setInstallModalVisible] = useState(false)
    const [serverToInstall, setServerToInstall] = useState<OnlineMCPServer | null>(null)

    // 加载数据
    const loadData = async () => {
      setLoading(true)
      try {
        // 加载完整配置
        const result = await window.electronAPI.getClaudeCodeFullConfig()
        if (result.success && result.config) {
          setMcpServers(result.config.mcpServers || [])
          setSkills(result.config.skills || [])
          setPlugins(result.config.plugins || [])

          // 格式化 settings
          try {
            const formatted = JSON.stringify(result.config.settings, null, 2)
            setConfig(formatted)
            setEditedConfig(formatted)
          } catch {
            setConfig('{}')
            setEditedConfig('{}')
          }
        }
      } catch (error) {
        message.error('加载配置失败')
      } finally {
        setLoading(false)
      }
    }

    useEffect(() => {
      loadData()
    }, [])

    // 暴露 refresh 方法
    useImperativeHandle(ref, () => ({
      refresh: loadData
    }))

    // 保存 settings.json
    const handleSaveConfig = async () => {
      setSaving(true)
      try {
        JSON.parse(editedConfig) // 验证 JSON
        const result = await window.electronAPI.saveClaudeConfig(editedConfig)
        if (result.success) {
          setConfig(editedConfig)
          message.success('保存成功')
          setEditorVisible(false)
          loadData() // 重新加载以更新所有数据
        } else {
          message.error(result.error || '保存失败')
        }
      } catch {
        message.error('JSON 格式错误')
      } finally {
        setSaving(false)
      }
    }

    // 刷新 MCP 服务器列表
    const refreshMcpServers = async () => {
      try {
        const result = await window.electronAPI.getMCPServers()
        if (result.success && result.servers) {
          setMcpServers(result.servers)
        }
      } catch (error) {
        console.error('刷新 MCP 服务器失败:', error)
      }
    }

    // 打开安装弹窗
    const handleOpenInstallModal = (server: OnlineMCPServer) => {
      setServerToInstall(server)
      setInstallModalVisible(true)
    }

    // 执行安装
    const handleInstall = async (name: string, config: MCPInstallConfig, target: 'claude' | 'cursor') => {
      const result = await window.electronAPI.installMCPServer(name, config, target)
      if (result.success) {
        message.success('安装成功')
        setInstallModalVisible(false)
        setServerToInstall(null)
        refreshMcpServers()
      } else {
        message.error(result.error || '安装失败')
        throw new Error(result.error)
      }
    }

    // 复制到剪贴板
    const copyToClipboard = async (text: string) => {
      await window.electronAPI.copyToClipboard(text)
      message.success('已复制')
    }

    // 获取配置摘要
    const getConfigSummary = () => {
      try {
        const obj = JSON.parse(config)
        const keys = Object.keys(obj)
        return `${keys.length} 项配置`
      } catch {
        return '格式错误'
      }
    }

    if (loading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 80 }}>
          <Spin size="small" tip="加载中...">
            <div style={{ padding: 20 }} />
          </Spin>
        </div>
      )
    }

    // Tab 项
    const tabItems = [
      {
        key: 'settings',
        label: (
          <Space size={4}>
            <CodeOutlined />
            <span style={{ fontSize: 12 }}>配置</span>
            <Tag style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{getConfigSummary()}</Tag>
          </Space>
        ),
        children: (
          <div style={{ padding: '8px 0' }}>
            {/* settings.json 预览 */}
            <div
              onClick={() => {
                setEditedConfig(config)
                setEditorVisible(true)
              }}
              style={{
                cursor: 'pointer',
                padding: '8px 12px',
                border: `1px solid ${themeVars.border}`,
                borderRadius: 6,
                backgroundColor: themeVars.bgSection,
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = themeVars.primary
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = themeVars.border
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Space size={6}>
                  <CodeOutlined style={{ fontSize: 14, color: themeVars.primary }} />
                  <Text strong style={{ fontSize: 12 }}>
                    settings.json
                  </Text>
                </Space>
                <Button type="primary" icon={<EditOutlined />} size="small" style={{ fontSize: 11 }}>
                  编辑
                </Button>
              </div>
              <div
                style={{
                  background: themeVars.codeBg,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: themeVars.textSecondary,
                  maxHeight: 36,
                  overflow: 'hidden',
                  marginTop: 6
                }}
              >
                {config.split('\n').slice(0, 2).join('\n')}
                {config.split('\n').length > 2 && '...'}
              </div>
            </div>
          </div>
        )
      },
      {
        key: 'mcp',
        label: (
          <Space size={4}>
            <CloudServerOutlined />
            <span style={{ fontSize: 12 }}>MCP</span>
            <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
              {mcpServers.length}
            </Tag>
          </Space>
        ),
        children: (
          <div style={{ padding: '8px 0' }}>
            <Tabs
              activeKey={mcpSubTab}
              onChange={setMcpSubTab}
              size="small"
              items={[
                {
                  key: 'installed',
                  label: (
                    <Space size={4}>
                      <CloudServerOutlined style={{ fontSize: 12 }} />
                      <span style={{ fontSize: 11 }}>已安装</span>
                      <Tag style={{ fontSize: 9, padding: '0 3px', margin: 0 }}>
                        {mcpServers.length}
                      </Tag>
                    </Space>
                  ),
                  children: (
                    <MCPInstalledList
                      darkMode={darkMode}
                      onRefresh={refreshMcpServers}
                    />
                  )
                },
                {
                  key: 'market',
                  label: (
                    <Space size={4}>
                      <ShopOutlined style={{ fontSize: 12 }} />
                      <span style={{ fontSize: 11 }}>市场</span>
                    </Space>
                  ),
                  children: (
                    <MCPMarketList
                      darkMode={darkMode}
                      installedServers={mcpServers}
                      onInstall={handleOpenInstallModal}
                      onRefreshInstalled={refreshMcpServers}
                    />
                  )
                },
                {
                  key: 'recommend',
                  label: (
                    <Space size={4}>
                      <StarOutlined style={{ fontSize: 12 }} />
                      <span style={{ fontSize: 11 }}>推荐</span>
                    </Space>
                  ),
                  children: (
                    <div style={{ padding: '20px 0', textAlign: 'center' }}>
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <Space direction="vertical" size={4}>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              精选 MCP 服务器推荐
                            </Text>
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              功能开发中，敬请期待...
                            </Text>
                          </Space>
                        }
                      />
                    </div>
                  )
                }
              ]}
            />
          </div>
        )
      },
      {
        key: 'skills',
        label: (
          <Space size={4}>
            <ThunderboltOutlined />
            <span style={{ fontSize: 12 }}>Skills</span>
            <Tag color="green" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
              {skills.length}
            </Tag>
          </Space>
        ),
        children: (
          <div style={{ padding: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Skills 为 Claude Code 提供专业领域知识
            </Text>

            {skills.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary" style={{ fontSize: 11 }}>暂无已安装的 Skills</Text>}
                style={{ margin: '12px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {skills.map(skill => (
                  <div
                    key={skill.name}
                    style={{
                      padding: '8px 10px',
                      border: `1px solid ${themeVars.border}`,
                      borderRadius: 6,
                      backgroundColor: themeVars.bgSection
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <Space size={6}>
                        <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                        <Text strong style={{ fontSize: 12 }}>
                          {skill.name}
                        </Text>
                        <Tag style={{ fontSize: 10, padding: '0 4px' }}>{skill.files.length} 文件</Tag>
                      </Space>
                      <Space size={4}>
                        <Tooltip title="复制路径">
                          <Button
                            type="text"
                            icon={<CopyOutlined />}
                            size="small"
                            onClick={() => copyToClipboard(skill.path)}
                          />
                        </Tooltip>
                        <Tooltip title="打开文件夹">
                          <Button
                            type="text"
                            icon={<FolderOpenOutlined />}
                            size="small"
                            onClick={() => window.electronAPI.openInFinder(skill.path)}
                          />
                        </Tooltip>
                      </Space>
                    </div>
                    {skill.description && (
                      <Text
                        type="secondary"
                        style={{ fontSize: 10, display: 'block', marginTop: 4 }}
                        ellipsis
                      >
                        {skill.description}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      },
      {
        key: 'plugins',
        label: (
          <Space size={4}>
            <AppstoreOutlined />
            <span style={{ fontSize: 12 }}>Plugins</span>
            <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
              {plugins.length}
            </Tag>
          </Space>
        ),
        children: (
          <div style={{ padding: '8px 0' }}>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
              Plugins 扩展 Claude Code 的功能
            </Text>

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
                      backgroundColor: themeVars.bgSection
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <Space size={6}>
                        <AppstoreOutlined style={{ color: '#722ed1', fontSize: 14 }} />
                        <Text strong style={{ fontSize: 12 }}>
                          {plugin.name}
                        </Text>
                        {plugin.version && (
                          <Tag style={{ fontSize: 10, padding: '0 4px' }}>v{plugin.version}</Tag>
                        )}
                        <Tag color={plugin.enabled ? 'success' : 'default'} style={{ fontSize: 10, padding: '0 4px' }}>
                          {plugin.enabled ? '已启用' : '已禁用'}
                        </Tag>
                      </Space>
                    </div>
                    {plugin.description && (
                      <Text
                        type="secondary"
                        style={{ fontSize: 10, display: 'block', marginTop: 4 }}
                        ellipsis
                      >
                        {plugin.description}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
    ]

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <Space size={4}>
            <Tooltip title="刷新">
              <Button type="text" icon={<ReloadOutlined />} size="small" onClick={loadData} />
            </Tooltip>
            <Tooltip title="打开配置目录">
              <Button
                type="text"
                icon={<FolderOpenOutlined />}
                size="small"
                onClick={() => window.electronAPI.showClaudeConfigInFolder()}
              />
            </Tooltip>
          </Space>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          items={tabItems}
          style={{ marginTop: -4 }}
        />

        {/* settings.json 编辑 Modal */}
        <ElectronModal
          title={
            <Space>
              <CodeOutlined />
              <span>编辑 Claude Code 配置</span>
            </Space>
          }
          open={editorVisible}
          onCancel={() => setEditorVisible(false)}
          width="70%"
          footer={[
            <Button
              key="folder"
              icon={<FolderOpenOutlined />}
              onClick={() => window.electronAPI.showClaudeConfigInFolder()}
            >
              打开文件位置
            </Button>,
            <Button key="reload" icon={<ReloadOutlined />} onClick={loadData}>
              重新加载
            </Button>,
            <Button key="cancel" onClick={() => setEditorVisible(false)}>
              取消
            </Button>,
            <Button
              key="save"
              type="primary"
              onClick={handleSaveConfig}
              loading={saving}
            >
              保存
            </Button>
          ]}
          style={{ top: 40 }}
          styles={{ body: { padding: 0 } as React.CSSProperties }}
        >
          <div style={{ height: 500, border: `1px solid ${themeVars.border}` }}>
            <Editor
              height="100%"
              defaultLanguage="json"
              value={editedConfig}
              onChange={value => setEditedConfig(value || '')}
              theme={darkMode ? 'vs-dark' : 'light'}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2
              }}
            />
          </div>
        </ElectronModal>

        {/* MCP 安装 Modal */}
        <MCPInstallModal
          visible={installModalVisible}
          server={serverToInstall}
          darkMode={darkMode}
          onCancel={() => {
            setInstallModalVisible(false)
            setServerToInstall(null)
          }}
          onInstall={handleInstall}
        />
      </>
    )
  }
)

ClaudeConfigManager.displayName = 'ClaudeConfigManager'

export default ClaudeConfigManager
