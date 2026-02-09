import { useState, useEffect, useMemo } from 'react'
import { Card, Statistic, Space, Typography, Spin, Empty, Tag, Button, message } from 'antd'
import {
  ThunderboltOutlined,
  DollarOutlined,
  MessageOutlined,
  ToolOutlined,
  FolderOutlined,
  ReloadOutlined,
  BarChartOutlined
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
  Legend
} from 'recharts'
import { SessionMetadata } from '../types'
import { getThemeVars } from '../theme'

const { Text, Title } = Typography

interface StatisticsViewProps {
  darkMode: boolean
}

// 图表颜色方案
const CHART_COLORS = [
  '#1677ff',
  '#52c41a',
  '#722ed1',
  '#fa8c16',
  '#eb2f96',
  '#13c2c2',
  '#2f54eb',
  '#faad14',
  '#a0d911',
  '#f5222d'
]

const StatisticsView = (props: StatisticsViewProps) => {
  const { darkMode } = props
  const themeVars = getThemeVars(darkMode)
  const [sessions, setSessions] = useState<SessionMetadata[]>([])
  const [loading, setLoading] = useState(true)

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
      console.error('加载统计数据失败:', error)
      message.error('加载统计数据失败')
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

    for (const s of sessions) {
      const parts = s.project.split('/')
      const projectName = parts[parts.length - 1] || '未知项目'
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

  // 项目 Token 使用量柱状图数据
  const projectChartData = useMemo(() => {
    return projectStats.slice(0, 10).map(p => ({
      name: p.projectName.length > 12 ? p.projectName.slice(0, 12) + '...' : p.projectName,
      tokens: p.totalTokens,
      cost: Number(p.totalCost.toFixed(4))
    }))
  }, [projectStats])

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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" tip="加载统计数据..." />
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Empty description="暂无统计数据" />
      </div>
    )
  }

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
          <BarChartOutlined style={{ fontSize: 16, color: themeVars.primary }} />
          <Text strong style={{ fontSize: 14 }}>
            使用统计
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
          {/* 全局统计卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Card size="small" styles={{ body: { padding: 16 } }}>
              <Statistic
                title="总 Token"
                value={globalStats.totalTokens}
                prefix={<ThunderboltOutlined style={{ color: '#1677ff' }} />}
                valueStyle={{ fontSize: 20, color: '#1677ff' }}
                formatter={(value) => Number(value).toLocaleString()}
              />
            </Card>
            <Card size="small" styles={{ body: { padding: 16 } }}>
              <Statistic
                title="总成本 (USD)"
                value={globalStats.totalCost}
                prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
                precision={4}
                valueStyle={{ fontSize: 20, color: '#52c41a' }}
              />
            </Card>
            <Card size="small" styles={{ body: { padding: 16 } }}>
              <Statistic
                title="会话数"
                value={globalStats.totalSessions}
                prefix={<MessageOutlined style={{ color: '#722ed1' }} />}
                valueStyle={{ fontSize: 20, color: '#722ed1' }}
              />
            </Card>
            <Card size="small" styles={{ body: { padding: 16 } }}>
              <Statistic
                title="项目数"
                value={globalStats.projectCount}
                prefix={<FolderOutlined style={{ color: '#fa8c16' }} />}
                valueStyle={{ fontSize: 20, color: '#fa8c16' }}
              />
            </Card>
            <Card size="small" styles={{ body: { padding: 16 } }}>
              <Statistic
                title="工具调用"
                value={globalStats.totalToolUse}
                prefix={<ToolOutlined style={{ color: '#13c2c2' }} />}
                valueStyle={{ fontSize: 20, color: '#13c2c2' }}
                formatter={(value) => Number(value).toLocaleString()}
              />
            </Card>
          </div>

          {/* 图表区域 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* 项目 Token 使用量柱状图 */}
            <Card
              size="small"
              title={
                <Space>
                  <BarChartOutlined />
                  <Text style={{ fontSize: 13 }}>项目 Token 使用量 (Top 10)</Text>
                </Space>
              }
            >
              {projectChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={projectChartData} margin={{ top: 5, right: 20, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={themeVars.borderSecondary} />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={80}
                      tick={{ fontSize: 11, fill: themeVars.textSecondary }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: themeVars.textSecondary }} />
                    <RechartsTooltip
                      contentStyle={{
                        background: themeVars.bgContainer,
                        border: `1px solid ${themeVars.border}`,
                        borderRadius: 6,
                        fontSize: 12
                      }}
                      formatter={(value: number) => [value.toLocaleString(), 'Tokens']}
                    />
                    <Bar dataKey="tokens" fill="#1677ff" radius={[4, 4, 0, 0]} />
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
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={toolPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      innerRadius={50}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
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
                      formatter={(value: number, name: string) => [
                        `${value.toLocaleString()} 次`,
                        name
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty description="暂无工具调用数据" style={{ padding: 40 }} />
              )}
            </Card>
          </div>

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

          {/* 项目详细统计表格 */}
          <Card
            size="small"
            title={
              <Space>
                <FolderOutlined />
                <Text style={{ fontSize: 13 }}>项目详细统计</Text>
              </Space>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* 表头 */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  gap: 8,
                  padding: '6px 12px',
                  borderBottom: `1px solid ${themeVars.border}`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: themeVars.textSecondary
                }}
              >
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
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    background: themeVars.bgSection
                  }}
                >
                  <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stat.projectName}
                  </div>
                  <div style={{ textAlign: 'right', color: themeVars.textSecondary }}>
                    {stat.sessionCount}
                  </div>
                  <div style={{ textAlign: 'right', color: '#1677ff' }}>
                    {stat.totalTokens.toLocaleString()}
                  </div>
                  <div style={{ textAlign: 'right', color: '#52c41a' }}>
                    ${stat.totalCost.toFixed(4)}
                  </div>
                  <div style={{ textAlign: 'right', color: '#13c2c2' }}>
                    {stat.toolUseCount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Space>
      </div>
    </div>
  )
}

export default StatisticsView
