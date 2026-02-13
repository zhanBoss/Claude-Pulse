import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Card,
  Statistic,
  Space,
  Typography,
  Spin,
  Empty,
  Tag,
  Button,
  message,
  Tabs,
  Checkbox,
  Modal,
  Select,
  Tooltip as AntTooltip
} from 'antd'
import {
  ThunderboltOutlined,
  DollarOutlined,
  MessageOutlined,
  ToolOutlined,
  FolderOutlined,
  ReloadOutlined,
  BarChartOutlined,
  SwapOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  SettingOutlined
} from '@ant-design/icons'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts'
import { SessionMetadata } from '../types'
import { getThemeVars, CHART_COLORS, STAT_COLORS } from '../theme'
import ConversationDetailModal from './ConversationDetailModal'
import TokenPriceModal from './TokenPriceModal'

const { Text } = Typography

interface StatisticsDashboardProps {
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

/* 格式化毫秒为可读时间 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
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
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return `${baseColor}${alphaHex}`
}

/* 获取项目短名 */
const getProjectShortName = (project: string): string => {
  const parts = project.split('/')
  return parts[parts.length - 1] || '未知'
}

const StatisticsDashboard = (props: StatisticsDashboardProps) => {
  const { darkMode } = props
  const themeVars = getThemeVars(darkMode)
  const [sessions, setSessions] = useState<SessionMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  // 会话地图相关状态
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('tokens')
  const [filterRange, _setFilterRange] = useState<[number, number]>([0, 100])
  const [hoveredSession, setHoveredSession] = useState<SessionMetadata | null>(null)
  const [selectedProject, setSelectedProject] = useState<string>('all')
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailSessionId, setDetailSessionId] = useState('')
  const [detailProject, setDetailProject] = useState('')

  // 项目对比相关状态
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [compareVisible, setCompareVisible] = useState(false)

  // Token 价格配置弹窗状态
  const [tokenPriceModalOpen, setTokenPriceModalOpen] = useState(false)

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

  // 全局汇总统计
  const globalStats = useMemo(() => {
    let totalTokens = 0
    let totalCost = 0
    let totalSessions = sessions.length
    let totalToolUse = 0
    let sessionsWithErrors = 0
    const projects = new Set<string>()

    for (const s of sessions) {
      totalTokens += s.total_tokens || 0
      totalCost += s.total_cost_usd || 0
      totalToolUse += s.tool_use_count || 0
      if (s.has_errors) sessionsWithErrors++
      projects.add(s.project)
    }

    return {
      totalTokens,
      totalCost,
      totalSessions,
      totalToolUse,
      sessionsWithErrors,
      projectCount: projects.size
    }
  }, [sessions])

  // 项目级别统计
  const projectStats = useMemo(() => {
    const statsMap = new Map<string, {
      project: string
      projectName: string
      sessionCount: number
      totalTokens: number
      totalCost: number
      toolUseCount: number
    }>()

    for (const s of sessions) {
      const projectName = getProjectShortName(s.project)
      const existing = statsMap.get(s.project)

      if (existing) {
        existing.sessionCount += 1
        existing.totalTokens += s.total_tokens || 0
        existing.totalCost += s.total_cost_usd || 0
        existing.toolUseCount += s.tool_use_count || 0
      } else {
        statsMap.set(s.project, {
          project: s.project,
          projectName,
          sessionCount: 1,
          totalTokens: s.total_tokens || 0,
          totalCost: s.total_cost_usd || 0,
          toolUseCount: s.tool_use_count || 0
        })
      }
    }

    return Array.from(statsMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)
  }, [sessions])

  // 工具使用汇总
  const toolStats = useMemo(() => {
    const toolMap = new Map<string, number>()

    for (const s of sessions) {
      if (s.tool_usage) {
        for (const [tool, count] of Object.entries(s.tool_usage)) {
          toolMap.set(tool, (toolMap.get(tool) || 0) + count)
        }
      }
    }

    return Array.from(toolMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [sessions])

  // 工具成功率统计
  const toolSuccessStats = useMemo(() => {
    const usageMap = new Map<string, number>()
    const errorMap = new Map<string, number>()

    for (const s of sessions) {
      if (s.tool_usage) {
        for (const [tool, count] of Object.entries(s.tool_usage)) {
          usageMap.set(tool, (usageMap.get(tool) || 0) + count)
        }
      }
      if (s.tool_errors) {
        for (const [tool, count] of Object.entries(s.tool_errors)) {
          errorMap.set(tool, (errorMap.get(tool) || 0) + count)
        }
      }
    }

    return Array.from(usageMap.entries())
      .map(([name, total]) => {
        const errors = errorMap.get(name) || 0
        const success = total - errors
        const successRate = total > 0 ? (success / total) * 100 : 100
        return { name, total, success, errors, successRate }
      })
      .sort((a, b) => b.total - a.total)
  }, [sessions])

  // 工具平均耗时统计
  const toolDurationStats = useMemo(() => {
    const durationMap = new Map<string, { totalMs: number; count: number }>()

    for (const s of sessions) {
      if (s.tool_avg_duration && s.tool_usage) {
        for (const [tool, avgMs] of Object.entries(s.tool_avg_duration)) {
          const callCount = s.tool_usage[tool] || 1
          const existing = durationMap.get(tool) || { totalMs: 0, count: 0 }
          existing.totalMs += avgMs * callCount
          existing.count += callCount
          durationMap.set(tool, existing)
        }
      }
    }

    return Array.from(durationMap.entries())
      .map(([name, dur]) => ({
        name,
        avgMs: Math.round(dur.totalMs / dur.count),
        count: dur.count
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
  }, [sessions])

  // 工具使用饼图数据
  const toolPieData = useMemo(() => {
    const top8 = toolStats.slice(0, 8)
    const others = toolStats.slice(8)
    const otherCount = others.reduce((s, t) => s + t.count, 0)

    const result = top8.map(t => ({ name: t.name, value: t.count }))
    if (otherCount > 0) {
      result.push({ name: '其他', value: otherCount })
    }
    return result
  }, [toolStats])

  // 会话地图数据
  const projects = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach(s => set.add(s.project))
    return Array.from(set).sort()
  }, [sessions])

  const filteredSessions = useMemo(() => {
    let result = sessions
    if (selectedProject !== 'all') {
      result = result.filter(s => s.project === selectedProject)
    }
    return result.sort((a, b) => b.latestTimestamp - a.latestTimestamp)
  }, [sessions, selectedProject])

  const metricStats = useMemo(() => {
    if (filteredSessions.length === 0) return { min: 0, max: 1, values: [] }
    const values = filteredSessions.map(s => getMetricValue(s, selectedMetric))
    return {
      min: Math.min(...values),
      max: Math.max(...values) || 1,
      values
    }
  }, [filteredSessions, selectedMetric])

  const displayedSessions = useMemo(() => {
    const { max } = metricStats
    return filteredSessions.filter(s => {
      const val = getMetricValue(s, selectedMetric)
      const percent = (val / max) * 100
      return percent >= filterRange[0] && percent <= filterRange[1]
    })
  }, [filteredSessions, metricStats, selectedMetric, filterRange])

  // 项目对比数据
  const toggleProjectSelect = useCallback((project: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev)
      if (next.has(project)) {
        next.delete(project)
      } else {
        if (next.size >= 5) {
          message.warning('最多选择 5 个项目进行对比')
          return prev
        }
        next.add(project)
      }
      return next
    })
  }, [])

  const compareRadarData = useMemo(() => {
    if (selectedProjects.size < 2) return []
    const selected = projectStats.filter(p => selectedProjects.has(p.project))
    if (selected.length < 2) return []

    const maxTokens = Math.max(...selected.map(s => s.totalTokens)) || 1
    const maxCost = Math.max(...selected.map(s => s.totalCost)) || 1
    const maxSessions = Math.max(...selected.map(s => s.sessionCount)) || 1
    const maxTools = Math.max(...selected.map(s => s.toolUseCount)) || 1
    const maxAvgTokens = Math.max(...selected.map(s => s.sessionCount > 0 ? s.totalTokens / s.sessionCount : 0)) || 1

    const metrics = ['会话数', 'Token 总量', '成本', '工具调用', '单会话均Token']

    return metrics.map((metric, idx) => {
      const entry: Record<string, string | number> = { metric }
      for (const p of selected) {
        const avgTokens = p.sessionCount > 0 ? p.totalTokens / p.sessionCount : 0
        const values = [
          p.sessionCount / maxSessions * 100,
          p.totalTokens / maxTokens * 100,
          p.totalCost / maxCost * 100,
          p.toolUseCount / maxTools * 100,
          avgTokens / maxAvgTokens * 100
        ]
        entry[p.projectName] = Math.round(values[idx])
      }
      return entry
    })
  }, [selectedProjects, projectStats])

  const compareBarData = useMemo(() => {
    if (selectedProjects.size < 2) return []
    return projectStats
      .filter(p => selectedProjects.has(p.project))
      .map(p => ({
        name: p.projectName.length > 15 ? p.projectName.slice(0, 15) + '...' : p.projectName,
        tokens: p.totalTokens,
        cost: Number(p.totalCost.toFixed(4)),
        sessions: p.sessionCount,
        tools: p.toolUseCount
      }))
  }, [selectedProjects, projectStats])

  const handleSessionClick = useCallback((session: SessionMetadata) => {
    setDetailSessionId(session.sessionId)
    setDetailProject(session.project)
    setDetailVisible(true)
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" tip="加载数据..."><div style={{ padding: 40 }} /></Spin>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Empty description="暂无数据" />
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
          <DashboardOutlined style={{ fontSize: 16, color: themeVars.primary }} />
          <Text strong style={{ fontSize: 14 }}>
            统计分析看板
          </Text>
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

      {/* 标签页 */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '0 16px'
        }}
        items={[
          {
            key: 'overview',
            label: (
              <Space size={4}>
                <DashboardOutlined />
                <span>数据概览</span>
              </Space>
            ),
            children: (
              <div style={{ height: '100%', overflow: 'auto', padding: '16px 24px' }}>
                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                  {/* 全局统计卡片 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <Card size="small" styles={{ body: { padding: 16 } }}>
                      <Statistic
                        title="总 Token"
                        value={globalStats.totalTokens}
                        prefix={<ThunderboltOutlined style={{ color: STAT_COLORS.tokens }} />}
                        valueStyle={{ fontSize: 20, color: STAT_COLORS.tokens }}
                        formatter={(value) => Number(value).toLocaleString()}
                      />
                    </Card>
                    <Card
                      size="small"
                      styles={{ body: { padding: 16, position: 'relative' } }}
                    >
                      <AntTooltip title="设置 Token 价格">
                        <Button
                          type="text"
                          size="small"
                          icon={<SettingOutlined />}
                          onClick={() => setTokenPriceModalOpen(true)}
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            color: themeVars.textSecondary,
                            padding: 4,
                            height: 'auto',
                            lineHeight: 1
                          }}
                        />
                      </AntTooltip>
                      <Statistic
                        title="总成本 (USD)"
                        value={globalStats.totalCost}
                        prefix={<DollarOutlined style={{ color: STAT_COLORS.cost }} />}
                        precision={4}
                        valueStyle={{ fontSize: 20, color: STAT_COLORS.cost }}
                      />
                    </Card>
                    <Card size="small" styles={{ body: { padding: 16 } }}>
                      <Statistic
                        title="会话数"
                        value={globalStats.totalSessions}
                        prefix={<MessageOutlined style={{ color: STAT_COLORS.sessions }} />}
                        valueStyle={{ fontSize: 20, color: STAT_COLORS.sessions }}
                      />
                    </Card>
                    <Card size="small" styles={{ body: { padding: 16 } }}>
                      <Statistic
                        title="项目数"
                        value={globalStats.projectCount}
                        prefix={<FolderOutlined style={{ color: STAT_COLORS.projects }} />}
                        valueStyle={{ fontSize: 20, color: STAT_COLORS.projects }}
                      />
                    </Card>
                    <Card size="small" styles={{ body: { padding: 16 } }}>
                      <Statistic
                        title="工具调用"
                        value={globalStats.totalToolUse}
                        prefix={<ToolOutlined style={{ color: STAT_COLORS.tools }} />}
                        valueStyle={{ fontSize: 20, color: STAT_COLORS.tools }}
                        formatter={(value) => Number(value).toLocaleString()}
                      />
                    </Card>
                  </div>

                  {/* 会话地图 - 紧凑布局 */}
                  <Card
                    size="small"
                    title={
                      <Space>
                        <AppstoreOutlined />
                        <Text style={{ fontSize: 13 }}>会话地图</Text>
                      </Space>
                    }
                    extra={
                      <Space size={8}>
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 11 }}>指标:</Text>
                          <Select
                            value={selectedMetric}
                            onChange={setSelectedMetric}
                            size="small"
                            style={{ width: 110 }}
                            options={Object.entries(METRIC_CONFIG).map(([key, cfg]) => ({
                              value: key,
                              label: cfg.label
                            }))}
                          />
                        </Space>
                        <Space size={4}>
                          <Text type="secondary" style={{ fontSize: 11 }}>项目:</Text>
                          <Select
                            value={selectedProject}
                            onChange={setSelectedProject}
                            size="small"
                            style={{ width: 130 }}
                            options={[
                              { value: 'all', label: '全部项目' },
                              ...projects.map(p => ({ value: p, label: getProjectShortName(p) }))
                            ]}
                          />
                        </Space>
                        <Tag color="#D97757">{displayedSessions.length} / {filteredSessions.length}</Tag>
                      </Space>
                    }
                    styles={{ body: { padding: '12px 16px' } }}
                  >
                    {displayedSessions.length === 0 ? (
                      <Empty description="没有匹配的会话" style={{ padding: 20 }} />
                    ) : (
                      <div>
                        {/* 颜色图例 - 更紧凑 */}
                        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            {metricConfig.icon} {metricConfig.label}:
                          </Text>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Text type="secondary" style={{ fontSize: 9 }}>低</Text>
                            {[0.2, 0.4, 0.6, 0.8, 1].map(opacity => (
                              <div
                                key={opacity}
                                style={{
                                  width: 12,
                                  height: 8,
                                  background: getHeatColor(opacity, metricConfig.color, darkMode),
                                  borderRadius: 1
                                }}
                              />
                            ))}
                            <Text type="secondary" style={{ fontSize: 9 }}>高</Text>
                          </div>
                        </div>

                        {/* 像素网格 - 更小的方块 */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxHeight: 180, overflow: 'auto' }}>
                          {displayedSessions.map(session => {
                            const value = getMetricValue(session, selectedMetric)
                            const percent = metricStats.max > 0 ? value / metricStats.max : 0
                            const isHovered = hoveredSession?.sessionId === session.sessionId

                            return (
                              <AntTooltip
                                key={session.sessionId}
                                title={
                                  <div style={{ fontSize: 10 }}>
                                    <div><b>{getProjectShortName(session.project)}</b></div>
                                    <div>Token: {(session.total_tokens || 0).toLocaleString()}</div>
                                    <div>成本: ${(session.total_cost_usd || 0).toFixed(4)}</div>
                                    <div>工具: {session.tool_use_count || 0}</div>
                                  </div>
                                }
                              >
                                <div
                                  style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 3,
                                    background: getHeatColor(percent, metricConfig.color, darkMode),
                                    border: isHovered
                                      ? `2px solid ${metricConfig.color}`
                                      : `1px solid ${themeVars.borderSecondary}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.12s',
                                    transform: isHovered ? 'scale(1.15)' : 'scale(1)',
                                    zIndex: isHovered ? 10 : 1
                                  }}
                                  onMouseEnter={() => setHoveredSession(session)}
                                  onMouseLeave={() => setHoveredSession(null)}
                                  onClick={() => handleSessionClick(session)}
                                />
                              </AntTooltip>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </Card>

                  {/* 图表区域 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {/* 项目 Token 使用量 - 横向柱状图 */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <BarChartOutlined />
                          <Text style={{ fontSize: 13 }}>
                            项目 Token 使用量{projectStats.length > 10 ? ' Top 10' : ''}
                          </Text>
                        </Space>
                      }
                    >
                      {projectStats.length > 0 ? (
                        <ResponsiveContainer width="100%" height={340}>
                          <BarChart
                            data={projectStats.slice(0, 10)}
                            margin={{ top: 16, right: 16, left: 0, bottom: 4 }}
                            barCategoryGap="30%"
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke={themeVars.borderSecondary}
                              vertical={false}
                            />
                            <XAxis
                              dataKey="projectName"
                              tick={{ fontSize: 11, fill: themeVars.textSecondary }}
                              tickFormatter={(value) => value.length > 12 ? value.slice(0, 12) + '…' : value}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: themeVars.textTertiary }}
                              tickFormatter={(value) => {
                                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                                if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                                return value.toString()
                              }}
                              axisLine={false}
                              tickLine={false}
                              width={48}
                            />
                            <RechartsTooltip
                              contentStyle={{
                                background: themeVars.bgContainer,
                                border: `1px solid ${themeVars.border}`,
                                borderRadius: 6,
                                fontSize: 12
                              }}
                              formatter={(value) => [`${(value as number).toLocaleString()} tokens`, 'Token 总量']}
                              cursor={{ fill: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}
                            />
                            <Bar
                              dataKey="totalTokens"
                              fill={STAT_COLORS.tokens}
                              radius={[4, 4, 0, 0]}
                              maxBarSize={56}
                              minPointSize={4}
                              label={{
                                position: 'top',
                                fontSize: 10,
                                fill: themeVars.textTertiary,
                                formatter: (value) => {
                                  const numValue = value as number
                                  if (numValue >= 1000000) return `${(numValue / 1000000).toFixed(1)}M`
                                  if (numValue >= 1000) return `${(numValue / 1000).toFixed(0)}K`
                                  return numValue.toString()
                                }
                              }}
                            >
                              {projectStats.slice(0, 10).map((_, index) => {
                                const opacity = 1 - (index * 0.06)
                                return (
                                  <Cell
                                    key={`bar-${index}`}
                                    fill={STAT_COLORS.tokens}
                                    fillOpacity={Math.max(0.45, opacity)}
                                  />
                                )
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty description="暂无数据" style={{ padding: 40 }} />
                      )}
                    </Card>

                    {/* 工具使用饼图 */}
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ToolOutlined />
                          <Text style={{ fontSize: 13 }}>工具使用分布</Text>
                        </Space>
                      }
                    >
                      {toolPieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={340}>
                          <PieChart>
                            <Pie
                              data={toolPieData}
                              cx="50%"
                              cy="45%"
                              outerRadius={100}
                              innerRadius={50}
                              dataKey="value"
                              label={({ name, percent }) =>
                                `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                              }
                              labelLine={{ stroke: themeVars.textTertiary }}
                            >
                              {toolPieData.map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <RechartsTooltip
                              contentStyle={{
                                background: themeVars.bgContainer,
                                border: `1px solid ${themeVars.border}`,
                                borderRadius: 6,
                                fontSize: 12
                              }}
                              formatter={(value, name) => [
                                `${(value ?? 0).toLocaleString()} 次`,
                                name ?? ''
                              ]}
                            />
                            <Legend
                              wrapperStyle={{ fontSize: 11 }}
                              layout="horizontal"
                              verticalAlign="bottom"
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <Empty description="暂无工具调用数据" style={{ padding: 40 }} />
                      )}
                    </Card>
                  </div>
                </Space>
              </div>
            )
          },
          {
            key: 'project-analysis',
            label: (
              <Space size={4}>
                <FolderOutlined />
                <span>项目分析</span>
              </Space>
            ),
            children: (
              <div style={{ height: '100%', overflow: 'auto', padding: '16px 24px' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {/* 项目详细统计表格 */}
                  <Card
                    size="small"
                    title={
                      <Space>
                        <FolderOutlined />
                        <Text style={{ fontSize: 13 }}>项目详细统计</Text>
                        {selectedProjects.size > 0 && (
                          <Tag color="#D97757">{selectedProjects.size} 个已选</Tag>
                        )}
                      </Space>
                    }
                    extra={
                      <Space>
                        {selectedProjects.size >= 2 && (
                          <Button
                            type="primary"
                            size="small"
                            icon={<SwapOutlined />}
                            onClick={() => setCompareVisible(true)}
                          >
                            对比 ({selectedProjects.size})
                          </Button>
                        )}
                        {selectedProjects.size > 0 && (
                          <Button
                            size="small"
                            icon={<CloseOutlined />}
                            onClick={() => setSelectedProjects(new Set())}
                          >
                            清除
                          </Button>
                        )}
                      </Space>
                    }
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {/* 表头 */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '32px 2fr 1fr 1fr 1fr 1fr',
                          gap: 8,
                          padding: '6px 12px',
                          borderBottom: `1px solid ${themeVars.border}`,
                          fontSize: 12,
                          fontWeight: 600,
                          color: themeVars.textSecondary
                        }}
                      >
                        <div />
                        <div>项目</div>
                        <div style={{ textAlign: 'right' }}>会话数</div>
                        <div style={{ textAlign: 'right' }}>Token</div>
                        <div style={{ textAlign: 'right' }}>成本 (USD)</div>
                        <div style={{ textAlign: 'right' }}>工具调用</div>
                      </div>

                      {/* 数据行 */}
                      {projectStats.map(stat => (
                        <div
                          key={stat.project}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '32px 2fr 1fr 1fr 1fr 1fr',
                            gap: 8,
                            padding: '6px 12px',
                            borderRadius: 4,
                            fontSize: 12,
                            background: selectedProjects.has(stat.project)
                              ? darkMode ? 'rgba(217, 119, 87, 0.15)' : 'rgba(217, 119, 87, 0.08)'
                              : themeVars.bgSection,
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                          }}
                          onClick={() => toggleProjectSelect(stat.project)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Checkbox checked={selectedProjects.has(stat.project)} />
                          </div>
                          <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {stat.projectName}
                          </div>
                          <div style={{ textAlign: 'right', color: themeVars.textSecondary }}>
                            {stat.sessionCount}
                          </div>
                          <div style={{ textAlign: 'right', color: STAT_COLORS.tokens }}>
                            {stat.totalTokens.toLocaleString()}
                          </div>
                          <div style={{ textAlign: 'right', color: STAT_COLORS.cost }}>
                            ${stat.totalCost.toFixed(4)}
                          </div>
                          <div style={{ textAlign: 'right', color: STAT_COLORS.tools }}>
                            {stat.toolUseCount.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </Space>
              </div>
            )
          },
          {
            key: 'tool-analysis',
            label: (
              <Space size={4}>
                <ToolOutlined />
                <span>工具分析</span>
              </Space>
            ),
            children: (
              <div style={{ height: '100%', overflow: 'auto', padding: '16px 24px' }}>
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {/* 最常用工具排行 */}
                  {toolStats.length > 0 && (
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ToolOutlined />
                          <Text style={{ fontSize: 13 }}>工具使用排行榜</Text>
                        </Space>
                      }
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {toolStats.slice(0, 15).map((tool, index) => {
                          const maxCount = toolStats[0]?.count || 1
                          const percentage = (tool.count / maxCount) * 100
                          return (
                            <div
                              key={tool.name}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12
                              }}
                            >
                              <Text
                                style={{
                                  width: 24,
                                  textAlign: 'right',
                                  fontSize: 12,
                                  color: index < 3 ? themeVars.primary : themeVars.textTertiary,
                                  fontWeight: index < 3 ? 600 : 400
                                }}
                              >
                                #{index + 1}
                              </Text>
                              <Text
                                style={{
                                  width: 140,
                                  fontSize: 12,
                                  fontFamily: 'monospace'
                                }}
                              >
                                {tool.name}
                              </Text>
                              <div
                                style={{
                                  flex: 1,
                                  height: 16,
                                  background: themeVars.bgSection,
                                  borderRadius: 4,
                                  overflow: 'hidden'
                                }}
                              >
                                <div
                                  style={{
                                    width: `${percentage}%`,
                                    height: '100%',
                                    background: CHART_COLORS[index % CHART_COLORS.length],
                                    borderRadius: 4,
                                    transition: 'width 0.3s ease'
                                  }}
                                />
                              </div>
                              <Tag style={{ fontSize: 11, minWidth: 60, textAlign: 'center' }}>
                                {tool.count.toLocaleString()} 次
                              </Tag>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}

                  {/* 工具成功率统计 */}
                  {toolSuccessStats.length > 0 && (
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ToolOutlined />
                          <Text style={{ fontSize: 13 }}>工具成功率</Text>
                        </Space>
                      }
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {/* 表头 */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '140px 1fr 80px 80px 80px 100px',
                            gap: 8,
                            padding: '6px 12px',
                            borderBottom: `1px solid ${themeVars.border}`,
                            fontSize: 12,
                            fontWeight: 600,
                            color: themeVars.textSecondary
                          }}
                        >
                          <div>工具名称</div>
                          <div>成功率</div>
                          <div style={{ textAlign: 'right' }}>总调用</div>
                          <div style={{ textAlign: 'right' }}>成功</div>
                          <div style={{ textAlign: 'right' }}>失败</div>
                          <div style={{ textAlign: 'right' }}>成功率</div>
                        </div>
                        {toolSuccessStats.slice(0, 20).map(tool => (
                          <div
                            key={tool.name}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '140px 1fr 80px 80px 80px 100px',
                              gap: 8,
                              padding: '6px 12px',
                              borderRadius: 4,
                              fontSize: 12,
                              background: themeVars.bgSection,
                              alignItems: 'center'
                            }}
                          >
                            <div style={{ fontFamily: 'monospace', fontWeight: 500 }}>{tool.name}</div>
                            <div style={{ height: 12, background: themeVars.progressBg, borderRadius: 6, overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${tool.successRate}%`,
                                  height: '100%',
                                  background: tool.successRate >= 90 ? themeVars.progressSuccess : tool.successRate >= 70 ? themeVars.progressWarning : themeVars.progressError,
                                  borderRadius: 6,
                                  transition: 'width 0.3s'
                                }}
                              />
                            </div>
                            <div style={{ textAlign: 'right' }}>{tool.total.toLocaleString()}</div>
                            <div style={{ textAlign: 'right', color: themeVars.success }}>{tool.success.toLocaleString()}</div>
                            <div style={{ textAlign: 'right', color: tool.errors > 0 ? themeVars.error : themeVars.textTertiary }}>
                              {tool.errors.toLocaleString()}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <Tag
                                color={tool.successRate >= 90 ? 'green' : tool.successRate >= 70 ? 'orange' : 'red'}
                                style={{ fontSize: 11, margin: 0 }}
                              >
                                {tool.successRate.toFixed(1)}%
                              </Tag>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* 工具平均耗时 */}
                  {toolDurationStats.length > 0 && (
                    <Card
                      size="small"
                      title={
                        <Space>
                          <ClockCircleOutlined />
                          <Text style={{ fontSize: 13 }}>工具平均耗时</Text>
                        </Space>
                      }
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {toolDurationStats.slice(0, 15).map((tool) => {
                          const maxMs = toolDurationStats[0]?.avgMs || 1
                          const percentage = (tool.avgMs / maxMs) * 100
                          const color = tool.avgMs > 10000 ? themeVars.progressError : tool.avgMs > 3000 ? themeVars.progressWarning : themeVars.progressSuccess
                          return (
                            <div
                              key={tool.name}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12
                              }}
                            >
                              <Text
                                style={{
                                  width: 140,
                                  fontSize: 12,
                                  fontFamily: 'monospace'
                                }}
                              >
                                {tool.name}
                              </Text>
                              <div
                                style={{
                                  flex: 1,
                                  height: 16,
                                  background: themeVars.bgSection,
                                  borderRadius: 4,
                                  overflow: 'hidden'
                                }}
                              >
                                <div
                                  style={{
                                    width: `${percentage}%`,
                                    height: '100%',
                                    background: color,
                                    borderRadius: 4,
                                    transition: 'width 0.3s ease'
                                  }}
                                />
                              </div>
                              <Tag style={{ fontSize: 11, minWidth: 70, textAlign: 'center' }}>
                                {formatDuration(tool.avgMs)}
                              </Tag>
                              <Text type="secondary" style={{ fontSize: 11, minWidth: 50, textAlign: 'right' }}>
                                {tool.count} 次
                              </Text>
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )}
                </Space>
              </div>
            )
          }
        ]}
      />

      {/* 对话详情弹窗 */}
      <ConversationDetailModal
        visible={detailVisible}
        sessionId={detailSessionId}
        project={detailProject}
        onClose={() => setDetailVisible(false)}
      />

      {/* 项目对比弹窗 */}
      <Modal
        title={
          <Space>
            <SwapOutlined />
            <span>项目对比</span>
            <Tag color="#D97757">{selectedProjects.size} 个项目</Tag>
          </Space>
        }
        open={compareVisible}
        onCancel={() => setCompareVisible(false)}
        width={900}
        footer={[
          <Button key="close" type="primary" onClick={() => setCompareVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {compareBarData.length >= 2 ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* 雷达图对比 */}
            <Card size="small" title={<Text style={{ fontSize: 13 }}>综合能力雷达图</Text>}>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart data={compareRadarData}>
                  <PolarGrid stroke={themeVars.borderSecondary} />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fontSize: 12, fill: themeVars.text }}
                  />
                  <PolarRadiusAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: themeVars.textTertiary }}
                  />
                  {compareBarData.map((p, idx) => (
                    <Radar
                      key={p.name}
                      name={p.name}
                      dataKey={p.name}
                      stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                      fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <RechartsTooltip
                    contentStyle={{
                      background: themeVars.bgContainer,
                      border: `1px solid ${themeVars.border}`,
                      borderRadius: 6,
                      fontSize: 12
                    }}
                    formatter={(value) => [`${value ?? 0}%`, '']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </Card>

            {/* Token 对比柱状图 */}
            <Card size="small" title={<Text style={{ fontSize: 13 }}>Token 使用量对比</Text>}>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={compareBarData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={themeVars.borderSecondary} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: themeVars.textSecondary }} />
                  <YAxis tick={{ fontSize: 11, fill: themeVars.textSecondary }} />
                  <RechartsTooltip
                    contentStyle={{
                      background: themeVars.bgContainer,
                      border: `1px solid ${themeVars.border}`,
                      borderRadius: 6,
                      fontSize: 12
                    }}
                  />
                  <Bar dataKey="tokens" name="Tokens" fill={STAT_COLORS.tokens} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* 数据对比表格 */}
            <Card size="small" title={<Text style={{ fontSize: 13 }}>详细数据对比</Text>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* 表头 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `120px repeat(${compareBarData.length}, 1fr)`,
                    gap: 8,
                    padding: '8px 12px',
                    borderBottom: `1px solid ${themeVars.border}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: themeVars.textSecondary
                  }}
                >
                  <div>指标</div>
                  {compareBarData.map((p, idx) => (
                    <div key={p.name} style={{ textAlign: 'center', color: CHART_COLORS[idx % CHART_COLORS.length] }}>
                      {p.name}
                    </div>
                  ))}
                </div>
                {/* 行 */}
                {[
                  { label: '会话数', key: 'sessions' as const },
                  { label: 'Token 总量', key: 'tokens' as const },
                  { label: '成本 (USD)', key: 'cost' as const },
                  { label: '工具调用', key: 'tools' as const }
                ].map(row => {
                  const values = compareBarData.map(d => d[row.key] as number)
                  const maxVal = Math.max(...values)
                  return (
                    <div
                      key={row.label}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `120px repeat(${compareBarData.length}, 1fr)`,
                        gap: 8,
                        padding: '6px 12px',
                        fontSize: 12,
                        background: themeVars.bgSection,
                        borderRadius: 4
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{row.label}</div>
                      {compareBarData.map((d, idx) => {
                        const val = d[row.key] as number
                        const isMax = val === maxVal
                        return (
                          <div
                            key={d.name}
                            style={{
                              textAlign: 'center',
                              fontWeight: isMax ? 600 : 400,
                              color: isMax ? CHART_COLORS[idx % CHART_COLORS.length] : themeVars.text
                            }}
                          >
                            {row.key === 'cost' ? `$${val.toFixed(4)}` : val.toLocaleString()}
                            {isMax && compareBarData.length > 1 && (
                              <Tag
                                color="gold"
                                style={{ fontSize: 10, marginLeft: 4, padding: '0 4px', lineHeight: '16px' }}
                              >
                                MAX
                              </Tag>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </Card>
          </Space>
        ) : (
          <Empty description="请至少选择 2 个项目" />
        )}
      </Modal>

      {/* Token 价格配置弹窗 */}
      <TokenPriceModal
        open={tokenPriceModalOpen}
        onClose={() => setTokenPriceModalOpen(false)}
        darkMode={darkMode}
      />
    </div>
  )
}

export default StatisticsDashboard
