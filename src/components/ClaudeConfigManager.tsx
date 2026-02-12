/**
 * Claude Code 配置管理组件
 * 提供 MCP 服务器、Skills、Plugins、Hooks 的可视化管理
 */

import { useState, useEffect, forwardRef, useImperativeHandle, type ReactNode } from 'react'
import {
  Tabs,
  Space,
  Typography,
  Button,
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
  InfoCircleOutlined,
  EditOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  ShopOutlined,
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
import EcosystemCatalogList from './EcosystemCatalogList'
import {
  SKILL_CATALOG_ITEMS,
  PLUGIN_CATALOG_ITEMS,
  HOOK_CATALOG_ITEMS
} from '../constants/claudeEcosystem'

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
    const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null)

    // MCP Tab 子 Tab 状态
    const [mcpSubTab, setMcpSubTab] = useState('installed')
    const [skillsSubTab, setSkillsSubTab] = useState('installed')
    const [pluginsSubTab, setPluginsSubTab] = useState('installed')
    const [hooksSubTab, setHooksSubTab] = useState('installed')
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
          setLastRefreshAt(Date.now())

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

    const getLastRefreshText = () => {
      if (!lastRefreshAt) {
        return '未刷新'
      }
      return new Date(lastRefreshAt).toLocaleString('zh-CN', { hour12: false })
    }

    const renderSubTabLabel = (icon: ReactNode, text: string, count?: number) => (
      <Space size={4}>
        {icon}
        <span style={{ fontSize: 11 }}>{text}</span>
        {typeof count === 'number' && (
          <Tag style={{ fontSize: 9, padding: '0 3px', margin: 0 }}>{count}</Tag>
        )}
      </Space>
    )

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
                  key: 'discover',
                  label: renderSubTabLabel(<ShopOutlined style={{ fontSize: 12 }} />, '发现'),
                  children: (
                    <MCPMarketList
                      darkMode={darkMode}
                      installedServers={mcpServers}
                      onInstall={handleOpenInstallModal}
                    />
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
            <Tabs
              activeKey={skillsSubTab}
              onChange={setSkillsSubTab}
              size="small"
              items={[
                {
                  key: 'installed',
                  label: renderSubTabLabel(<ThunderboltOutlined style={{ fontSize: 12 }} />, '已安装', skills.length),
                  children: <SkillsManager darkMode={darkMode} onRefresh={loadData} />
                },
                {
                  key: 'resources',
                  label: renderSubTabLabel(<ShopOutlined style={{ fontSize: 12 }} />, '资源'),
                  children: (
                    <EcosystemCatalogList
                      darkMode={darkMode}
                      title="Skills 资源"
                      subtitle="聚合官方文档、开源示例与社区实践，自动按可用分类展示。"
                      emptyDescription="暂无可用 Skill 资源"
                      items={SKILL_CATALOG_ITEMS}
                    />
                  )
                }
              ]}
            />
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
            <Tabs
              activeKey={pluginsSubTab}
              onChange={setPluginsSubTab}
              size="small"
              items={[
                {
                  key: 'installed',
                  label: renderSubTabLabel(<AppstoreOutlined style={{ fontSize: 12 }} />, '已安装', plugins.length),
                  children: <PluginsManager darkMode={darkMode} onRefresh={loadData} />
                },
                {
                  key: 'resources',
                  label: renderSubTabLabel(<ShopOutlined style={{ fontSize: 12 }} />, '资源'),
                  children: (
                    <EcosystemCatalogList
                      darkMode={darkMode}
                      title="Plugins 资源"
                      subtitle="支持官方 marketplace 与第三方分发，按官方/推荐/社区自动聚合。"
                      emptyDescription="暂无可用 Plugin 资源"
                      items={PLUGIN_CATALOG_ITEMS}
                    />
                  )
                }
              ]}
            />
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
            <Tabs
              activeKey={hooksSubTab}
              onChange={setHooksSubTab}
              size="small"
              items={[
                {
                  key: 'installed',
                  label: renderSubTabLabel(<ApiOutlined style={{ fontSize: 12 }} />, '已安装', hooks.length),
                  children: <HooksManager darkMode={darkMode} onRefresh={loadData} />
                },
                {
                  key: 'resources',
                  label: renderSubTabLabel(<ShopOutlined style={{ fontSize: 12 }} />, '资源'),
                  children: (
                    <EcosystemCatalogList
                      darkMode={darkMode}
                      title="Hooks 资源"
                      subtitle="以官方规范和模板实践为主，按可用分类动态展示。"
                      emptyDescription="暂无可用 Hook 资源"
                      items={HOOK_CATALOG_ITEMS}
                    />
                  )
                }
              ]}
            />
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

        <div
          style={{
            marginBottom: 8,
            padding: '6px 10px',
            border: `1px solid ${themeVars.border}`,
            borderRadius: 6,
            backgroundColor: themeVars.bgSection
          }}
        >
          <Space size={8} wrap>
            <InfoCircleOutlined style={{ color: themeVars.primary, fontSize: 12 }} />
            <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 5px' }}>
              数据来源
            </Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>
              MCP 数据来自官方 Registry，资源数据来自官方文档与社区仓库
            </Text>
            <Tag style={{ margin: 0, fontSize: 10, padding: '0 5px' }}>最近刷新: {getLastRefreshText()}</Tag>
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
