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
  Switch
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
  SwapOutlined
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
  const [currentFileContent, setCurrentFileContent] = useState<string | null>(null)
  const [diffResult, setDiffResult] = useState<Change[]>([])
  const [diffLoading, setDiffLoading] = useState(false)
  const [previewWrap, setPreviewWrap] = useState(false)

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
        setCurrentFileContent(result.content)
        const changes = diffLines(result.content, previewContent)
        setDiffResult(changes)
        setShowDiff(true)
      } else {
        // 文件可能已被删除
        setCurrentFileContent(null)
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
          <p style={{ color: '#fa8c16', marginTop: 8 }}>
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
        <Spin size="large" tip="加载文件编辑记录..." />
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
          padding: '16px 24px',
          minHeight: 0
        }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 过滤器 */}
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
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
            <List
              dataSource={flattenedFiles}
              renderItem={file => {
                const ext = getFileExtension(file.filePath)
                const fileName = getFileName(file.filePath)
                return (
                  <List.Item style={{ padding: '8px 0' }}>
                    <Card
                      hoverable
                      size="small"
                      style={{ width: '100%' }}
                      onClick={() =>
                        handleViewSnapshot(file.sessionId, file.messageId, file.filePath)
                      }
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space size={8} style={{ marginBottom: 4 }}>
                            <FileOutlined style={{ color: themeVars.primary }} />
                            <Text strong style={{ fontSize: 13 }}>
                              {fileName}
                            </Text>
                            {ext && (
                              <Tag color={getExtColor(ext)} style={{ fontSize: 10 }}>
                                .{ext}
                              </Tag>
                            )}
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {(file.contentLength / 1024).toFixed(1)} KB
                            </Text>
                          </Space>
                          <div>
                            <Text
                              code
                              style={{
                                fontSize: 11,
                                color: themeVars.textSecondary,
                                wordBreak: 'break-all'
                              }}
                            >
                              {file.filePath}
                            </Text>
                          </div>
                          <div style={{ marginTop: 4 }}>
                            <Space size={12}>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                <ClockCircleOutlined style={{ marginRight: 4 }} />
                                {dayjs(file.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                <FolderOutlined style={{ marginRight: 4 }} />
                                {getProjectName(file.project)}
                              </Text>
                            </Space>
                          </div>
                        </div>
                        <Space direction="vertical" size={0}>
                          <Tooltip title="查看快照内容">
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
                          <Tooltip title="查看相关会话">
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
                        </Space>
                      </div>
                    </Card>
                  </List.Item>
                )
              }}
            />
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
          setCurrentFileContent(null)
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
            setCurrentFileContent(null)
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
            <Spin size="large" tip="加载中..." />
          </div>
        ) : showDiff ? (
          /* Diff 视图 */
          <div
            style={{
              background: darkMode ? '#1e1e1e' : '#f6f8fa',
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
                ? darkMode ? '#2ea04370' : '#e6ffed'
                : part.removed
                  ? darkMode ? '#da363370' : '#ffeef0'
                  : 'transparent'
              const textColor = part.added
                ? darkMode ? '#7ee787' : '#22863a'
                : part.removed
                  ? darkMode ? '#f85149' : '#cb2431'
                  : darkMode ? '#d4d4d4' : '#24292e'
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
                      ? '3px solid #2ea043'
                      : part.removed
                        ? '3px solid #da3633'
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
