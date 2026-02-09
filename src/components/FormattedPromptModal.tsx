import { useState, useEffect } from 'react'
import { Button, Space, message, Spin, Segmented, Tooltip } from 'antd'
import { CopyOutlined, RobotOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ElectronModal from './ElectronModal'
import { getThemeVars } from '../theme'
import crypto from 'crypto-js'

type ViewMode = 'formatted' | 'raw'

interface FormattedPromptModalProps {
  visible: boolean
  onClose: () => void
  content: string
  darkMode: boolean
  title?: string
  images?: string[] // 图片路径数组（保留用于未来扩展）
  onImageClick?: (imageNumber: number) => void // 图片点击回调（保留用于未来扩展）
}

/**
 * 格式化 Prompt 详情弹窗组件
 *
 * 功能:
 * - 自动尝试 AI 格式化，成功则显示 Markdown 视图
 * - 支持在"AI 润色"和"原始格式"之间切换
 * - 原始格式不使用 Markdown 渲染
 */
function FormattedPromptModal({
  visible,
  onClose,
  content,
  darkMode,
  title = 'Prompt 详情'
}: FormattedPromptModalProps) {
  const themeVars = getThemeVars(darkMode)

  const [formattedContent, setFormattedContent] = useState<string>('')
  const [formatting, setFormatting] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('formatted')
  const [refreshTrigger, setRefreshTrigger] = useState(0) // 用于触发刷新

  // 计算内容 hash（用于缓存）
  const contentHash = crypto.MD5(content).toString()

  // 弹窗打开时自动尝试格式化，并重置为 AI 润色模式
  useEffect(() => {
    if (!visible) return

    const tryFormat = async () => {
      setFormatting(true)
      setFormattedContent('') // 重置状态
      setViewMode('formatted') // 重置为 AI 润色模式

      try {
        // 如果是刷新操作（refreshTrigger > 0），使用带时间戳的 hash 跳过缓存
        const hashToUse =
          refreshTrigger > 0 ? `${contentHash}_${Date.now()}_${refreshTrigger}` : contentHash

        const result = await window.electronAPI.formatPrompt(content, hashToUse)

        if (result.success && result.formatted) {
          setFormattedContent(result.formatted)
        }
        // 失败时不设置 formattedContent，自动显示原始内容
      } catch (error) {
        // 静默失败，显示原始内容
        console.warn('AI 格式化失败:', error)
      } finally {
        setFormatting(false)
      }
    }

    tryFormat()
  }, [visible, content, contentHash, refreshTrigger])

  // 刷新 AI 润色内容（跳过缓存重新生成）
  const handleRefresh = () => {
    if (formatting) return // 正在格式化时不允许刷新
    setRefreshTrigger(prev => prev + 1)
  }

  // 复制内容（根据当前模式复制）
  const handleCopy = async () => {
    const textToCopy = viewMode === 'formatted' && formattedContent ? formattedContent : content
    try {
      await window.electronAPI.copyToClipboard(textToCopy)
      message.success('已复制到剪贴板')
    } catch (error) {
      message.error('复制失败')
    }
  }

  // 渲染原始格式内容（纯文本，不使用 Markdown）
  const renderRawContent = () => {
    return (
      <div
        style={{
          padding: '16px 20px',
          background: themeVars.bgElevated,
          borderRadius: 8,
          fontSize: 14,
          lineHeight: 1.7,
          color: themeVars.text,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace"
        }}
      >
        {content}
      </div>
    )
  }

  // 渲染格式化后的 Markdown
  const renderFormattedContent = () => {
    if (!formattedContent) {
      return (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            background: themeVars.bgElevated,
            borderRadius: 8,
            color: themeVars.textSecondary
          }}
        >
          <FileTextOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div>暂无 AI 润色内容</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>请切换到"原始格式"查看内容</div>
        </div>
      )
    }

    return (
      <div
        style={{
          padding: '16px 20px',
          background: themeVars.bgElevated,
          borderRadius: 8,
          fontSize: 14,
          lineHeight: 1.7,
          color: themeVars.text
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '')
              return !inline && match ? (
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: '12px 0',
                    borderRadius: 6,
                    fontSize: 13
                  }}
                  showLineNumbers
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
                    fontSize: 13,
                    fontFamily: 'monospace'
                  }}
                  {...props}
                >
                  {children}
                </code>
              )
            },
            p({ children }) {
              return <p style={{ marginBottom: 12, lineHeight: 1.7 }}>{children}</p>
            },
            h1({ children }) {
              return (
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    marginBottom: 16,
                    marginTop: 24
                  }}
                >
                  {children}
                </h1>
              )
            },
            h2({ children }) {
              return (
                <h2
                  style={{
                    fontSize: 19,
                    fontWeight: 600,
                    marginBottom: 14,
                    marginTop: 20
                  }}
                >
                  {children}
                </h2>
              )
            },
            h3({ children }) {
              return (
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    marginBottom: 12,
                    marginTop: 16
                  }}
                >
                  {children}
                </h3>
              )
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
            // 表格组件
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
            tbody({ children }) {
              return <tbody>{children}</tbody>
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
                    color: themeVars.text,
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
                    color: themeVars.text,
                    borderRight: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                  }}
                >
                  {children}
                </td>
              )
            }
          }}
        >
          {formattedContent}
        </ReactMarkdown>
      </div>
    )
  }

  // 渲染主内容（根据模式和状态）
  const renderContent = () => {
    // 正在格式化
    if (formatting) {
      return (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            background: themeVars.bgElevated,
            borderRadius: 8
          }}
        >
          <Spin size="large" />
          <div
            style={{
              marginTop: 16,
              fontSize: 14,
              color: themeVars.textSecondary
            }}
          >
            <RobotOutlined style={{ marginRight: 6 }} />
            AI 正在格式化内容...
          </div>
        </div>
      )
    }

    // 根据当前视图模式渲染
    if (viewMode === 'raw') {
      return renderRawContent()
    } else {
      return renderFormattedContent()
    }
  }

  return (
    <ElectronModal
      title={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingRight: 40
          }}
        >
          <span>{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* 刷新按钮 - 仅在 AI 润色模式下显示 */}
            {!formatting && viewMode === 'formatted' && (
              <Tooltip title="重新生成 AI 润色">
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleRefresh}
                  style={{
                    color: themeVars.textSecondary,
                    fontSize: 14
                  }}
                />
              </Tooltip>
            )}
            {/* 切换器 */}
            {!formatting && (
              <Segmented
                value={viewMode}
                onChange={value => setViewMode(value as ViewMode)}
                options={[
                  {
                    label: (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0 4px'
                        }}
                      >
                        <RobotOutlined
                          style={{
                            fontSize: 14,
                            color:
                              viewMode === 'formatted' ? themeVars.primary : themeVars.textSecondary
                          }}
                        />
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: viewMode === 'formatted' ? 500 : 400
                          }}
                        >
                          AI 润色
                        </span>
                      </span>
                    ),
                    value: 'formatted'
                  },
                  {
                    label: (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0 4px'
                        }}
                      >
                        <FileTextOutlined
                          style={{
                            fontSize: 14,
                            color: viewMode === 'raw' ? themeVars.primary : themeVars.textSecondary
                          }}
                        />
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: viewMode === 'raw' ? 500 : 400
                          }}
                        >
                          原始格式
                        </span>
                      </span>
                    ),
                    value: 'raw'
                  }
                ]}
                style={{
                  background: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                  borderRadius: 6,
                  padding: 2
                }}
              />
            )}
          </div>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={900}
      styles={{
        body: {
          maxHeight: '70vh',
          overflow: 'auto'
        } as React.CSSProperties
      }}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center'
          }}
        >
          <Space>
            <Button icon={<CopyOutlined />} onClick={handleCopy}>
              复制
            </Button>
            <Button type="primary" onClick={onClose}>
              关闭
            </Button>
          </Space>
        </div>
      }
    >
      {renderContent()}
    </ElectronModal>
  )
}

export default FormattedPromptModal
