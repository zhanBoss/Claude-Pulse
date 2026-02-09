import { Modal, Spin, Alert, Typography, Divider, Tag, Space, Button, message, Tooltip, Collapse, Segmented, Empty } from 'antd'
import { useEffect, useState, useCallback, useMemo } from 'react'
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
  CodeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  NodeIndexOutlined
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
  const [viewMode, setViewMode] = useState<'conversation' | 'tool-flow'>('conversation')
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())

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

  /* 提取工具调用流程数据 */
  interface ToolFlowItem {
    id: string
    name: string
    input?: any
    output?: string | any
    isError: boolean
    callTimestamp: number
    resultTimestamp?: number
    durationMs?: number
    index: number
  }

  const toolFlow = useMemo((): ToolFlowItem[] => {
    if (!conversation) return []

    const items: ToolFlowItem[] = []
    /* tool_use id -> 部分构建的条目 */
    const pendingCalls = new Map<string, ToolFlowItem>()
    let idx = 0

    for (const msg of conversation.messages) {
      for (const content of msg.content) {
        if (content.type === 'tool_use' && content.id && content.name) {
          const item: ToolFlowItem = {
            id: content.id,
            name: content.name,
            input: content.input,
            isError: false,
            callTimestamp: msg.timestamp,
            index: idx++
          }
          pendingCalls.set(content.id, item)
          items.push(item)
        }

        if (content.type === 'tool_result' && content.tool_use_id) {
          const pending = pendingCalls.get(content.tool_use_id)
          if (pending) {
            pending.output = content.content
            pending.isError = content.is_error || false
            pending.resultTimestamp = msg.timestamp
            if (pending.callTimestamp && msg.timestamp) {
              pending.durationMs = msg.timestamp - pending.callTimestamp
            }
            pendingCalls.delete(content.tool_use_id)
          }
        }
      }
    }

    return items
  }, [conversation])

  /* 切换工具展开/折叠 */
  const toggleToolExpand = useCallback((id: string) => {
    setExpandedToolIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  /* 格式化耗时 */
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  /* 截断文本 */
  const truncateText = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen) + '...'
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

          {/* 视图模式切换 */}
          <div style={{ marginBottom: 12 }}>
            <Segmented
              value={viewMode}
              onChange={v => setViewMode(v as 'conversation' | 'tool-flow')}
              options={[
                { value: 'conversation', label: '对话视图', icon: <MessageOutlined /> },
                { value: 'tool-flow', label: `工具流程 (${toolFlow.length})`, icon: <NodeIndexOutlined /> }
              ]}
            />
          </div>

          <Divider style={{ margin: '8px 0 16px' }} />

          {/* 对话视图 */}
          {viewMode === 'conversation' && conversation.messages.map((msg, index) => (
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

          {/* 工具调用流程视图 */}
          {viewMode === 'tool-flow' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {toolFlow.length === 0 ? (
                <Empty description="此对话没有工具调用" style={{ padding: 40 }} />
              ) : (
                <>
                  {/* 流程统计 */}
                  <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <Tag icon={<ToolOutlined />} color="blue">共 {toolFlow.length} 次调用</Tag>
                    <Tag icon={<CheckCircleOutlined />} color="green">
                      成功 {toolFlow.filter(t => !t.isError).length}
                    </Tag>
                    {toolFlow.some(t => t.isError) && (
                      <Tag icon={<CloseCircleOutlined />} color="red">
                        失败 {toolFlow.filter(t => t.isError).length}
                      </Tag>
                    )}
                    {toolFlow.some(t => t.durationMs) && (
                      <Tag icon={<ClockCircleOutlined />}>
                        平均耗时 {formatDuration(
                          Math.round(
                            toolFlow.filter(t => t.durationMs).reduce((s, t) => s + (t.durationMs || 0), 0) /
                            toolFlow.filter(t => t.durationMs).length
                          )
                        )}
                      </Tag>
                    )}
                  </div>

                  {/* 工具调用时间线 */}
                  {toolFlow.map((tool, idx) => {
                    const isExpanded = expandedToolIds.has(tool.id)
                    const inputStr = tool.input ? JSON.stringify(tool.input, null, 2) : ''
                    const outputStr = tool.output
                      ? typeof tool.output === 'string'
                        ? tool.output
                        : JSON.stringify(tool.output, null, 2)
                      : ''

                    return (
                      <div
                        key={tool.id}
                        style={{
                          display: 'flex',
                          gap: 12,
                          position: 'relative'
                        }}
                      >
                        {/* 时间线连接线 */}
                        <div
                          style={{
                            width: 32,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            flexShrink: 0
                          }}
                        >
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: tool.isError ? '#ff4d4f' : '#52c41a',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 600,
                              zIndex: 2
                            }}
                          >
                            {idx + 1}
                          </div>
                          {idx < toolFlow.length - 1 && (
                            <div
                              style={{
                                width: 2,
                                flex: 1,
                                background: '#e0e0e0',
                                minHeight: 20
                              }}
                            />
                          )}
                        </div>

                        {/* 工具调用内容 */}
                        <div
                          style={{
                            flex: 1,
                            marginBottom: 12,
                            padding: '10px 14px',
                            borderRadius: 8,
                            border: `1px solid ${tool.isError ? '#ffccc7' : '#d9f7be'}`,
                            background: tool.isError ? '#fff2f0' : '#f6ffed',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => toggleToolExpand(tool.id)}
                        >
                          {/* 头部 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Tag
                              icon={<ToolOutlined />}
                              color={tool.isError ? 'error' : 'success'}
                              style={{ fontSize: 12, fontWeight: 600 }}
                            >
                              {tool.name}
                            </Tag>
                            {tool.isError ? (
                              <Tag icon={<CloseCircleOutlined />} color="red" style={{ fontSize: 11 }}>失败</Tag>
                            ) : (
                              <Tag icon={<CheckCircleOutlined />} color="green" style={{ fontSize: 11 }}>成功</Tag>
                            )}
                            {tool.durationMs !== undefined && tool.durationMs >= 0 && (
                              <Tag icon={<ClockCircleOutlined />} style={{ fontSize: 11 }}>
                                {formatDuration(tool.durationMs)}
                              </Tag>
                            )}
                            <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
                              {new Date(tool.callTimestamp).toLocaleTimeString('zh-CN')}
                            </Text>
                          </div>

                          {/* 简略预览 */}
                          {!isExpanded && inputStr && (
                            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                              输入: {truncateText(inputStr, 100)}
                            </Text>
                          )}

                          {/* 展开详情 */}
                          {isExpanded && (
                            <div style={{ marginTop: 8 }}>
                              {inputStr && (
                                <div style={{ marginBottom: 8 }}>
                                  <Text strong style={{ fontSize: 11 }}>输入:</Text>
                                  <pre
                                    style={{
                                      background: 'rgba(0,0,0,0.04)',
                                      padding: 8,
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontFamily: 'Fira Code, Consolas, monospace',
                                      maxHeight: 200,
                                      overflow: 'auto',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all',
                                      margin: '4px 0 0'
                                    }}
                                  >
                                    {inputStr}
                                  </pre>
                                </div>
                              )}
                              {outputStr && (
                                <div>
                                  <Text strong style={{ fontSize: 11 }}>输出:</Text>
                                  <pre
                                    style={{
                                      background: 'rgba(0,0,0,0.04)',
                                      padding: 8,
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontFamily: 'Fira Code, Consolas, monospace',
                                      maxHeight: 200,
                                      overflow: 'auto',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all',
                                      margin: '4px 0 0'
                                    }}
                                  >
                                    {truncateText(outputStr, 2000)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}
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
