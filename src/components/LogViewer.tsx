import { useState, useMemo, useEffect, useRef } from 'react'
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
  List
} from 'antd'
import {
  CopyOutlined,
  FolderOpenOutlined,
  StarOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  CloseOutlined,
  CommentOutlined
} from '@ant-design/icons'
import Highlighter from 'react-highlight-words'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ClaudeRecord } from '../types'
import { getThemeVars } from '../theme'
import ElectronModal, { getElectronModalConfig } from './ElectronModal'
import ConversationDetailModal from './ConversationDetailModal'

const { Text } = Typography

interface LogViewerProps {
  records: ClaudeRecord[]
  onClear: () => void
  onOpenSettings?: () => void
  darkMode: boolean
  onSendToChat?: (content: string) => void
}

interface GroupedSession {
  sessionId: string
  project: string
  records: ClaudeRecord[]
  latestTimestamp: number
  firstPrompt: string
  recordCount: number
}

const LogViewer = (props: LogViewerProps) => {
  const { records, onClear, onOpenSettings, darkMode } = props
  const themeVars = getThemeVars(darkMode)

  // AI 总结相关状态
  const [summarizing, setSummarizing] = useState(false)
  const [summaryContent, setSummaryContent] = useState<string>('')
  const [summaryModalVisible, setSummaryModalVisible] = useState(false)

  // 完整对话弹窗状态
  const [conversationModalVisible, setConversationModalVisible] = useState(false)
  const [conversationSessionId, setConversationSessionId] = useState('')
  const [conversationProject, setConversationProject] = useState('')

  // 搜索相关状态
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const searchInputRef = useRef<any>(null)

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

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()

    if (isToday) {
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getProjectName = (projectPath: string) => {
    if (!projectPath) return '未知项目'
    const parts = projectPath.split('/')
    return parts[parts.length - 1]
  }

  const truncateText = (text: string, maxLength: number = 80) => {
    if (!text) return ''
    /* 去除换行，合并为单行 */
    const singleLine = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    if (singleLine.length <= maxLength) return singleLine
    return singleLine.substring(0, maxLength) + '...'
  }

  // 按 sessionId 分组记录为会话
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, GroupedSession>()

    records.forEach(record => {
      const key = record.sessionId || `single-${record.timestamp}`

      if (!groups.has(key)) {
        groups.set(key, {
          sessionId: key,
          project: record.project,
          records: [],
          latestTimestamp: record.timestamp,
          firstPrompt: record.display || '',
          recordCount: 0
        })
      }

      const group = groups.get(key)!
      group.records.push(record)
      group.recordCount += 1
      group.latestTimestamp = Math.max(group.latestTimestamp, record.timestamp)
      // 第一条用户提问作为首条 prompt
      if (!group.firstPrompt && record.display) {
        group.firstPrompt = record.display
      }
    })

    return Array.from(groups.values()).sort((a, b) => b.latestTimestamp - a.latestTimestamp)
  }, [records])

  // 搜索过滤
  const filteredSessions = useMemo(() => {
    if (!debouncedKeyword.trim()) return groupedSessions
    const keyword = debouncedKeyword.toLowerCase()
    return groupedSessions.filter(session => {
      // 项目名或 sessionId 匹配
      if (session.project.toLowerCase().includes(keyword)) return true
      if (session.sessionId.toLowerCase().includes(keyword)) return true
      // prompt 内容匹配
      return session.records.some(r => r.display?.toLowerCase().includes(keyword))
    })
  }, [groupedSessions, debouncedKeyword])

  // 搜索 Prompt 内容匹配结果
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

    return results.slice(0, 20)
  }, [records, debouncedKeyword])

  const handleOpenFolder = async (folderPath: string) => {
    try {
      await window.electronAPI.openInFinder(folderPath)
    } catch {
      message.error('打开文件夹失败')
    }
  }

  /* 点击会话卡片 → 打开完整对话弹窗 */
  const handleSessionClick = (session: GroupedSession) => {
    setConversationSessionId(session.sessionId)
    setConversationProject(session.project)
    setConversationModalVisible(true)
  }

  // AI 总结单个会话
  const handleSummarizeSession = async (session: GroupedSession) => {
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

  const renderMarkdown = (content: string) => (
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
      {content}
    </ReactMarkdown>
  )

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
            padding: '12px 16px',
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
          共 {filteredSessions.length} 个会话，{records.length} 条记录
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
          padding: '16px 24px',
          minHeight: 0
        }}
      >
        {filteredSessions.length === 0 ? (
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
          <List
            grid={{ gutter: 16, column: 2 }}
            dataSource={filteredSessions}
            renderItem={session => (
              <List.Item style={{ marginBottom: 8 }}>
                <Card
                  hoverable
                  size="small"
                  onClick={() => handleSessionClick(session)}
                  title={
                    <Space>
                      <Tag color="blue">{getProjectName(session.project)}</Tag>
                      {session.sessionId && !session.sessionId.startsWith('single-') && (
                        <Text code style={{ fontSize: 11 }}>
                          {session.sessionId.slice(0, 8)}
                        </Text>
                      )}
                    </Space>
                  }
                  extra={<ClockCircleOutlined style={{ color: themeVars.textTertiary }} />}
                  actions={[
                    <Tooltip key="summarize" title="AI 总结">
                      <Button
                        type="text"
                        size="small"
                        icon={<StarOutlined />}
                        loading={summarizing}
                        onClick={e => {
                          e.stopPropagation()
                          handleSummarizeSession(session)
                        }}
                      >
                        AI 总结
                      </Button>
                    </Tooltip>,
                    <Tooltip key="folder" title="打开项目文件夹">
                      <Button
                        type="text"
                        size="small"
                        icon={<FolderOpenOutlined />}
                        onClick={e => {
                          e.stopPropagation()
                          handleOpenFolder(session.project)
                        }}
                      >
                        打开
                      </Button>
                    </Tooltip>
                  ]}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    {/* 时间和记录数 */}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatTime(session.latestTimestamp)}
                    </Text>
                    <Space wrap size={4}>
                      <Tag style={{ fontSize: 11 }}>
                        <CommentOutlined style={{ marginRight: 4 }} />
                        {session.recordCount} 轮对话
                      </Tag>
                    </Space>

                    {/* 首条 Prompt 预览 */}
                    {session.firstPrompt && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: themeVars.textSecondary,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: '18px'
                        }}
                      >
                        {truncateText(session.firstPrompt, 120)}
                      </Text>
                    )}

                    {/* 项目路径 */}
                    <Text
                      code
                      style={{
                        fontSize: 11,
                        cursor: 'pointer',
                        color: themeVars.textTertiary
                      }}
                      onClick={e => {
                        e.stopPropagation()
                        handleOpenFolder(session.project)
                      }}
                    >
                      {truncateText(session.project, 40)}
                    </Text>
                  </Space>
                </Card>
              </List.Item>
            )}
          />
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
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>{renderMarkdown(summaryContent)}</div>
      </ElectronModal>

      {/* 完整对话弹窗（按轮次浏览） */}
      <ConversationDetailModal
        visible={conversationModalVisible}
        sessionId={conversationSessionId}
        project={conversationProject}
        onClose={() => setConversationModalVisible(false)}
      />

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
          {/* 搜索输入框 */}
          <div style={{ marginBottom: 16 }}>
            <Input
              ref={searchInputRef}
              size="large"
              placeholder="搜索 Prompt 内容、项目名称..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              prefix={
                <SearchOutlined style={{ fontSize: 18, color: themeVars.textSecondary }} />
              }
              suffix={
                searchKeyword && (
                  <CloseOutlined
                    style={{ fontSize: 14, color: themeVars.textTertiary, cursor: 'pointer' }}
                    onClick={() => setSearchKeyword('')}
                  />
                )
              }
              style={{
                borderRadius: 8,
                fontSize: 15
              }}
            />
          </div>

          {/* 搜索结果 */}
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
                    onClick={() => {
                      setSearchVisible(false)
                      setSearchKeyword('')
                      if (result.sessionId) {
                        setConversationSessionId(result.sessionId)
                        setConversationProject(result.project)
                        setConversationModalVisible(true)
                      }
                    }}
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
                      <Tag color="blue" style={{ fontSize: 10 }}>
                        {getProjectName(result.project)}
                      </Tag>
                      <ClockCircleOutlined style={{ fontSize: 11 }} />
                      {formatTime(result.record.timestamp)}
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

          {/* 底部匹配统计 */}
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
              {filteredSessions.length > 0 &&
                `，涉及 ${filteredSessions.length} 个会话`}
            </div>
          )}
        </div>
      </ElectronModal>
    </div>
  )
}

export default LogViewer
