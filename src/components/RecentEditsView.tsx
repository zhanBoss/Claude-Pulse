import { useState, useEffect, useMemo, useCallback } from 'react'
import { diffLines, Change } from 'diff'
import Editor from '@monaco-editor/react'
import {
  Card,
  Tag,
  Space,
  Typography,
  Empty,
  Spin,
  Button,
  message,
  Input,
  Modal,
  List,
  Tooltip,
  Switch,
  Pagination
} from 'antd'
import {
  FileOutlined,
  FolderOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  CloseOutlined,
  CopyOutlined,
  EyeOutlined,
  EditOutlined,
  RollbackOutlined,
  SwapOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  AppstoreOutlined
} from '@ant-design/icons'
import { FileEditSnapshot } from '../types'
import { getThemeVars } from '../theme'
import { getMonacoLanguage } from '../utils/codeDetector'
import ConversationDetailModal from './ConversationDetailModal'
import dayjs from 'dayjs'

const { Text } = Typography

interface RecentEditsViewProps {
  darkMode: boolean
}

const RecentEditsView = (props: RecentEditsViewProps) => {
  const { darkMode } = props
  const themeVars = getThemeVars(darkMode)
  const [edits, setEdits] = useState<FileEditSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // 文件内容预览弹窗
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [previewFilePath, setPreviewFilePath] = useState('')
  const [previewSessionId, setPreviewSessionId] = useState('')
  const [previewMessageId, setPreviewMessageId] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const [diffResult, setDiffResult] = useState<Change[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
  const [previewWrap, setPreviewWrap] = useState(false)
  const [guideExpanded, setGuideExpanded] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // 完整对话弹窗
  const [conversationModalVisible, setConversationModalVisible] = useState(false)
  const [conversationSessionId, setConversationSessionId] = useState('')
  const [conversationProject, setConversationProject] = useState('')

  useEffect(() => {
    loadEdits()
  }, [])

  const loadEdits = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.readFileEdits()
      if (result.success && result.edits) {
        setEdits(result.edits)
      } else {
        message.error(`加载文件编辑记录失败: ${result.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('加载文件编辑记录失败:', error)
      message.error('加载文件编辑记录失败')
    } finally {
      setLoading(false)
    }
  }

  // 获取项目名称
  const getProjectName = (projectPath: string) => {
    if (!projectPath) return '未知项目'
    const parts = projectPath.split('/')
    return parts[parts.length - 1]
  }

  // 提取所有项目用于过滤
  const projects = useMemo(() => {
    const projectSet = new Set<string>()
    for (const edit of edits) {
      projectSet.add(edit.project)
    }
    return Array.from(projectSet)
  }, [edits])

  // 过滤编辑记录
  const filteredEdits = useMemo(() => {
    let result = edits

    // 按项目过滤
    if (selectedProject) {
      result = result.filter(e => e.project === selectedProject)
    }

    // 按关键字搜索（文件路径）
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase()
      result = result.filter(e =>
        e.files.some(f => f.filePath.toLowerCase().includes(keyword)) ||
        e.project.toLowerCase().includes(keyword)
      )
    }

    return result
  }, [edits, selectedProject, searchKeyword])

  // 扁平化为文件列表（按时间倒序）
  const flattenedFiles = useMemo(() => {
    const files: Array<{
      filePath: string
      contentLength: number
      preview?: string
      timestamp: string
      sessionId: string
      messageId: string
      project: string
    }> = []

    for (const edit of filteredEdits) {
      for (const file of edit.files) {
        files.push({
          ...file,
          timestamp: edit.timestamp,
          sessionId: edit.sessionId,
          messageId: edit.messageId,
          project: edit.project
        })
      }
    }

    return files
  }, [filteredEdits])

  // 当前页数据
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return flattenedFiles.slice(startIndex, startIndex + pageSize)
  }, [flattenedFiles, currentPage, pageSize])

  const latestEditTime = useMemo(() => {
    if (flattenedFiles.length === 0) return ''
    const latest = flattenedFiles[0]
    return dayjs(latest.timestamp).format('YYYY-MM-DD HH:mm:ss')
  }, [flattenedFiles])

  // 筛选条件变化时回到第一页
  useEffect(() => {
    setCurrentPage(1)
  }, [searchKeyword, selectedProject])

  // 数据变化后，修正越界页码
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(flattenedFiles.length / pageSize))
    if (currentPage > maxPage) {
      setCurrentPage(maxPage)
    }
  }, [flattenedFiles.length, pageSize, currentPage])

  const totalSizeKb = useMemo(() => {
    const total = flattenedFiles.reduce((sum, file) => sum + file.contentLength, 0)
    return (total / 1024).toFixed(1)
  }, [flattenedFiles])

  // 查看文件快照内容
  const handleViewSnapshot = async (sessionId: string, messageId: string, filePath: string) => {
    setPreviewFilePath(filePath)
    setPreviewSessionId(sessionId)
    setPreviewMessageId(messageId)
    setPreviewVisible(true)
    setPreviewLoading(true)
    setPreviewContent('')

    try {
      const result = await window.electronAPI.readFileSnapshotContent(sessionId, messageId, filePath)
      if (result.success && result.content !== undefined) {
        setPreviewContent(result.content)
      } else {
        setPreviewContent(`// 加载失败: ${result.error || '未知错误'}`)
      }
    } catch (error) {
      setPreviewContent(`// 加载失败: ${(error as Error).message}`)
    } finally {
      setPreviewLoading(false)
    }
  }

  // 复制文件内容
  const handleCopyContent = async () => {
    try {
      await window.electronAPI.copyToClipboard(previewContent)
      message.success('已复制到剪贴板')
    } catch {
      message.error('复制失败')
    }
  }

  // 切换 diff 视图
  const handleToggleDiff = useCallback(async () => {
    if (showDiff) {
      setShowDiff(false)
      return
    }

    setDiffLoading(true)
    try {
      const result = await window.electronAPI.readFileContent(previewFilePath)
      if (result.success && result.content !== undefined) {
        const changes = diffLines(result.content, previewContent)
        setDiffResult(changes)
        setShowDiff(true)
      } else {
        // 文件可能已被删除
        const changes = diffLines('', previewContent)
        setDiffResult(changes)
        setShowDiff(true)
        message.info('当前文件不存在或无法读取，显示快照为新增内容')
      }
    } catch {
      message.error('读取当前文件失败')
    } finally {
      setDiffLoading(false)
    }
  }, [showDiff, previewFilePath, previewContent])

  // 从快照恢复文件
  const handleRestoreFile = () => {
    Modal.confirm({
      title: '确认恢复文件',
      content: (
        <div>
          <p>将从快照恢复文件到原始路径：</p>
          <p style={{ fontFamily: 'monospace', fontSize: 12 }}>{previewFilePath}</p>
          <p style={{ color: themeVars.warning, marginTop: 8 }}>
            注意：当前文件将被自动备份（.backup-时间戳），然后被快照内容覆盖。
          </p>
        </div>
      ),
      okText: '确认恢复',
      okType: 'primary',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await window.electronAPI.restoreFileFromSnapshot(
            previewSessionId,
            previewMessageId,
            previewFilePath
          )
          if (result.success) {
            message.success('文件恢复成功')
          } else {
            message.error(`恢复失败: ${result.error}`)
          }
        } catch (error) {
          message.error(`恢复失败: ${(error as Error).message}`)
        }
      }
    })
  }

  // 获取文件扩展名
  const getFileExtension = (filePath: string) => {
    const parts = filePath.split('.')
    return parts.length > 1 ? parts[parts.length - 1] : ''
  }

  // 获取文件名
  const getFileName = (filePath: string) => {
    const parts = filePath.split('/')
    return parts[parts.length - 1]
  }

  // 扩展名颜色
  const getExtColor = (ext: string) => {
    const colors: Record<string, string> = {
      ts: 'blue',
      tsx: 'blue',
      js: 'gold',
      jsx: 'gold',
      json: 'green',
      md: 'cyan',
      css: 'magenta',
      html: 'orange',
      py: 'geekblue',
      yml: 'purple',
      yaml: 'purple'
    }
    return colors[ext] || 'default'
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" tip="加载文件编辑记录..."><div style={{ padding: 40 }} /></Spin>
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
          <EditOutlined style={{ fontSize: 16, color: themeVars.primary }} />
          <Text strong style={{ fontSize: 14 }}>
            最近编辑
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {flattenedFiles.length} 个文件编辑记录
          </Text>
        </Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadEdits}
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
          padding: '10px 16px',
          minHeight: 0
        }}
      >
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {/* 工作台顶部 */}
          <Card
            size="small"
            style={{
              borderColor: themeVars.borderSecondary,
              background: themeVars.bgContainer
            }}
            styles={{ body: { padding: '10px 12px' } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <Space size={8}>
                  <InfoCircleOutlined style={{ color: themeVars.primary }} />
                  <Text strong style={{ fontSize: 14 }}>最近编辑工作台</Text>
                </Space>
                <Text type="secondary" style={{ fontSize: 12, marginTop: 2, display: 'block' }}>
                  按文件回看对话改动，快速定位变化并支持安全恢复。
                </Text>
              </div>
              <div>
                <Button
                  type={guideExpanded ? 'primary' : 'default'}
                  size="small"
                  icon={<QuestionCircleOutlined />}
                  onClick={() => setGuideExpanded(prev => !prev)}
                >
                  {guideExpanded ? '收起指南' : '使用指南'}
                </Button>
              </div>
            </div>

            <Space wrap size={6} style={{ marginTop: 8 }}>
              <Tag icon={<AppstoreOutlined />} color="#D97757" style={{ marginInlineEnd: 0 }}>
                文件 {flattenedFiles.length}
              </Tag>
              <Tag icon={<FolderOutlined />} color="default" style={{ marginInlineEnd: 0 }}>
                项目 {projects.length}
              </Tag>
              <Tag color="default" style={{ marginInlineEnd: 0 }}>
                体积 {totalSizeKb} KB
              </Tag>
              {latestEditTime && (
                <Tag icon={<ClockCircleOutlined />} color="processing" style={{ marginInlineEnd: 0 }}>
                  更新 {latestEditTime}
                </Tag>
              )}
            </Space>

            {guideExpanded && (
              <div
                style={{
                  marginTop: 10,
                  background: themeVars.bgSection,
                  border: `1px solid ${themeVars.borderSecondary}`,
                  borderRadius: 8,
                  padding: '10px 12px'
                }}
              >
                <Space direction="vertical" size={2}>
                  <Text type="secondary" style={{ fontSize: 12 }}>1. 先按项目筛选，或输入关键字快速定位文件</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>2. 点开快照后使用“对比差异”确认变更内容</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>3. 需要回滚时点击“恢复文件”，系统会先自动备份当前文件</Text>
                </Space>
              </div>
            )}
          </Card>

          {/* 过滤器 */}
          <Card
            size="small"
            style={{ borderColor: themeVars.borderSecondary }}
            styles={{ body: { padding: '8px 10px' } }}
          >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {/* 搜索 */}
              <Input
                placeholder="搜索文件路径或项目名称..."
                prefix={<SearchOutlined style={{ color: themeVars.textTertiary }} />}
                suffix={
                  searchKeyword && (
                    <CloseOutlined
                      style={{ color: themeVars.textTertiary, cursor: 'pointer' }}
                      onClick={() => setSearchKeyword('')}
                    />
                  )
                }
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                size="small"
                allowClear={false}
              />

              {/* 项目筛选 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>项目筛选</Text>
                {selectedProject && (
                  <Button size="small" type="link" onClick={() => setSelectedProject(null)} style={{ padding: 0 }}>
                    清除筛选
                  </Button>
                )}
              </div>
              <Space wrap size={4}>
                <Button
                  type={!selectedProject ? 'primary' : 'default'}
                  size="small"
                  onClick={() => setSelectedProject(null)}
                >
                  全部项目
                </Button>
                {projects.map(project => (
                  <Button
                    key={project}
                    type={selectedProject === project ? 'primary' : 'default'}
                    size="small"
                    onClick={() => setSelectedProject(project)}
                  >
                    {getProjectName(project)}
                  </Button>
                ))}
              </Space>
            </Space>
          </Card>

          {/* 文件列表 */}
          {flattenedFiles.length === 0 ? (
            <Empty
              description={edits.length === 0 ? '暂无文件编辑记录' : '没有匹配的记录'}
              style={{ padding: 60 }}
            />
          ) : (
            <>
              <List
                dataSource={paginatedFiles}
                style={{ background: themeVars.bgContainer, border: `1px solid ${themeVars.borderSecondary}`, borderRadius: 8, paddingInline: 8 }}
                renderItem={file => {
                  const ext = getFileExtension(file.filePath)
                  const fileName = getFileName(file.filePath)
                  return (
                    <List.Item style={{ padding: 0, borderBottom: `1px solid ${themeVars.borderSecondary}` }}>
                      <div
                        role="button"
                        tabIndex={0}
                        style={{
                          width: '100%',
                          padding: '7px 4px',
                          cursor: 'pointer',
                          background: themeVars.bgContainer,
                          transition: 'background 0.15s ease'
                        }}
                        onClick={() => handleViewSnapshot(file.sessionId, file.messageId, file.filePath)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleViewSnapshot(file.sessionId, file.messageId, file.filePath)
                          }
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = themeVars.hoverBg
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = themeVars.bgContainer
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Space size={6} style={{ marginBottom: 1 }}>
                              <FileOutlined style={{ color: themeVars.primary }} />
                              <Text strong style={{ fontSize: 12, maxWidth: 320 }} ellipsis={{ tooltip: fileName }}>
                                {fileName}
                              </Text>
                              {ext && (
                                <Tag color={getExtColor(ext)} style={{ fontSize: 10, marginInlineEnd: 0, lineHeight: '16px', paddingInline: 5 }}>
                                  .{ext}
                                </Tag>
                              )}
                              <Tag color="default" style={{ fontSize: 10, marginInlineEnd: 0, lineHeight: '16px', paddingInline: 5 }}>
                                {(file.contentLength / 1024).toFixed(1)} KB
                              </Tag>
                            </Space>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: themeVars.textSecondary,
                                  fontFamily: 'monospace',
                                  borderRadius: 6,
                                  padding: '1px 0',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  flex: 1
                                }}
                                title={file.filePath}
                              >
                                {file.filePath}
                              </div>
                              <Text type="secondary" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                                <ClockCircleOutlined style={{ marginRight: 3 }} />
                                {dayjs(file.timestamp).format('MM-DD HH:mm:ss')}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>
                                <FolderOutlined style={{ marginRight: 3 }} />
                                {getProjectName(file.project)}
                              </Text>
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: 2,
                              borderRadius: 8,
                              height: 'fit-content'
                            }}
                          >
                            <Tooltip title="查看快照">
                              <Button
                                type="text"
                                size="small"
                                icon={<EyeOutlined />}
                                onClick={e => {
                                  e.stopPropagation()
                                  handleViewSnapshot(file.sessionId, file.messageId, file.filePath)
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="相关会话">
                              <Button
                                type="text"
                                size="small"
                                icon={<FileOutlined />}
                                onClick={e => {
                                  e.stopPropagation()
                                  setConversationSessionId(file.sessionId)
                                  setConversationProject(file.project)
                                  setConversationModalVisible(true)
                                }}
                              />
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    </List.Item>
                  )
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <Pagination
                  current={currentPage}
                  pageSize={pageSize}
                  total={flattenedFiles.length}
                  size="small"
                  showSizeChanger
                  pageSizeOptions={['10', '20', '50', '100']}
                  showTotal={total => `共 ${total} 条`}
                  onChange={(page, size) => {
                    setCurrentPage(page)
                    if (size !== pageSize) {
                      setPageSize(size)
                    }
                  }}
                />
              </div>
            </>
          )}
        </Space>
      </div>

      {/* 文件内容预览弹窗 */}
      <Modal
        title={
          <Space>
            <FileOutlined style={{ color: themeVars.primary }} />
            <Text>文件快照</Text>
            <Text code style={{ fontSize: 11 }}>
              {previewFilePath}
            </Text>
          </Space>
        }
        open={previewVisible}
        onCancel={() => {
          setPreviewVisible(false)
          setShowDiff(false)
          setDiffResult([])
        }}
        width="70%"
        footer={[
          <Button
            key="diff"
            icon={<SwapOutlined />}
            type={showDiff ? 'primary' : 'default'}
            loading={diffLoading}
            onClick={handleToggleDiff}
          >
            {showDiff ? '查看快照' : '对比差异'}
          </Button>,
          <Button key="restore" icon={<RollbackOutlined />} onClick={handleRestoreFile}>
            恢复文件
          </Button>,
          <Button key="copy" icon={<CopyOutlined />} onClick={handleCopyContent}>
            复制内容
          </Button>,
          <Button key="close" type="primary" onClick={() => {
            setPreviewVisible(false)
            setShowDiff(false)
            setDiffResult([])
          }}>
            关闭
          </Button>
        ]}
        styles={{
          body: {
            maxHeight: 'calc(100vh - 260px)',
            overflowY: 'auto'
          } as React.CSSProperties
        }}
      >
        {/* 折行开关 */}
        {!previewLoading && !diffLoading && (
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>折行</Text>
              <Switch size="small" checked={previewWrap} onChange={setPreviewWrap} />
            </Space>
          </div>
        )}
        {previewLoading || diffLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" tip="加载中..."><div style={{ padding: 40 }} /></Spin>
          </div>
        ) : showDiff ? (
          /* Diff 视图 */
          <div
            style={{
              background: themeVars.bgCode,
              padding: 16,
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'Fira Code, Consolas, Monaco, monospace',
              lineHeight: 1.6,
              overflow: 'auto',
              border: `1px solid ${themeVars.borderSecondary}`,
              maxHeight: 500
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 11 }}>
              <Tag color="red">- 当前文件内容</Tag>
              <Tag color="green">+ 快照内容</Tag>
            </div>
            {diffResult.map((part, index) => {
              const color = part.added
                ? themeVars.diffAddBg
                : part.removed
                  ? themeVars.diffRemoveBg
                  : 'transparent'
              const textColor = part.added
                ? themeVars.diffAddText
                : part.removed
                  ? themeVars.diffRemoveText
                  : themeVars.diffNeutralText
              const prefix = part.added ? '+' : part.removed ? '-' : ' '

              return (
                <pre
                  key={index}
                  style={{
                    margin: 0,
                    padding: '0 8px',
                    background: color,
                    color: textColor,
                    whiteSpace: previewWrap ? 'pre-wrap' : 'pre',
                    wordBreak: previewWrap ? 'break-word' : 'normal',
                    borderLeft: part.added
                      ? `3px solid ${themeVars.diffAddBorder}`
                      : part.removed
                        ? `3px solid ${themeVars.diffRemoveBorder}`
                        : '3px solid transparent'
                  }}
                >
                  {part.value
                    .split('\n')
                    .filter((l, i, arr) => i < arr.length - 1 || l !== '')
                    .map(line => `${prefix} ${line}`)
                    .join('\n')}
                </pre>
              )
            })}
            {diffResult.length === 0 && (
              <Text type="secondary">没有差异 - 文件内容相同</Text>
            )}
          </div>
        ) : (
          <Editor
            height="500px"
            language={getMonacoLanguage(previewFilePath, previewContent)}
            value={previewContent || '// 文件内容为空'}
            theme={darkMode ? 'vs-dark' : 'light'}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: previewWrap ? 'on' : 'off',
              wrappingIndent: 'indent',
              automaticLayout: true,
              domReadOnly: true,
              renderLineHighlight: 'none',
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8
              }
            }}
          />
        )}
      </Modal>

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

export default RecentEditsView
