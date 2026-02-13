/**
 * MCP 安装配置弹窗
 * 用于从市场安装 MCP 服务器时的配置
 */

import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Alert, Typography, Space, Tag, Divider } from 'antd'
import { GithubOutlined, LinkOutlined } from '@ant-design/icons'
import { OnlineMCPServer, MCPInstallConfig } from '../types'
import { getThemeVars } from '../theme'

const { Text, Link } = Typography

interface MCPInstallModalProps {
  visible: boolean
  server: OnlineMCPServer | null
  darkMode: boolean
  onCancel: () => void
  onInstall: (name: string, config: MCPInstallConfig, target: 'claude' | 'cursor') => Promise<void>
}

const MCPInstallModal = (props: MCPInstallModalProps) => {
  const { visible, server, darkMode, onCancel, onInstall } = props
  const themeVars = getThemeVars(darkMode)

  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [installType, setInstallType] = useState<'command' | 'url'>('command')

  // 根据服务器信息生成默认配置
  useEffect(() => {
    if (server && visible) {
      // 生成默认服务器名称
      const defaultName = server.name.split('/').pop() || server.name

      // 判断安装类型
      if (server.remotes && server.remotes.length > 0) {
        setInstallType('url')
        form.setFieldsValue({
          name: defaultName,
          target: 'cursor',
          url: server.remotes[0].url,
          command: '',
          args: '',
          env: ''
        })
      } else if (server.packages && server.packages.length > 0) {
        setInstallType('command')
        const pkg = server.packages[0]

        // 根据包类型生成命令
        let command = ''
        let args = ''
        switch (pkg.registryType) {
          case 'npm':
            command = 'npx'
            args = `-y ${pkg.identifier}`
            break
          case 'pypi':
            command = 'uvx'
            args = pkg.identifier
            break
          case 'oci':
            command = 'docker'
            args = `run ${pkg.identifier}`
            break
        }

        // 生成环境变量模板
        let envTemplate = ''
        if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
          const envObj: Record<string, string> = {}
          pkg.environmentVariables.forEach(ev => {
            envObj[ev.name] = ev.isSecret ? '<YOUR_KEY>' : ''
          })
          envTemplate = JSON.stringify(envObj, null, 2)
        }

        form.setFieldsValue({
          name: defaultName,
          target: 'cursor',
          url: '',
          command,
          args,
          env: envTemplate
        })
      } else {
        setInstallType('command')
        form.setFieldsValue({
          name: defaultName,
          target: 'cursor',
          url: '',
          command: '',
          args: '',
          env: ''
        })
      }
    }
  }, [server, visible, form])

  // 提交安装
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const config: MCPInstallConfig = {}

      if (installType === 'url' && values.url) {
        config.url = values.url
      } else {
        if (values.command) config.command = values.command
        if (values.args) {
          config.args = values.args
            .split(/\s+/)
            .filter((arg: string) => arg.trim())
        }
        if (values.env && values.env.trim()) {
          try {
            config.env = JSON.parse(values.env)
          } catch {
            form.setFields([{ name: 'env', errors: ['环境变量 JSON 格式错误'] }])
            setSubmitting(false)
            return
          }
        }
      }

      await onInstall(values.name, config, values.target)
      form.resetFields()
    } catch (error) {
      // 表单验证失败
    } finally {
      setSubmitting(false)
    }
  }

  // 获取包类型标签
  const getPackageTypeLabel = () => {
    if (!server) return null
    if (server.remotes && server.remotes.length > 0) {
      return (
        <Tag color="purple" style={{ fontSize: 11 }}>
          远程服务
        </Tag>
      )
    }
    if (server.packages && server.packages.length > 0) {
      const pkg = server.packages[0]
      const typeMap: Record<string, { color: string; label: string }> = {
        npm: { color: 'red', label: 'NPM' },
        pypi: { color: 'blue', label: 'PyPI' },
        oci: { color: 'cyan', label: 'Docker' }
      }
      const info = typeMap[pkg.registryType] || { color: 'default', label: pkg.registryType }
      return (
        <Tag color={info.color} style={{ fontSize: 11 }}>
          {info.label}
        </Tag>
      )
    }
    return null
  }

  if (!server) return null

  return (
    <Modal
      title="安装 MCP 服务器"
      open={visible}
      onCancel={onCancel}
      onOk={handleSubmit}
      confirmLoading={submitting}
      width={520}
      okText="安装"
      cancelText="取消"
    >
      {/* 服务器信息 */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: themeVars.bgSection,
          borderRadius: 8,
          marginBottom: 16
        }}
      >
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Space>
            <Text strong style={{ fontSize: 14 }}>
              {server.title || server.name.split('/').pop()}
            </Text>
            {server.version && <Tag style={{ fontSize: 10 }}>v{server.version}</Tag>}
            {server.isOfficial && (
              <Tag color="gold" style={{ fontSize: 10 }}>
                Official
              </Tag>
            )}
            {getPackageTypeLabel()}
          </Space>

          {server.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {server.description}
            </Text>
          )}

          <Space size={12} style={{ marginTop: 4 }}>
            {server.repositoryUrl && (
              <Link
                style={{ fontSize: 11 }}
                onClick={() => window.electronAPI.openExternal(server.repositoryUrl!)}
              >
                <GithubOutlined /> 查看仓库
              </Link>
            )}
            {server.packages && server.packages.length > 0 && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <LinkOutlined /> {server.packages[0].identifier}
              </Text>
            )}
          </Space>
        </Space>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      {/* 安装配置表单 */}
      <Form form={form} layout="vertical">
        <Form.Item
          label="服务器名称"
          name="name"
          rules={[{ required: true, message: '请输入服务器名称' }]}
          extra="在配置文件中的标识名"
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

        {installType === 'url' ? (
          <Form.Item
            label="远程服务 URL"
            name="url"
            rules={[{ required: true, message: '请输入远程服务 URL' }]}
          >
            <Input placeholder="https://mcp.example.com/mcp" />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              label="启动命令"
              name="command"
              rules={[{ required: true, message: '请输入启动命令' }]}
            >
              <Input placeholder="npx / uvx / docker" />
            </Form.Item>

            <Form.Item
              label="命令参数"
              name="args"
              extra="参数以空格分隔"
            >
              <Input placeholder="-y @xxx/mcp-server" />
            </Form.Item>

            <Form.Item
              label="环境变量 (JSON)"
              name="env"
              extra="格式: {&quot;API_KEY&quot;: &quot;xxx&quot;}"
            >
              <Input.TextArea
                rows={3}
                placeholder='{"API_KEY": "your-key"}'
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Form.Item>
          </>
        )}
      </Form>

      {/* 提示信息 */}
      {server.packages &&
        server.packages.some(pkg => pkg.environmentVariables && pkg.environmentVariables.length > 0) && (
          <Alert
            message="此服务器需要配置环境变量"
            description={
              <ul style={{ margin: '4px 0', paddingLeft: 20, fontSize: 11 }}>
                {server.packages
                  .flatMap(pkg => pkg.environmentVariables || [])
                  .map((ev, idx) => (
                    <li key={idx}>
                      <Text code style={{ fontSize: 11 }}>
                        {ev.name}
                      </Text>
                      {ev.isSecret && (
                        <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>
                          Secret
                        </Tag>
                      )}
                      {ev.description && (
                        <Text type="secondary" style={{ marginLeft: 4, fontSize: 11 }}>
                          - {ev.description}
                        </Text>
                      )}
                    </li>
                  ))}
              </ul>
            }
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
          />
        )}
    </Modal>
  )
}

export default MCPInstallModal
