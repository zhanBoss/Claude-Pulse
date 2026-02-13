/**
 * MCP 服务器卡片组件
 * 用于展示已安装或在线市场的 MCP 服务器信息
 */

import { Space, Typography, Tag, Button, Tooltip, Popconfirm } from 'antd'
import {
  CloudServerOutlined,
  EditOutlined,
  DeleteOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  GithubOutlined,
  LinkOutlined
} from '@ant-design/icons'
import { MCPServer, OnlineMCPServer } from '../types'
import { getThemeVars } from '../theme'

const { Text } = Typography

interface MCPServerCardProps {
  // 已安装的服务器信息
  installedServer?: MCPServer
  // 在线市场的服务器信息
  onlineServer?: OnlineMCPServer
  // 是否已安装（用于市场列表）
  isInstalled?: boolean
  // 主题模式
  darkMode: boolean
  // 编辑回调
  onEdit?: (server: MCPServer) => void
  // 删除回调
  onDelete?: (name: string, source: 'claude' | 'cursor') => void
  // 安装回调
  onInstall?: (server: OnlineMCPServer) => void
}

const MCPServerCard = (props: MCPServerCardProps) => {
  const { installedServer, onlineServer, isInstalled, darkMode, onEdit, onDelete, onInstall } =
    props
  const themeVars = getThemeVars(darkMode)

  // 已安装服务器卡片
  if (installedServer) {
    const { name, command, args, url, source } = installedServer

    // 生成命令显示
    const commandDisplay = url
      ? `URL: ${url}`
      : `${command} ${(args || []).join(' ')}`.trim()

    return (
      <div
        style={{
          padding: '10px 12px',
          border: `1px solid ${themeVars.border}`,
          borderRadius: 6,
          backgroundColor: themeVars.bgSection,
          marginBottom: 6
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
            <CloudServerOutlined style={{ color: themeVars.primary, fontSize: 14 }} />
            <Text strong style={{ fontSize: 12 }}>
              {name}
            </Text>
            <Tag
              color={source === 'cursor' ? 'cyan' : 'orange'}
              style={{ fontSize: 10, padding: '0 4px', margin: 0 }}
            >
              {source === 'cursor' ? 'Cursor' : 'Claude'}
            </Tag>
          </Space>
          <Space size={4}>
            {onEdit && (
              <Tooltip title="编辑">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => onEdit(installedServer)}
                />
              </Tooltip>
            )}
            {onDelete && (
              <Popconfirm
                title="确定删除此 MCP 服务器？"
                onConfirm={() => onDelete(name, source)}
                okText="删除"
                cancelText="取消"
              >
                <Tooltip title="删除">
                  <Button type="text" icon={<DeleteOutlined />} size="small" danger />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        </div>
        <div style={{ marginTop: 4 }}>
          <Text
            code
            style={{
              fontSize: 10,
              backgroundColor: themeVars.codeBg,
              padding: '2px 6px',
              borderRadius: 3,
              wordBreak: 'break-all'
            }}
          >
            {commandDisplay.length > 80 ? commandDisplay.substring(0, 80) + '...' : commandDisplay}
          </Text>
        </div>
      </div>
    )
  }

  // 在线市场服务器卡片
  if (onlineServer) {
    const { name, title, description, version, repositoryUrl, packages, remotes, isOfficial } =
      onlineServer

    // 获取包类型标签
    const getPackageLabel = () => {
      if (packages && packages.length > 0) {
        const pkg = packages[0]
        const typeMap: Record<string, string> = {
          npm: 'npm',
          pypi: 'PyPI',
          oci: 'Docker'
        }
        return typeMap[pkg.registryType] || pkg.registryType
      }
      if (remotes && remotes.length > 0) {
        return 'Remote'
      }
      return null
    }

    const packageLabel = getPackageLabel()

    return (
      <div
        style={{
          padding: '10px 12px',
          border: `1px solid ${themeVars.border}`,
          borderRadius: 6,
          backgroundColor: themeVars.bgSection,
          marginBottom: 6
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start'
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={6} wrap>
              <CloudServerOutlined style={{ color: themeVars.primary, fontSize: 14 }} />
              <Text strong style={{ fontSize: 12 }}>
                {title || name.split('/').pop()}
              </Text>
              {version && (
                <Tag style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>v{version}</Tag>
              )}
              {isOfficial && (
                <Tag color="gold" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                  Official
                </Tag>
              )}
              {packageLabel && (
                <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                  {packageLabel}
                </Tag>
              )}
            </Space>

            {description && (
              <Text
                type="secondary"
                style={{
                  fontSize: 11,
                  display: 'block',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {description}
              </Text>
            )}

            <Space size={8} style={{ marginTop: 6 }}>
              {repositoryUrl && (
                <Tooltip title="查看仓库">
                  <Button
                    type="link"
                    icon={<GithubOutlined />}
                    size="small"
                    style={{ padding: 0, height: 'auto', fontSize: 11 }}
                    onClick={() => window.electronAPI.openExternal(repositoryUrl)}
                  >
                    GitHub
                  </Button>
                </Tooltip>
              )}
              {packages && packages.length > 0 && (
                <Text type="secondary" style={{ fontSize: 10 }}>
                  <LinkOutlined /> {packages[0].identifier}
                </Text>
              )}
            </Space>
          </div>

          <div style={{ marginLeft: 12, flexShrink: 0 }}>
            {isInstalled ? (
              <Tag
                icon={<CheckCircleOutlined />}
                color="success"
                style={{ fontSize: 11, margin: 0 }}
              >
                已安装
              </Tag>
            ) : (
              onInstall && (
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  size="small"
                  style={{ fontSize: 11 }}
                  onClick={() => onInstall(onlineServer)}
                >
                  安装
                </Button>
              )
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default MCPServerCard
