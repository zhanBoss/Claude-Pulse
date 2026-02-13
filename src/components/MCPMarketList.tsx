/**
 * MCP 市场列表组件
 * 展示在线 MCP 服务器市场，支持搜索、分页、安装
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { Spin, Empty, message, Input, Button, Tooltip, Space, Segmented } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { OnlineMCPServer, MCPServer } from '../types'
import { getThemeVars } from '../theme'
import MCPServerCard from './MCPServerCard'

interface MCPMarketListProps {
  darkMode: boolean
  installedServers: MCPServer[]
  onInstall: (server: OnlineMCPServer) => void
}

const MCPMarketList = (props: MCPMarketListProps) => {
  const { darkMode, installedServers, onInstall } = props
  const themeVars = getThemeVars(darkMode)

  const [servers, setServers] = useState<OnlineMCPServer[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [nextCursor, setNextCursor] = useState<string | undefined>()
  const [hasMore, setHasMore] = useState(true)
  const [activeCategory, setActiveCategory] = useState<'all' | 'official' | 'recommended'>('all')

  const isInitialLoad = useRef(true)

  // 加载市场数据
  const loadMarket = useCallback(
    async (cursor?: string, append = false, searchOverride?: string) => {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
        setServers([])
      }

      try {
        const searchKeyword = typeof searchOverride === 'string' ? searchOverride : searchValue
        const result = await window.electronAPI.fetchMCPMarket({
          search: searchKeyword || undefined,
          limit: 20,
          cursor
        })

        if (result.success && result.result) {
          const newServers = result.result.servers
          setNextCursor(result.result.nextCursor)
          setHasMore(!!result.result.nextCursor)

          if (append) {
            setServers(prev => [...prev, ...newServers])
          } else {
            setServers(newServers)
          }
        } else {
          message.error(result.error || '加载市场失败')
        }
      } catch (error) {
        message.error('加载市场失败')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [searchValue]
  )

  // 初始加载
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      loadMarket()
    }
  }, [loadMarket])

  // 搜索处理
  const handleSearch = (value: string) => {
    setSearchValue(value)
    loadMarket(undefined, false, value)
  }

  // 刷新
  const handleRefresh = () => {
    setSearchValue('')
    loadMarket(undefined, false, '')
  }

  // 加载更多
  const handleLoadMore = () => {
    if (nextCursor && hasMore && !loadingMore) {
      loadMarket(nextCursor, true)
    }
  }

  // 检查是否已安装
  const checkInstalled = (onlineServer: OnlineMCPServer): boolean => {
    // 通过名称匹配
    const namePart = onlineServer.name.split('/').pop() || onlineServer.name
    const isNameMatch = installedServers.some(
      s => s.name === namePart || s.name === onlineServer.name
    )

    // 通过包标识符匹配
    if (!isNameMatch && onlineServer.packages) {
      for (const pkg of onlineServer.packages) {
        const isPackageMatch = installedServers.some(s => {
          const cmdWithArgs = `${s.command} ${(s.args || []).join(' ')}`
          return cmdWithArgs.includes(pkg.identifier)
        })
        if (isPackageMatch) return true
      }
    }

    return isNameMatch
  }

  const RECOMMEND_KEYWORDS = [
    'github',
    'figma',
    'notion',
    'slack',
    'sentry',
    'linear',
    'postgres',
    'supabase',
    'vercel',
    'gitlab'
  ]

  const isRecommendedServer = (server: OnlineMCPServer) => {
    const nameText = `${server.name} ${server.title || ''} ${server.description || ''}`.toLowerCase()
    return RECOMMEND_KEYWORDS.some(keyword => nameText.includes(keyword))
  }

  const allCount = servers.length
  const officialCount = servers.filter(server => !!server.isOfficial).length
  const recommendedCount = servers.filter(server => isRecommendedServer(server)).length

  const availableCategoryOptions = [
    { value: 'all' as const, label: `全部 ${allCount}` },
    ...(officialCount > 0 ? [{ value: 'official' as const, label: `官方 ${officialCount}` }] : []),
    ...(recommendedCount > 0
      ? [{ value: 'recommended' as const, label: `推荐 ${recommendedCount}` }]
      : [])
  ]

  const filteredServers = servers.filter(server => {
    if (activeCategory === 'official') {
      return !!server.isOfficial
    }
    if (activeCategory === 'recommended') {
      return isRecommendedServer(server)
    }
    return true
  })

  const getListTitle = () => {
    if (activeCategory === 'official') return '官方 MCP 列表'
    if (activeCategory === 'recommended') return '推荐 MCP 列表'
    return 'MCP 市场'
  }

  useEffect(() => {
    const values = availableCategoryOptions.map(option => option.value)
    if (!values.includes(activeCategory)) {
      setActiveCategory('all')
    }
  }, [activeCategory, availableCategoryOptions])

  return (
    <div>
      {/* 搜索栏 */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12
        }}
      >
        <Space.Compact style={{ flex: 1 }}>
          <Input
            placeholder="搜索 MCP 服务器..."
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            onPressEnter={() => handleSearch(searchValue)}
            allowClear
            size="large"
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            onClick={() => handleSearch(searchValue)}
            size="large"
          />
        </Space.Compact>
        <Tooltip title="刷新">
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} size="large" />
        </Tooltip>
      </div>

      {/* 统计信息 */}
      <div
        style={{
          fontSize: 12,
          color: themeVars.textSecondary,
          marginBottom: 12
        }}
      >
        {loading ? (
          '加载中...'
        ) : (
          <>
            {`${getListTitle()}，当前展示 ${filteredServers.length} 个`}
            {searchValue && ` (搜索: "${searchValue}")`}
          </>
        )}
      </div>

      {availableCategoryOptions.length > 1 && (
        <div style={{ marginBottom: 12 }}>
          <Segmented
            size="small"
            value={activeCategory}
            options={availableCategoryOptions}
            onChange={value => setActiveCategory(value as 'all' | 'official' | 'recommended')}
          />
        </div>
      )}

      {/* 服务器列表 */}
      <Spin spinning={loading}>
        {filteredServers.length === 0 && !loading ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={searchValue ? '未找到匹配的 MCP 服务器' : '暂无 MCP 服务器'}
            style={{ padding: '40px 0' }}
          />
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredServers.map((server, index) => (
              <MCPServerCard
                key={`${server.name}-${index}`}
                onlineServer={server}
                isInstalled={checkInstalled(server)}
                darkMode={darkMode}
                onInstall={onInstall}
              />
            ))}

            {/* 加载更多 */}
            {hasMore && servers.length > 0 && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <Button
                  onClick={handleLoadMore}
                  loading={loadingMore}
                  disabled={loadingMore}
                  type="link"
                >
                  {loadingMore ? '加载中...' : '加载更多'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Spin>
    </div>
  )
}

export default MCPMarketList
