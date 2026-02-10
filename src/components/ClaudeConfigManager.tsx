/**
 * Claude Code 配置管理组件
 * 提供 MCP 服务器、Skills、Plugins、Hooks 的可视化管理
 */

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import {
  Tabs,
  Space,
  Typography,
  Button,
  Tag,
  Spin,
  message,
  Tooltip,
  Empty
} from 'antd'
import {
  CloudServerOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  CodeOutlined,
  EditOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  ShopOutlined,
  StarOutlined,
  ApiOutlined,
  ExportOutlined,
  ImportOutlined
} from '@ant-design/icons'
import { getThemeVars } from '../theme'
import { MCPServer, ClaudeSkill, ClaudePlugin, OnlineMCPServer, MCPInstallConfig, ClaudeHook } from '../types'
import ElectronModal from './ElectronModal'
import Editor from '@monaco-editor/react'
import MCPInstalledList from './MCPInstalledList'
import MCPMarketList from './MCPMarketList'
import MCPInstallModal from './MCPInstallModal'
import SkillsManager from './SkillsManager'
import PluginsManager from './PluginsManager'
import HooksManager from './HooksManager'

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
    const [hooks, setHooks] = useState<ClaudeHook[]>([])

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
        const result = await window.electronAPI.getClaudeCodeFullConfig()
        if (result.success && result.config) {
          setMcpServers(result.config.mcpServers || [])
          setSkills(result.config.skills || [])
          setPlugins(result.config.plugins || [])
          setHooks(result.config.hooks || [])

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

    useImperativeHandle(ref, () => ({
      refresh: loadData
    }))

    // 保存 settings.json
    const handleSaveConfig = async () => {
      setSaving(true)
      try {
        JSON.parse(editedConfig)
        const result = await window.electronAPI.saveClaudeConfig(editedConfig)
        if (result.success) {
          setConfig(editedConfig)
          message.success('保存成功')
          setEditorVisible(false)
          loadData()
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

    const handleOpenInstallModal = (server: OnlineMCPServer) => {
      setServerToInstall(server)
      setInstallModalVisible(true)
    }

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

    const handleExport = async () => {
      try {
        const result = await window.electronAPI.exportClaudeConfig()
        if (result.success) {
          message.success(`配置已导出至: ${result.filePath}`)
        } else if (result.error !== '用户取消') {
          message.error(result.error || '导出失败')
        }
      } catch {
        message.error('导出失败')
      }
    }

    const handleImport = () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        try {
          const result = await window.electronAPI.importClaudeConfig(file.path)
          if (result.success) {
            message.success('配置导入成功')
            loadData()
          } else {
            message.error(result.error || '导入失败')
          }
        } catch {
          message.error('导入失败')
        }
      }
      input.click()
    }

    const getConfigSummary = () => {
      try {
        const obj = JSON.parse(config)
        return `${Object.keys(obj).length} 项配置`
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
              onMouseEnter={e => { e.currentTarget.style.borderColor = themeVars.primary }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = themeVars.border }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Space size={6}>
                  <CodeOutlined style={{ fontSize: 14, color: themeVars.primary }} />
                  <Text strong style={{ fontSize: 12 }}>settings.json</Text>
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
            <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{mcpServers.length}</Tag>
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
                      <Tag style={{ fontSize: 9, padding: '0 3px', margin: 0 }}>{mcpServers.length}</Tag>
                    </Space>
                  ),
                  children: <MCPInstalledList darkMode={darkMode} onRefresh={refreshMcpServers} />
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
                            <Text type="secondary" style={{ fontSize: 11 }}>精选 MCP 服务器推荐</Text>
                            <Text type="secondary" style={{ fontSize: 10 }}>功能开发中，敬请期待...</Text>
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
            <Tag color="green" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{skills.length}</Tag>
          </Space>
        ),
        children: (
          <div style={{ padding: '8px 0' }}>
            <SkillsManager darkMode={darkMode} onRefresh={loadData} />
          </div>
        )
      },
      {
        key: 'plugins',
        label: (
          <Space size={4}>
            <AppstoreOutlined />
            <span style={{ fontSize: 12 }}>Plugins</span>
            <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{plugins.length}</Tag>
          </Space>
        ),
        children: (
          <div style={{ padding: '8px 0' }}>
            <PluginsManager darkMode={darkMode} onRefresh={loadData} />
          </div>
        )
      },
      {
        key: 'hooks',
        label: (
          <Space size={4}>
            <ApiOutlined />
            <span style={{ fontSize: 12 }}>Hooks</span>
            <Tag color="volcano" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{hooks.length}</Tag>
          </Space>
        ),
        children: (
          <div style={{ padding: '8px 0' }}>
            <HooksManager darkMode={darkMode} onRefresh={loadData} />
          </div>
        )
      }
    ]

    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <Space size={4}>
            <Tooltip title="导出配置">
              <Button type="text" icon={<ExportOutlined />} size="small" onClick={handleExport} />
            </Tooltip>
            <Tooltip title="导入配置">
              <Button type="text" icon={<ImportOutlined />} size="small" onClick={handleImport} />
            </Tooltip>
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
          title={<Space><CodeOutlined /><span>编辑 Claude Code 配置</span></Space>}
          open={editorVisible}
          onCancel={() => setEditorVisible(false)}
          width="70%"
          footer={[
            <Button key="folder" icon={<FolderOpenOutlined />} onClick={() => window.electronAPI.showClaudeConfigInFolder()}>
              打开文件位置
            </Button>,
            <Button key="reload" icon={<ReloadOutlined />} onClick={loadData}>重新加载</Button>,
            <Button key="cancel" onClick={() => setEditorVisible(false)}>取消</Button>,
            <Button key="save" type="primary" onClick={handleSaveConfig} loading={saving}>保存</Button>
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

        <MCPInstallModal
          visible={installModalVisible}
          server={serverToInstall}
          darkMode={darkMode}
          onCancel={() => { setInstallModalVisible(false); setServerToInstall(null) }}
          onInstall={handleInstall}
        />
      </>
    )
  }
)

ClaudeConfigManager.displayName = 'ClaudeConfigManager'

export default ClaudeConfigManager
