import { Modal, Spin, Alert, Typography, Tag, Space, Button, Switch, message, Segmented, Empty, Image, theme as antdTheme } from 'antd'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { diffLines, Change } from 'diff'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ClaudeRecord, FullConversation, FullMessage, MessageContent, MessageSubType } from '../types'
import { getLanguageByFilePath, getMonacoLanguage } from '../utils/codeDetector'
import { getCopyablePreviewConfig } from './CopyableImage'
import { getThemeVars } from '../theme'
import ImageContextMenu from './ImageContextMenu'
import {
  CopyOutlined,
  ToolOutlined,
  TagOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  ArrowLeftOutlined,
  RightOutlined,
  PictureOutlined,
  FileTextOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  StarOutlined,
  LoadingOutlined,
  EyeOutlined,
  SwapOutlined,
  RollbackOutlined
} from '@ant-design/icons'

const { Text } = Typography

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
  const [viewMode, setViewMode] = useState<'round' | 'tool-flow' | 'file-changes' | 'images' | 'pastes'>('round')
  /* Prompt 列表排序：newest = 最新在前，oldest = 最旧在前 */
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

  /* 工具流程展开状态 */
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())

  /* AI 总结相关状态 */
  const [summarizing, setSummarizing] = useState(false)
  const [summaryContent, setSummaryContent] = useState<string>('')
  const [summaryVisible, setSummaryVisible] = useState(false)
  /* 记录当前总结对应的轮次，切换轮次时不会混淆 */
  const summaryRoundRef = useRef<number>(-1)

  /* 会话级资源：paste-cache */
  const [sessionPastes, setSessionPastes] = useState<Array<{ key: string; filename: string; content: string; contentHash?: string; timestamp?: number }>>([])
  const [resourcesLoading, setResourcesLoading] = useState(false)

  /* 右键菜单状态 */
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; x: number; y: number; dataUrl: string }>({ visible: false, x: 0, y: 0, dataUrl: '' })

  /* 单张图片预览状态（点击 [Image #N] Tag 触发） */
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [filePreviewVisible, setFilePreviewVisible] = useState(false)
  const [filePreviewLoading, setFilePreviewLoading] = useState(false)
  const [filePreviewContent, setFilePreviewContent] = useState('')
  const [previewFilePath, setPreviewFilePath] = useState('')
  const [previewMessageId, setPreviewMessageId] = useState('')
  const [showFileDiff, setShowFileDiff] = useState(false)
  const [fileDiffLoading, setFileDiffLoading] = useState(false)
  const [fileDiffResult, setFileDiffResult] = useState<Change[]>([])
  const [fileDiffHasChanges, setFileDiffHasChanges] = useState(true)
  const [filePreviewWrap, setFilePreviewWrap] = useState(false)
  const [filePreviewMode, setFilePreviewMode] = useState<'source' | 'preview'>('source')
  const [isNewFileSnapshot, setIsNewFileSnapshot] = useState(false)

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
      /* 重置 AI 总结状态 */
      setSummaryVisible(false)
      setSummaryContent('')
      setSummarizing(false)
      summaryRoundRef.current = -1
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
    const hasText = msg.content.some(c => c.type === 'text' && c.text && typeof c.text === 'string' && c.text.trim().length > 0)
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

  interface RoundChangedFile {
    filePath: string
    messageId: string
    snapshotMessageId?: string
    timestamp: string
    isSnapshotUpdate: boolean
  }

  const currentRoundChangedFiles = useMemo((): RoundChangedFile[] => {
    if (!conversation?.fileEdits || !round) return []

    const roundMessageIds = new Set<string>()
    const roundMessages = [round.userMessage, ...round.assistantMessages]
    for (const msg of roundMessages) {
      if (msg.messageId) {
        roundMessageIds.add(msg.messageId)
      }
    }

    let matchedEdits = conversation.fileEdits.filter(edit => edit.files.length > 0)
    if (roundMessageIds.size > 0) {
      const exactMatched = matchedEdits.filter(
        edit =>
          roundMessageIds.has(edit.messageId) ||
          (edit.snapshotMessageId ? roundMessageIds.has(edit.snapshotMessageId) : false)
      )
      if (exactMatched.length > 0) {
        matchedEdits = exactMatched
      }
    }

    if (roundMessageIds.size === 0 || matchedEdits.length === 0) {
      const currentRoundStart = toEpochMs(round.timestamp as unknown as string | number)
      const nextRound = rounds[currentRound + 1]
      const nextRoundStart = nextRound
        ? toEpochMs(nextRound.timestamp as unknown as string | number)
        : Number.MAX_SAFE_INTEGER

      matchedEdits = conversation.fileEdits.filter(edit => {
        const editTime = toEpochMs(edit.timestamp)
        return editTime >= currentRoundStart && editTime < nextRoundStart
      })
    }

    const files: RoundChangedFile[] = []
    for (const edit of matchedEdits) {
      for (const filePath of edit.files) {
        files.push({
          filePath,
          messageId: edit.messageId,
          snapshotMessageId: edit.snapshotMessageId,
          timestamp: edit.timestamp,
          isSnapshotUpdate: !!edit.isSnapshotUpdate
        })
      }
    }

    return files.sort((a, b) => toEpochMs(b.timestamp) - toEpochMs(a.timestamp))
  }, [conversation?.fileEdits, round, rounds, currentRound])

  const isMarkdownFile = useMemo(() => {
    return getLanguageByFilePath(previewFilePath, filePreviewContent) === 'markdown'
  }, [previewFilePath, filePreviewContent])

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

  const handleViewFileSnapshot = async (messageId: string, filePath: string) => {
    setPreviewMessageId(messageId)
    setPreviewFilePath(filePath)
    setFilePreviewVisible(true)
    setFilePreviewLoading(true)
    setFilePreviewContent('')
    setShowFileDiff(false)
    setFileDiffResult([])
    setFileDiffHasChanges(true)
    setIsNewFileSnapshot(false)
    setFilePreviewMode(getLanguageByFilePath(filePath) === 'markdown' ? 'preview' : 'source')
    try {
      const result = await window.electronAPI.readFileSnapshotContent(sessionId, messageId, filePath)
      if (result.success && result.content !== undefined) {
        setFilePreviewContent(result.content)
        setIsNewFileSnapshot(!!result.isNewFileSnapshot)
      } else {
        setFilePreviewContent(`// 加载失败: ${result.error || '未知错误'}`)
        setIsNewFileSnapshot(false)
      }
    } catch (error) {
      setFilePreviewContent(`// 加载失败: ${(error as Error).message}`)
      setIsNewFileSnapshot(false)
    } finally {
      setFilePreviewLoading(false)
    }
  }

  const handleToggleFileDiff = async () => {
    if (isNewFileSnapshot) {
      message.info('该文件为新增快照，无需对比差异')
      return
    }

    if (showFileDiff) {
      setShowFileDiff(false)
      return
    }

    setFileDiffLoading(true)
    try {
      const result = await window.electronAPI.readFileContent(previewFilePath)
      if (result.success && result.content !== undefined) {
        const changes = diffLines(result.content, filePreviewContent)
        const hasChanges = changes.some(change => change.added || change.removed)
        setFileDiffResult(changes)
        setFileDiffHasChanges(hasChanges)
        setShowFileDiff(true)
      } else {
        const changes = diffLines('', filePreviewContent)
        setFileDiffResult(changes)
        setFileDiffHasChanges(true)
        setShowFileDiff(true)
        message.info('当前文件不存在或无法读取，显示快照为新增内容')
      }
    } catch {
      message.error('读取当前文件失败')
    } finally {
      setFileDiffLoading(false)
    }
  }

  const handleRestoreFileFromSnapshot = () => {
    Modal.confirm({
      title: '确认恢复文件',
      content: (
        <div>
          <p>将从该 Prompt 的文件快照恢复到原始路径：</p>
          <p style={{ fontFamily: 'monospace', fontSize: 12 }}>{previewFilePath}</p>
          <p style={{ color: themeVars.warning, marginTop: 8 }}>
            注意：当前文件会先自动备份（.backup-时间戳），再写入快照内容。
          </p>
        </div>
      ),
      okText: '确认恢复',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await window.electronAPI.restoreFileFromSnapshot(
            sessionId,
            previewMessageId,
            previewFilePath
          )
          if (result.success) {
            message.success('文件恢复成功')
          } else {
            message.error(`恢复失败: ${result.error || '未知错误'}`)
          }
        } catch (error) {
          message.error(`恢复失败: ${(error as Error).message}`)
        }
      }
    })
  }

  /* 提取用户 Prompt 的纯文本 */
  const getUserPromptText = (msg: FullMessage): string => {
    const texts: string[] = []
    for (const c of msg.content) {
      if (c.type === 'text' && c.text) {
        texts.push(typeof c.text === 'string' ? c.text : JSON.stringify(c.text))
      }
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
        if (c.type === 'text' && c.text) text += (typeof c.text === 'string' ? c.text : JSON.stringify(c.text)) + '\n'
        else if (c.type === 'tool_use') text += `[工具调用: ${c.name}]\n`
        else if (c.type === 'tool_result') text += `[工具结果]\n`
      }
      text += '\n'
    }
    return text
  }

  /**
   * 将当前轮次的消息转为 ClaudeRecord[] 以便调用 AI 总结接口
   */
  const roundToRecords = (r: ConversationRound): ClaudeRecord[] => {
    const records: ClaudeRecord[] = []

    /* 用户 Prompt */
    const userText = getUserPromptText(r.userMessage)
    if (userText) {
      records.push({
        timestamp: r.timestamp,
        project: conversation?.project || '',
        sessionId: conversation?.sessionId || '',
        display: `[用户] ${userText}`
      })
    }

    /* AI 回复 & 工具调用 */
    for (const msg of r.assistantMessages) {
      const parts: string[] = []
      for (const c of msg.content) {
        if (c.type === 'text' && c.text) parts.push(c.text)
        else if (c.type === 'tool_use') parts.push(`[工具调用: ${c.name}] ${c.input ? JSON.stringify(c.input).slice(0, 500) : ''}`)
        else if (c.type === 'tool_result') {
          const txt = typeof c.content === 'string' ? c.content : JSON.stringify(c.content)
          parts.push(`[工具结果] ${txt.slice(0, 500)}`)
        }
      }
      if (parts.length > 0) {
        records.push({
          timestamp: msg.timestamp,
          project: conversation?.project || '',
          sessionId: conversation?.sessionId || '',
          display: `[${msg.role === 'assistant' ? 'AI' : '系统'}] ${parts.join('\n')}`
        })
      }
    }
    return records
  }

  /* AI 总结当前 Prompt 轮次 */
  const handleSummarizeRound = async () => {
    if (!round) return

    setSummarizing(true)
    summaryRoundRef.current = currentRound

    try {
      /* 检查 AI 配置 */
      const settings = await window.electronAPI.getAppSettings()

      if (!settings.aiSummary.enabled) {
        message.warning('AI 总结功能尚未启用，请前往设置页面开启')
        setSummarizing(false)
        return
      }

      const currentProvider = settings.aiSummary.providers[settings.aiSummary.provider]
      if (!currentProvider || !currentProvider.apiKey) {
        message.warning('尚未配置 API Key，请前往设置页面配置')
        setSummarizing(false)
        return
      }

      const records = roundToRecords(round)
      if (records.length === 0) {
        message.warning('当前轮次没有可总结的内容')
        setSummarizing(false)
        return
      }

      setSummaryContent('正在生成总结...')
      setSummaryVisible(true)

      let fullSummary = ''

      await window.electronAPI.summarizeRecordsStream(
        { records, type: 'detailed' },
        (chunk: string) => {
          /* 仅在轮次未切换时更新 */
          if (summaryRoundRef.current === currentRound) {
            fullSummary += chunk
            setSummaryContent(fullSummary)
          }
        },
        () => {
          setSummarizing(false)
        },
        (error: string) => {
          setSummarizing(false)
          setSummaryVisible(false)
          message.error(`总结失败: ${error}`, 5)
        }
      )
    } catch (err: any) {
      setSummarizing(false)
      message.error(`总结失败: ${err.message || '未知错误'}`, 5)
    }
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
              color="#D97757"
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

  /* 检测文本是否包含 Markdown 语法 */
  const isMarkdown = (text: string): boolean => {
    const trimmed = text.trim()
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m,         // 标题
      /\*\*.+\*\*/,             // 粗体
      /\[.+\]\(.+\)/,           // 链接
      /^```/m,                  // 代码块
      /^[-*+]\s+/m,             // 无序列表
      /^\d+\.\s+/m,             // 有序列表
      /^>\s+/m,                 // 引用
      /\|.+\|.+\|/             // 表格
    ]
    return markdownPatterns.some(pattern => pattern.test(trimmed))
  }

  /* 渲染 Markdown 文本（含代码高亮、链接点击） */
  const renderMarkdownContent = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ inline, className, children, ...codeProps }: any) {
          const langMatch = /language-(\w+)/.exec(className || '')
          return !inline && langMatch ? (
            <SyntaxHighlighter
              style={isDark ? vscDarkPlus : prism}
              language={langMatch[1]}
              PreTag="div"
              customStyle={{ margin: '8px 0', borderRadius: 6, fontSize: 12 }}
              {...codeProps}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code
              style={{
                background: themeVars.codeBg,
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 12,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'
              }}
              {...codeProps}
            >
              {children}
            </code>
          )
        },
        pre({ children }) { return <>{children}</> },
        p({ children }) { return <p style={{ margin: '6px 0', lineHeight: 1.7 }}>{children}</p> },
        h1({ children }) { return <h1 style={{ fontSize: 18, fontWeight: 600, margin: '12px 0 6px', borderBottom: `1px solid ${themeVars.borderSecondary}`, paddingBottom: 6 }}>{children}</h1> },
        h2({ children }) { return <h2 style={{ fontSize: 16, fontWeight: 600, margin: '10px 0 6px', borderBottom: `1px solid ${themeVars.borderSecondary}`, paddingBottom: 4 }}>{children}</h2> },
        h3({ children }) { return <h3 style={{ fontSize: 14, fontWeight: 600, margin: '8px 0 4px' }}>{children}</h3> },
        ul({ children }) { return <ul style={{ margin: '4px 0', paddingLeft: 20, listStyleType: 'disc' }}>{children}</ul> },
        ol({ children }) { return <ol style={{ margin: '4px 0', paddingLeft: 20 }}>{children}</ol> },
        li({ children }) { return <li style={{ margin: '2px 0', lineHeight: 1.6 }}>{children}</li> },
        strong({ children }) { return <strong style={{ fontWeight: 600 }}>{children}</strong> },
        blockquote({ children }) {
          return (
            <blockquote style={{
              margin: '6px 0',
              paddingLeft: 12,
              borderLeft: `3px solid ${themeVars.borderQuote}`,
              color: themeVars.textQuote
            }}>
              {children}
            </blockquote>
          )
        },
        table({ children }) {
          return (
            <div style={{ overflow: 'auto', margin: '8px 0' }}>
              <table style={{
                borderCollapse: 'collapse', width: '100%', fontSize: 12,
                border: `1px solid ${themeVars.borderSecondary}`
              }}>
                {children}
              </table>
            </div>
          )
        },
        th({ children }) { return <th style={{ padding: '6px 10px', borderBottom: `2px solid ${themeVars.border}`, background: themeVars.bgSection, textAlign: 'left', fontWeight: 600 }}>{children}</th> },
        td({ children }) { return <td style={{ padding: '5px 10px', borderBottom: `1px solid ${themeVars.borderSecondary}` }}>{children}</td> },
        a({ href, children }) {
          return (
            <a
              href={href}
              style={{ color: themeVars.link, textDecoration: 'underline', cursor: 'pointer' }}
              onClick={e => {
                e.preventDefault()
                if (href) window.electronAPI.openExternal(href)
              }}
            >
              {children}
            </a>
          )
        },
        hr() { return <hr style={{ border: 'none', borderTop: `1px solid ${themeVars.borderSecondary}`, margin: '10px 0' }} /> }
      }}
    >
      {text}
    </ReactMarkdown>
  )

  /* 渲染单条消息内容 */
  const renderContent = (content: MessageContent[]) => {
    return content.map((item, index) => {
      if (item.type === 'text' && item.text) {
        /* 安全处理：item.text 可能是对象（如 file-history metadata），需确保为字符串 */
        const text = typeof item.text === 'string' ? item.text : JSON.stringify(item.text, null, 2)
        const hasImageRef = /\[Image #\d+\]/.test(text)
        const markdown = isMarkdown(text)

        return (
          <div key={index} style={{ position: 'relative', marginBottom: 6 }}>
            {/* 复制按钮（浮动右上角） */}
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyText(text)}
              style={{ position: 'absolute', right: 4, top: 2, fontSize: 10, color: themeVars.textTertiary, zIndex: 1 }}
            />
            {hasImageRef ? (
              <div className="whitespace-pre-wrap text-sm" style={{ lineHeight: 1.6, paddingRight: 28 }}>
                {renderTextWithImages(text)}
              </div>
            ) : markdown ? (
              <div
                className="text-sm"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: `1px solid ${themeVars.borderSecondary}`,
                  background: themeVars.bgSection,
                }}
              >
                {renderMarkdownContent(text)}
              </div>
            ) : (
              <div className="whitespace-pre-wrap font-mono text-sm" style={{ lineHeight: 1.6, paddingRight: 28 }}>
                {text}
              </div>
            )}
          </div>
        )
      }
      if (item.type === 'image') {
        /* 内联图片不在对话区显示，通过 [Image #N] Tag 点击预览或去"图片"Tab 查看 */
        return null
      }
      if (item.type === 'tool_use') {
        const inputJson = item.input ? JSON.stringify(item.input, null, 2) : ''
        return (
          <div key={index} style={{ marginBottom: 6, padding: '6px 10px', borderRadius: 6, background: themeVars.primaryBg }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space size={4}>
                <Tag icon={<ToolOutlined />} color="processing" style={{ fontSize: 11 }}>工具调用</Tag>
                <Text strong style={{ fontSize: 12 }}>{item.name}</Text>
              </Space>
              {inputJson && (
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(inputJson)} style={{ fontSize: 10, color: themeVars.textTertiary }} />
              )}
            </div>
            {inputJson && (
              <div style={{ marginTop: 4 }}>
                <SyntaxHighlighter
                  style={isDark ? vscDarkPlus : prism}
                  language="json"
                  customStyle={{ margin: 0, borderRadius: 4, fontSize: 11, maxHeight: 180, overflow: 'auto', padding: '6px 10px' }}
                >
                  {inputJson}
                </SyntaxHighlighter>
              </div>
            )}
          </div>
        )
      }
      if (item.type === 'tool_result') {
        const resultText = typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2)
        return (
          <div key={index} style={{ marginBottom: 6, padding: '6px 10px', borderRadius: 6, background: item.is_error ? themeVars.errorLight : themeVars.successLight }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Tag icon={<ToolOutlined />} color={item.is_error ? 'error' : 'success'} style={{ fontSize: 11 }}>
                {item.is_error ? '工具错误' : '工具结果'}
              </Tag>
              {resultText && (
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(resultText)} style={{ fontSize: 10, color: themeVars.textTertiary }} />
              )}
            </div>
            {resultText && (
              <pre className="whitespace-pre-wrap text-xs font-mono" style={{ maxHeight: 180, overflow: 'auto', margin: '4px 0 0 0' }}>
                {resultText}
              </pre>
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
          <Tag icon={<ToolOutlined />} color="#D97757">{tools.length} 次调用</Tag>
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
                    background: tool.isError ? themeVars.error : themeVars.success,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: themeVars.textWhite, fontSize: 10, fontWeight: 600, zIndex: 2
                  }}
                >
                  {idx + 1}
                </div>
                {idx < tools.length - 1 && (
                  <div style={{ width: 2, flex: 1, background: themeVars.borderSecondary, minHeight: 16 }} />
                )}
              </div>
              {/* 内容 */}
              <div
                style={{
                  flex: 1, marginBottom: 8, padding: '8px 12px', borderRadius: 6,
                  border: `1px solid ${tool.isError ? themeVars.errorBorder : themeVars.successBorder}`,
                  background: tool.isError ? themeVars.errorLight : themeVars.successLight,
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
                        <pre style={{ background: themeVars.codeBg, padding: 6, borderRadius: 4, fontSize: 10, fontFamily: 'monospace', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '2px 0 0' }}>
                          {inputStr}
                        </pre>
                      </div>
                    )}
                    {outputStr && (
                      <div>
                        <Text strong style={{ fontSize: 10 }}>输出:</Text>
                        <pre style={{ background: themeVars.codeBg, padding: 6, borderRadius: 4, fontSize: 10, fontFamily: 'monospace', maxHeight: 150, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '2px 0 0' }}>
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

  const renderRoundFileChanges = () => {
    if (currentRoundChangedFiles.length === 0) {
      return <Empty description="当前 Prompt 没有关联的变更文件" style={{ padding: 20 }} />
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <Tag icon={<FileTextOutlined />} color="#D97757">{currentRoundChangedFiles.length} 个变更文件</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>
            文件来源于当前 Prompt 关联的 file-history-snapshot
          </Text>
        </div>

        {currentRoundChangedFiles.map((item, index) => (
          <div
            key={`${item.messageId}-${item.filePath}-${index}`}
            style={{
              borderRadius: 8,
              border: `1px solid ${themeVars.itemBorder}`,
              background: themeVars.itemBg,
              padding: '10px 12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: 12
                }}
                ellipsis={{ tooltip: item.filePath }}
              >
                {item.filePath}
              </Text>
              <Space size={4}>
                <Button
                  type="text"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => handleViewFileSnapshot(item.messageId, item.filePath)}
                >
                  查看快照
                </Button>
              </Space>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <Tag style={{ fontSize: 10 }}>{item.messageId.slice(0, 10)}</Tag>
              {item.snapshotMessageId && item.snapshotMessageId !== item.messageId && (
                <Tag style={{ fontSize: 10 }}>base:{item.snapshotMessageId.slice(0, 10)}</Tag>
              )}
              <Tag style={{ fontSize: 10 }}>
                {toEpochMs(item.timestamp) > 0
                  ? new Date(toEpochMs(item.timestamp)).toLocaleString('zh-CN')
                  : '未知时间'}
              </Tag>
              {item.isSnapshotUpdate && <Tag color="processing" style={{ fontSize: 10 }}>快照更新</Tag>}
            </div>
          </div>
        ))}
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
            <Tag color="#D97757" style={{ fontSize: 12 }}>用户 Prompt</Tag>
            {renderSubTypeTag(round.userMessage.subType)}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {new Date(round.userMessage.timestamp).toLocaleString('zh-CN')}
            </Text>
          </div>
          <div style={{
            padding: '12px 16px', borderRadius: 8,
            border: `1px solid ${isDark ? 'rgba(217, 119, 87, 0.2)' : 'rgba(217, 119, 87, 0.15)'}`,
            background: themeVars.primaryBg
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
                  <Tag color="#D97757" style={{ fontSize: 10 }}>
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

        {/* 排序控制 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>共 {rounds.length} 个 Prompt</Text>
          <Button
            type="text"
            size="small"
            icon={sortOrder === 'newest' ? <SortDescendingOutlined /> : <SortAscendingOutlined />}
            onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
            style={{ fontSize: 11 }}
          >
            {sortOrder === 'newest' ? '最新优先' : '最早优先'}
          </Button>
        </div>

        {/* Prompt 列表 */}
        <div style={{ maxHeight: 520, overflow: 'auto' }}>
          {(sortOrder === 'newest' ? [...rounds].reverse() : rounds).map((r) => {
            /* 使用 round 原始 index 确保点击时定位正确 */
            const originalIdx = r.index
            const promptText = getUserPromptText(r.userMessage)
            const ts = toEpochMs(r.timestamp as any)
            const aiReplyCount = r.assistantMessages.filter(m => m.role === 'assistant').length

            return (
              <div
                key={originalIdx}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${themeVars.itemBorder}`,
                  background: themeVars.itemBg,
                  marginBottom: 8,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => handlePromptClick(originalIdx)}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = themeVars.itemHoverBorder
                  ;(e.currentTarget as HTMLDivElement).style.background = themeVars.itemHoverBg
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = themeVars.itemBorder
                  ;(e.currentTarget as HTMLDivElement).style.background = themeVars.itemBg
                }}
              >
                {/* 头部：轮次编号 + 时间 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Tag color="#D97757" style={{ fontSize: 11 }}>第 {originalIdx + 1} 轮</Tag>
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
                    {aiReplyCount} 条 AI 回复
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

  /* 是否展示右侧 AI 总结面板 */
  const showSummaryPanel = summaryVisible && summaryRoundRef.current === currentRound

  /* 渲染单轮详情视图 */
  const renderDetailView = () => {
    if (!conversation) return null

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* 顶部栏：返回 + 轮次信息 + AI 总结按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {!initialTimestamp && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={() => setPageView('list')}
              size="small"
              style={{ padding: '2px 6px', fontSize: 12 }}
            >
              返回
            </Button>
          )}
          {round && (
            <>
              <Tag color="#D97757" style={{ fontSize: 11 }}>第 {currentRound + 1} 轮</Tag>
              {round.toolCalls > 0 && (
                <Tag icon={<ToolOutlined />} color="purple" style={{ fontSize: 10 }}>
                  {round.toolCalls} 次工具
                </Tag>
              )}
              <Tag style={{ fontSize: 10 }}>
                {round.assistantMessages.filter(m => m.role === 'assistant').length} 条回复
              </Tag>
              {round.tokens > 0 && (
                <Tag style={{ fontSize: 10 }}>{round.tokens.toLocaleString()} tokens</Tag>
              )}
            </>
          )}
          <Button
            type={showSummaryPanel ? 'default' : 'text'}
            size="small"
            icon={summarizing ? <LoadingOutlined /> : <StarOutlined />}
            loading={summarizing}
            onClick={() => {
              if (showSummaryPanel) {
                setSummaryVisible(false)
              } else if (summaryContent && summaryRoundRef.current === currentRound) {
                /* 已有总结，直接展开 */
                setSummaryVisible(true)
              } else {
                handleSummarizeRound()
              }
            }}
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: themeVars.primary,
              borderColor: showSummaryPanel ? themeVars.primary : undefined
            }}
          >
            AI 总结
          </Button>
        </div>

        {/* 左右布局：对话内容 | AI 总结面板 */}
        <div style={{ display: 'flex', gap: 12, minHeight: 0 }}>
          {/* 左侧：对话内容 */}
          <div style={{ flex: showSummaryPanel ? '0 0 58%' : '1 1 100%', minWidth: 0, transition: 'flex 0.25s ease' }}>
            {/* 视图切换 */}
            <div style={{ marginBottom: 10 }}>
              <Segmented
                size="small"
                value={viewMode}
                onChange={v => setViewMode(v as typeof viewMode)}
                options={[
                  { value: 'round', label: '对话', icon: <MessageOutlined /> },
                  { value: 'tool-flow', label: `工具 (${currentToolFlow.length})`, icon: <NodeIndexOutlined /> },
                  { value: 'file-changes', label: `变更文件 (${currentRoundChangedFiles.length})`, icon: <FileTextOutlined /> },
                  { value: 'images', label: `图片 (${allImages.length})`, icon: <PictureOutlined />, disabled: allImages.length === 0 },
                  { value: 'pastes', label: `粘贴 (${sessionPastes.length})`, icon: <FileTextOutlined />, disabled: sessionPastes.length === 0 }
                ]}
              />
            </div>

            {/* 内容区域 */}
            <div style={{ maxHeight: 480, overflow: 'auto' }}>
              {viewMode === 'round' && renderRoundContent()}
              {viewMode === 'tool-flow' && renderToolFlow(currentToolFlow)}
              {viewMode === 'file-changes' && renderRoundFileChanges()}
          {/* 图片资源视图（仅当前轮次的内联图片） */}
          {viewMode === 'images' && (
            <div>
              {allImages.length === 0 ? (
                <Empty description="当前 Prompt 没有图片" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Tag icon={<PictureOutlined />} color="#D97757">{allImages.length} 张图片</Tag>
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
                            background: themeVars.itemBg,
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
                        border: `1px solid ${themeVars.itemBorder}`,
                        background: themeVars.itemBg,
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 12px',
                        borderBottom: `1px solid ${themeVars.itemBorder}`,
                        background: themeVars.bgSection
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

          {/* 右侧：AI 总结面板 */}
          {showSummaryPanel && (
            <div style={{
              flex: '0 0 40%',
              minWidth: 0,
              borderLeft: `1px solid ${themeVars.borderSecondary}`,
              paddingLeft: 12,
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* 面板头部 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: `1px solid ${themeVars.borderSecondary}`
              }}>
                <Space size={4}>
                  <StarOutlined style={{ color: themeVars.primary, fontSize: 13 }} />
                  <Text strong style={{ fontSize: 13, color: themeVars.primary }}>AI 总结</Text>
                  {summarizing && (
                    <Tag color="processing" style={{ fontSize: 10 }}>生成中</Tag>
                  )}
                </Space>
                <Space size={2}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(summaryContent)}
                    style={{ fontSize: 10, color: themeVars.textTertiary }}
                  />
                  <Button
                    type="text"
                    size="small"
                    onClick={() => setSummaryVisible(false)}
                    style={{ fontSize: 10, color: themeVars.textTertiary }}
                  >
                    ✕
                  </Button>
                </Space>
              </div>
              {/* 面板内容（可滚动） */}
              <div style={{ flex: 1, overflow: 'auto', maxHeight: 480, fontSize: 13, lineHeight: 1.7 }}>
                {renderMarkdownContent(summaryContent)}
              </div>
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
      width={pageView === 'detail' && showSummaryPanel ? 1280 : 900}
      style={{ transition: 'width 0.25s ease' }}
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
          <Spin size="large" tip="加载中..."><div style={{ padding: 40 }} /></Spin>
        </div>
      )}

      {error && <Alert message="加载失败" description={error} type="error" showIcon closable />}

      {!loading && !error && conversation && (
        pageView === 'list' ? renderPromptList() : renderDetailView()
      )}

    </Modal>

    <Modal
      title={
        <Space>
          <FileTextOutlined style={{ color: themeVars.primary }} />
          <Text>文件快照</Text>
          <Text code style={{ fontSize: 11 }}>
            {previewFilePath}
          </Text>
        </Space>
      }
      open={filePreviewVisible}
      onCancel={() => {
        setFilePreviewVisible(false)
        setShowFileDiff(false)
        setFileDiffResult([])
        setFileDiffHasChanges(true)
        setIsNewFileSnapshot(false)
      }}
      width={900}
      footer={[
        ...(!isNewFileSnapshot ? [
          <Button
            key="diff"
            icon={<SwapOutlined />}
            type={showFileDiff ? 'primary' : 'default'}
            loading={fileDiffLoading}
            onClick={handleToggleFileDiff}
          >
            {showFileDiff ? '查看快照' : '对比差异'}
          </Button>
        ] : []),
        <Button
          key="restore"
          icon={<RollbackOutlined />}
          onClick={handleRestoreFileFromSnapshot}
          disabled={!previewMessageId || !previewFilePath}
        >
          恢复文件
        </Button>,
        <Button
          key="copy"
          icon={<CopyOutlined />}
          onClick={() => copyText(filePreviewContent)}
          disabled={!filePreviewContent}
        >
          复制内容
        </Button>,
        <Button key="close" type="primary" onClick={() => setFilePreviewVisible(false)}>
          关闭
        </Button>
      ]}
      styles={{
        body: {
          maxHeight: 'calc(100vh - 260px)',
          overflowY: 'auto'
        } as React.CSSProperties
      }}
    >
      {!filePreviewLoading && !fileDiffLoading && (
        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Space size={8}>
            {isNewFileSnapshot && (
              <Tag color="success" style={{ marginInlineEnd: 2 }}>新增文件</Tag>
            )}
            {isMarkdownFile && (
              <Segmented
                size="small"
                value={filePreviewMode}
                onChange={value => setFilePreviewMode(value as 'source' | 'preview')}
                options={[
                  { label: '预览', value: 'preview' },
                  { label: '源码', value: 'source' }
                ]}
              />
            )}
            {filePreviewMode === 'source' && (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>折行</Text>
                <Switch size="small" checked={filePreviewWrap} onChange={setFilePreviewWrap} />
              </>
            )}
          </Space>
        </div>
      )}

      {filePreviewLoading || fileDiffLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="加载中..."><div style={{ padding: 40 }} /></Spin>
        </div>
      ) : showFileDiff ? (
        <div
          style={{
            background: themeVars.bgCode,
            border: `1px solid ${themeVars.borderSecondary}`,
            borderRadius: 8,
            maxHeight: 500,
            overflow: 'auto',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 12
          }}
        >
          {!fileDiffHasChanges && (
            <div
              style={{
                margin: 8,
                padding: '6px 8px',
                borderRadius: 6,
                background: themeVars.errorLight,
                color: themeVars.error,
                border: `1px solid ${themeVars.errorBorder}`
              }}
            >
              无变更差异：当前文件与快照内容一致
            </div>
          )}
          {fileDiffResult.map((part, index) => {
            const color = part.added ? themeVars.diffAddBg : part.removed ? themeVars.diffRemoveBg : 'transparent'
            const textColor = part.added ? themeVars.diffAddText : part.removed ? themeVars.diffRemoveText : themeVars.diffNeutralText
            const prefix = part.added ? '+' : part.removed ? '-' : ' '
            return (
              <pre
                key={index}
                style={{
                  margin: 0,
                  padding: '0 8px',
                  whiteSpace: filePreviewWrap ? 'pre-wrap' : 'pre',
                  wordBreak: filePreviewWrap ? 'break-word' : 'normal',
                  background: color,
                  color: textColor,
                  borderLeft: part.added
                    ? `3px solid ${themeVars.diffAddBorder}`
                    : part.removed
                      ? `3px solid ${themeVars.diffRemoveBorder}`
                      : '3px solid transparent'
                }}
              >
                {part.value
                  .split('\n')
                  .filter((l, i, arr) => i < arr.length - 1 || l !== '')
                  .map(line => `${prefix} ${line}`)
                  .join('\n')}
              </pre>
            )
          })}
        </div>
      ) : (
        filePreviewMode === 'preview' && isMarkdownFile ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 8,
              border: `1px solid ${themeVars.borderSecondary}`,
              background: themeVars.bgContainer,
              maxHeight: 500,
              overflow: 'auto'
            }}
          >
            {filePreviewContent.trim()
              ? renderMarkdownContent(filePreviewContent)
              : <Text type="secondary">Markdown 内容为空</Text>}
          </div>
        ) : (
          <div
            style={{
              borderRadius: 8,
              border: `1px solid ${themeVars.borderSecondary}`,
              overflow: 'hidden'
            }}
          >
            <Editor
              height="500px"
              language={getMonacoLanguage(previewFilePath, filePreviewContent)}
              value={filePreviewContent || '// 文件内容为空'}
              theme={isDark ? 'vs-dark' : 'light'}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: filePreviewWrap ? 'on' : 'off',
                wrappingIndent: 'indent',
                automaticLayout: true,
                domReadOnly: true,
                renderLineHighlight: 'none',
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8
                }
              }}
            />
          </div>
        )
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

    {/* 图片右键菜单 */}
    <ImageContextMenu
      visible={ctxMenu.visible}
      x={ctxMenu.x}
      y={ctxMenu.y}
      darkMode={isDark}
      imageDataUrl={ctxMenu.dataUrl}
      onClose={() => setCtxMenu(prev => ({ ...prev, visible: false }))}
    />
  </>
  )
}

export default ConversationDetailModal
