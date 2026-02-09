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
  Image,
  Tooltip,
  Collapse
} from 'antd'
import {
  FolderOpenOutlined,
  CopyOutlined,
  FileTextOutlined,
  SearchOutlined,
  StarOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  ExportOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  CloseOutlined,
  CommentOutlined,
  FileImageOutlined,
  ToolOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  BarChartOutlined,
  DollarOutlined
} from '@ant-design/icons'
import Highlighter from 'react-highlight-words'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ElectronModal, { getElectronModalConfig } from './ElectronModal'
import { ClaudeRecord, SessionMetadata } from '../types'
import dayjs, { Dayjs } from 'dayjs'
import 'dayjs/locale/zh-cn'
import { getThemeVars } from '../theme'
import SmartContent from './SmartContent'
import CopyTextModal from './CopyTextModal'
import CopyableImage, { getCopyablePreviewConfig } from './CopyableImage'
import ConversationDetailModal from './ConversationDetailModal'

// 设置 dayjs 中文语言
dayjs.locale('zh-cn')

const { Text, Paragraph } = Typography
const { RangePicker } = DatePicker

interface HistoryViewerProps {
  onOpenSettings?: () => void
  darkMode: boolean
  onSendToChat?: (content: string) => void
}

interface GroupedRecord {
  sessionId: string
  project: string
  records: ClaudeRecord[]
  latestTimestamp: number
  recordCount: number
  // 统计信息
  total_tokens?: number
  total_cost_usd?: number
  has_tool_use?: boolean
  has_errors?: boolean
  tool_use_count?: number
  tool_usage?: Record<string, number>
}

type DateRange = 'all' | '1d' | '7d' | '30d' | 'custom'

function HistoryViewer({ onOpenSettings, darkMode, onSendToChat }: HistoryViewerProps) {
  // 使用会话元数据代替完整记录
  const [sessions, setSessions] = useState<SessionMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [customDateRange, setCustomDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const searchInputRef = useRef<any>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const themeVars = getThemeVars(darkMode)

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 层级 2: Session 详情弹窗
  const [selectedSession, setSelectedSession] = useState<GroupedRecord | null>(null)
  const [sessionModalVisible, setSessionModalVisible] = useState(false)
  const [sessionDetailsLoading, setSessionDetailsLoading] = useState(false)

  // 层级 3: Record 详情弹窗
  const [selectedRecord, setSelectedRecord] = useState<ClaudeRecord | null>(null)
  const [recordModalVisible, setRecordModalVisible] = useState(false)

  // Copy Text 弹窗状态
  const [copyTextModalVisible, setCopyTextModalVisible] = useState(false)
  const [copyTextModalContent, setCopyTextModalContent] = useState<Record<string, any>>({})

  // AI 总结相关状态
  const [summarizing, setSummarizing] = useState(false)
  const [summaryContent, setSummaryContent] = useState<string>('')
  const [summaryModalVisible, setSummaryModalVisible] = useState(false)

  // 图片加载缓存
  const [imageCache, setImageCache] = useState<Map<string, string>>(new Map())

  // 完整对话弹窗状态
  const [conversationModalVisible, setConversationModalVisible] = useState(false)
  const [conversationSessionId, setConversationSessionId] = useState('')
  const [conversationProject, setConversationProject] = useState('')

  // Session Modal 关闭处理
  const handleCloseSessionModal = () => {
    setSessionModalVisible(false)
  }

  // Record Modal 关闭处理
  const handleCloseRecordModal = () => {
    setRecordModalVisible(false)
  }

  useEffect(() => {
    loadHistoryMetadata()
  }, [])

  // 监听 Cmd+F 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+F (Mac) 或 Ctrl+F (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        // 关闭所有弹窗
        setSessionModalVisible(false)
        setRecordModalVisible(false)
        setSummaryModalVisible(false)
        // 打开搜索
        setSearchVisible(true)
        // 延迟聚焦，确保输入框已渲染
        setTimeout(() => {
          searchInputRef.current?.focus()
        }, 100)
      }
      // ESC 关闭搜索框
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false)
        setSearchKeyword('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchVisible])

  const loadHistoryMetadata = async () => {
    setLoading(true)
    try {
      // 添加超时保护
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
        if (result.error) {
          console.error('加载历史记录失败:', result.error)
          message.error(`加载失败: ${result.error}`)
        }
        setIsInitialLoad(false)
      }
    } catch (error: any) {
      console.error('加载历史记录时发生错误:', error)
      const errorMsg = error?.message || '未知错误'
      if (!errorMsg.includes('加载超时')) {
        message.error(`加载失败: ${errorMsg}`)
      }
      setSessions([])
      setIsInitialLoad(false)
    } finally {
      setLoading(false)
    }
  }

  // 根据日期范围筛选会话
  const filteredSessions = useMemo(() => {
    // "全部" 模式不做时间筛选
    if (dateRange === 'all' || !customDateRange) {
      return sessions
    }
    const [start, end] = customDateRange
    return sessions.filter(
      s => s.latestTimestamp >= start.valueOf() && s.latestTimestamp <= end.valueOf()
    )
  }, [sessions, dateRange, customDateRange])

  // 搜索过滤（按项目名/SessionID 过滤）
  const searchedSessions = useMemo(() => {
    if (!searchKeyword.trim()) {
      return filteredSessions
    }

    const keyword = searchKeyword.toLowerCase()
    return filteredSessions.filter(
      session =>
        session.project.toLowerCase().includes(keyword) ||
        session.sessionId.toLowerCase().includes(keyword)
    )
  }, [filteredSessions, searchKeyword])

  // 转换为 GroupedRecord 格式（用于显示）
  const groupedRecords = useMemo(() => {
    return searchedSessions
      .map(session => ({
        sessionId: session.sessionId,
        project: session.project,
        records: [], // 暂时为空，点击时才加载
        latestTimestamp: session.latestTimestamp,
        recordCount: session.recordCount,
        // 保留统计信息
        total_tokens: session.total_tokens,
        total_cost_usd: session.total_cost_usd,
        has_tool_use: session.has_tool_use,
        has_errors: session.has_errors,
        tool_use_count: session.tool_use_count,
        tool_usage: session.tool_usage
      }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp) // 按时间降序排序，最新的在前面
  }, [searchedSessions])

  // 分页数据
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return groupedRecords.slice(startIndex, endIndex)
  }, [groupedRecords, currentPage, pageSize])

  // 项目级别 Token 统计
  const projectStats = useMemo(() => {
    const statsMap = new Map<
      string,
      {
        project: string
        projectName: string
        sessionCount: number
        totalTokens: number
        totalCost: number
        toolUseCount: number
      }
    >()

    for (const group of groupedRecords) {
      const existing = statsMap.get(group.project)
      if (existing) {
        existing.sessionCount += 1
        existing.totalTokens += group.total_tokens || 0
        existing.totalCost += group.total_cost_usd || 0
        existing.toolUseCount += group.tool_use_count || 0
      } else {
        statsMap.set(group.project, {
          project: group.project,
          projectName: getProjectName(group.project),
          sessionCount: 1,
          totalTokens: group.total_tokens || 0,
          totalCost: group.total_cost_usd || 0,
          toolUseCount: group.tool_use_count || 0
        })
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)
  }, [groupedRecords])

  // 当筛选条件变化时，重置到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [dateRange, customDateRange, searchKeyword])

  // 分页变化处理
  const handlePageChange = (page: number, newPageSize?: number) => {
    setCurrentPage(page)
    if (newPageSize && newPageSize !== pageSize) {
      setPageSize(newPageSize)
      setCurrentPage(1) // 改变每页条数时重置到第一页
    }
  }

  const formatTime = (timestamp: number) => {
    return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
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
    } catch (error) {
      message.error('复制失败')
    }
  }

  const handleOpenFolder = async (folderPath: string) => {
    try {
      await window.electronAPI.openInFinder(folderPath)
    } catch (error) {
      message.error('打开文件夹失败')
    }
  }

  const handleExport = async () => {
    try {
      const result = await window.electronAPI.exportRecords({
        format: 'markdown'
      })

      if (result.success) {
        message.success(`导出成功: ${result.filePath}`)
      } else {
        message.error(`导出失败: ${result.error}`)
      }
    } catch (error: any) {
      message.error(`导出失败: ${error?.message || '未知错误'}`)
    }
  }

  // 打开 Session 详情弹窗（按需加载详细数据）
  const handleSessionClick = async (session: GroupedRecord) => {
    setSessionModalVisible(true)
    setSessionDetailsLoading(true)
    setSelectedSession(null)

    try {
      const result = await window.electronAPI.readSessionDetails(session.sessionId)

      if (result.success && result.records) {
        setSelectedSession({
          ...session,
          records: result.records
        })
      } else {
        message.error(`加载会话详情失败: ${result.error || '未知错误'}`)
        setSessionModalVisible(false)
      }
    } catch (error: any) {
      message.error(`加载会话详情失败: ${error?.message || '未知错误'}`)
      setSessionModalVisible(false)
    } finally {
      setSessionDetailsLoading(false)
    }
  }

  // 打开 Record 详情弹窗
  const handleRecordClick = (record: ClaudeRecord) => {
    setSelectedRecord(record)
    setRecordModalVisible(true)
  }

  // 截断文本用于预览
  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  // 处理 AI 总结
  const handleSummarize = async (session: GroupedRecord) => {
    try {
      // 检查 AI 配置
      const settings = await window.electronAPI.getAppSettings()

      // 使用 aiSummary 配置（总结配置）
      if (!settings.aiSummary.enabled) {
        Modal.confirm({
          title: 'AI 总结功能需要配置',
          content: '使用 AI 总结功能需要先配置 API Key，是否前往设置？',
          okText: '去设置',
          cancelText: '取消',
          onOk: () => {
            onOpenSettings?.()
          },
          ...getElectronModalConfig()
        })
        return
      }

      const currentProvider = settings.aiSummary.providers[settings.aiSummary.provider]
      if (!currentProvider || !currentProvider.apiKey) {
        Modal.confirm({
          title: '配置 API Key',
          content: `尚未配置 API Key，是否前往设置？`,
          okText: '去设置',
          cancelText: '取消',
          onOk: () => {
            onOpenSettings?.()
          },
          ...getElectronModalConfig()
        })
        return
      }

      // 如果会话记录为空，需要先加载
      let sessionRecords = session.records
      if (!sessionRecords || sessionRecords.length === 0) {
        const result = await window.electronAPI.readSessionDetails(session.sessionId)
        if (result.success && result.records) {
          sessionRecords = result.records
        } else {
          message.error('加载会话数据失败')
          return
        }
      }

      setSummarizing(true)

      // 先打开弹窗，显示"正在生成总结..."
      setSummaryContent('正在生成总结...')
      setSummaryModalVisible(true)

      let fullSummary = ''

      // 调用流式总结接口
      await window.electronAPI.summarizeRecordsStream(
        {
          records: sessionRecords,
          type: 'detailed'
        },
        // onChunk: 接收到新内容时追加
        (chunk: string) => {
          fullSummary += chunk
          setSummaryContent(fullSummary)
        },
        // onComplete: 总结完成
        () => {
          setSummarizing(false)
        },
        // onError: 出错时处理
        (error: string) => {
          setSummarizing(false)
          setSummaryModalVisible(false)

          // 显示详细的错误信息
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
              onOk: () => {
                onOpenSettings?.()
              },
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

  // 复制总结内容
  const handleCopySummary = async () => {
    try {
      await window.electronAPI.copyToClipboard(summaryContent)
      message.success('已复制到剪贴板')
    } catch (error) {
      message.error('复制失败')
    }
  }

  // 删除单条记录
  const handleDeleteRecord = async (record: ClaudeRecord) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '删除后将无法恢复，相关图片也会被删除。确认删除这条记录吗？',
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await window.electronAPI.deleteRecord(
            record.sessionId || '',
            record.timestamp
          )

          if (result.success) {
            message.success('删除成功')
            // 关闭 Record 详情弹窗
            setRecordModalVisible(false)
            // 重新加载 Session 详情
            if (selectedSession) {
              const updatedResult = await window.electronAPI.readSessionDetails(
                selectedSession.sessionId
              )
              if (updatedResult.success && updatedResult.records) {
                setSelectedSession({
                  ...selectedSession,
                  records: updatedResult.records,
                  recordCount: updatedResult.records.length
                })
                // 如果删除后该 session 没有记录了，关闭 session 弹窗并刷新列表
                if (updatedResult.records.length === 0) {
                  setSessionModalVisible(false)
                  loadHistoryMetadata()
                }
              }
            }
          } else {
            message.error(`删除失败: ${result.error}`)
          }
        } catch (error: any) {
          message.error(`删除失败: ${error?.message || '未知错误'}`)
        }
      },
      ...getElectronModalConfig()
    })
  }

  // 图片组件 - 使用可复制图片组件
  const ImageThumbnail = ({ imagePath, index }: { imagePath: string; index: number }) => {
    return (
      <CopyableImage
        imagePath={imagePath}
        index={index}
        darkMode={darkMode}
        imageCache={imageCache}
        onCacheUpdate={(path, data) => {
          setImageCache(prev => new Map(prev).set(path, data))
        }}
      />
    )
  }

  // 检测内容类型并自动添加语法高亮
  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: 6,
                fontSize: 13
              }}
              {...props}
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
              {...props}
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
        background: themeVars.bgContainer,
        minHeight: 0
      }}
    >
      {/* 操作栏 */}
      <div
        style={
          {
            padding: '12px 16px',
            borderBottom: `1px solid ${themeVars.border}`,
            background: themeVars.bgContainer,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            WebkitAppRegion: 'drag'
          } as React.CSSProperties
        }
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          共 {groupedRecords.length} 个会话，
          {groupedRecords.reduce((sum, s) => sum + s.recordCount, 0)} 条记录
          {groupedRecords.length > 0 &&
            ` | 第 ${currentPage}/${Math.ceil(groupedRecords.length / pageSize)} 页`}
        </Text>
        <Space style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <Tooltip title="搜索会话 (Cmd+F / Ctrl+F)">
            <Button
              icon={<SearchOutlined />}
              onClick={() => {
                // 关闭所有弹窗
                setSessionModalVisible(false)
                setRecordModalVisible(false)
                setSummaryModalVisible(false)
                // 打开搜索
                setSearchVisible(true)
                setTimeout(() => {
                  searchInputRef.current?.focus()
                }, 100)
              }}
              size="small"
            />
          </Tooltip>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadHistoryMetadata}
            loading={loading}
            size="small"
          >
            刷新
          </Button>
          <Button
            icon={<ExportOutlined />}
            onClick={handleExport}
            disabled={groupedRecords.length === 0}
            size="small"
          >
            导出
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
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 时间筛选器 */}
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Space wrap>
              <Button
                type={dateRange === 'all' ? 'primary' : 'default'}
                size="small"
                onClick={() => {
                  setCustomDateRange(null)
                  setDateRange('all')
                }}
              >
                全部
              </Button>
              <Button
                type={dateRange === '1d' ? 'primary' : 'default'}
                size="small"
                onClick={() => {
                  const now = dayjs()
                  setCustomDateRange([now.subtract(1, 'day').startOf('day'), now.endOf('day')])
                  setDateRange('1d')
                }}
              >
                1天
              </Button>
              <Button
                type={dateRange === '7d' ? 'primary' : 'default'}
                size="small"
                onClick={() => {
                  const now = dayjs()
                  setCustomDateRange([now.subtract(7, 'day').startOf('day'), now.endOf('day')])
                  setDateRange('7d')
                }}
              >
                7天
              </Button>
              <Button
                type={dateRange === '30d' ? 'primary' : 'default'}
                size="small"
                onClick={() => {
                  const now = dayjs()
                  setCustomDateRange([now.subtract(30, 'day').startOf('day'), now.endOf('day')])
                  setDateRange('30d')
                }}
              >
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

          {/* 项目级别统计 */}
          {!loading && projectStats.length > 0 && (
            <Collapse
              size="small"
              items={[
                {
                  key: 'project-stats',
                  label: (
                    <Space>
                      <BarChartOutlined />
                      <Text style={{ fontSize: 13 }}>
                        项目统计（{projectStats.length} 个项目）
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        总 Token: {projectStats.reduce((s, p) => s + p.totalTokens, 0).toLocaleString()}
                        {' | '}总成本: ${projectStats.reduce((s, p) => s + p.totalCost, 0).toFixed(4)}
                      </Text>
                    </Space>
                  ),
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {projectStats.map(stat => (
                        <div
                          key={stat.project}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 12px',
                            borderRadius: 6,
                            background: themeVars.bgSection,
                            border: `1px solid ${themeVars.borderSecondary}`
                          }}
                        >
                          <Space>
                            <Tag color="blue" style={{ fontSize: 11 }}>
                              {stat.projectName}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {stat.sessionCount} 个会话
                            </Text>
                          </Space>
                          <Space size={4}>
                            {stat.totalTokens > 0 && (
                              <Tag
                                icon={<ThunderboltOutlined />}
                                color="blue"
                                style={{ fontSize: 11 }}
                              >
                                {stat.totalTokens.toLocaleString()} tokens
                              </Tag>
                            )}
                            {stat.totalCost > 0 && (
                              <Tag
                                icon={<DollarOutlined />}
                                color="green"
                                style={{ fontSize: 11 }}
                              >
                                ${stat.totalCost.toFixed(4)}
                              </Tag>
                            )}
                            {stat.toolUseCount > 0 && (
                              <Tag
                                icon={<ToolOutlined />}
                                color="purple"
                                style={{ fontSize: 11 }}
                              >
                                工具 ×{stat.toolUseCount}
                              </Tag>
                            )}
                          </Space>
                        </div>
                      ))}
                    </div>
                  )
                }
              ]}
            />
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
                      onClick={() => handleSessionClick(group)}
                      title={
                        <Space>
                          <Tag color="blue">{getProjectName(group.project)}</Tag>
                          {group.sessionId && !group.sessionId.startsWith('single-') && (
                            <Text code style={{ fontSize: 11 }}>
                              {group.sessionId.slice(0, 8)}
                            </Text>
                          )}
                        </Space>
                      }
                      extra={<ClockCircleOutlined style={{ color: themeVars.textTertiary }} />}
                      actions={[
                        <Button
                          key="full-conversation"
                          type="text"
                          size="small"
                          icon={<FileTextOutlined />}
                          onClick={e => {
                            e.stopPropagation()
                            setConversationSessionId(group.sessionId)
                            setConversationProject(group.project)
                            setConversationModalVisible(true)
                          }}
                        >
                          完整对话
                        </Button>,
                        <Button
                          key="summarize"
                          type="text"
                          size="small"
                          icon={<StarOutlined />}
                          loading={summarizing}
                          onClick={e => {
                            e.stopPropagation()
                            handleSummarize(group)
                          }}
                        >
                          AI 总结
                        </Button>
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
                            <Tag
                              icon={<ThunderboltOutlined />}
                              color="blue"
                              style={{ fontSize: 11 }}
                            >
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
                                        <div key={tool} style={{ fontSize: 11 }}>
                                          {tool}: {count}次
                                        </div>
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
                            <Tag icon={<WarningOutlined />} color="red" style={{ fontSize: 11 }}>
                              有错误
                            </Tag>
                          )}
                        </Space>
                        <Button
                          type="link"
                          size="small"
                          icon={<FolderOpenOutlined />}
                          onClick={e => {
                            e.stopPropagation()
                            handleOpenFolder(group.project)
                          }}
                          style={{ padding: 0, height: 'auto' }}
                        >
                          <Text code style={{ fontSize: 11 }}>
                            {truncateText(group.project, 40)}
                          </Text>
                        </Button>
                      </Space>
                    </Card>
                  </List.Item>
                )}
              />

              {/* 分页组件 */}
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

      {/* 层级 2: Session 详情弹窗 */}
      <ElectronModal
        title={
          <Space>
            <Tag color="blue">{selectedSession && getProjectName(selectedSession.project)}</Tag>
            <Text type="secondary" style={{ fontSize: 13 }}>
              会话详情 ({selectedSession?.records.length || 0} 条对话)
            </Text>
          </Space>
        }
        open={sessionModalVisible}
        onCancel={handleCloseSessionModal}
        closable={true}
        maskClosable={true}
        keyboard={true}
        width="70%"
        footer={[
          <Button
            key="summarize"
            type="default"
            icon={<StarOutlined />}
            loading={summarizing}
            onClick={() => {
              if (selectedSession) {
                handleSummarize(selectedSession)
              }
            }}
          >
            AI 总结
          </Button>,
          <Button key="close" type="primary" onClick={handleCloseSessionModal}>
            关闭
          </Button>
        ]}
        style={{ top: 40 }}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
            padding: '24px 24px 24px 24px'
          } as React.CSSProperties
        }}
        zIndex={1001}
      >
        {sessionDetailsLoading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" tip="加载会话详情中..." />
          </div>
        ) : (
          selectedSession && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {/* Session 信息 */}
              <Card size="small" styles={{ body: { padding: 12 } }}>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      项目名称：
                    </Text>
                    <Text style={{ fontSize: 12 }}>{getProjectName(selectedSession.project)}</Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      最后更新：
                    </Text>
                    <Text style={{ fontSize: 12 }}>
                      {formatTime(selectedSession.latestTimestamp)}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Session ID：
                    </Text>
                    <Text code style={{ fontSize: 12 }}>
                      {selectedSession.sessionId}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      项目路径：
                    </Text>
                    <Button
                      type="link"
                      size="small"
                      icon={<FolderOpenOutlined />}
                      onClick={() => handleOpenFolder(selectedSession.project)}
                      style={{ padding: 0, height: 'auto' }}
                    >
                      <Text code style={{ fontSize: 12 }}>
                        {selectedSession.project}
                      </Text>
                    </Button>
                  </div>
                </Space>
              </Card>

              {/* Records 列表 */}
              <List
                dataSource={selectedSession.records}
                renderItem={(record, index) => (
                  <List.Item style={{ padding: '8px 0' }}>
                    <Card
                      hoverable
                      size="small"
                      style={{ width: '100%' }}
                      onClick={() => handleRecordClick(record)}
                      title={
                        <Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            #{selectedSession.records.length - index}
                          </Text>
                          <ClockCircleOutlined style={{ fontSize: 12 }} />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatTime(record.timestamp)}
                          </Text>
                        </Space>
                      }
                      extra={
                        onSendToChat && (
                          <Tooltip title="发送到AI助手">
                            <Button
                              type="text"
                              size="small"
                              icon={<CommentOutlined style={{ color: themeVars.primary }} />}
                              onClick={e => {
                                e.stopPropagation()
                                onSendToChat(record.display)
                              }}
                            />
                          </Tooltip>
                        )
                      }
                    >
                      <Paragraph
                        ellipsis={{ rows: 2 }}
                        style={{ margin: 0, fontSize: 13, color: themeVars.textSecondary }}
                      >
                        {searchKeyword ? (
                          <Highlighter
                            searchWords={[searchKeyword]}
                            autoEscape
                            textToHighlight={record.display}
                            highlightStyle={{
                              backgroundColor: darkMode
                                ? themeVars.primaryHover
                                : themeVars.primaryLight,
                              color: themeVars.text,
                              padding: 0
                            }}
                          />
                        ) : (
                          record.display
                        )}
                      </Paragraph>
                    </Card>
                  </List.Item>
                )}
              />
            </Space>
          )
        )}
      </ElectronModal>

      {/* 层级 3: Record 详情弹窗 */}
      <ElectronModal
        title={
          <Space>
            <FileTextOutlined />
            <Text>对话详情</Text>
          </Space>
        }
        open={recordModalVisible}
        onCancel={handleCloseRecordModal}
        closable={true}
        maskClosable={true}
        keyboard={true}
        width="60%"
        footer={[
          <Button
            key="delete"
            danger
            icon={<DeleteOutlined />}
            onClick={() => selectedRecord && handleDeleteRecord(selectedRecord)}
          >
            删除
          </Button>,
          onSendToChat && (
            <Button
              key="sendToChat"
              icon={<CommentOutlined />}
              onClick={() => {
                if (selectedRecord) {
                  onSendToChat(selectedRecord.display)
                  handleCloseRecordModal()
                  handleCloseSessionModal()
                }
              }}
            >
              发送到AI助手
            </Button>
          ),
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={() => selectedRecord && handleCopy(selectedRecord.display)}
          >
            复制内容
          </Button>,
          <Button key="close" type="primary" onClick={handleCloseRecordModal}>
            关闭
          </Button>
        ].filter(Boolean)}
        style={{ top: 60 }}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 260px)',
            overflowY: 'auto',
            padding: 16
          } as React.CSSProperties
        }}
        zIndex={1002}
      >
        {selectedRecord && (
          <Card
            size="small"
            styles={{
              body: {
                padding: 12,
                background: themeVars.bgSection,
                border: `1px solid ${themeVars.borderSecondary}`
              }
            }}
          >
            {/* 资源信息栏 */}
            {((selectedRecord.images && selectedRecord.images.length > 0) ||
              (selectedRecord.pastedContents &&
                Object.keys(selectedRecord.pastedContents).length > 0)) && (
              <div style={{ marginBottom: 12 }}>
                <Space size="middle">
                  {selectedRecord.images && selectedRecord.images.length > 0 && (
                    <Text
                      style={{
                        fontSize: 13,
                        color: themeVars.textSecondary
                      }}
                    >
                      <FileImageOutlined style={{ marginRight: 4 }} />
                      {selectedRecord.images.length}张图片
                    </Text>
                  )}
                  {selectedRecord.pastedContents &&
                    Object.keys(selectedRecord.pastedContents).length > 0 && (
                      <Text
                        style={{
                          fontSize: 13,
                          color: themeVars.textSecondary,
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setCopyTextModalContent(selectedRecord.pastedContents || {})
                          setCopyTextModalVisible(true)
                        }}
                      >
                        <FileTextOutlined style={{ marginRight: 4 }} />
                        {Object.keys(selectedRecord.pastedContents).length}个Copy Text
                      </Text>
                    )}
                </Space>

                {/* 图片网格 - 默认显示 */}
                {selectedRecord.images && selectedRecord.images.length > 0 && (
                  <Image.PreviewGroup preview={getCopyablePreviewConfig(darkMode)}>
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 8,
                        flexWrap: 'wrap'
                      }}
                    >
                      {selectedRecord.images.map((imagePath, imgIndex) => (
                        <ImageThumbnail key={imgIndex} imagePath={imagePath} index={imgIndex} />
                      ))}
                    </div>
                  </Image.PreviewGroup>
                )}
              </div>
            )}

            {/* Prompt 内容 */}
            <div style={{ marginBottom: 8 }}>
              <SmartContent
                content={selectedRecord.display}
                darkMode={darkMode}
                hasPastedContents={
                  selectedRecord.pastedContents &&
                  Object.keys(selectedRecord.pastedContents).length > 0
                }
                onPastedTextClick={_pastedTextKey => {
                  // 打开 Copy Text 弹窗
                  setCopyTextModalContent(selectedRecord.pastedContents || {})
                  setCopyTextModalVisible(true)
                }}
              />
            </div>

            {/* 底部信息栏 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: 8,
                borderTop: `1px solid ${themeVars.borderSecondary}`
              }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 11, marginRight: 12 }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {formatTime(selectedRecord.timestamp)}
                </Text>
                <Text
                  code
                  style={{
                    fontSize: 11,
                    cursor: 'pointer',
                    color: themeVars.primary
                  }}
                  onClick={() => handleOpenFolder(selectedRecord.project)}
                >
                  {selectedRecord.project}
                </Text>
              </div>
            </div>
          </Card>
        )}
      </ElectronModal>

      {/* Copy Text 详情弹窗 */}
      <CopyTextModal
        visible={copyTextModalVisible}
        onClose={() => setCopyTextModalVisible(false)}
        content={copyTextModalContent}
        darkMode={darkMode}
        zIndex={1003}
      />

      {/* AI 总结结果弹窗 */}
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
        zIndex={1004}
      >
        <div style={{ fontSize: 14, lineHeight: 1.8 }}>{renderMarkdown(summaryContent)}</div>
      </ElectronModal>

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
              placeholder="搜索项目名称或 Session ID..."
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
              style={{
                borderRadius: 8,
                fontSize: 15
              }}
            />
          </div>

          {/* 搜索结果提示 */}
          <div
            style={{
              textAlign: 'center',
              padding: '20px',
              color: themeVars.textTertiary
            }}
          >
            {!searchKeyword ? (
              <>
                <SearchOutlined style={{ fontSize: 36, marginBottom: 8, opacity: 0.25 }} />
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  输入项目名称或 Session ID 筛选会话
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>提示：按 ESC 关闭搜索</div>
              </>
            ) : searchedSessions.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未找到匹配的会话"
                style={{ padding: '10px 0' }}
              />
            ) : (
              <div style={{ fontSize: 13, color: themeVars.textSecondary }}>
                找到 {searchedSessions.length} 个匹配的会话，已在列表中筛选显示
              </div>
            )}
          </div>
        </div>
      </ElectronModal>

      {/* 完整对话弹窗 */}
      <ConversationDetailModal
        visible={conversationModalVisible}
        sessionId={conversationSessionId}
        project={conversationProject}
        onClose={() => setConversationModalVisible(false)}
      />
    </div>
  )
}

export default HistoryViewer
