import { Modal, Spin, Alert, Typography, Divider, Tag, Space, Button, message } from 'antd'
import { useEffect, useState } from 'react'
import { FullConversation, MessageContent } from '../types'
import { CopyOutlined, ToolOutlined, FileImageOutlined } from '@ant-design/icons'

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

          <Divider />

          {conversation.messages.map((msg, index) => (
            <div key={index} className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Tag color={msg.role === 'user' ? 'blue' : 'green'}>
                  {msg.role === 'user' ? '用户' : 'AI 助手'}
                </Tag>
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
    </Modal>
  )
}

export default ConversationDetailModal
