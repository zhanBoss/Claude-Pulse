/**
 * MCP 已安装列表组件
 * 展示本地已安装的 MCP 服务器（Claude Code + Cursor IDE）
 */

import { useEffect, useState } from 'react'
import { Spin, Empty, message, Modal, Form, Input, Select, Space, Button, Alert } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { MCPServer, MCPInstallConfig } from '../types'
import { getThemeVars } from '../theme'
import MCPServerCard from './MCPServerCard'

interface MCPInstalledListProps {
  darkMode: boolean
  onRefresh?: () => void
}

const MCPInstalledList = (props: MCPInstalledListProps) => {
  const { darkMode, onRefresh } = props
  const themeVars = getThemeVars(darkMode)

  const [servers, setServers] = useState<MCPServer[]>([])
  const [loading, setLoading] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [editForm] = Form.useForm()
  const [addForm] = Form.useForm()

  // 加载已安装的 MCP 服务器
  const loadServers = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getMCPServers()
      if (result.success && result.servers) {
        setServers(result.servers)
      } else {
        message.error(result.error || '加载 MCP 服务器失败')
      }
    } catch (error) {
      message.error('加载 MCP 服务器失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadServers()
  }, [])

  // 刷新列表
  const handleRefresh = () => {
    loadServers()
    onRefresh?.()
  }

  // 编辑服务器
  const handleEdit = (server: MCPServer) => {
    setEditingServer(server)
    editForm.setFieldsValue({
      command: server.command,
      args: server.args?.join(' ') || '',
      env: server.env ? JSON.stringify(server.env, null, 2) : '',
      url: server.url || ''
    })
    setEditModalVisible(true)
  }

  // 删除服务器
  const handleDelete = async (name: string, source: 'claude' | 'cursor') => {
    try {
      const result = await window.electronAPI.uninstallMCPServer(name, source)
      if (result.success) {
        message.success('删除成功')
        loadServers()
      } else {
        message.error(result.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  // 提交编辑
  const handleEditSubmit = async () => {
    if (!editingServer) return

    try {
      const values = await editForm.validateFields()
      setSubmitting(true)

      const config: MCPInstallConfig = {}

      if (values.url) {
        config.url = values.url
      } else {
        if (values.command) config.command = values.command
        if (values.args) {
          config.args = values.args
            .split(/\s+/)
            .filter((arg: string) => arg.trim())
        }
        if (values.env) {
          try {
            config.env = JSON.parse(values.env)
          } catch {
            message.error('环境变量 JSON 格式错误')
            return
          }
        }
      }

      const result = await window.electronAPI.updateMCPServer(
        editingServer.name,
        config,
        editingServer.source
      )

      if (result.success) {
        message.success('更新成功')
        setEditModalVisible(false)
        editForm.resetFields()
        setEditingServer(null)
        loadServers()
      } else {
        message.error(result.error || '更新失败')
      }
    } catch (error) {
      // 表单验证失败
    } finally {
      setSubmitting(false)
    }
  }

  // 添加新服务器
  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields()
      setSubmitting(true)

      const config: MCPInstallConfig = {}

      if (values.url) {
        config.url = values.url
      } else {
        if (values.command) config.command = values.command
        if (values.args) {
          config.args = values.args
            .split(/\s+/)
            .filter((arg: string) => arg.trim())
        }
        if (values.env) {
          try {
            config.env = JSON.parse(values.env)
          } catch {
            message.error('环境变量 JSON 格式错误')
            return
          }
        }
      }

      const result = await window.electronAPI.installMCPServer(values.name, config, values.target)

      if (result.success) {
        message.success('添加成功')
        setAddModalVisible(false)
        addForm.resetFields()
        loadServers()
      } else {
        message.error(result.error || '添加失败')
      }
    } catch (error) {
      // 表单验证失败
    } finally {
      setSubmitting(false)
    }
  }

  // 按来源分组
  const claudeServers = servers.filter(s => s.source === 'claude')
  const cursorServers = servers.filter(s => s.source === 'cursor')

  return (
    <div>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12
        }}
      >
        <span style={{ fontSize: 13, color: themeVars.textSecondary }}>
          共 {servers.length} 个服务器
        </span>
        <Space size={8}>
          <Button icon={<ReloadOutlined />} size="small" onClick={handleRefresh}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={() => setAddModalVisible(true)}
          >
            添加
          </Button>
        </Space>
      </div>

      {/* 服务器列表 */}
      <Spin spinning={loading}>
        {servers.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无已安装的 MCP 服务器"
            style={{ padding: '40px 0' }}
          />
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {/* Claude Code 服务器 */}
            {claudeServers.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: themeVars.textSecondary,
                    marginBottom: 6,
                    fontWeight: 500
                  }}
                >
                  Claude Code ({claudeServers.length})
                </div>
                {claudeServers.map(server => (
                  <MCPServerCard
                    key={`claude-${server.name}`}
                    installedServer={server}
                    darkMode={darkMode}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}

            {/* Cursor IDE 服务器 */}
            {cursorServers.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: themeVars.textSecondary,
                    marginBottom: 6,
                    fontWeight: 500
                  }}
                >
                  Cursor IDE ({cursorServers.length})
                </div>
                {cursorServers.map(server => (
                  <MCPServerCard
                    key={`cursor-${server.name}`}
                    installedServer={server}
                    darkMode={darkMode}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Spin>

      {/* 编辑弹窗 */}
      <Modal
        title={`编辑 MCP 服务器: ${editingServer?.name}`}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          editForm.resetFields()
          setEditingServer(null)
        }}
        onOk={handleEditSubmit}
        confirmLoading={submitting}
        width={500}
      >
        <Alert
          message={`目标配置: ${editingServer?.source === 'cursor' ? 'Cursor IDE (~/.cursor/mcp.json)' : 'Claude Code (~/.claude/settings.json)'}`}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form form={editForm} layout="vertical">
          <Form.Item label="URL (远程服务)" name="url">
            <Input placeholder="https://mcp.example.com/mcp（填写则忽略命令行配置）" />
          </Form.Item>
          <Form.Item label="命令" name="command">
            <Input placeholder="npx / uvx / docker run" />
          </Form.Item>
          <Form.Item label="参数" name="args">
            <Input placeholder="参数以空格分隔，如: -y @xxx/mcp-server" />
          </Form.Item>
          <Form.Item
            label="环境变量 (JSON)"
            name="env"
            help="格式: {&quot;API_KEY&quot;: &quot;xxx&quot;}"
          >
            <Input.TextArea rows={3} placeholder='{"API_KEY": "your-key"}' />
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加弹窗 */}
      <Modal
        title="添加 MCP 服务器"
        open={addModalVisible}
        onCancel={() => {
          setAddModalVisible(false)
          addForm.resetFields()
        }}
        onOk={handleAddSubmit}
        confirmLoading={submitting}
        width={500}
      >
        <Form form={addForm} layout="vertical" initialValues={{ target: 'cursor' }}>
          <Form.Item
            label="服务器名称"
            name="name"
            rules={[{ required: true, message: '请输入服务器名称' }]}
          >
            <Input placeholder="my-mcp-server" />
          </Form.Item>
          <Form.Item
            label="安装目标"
            name="target"
            rules={[{ required: true, message: '请选择安装目标' }]}
          >
            <Select>
              <Select.Option value="cursor">Cursor IDE (~/.cursor/mcp.json)</Select.Option>
              <Select.Option value="claude">Claude Code (~/.claude/settings.json)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="URL (远程服务)" name="url">
            <Input placeholder="https://mcp.example.com/mcp（填写则忽略命令行配置）" />
          </Form.Item>
          <Form.Item label="命令" name="command">
            <Input placeholder="npx / uvx / docker run" />
          </Form.Item>
          <Form.Item label="参数" name="args">
            <Input placeholder="参数以空格分隔，如: -y @xxx/mcp-server" />
          </Form.Item>
          <Form.Item
            label="环境变量 (JSON)"
            name="env"
            help="格式: {&quot;API_KEY&quot;: &quot;xxx&quot;}"
          >
            <Input.TextArea rows={3} placeholder='{"API_KEY": "your-key"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MCPInstalledList
