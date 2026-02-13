import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Button,
  Empty,
  Space,
  Typography,
  Tag,
  Card,
  message,
  Modal,
  Tooltip,
  Input,
  Image
} from 'antd'
import {
  CopyOutlined,
  FolderOpenOutlined,
  DownOutlined,
  UpOutlined,
  StarOutlined,
  ClearOutlined,
  FileImageOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  CloseOutlined,
  RightOutlined,
  PictureOutlined
} from '@ant-design/icons'
import Highlighter from 'react-highlight-words'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ClaudeRecord } from '../types'
import { getThemeVars } from '../theme'
import ElectronModal, { getElectronModalConfig } from './ElectronModal'
import ConversationDetailModal from './ConversationDetailModal'
import { getCopyablePreviewConfig } from './CopyableImage'
import ImageContextMenu from './ImageContextMenu'

const { Text } = Typography

/* 图片缩略图组件：异步加载图片并转换为 dataUrl，支持右键复制 */
interface ImageThumbnailProps {
  imagePath: string
  index: number
  darkMode: boolean
  imageCache: Map<string, string>
  onCacheUpdate: (path: string, data: string) => void
}

const ImageThumbnail = (props: ImageThumbnailProps) => {
  const { imagePath, index, darkMode, imageCache, onCacheUpdate } = props
  const themeVars = getThemeVars(darkMode)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  /* 右键菜单状态 */
  const [ctxMenu, setCtxMenu] = useState<{
    visible: boolean
    x: number
    y: number
    dataUrl: string
  }>({ visible: false, x: 0, y: 0, dataUrl: '' })

  useEffect(() => {
    /* 检查缓存 */
    if (imageCache.has(imagePath)) {
      setDataUrl(imageCache.get(imagePath)!)
      setLoading(false)
      return
    }

    let mounted = true

    const loadImage = async () => {
      try {
        const result = await window.electronAPI.readImage(imagePath)
        if (mounted) {
          if (result.success && result.data) {
            setDataUrl(result.data)
            onCacheUpdate(imagePath, result.data)
          } else {
            setError(true)
          }
          setLoading(false)
        }
      } catch {
        if (mounted) {
          setError(true)
          setLoading(false)
        }
      }
    }

    loadImage()
    return () => {
      mounted = false
    }
  }, [imagePath, imageCache, onCacheUpdate])

  /* 图片右键菜单处理 */
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!dataUrl) return
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, dataUrl })
  }

  if (loading) {
    return (
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 6,
          border: `1px solid ${themeVars.border}`,
          background: themeVars.bgSection,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <FileImageOutlined style={{ fontSize: 20, color: themeVars.textTertiary }} />
      </div>
    )
  }

  if (error || !dataUrl) {
    return (
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 6,
          border: `1px solid ${themeVars.border}`,
          background: themeVars.bgSection,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <FileImageOutlined style={{ fontSize: 20, color: themeVars.textTertiary, opacity: 0.5 }} />
      </div>
    )
  }

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <Image
          src={dataUrl}
          alt={`Image #${index + 1}`}
          width={60}
          height={60}
          style={{
            objectFit: 'cover',
            borderRadius: 6,
            border: `1px solid ${themeVars.border}`,
            cursor: 'pointer'
          }}
          preview={{ src: dataUrl }}
        />
      </div>

      {/* 右键菜单 */}
      <ImageContextMenu
        visible={ctxMenu.visible}
        x={ctxMenu.x}
        y={ctxMenu.y}
        darkMode={darkMode}
        imageDataUrl={ctxMenu.dataUrl}
        onClose={() => setCtxMenu(prev => ({ ...prev, visible: false }))}
      />
    </>
  )
}

interface LogViewerProps {
  records: ClaudeRecord[]
  onClear: () => void
  onOpenSettings?: () => void
  darkMode: boolean
  onSendToChat?: (content: string) => void
}

interface GroupedRecord {
  sessionId: string
  project: string
  records: ClaudeRecord[]
  latestTimestamp: number
}

const LogViewer = (props: LogViewerProps) => {
  const { records, onClear, onOpenSettings, darkMode } = props
  const themeVars = getThemeVars(darkMode)

  // 每个 session 的展开/折叠状态
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())

  // AI 总结相关状态
  const [summarizing, setSummarizing] = useState(false)
  const [summaryContent, setSummaryContent] = useState<string>('')
  const [summaryModalVisible, setSummaryModalVisible] = useState(false)

  // 完整对话弹窗状态
  const [conversationModalVisible, setConversationModalVisible] = useState(false)
  const [conversationSessionId, setConversationSessionId] = useState('')
  const [conversationProject, setConversationProject] = useState('')
  const [conversationTimestamp, setConversationTimestamp] = useState<number | undefined>(undefined)
  const [inlineImagePreviewVisible, setInlineImagePreviewVisible] = useState(false)
  const [inlineImagePreviewSrc, setInlineImagePreviewSrc] = useState('')

  // 搜索相关状态
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const searchInputRef = useRef<any>(null)

  // 图片缓存（避免重复加载）
  const [imageCache] = useState<Map<string, string>>(() => new Map())
  const handleImageCacheUpdate = useCallback(
    (path: string, data: string) => {
      imageCache.set(path, data)
    },
    [imageCache]
  )

  // 监听 Cmd+F 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (conversationModalVisible) return

      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSummaryModalVisible(false)
        setSearchVisible(true)
        setTimeout(() => searchInputRef.current?.focus(), 100)
      }
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false)
        setSearchKeyword('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchVisible, conversationModalVisible])

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchKeyword])

  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId)
    } else {
      newExpanded.add(sessionId)
    }
    setExpandedSessions(newExpanded)
  }

  // 按 sessionId 分组记录
  const groupedRecords = useMemo(() => {
    const groups = new Map<string, GroupedRecord>()

    records.forEach(record => {
      const key = record.sessionId || `single-${record.timestamp}`

      if (!groups.has(key)) {
        groups.set(key, {
          sessionId: key,
          project: record.project,
          records: [],
          latestTimestamp: record.timestamp
        })
      }

      const group = groups.get(key)!
      group.records.push(record)
      group.latestTimestamp = Math.max(group.latestTimestamp, record.timestamp)
    })

    return Array.from(groups.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp)
  }, [records])

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatTimeShort = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const getProjectName = (projectPath: string) => {
    if (!projectPath) return '未知项目'
    const parts = projectPath.split('/')
    return parts[parts.length - 1]
  }

  const handleCopy = async (text: string) => {
    try {
      await window.electronAPI.copyToClipboard(text)
      message.success('已复制到剪贴板')
    } catch {
      message.error('复制失败')
    }
  }

  const handleOpenFolder = async (folderPath: string) => {
    try {
      await window.electronAPI.openInFinder(folderPath)
    } catch {
      message.error('打开文件夹失败')
    }
  }

  /**
   * 将文本中的 [Image #N] 标记替换为带图标的 Tag
   */
  const handleInlineImageTagClick = async (
    e: React.MouseEvent,
    record: ClaudeRecord,
    imageNumber: number
  ) => {
    e.stopPropagation()

    const targetPath = record.images?.[imageNumber - 1]
    if (!targetPath) {
      message.warning(`未找到图片 #${imageNumber}`)
      return
    }

    try {
      let src = imageCache.get(targetPath)
      if (!src) {
        const result = await window.electronAPI.readImage(targetPath)
        if (!result.success || !result.data) {
          message.error(`图片加载失败: ${result.error || '未知错误'}`)
          return
        }
        src = result.data
        handleImageCacheUpdate(targetPath, src)
      }
      setInlineImagePreviewSrc(src)
      setInlineImagePreviewVisible(true)
    } catch {
      message.error('图片加载失败')
    }
  }

  const renderTextWithImageTags = (text: string, record: ClaudeRecord) => {
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

          return (
            <Tag
              key={idx}
              icon={<PictureOutlined />}
              color="#D97757"
              style={{ fontSize: 11, margin: '0 2px', cursor: 'pointer' }}
              onClick={e => void handleInlineImageTagClick(e, record, part.imageNum || 1)}
            >
              {part.value}
            </Tag>
          )
        })}
      </>
    )
  }

  // 搜索 Prompt 内容
  const searchResults = useMemo(() => {
    if (!debouncedKeyword.trim()) return []
    const keyword = debouncedKeyword.toLowerCase()
    const results: Array<{
      record: ClaudeRecord
      sessionId: string
      project: string
      matchText: string
    }> = []

    records.forEach(record => {
      const content = record.display?.toLowerCase() || ''
      if (content.includes(keyword)) {
        const index = content.indexOf(keyword)
        const start = Math.max(0, index - 40)
        const end = Math.min(content.length, index + keyword.length + 60)
        let matchText = record.display?.substring(start, end) || ''
        if (start > 0) matchText = '...' + matchText
        if (end < content.length) matchText = matchText + '...'

        results.push({
          record,
          sessionId: record.sessionId || `single-${record.timestamp}`,
          project: record.project,
          matchText
        })
      }
    })

    return results
  }, [records, debouncedKeyword])

  /* 点击搜索结果 → 打开完整对话弹窗 */
  const handleViewSearchResult = (result: {
    record: ClaudeRecord
    sessionId: string
    project: string
  }) => {
    setConversationSessionId(result.sessionId)
    setConversationProject(result.project)
    setConversationTimestamp(result.record.timestamp)
    setConversationModalVisible(true)
    setSearchVisible(false)
    setSearchKeyword('')
  }

  /* 点击 Prompt 条目 → 打开完整对话弹窗 */
  const handlePromptClick = (record: ClaudeRecord, group: GroupedRecord) => {
    if (group.sessionId.startsWith('single-')) return
    setConversationSessionId(group.sessionId)
    setConversationProject(group.project)
    setConversationTimestamp(record.timestamp)
    setConversationModalVisible(true)
  }

  // AI 总结单个会话
  const handleSummarizeSession = async (session: GroupedRecord) => {
    if (session.records.length === 0) {
      message.warning('该会话没有对话记录')
      return
    }

    setSummarizing(true)

    try {
      const settings = await window.electronAPI.getAppSettings()

      if (!settings.aiSummary.enabled) {
        Modal.confirm({
          title: '启用 AI 总结功能',
          content: 'AI 总结功能尚未启用，是否前往设置？',
          okText: '去设置',
          cancelText: '取消',
          onOk: () => onOpenSettings?.(),
          ...getElectronModalConfig()
        })
        setSummarizing(false)
        return
      }

      const currentProvider = settings.aiSummary.providers[settings.aiSummary.provider]
      if (!currentProvider || !currentProvider.apiKey) {
        Modal.confirm({
          title: '配置 API Key',
          content: '尚未配置 API Key，是否前往设置？',
          okText: '去设置',
          cancelText: '取消',
          onOk: () => onOpenSettings?.(),
          ...getElectronModalConfig()
        })
        setSummarizing(false)
        return
      }

      setSummaryContent('正在生成总结...')
      setSummaryModalVisible(true)

      let fullSummary = ''

      await window.electronAPI.summarizeRecordsStream(
        { records: session.records, type: 'detailed' },
        (chunk: string) => {
          fullSummary += chunk
          setSummaryContent(fullSummary)
        },
        () => {
          setSummarizing(false)
        },
        (error: string) => {
          setSummarizing(false)
          setSummaryModalVisible(false)

          if (error.includes('余额不足') || error.includes('402')) {
            Modal.error({
              title: 'AI 总结失败',
              content: (
                <div>
                  <p>{error}</p>
                  <p style={{ marginTop: 8, fontSize: 12, color: themeVars.textTertiary }}>
                    提示：你可以前往相应平台充值后继续使用
                  </p>
                </div>
              ),
              okText: '我知道了',
              ...getElectronModalConfig()
            })
          } else if (error.includes('API Key')) {
            Modal.error({
              title: 'AI 总结失败',
              content: (
                <div>
                  <p>{error}</p>
                  <p style={{ marginTop: 8, fontSize: 12, color: themeVars.textTertiary }}>
                    提示：请前往设置页面重新配置 API Key
                  </p>
                </div>
              ),
              okText: '前往设置',
              onOk: () => onOpenSettings?.(),
              ...getElectronModalConfig()
            })
          } else {
            message.error(`总结失败: ${error}`, 5)
          }
        }
      )
    } catch (error: any) {
      setSummarizing(false)
      message.error(`总结失败: ${error.message || '未知错误'}`, 5)
    }
  }

  const handleCopySummary = async () => {
    try {
      await window.electronAPI.copyToClipboard(summaryContent)
      message.success('已复制到剪贴板')
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: themeVars.bgContainer
      }}
    >
      {/* 操作栏 */}
      <div
        style={
          {
            padding: '16px',
            borderBottom: `1px solid ${themeVars.borderSecondary}`,
            background: themeVars.bgSection,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            WebkitAppRegion: 'drag'
          } as React.CSSProperties
        }
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          共 {groupedRecords.length} 个会话，{records.length} 条记录
        </Text>
        <Space style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Tooltip title="搜索 Prompt (Cmd+F / Ctrl+F)">
            <Button
              icon={<SearchOutlined />}
              onClick={() => {
                setSummaryModalVisible(false)
                setSearchVisible(true)
                setTimeout(() => searchInputRef.current?.focus(), 100)
              }}
              size="small"
            />
          </Tooltip>
          <Button
            icon={<ClearOutlined />}
            onClick={onClear}
            disabled={records.length === 0}
            size="small"
          >
            清空
          </Button>
        </Space>
      </div>

      {/* 内容区域 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          minHeight: 0
        }}
      >
        {groupedRecords.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <div style={{ fontSize: 16, marginBottom: 8 }}>等待新的对话记录...</div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  在任意目录使用 Claude Code 提问即可看到记录
                </Text>
              </div>
            }
            style={{ marginTop: 100 }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groupedRecords.map(group => {
              const isExpanded = expandedSessions.has(group.sessionId)
              const showCollapse = group.records.length > 3
              const displayRecords =
                isExpanded || !showCollapse ? group.records : group.records.slice(0, 3)

              return (
                <Card
                  key={group.sessionId}
                  size="small"
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FolderOpenOutlined style={{ fontSize: 14, color: themeVars.primary }} />
                      <Text strong style={{ fontSize: 14 }}>
                        {getProjectName(group.project)}
                      </Text>
                      {group.sessionId && !group.sessionId.startsWith('single-') && (
                        <Text code style={{ fontSize: 11, color: themeVars.textTertiary }}>
                          #{group.sessionId.slice(0, 8)}
                        </Text>
                      )}
                      <Tag color="default" style={{ fontSize: 11 }}>
                        {group.records.length}条
                      </Tag>
                    </div>
                  }
                  extra={
                    <Space size="small">
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatTime(group.latestTimestamp)}
                      </Text>
                      <Tooltip title="打开文件夹">
                        <Button
                          type="text"
                          size="small"
                          icon={<FolderOpenOutlined />}
                          onClick={() => handleOpenFolder(group.project)}
                        />
                      </Tooltip>
                      <Tooltip title="AI 总结此会话">
                        <Button
                          type="text"
                          size="small"
                          icon={<StarOutlined />}
                          loading={summarizing}
                          onClick={() => handleSummarizeSession(group)}
                        />
                      </Tooltip>
                    </Space>
                  }
                  styles={{ body: { padding: 12 } }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {displayRecords.map((record, recordIndex) => {
                      const hasImages = record.images && record.images.length > 0
                      const hasCopyText =
                        record.pastedContents && Object.keys(record.pastedContents).length > 0
                      const isClickable = !group.sessionId.startsWith('single-')

                      return (
                        <div
                          key={recordIndex}
                          style={{
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: `1px solid ${themeVars.itemBorder}`,
                            background: themeVars.itemBg,
                            cursor: isClickable ? 'pointer' : 'default',
                            transition: 'all 0.2s'
                          }}
                          onClick={() => isClickable && handlePromptClick(record, group)}
                          onMouseEnter={e => {
                            if (!isClickable) return
                            ;(e.currentTarget as HTMLDivElement).style.borderColor =
                              themeVars.itemHoverBorder
                            ;(e.currentTarget as HTMLDivElement).style.background =
                              themeVars.itemHoverBg
                          }}
                          onMouseLeave={e => {
                            if (!isClickable) return
                            ;(e.currentTarget as HTMLDivElement).style.borderColor =
                              themeVars.itemBorder
                            ;(e.currentTarget as HTMLDivElement).style.background = themeVars.itemBg
                          }}
                        >
                          {/* 头部：轮次编号 + 时间 + 资源标签 */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              marginBottom: 6
                            }}
                          >
                            <Tag color="#D97757" style={{ fontSize: 11 }}>
                              第 {recordIndex + (isExpanded || !showCollapse ? 1 : 1)} 轮
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              <ClockCircleOutlined style={{ marginRight: 4 }} />
                              {formatTime(record.timestamp)}
                            </Text>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                              {hasImages && (
                                <Tag style={{ fontSize: 10 }}>
                                  <FileImageOutlined style={{ marginRight: 2 }} />
                                  {record.images!.length} 张图片
                                </Tag>
                              )}
                              {hasCopyText && (
                                <Tag style={{ fontSize: 10 }}>
                                  <FileTextOutlined style={{ marginRight: 2 }} />
                                  {Object.keys(record.pastedContents!).length} 个 Copy Text
                                </Tag>
                              )}
                            </div>
                          </div>

                          {/* 图片缩略图预览列表（在 Prompt 文本上方） */}
                          {hasImages && (
                            <div
                              style={{
                                marginBottom: 10,
                                display: 'flex',
                                gap: 8,
                                flexWrap: 'wrap'
                              }}
                              onClick={e => e.stopPropagation()}
                            >
                              <Image.PreviewGroup preview={getCopyablePreviewConfig(darkMode)}>
                                {record.images!.map((imgPath, imgIndex) => (
                                  <ImageThumbnail
                                    key={imgIndex}
                                    imagePath={imgPath}
                                    index={imgIndex}
                                    darkMode={darkMode}
                                    imageCache={imageCache}
                                    onCacheUpdate={handleImageCacheUpdate}
                                  />
                                ))}
                              </Image.PreviewGroup>
                            </div>
                          )}

                          {/* Prompt 文本预览 */}
                          <div
                            style={{
                              fontSize: 13,
                              lineHeight: '22px',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}
                          >
                            {record.display ? renderTextWithImageTags(record.display, record) : '(空消息)'}
                          </div>

                          {/* 底部：AI 回复提示 + 查看完整对话 / 复制 */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginTop: 6
                            }}
                          >
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              1 条 AI 回复
                            </Text>
                            <Space size={8}>
                              {isClickable && (
                                <Text type="secondary" style={{ fontSize: 11, cursor: 'pointer' }}>
                                  点击查看完整对话 <RightOutlined style={{ fontSize: 10 }} />
                                </Text>
                              )}
                              <Tooltip title="复制 Prompt">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CopyOutlined />}
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleCopy(record.display || '')
                                  }}
                                  style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                                >
                                  复制
                                </Button>
                              </Tooltip>
                            </Space>
                          </div>
                        </div>
                      )
                    })}

                    {/* 展开/收起按钮 */}
                    {showCollapse && (
                      <Button
                        type="link"
                        size="small"
                        icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                        onClick={() => toggleSession(group.sessionId)}
                        style={{ padding: 0, fontSize: 12 }}
                      >
                        {isExpanded ? '收起' : `展开剩余 ${group.records.length - 3} 条`}
                      </Button>
                    )}

                    {/* Session 底部路径 */}
                    <div
                      style={{
                        padding: '8px 12px',
                        background: themeVars.codeBg,
                        borderRadius: 4,
                        fontSize: 11,
                        color: themeVars.textTertiary,
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        wordBreak: 'break-all'
                      }}
                      onClick={() => handleOpenFolder(group.project)}
                    >
                      {group.project}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* AI 总结结果弹窗 */}
      <ElectronModal
        title={
          <Space>
            <StarOutlined style={{ color: themeVars.primary }} />
            <Text>当前对话 AI 总结</Text>
          </Space>
        }
        open={summaryModalVisible}
        onCancel={() => setSummaryModalVisible(false)}
        width="60%"
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopySummary}>
            复制总结
          </Button>,
          <Button key="close" type="primary" onClick={() => setSummaryModalVisible(false)}>
            关闭
          </Button>
        ]}
        style={{ top: 60 }}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 260px)',
            overflowY: 'auto'
          } as React.CSSProperties
        }}
      >
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...codeProps }: any) {
                const match = /language-(\w+)/.exec(className || '')
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={darkMode ? vscDarkPlus : prism}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: 6,
                      fontSize: 13,
                      background: themeVars.bgCode
                    }}
                    {...codeProps}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code
                    style={{
                      background: themeVars.codeBg,
                      padding: '2px 6px',
                      borderRadius: 3,
                      fontSize: 12,
                      fontFamily: 'monospace'
                    }}
                    {...codeProps}
                  >
                    {children}
                  </code>
                )
              },
              p({ children }) {
                return <p style={{ marginBottom: 8, lineHeight: 1.6 }}>{children}</p>
              },
              pre({ children }) {
                return <>{children}</>
              }
            }}
          >
            {summaryContent}
          </ReactMarkdown>
        </div>
      </ElectronModal>

      {/* 完整对话弹窗（按轮次浏览，自动定位到对应 Prompt） */}
      <ConversationDetailModal
        visible={conversationModalVisible}
        sessionId={conversationSessionId}
        project={conversationProject}
        initialTimestamp={conversationTimestamp}
        onClose={() => setConversationModalVisible(false)}
      />

      {inlineImagePreviewSrc && (
        <Image
          src={inlineImagePreviewSrc}
          alt="inline-image-preview"
          style={{ display: 'none' }}
          preview={{
            ...getCopyablePreviewConfig(darkMode),
            visible: inlineImagePreviewVisible,
            onVisibleChange: visible => {
              setInlineImagePreviewVisible(visible)
              if (!visible) {
                setInlineImagePreviewSrc('')
              }
            }
          }}
        />
      )}

      {/* 搜索弹窗 */}
      <ElectronModal
        open={searchVisible}
        onCancel={() => {
          setSearchVisible(false)
          setSearchKeyword('')
        }}
        footer={null}
        closable={false}
        width={640}
        style={{ top: '15%' }}
        styles={{
          body: {
            padding: 0
          } as React.CSSProperties
        }}
      >
        <div style={{ padding: '16px 20px' }}>
          <div style={{ marginBottom: 16 }}>
            <Input
              ref={searchInputRef}
              size="large"
              placeholder="搜索 Prompt 内容..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              prefix={<SearchOutlined style={{ fontSize: 18, color: themeVars.textSecondary }} />}
              suffix={
                searchKeyword && (
                  <CloseOutlined
                    style={{ fontSize: 14, color: themeVars.textTertiary, cursor: 'pointer' }}
                    onClick={() => setSearchKeyword('')}
                  />
                )
              }
              style={{ borderRadius: 8, fontSize: 15 }}
            />
          </div>

          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            {!searchKeyword ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '30px 20px',
                  color: themeVars.textTertiary
                }}
              >
                <SearchOutlined style={{ fontSize: 36, marginBottom: 8, opacity: 0.25 }} />
                <div style={{ fontSize: 13, marginBottom: 4 }}>输入关键词搜索 Prompt 内容</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>提示：按 ESC 关闭搜索</div>
              </div>
            ) : searchResults.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未找到匹配的 Prompt"
                style={{ padding: '30px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    onClick={() => handleViewSearchResult(result)}
                    style={{
                      padding: '12px 16px',
                      background: themeVars.bgSection,
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: `1px solid ${themeVars.borderSecondary}`,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = themeVars.bgElevated
                      e.currentTarget.style.borderColor = themeVars.primary
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = themeVars.bgSection
                      e.currentTarget.style.borderColor = themeVars.borderSecondary
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        color: themeVars.textSecondary,
                        marginBottom: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <ClockCircleOutlined style={{ fontSize: 11 }} />
                      {formatTimeShort(result.record.timestamp)}
                      <span style={{ opacity: 0.5 }}>·</span>
                      <FolderOpenOutlined style={{ fontSize: 11 }} />
                      {getProjectName(result.project)}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: themeVars.text,
                        lineHeight: 1.6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}
                    >
                      <Highlighter
                        searchWords={[debouncedKeyword]}
                        autoEscape={true}
                        textToHighlight={result.matchText}
                        highlightStyle={{
                          backgroundColor: themeVars.primary,
                          color: themeVars.highlightText,
                          padding: '2px 4px',
                          borderRadius: 2
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: themeVars.bgElevated,
                borderRadius: 6,
                fontSize: 12,
                color: themeVars.textTertiary,
                textAlign: 'center'
              }}
            >
              找到 {searchResults.length} 条匹配结果
            </div>
          )}
        </div>
      </ElectronModal>
    </div>
  )
}

export default LogViewer
