import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Button,
  Card,
  Tag,
  Space,
  Typography,
  Empty,
  Spin,
  DatePicker,
  message,
  List,
  Modal,
  Pagination,
  Input,
  Tooltip,
  Collapse
} from 'antd'
import {
  FolderOpenOutlined,
  CopyOutlined,
  SearchOutlined,
  StarOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  ExportOutlined,
  CloseOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  BarChartOutlined,
  DollarOutlined,
  SwapOutlined,
  CheckOutlined
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ElectronModal, { getElectronModalConfig } from './ElectronModal'
import { SessionMetadata } from '../types'
import dayjs, { Dayjs } from 'dayjs'
import 'dayjs/locale/zh-cn'
import { getThemeVars } from '../theme'
import ConversationDetailModal from './ConversationDetailModal'

// 设置 dayjs 中文语言
dayjs.locale('zh-cn')

const { Text } = Typography
const { RangePicker } = DatePicker

interface HistoryViewerProps {
  onOpenSettings?: () => void
  darkMode: boolean
  onSendToChat?: (content: string) => void
}

interface GroupedRecord {
  sessionId: string
  project: string
  latestTimestamp: number
  recordCount: number
  total_tokens?: number
  total_cost_usd?: number
  has_tool_use?: boolean
  has_errors?: boolean
  tool_use_count?: number
  tool_usage?: Record<string, number>
}

type DateRange = 'all' | '1d' | '7d' | '30d' | 'custom'

const HistoryViewer = (props: HistoryViewerProps) => {
  const { onOpenSettings, darkMode } = props

  const [sessions, setSessions] = useState<SessionMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [customDateRange, setCustomDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const searchInputRef = useRef<any>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const themeVars = getThemeVars(darkMode)

  // 分页
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 完整对话弹窗（按轮次浏览）
  const [conversationModalVisible, setConversationModalVisible] = useState(false)
  const [conversationSessionId, setConversationSessionId] = useState('')
  const [conversationProject, setConversationProject] = useState('')
  const [conversationTimestamp, setConversationTimestamp] = useState<number | undefined>(undefined)

  // AI 总结
  const [summarizing, setSummarizing] = useState(false)
  const [summaryContent, setSummaryContent] = useState<string>('')
  const [summaryModalVisible, setSummaryModalVisible] = useState(false)

  // 项目筛选
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // 搜索用的全部记录
  const [allRecords, setAllRecords] = useState<Array<{ timestamp: number; display: string; project: string; sessionId?: string }>>([])
  const [recordsLoaded, setRecordsLoaded] = useState(false)

  // 会话对比
  const [compareMode, setCompareMode] = useState(false)
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set())
  const [compareModalVisible, setCompareModalVisible] = useState(false)

  const toggleCompareSession = (sessionId: string) => {
    setSelectedForCompare(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        if (next.size >= 5) {
          message.warning('最多选择 5 个会话进行对比')
          return prev
        }
        next.add(sessionId)
      }
      return next
    })
  }

  useEffect(() => {
    loadHistoryMetadata()
  }, [])

  // 快捷键（Prompt 列表打开时不响应搜索快捷键）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      /* 对话详情弹窗打开时，不拦截 Cmd+F */
      if (conversationModalVisible) return

      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSummaryModalVisible(false)
        setSearchVisible(true)
        loadAllRecordsIfNeeded()
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

  /* 按需加载全部记录（用于 prompt 文本搜索） */
  const loadAllRecordsIfNeeded = async () => {
    if (recordsLoaded) return
    try {
      const result = await window.electronAPI.readHistory()
      if (result.success && result.records) {
        setAllRecords(result.records)
        setRecordsLoaded(true)
      }
    } catch { /* 静默失败 */ }
  }

  const loadHistoryMetadata = async () => {
    setLoading(true)
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('加载超时')), 10000)
      })
      const result = await Promise.race([window.electronAPI.readHistoryMetadata(), timeoutPromise])
      if (result.success && result.sessions) {
        setSessions(result.sessions)
        if (isInitialLoad) {
          message.success(`成功加载 ${result.sessions.length} 个会话`)
          setIsInitialLoad(false)
        }
      } else {
        setSessions([])
        if (result.error) message.error(`加载失败: ${result.error}`)
        setIsInitialLoad(false)
      }
    } catch (error: any) {
      const errorMsg = error?.message || '未知错误'
      if (!errorMsg.includes('加载超时')) message.error(`加载失败: ${errorMsg}`)
      setSessions([])
      setIsInitialLoad(false)
    } finally {
      setLoading(false)
    }
  }

  // 日期筛选
  const filteredSessions = useMemo(() => {
    if (dateRange === 'all' || !customDateRange) return sessions
    const [start, end] = customDateRange
    return sessions.filter(
      s => s.latestTimestamp >= start.valueOf() && s.latestTimestamp <= end.valueOf()
    )
  }, [sessions, dateRange, customDateRange])

  // 项目筛选
  const projectFilteredSessions = useMemo(() => {
    if (!selectedProject) return filteredSessions
    return filteredSessions.filter(s => s.project === selectedProject)
  }, [filteredSessions, selectedProject])

  // 搜索过滤（搜索 prompt 文本）
  const searchedSessions = useMemo(() => {
    if (!searchKeyword.trim()) return projectFilteredSessions
    const keyword = searchKeyword.toLowerCase()
    /* 先按项目名/sessionId 匹配 */
    const byMeta = projectFilteredSessions.filter(
      session =>
        session.project.toLowerCase().includes(keyword) ||
        session.sessionId.toLowerCase().includes(keyword)
    )
    /* 再按 prompt 文本匹配（需要 allRecords 已加载） */
    if (allRecords.length > 0) {
      const matchedSessionIds = new Set(byMeta.map(s => s.sessionId))
      const promptMatched = allRecords
        .filter(r => r.display?.toLowerCase().includes(keyword) && r.sessionId && !matchedSessionIds.has(r.sessionId))
        .map(r => r.sessionId!)
      const promptMatchedSet = new Set(promptMatched)
      const byPrompt = projectFilteredSessions.filter(s => promptMatchedSet.has(s.sessionId))
      return [...byMeta, ...byPrompt]
    }
    return byMeta
  }, [projectFilteredSessions, searchKeyword, allRecords])

  /* 搜索结果：匹配的 prompt 文本预览（最多显示 20 条） */
  const searchResults = useMemo(() => {
    if (!searchKeyword.trim() || allRecords.length === 0) return []
    const keyword = searchKeyword.toLowerCase()
    return allRecords
      .filter(r => r.display?.toLowerCase().includes(keyword))
      .slice(0, 20)
      .map(r => ({
        display: r.display,
        project: r.project,
        sessionId: r.sessionId || '',
        timestamp: r.timestamp
      }))
  }, [allRecords, searchKeyword])

  // 转换格式
  const groupedRecords = useMemo(() => {
    return searchedSessions
      .map(session => ({
        sessionId: session.sessionId,
        project: session.project,
        latestTimestamp: session.latestTimestamp,
        recordCount: session.recordCount,
        total_tokens: session.total_tokens,
        total_cost_usd: session.total_cost_usd,
        has_tool_use: session.has_tool_use,
        has_errors: session.has_errors,
        tool_use_count: session.tool_use_count,
        tool_usage: session.tool_usage
      }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
  }, [searchedSessions])

  // 分页
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return groupedRecords.slice(startIndex, startIndex + pageSize)
  }, [groupedRecords, currentPage, pageSize])

  const getProjectName = (projectPath: string) => {
    if (!projectPath) return '未知项目'
    const parts = projectPath.split('/')
    return parts[parts.length - 1]
  }

  /* 项目统计（基于日期筛选后的全部数据，不受项目筛选和搜索影响） */
  const projectStats = useMemo(() => {
    const statsMap = new Map<string, {
      project: string
      projectName: string
      sessionCount: number
      totalTokens: number
      totalCost: number
      toolUseCount: number
    }>()

    for (const session of filteredSessions) {
      const existing = statsMap.get(session.project)
      if (existing) {
        existing.sessionCount += 1
        existing.totalTokens += session.total_tokens || 0
        existing.totalCost += session.total_cost_usd || 0
        existing.toolUseCount += session.tool_use_count || 0
      } else {
        statsMap.set(session.project, {
          project: session.project,
          projectName: getProjectName(session.project),
          sessionCount: 1,
          totalTokens: session.total_tokens || 0,
          totalCost: session.total_cost_usd || 0,
          toolUseCount: session.tool_use_count || 0
        })
      }
    }
    return Array.from(statsMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)
  }, [filteredSessions])

  useEffect(() => {
    setCurrentPage(1)
  }, [dateRange, customDateRange, searchKeyword, selectedProject])

  const handlePageChange = (page: number, newPageSize?: number) => {
    setCurrentPage(page)
    if (newPageSize && newPageSize !== pageSize) {
      setPageSize(newPageSize)
      setCurrentPage(1)
    }
  }

  const formatTime = (timestamp: number) => dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')

  const handleOpenFolder = async (folderPath: string) => {
    try {
      await window.electronAPI.openInFinder(folderPath)
    } catch {
      message.error('打开文件夹失败')
    }
  }

  const handleExport = async () => {
    try {
      const result = await window.electronAPI.exportRecords({ format: 'markdown' })
      if (result.success) {
        message.success(`导出成功: ${result.filePath}`)
      } else {
        message.error(`导出失败: ${result.error}`)
      }
    } catch (error: any) {
      message.error(`导出失败: ${error?.message || '未知错误'}`)
    }
  }

  /* 点击会话卡片 → 直接打开完整对话（按轮次浏览） */
  const handleSessionClick = (session: GroupedRecord) => {
    setConversationSessionId(session.sessionId)
    setConversationProject(session.project)
    setConversationModalVisible(true)
  }

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  /* AI 总结 */
  const handleSummarize = async (session: GroupedRecord) => {
    try {
      const settings = await window.electronAPI.getAppSettings()
      if (!settings.aiSummary.enabled) {
        Modal.confirm({
          title: 'AI 总结功能需要配置',
          content: '使用 AI 总结功能需要先配置 API Key，是否前往设置？',
          okText: '去设置',
          cancelText: '取消',
          onOk: () => onOpenSettings?.(),
          ...getElectronModalConfig()
        })
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
        return
      }

      // 加载会话记录
      const result = await window.electronAPI.readSessionDetails(session.sessionId)
      if (!result.success || !result.records) {
        message.error('加载会话数据失败')
        return
      }

      setSummarizing(true)
      setSummaryContent('正在生成总结...')
      setSummaryModalVisible(true)
      let fullSummary = ''

      await window.electronAPI.summarizeRecordsStream(
        { records: result.records, type: 'detailed' },
        (chunk: string) => { fullSummary += chunk; setSummaryContent(fullSummary) },
        () => { setSummarizing(false) },
        (error: string) => {
          setSummarizing(false)
          setSummaryModalVisible(false)
          if (error.includes('余额不足') || error.includes('402')) {
            Modal.error({
              title: 'AI 总结失败',
              content: <div><p>{error}</p><p style={{ marginTop: 8, fontSize: 12, color: themeVars.textTertiary }}>提示：你可以前往相应平台充值后继续使用</p></div>,
              okText: '我知道了',
              ...getElectronModalConfig()
            })
          } else if (error.includes('API Key')) {
            Modal.error({
              title: 'AI 总结失败',
              content: <div><p>{error}</p><p style={{ marginTop: 8, fontSize: 12, color: themeVars.textTertiary }}>提示：请前往设置页面重新配置 API Key</p></div>,
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
      message.error(`总结失败: ${error?.message || '未知错误'}`, 5)
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
              customStyle={{ margin: 0, borderRadius: 6, fontSize: 13, background: themeVars.bgCode }}
              {...codeProps}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code style={{ background: themeVars.codeBg, padding: '2px 6px', borderRadius: 3, fontSize: 12, fontFamily: 'monospace' }} {...codeProps}>
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
        background: themeVars.bgContainer,
        minHeight: 0
      }}
    >
      {/* 操作栏 */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${themeVars.border}`,
          background: themeVars.bgContainer,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          WebkitAppRegion: 'drag'
        } as React.CSSProperties}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          共 {groupedRecords.length} 个会话，
          {groupedRecords.reduce((sum, s) => sum + s.recordCount, 0)} 条记录
          {groupedRecords.length > 0 &&
            ` | 第 ${currentPage}/${Math.ceil(groupedRecords.length / pageSize)} 页`}
        </Text>
        <Space style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Tooltip title="搜索 Prompt (Cmd+F / Ctrl+F)">
            <Button
              icon={<SearchOutlined />}
              onClick={() => {
                setSummaryModalVisible(false)
                setSearchVisible(true)
                loadAllRecordsIfNeeded()
                setTimeout(() => searchInputRef.current?.focus(), 100)
              }}
              size="small"
            />
          </Tooltip>
          <Button
            type={compareMode ? 'primary' : 'default'}
            icon={<SwapOutlined />}
            onClick={() => {
              if (compareMode) {
                setCompareMode(false)
                setSelectedForCompare(new Set())
              } else {
                setCompareMode(true)
              }
            }}
            size="small"
          >
            {compareMode ? `对比 (${selectedForCompare.size})` : '对比'}
          </Button>
          {compareMode && selectedForCompare.size >= 2 && (
            <Button type="primary" size="small" onClick={() => setCompareModalVisible(true)}>
              开始对比
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadHistoryMetadata} loading={loading} size="small">
            刷新
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport} disabled={groupedRecords.length === 0} size="small">
            导出
          </Button>
        </Space>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', minHeight: 0 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 时间筛选器 */}
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Space wrap>
              <Button type={dateRange === 'all' ? 'primary' : 'default'} size="small"
                onClick={() => { setCustomDateRange(null); setDateRange('all') }}>
                全部
              </Button>
              <Button type={dateRange === '1d' ? 'primary' : 'default'} size="small"
                onClick={() => {
                  const now = dayjs()
                  setCustomDateRange([now.subtract(1, 'day').startOf('day'), now.endOf('day')])
                  setDateRange('1d')
                }}>
                1天
              </Button>
              <Button type={dateRange === '7d' ? 'primary' : 'default'} size="small"
                onClick={() => {
                  const now = dayjs()
                  setCustomDateRange([now.subtract(7, 'day').startOf('day'), now.endOf('day')])
                  setDateRange('7d')
                }}>
                7天
              </Button>
              <Button type={dateRange === '30d' ? 'primary' : 'default'} size="small"
                onClick={() => {
                  const now = dayjs()
                  setCustomDateRange([now.subtract(30, 'day').startOf('day'), now.endOf('day')])
                  setDateRange('30d')
                }}>
                30天
              </Button>
              <RangePicker
                size="small"
                value={customDateRange}
                onChange={dates => {
                  if (dates) {
                    const [start, end] = dates as [Dayjs, Dayjs]
                    setCustomDateRange([start.startOf('day'), end.endOf('day')])
                    setDateRange('custom')
                  }
                }}
              />
            </Space>
          </Card>

          {/* 项目级别统计（点击项目可筛选） */}
          {!loading && projectStats.length > 0 && (
            <Collapse
              size="small"
              defaultActiveKey={['project-stats']}
              items={[{
                key: 'project-stats',
                label: (
                  <Space>
                    <BarChartOutlined />
                    <Text style={{ fontSize: 13 }}>项目统计（{projectStats.length} 个项目）</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      总 Token: {projectStats.reduce((s, p) => s + p.totalTokens, 0).toLocaleString()}
                      {' | '}总成本: ${projectStats.reduce((s, p) => s + p.totalCost, 0).toFixed(4)}
                    </Text>
                  </Space>
                ),
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {projectStats.map(stat => {
                      const isActive = selectedProject === stat.project
                      return (
                        <div
                          key={stat.project}
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedProject(isActive ? null : stat.project)
                          }}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 12px', borderRadius: 6,
                            background: isActive ? themeVars.primaryBg : themeVars.bgSection,
                            border: `1px solid ${isActive ? themeVars.primary : themeVars.borderSecondary}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Space>
                            <Tag color={isActive ? '#D97757' : 'default'} style={{ fontSize: 11 }}>
                              {isActive && <CheckOutlined style={{ marginRight: 4 }} />}
                              {stat.projectName}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>{stat.sessionCount} 个会话</Text>
                          </Space>
                          <Space size={4}>
                            {stat.totalTokens > 0 && (
                              <Tag icon={<ThunderboltOutlined />} color="#D97757" style={{ fontSize: 11 }}>
                                {stat.totalTokens.toLocaleString()} tokens
                              </Tag>
                            )}
                            {stat.totalCost > 0 && (
                              <Tag icon={<DollarOutlined />} color="green" style={{ fontSize: 11 }}>
                                ${stat.totalCost.toFixed(4)}
                              </Tag>
                            )}
                            {stat.toolUseCount > 0 && (
                              <Tag icon={<ToolOutlined />} color="purple" style={{ fontSize: 11 }}>
                                工具 ×{stat.toolUseCount}
                              </Tag>
                            )}
                          </Space>
                        </div>
                      )
                    })}
                  </div>
                )
              }]}
            />
          )}

          {/* 当前项目筛选提示 */}
          {selectedProject && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 6,
              background: themeVars.primaryBg,
              border: `1px solid ${darkMode ? 'rgba(217, 119, 87, 0.3)' : 'rgba(217, 119, 87, 0.2)'}`
            }}>
              <FolderOpenOutlined style={{ color: themeVars.primary, fontSize: 13 }} />
              <Text style={{ fontSize: 12 }}>
                筛选项目: <Text strong style={{ fontSize: 12 }}>{getProjectName(selectedProject)}</Text>
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                ({projectFilteredSessions.length} 个会话)
              </Text>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setSelectedProject(null)}
                style={{ marginLeft: 'auto', fontSize: 10, color: themeVars.textTertiary }}
              >
                清除
              </Button>
            </div>
          )}

          {/* Session 列表 */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin size="large" tip="加载中..." />
            </div>
          ) : groupedRecords.length === 0 ? (
            <Empty description="所选时间范围内没有记录" style={{ padding: 60 }} />
          ) : (
            <>
              <List
                grid={{ gutter: 16, column: 2 }}
                dataSource={paginatedRecords}
                renderItem={group => (
                  <List.Item style={{ marginBottom: 8 }}>
                    <Card
                      hoverable
                      size="small"
                      onClick={() => {
                        if (compareMode) {
                          toggleCompareSession(group.sessionId)
                        } else {
                          handleSessionClick(group)
                        }
                      }}
                      title={
                        <Space>
                          {compareMode && (
                            <div style={{
                              width: 18, height: 18, borderRadius: 4,
                              border: `2px solid ${selectedForCompare.has(group.sessionId) ? themeVars.primary : themeVars.borderSecondary}`,
                              background: selectedForCompare.has(group.sessionId) ? themeVars.primary : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.2s'
                            }}>
                              {selectedForCompare.has(group.sessionId) && (
                                <CheckOutlined style={{ color: themeVars.textWhite, fontSize: 10 }} />
                              )}
                            </div>
                          )}
                          <Tag color="#D97757">{getProjectName(group.project)}</Tag>
                          {group.sessionId && !group.sessionId.startsWith('single-') && (
                            <Text code style={{ fontSize: 11 }}>{group.sessionId.slice(0, 8)}</Text>
                          )}
                        </Space>
                      }
                      extra={<ClockCircleOutlined style={{ color: themeVars.textTertiary }} />}
                      style={compareMode && selectedForCompare.has(group.sessionId)
                        ? { borderColor: themeVars.primary, borderWidth: 2 }
                        : undefined
                      }
                      actions={[
                        <Tooltip key="summarize" title="AI 总结">
                          <Button
                            type="text"
                            size="small"
                            icon={<StarOutlined />}
                            loading={summarizing}
                            onClick={e => { e.stopPropagation(); handleSummarize(group) }}
                          >
                            AI 总结
                          </Button>
                        </Tooltip>,
                        <Tooltip key="folder" title="打开项目文件夹">
                          <Button
                            type="text"
                            size="small"
                            icon={<FolderOpenOutlined />}
                            onClick={e => { e.stopPropagation(); handleOpenFolder(group.project) }}
                          >
                            打开
                          </Button>
                        </Tooltip>
                      ]}
                    >
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {formatTime(group.latestTimestamp)}
                        </Text>
                        <Space wrap size={4}>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {group.recordCount} 条对话
                          </Text>
                          {group.total_tokens && (
                            <Tag icon={<ThunderboltOutlined />} color="#D97757" style={{ fontSize: 11 }}>
                              {group.total_tokens.toLocaleString()} tokens
                            </Tag>
                          )}
                          {group.total_cost_usd && (
                            <Tag color="green" style={{ fontSize: 11 }}>
                              ${group.total_cost_usd.toFixed(4)}
                            </Tag>
                          )}
                          {group.has_tool_use && (
                            <Tooltip
                              title={
                                group.tool_usage && Object.keys(group.tool_usage).length > 0 ? (
                                  <div>
                                    {Object.entries(group.tool_usage)
                                      .sort(([, a], [, b]) => b - a)
                                      .map(([tool, count]) => (
                                        <div key={tool} style={{ fontSize: 11 }}>{tool}: {count}次</div>
                                      ))}
                                  </div>
                                ) : undefined
                              }
                            >
                              <Tag icon={<ToolOutlined />} color="purple" style={{ fontSize: 11 }}>
                                工具调用 {group.tool_use_count && `×${group.tool_use_count}`}
                              </Tag>
                            </Tooltip>
                          )}
                          {group.has_errors && (
                            <Tag icon={<WarningOutlined />} color="red" style={{ fontSize: 11 }}>有错误</Tag>
                          )}
                        </Space>
                        <Text
                          code
                          style={{ fontSize: 11, cursor: 'pointer', color: themeVars.textTertiary }}
                          onClick={e => { e.stopPropagation(); handleOpenFolder(group.project) }}
                        >
                          {truncateText(group.project, 40)}
                        </Text>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />

              {/* 分页 */}
              {groupedRecords.length > 0 && (
                <div style={{ marginTop: 24, textAlign: 'center' }}>
                  <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={groupedRecords.length}
                    onChange={handlePageChange}
                    onShowSizeChange={handlePageChange}
                    showSizeChanger
                    showQuickJumper
                    showTotal={total => `共 ${total} 个会话`}
                    pageSizeOptions={['10', '20', '50', '100']}
                    size="small"
                  />
                </div>
              )}
            </>
          )}
        </Space>
      </div>

      {/* 完整对话弹窗（按轮次浏览） */}
      <ConversationDetailModal
        visible={conversationModalVisible}
        sessionId={conversationSessionId}
        project={conversationProject}
        initialTimestamp={conversationTimestamp}
        onClose={() => {
          setConversationModalVisible(false)
          setConversationTimestamp(undefined)
        }}
      />

      {/* AI 总结弹窗 */}
      <ElectronModal
        title={
          <Space>
            <StarOutlined style={{ color: themeVars.primary }} />
            <Text>AI 总结</Text>
          </Space>
        }
        open={summaryModalVisible}
        onCancel={() => setSummaryModalVisible(false)}
        width="60%"
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopySummary}>复制总结</Button>,
          <Button key="close" type="primary" onClick={() => setSummaryModalVisible(false)}>关闭</Button>
        ]}
        style={{ top: 60 }}
        styles={{ body: { maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' } as React.CSSProperties }}
        zIndex={1004}
      >
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>{renderMarkdown(summaryContent)}</div>
      </ElectronModal>

      {/* 搜索弹窗 */}
      <ElectronModal
        open={searchVisible}
        onCancel={() => { setSearchVisible(false); setSearchKeyword('') }}
        footer={null}
        closable={false}
        width={680}
        style={{ top: '12%' }}
        styles={{ body: { padding: 0 } as React.CSSProperties }}
      >
        <div style={{ padding: '16px 20px' }}>
          <div style={{ marginBottom: 12 }}>
            <Input
              ref={searchInputRef}
              size="large"
              placeholder="搜索 Prompt 内容..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              prefix={<SearchOutlined style={{ fontSize: 18, color: themeVars.textSecondary }} />}
              suffix={searchKeyword && (
                <CloseOutlined
                  style={{ fontSize: 14, color: themeVars.textTertiary, cursor: 'pointer' }}
                  onClick={() => setSearchKeyword('')}
                />
              )}
              style={{ borderRadius: 8, fontSize: 15 }}
            />
          </div>

          {!searchKeyword ? (
            <div style={{ textAlign: 'center', padding: '20px', color: themeVars.textTertiary }}>
              <SearchOutlined style={{ fontSize: 36, marginBottom: 8, opacity: 0.25 }} />
              <div style={{ fontSize: 13, marginBottom: 4 }}>输入关键词搜索 Prompt 内容</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>提示：按 ESC 关闭搜索</div>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              {/* Prompt 文本匹配结果 */}
              {searchResults.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6, paddingLeft: 2 }}>
                    匹配的 Prompt ({searchResults.length > 19 ? '20+' : searchResults.length} 条)
                  </Text>
                  {searchResults.map((r, idx) => {
                    const kw = searchKeyword.toLowerCase()
                    const lowerDisplay = r.display.toLowerCase()
                    const matchIdx = lowerDisplay.indexOf(kw)
                    /* 截取匹配前后文本作为预览 */
                    const start = Math.max(0, matchIdx - 30)
                    const end = Math.min(r.display.length, matchIdx + kw.length + 60)
                    const snippet = r.display.slice(start, end)

                    /* 将 snippet 拆分为：匹配前 | 匹配高亮 | 匹配后 */
                    const relIdx = matchIdx - start
                    const before = (start > 0 ? '...' : '') + snippet.slice(0, relIdx)
                    const matched = snippet.slice(relIdx, relIdx + kw.length)
                    const after = snippet.slice(relIdx + kw.length) + (end < r.display.length ? '...' : '')

                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          setSearchVisible(false)
                          setSearchKeyword('')
                          if (r.sessionId) {
                            setConversationSessionId(r.sessionId)
                            setConversationProject(r.project)
                            setConversationTimestamp(r.timestamp)
                            setConversationModalVisible(true)
                          }
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 6,
                          border: `1px solid ${themeVars.borderSecondary}`,
                          marginBottom: 6,
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                          background: 'transparent'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = themeVars.hoverBg }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Tag color="#D97757" style={{ fontSize: 10 }}>{getProjectName(r.project)}</Tag>
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            {new Date(r.timestamp).toLocaleString('zh-CN')}
                          </Text>
                        </div>
                        <Text style={{ fontSize: 12, lineHeight: '18px' }}>
                          {before}
                          <span style={{ color: themeVars.primary, fontWeight: 600, background: themeVars.highlightBg, borderRadius: 2, padding: '0 1px' }}>
                            {matched}
                          </span>
                          {after}
                        </Text>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 会话级匹配统计 */}
              {searchedSessions.length > 0 ? (
                <div style={{ padding: '8px 2px', color: themeVars.textSecondary }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    共匹配 {searchedSessions.length} 个会话，已在列表中筛选显示
                  </Text>
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到匹配结果" style={{ padding: '10px 0' }} />
              )}
            </div>
          )}
        </div>
      </ElectronModal>

      {/* 会话对比弹窗 */}
      <Modal
        title={
          <Space>
            <SwapOutlined />
            <span>会话对比</span>
            <Tag color="#D97757">{selectedForCompare.size} 个会话</Tag>
          </Space>
        }
        open={compareModalVisible}
        onCancel={() => setCompareModalVisible(false)}
        width={950}
        footer={[<Button key="close" type="primary" onClick={() => setCompareModalVisible(false)}>关闭</Button>]}
      >
        {(() => {
          const compareData = groupedRecords.filter(g => selectedForCompare.has(g.sessionId))
          if (compareData.length < 2) return <Empty description="请至少选择 2 个会话" />

          const metrics = [
            { label: '消息数', key: 'recordCount', format: (v: number) => v.toString() },
            { label: 'Token 总量', key: 'total_tokens', format: (v: number) => v?.toLocaleString() || '-' },
            { label: '成本 (USD)', key: 'total_cost_usd', format: (v: number) => v ? `$${v.toFixed(4)}` : '-' },
            { label: '工具调用', key: 'tool_use_count', format: (v: number) => v?.toLocaleString() || '-' }
          ]

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card size="small" title={<Text style={{ fontSize: 13 }}>统计对比</Text>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* 表头 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `120px repeat(${compareData.length}, 1fr)`,
                    gap: 8, padding: '8px 12px',
                    borderBottom: `1px solid ${themeVars.border}`,
                    fontSize: 12, fontWeight: 600, color: themeVars.textSecondary
                  }}>
                    <div>指标</div>
                    {compareData.map(s => (
                      <div key={s.sessionId} style={{ textAlign: 'center' }}>
                        <Tag color="#D97757" style={{ fontSize: 10 }}>{getProjectName(s.project)}</Tag>
                        <br />
                        <Text code style={{ fontSize: 10 }}>{s.sessionId.slice(0, 8)}</Text>
                      </div>
                    ))}
                  </div>
                  {/* 时间行 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `120px repeat(${compareData.length}, 1fr)`,
                    gap: 8, padding: '6px 12px', fontSize: 12,
                    background: themeVars.bgSection, borderRadius: 4
                  }}>
                    <div style={{ fontWeight: 500 }}>时间</div>
                    {compareData.map(s => (
                      <div key={s.sessionId} style={{ textAlign: 'center', fontSize: 11, color: themeVars.textSecondary }}>
                        {formatTime(s.latestTimestamp)}
                      </div>
                    ))}
                  </div>
                  {/* 数据行 */}
                  {metrics.map(metric => {
                    const values = compareData.map(s => (s as any)[metric.key] as number || 0)
                    const maxVal = Math.max(...values)
                    return (
                      <div key={metric.label} style={{
                        display: 'grid',
                        gridTemplateColumns: `120px repeat(${compareData.length}, 1fr)`,
                        gap: 8, padding: '6px 12px', fontSize: 12,
                        background: themeVars.bgSection, borderRadius: 4
                      }}>
                        <div style={{ fontWeight: 500 }}>{metric.label}</div>
                        {compareData.map(s => {
                          const val = (s as any)[metric.key] as number || 0
                          const isMax = val === maxVal && compareData.length > 1 && val > 0
                          return (
                            <div key={s.sessionId} style={{ textAlign: 'center', fontWeight: isMax ? 600 : 400 }}>
                              {metric.format(val)}
                              {isMax && (
                                <Tag color="gold" style={{ fontSize: 10, marginLeft: 4, padding: '0 3px', lineHeight: '14px' }}>MAX</Tag>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </Card>

              {/* 工具使用对比 */}
              {compareData.some(s => s.tool_usage && Object.keys(s.tool_usage).length > 0) && (
                <Card size="small" title={<Text style={{ fontSize: 13 }}>工具使用对比</Text>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(() => {
                      const allTools = new Set<string>()
                      compareData.forEach(s => {
                        if (s.tool_usage) Object.keys(s.tool_usage).forEach(t => allTools.add(t))
                      })
                      const toolList = Array.from(allTools).sort()

                      return (
                        <>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: `120px repeat(${compareData.length}, 1fr)`,
                            gap: 8, padding: '6px 12px',
                            borderBottom: `1px solid ${themeVars.border}`,
                            fontSize: 12, fontWeight: 600, color: themeVars.textSecondary
                          }}>
                            <div>工具</div>
                            {compareData.map(s => (
                              <div key={s.sessionId} style={{ textAlign: 'center' }}>
                                <Text code style={{ fontSize: 10 }}>{s.sessionId.slice(0, 8)}</Text>
                              </div>
                            ))}
                          </div>
                          {toolList.map(tool => {
                            const values = compareData.map(s => s.tool_usage?.[tool] || 0)
                            const maxVal = Math.max(...values)
                            return (
                              <div key={tool} style={{
                                display: 'grid',
                                gridTemplateColumns: `120px repeat(${compareData.length}, 1fr)`,
                                gap: 8, padding: '4px 12px', fontSize: 12, borderRadius: 4
                              }}>
                                <div style={{ fontFamily: 'monospace', fontSize: 11 }}>{tool}</div>
                                {compareData.map(s => {
                                  const val = s.tool_usage?.[tool] || 0
                                  const isMax = val === maxVal && val > 0
                                  return (
                                    <div key={s.sessionId} style={{
                                      textAlign: 'center', fontWeight: isMax ? 600 : 400,
                                      color: val === 0 ? themeVars.textTertiary : themeVars.text
                                    }}>
                                      {val > 0 ? val : '-'}
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </>
                      )
                    })()}
                  </div>
                </Card>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}

export default HistoryViewer
