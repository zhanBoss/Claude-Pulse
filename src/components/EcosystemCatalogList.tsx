import { useMemo, useState, useEffect } from 'react'
import { Button, Empty, Input, Segmented, Space, Tag, Tooltip, Typography, message } from 'antd'
import { CopyOutlined, LinkOutlined, SearchOutlined } from '@ant-design/icons'
import { getThemeVars } from '../theme'
import { EcosystemCatalogItem } from '../constants/claudeEcosystem'

const { Text } = Typography

interface EcosystemCatalogListProps {
  darkMode: boolean
  title: string
  subtitle?: string
  emptyDescription: string
  items: EcosystemCatalogItem[]
}

const EcosystemCatalogList = (props: EcosystemCatalogListProps) => {
  const { darkMode, title, subtitle, emptyDescription, items } = props
  const themeVars = getThemeVars(darkMode)
  const [searchValue, setSearchValue] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'official' | 'recommended' | 'community'>('all')

  const categoryCounts = useMemo(() => {
    const official = items.filter(item => item.official).length
    const recommended = items.filter(item => item.recommended && !item.official).length
    const community = items.filter(item => !item.official && !item.recommended).length

    return { official, recommended, community }
  }, [items])

  const filterOptions = useMemo(() => {
    const options: Array<{ label: string; value: 'all' | 'official' | 'recommended' | 'community' }> = [
      { label: `全部 ${items.length}`, value: 'all' }
    ]

    if (categoryCounts.official > 0) {
      options.push({ label: `官方 ${categoryCounts.official}`, value: 'official' })
    }
    if (categoryCounts.recommended > 0) {
      options.push({ label: `推荐 ${categoryCounts.recommended}`, value: 'recommended' })
    }
    if (categoryCounts.community > 0) {
      options.push({ label: `社区 ${categoryCounts.community}`, value: 'community' })
    }

    return options
  }, [categoryCounts, items.length])

  useEffect(() => {
    const validValues = filterOptions.map(option => option.value)
    if (!validValues.includes(activeFilter)) {
      setActiveFilter('all')
    }
  }, [activeFilter, filterOptions])

  const filteredItems = useMemo(() => {
    const scopedItems = items.filter(item => {
      if (activeFilter === 'official') {
        return !!item.official
      }
      if (activeFilter === 'recommended') {
        return !!item.recommended && !item.official
      }
      if (activeFilter === 'community') {
        return !item.official && !item.recommended
      }
      return true
    })

    const keyword = searchValue.trim().toLowerCase()
    if (!keyword) {
      return scopedItems
    }

    return scopedItems.filter(item => {
      const fields = [
        item.name,
        item.description,
        item.sourceLabel,
        ...(item.tags || [])
      ]

      return fields.some(field => field.toLowerCase().includes(keyword))
    })
  }, [activeFilter, items, searchValue])

  const handleCopy = async (value: string) => {
    await window.electronAPI.copyToClipboard(value)
    message.success('已复制安装命令')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <Space direction="vertical" size={2} style={{ maxWidth: '70%' }}>
          <Text strong style={{ fontSize: 12 }}>{title}</Text>
          {subtitle && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {subtitle}
            </Text>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 11 }}>
          共 {filteredItems.length} 项
        </Text>
      </div>

      <Input
        placeholder="搜索名称、标签、来源..."
        size="small"
        value={searchValue}
        onChange={e => setSearchValue(e.target.value)}
        allowClear
        prefix={<SearchOutlined />}
        style={{ marginBottom: 10 }}
      />

      {filterOptions.length > 1 && (
        <div style={{ marginBottom: 10 }}>
          <Segmented
            size="small"
            options={filterOptions}
            value={activeFilter}
            onChange={value => setActiveFilter(value as 'all' | 'official' | 'recommended' | 'community')}
          />
        </div>
      )}

      {filteredItems.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 11 }}>{emptyDescription}</Text>}
          style={{ margin: '14px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
          {filteredItems.map(item => (
            <div
              key={item.id}
              style={{
                border: `1px solid ${themeVars.border}`,
                borderRadius: 6,
                padding: '10px 12px',
                backgroundColor: themeVars.bgSection
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={6} wrap>
                    <Text strong style={{ fontSize: 12 }}>{item.name}</Text>
                    <Tag style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>{item.sourceLabel}</Tag>
                    {item.official && (
                      <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                        官方
                      </Tag>
                    )}
                    {item.recommended && (
                      <Tag color="gold" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                        推荐
                      </Tag>
                    )}
                  </Space>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                    {item.description}
                  </Text>
                  {(item.tags || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {(item.tags || []).map(tag => (
                        <Tag key={`${item.id}-${tag}`} style={{ fontSize: 10, margin: 0 }}>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {item.installCommand && (
                    <Text
                      code
                      style={{
                        fontSize: 10,
                        backgroundColor: themeVars.codeBg,
                        padding: '2px 6px',
                        borderRadius: 4,
                        display: 'inline-block',
                        marginTop: 8
                      }}
                    >
                      {item.installCommand}
                    </Text>
                  )}
                </div>

                <Space size={4}>
                  {item.sourceUrl && (
                    <Tooltip title="打开来源">
                      <Button
                        type="text"
                        size="small"
                        icon={<LinkOutlined />}
                        onClick={() => window.electronAPI.openExternal(item.sourceUrl!)}
                      />
                    </Tooltip>
                  )}
                  {item.installCommand && (
                    <Tooltip title="复制安装命令">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(item.installCommand!)}
                      />
                    </Tooltip>
                  )}
                </Space>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default EcosystemCatalogList
