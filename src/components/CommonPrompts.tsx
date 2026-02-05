import { useState, useEffect, useRef, useMemo } from 'react'
import { Card, Button, List, Space, Input, Form, message, Typography, Empty, Popconfirm, Tooltip, Tag } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  StarOutlined,
  PushpinOutlined,
  PushpinFilled,
  FileTextOutlined,
  CheckCircleFilled,
  SearchOutlined,
  CloseOutlined
} from '@ant-design/icons'
import Highlighter from 'react-highlight-words'
import { CommonCommand } from '../types'
import { getThemeVars } from '../theme'
import ConfigFileEditor from './ConfigFileEditor'
import ElectronModal from './ElectronModal'

const { TextArea } = Input
const { Text, Title } = Typography

interface CommonPromptsProps {
  darkMode: boolean
}

const CommonPrompts = ({ darkMode }: CommonPromptsProps) => {
  const [commands, setCommands] = useState<CommonCommand[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingCommand, setEditingCommand] = useState<CommonCommand | null>(null)
  const [configEditorVisible, setConfigEditorVisible] = useState(false)
  const [configFilePath, setConfigFilePath] = useState('')
  const [clickingId, setClickingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const searchInputRef = useRef<any>(null)
  const [form] = Form.useForm()
  const themeVars = getThemeVars(darkMode)

  // 监听 Cmd+F 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+F (Mac) 或 Ctrl+F (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        // 关闭所有弹窗
        setModalVisible(false)
        setConfigEditorVisible(false)
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

  useEffect(() => {
    loadCommands()
  }, [])

  const loadCommands = async () => {
    setLoading(true)
    try {
      const cmds = await window.electronAPI.getCommonCommands()
      setCommands(cmds)
    } catch (error: any) {
      message.error(`加载常用Prompt失败: ${error?.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingCommand(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (command: CommonCommand) => {
    setEditingCommand(command)
    form.setFieldsValue({
      name: command.name,
      content: command.content
    })
    setModalVisible(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()

      if (editingCommand) {
        const result = await window.electronAPI.updateCommonCommand(
          editingCommand.id,
          values.name,
          values.content
        )

        if (result.success) {
          message.success('更新成功')
          loadCommands()
          setModalVisible(false)
        } else {
          message.error(`更新失败: ${result.error}`)
        }
      } else {
        const result = await window.electronAPI.addCommonCommand(
          values.name,
          values.content
        )

        if (result.success) {
          message.success('添加成功')
          loadCommands()
          setModalVisible(false)
        } else {
          message.error(`添加失败: ${result.error}`)
        }
      }
    } catch (error: any) {
      console.error('表单验证失败:', error)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const result = await window.electronAPI.deleteCommonCommand(id)

      if (result.success) {
        message.success('删除成功')
        loadCommands()
      } else {
        message.error(`删除失败: ${result.error}`)
      }
    } catch (error: any) {
      message.error(`删除失败: ${error?.message || '未知错误'}`)
    }
  }

  const handleUse = async (content: string, id: string, e?: React.MouseEvent) => {
    // 如果点击的是按钮区域，不触发复制
    if (e) {
      const target = e.target as HTMLElement
      if (target.closest('.prompt-actions')) {
        return
      }
    }

    try {
      // 显示点击动画
      setClickingId(id)

      await window.electronAPI.copyToClipboard(content)

      // 显示复制成功状态
      setCopiedId(id)
      message.success('已复制到剪贴板，可以直接粘贴到对话框中使用')

      // 重置点击动画
      setTimeout(() => {
        setClickingId(null)
      }, 200)

      // 2秒后隐藏复制成功状态
      setTimeout(() => {
        setCopiedId(null)
      }, 2000)
    } catch (error) {
      message.error('复制失败')
      setClickingId(null)
    }
  }

  const handleTogglePin = async (id: string) => {
    try {
      const result = await window.electronAPI.togglePinCommand(id)

      if (result.success) {
        loadCommands()
        message.success('操作成功')
      } else {
        message.error(`操作失败: ${result.error}`)
      }
    } catch (error: any) {
      message.error(`操作失败: ${error?.message || '未知错误'}`)
    }
  }

  const sortedCommands = [...commands].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.updatedAt - a.updatedAt
  })

  // 搜索过滤（仅用于搜索弹窗）
  const searchFilteredCommands = useMemo(() => {
    if (!searchKeyword.trim()) {
      return sortedCommands
    }

    const keyword = searchKeyword.toLowerCase()
    return sortedCommands.filter(command =>
      command.name.toLowerCase().includes(keyword) ||
      command.content.toLowerCase().includes(keyword)
    )
  }, [sortedCommands, searchKeyword])

  const handleOpenFile = async () => {
    try {
      const path = await window.electronAPI.getConfigPath()
      setConfigFilePath(path)
      setConfigEditorVisible(true)
    } catch (error: any) {
      message.error(`打开文件失败: ${error?.message || '未知错误'}`)
    }
  }

  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: themeVars.bgContainer
      }}>
        {/* 页面标题 */}
      <div style={{
        padding: '24px 24px 16px',
        borderBottom: `1px solid ${themeVars.border}`,
        background: themeVars.bgContainer,
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}>
        <Space align="center" size="middle">
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: themeVars.primaryGradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 4px 12px ${themeVars.primaryShadow}`
          }}>
            <StarOutlined style={{ fontSize: 24, color: '#fff' }} />
          </div>
          <div>
            <Title level={3} style={{ margin: 0, fontSize: 20 }}>
              常用Prompt
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              保存常用的对话提示词，一键复制使用
            </Text>
          </div>
        </Space>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, padding: '16px 24px', overflow: 'auto' }}>
        <Card
          extra={
            <Space size="small" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <Tooltip title="搜索 Prompt (Cmd+F / Ctrl+F)">
                <Button
                  icon={<SearchOutlined />}
                  onClick={() => setSearchVisible(true)}
                  size="middle"
                >
                  搜索
                </Button>
              </Tooltip>
              <Button
                icon={<FileTextOutlined />}
                onClick={handleOpenFile}
                size="middle"
              >
                打开配置文件
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAdd}
                size="middle"
              >
                新增Prompt
              </Button>
            </Space>
          }
          styles={{
            header: { WebkitAppRegion: 'drag' } as React.CSSProperties,
            body: { padding: '16px' }
          }}
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Text type="secondary">加载中...</Text>
            </div>
          ) : commands.length === 0 ? (
            <Empty
              description="暂无常用Prompt"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: '60px 0' }}
            >
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                添加第一个Prompt
              </Button>
            </Empty>
          ) : (
            <List
              dataSource={sortedCommands}
              renderItem={(command) => (
                <List.Item
                  style={{
                    padding: '12px',
                    marginBottom: '12px',
                    borderRadius: '8px',
                    background: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                    boxShadow: darkMode
                      ? '0 2px 8px rgba(0, 0, 0, 0.2)'
                      : '0 2px 8px rgba(0, 0, 0, 0.06)',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: clickingId === command.id
                      ? 'translate(4px, -4px)'
                      : 'translate(0, 0)',
                  }}
                  className="prompt-item"
                  onClick={(e) => handleUse(command.content, command.id, e)}
                  onMouseEnter={(e) => {
                    const item = e.currentTarget as HTMLElement
                    item.style.transform = 'translate(4px, -4px)'
                  }}
                  onMouseLeave={(e) => {
                    const item = e.currentTarget as HTMLElement
                    if (clickingId !== command.id) {
                      item.style.transform = 'translate(0, 0)'
                    }
                  }}
                >
                  {/* 复制成功提示 */}
                  {copiedId === command.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(0, 0, 0, 0.75)',
                        color: '#fff',
                        padding: '12px 24px',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 14,
                        fontWeight: 500,
                        zIndex: 10,
                        pointerEvents: 'none',
                        backdropFilter: 'blur(4px)',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        animation: 'copySuccess 0.3s ease-out'
                      }}
                    >
                      <CheckCircleFilled style={{ fontSize: 18, color: '#52c41a' }} />
                      <span>复制成功</span>
                    </div>
                  )}

                  {/* 操作按钮 - 仅在hover时显示 */}
                  <div
                    className="prompt-actions"
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 0,
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      display: 'flex',
                      gap: 4,
                      zIndex: 5
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title={command.pinned ? '取消置顶' : '置顶'}>
                      <Button
                        type="text"
                        size="small"
                        icon={command.pinned ? <PushpinFilled style={{ color: themeVars.primary }} /> : <PushpinOutlined />}
                        onClick={() => handleTogglePin(command.id)}
                      />
                    </Tooltip>
                    <Tooltip title="编辑">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(command)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="确定删除这个Prompt吗?"
                      onConfirm={() => handleDelete(command.id)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Tooltip title="删除">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                        />
                      </Tooltip>
                    </Popconfirm>
                  </div>

                  <List.Item.Meta
                    title={
                      <Space size="small">
                        <Text strong style={{ fontSize: 14 }}>
                          {command.name}
                        </Text>
                        {command.pinned && (
                          <Tag icon={<PushpinFilled />} color="gold" style={{ fontSize: 11, padding: '0 4px' }}>
                            置顶
                          </Tag>
                        )}
                      </Space>
                    }
                    description={
                      <div
                        style={{
                          fontSize: 12,
                          color: themeVars.textSecondary,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          lineHeight: 1.5,
                          marginTop: 4
                        }}
                      >
                        {command.content}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </div>
    </div>

      {/* 新增/编辑弹窗 */}
      <ElectronModal
        title={editingCommand ? '编辑Prompt' : '新增Prompt'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
        >
          <Form.Item
            name="name"
            label="Prompt名称"
            rules={[
              { required: true, message: '请输入Prompt名称' },
              { max: 50, message: 'Prompt名称不能超过50个字符' }
            ]}
          >
            <Input placeholder="例如: 代码审查、生成注释、优化性能..." />
          </Form.Item>

          <Form.Item
            name="content"
            label="Prompt内容"
            rules={[
              { required: true, message: '请输入Prompt内容' },
              { max: 2000, message: 'Prompt内容不能超过2000个字符' }
            ]}
          >
            <TextArea
              rows={10}
              placeholder="请输入Prompt内容，例如：请帮我审查这段代码，找出潜在的问题..."
              showCount
              maxLength={2000}
            />
          </Form.Item>
        </Form>
      </ElectronModal>

      {/* 配置文件编辑器 */}
      <ConfigFileEditor
        title="编辑应用配置文件"
        filePath={configFilePath}
        darkMode={darkMode}
        visible={configEditorVisible}
        onClose={() => {
          setConfigEditorVisible(false)
        }}
        onLoad={async () => {
          const content = await window.electronAPI.readAppConfigFile()
          return content
        }}
        onSave={async (content: string) => {
          await window.electronAPI.saveAppConfigFile(content)
          message.success('保存成功')
          loadCommands()
        }}
        onOpenFolder={async () => {
          await window.electronAPI.showConfigInFolder()
        }}
      />

      {/* 搜索弹窗 */}
      <ElectronModal
        open={searchVisible}
        onCancel={() => {
          setSearchVisible(false)
          setSearchKeyword("")
        }}
        footer={null}
        closable={false}
        width={640}
        style={{ top: "15%" }}
        styles={{
          body: {
            padding: 0
          } as React.CSSProperties
        }}
      >
        <div style={{ padding: "16px 20px" }}>
          {/* 搜索输入框 */}
          <div style={{ marginBottom: 16 }}>
            <Input
              ref={searchInputRef}
              size="large"
              placeholder="搜索 Prompt 名称或内容..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              prefix={<SearchOutlined style={{ fontSize: 18, color: themeVars.textSecondary }} />}
              suffix={
                searchKeyword && (
                  <CloseOutlined
                    style={{ fontSize: 14, color: themeVars.textTertiary, cursor: "pointer" }}
                    onClick={() => setSearchKeyword("")}
                  />
                )
              }
              style={{
                borderRadius: 8,
                fontSize: 15
              }}
            />
          </div>

          {/* 搜索结果列表 */}
          <div style={{
            maxHeight: "400px",
            overflow: "auto"
          }}>
            {!searchKeyword ? (
              <div style={{
                textAlign: "center",
                padding: "30px 20px",
                color: themeVars.textTertiary
              }}>
                <SearchOutlined style={{ fontSize: 36, marginBottom: 8, opacity: 0.25 }} />
                <div style={{ fontSize: 13, marginBottom: 4 }}>输入关键词搜索 Prompt 名称或内容</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>提示：按 ESC 关闭搜索，Cmd+F/Ctrl+F 快速打开</div>
              </div>
            ) : searchFilteredCommands.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="未找到匹配的 Prompt"
                style={{ padding: "30px 0" }}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {searchFilteredCommands.map((command) => (
                  <div
                    key={command.id}
                    onClick={() => {
                      setSearchVisible(false)
                      handleUse(command.content, command.id)
                    }}
                    style={{
                      padding: "12px 16px",
                      background: themeVars.bgSection,
                      borderRadius: 8,
                      cursor: "pointer",
                      border: `1px solid ${themeVars.borderSecondary}`,
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = themeVars.bgHover
                      e.currentTarget.style.borderColor = themeVars.primary
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = themeVars.bgSection
                      e.currentTarget.style.borderColor = themeVars.borderSecondary
                    }}
                  >
                    <div style={{
                      fontSize: 14,
                      fontWeight: 500,
                      marginBottom: 6,
                      color: themeVars.text
                    }}>
                      <Highlighter
                        searchWords={[searchKeyword]}
                        autoEscape
                        textToHighlight={command.name}
                        highlightStyle={{
                          backgroundColor: themeVars.primary,
                          color: "#fff",
                          padding: "0 2px",
                          borderRadius: 2
                        }}
                      />
                      {command.pinned && (
                        <Tag
                          icon={<PushpinFilled />}
                          color="gold"
                          style={{ fontSize: 11, padding: "0 4px", marginLeft: 8 }}
                        >
                          置顶
                        </Tag>
                      )}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: themeVars.textSecondary,
                      lineHeight: 1.5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden"
                    }}>
                      <Highlighter
                        searchWords={[searchKeyword]}
                        autoEscape
                        textToHighlight={command.content}
                        highlightStyle={{
                          backgroundColor: themeVars.primary,
                          color: "#fff",
                          padding: "0 2px",
                          borderRadius: 2
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ElectronModal>
      <style>{`
        @keyframes copySuccess {
          0% {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
          }
          100% {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        .prompt-item:hover .prompt-actions {
          opacity: 1 !important;
        }

        .prompt-item:hover {
          background: ${darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.03)'} !important;
          box-shadow: ${darkMode
            ? '0 6px 16px rgba(0, 0, 0, 0.4)'
            : '0 6px 16px rgba(0, 0, 0, 0.12)'} !important;
        }
      `}</style>
    </>
  )
}

export default CommonPrompts
