import { Modal, Spin, Alert, Typography, Divider, Tag, Space, Button, message, Segmented, Empty, Image, theme as antdTheme } from 'antd'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FullConversation, FullMessage, MessageContent, MessageSubType } from '../types'
import { getCopyablePreviewConfig } from './CopyableImage'
import { getThemeVars } from '../theme'
import {
  CopyOutlined,
  ToolOutlined,
  TagOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  UnorderedListOutlined,
  ArrowLeftOutlined,
  RightOutlined,
  PictureOutlined,
  FileTextOutlined
} from '@ant-design/icons'

const { Text, Paragraph } = Typography

interface ConversationDetailModalProps {
  visible: boolean
  sessionId: string
  project: string
  onClose: () => void
  /** 传入 prompt 的时间戳，打开后直接进入单轮详情模式 */
  initialTimestamp?: number
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
  const { visible, sessionId, project, onClose, initialTimestamp } = props

  /* 通过 antd token 检测暗色模式 */
  const { token } = antdTheme.useToken()
  const isDark = token.colorBgContainer !== '#ffffff'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conversation, setConversation] = useState<FullConversation | null>(null)

  /**
   * 双视图状态：
   * - 'list': Prompt 列表视图（从 HistoryViewer 打开时默认）
   * - 'detail': 单轮详情视图（从 LogViewer 点击"完整对话"或列表中点击某个 prompt）
   */
  const [pageView, setPageView] = useState<'list' | 'detail'>('list')
  const [currentRound, setCurrentRound] = useState(0)
  const [viewMode, setViewMode] = useState<'round' | 'tool-flow' | 'all' | 'images' | 'pastes'>('round')

  /* 工具流程展开状态 */
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())

  /* 会话级资源：paste-cache */
  const [sessionPastes, setSessionPastes] = useState<Array<{ key: string; filename: string; content: string; contentHash?: string; timestamp?: number }>>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)

  /* 右键菜单状态 */
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number; dataUrl: string }>({ visible: false, x: 0, y: 0, dataUrl: '' })
  const ctxMenuRef = useRef<HTMLDivElement>(null)

  /* 单张图片预览状态（点击 [Image #N] Tag 触发） */
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  /* 计算主题变量（用于 getCopyablePreviewConfig 和右键菜单样式） */
  const themeVars = getThemeVars(isDark)

  useEffect(() => {
    if (visible && sessionId && project) {
      loadConversation()
      loadSessionResources()
      setCurrentRound(0)
      setViewMode('round')
      /* 有 initialTimestamp 时直接进入单轮详情；否则显示 prompt 列表 */
      setPageView(initialTimestamp ? 'detail' : 'list')
    }
  }, [visible, sessionId, project])

  /* 加载会话级资源（paste-cache） */
  const loadSessionResources = async () => {
    setResourcesLoading(true)
    try {
      const pasteResult = await window.electronAPI.readSessionPasteCache(sessionId)
      setSessionPastes(pasteResult.pastes || [])
    } catch {
      /* 静默失败，资源为可选 */
    } finally {
      setResourcesLoading(false)
    }
  }

  /* 右键菜单：点击外部关闭 */
  useEffect(() => {
    if (!ctxMenu.visible) return
    const close = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(prev => ({ ...prev, visible: false }))
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [ctxMenu.visible])

  /* 复制图片到剪贴板 */
  const handleCopyImage = async (dataUrl: string) => {
    setCtxMenu(prev => ({ ...prev, visible: false }))
    try {
      const result = await window.electronAPI.copyImageToClipboard(dataUrl)
      if (result.success) message.success('图片已复制到剪贴板')
      else message.error(`复制失败: ${result.error}`)
    } catch (err: any) {
      message.error(`复制失败: ${err.message}`)
    }
  }

  /* 图片右键菜单处理 */
  const handleImageContextMenu = (e: React.MouseEvent, dataUrl: string) => {
    e.preventDefault()
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, dataUrl })
  }

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
   * 判断一条 user 消息是否为「真实用户 Prompt」
   * 排除工具结果回传、系统消息、摘要、压缩边界等内部消息
   */
  const isRealUserPrompt = (msg: FullMessage): boolean => {
    if (msg.role !== 'user') return false

    /* 通过 subType 排除内部消息 */
    const internalSubTypes = new Set([
      'system', 'summary', 'hook',
      'microcompaction-boundary', 'queue-operation',
      'file-history-snapshot'
    ])
    if (msg.subType && internalSubTypes.has(msg.subType)) return false

    /* 内容全部是 tool_result 的 user 消息是工具结果回传，不是用户输入 */
    const hasText = msg.content.some(c => c.type === 'text' && c.text && c.text.trim().length > 0)
    const hasImage = msg.content.some(c => c.type === 'image')
    const allToolResults = msg.content.length > 0 && msg.content.every(c => c.type === 'tool_result')

    if (allToolResults && !hasText) return false

    /* 至少包含文本或图片才算真实 Prompt */
    return hasText || hasImage
  }

  /**
   * 将消息列表分组为「轮次」
   * 仅以真实用户 Prompt 开头，工具结果等内部 user 消息归入上一轮
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
      if (isRealUserPrompt(msg)) {
        /* 遇到真实用户 Prompt，结束上一轮并开始新一轮 */
        flushRound()
        currentUserMsg = msg
        currentAssistantMsgs = []
      } else {
        /* 其他消息（assistant 回复、工具结果、系统消息等）归入当前轮 */
        currentAssistantMsgs.push(msg)
      }
    }
    /* 最后一轮 */
    flushRound()

    return result
  }, [conversation])

  /* 将任意格式的时间戳归一化为毫秒级数字 */
  const toEpochMs = (ts: string | number | undefined): number => {
    if (!ts) return 0
    if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts
    const ms = new Date(ts).getTime()
    return isNaN(ms) ? 0 : ms
  }

  /* 根据 initialTimestamp 自动定位到对应轮次 */
  useEffect(() => {
    if (!initialTimestamp || rounds.length === 0) return

    const targetMs = toEpochMs(initialTimestamp)
    if (targetMs === 0) return

    // 找到时间戳最接近的轮次
    let bestIndex = 0
    let bestDiff = Math.abs(toEpochMs(rounds[0].timestamp as any) - targetMs)

    for (let i = 1; i < rounds.length; i++) {
      const diff = Math.abs(toEpochMs(rounds[i].timestamp as any) - targetMs)
      if (diff < bestDiff) {
        bestDiff = diff
        bestIndex = i
      }
    }

    setCurrentRound(bestIndex)
  }, [rounds, initialTimestamp])

  const round = rounds[currentRound] || null
  const totalRounds = rounds.length

  /* 从当前轮次消息中提取内联 base64 图片（仅当前 prompt，不是整个 session） */
  const inlineImages = useMemo((): Array<{ filename: string; dataUrl: string }> => {
    if (!round) return []
    const msgs = [round.userMessage, ...round.assistantMessages]
    const imgs: Array<{ filename: string; dataUrl: string }> = []
    let imgIndex = 0
    for (const msg of msgs) {
      for (const c of msg.content) {
        if (c.type === 'image' && c.source?.data) {
          imgIndex++
          imgs.push({
            filename: `inline-image-${imgIndex}.${(c.source.media_type || 'image/png').split('/')[1] || 'png'}`,
            dataUrl: `data:${c.source.media_type || 'image/png'};base64,${c.source.data}`
          })
        }
      }
    }
    return imgs
  }, [round])

  /* 当前轮次的所有图片（仅内联） */
  const allImages = inlineImages

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

  /**
   * 将文本中的 [Image #N] 标记替换为可点击预览的主题色 Tag
   */
  const renderTextWithImages = (text: string) => {
    const imagePattern = /\[Image #(\d+)\]/g
    const parts: Array<{ type: 'text' | 'image'; value: string; imageNum?: number }> = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = imagePattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
      }
      parts.push({ type: 'image', value: match[0], imageNum: parseInt(match[1]) })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', value: text.slice(lastIndex) })
    }

    /* 没有图片标记，直接返回纯文本 */
    if (parts.length === 1 && parts[0].type === 'text') {
      return <span>{text}</span>
    }

    return (
      <>
        {parts.map((part, idx) => {
          if (part.type === 'text') {
            return <span key={idx}>{part.value}</span>
          }
          const imgNum = part.imageNum || 0
          const matchedImg = allImages[imgNum - 1]

          return (
            <Tag
              key={idx}
              icon={<PictureOutlined />}
              color="blue"
              style={{ fontSize: 11, margin: '0 2px', cursor: matchedImg ? 'pointer' : 'default' }}
              onClick={matchedImg ? () => setPreviewSrc(matchedImg.dataUrl) : undefined}
            >
              {part.value}
            </Tag>
          )
        })}
      </>
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
              {renderTextWithImages(item.text)}
            </Paragraph>
          </div>
        )
      }
      if (item.type === 'image') {
        /* 内联图片不在对话区显示，通过 [Image #N] Tag 点击预览或去"图片"Tab 查看 */
        return null
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

  /* 从列表点击某个 prompt 进入详情 */
  const handlePromptClick = (roundIndex: number) => {
    setCurrentRound(roundIndex)
    setViewMode('round')
    setPageView('detail')
  }

  /* 渲染 Prompt 列表视图 */
  const renderPromptList = () => {
    if (rounds.length === 0) return <Empty description="没有对话数据" />

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* 会话概览 */}
        {conversation && (
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
          </div>
        )}

        {/* Prompt 列表 */}
        <div style={{ maxHeight: 520, overflow: 'auto' }}>
          {rounds.map((r, idx) => {
            const promptText = getUserPromptText(r.userMessage)
            const ts = toEpochMs(r.timestamp as any)

            return (
              <div
                key={idx}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
                  background: isDark ? '#1a1a1a' : '#fafafa',
                  marginBottom: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => handlePromptClick(idx)}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = '#1677ff'
                  ;(e.currentTarget as HTMLDivElement).style.background = isDark ? '#1e2a3a' : '#f0f5ff'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = isDark ? '#303030' : '#f0f0f0'
                  ;(e.currentTarget as HTMLDivElement).style.background = isDark ? '#1a1a1a' : '#fafafa'
                }}
              >
                {/* 头部：轮次编号 + 时间 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Tag color="blue" style={{ fontSize: 11 }}>第 {idx + 1} 轮</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {ts > 0 ? new Date(ts).toLocaleString('zh-CN') : ''}
                  </Text>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {r.toolCalls > 0 && (
                      <Tag icon={<ToolOutlined />} color="purple" style={{ fontSize: 10 }}>
                        {r.toolCalls} 次工具
                      </Tag>
                    )}
                    {r.tokens > 0 && (
                      <Tag style={{ fontSize: 10 }}>{r.tokens.toLocaleString()} tokens</Tag>
                    )}
                    {r.cost > 0 && (
                      <Tag color="green" style={{ fontSize: 10 }}>${r.cost.toFixed(4)}</Tag>
                    )}
                  </div>
                </div>

                {/* Prompt 文本预览 */}
                <Text style={{ fontSize: 13, lineHeight: '20px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {promptText || '(空消息)'}
                </Text>

                {/* 底部：回复数 + 查看详情提示 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {r.assistantMessages.length} 条 AI 回复
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    点击查看完整对话 <RightOutlined style={{ fontSize: 10 }} />
                  </Text>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /* 渲染单轮详情视图 */
  const renderDetailView = () => {
    if (!conversation) return null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* 返回列表按钮（仅当从列表进入时显示） */}
        {!initialTimestamp && (
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => setPageView('list')}
            style={{ alignSelf: 'flex-start', marginBottom: 8, padding: '4px 8px', fontSize: 13 }}
          >
            返回 Prompt 列表
          </Button>
        )}

        {/* 当前轮次摘要 */}
        {round && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ fontSize: 12 }}>第 {currentRound + 1} 轮</Tag>
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
            onChange={v => setViewMode(v as typeof viewMode)}
            options={[
              { value: 'round', label: '对话', icon: <MessageOutlined /> },
              { value: 'tool-flow', label: `工具 (${currentToolFlow.length})`, icon: <NodeIndexOutlined /> },
              { value: 'all', label: '全部消息', icon: <UnorderedListOutlined /> },
              { value: 'images', label: `图片 (${allImages.length})`, icon: <PictureOutlined />, disabled: allImages.length === 0 },
              { value: 'pastes', label: `粘贴 (${sessionPastes.length})`, icon: <FileTextOutlined />, disabled: sessionPastes.length === 0 }
            ]}
          />
        </div>

        {/* 内容区域 */}
        <div style={{ maxHeight: 450, overflow: 'auto' }}>
          {viewMode === 'round' && renderRoundContent()}
          {viewMode === 'tool-flow' && renderToolFlow(currentToolFlow)}
          {viewMode === 'all' && round && (() => {
            /* 仅展示当前轮次的所有消息 */
            const roundMsgs = [round.userMessage, ...round.assistantMessages]
            return (
              <>
                {roundMsgs.map((msg, index) => (
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
                    {index < roundMsgs.length - 1 && <Divider style={{ margin: '8px 0' }} />}
                  </div>
                ))}
              </>
            )
          })()}

          {/* 图片资源视图（仅当前轮次的内联图片） */}
          {viewMode === 'images' && (
            <div>
              {allImages.length === 0 ? (
                <Empty description="当前 Prompt 没有图片" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Tag icon={<PictureOutlined />} color="blue">{allImages.length} 张图片</Tag>
                  <Image.PreviewGroup preview={getCopyablePreviewConfig(isDark)}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {allImages.map((img, idx) => (
                        <div
                          key={idx}
                          onContextMenu={e => handleImageContextMenu(e, img.dataUrl)}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            borderRadius: 6, overflow: 'hidden',
                            border: `1px solid ${themeVars.border}`,
                            background: isDark ? '#1a1a1a' : '#fafafa',
                            padding: 4
                          }}
                        >
                          <Image
                            src={img.dataUrl}
                            alt={img.filename}
                            width={120}
                            height={120}
                            style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                            preview={{ src: img.dataUrl }}
                          />
                        </div>
                      ))}
                    </div>
                  </Image.PreviewGroup>
                </div>
              )}
            </div>
          )}

          {/* 粘贴内容视图（会话级 paste-cache） */}
          {viewMode === 'pastes' && (
            <div>
              {resourcesLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
              ) : sessionPastes.length === 0 ? (
                <Empty description="该会话没有 paste-cache 粘贴内容" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Tag icon={<FileTextOutlined />} color="orange">{sessionPastes.length} 个粘贴内容</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>来源: ~/.claude/paste-cache/</Text>
                  </div>
                  {sessionPastes.map((paste, idx) => (
                    <div
                      key={idx}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
                        background: isDark ? '#1a1a1a' : '#fafafa',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 12px',
                        borderBottom: `1px solid ${isDark ? '#303030' : '#f0f0f0'}`,
                        background: isDark ? '#222' : '#f5f5f5'
                      }}>
                        <Space size={4}>
                          <FileTextOutlined style={{ fontSize: 12 }} />
                          <Text style={{ fontSize: 12, fontWeight: 500 }}>{paste.filename}</Text>
                          {paste.contentHash && (
                            <Text code style={{ fontSize: 10 }}>{paste.contentHash.slice(0, 8)}</Text>
                          )}
                        </Space>
                        <Space size={4}>
                          {paste.timestamp && (
                            <Text type="secondary" style={{ fontSize: 10 }}>
                              {new Date(paste.timestamp).toLocaleString('zh-CN')}
                            </Text>
                          )}
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => copyText(paste.content)}
                            style={{ fontSize: 10 }}
                          />
                        </Space>
                      </div>
                      <pre style={{
                        padding: '8px 12px',
                        margin: 0,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        maxHeight: 200,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}>
                        {paste.content.length > 3000 ? paste.content.slice(0, 3000) + '\n... (内容已截断)' : paste.content}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
  <>
    <Modal
      title={
        <Space>
          <MessageOutlined />
          <span>{pageView === 'list' ? 'Prompt 列表' : 'Prompt 详情'}</span>
          {totalRounds > 0 && (
            <Tag style={{ fontSize: 11 }}>{totalRounds} 轮对话</Tag>
          )}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={900}
      footer={
        pageView === 'detail'
          ? [
              <Button key="copy" icon={<CopyOutlined />} onClick={() => copyText(extractRoundText())}>
                复制当前轮
              </Button>,
              <Button key="close" type="primary" onClick={onClose}>
                关闭
              </Button>
            ]
          : [
              <Button key="close" type="primary" onClick={onClose}>
                关闭
              </Button>
            ]
      }
    >
      {loading && (
        <div className="text-center py-8">
          <Spin size="large" tip="加载中..." />
        </div>
      )}

      {error && <Alert message="加载失败" description={error} type="error" showIcon closable />}

      {!loading && !error && conversation && (
        pageView === 'list' ? renderPromptList() : renderDetailView()
      )}

    </Modal>

    {/* 点击 [Image #N] Tag 时的图片预览（带复制功能） */}
    {previewSrc && (
      <Image
        src={previewSrc}
        style={{ display: 'none' }}
        preview={{
          visible: true,
          src: previewSrc,
          onVisibleChange: v => { if (!v) setPreviewSrc(null) },
          ...getCopyablePreviewConfig(isDark)
        }}
      />
    )}

    {/* 图片右键菜单（Portal） */}
    {ctxMenu.visible && createPortal(
      <div
        ref={ctxMenuRef}
        style={{
          position: 'fixed',
          left: ctxMenu.x,
          top: ctxMenu.y,
          background: themeVars.bgElevated,
          border: `1px solid ${themeVars.border}`,
          borderRadius: 8,
          boxShadow: isDark ? '0 6px 16px rgba(0,0,0,0.6)' : '0 6px 16px rgba(0,0,0,0.12)',
          zIndex: 9999,
          minWidth: 140,
          padding: '4px 0',
          fontSize: 13
        }}
      >
        <div
          onClick={() => handleCopyImage(ctxMenu.dataUrl)}
          style={{ padding: '8px 16px', cursor: 'pointer', transition: 'background 0.2s', color: themeVars.text }}
          onMouseEnter={e => { e.currentTarget.style.background = themeVars.bgSection }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          📋 复制图片
        </div>
      </div>,
      document.body
    )}
  </>
  )
}

export default ConversationDetailModal
