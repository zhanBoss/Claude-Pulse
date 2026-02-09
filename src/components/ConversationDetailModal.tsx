import { Modal, Spin, Alert, Typography, Divider, Tag, Space, Button, message, Tooltip, Collapse } from 'antd'
import { useEffect, useState, useCallback } from 'react'
import { FullConversation, MessageContent, MessageSubType } from '../types'
import {
  CopyOutlined,
  ToolOutlined,
  FileImageOutlined,
  TagOutlined,
  FileOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FolderOutlined,
  CodeOutlined
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

interface ConversationDetailModalProps {
  visible: boolean
  sessionId: string
  project: string
  onClose: () => void
}

const ConversationDetailModal = ({
  visible,
  sessionId,
  project,
  onClose
}: ConversationDetailModalProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<FullConversation | null>(null)
  const [filePreviewVisible, setFilePreviewVisible] = useState(false)
  const [filePreviewContent, setFilePreviewContent] = useState('')
  const [filePreviewPath, setFilePreviewPath] = useState('')
  const [filePreviewLoading, setFilePreviewLoading] = useState(false)

  useEffect(() => {
    if (visible && sessionId && project) {
      loadConversation()
    }
  }, [visible, sessionId, project])

  const loadConversation = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.readFullConversation(sessionId, project)
      if (result.success && result.conversation) {
        setConversation(result.conversation)
      } else {
        setError(result.error || '加载失败')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const copyText = async (text: string) => {
    const result = await window.electronAPI.copyToClipboard(text)
    if (result.success) {
      message.success('已复制到剪贴板')
    } else {
      message.error('复制失败')
    }
  }

  /* 查看文件快照内容 */
  const handleViewFileSnapshot = useCallback(async (messageId: string, filePath: string) => {
    setFilePreviewPath(filePath)
    setFilePreviewLoading(true)
    setFilePreviewVisible(true)
    try {
      const result = await window.electronAPI.readFileSnapshotContent(sessionId, messageId, filePath)
      if (result.success && result.content) {
        setFilePreviewContent(result.content)
      } else {
        setFilePreviewContent('// 无法加载文件内容')
      }
    } catch {
      setFilePreviewContent('// 加载失败')
    } finally {
      setFilePreviewLoading(false)
    }
  }, [sessionId])

  // 渲染消息子类型标签
  const renderSubTypeTag = (subType?: MessageSubType) => {
    if (!subType || subType === 'user' || subType === 'assistant') return null

    const subTypeConfig: Record<string, { color: string; label: string }> = {
      system: { color: 'orange', label: '系统消息' },
      summary: { color: 'cyan', label: '上下文摘要' },
      hook: { color: 'magenta', label: 'Hook' },
      'microcompaction-boundary': { color: 'geekblue', label: '压缩边界' },
      'queue-operation': { color: 'lime', label: '队列操作' }
    }

    const config = subTypeConfig[subType] || { color: 'default', label: subType }

    return (
      <Tag icon={<TagOutlined />} color={config.color} style={{ fontSize: 11 }}>
        {config.label}
      </Tag>
    )
  }

  const renderContent = (content: MessageContent[]) => {
    return content.map((item, index) => {
      if (item.type === 'text' && item.text) {
        return (
          <div key={index} className="mb-2">
            <Paragraph
              className="whitespace-pre-wrap font-mono text-sm"
              copyable={{
                text: item.text,
                onCopy: () => message.success('已复制')
              }}
            >
              {item.text}
            </Paragraph>
          </div>
        )
      }

      if (item.type === 'image') {
        return (
          <div key={index} className="mb-2">
            <Tag icon={<FileImageOutlined />} color="blue">
              图片 #{index + 1}
            </Tag>
          </div>
        )
      }

      if (item.type === 'tool_use') {
        return (
          <div key={index} className="mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
            <Space>
              <Tag icon={<ToolOutlined />} color="processing">
                工具调用
              </Tag>
              <Text strong>{item.name}</Text>
            </Space>
            {item.input && (
              <Paragraph
                className="mt-2 text-xs font-mono"
                copyable={{
                  text: JSON.stringify(item.input, null, 2),
                  onCopy: () => message.success('已复制')
                }}
              >
                <pre className="whitespace-pre-wrap">{JSON.stringify(item.input, null, 2)}</pre>
              </Paragraph>
            )}
          </div>
        )
      }

      if (item.type === 'tool_result') {
        return (
          <div key={index} className="mb-2 p-3 bg-green-50 dark:bg-green-900/20 rounded">
            <Tag icon={<ToolOutlined />} color="success">
              工具结果
            </Tag>
            {item.content && (
              <Paragraph className="mt-2 text-xs font-mono">
                <pre className="whitespace-pre-wrap">
                  {typeof item.content === 'string'
                    ? item.content
                    : JSON.stringify(item.content, null, 2)}
                </pre>
              </Paragraph>
            )}
          </div>
        )
      }

      return null
    })
  }

  const extractAllText = () => {
    if (!conversation) return ''

    let text = ''
    conversation.messages.forEach(msg => {
      text += `\n========== ${msg.role === 'user' ? '用户' : 'AI 助手'} ==========\n\n`
      msg.content.forEach(item => {
        if (item.type === 'text' && item.text) {
          text += item.text + '\n'
        } else if (item.type === 'tool_use') {
          text += `[工具调用: ${item.name}]\n`
          if (item.input) {
            text += JSON.stringify(item.input, null, 2) + '\n'
          }
        } else if (item.type === 'tool_result') {
          text += `[工具结果]\n`
          if (item.content) {
            text +=
              (typeof item.content === 'string'
                ? item.content
                : JSON.stringify(item.content, null, 2)) + '\n'
          }
        }
      })
    })

    return text
  }

  return (
    <Modal
      title="完整对话详情"
      open={visible}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="copy-all" icon={<CopyOutlined />} onClick={() => copyText(extractAllText())}>
          复制全部
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>
      ]}
    >
      {loading && (
        <div className="text-center py-8">
          <Spin size="large" tip="加载中..." />
        </div>
      )}

      {error && <Alert message="加载失败" description={error} type="error" showIcon closable />}

      {!loading && !error && conversation && (
        <div className="max-h-[600px] overflow-y-auto">
          <div className="mb-4">
            <Text type="secondary">会话 ID: {conversation.sessionId}</Text>
            <br />
            <Text type="secondary">项目: {conversation.project}</Text>
            <br />
            <Text type="secondary">消息数: {conversation.messages.length}</Text>
            {conversation.total_tokens && (
              <>
                <br />
                <Text type="secondary">总 Token: {conversation.total_tokens.toLocaleString()}</Text>
              </>
            )}
            {conversation.total_cost_usd && (
              <>
                <br />
                <Text type="secondary">总成本: ${conversation.total_cost_usd.toFixed(4)} USD</Text>
              </>
            )}
            {conversation.has_tool_use && (
              <>
                <br />
                <Tag icon={<ToolOutlined />} color="purple">
                  包含工具调用 {conversation.tool_use_count && `(${conversation.tool_use_count}次)`}
                </Tag>
                {conversation.tool_usage && Object.keys(conversation.tool_usage).length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>工具使用频率：</Text>
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(conversation.tool_usage)
                        .sort(([, a], [, b]) => b - a)
                        .map(([tool, count]) => (
                          <Tag key={tool} style={{ fontSize: 11 }}>
                            {tool}: {count}次
                          </Tag>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 文件编辑快照 */}
          {conversation.fileEdits && conversation.fileEdits.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Collapse
                size="small"
                defaultActiveKey={['file-edits']}
                items={[{
                  key: 'file-edits',
                  label: (
                    <Space>
                      <FileOutlined />
                      <Text style={{ fontSize: 13 }}>
                        文件修改记录
                      </Text>
                      <Tag color="blue" style={{ fontSize: 11 }}>
                        {conversation.fileEdits.reduce((s, e) => s + e.files.length, 0)} 个文件
                      </Tag>
                      <Tag style={{ fontSize: 11 }}>
                        {conversation.fileEdits.length} 次快照
                      </Tag>
                    </Space>
                  ),
                  children: (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        maxHeight: 300,
                        overflowY: 'auto'
                      }}
                    >
                      {conversation.fileEdits.map((edit, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 6,
                            background: 'rgba(0,0,0,0.02)',
                            border: '1px solid rgba(0,0,0,0.06)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <ClockCircleOutlined style={{ fontSize: 12, color: '#999' }} />
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {edit.timestamp
                                ? new Date(edit.timestamp).toLocaleString('zh-CN')
                                : '未知时间'}
                            </Text>
                            <Tag style={{ fontSize: 10 }}>{edit.files.length} 个文件</Tag>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {edit.files.map((file, fIdx) => {
                              const fileName = file.split('/').pop() || file
                              const dirPath = file.split('/').slice(0, -1).join('/') || '/'
                              return (
                                <div
                                  key={fIdx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                  }}
                                  className="hover:bg-gray-100 dark:hover:bg-gray-800"
                                  onClick={() => handleViewFileSnapshot(edit.messageId, file)}
                                >
                                  <CodeOutlined style={{ fontSize: 12, color: '#1890ff', flexShrink: 0 }} />
                                  <Text strong style={{ fontSize: 12 }}>{fileName}</Text>
                                  <Tooltip title={file}>
                                    <Text type="secondary" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      <FolderOutlined style={{ marginRight: 2 }} />
                                      {dirPath}
                                    </Text>
                                  </Tooltip>
                                  <EyeOutlined style={{ fontSize: 11, color: '#1890ff', marginLeft: 'auto', flexShrink: 0 }} />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                }]}
              />
            </div>
          )}

          <Divider />

          {conversation.messages.map((msg, index) => (
            <div key={index} className="mb-6">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Tag color={msg.role === 'user' ? 'blue' : 'green'}>
                  {msg.role === 'user' ? '用户' : 'AI 助手'}
                </Tag>
                {renderSubTypeTag(msg.subType)}
                <Text type="secondary" className="text-xs">
                  {new Date(msg.timestamp).toLocaleString('zh-CN')}
                </Text>
                {msg.usage && (
                  <>
                    <Tag color="blue" className="text-xs">
                      输入: {msg.usage.input_tokens.toLocaleString()}
                    </Tag>
                    <Tag color="green" className="text-xs">
                      输出: {msg.usage.output_tokens.toLocaleString()}
                    </Tag>
                    {msg.usage.cache_read_input_tokens && msg.usage.cache_read_input_tokens > 0 && (
                      <Tag color="cyan" className="text-xs">
                        缓存读取: {msg.usage.cache_read_input_tokens.toLocaleString()}
                      </Tag>
                    )}
                    {msg.cost_usd && msg.cost_usd > 0 && (
                      <Tag color="gold" className="text-xs">
                        ${msg.cost_usd.toFixed(4)}
                      </Tag>
                    )}
                  </>
                )}
                {msg.model && (
                  <Text type="secondary" className="text-xs">
                    {msg.model}
                  </Text>
                )}
              </div>

              <div className="pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                {renderContent(msg.content)}
              </div>

              {index < conversation.messages.length - 1 && <Divider />}
            </div>
          ))}
        </div>
      )}
      {/* 文件快照预览弹窗 */}
      <Modal
        title={
          <Space>
            <CodeOutlined />
            <span>文件快照</span>
            <Text type="secondary" style={{ fontSize: 12 }}>{filePreviewPath.split('/').pop()}</Text>
          </Space>
        }
        open={filePreviewVisible}
        onCancel={() => {
          setFilePreviewVisible(false)
          setFilePreviewContent('')
          setFilePreviewPath('')
        }}
        width="65%"
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={() => copyText(filePreviewContent)}
          >
            复制内容
          </Button>,
          <Button
            key="close"
            type="primary"
            onClick={() => {
              setFilePreviewVisible(false)
              setFilePreviewContent('')
              setFilePreviewPath('')
            }}
          >
            关闭
          </Button>
        ]}
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <FolderOutlined style={{ marginRight: 4 }} />
            {filePreviewPath}
          </Text>
        </div>
        {filePreviewLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : (
          <pre
            style={{
              background: '#f6f8fa',
              padding: 16,
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'Fira Code, Consolas, Monaco, monospace',
              lineHeight: 1.6,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 500,
              border: '1px solid #e8e8e8'
            }}
          >
            {filePreviewContent || '// 文件内容为空'}
          </pre>
        )}
      </Modal>
    </Modal>
  )
}

export default ConversationDetailModal
