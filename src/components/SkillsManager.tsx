/**
 * Claude Code Skills 管理组件
 * 提供 Skills 的查看、新增、删除功能
 */

import { useState, useEffect } from 'react'
import {
  Space,
  Typography,
  Button,
  Empty,
  Tag,
  Tooltip,
  message,
  Modal,
  Form,
  Input,
  Popconfirm,
  Spin,
  Segmented
} from 'antd'
import {
  ThunderboltOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  BulbOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  EyeOutlined
} from '@ant-design/icons'
import { ClaudeSkill } from '../types'
import { getThemeVars } from '../theme'
import Editor from '@monaco-editor/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'

const { Text, Paragraph } = Typography

interface SkillsManagerProps {
  darkMode: boolean
  onRefresh?: () => void
}

const SkillsManager = (props: SkillsManagerProps) => {
  const { darkMode, onRefresh } = props
  const themeVars = getThemeVars(darkMode)

  const [skills, setSkills] = useState<ClaudeSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [polishing, setPolishing] = useState(false)
  const [editingSkill, setEditingSkill] = useState<ClaudeSkill | null>(null)
  const [contentValue, setContentValue] = useState('')
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit')
  const [editorFullscreen, setEditorFullscreen] = useState(false)

  const [form] = Form.useForm()

  const buildDefaultSkillContent = (name: string) => `---
name: ${name || 'your-skill-name'}
description: 描述这个 Skill 做什么，以及在什么场景触发使用（第三人称）。
---

# ${name || 'your-skill-name'}

## 使用说明

在这里写清楚该 Skill 的职责、边界和触发条件。

## 示例

\`\`\`markdown
- 输入场景：
- 期望输出：
\`\`\`
`

  const parseFrontmatter = (content: string): { body: string; data: Record<string, string> } => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (!match) {
      return { body: content, data: {} }
    }

    const data: Record<string, string> = {}
    match[1]
      .split('\n')
      .map(line => line.trim())
      .forEach(line => {
        const idx = line.indexOf(':')
        if (idx > 0) {
          const key = line.slice(0, idx).trim()
          const value = line
            .slice(idx + 1)
            .trim()
            .replace(/^["']|["']$/g, '')
          if (key) {
            data[key] = value
          }
        }
      })

    return { body: match[2], data }
  }

  const extractDescriptionFromSkillContent = (content: string): string => {
    if (!content.trim()) {
      return ''
    }

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    if (frontmatterMatch?.[1]) {
      const descMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m)
      if (descMatch?.[1]) {
        return descMatch[1].trim().replace(/^["']|["']$/g, '')
      }
    }

    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))

    return lines[0] || ''
  }

  const normalizeSkillContent = (name: string, content: string): { normalized: string; description: string } => {
    const trimmed = content.trim()
    const rawContent = trimmed || buildDefaultSkillContent(name).trim()
    const { body, data } = parseFrontmatter(rawContent)

    const descriptionFromContent = data.description || extractDescriptionFromSkillContent(rawContent)
    const finalDescription = descriptionFromContent || `用于处理 ${name} 相关任务。`
    const normalizedName = data.name || name

    const frontmatter = `---
name: ${normalizedName}
description: ${finalDescription}
---`

    const normalized = `${frontmatter}\n\n${body.trim() || `# ${normalizedName}\n\n## 使用说明\n\n补充 Skill 说明。`}\n`

    return { normalized, description: finalDescription }
  }

  const handleModalClose = () => {
    setModalVisible(false)
    setEditingSkill(null)
    setContentValue('')
    setEditorMode('edit')
    setEditorFullscreen(false)
    form.resetFields()
  }

  const handleModalCancel = () => {
    if (editorFullscreen) {
      setEditorFullscreen(false)
      return
    }
    handleModalClose()
  }

  const handleModalOk = async () => {
    if (editorFullscreen) {
      setEditorFullscreen(false)
      return
    }
    await handleSubmit()
  }

  // 加载 Skills
  const loadSkills = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.getClaudeSkills()
      if (result.success && result.skills) {
        setSkills(result.skills)
      }
    } catch (error) {
      message.error('加载 Skills 失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSkills()
  }, [])

  // 删除 Skill
  const handleDelete = async (name: string) => {
    try {
      const result = await window.electronAPI.deleteClaudeSkill(name)
      if (result.success) {
        message.success('删除成功')
        loadSkills()
        onRefresh?.()
      } else {
        message.error(result.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  // 打开新增弹窗
  const handleOpenCreate = () => {
    setEditingSkill(null)
    form.setFieldsValue({ name: '' })
    setContentValue(buildDefaultSkillContent(''))
    setEditorMode('edit')
    setEditorFullscreen(false)
    setModalVisible(true)
  }

  // 打开编辑弹窗
  const handleOpenEdit = async (skill: ClaudeSkill) => {
    setEditingSkill(skill)
    setEditorMode('edit')
    setEditorFullscreen(false)
    form.setFieldsValue({
      name: skill.name
    })
    // 读取 SKILL.md 文件内容
    try {
      const result = await window.electronAPI.readClaudeSkillContent(skill.name)
      if (result.success && result.content) {
        setContentValue(result.content)
      } else {
        setContentValue('')
      }
    } catch {
      setContentValue('')
    }
    setModalVisible(true)
  }

  // AI 润色描述
  const handleResetTemplate = () => {
    const skillName = (form.getFieldValue('name') || '').trim()
    setContentValue(buildDefaultSkillContent(skillName))
    message.success('已重置为标准模板')
  }

  // AI 润色 SKILL.md 内容（保留 Claude Skill 最佳实践）
  const handlePolishSkillContent = async () => {
    if (!contentValue.trim()) {
      message.warning('请先输入 SKILL.md 内容')
      return
    }

    setPolishing(true)
    try {
      const skillName = form.getFieldValue('name') || editingSkill?.name || 'your-skill-name'

      const polishPrompt = `你是 Claude Code Skill 文档优化专家。请润色下面的 SKILL.md 内容，并严格遵守以下约束：

1. 必须保留 YAML frontmatter（name/description），且 name 保持原值：${skillName}
2. description 必须用第三人称，包含 WHAT + WHEN，便于触发 Skill 发现
3. 结构清晰、简洁优先，SKILL.md 总体保持精炼（避免冗长废话）
4. 不要引入与原需求无关的新能力，不要改变 Skill 的核心意图
5. 保留 Markdown 语法正确性，输出必须是完整可用的 SKILL.md
6. 若原文缺失关键结构，请补全为合理的最小结构：标题、说明、示例
7. 若当前描述为空，可根据内容生成高质量 description

当前 Skill 名称：${skillName}

原始 SKILL.md：
${contentValue}

请直接返回润色后的完整 SKILL.md 内容，不要添加解释。`

      const result = await window.electronAPI.formatPrompt(polishPrompt, '')
      if (result.success && result.formatted) {
        const polished = result.formatted.trim()
        setContentValue(polished)
        message.success('SKILL.md AI 润色完成')
      } else {
        message.error(result.error || 'SKILL.md AI 润色失败')
      }
    } catch (error) {
      message.error('SKILL.md AI 润色失败')
    } finally {
      setPolishing(false)
    }
  }

  // 提交表单（创建或更新）
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const skillName = editingSkill?.name || values.name
      const { normalized, description } = normalizeSkillContent(skillName, contentValue)

      setSubmitting(true)

      if (editingSkill) {
        // 更新现有 Skill
        const result = await window.electronAPI.updateClaudeSkill(
          editingSkill.name,
          description,
          normalized
        )

        if (result.success) {
          message.success('更新成功')
          handleModalClose()
          loadSkills()
          onRefresh?.()
        } else {
          message.error(result.error || '更新失败')
        }
      } else {
        // 创建新 Skill
        const result = await window.electronAPI.createClaudeSkill(
          values.name,
          description,
          normalized
        )

        if (result.success) {
          message.success('创建成功')
          handleModalClose()
          loadSkills()
          onRefresh?.()

          // 询问是否打开文件夹
          if (result.skillPath) {
            Modal.confirm({
              title: '创建成功',
              content: '是否立即打开 Skill 文件夹进行编辑?',
              okText: '打开',
              cancelText: '稍后',
              onOk: () => {
                window.electronAPI.openInFinder(result.skillPath!)
              }
            })
          }
        } else {
          message.error(result.error || '创建失败')
        }
      }
    } catch (error) {
      // 表单验证失败
    } finally {
      setSubmitting(false)
    }
  }

  // 复制路径
  const copyToClipboard = async (text: string) => {
    await window.electronAPI.copyToClipboard(text)
    message.success('已复制')
  }

  const renderMarkdownPreview = () => {
    return (
      <div
        style={{
          height: '100%',
          overflow: 'auto',
          padding: 16,
          background: themeVars.bgContainer,
          color: themeVars.text
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ inline, className, children, ...codeProps }: any) {
              const match = /language-(\w+)/.exec(className || '')
              return !inline && match ? (
                <SyntaxHighlighter
                  style={darkMode ? vscDarkPlus : prism}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: '12px 0',
                    borderRadius: 6,
                    fontSize: 13,
                    background: themeVars.bgCode
                  }}
                  showLineNumbers
                  {...codeProps}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code
                  style={{
                    background: themeVars.codeBg,
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontSize: 13,
                    fontFamily: 'monospace'
                  }}
                  {...codeProps}
                >
                  {children}
                </code>
              )
            },
            p({ children }) {
              return <p style={{ marginBottom: 12, lineHeight: 1.7 }}>{children}</p>
            },
            h1({ children }) {
              return <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>{children}</h1>
            },
            h2({ children }) {
              return <h2 style={{ fontSize: 19, fontWeight: 600, marginBottom: 14 }}>{children}</h2>
            },
            h3({ children }) {
              return <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{children}</h3>
            },
            ul({ children }) {
              return <ul style={{ marginBottom: 12, paddingLeft: 24 }}>{children}</ul>
            },
            ol({ children }) {
              return <ol style={{ marginBottom: 12, paddingLeft: 24 }}>{children}</ol>
            },
            li({ children }) {
              return <li style={{ marginBottom: 6 }}>{children}</li>
            },
            pre({ children }) {
              return <>{children}</>
            },
            blockquote({ children }) {
              return (
                <blockquote
                  style={{
                    borderLeft: `3px solid ${themeVars.primary}`,
                    paddingLeft: 16,
                    marginLeft: 0,
                    marginBottom: 12,
                    color: themeVars.textSecondary
                  }}
                >
                  {children}
                </blockquote>
              )
            },
            table({ children }) {
              return (
                <table
                  style={{
                    width: '100%',
                    marginBottom: 16,
                    marginTop: 16,
                    borderCollapse: 'collapse',
                    fontSize: 14,
                    border: `1px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`
                  }}
                >
                  {children}
                </table>
              )
            },
            thead({ children }) {
              return (
                <thead
                  style={{
                    background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderBottom: `2px solid ${themeVars.primary}`
                  }}
                >
                  {children}
                </thead>
              )
            },
            tr({ children }) {
              return (
                <tr
                  style={{
                    borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                  }}
                >
                  {children}
                </tr>
              )
            },
            th({ children }) {
              return (
                <th
                  style={{
                    padding: '12px 16px',
                    textAlign: 'left',
                    fontWeight: 600,
                    borderRight: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                  }}
                >
                  {children}
                </th>
              )
            },
            td({ children }) {
              return (
                <td
                  style={{
                    padding: '10px 16px',
                    borderRight: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                  }}
                >
                  {children}
                </td>
              )
            }
          }}
        >
          {contentValue || '*暂无内容*'}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <div>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12
        }}
      >
        <Text type="secondary" style={{ fontSize: 11 }}>
          Skills 为 Claude Code 提供专业领域知识
        </Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          onClick={handleOpenCreate}
        >
          新增 Skill
        </Button>
      </div>

      {/* Skills 列表 */}
      <Spin spinning={loading}>
      {skills.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary" style={{ fontSize: 11 }}>暂无已安装的 Skills</Text>}
          style={{ margin: '12px 0' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {skills.map(skill => (
            <div
              key={skill.name}
              style={{
                padding: '8px 10px',
                border: `1px solid ${themeVars.border}`,
                borderRadius: 6,
                backgroundColor: themeVars.bgSection
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <Space size={6}>
                  <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                  <Text strong style={{ fontSize: 12 }}>
                    {skill.name}
                  </Text>
                  <Tag style={{ fontSize: 10, padding: '0 4px' }}>{skill.files.length} 文件</Tag>
                </Space>
                <Space size={4}>
                  <Tooltip title="编辑">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      size="small"
                      onClick={() => handleOpenEdit(skill)}
                    />
                  </Tooltip>
                  <Tooltip title="复制路径">
                    <Button
                      type="text"
                      icon={<CopyOutlined />}
                      size="small"
                      onClick={() => copyToClipboard(skill.path)}
                    />
                  </Tooltip>
                  <Tooltip title="打开文件夹">
                    <Button
                      type="text"
                      icon={<FolderOpenOutlined />}
                      size="small"
                      onClick={() => window.electronAPI.openInFinder(skill.path)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确定删除此 Skill？"
                    description="将删除整个 Skill 文件夹，此操作不可恢复"
                    onConfirm={() => handleDelete(skill.name)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Tooltip title="删除">
                      <Button type="text" icon={<DeleteOutlined />} size="small" danger />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              </div>
              {skill.description && (
                <Text
                  type="secondary"
                  style={{ fontSize: 10, display: 'block', marginTop: 4 }}
                  ellipsis
                >
                  {skill.description}
                </Text>
              )}
            </div>
          ))}
        </div>
      )}
      </Spin>

      {/* 创建/编辑 Skill Modal */}
      <Modal
        title={
          <Space>
            <ThunderboltOutlined />
            <span>{editorFullscreen ? '全屏编辑 SKILL.md' : editingSkill ? '编辑 Skill' : '新增 Skill'}</span>
          </Space>
        }
        open={modalVisible}
        onCancel={handleModalCancel}
        onOk={handleModalOk}
        confirmLoading={submitting}
        width={editorFullscreen ? '94vw' : 860}
        style={{ top: editorFullscreen ? 8 : 40 }}
        styles={{
          body: {
            maxHeight: editorFullscreen ? 'calc(100vh - 170px)' : 'calc(100vh - 220px)',
            overflow: 'hidden'
          }
        }}
      >
        <Form form={form} layout="vertical">
          {!editorFullscreen && (
            <>
              <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
                使用 <Text code>SKILL.md</Text> 作为唯一来源。描述会从 frontmatter 自动读取，不再单独维护。
              </Paragraph>
              <Form.Item
                label="Skill 名称"
                name="name"
                rules={[
                  { required: true, message: '请输入 Skill 名称' },
                  {
                    pattern: /^[a-z0-9-]+$/,
                    message: '只能包含小写字母、数字和连字符'
                  },
                  {
                    max: 64,
                    message: '最多 64 个字符'
                  }
                ]}
                extra="例如: react-best-practices, python-async-guide（使用 kebab-case 命名）"
              >
                <Input placeholder="react-best-practices" disabled={!!editingSkill} />
              </Form.Item>
            </>
          )}

          <Form.Item
            label={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{editorFullscreen ? 'SKILL.md 编辑器' : 'Skill 内容（SKILL.md）'}</span>
                <Space size={8}>
                  <Segmented
                    size="small"
                    value={editorMode}
                    onChange={value => setEditorMode(value as 'edit' | 'preview')}
                    options={[
                      { label: '编辑', value: 'edit', icon: <EditOutlined /> },
                      { label: '预览', value: 'preview', icon: <EyeOutlined /> }
                    ]}
                  />
                  <Tooltip title="按 Claude Skill 最佳实践润色 SKILL.md">
                    <Button
                      type="link"
                      icon={<BulbOutlined />}
                      size="small"
                      loading={polishing}
                      onClick={handlePolishSkillContent}
                      style={{ padding: 0, height: 'auto' }}
                    >
                      AI 润色
                    </Button>
                  </Tooltip>
                  {!editingSkill && (
                    <Tooltip title="重置为标准模板">
                      <Button type="link" size="small" onClick={handleResetTemplate} style={{ padding: 0, height: 'auto' }}>
                        重置模板
                      </Button>
                    </Tooltip>
                  )}
                  <Tooltip title={editorFullscreen ? '退出全屏编辑' : '全屏编辑'}>
                    <Button
                      type="text"
                      size="small"
                      icon={editorFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                      onClick={() => setEditorFullscreen(prev => !prev)}
                    />
                  </Tooltip>
                </Space>
              </div>
            }
            extra={editorFullscreen ? undefined : '支持 Markdown 预览与代码高亮，保存时会自动补全 frontmatter。'}
            style={{ marginBottom: 0 }}
          >
            <div
              style={{
                border: `1px solid ${themeVars.border}`,
                borderRadius: 6,
                overflow: 'hidden',
                height: editorFullscreen ? 'calc(100vh - 250px)' : 420
              }}
            >
              {editorMode === 'edit' ? (
                <Editor
                  height="100%"
                  defaultLanguage="markdown"
                  value={contentValue}
                  onChange={value => setContentValue(value || '')}
                  theme={darkMode ? 'vs-dark' : 'light'}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    wordWrap: 'on'
                  }}
                />
              ) : (
                renderMarkdownPreview()
              )}
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default SkillsManager
