import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Card,
  Space,
  Typography,
  Spin,
  Empty,
  Tag,
  Button,
  message,
  Tooltip,
  Slider,
  Select,
  Modal
} from 'antd'
import {
  AppstoreOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  ToolOutlined,
  MessageOutlined,
  FilterOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import { SessionMetadata } from '../types'
import { getThemeVars, STAT_COLORS } from '../theme'
import ConversationDetailModal from './ConversationDetailModal'

const { Text } = Typography

interface SessionBoardViewProps {
  darkMode: boolean
}

type MetricKey = 'tokens' | 'cost' | 'tools' | 'messages'

/* 指标配置 */
const METRIC_CONFIG: Record<MetricKey, { label: string; color: string; icon: React.ReactNode }> = {
  tokens: { label: 'Token 使用量', color: STAT_COLORS.tokens, icon: <ThunderboltOutlined /> },
  cost: { label: '成本 (USD)', color: STAT_COLORS.cost, icon: <DollarOutlined /> },
  tools: { label: '工具调用数', color: STAT_COLORS.sessions, icon: <ToolOutlined /> },
  messages: { label: '消息数', color: STAT_COLORS.projects, icon: <MessageOutlined /> }
}

/* 获取指标值 */
const getMetricValue = (session: SessionMetadata, metric: MetricKey): number => {
  switch (metric) {
    case 'tokens': return session.total_tokens || 0
    case 'cost': return session.total_cost_usd || 0
    case 'tools': return session.tool_use_count || 0
    case 'messages': return session.recordCount || 0
    default: return 0
  }
}

/* 根据百分比获取颜色深度 */
const getHeatColor = (percent: number, baseColor: string, darkMode: boolean): string => {
  const themeVars = getThemeVars(darkMode)
  if (percent === 0) return themeVars.itemBg
  const alpha = Math.max(0.15, Math.min(1, percent))
  // 简单的透明度映射
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `${baseColor}${alphaHex}`
}

const SessionBoardView = (props: SessionBoardViewProps) => {
  const { darkMode } = props
  const themeVars = getThemeVars(darkMode)
  const [sessions, setSessions] = useState<SessionMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('tokens')
  const [filterRange, setFilterRange] = useState<[number, number]>([0, 100])
  const [hoveredSession, setHoveredSession] = useState<SessionMetadata | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>('all')

  // 对话详情弹窗
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailSessionId, setDetailSessionId] = useState('')
  const [detailProject, setDetailProject] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.readHistoryMetadata()
      if (result.success && result.sessions) {
        setSessions(result.sessions)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      message.error('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  /* 项目列表 */
  const projects = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach(s => set.add(s.project))
    return Array.from(set).sort()
  }, [sessions])

  /* 按项目和筛选范围过滤 */
  const filteredSessions = useMemo(() => {
    let result = sessions
    if (selectedProject !== 'all') {
      result = result.filter(s => s.project === selectedProject)
    }
    return result.sort((a, b) => b.latestTimestamp - a.latestTimestamp)
  }, [sessions, selectedProject])

  /* 指标范围 */
  const metricStats = useMemo(() => {
    if (filteredSessions.length === 0) return { min: 0, max: 1, values: [] }
    const values = filteredSessions.map(s => getMetricValue(s, selectedMetric))
    return {
      min: Math.min(...values),
      max: Math.max(...values) || 1,
      values
    }
  }, [filteredSessions, selectedMetric])

  /* 按筛选范围过滤后的会话 */
  const displayedSessions = useMemo(() => {
    const { max } = metricStats
    return filteredSessions.filter(s => {
      const val = getMetricValue(s, selectedMetric)
      const percent = (val / max) * 100
      return percent >= filterRange[0] && percent <= filterRange[1]
    })
  }, [filteredSessions, metricStats, selectedMetric, filterRange])

  /* 点击会话块 */
  const handleSessionClick = useCallback((session: SessionMetadata) => {
    setDetailSessionId(session.sessionId)
    setDetailProject(session.project)
    setDetailVisible(true)
  }, [])

  /* 格式化指标值 */
  const formatMetricValue = (value: number, metric: MetricKey): string => {
    switch (metric) {
      case 'tokens': return value.toLocaleString()
      case 'cost': return `$${value.toFixed(4)}`
      case 'tools': return value.toString()
      case 'messages': return value.toString()
      default: return value.toString()
    }
  }

  /* 获取项目短名 */
  const getProjectShortName = (project: string): string => {
    const parts = project.split('/')
    return parts[parts.length - 1] || '未知'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" tip="加载会话数据..."><div style={{ padding: 40 }} /></Spin>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Empty description="暂无会话数据" />
      </div>
    )
  }

  const metricConfig = METRIC_CONFIG[selectedMetric]

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
      {/* 顶部操作栏 */}
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
        <Space>
          <AppstoreOutlined style={{ fontSize: 16, color: themeVars.primary }} />
          <Text strong style={{ fontSize: 14 }}>
            Session Board
          </Text>
          <Tag>{displayedSessions.length} / {filteredSessions.length} 个会话</Tag>
        </Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadData}
          loading={loading}
          size="small"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          刷新
        </Button>
      </div>

      {/* 筛选控制面板 */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: `1px solid ${themeVars.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap'
        }}
      >
        <Space>
          <FilterOutlined style={{ color: themeVars.textSecondary }} />
          <Text type="secondary" style={{ fontSize: 12 }}>着色指标:</Text>
          <Select
            value={selectedMetric}
            onChange={setSelectedMetric}
            size="small"
            style={{ width: 140 }}
            options={Object.entries(METRIC_CONFIG).map(([key, cfg]) => ({
              value: key,
              label: (
                <Space size={4}>
                  {cfg.icon}
                  <span>{cfg.label}</span>
                </Space>
              )
            }))}
          />
        </Space>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>项目:</Text>
          <Select
            value={selectedProject}
            onChange={setSelectedProject}
            size="small"
            style={{ width: 180 }}
            options={[
              { value: 'all', label: '全部项目' },
              ...projects.map(p => ({ value: p, label: getProjectShortName(p) }))
            ]}
          />
        </Space>
        <Space style={{ flex: 1, minWidth: 200 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>范围筛选:</Text>
          <Slider
            range
            value={filterRange}
            onChange={(v) => setFilterRange(v as [number, number])}
            style={{ flex: 1, minWidth: 120, margin: '0 8px' }}
            tooltip={{ formatter: (v) => `${v}%` }}
          />
        </Space>
      </div>

      {/* 像素视图内容 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 24px',
          minHeight: 0
        }}
      >
        {displayedSessions.length === 0 ? (
          <Empty description="没有匹配的会话" style={{ padding: 60 }} />
        ) : (
          <div>
            {/* 颜色图例 */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {metricConfig.icon} {metricConfig.label}:
              </Text>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Text type="secondary" style={{ fontSize: 10 }}>低</Text>
                {[0.1, 0.25, 0.5, 0.75, 1].map(opacity => (
                  <div
                    key={opacity}
                    style={{
                      width: 20,
                      height: 12,
                      background: getHeatColor(opacity, metricConfig.color, darkMode),
                      borderRadius: 2
                    }}
                  />
                ))}
                <Text type="secondary" style={{ fontSize: 10 }}>高</Text>
              </div>
              <Tooltip title="每个方块代表一个会话，颜色深度表示指标值的相对大小。点击可查看详情。">
                <InfoCircleOutlined style={{ color: themeVars.textTertiary, fontSize: 12 }} />
              </Tooltip>
            </div>

            {/* 像素网格 */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4
              }}
            >
              {displayedSessions.map(session => {
                const value = getMetricValue(session, selectedMetric)
                const percent = metricStats.max > 0 ? value / metricStats.max : 0
                const isHovered = hoveredSession?.sessionId === session.sessionId

                return (
                  <Tooltip
                    key={session.sessionId}
                    title={
                      <div style={{ fontSize: 11 }}>
                        <div><b>{getProjectShortName(session.project)}</b></div>
                        <div>ID: {session.sessionId.slice(0, 12)}</div>
                        <div>时间: {new Date(session.latestTimestamp).toLocaleString('zh-CN')}</div>
                        <div>消息: {session.recordCount}</div>
                        <div>Token: {(session.total_tokens || 0).toLocaleString()}</div>
                        <div>成本: ${(session.total_cost_usd || 0).toFixed(4)}</div>
                        <div>工具: {session.tool_use_count || 0}</div>
                      </div>
                    }
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 4,
                        background: getHeatColor(percent, metricConfig.color, darkMode),
                        border: isHovered
                          ? `2px solid ${metricConfig.color}`
                          : `1px solid ${themeVars.borderSecondary}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                        zIndex: isHovered ? 10 : 1,
                        position: 'relative'
                      }}
                      onMouseEnter={() => setHoveredSession(session)}
                      onMouseLeave={() => setHoveredSession(null)}
                      onClick={() => handleSessionClick(session)}
                    >
                      <Text
                        style={{
                          fontSize: 8,
                          color: percent > 0.5
                            ? themeVars.textWhite
                            : themeVars.textSecondary,
                          fontFamily: 'monospace',
                          lineHeight: 1,
                          textAlign: 'center',
                          overflow: 'hidden'
                        }}
                      >
                        {getProjectShortName(session.project).slice(0, 3)}
                      </Text>
                    </div>
                  </Tooltip>
                )
              })}
            </div>

            {/* 悬浮详情面板 */}
            {hoveredSession && (
              <Card
                size="small"
                style={{
                  position: 'sticky',
                  bottom: 0,
                  marginTop: 16,
                  border: `1px solid ${metricConfig.color}40`
                }}
              >
                <Space wrap size={12}>
                  <Tag color="#D97757">{getProjectShortName(hoveredSession.project)}</Tag>
                  <Text code style={{ fontSize: 11 }}>
                    {hoveredSession.sessionId.slice(0, 12)}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(hoveredSession.latestTimestamp).toLocaleString('zh-CN')}
                  </Text>
                  <Tag icon={<MessageOutlined />} style={{ fontSize: 11 }}>
                    {hoveredSession.recordCount} 条消息
                  </Tag>
                  <Tag icon={<ThunderboltOutlined />} color="#D97757" style={{ fontSize: 11 }}>
                    {(hoveredSession.total_tokens || 0).toLocaleString()} tokens
                  </Tag>
                  <Tag icon={<DollarOutlined />} color="green" style={{ fontSize: 11 }}>
                    ${(hoveredSession.total_cost_usd || 0).toFixed(4)}
                  </Tag>
                  <Tag icon={<ToolOutlined />} color="purple" style={{ fontSize: 11 }}>
                    {hoveredSession.tool_use_count || 0} 次工具
                  </Tag>
                </Space>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* 对话详情弹窗 */}
      <ConversationDetailModal
        visible={detailVisible}
        sessionId={detailSessionId}
        project={detailProject}
        onClose={() => setDetailVisible(false)}
      />
    </div>
  )
}

export default SessionBoardView
