import { Modal, Spin, Alert, Typography, Divider, Tag, Space, Button, message, Tooltip, Collapse, Segmented, Empty } from 'antd'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { FullConversation, FullMessage, MessageContent, MessageSubType } from '../types'
import {
  CopyOutlined,
  ToolOutlined,
  FileImageOutlined,
  TagOutlined,
  FileOutlined,
  ClockCircleOutlined,
  FolderOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  LeftOutlined,
  RightOutlined,
  UnorderedListOutlined
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

interface ConversationDetailModalProps {
  visible: boolean
  sessionId: string
  project: string
  onClose: () => void
}

/**
 * 一轮对话 = 用户 Prompt + AI 回复（可能含多个工具调用交互）
 */
interface ConversationRound {
  index: number
  userMessage: FullMessage
  assistantMessages: FullMessage[]
  /** 这一轮的 token 消耗 */
  tokens: number
  cost: number
  toolCalls: number
  timestamp: number
}

const ConversationDetailModal = (props: ConversationDetailModalProps) => {
  const { visible, sessionId, project, onClose } = props

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<FullConversation | null>(null)

  /* 轮次浏览状态 */
  const [currentRound, setCurrentRound] = useState(0)
  const [viewMode, setViewMode] = useState<'round' | 'tool-flow' | 'all'>('round')

  /* 文件快照预览 */
  const [filePreviewVisible, setFilePreviewVisible] = useState(false)
  const [filePreviewContent, setFilePreviewContent] = useState('')
  const [filePreviewPath, setFilePreviewPath] = useState('')
  const [filePreviewLoading, setFilePreviewLoading] = useState(false)

  /* 工具流程展开状态 */
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (visible && sessionId && project) {
      loadConversation()
      setCurrentRound(0)
      setViewMode('round')
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

  /**
   * 将消息列表分组为「轮次」
   * 每轮以 user 消息开头，包含后续所有 assistant 消息直到下一个 user 消息
   */
  const rounds = useMemo((): ConversationRound[] => {
    if (!conversation) return []

    const result: ConversationRound[] = []
    let currentUserMsg: FullMessage | null = null
    let currentAssistantMsgs: FullMessage[] = []

    const flushRound = () => {
      if (currentUserMsg) {
        let tokens = 0
        let cost = 0
        let toolCalls = 0

        for (const msg of currentAssistantMsgs) {
          if (msg.usage) {
            tokens += (msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0)
          }
          cost += msg.cost_usd || 0
          for (const c of msg.content) {
            if (c.type === 'tool_use') toolCalls++
          }
        }

        result.push({
          index: result.length,
          userMessage: currentUserMsg,
          assistantMessages: currentAssistantMsgs,
          tokens,
          cost,
          toolCalls,
          timestamp: currentUserMsg.timestamp
        })
      }
    }

    for (const msg of conversation.messages) {
      if (msg.role === 'user') {
        // 遇到新的用户消息，结束上一轮
        flushRound()
        currentUserMsg = msg
        currentAssistantMsgs = []
      } else {
        currentAssistantMsgs.push(msg)
      }
    }
    // 最后一轮
    flushRound()

    return result
  }, [conversation])

  const round = rounds[currentRound] || null
  const totalRounds = rounds.length

  /* 提取当前轮次的工具调用流程 */
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

  const currentToolFlow = useMemo((): ToolFlowItem[] => {
    if (!round) return []

    const allMsgs = [round.userMessage, ...round.assistantMessages]
    const items: ToolFlowItem[] = []
    const pendingCalls = new Map<string, ToolFlowItem>()
    let idx = 0

    for (const msg of allMsgs) {
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
  }, [round])

  /* 辅助函数 */
  const copyText = async (text: string) => {
    const result = await window.electronAPI.copyToClipboard(text)
    if (result.success) {
      message.success('已复制到剪贴板')
    } else {
      message.error('复制失败')
    }
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const truncateText = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen) + '...'
  }

  const toggleToolExpand = useCallback((id: string) => {
    setExpandedToolIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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

  /* 提取用户 Prompt 的纯文本 */
  const getUserPromptText = (msg: FullMessage): string => {
    const texts: string[] = []
    for (const c of msg.content) {
      if (c.type === 'text' && c.text) texts.push(c.text)
    }
    return texts.join('\n')
  }

  /* 提取当前轮次的全部文本（用于复制） */
  const extractRoundText = (): string => {
    if (!round) return ''
    let text = `========== 用户 Prompt ==========\n\n`
    text += getUserPromptText(round.userMessage) + '\n\n'
    for (const msg of round.assistantMessages) {
      text += `========== AI 助手 ==========\n\n`
      for (const c of msg.content) {
        if (c.type === 'text' && c.text) text += c.text + '\n'
        else if (c.type === 'tool_use') text += `[工具调用: ${c.name}]\n`
        else if (c.type === 'tool_result') text += `[工具结果]\n`
      }
      text += '\n'
    }
    return text
  }

  /* 渲染消息子类型标签 */
  const renderSubTypeTag = (subType?: MessageSubType) => {
    if (!subType || subType === 'user' || subType === 'assistant') return null
    const subTypeConfig: Record<string, { color: string; label: string }> = {
      system: { color: 'orange', label: '系统消息' },
      summary: { color: 'cyan', label: '上下文摘要' },
      hook: { color: 'magenta', label: 'Hook' },
      'microcompaction-boundary': { color: 'geekblue', label: '压缩边界' },
      'queue-operation': { color: 'lime', label: '队列操作' }
    }
    const config = subTypeConfig[subType] || { color: 'default', label: String(subType) }
    return (
      <Tag icon={<TagOutlined />} color={config.color} style={{ fontSize: 11 }}>
        {config.label}
      </Tag>
    )
  }

  /* 渲染单条消息内容 */
  const renderContent = (content: MessageContent[]) => {
    return content.map((item, index) => {
      if (item.type === 'text' && item.text) {
        return (
          <div key={index} className="mb-2">
            <Paragraph
              className="whitespace-pre-wrap font-mono text-sm"
              copyable={{ text: item.text, onCopy: () => message.success('已复制') }}
            >
              {item.text}
            </Paragraph>
          </div>
        )
      }
      if (item.type === 'image') {
        return (
          <div key={index} className="mb-2">
            <Tag icon={<FileImageOutlined />} color="blue">图片 #{index + 1}</Tag>
          </div>
        )
      }
      if (item.type === 'tool_use') {
        return (
          <div key={index} className="mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
            <Space>
              <Tag icon={<ToolOutlined />} color="processing">工具调用</Tag>
              <Text strong>{item.name}</Text>
            </Space>
            {item.input && (
              <Paragraph
                className="mt-2 text-xs font-mono"
                copyable={{ text: JSON.stringify(item.input, null, 2), onCopy: () => message.success('已复制') }}
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
            <Tag icon={<ToolOutlined />} color={item.is_error ? 'error' : 'success'}>
              {item.is_error ? '工具错误' : '工具结果'}
            </Tag>
            {item.content && (
              <Paragraph className="mt-2 text-xs font-mono">
                <pre className="whitespace-pre-wrap">
                  {typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2)}
                </pre>
              </Paragraph>
            )}
          </div>
        )
      }
      return null
    })
  }

  /* 渲染工具流程时间线 */
  const renderToolFlow = (tools: ToolFlowItem[]) => {
    if (tools.length === 0) return <Empty description="这一轮没有工具调用" style={{ padding: 20 }} />

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Tag icon={<ToolOutlined />} color="blue">{tools.length} 次调用</Tag>
          <Tag icon={<CheckCircleOutlined />} color="green">
            成功 {tools.filter(t => !t.isError).length}
          </Tag>
          {tools.some(t => t.isError) && (
            <Tag icon={<CloseCircleOutlined />} color="red">
              失败 {tools.filter(t => t.isError).length}
            </Tag>
          )}
        </div>

        {tools.map((tool, idx) => {
          const isExpanded = expandedToolIds.has(tool.id)
          const inputStr = tool.input ? JSON.stringify(tool.input, null, 2) : ''
          const outputStr = tool.output
            ? typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output, null, 2)
            : ''

          return (
            <div key={tool.id} style={{ display: 'flex', gap: 12 }}>
              {/* 时间线 */}
              <div style={{ width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div
                  style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: tool.isError ? '#ff4d4f' : '#52c41a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 10, fontWeight: 600, zIndex: 2
                  }}
                >
                  {idx + 1}
                </div>
                {idx < tools.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: '#e0e0e0', minHeight: 16 }} />
                )}
              </div>
              {/* 内容 */}
              <div
                style={{
                  flex: 1, marginBottom: 8, padding: '8px 12px', borderRadius: 6,
                  border: `1px solid ${tool.isError ? '#ffccc7' : '#d9f7be'}`,
                  background: tool.isError ? '#fff2f0' : '#f6ffed',
                  cursor: 'pointer', transition: 'all 0.2s'
                }}
                onClick={() => toggleToolExpand(tool.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Tag icon={<ToolOutlined />} color={tool.isError ? 'error' : 'success'} style={{ fontSize: 11 }}>
                    {tool.name}
                  </Tag>
                  {tool.durationMs !== undefined && tool.durationMs >= 0 && (
                    <Tag icon={<ClockCircleOutlined />} style={{ fontSize: 10 }}>
                      {formatDuration(tool.durationMs)}
                    </Tag>
                  )}
                  <Text type="secondary" style={{ fontSize: 10, marginLeft: 'auto' }}>
                    {new Date(tool.callTimestamp).toLocaleTimeString('zh-CN')}
                  </Text>
                </div>
                {!isExpanded && inputStr && (
                  <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                    {truncateText(inputStr, 80)}
                  </Text>
                )}
                {isExpanded && (
                  <div style={{ marginTop: 6 }}>
                    {inputStr && (
                      <div style={{ marginBottom: 6 }}>
                        <Text strong style={{ fontSize: 10 }}>输入:</Text>
                        <pre style={{ background: 'rgba(0,0,0,0.04)', padding: 6, borderRadius: 4, fontSize: 10, fontFamily: 'monospace', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '2px 0 0' }}>
                          {inputStr}
                        </pre>
                      </div>
                    )}
                    {outputStr && (
                      <div>
                        <Text strong style={{ fontSize: 10 }}>输出:</Text>
                        <pre style={{ background: 'rgba(0,0,0,0.04)', padding: 6, borderRadius: 4, fontSize: 10, fontFamily: 'monospace', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '2px 0 0' }}>
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
      </div>
    )
  }

  /* 渲染单轮对话内容 */
  const renderRoundContent = () => {
    if (!round) return <Empty description="没有对话数据" />

    return (
      <div>
        {/* 用户 Prompt */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Tag color="blue" style={{ fontSize: 12 }}>用户 Prompt</Tag>
            {renderSubTypeTag(round.userMessage.subType)}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {new Date(round.userMessage.timestamp).toLocaleString('zh-CN')}
            </Text>
          </div>
          <div style={{
            padding: '12px 16px', borderRadius: 8, border: '1px solid #e6f4ff',
            background: '#f0f5ff'
          }}>
            {renderContent(round.userMessage.content)}
          </div>
        </div>

        {/* AI 回复（可能有多条：tool_result 返回后继续对话） */}
        {round.assistantMessages.map((msg, idx) => (
          <div key={idx} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <Tag color="green" style={{ fontSize: 12 }}>AI 助手</Tag>
              {renderSubTypeTag(msg.subType)}
              <Text type="secondary" style={{ fontSize: 11 }}>
                {new Date(msg.timestamp).toLocaleString('zh-CN')}
              </Text>
              {msg.usage && (
                <>
                  <Tag color="blue" style={{ fontSize: 10 }}>
                    输入: {msg.usage.input_tokens.toLocaleString()}
                  </Tag>
                  <Tag color="green" style={{ fontSize: 10 }}>
                    输出: {msg.usage.output_tokens.toLocaleString()}
                  </Tag>
                  {msg.cost_usd && msg.cost_usd > 0 && (
                    <Tag color="gold" style={{ fontSize: 10 }}>${msg.cost_usd.toFixed(4)}</Tag>
                  )}
                </>
              )}
              {msg.model && (
                <Text type="secondary" style={{ fontSize: 10 }}>{msg.model}</Text>
              )}
            </div>
            <div className="pl-4 border-l-2 border-green-200 dark:border-green-700">
              {renderContent(msg.content)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Modal
      title={
        <Space>
          <MessageOutlined />
          <span>对话详情</span>
          {totalRounds > 0 && (
            <Tag style={{ fontSize: 11 }}>{totalRounds} 轮对话</Tag>
          )}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={() => copyText(extractRoundText())}>
          复制当前轮
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* 会话概览信息（简洁版） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {conversation.project.split('/').pop()}
            </Text>
            <Text code style={{ fontSize: 10 }}>{conversation.sessionId.slice(0, 12)}</Text>
            {conversation.total_tokens && (
              <Tag style={{ fontSize: 10 }}>{conversation.total_tokens.toLocaleString()} tokens</Tag>
            )}
            {conversation.total_cost_usd && (
              <Tag color="green" style={{ fontSize: 10 }}>${conversation.total_cost_usd.toFixed(4)}</Tag>
            )}
            {conversation.tool_use_count && (
              <Tag icon={<ToolOutlined />} color="purple" style={{ fontSize: 10 }}>
                {conversation.tool_use_count} 次工具
              </Tag>
            )}
          </div>

          {/* 文件修改快照（折叠） */}
          {conversation.fileEdits && conversation.fileEdits.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Collapse
                size="small"
                items={[{
                  key: 'file-edits',
                  label: (
                    <Space size={4}>
                      <FileOutlined style={{ fontSize: 12 }} />
                      <Text style={{ fontSize: 12 }}>文件修改</Text>
                      <Tag style={{ fontSize: 10 }}>
                        {conversation.fileEdits.reduce((s, e) => s + e.files.length, 0)} 个
                      </Tag>
                    </Space>
                  ),
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {conversation.fileEdits.map((edit, idx) => {
                        // 安全处理 timestamp：确保它是字符串或数字
                        let timestampDisplay = '未知'
                        if (edit.timestamp) {
                          if (typeof edit.timestamp === 'string' || typeof edit.timestamp === 'number') {
                            timestampDisplay = new Date(edit.timestamp).toLocaleString('zh-CN')
                          } else if (typeof edit.timestamp === 'object' && 'timestamp' in edit.timestamp) {
                            // 如果timestamp是对象且包含timestamp字段，使用该字段
                            timestampDisplay = new Date((edit.timestamp as any).timestamp).toLocaleString('zh-CN')
                          }
                        }

                        return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            <ClockCircleOutlined style={{ marginRight: 2 }} />
                            {timestampDisplay}
                          </Text>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            {edit.files.map((file, fIdx) => (
                              <Tag
                                key={fIdx}
                                icon={<CodeOutlined />}
                                style={{ fontSize: 10, cursor: 'pointer' }}
                                onClick={() => handleViewFileSnapshot(edit.messageId, file)}
                              >
                                {file.split('/').pop()}
                              </Tag>
                            ))}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  )
                }]}
              />
            </div>
          )}

          {/* 轮次导航栏 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 8,
            background: '#fafafa', border: '1px solid #f0f0f0',
            marginBottom: 12
          }}>
            <Button
              size="small"
              icon={<LeftOutlined />}
              disabled={currentRound <= 0}
              onClick={() => setCurrentRound(prev => Math.max(0, prev - 1))}
            />

            {/* 轮次快速跳转列表 */}
            <div style={{ flex: 1, display: 'flex', gap: 4, overflow: 'auto', padding: '2px 0' }}>
              {rounds.map((r, idx) => {
                return (
                  <Tooltip
                    key={idx}
                    title={
                      <div style={{ fontSize: 11 }}>
                        <div>{getUserPromptText(r.userMessage).slice(0, 100)}</div>
                        <div style={{ marginTop: 4, color: '#aaa' }}>
                          {r.toolCalls > 0 && `${r.toolCalls} 次工具 · `}
                          {r.tokens > 0 && `${r.tokens.toLocaleString()} tokens`}
                        </div>
                      </div>
                    }
                  >
                    <Button
                      size="small"
                      type={idx === currentRound ? 'primary' : 'default'}
                      style={{
                        fontSize: 10,
                        padding: '0 8px',
                        height: 24,
                        minWidth: 24,
                        flexShrink: 0
                      }}
                      onClick={() => setCurrentRound(idx)}
                    >
                      {idx + 1}
                    </Button>
                  </Tooltip>
                )
              })}
            </div>

            <Button
              size="small"
              icon={<RightOutlined />}
              disabled={currentRound >= totalRounds - 1}
              onClick={() => setCurrentRound(prev => Math.min(totalRounds - 1, prev + 1))}
            />

            <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
              {currentRound + 1}/{totalRounds}
            </Text>
          </div>

          {/* 当前轮次摘要 */}
          {round && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <Text strong style={{ fontSize: 13 }}>
                第 {currentRound + 1} 轮
              </Text>
              {round.tokens > 0 && (
                <Tag style={{ fontSize: 10 }}>{round.tokens.toLocaleString()} tokens</Tag>
              )}
              {round.cost > 0 && (
                <Tag color="green" style={{ fontSize: 10 }}>${round.cost.toFixed(4)}</Tag>
              )}
              {round.toolCalls > 0 && (
                <Tag icon={<ToolOutlined />} color="purple" style={{ fontSize: 10 }}>
                  {round.toolCalls} 次工具
                </Tag>
              )}
              <Tag style={{ fontSize: 10 }}>
                {round.assistantMessages.length} 条回复
              </Tag>
            </div>
          )}

          {/* 视图切换 */}
          <div style={{ marginBottom: 12 }}>
            <Segmented
              size="small"
              value={viewMode}
              onChange={v => setViewMode(v as 'round' | 'tool-flow' | 'all')}
              options={[
                { value: 'round', label: '对话', icon: <MessageOutlined /> },
                { value: 'tool-flow', label: `工具 (${currentToolFlow.length})`, icon: <NodeIndexOutlined /> },
                { value: 'all', label: '全部消息', icon: <UnorderedListOutlined /> }
              ]}
            />
          </div>

          {/* 内容区域 */}
          <div style={{ maxHeight: 450, overflow: 'auto' }}>
            {/* 单轮对话视图 */}
            {viewMode === 'round' && renderRoundContent()}

            {/* 工具流程视图（当前轮次） */}
            {viewMode === 'tool-flow' && renderToolFlow(currentToolFlow)}

            {/* 全部消息视图（原始消息列表） */}
            {viewMode === 'all' && conversation.messages.map((msg, index) => (
              <div key={index} className="mb-4">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <Tag color={msg.role === 'user' ? 'blue' : 'green'} style={{ fontSize: 11 }}>
                    {msg.role === 'user' ? '用户' : 'AI'}
                  </Tag>
                  {renderSubTypeTag(msg.subType)}
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {new Date(msg.timestamp).toLocaleString('zh-CN')}
                  </Text>
                </div>
                <div className="pl-3 border-l-2 border-gray-200">
                  {renderContent(msg.content)}
                </div>
                {index < conversation.messages.length - 1 && <Divider style={{ margin: '8px 0' }} />}
              </div>
            ))}
          </div>
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
        onCancel={() => { setFilePreviewVisible(false); setFilePreviewContent(''); setFilePreviewPath('') }}
        width="65%"
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => copyText(filePreviewContent)}>复制</Button>,
          <Button key="close" type="primary" onClick={() => { setFilePreviewVisible(false); setFilePreviewContent(''); setFilePreviewPath('') }}>关闭</Button>
        ]}
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <FolderOutlined style={{ marginRight: 4 }} />{filePreviewPath}
          </Text>
        </div>
        {filePreviewLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : (
          <pre style={{
            background: '#f6f8fa', padding: 16, borderRadius: 8, fontSize: 12,
            fontFamily: 'Fira Code, Consolas, Monaco, monospace', lineHeight: 1.6,
            overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            maxHeight: 500, border: '1px solid #e8e8e8'
          }}>
            {filePreviewContent || '// 文件内容为空'}
          </pre>
        )}
      </Modal>
    </Modal>
  )
}

export default ConversationDetailModal
