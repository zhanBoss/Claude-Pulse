import { Typography } from 'antd'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus, prism } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { getThemeVars } from '../theme'

const { Text } = Typography

interface SmartContentProps {
  content: string
  darkMode: boolean
  maxLines?: number // 最大显示行数，超过则截断
  onClick?: () => void // 点击事件（用于展开）
  onPastedTextClick?: (pastedTextKey: string) => void // 点击 Pasted text 占位符的回调
  hasPastedContents?: boolean // 是否有粘贴内容（用于判断是否显示可点击样式）
  onImageClick?: (imageNumber: number) => void // 点击 Image 占位符的回调
  images?: string[] // 图片路径数组
}

/**
 * 智能内容渲染组件
 *
 * 功能：
 * 1. 自动检测链接并支持点击跳转
 * 2. 支持 Pasted text / Image 占位符交互
 * 3. 支持 Markdown 渲染（含内嵌代码块高亮）
 * 4. 列表视图中 prompt 统一以纯文本展示，不做代码块自动检测
 */
const SmartContent = (props: SmartContentProps) => {
  const {
    content,
    darkMode,
    maxLines,
    onClick,
    onPastedTextClick,
    hasPastedContents,
    onImageClick,
    images
  } = props

  const themeVars = getThemeVars(darkMode)

  // 检测是否为 Markdown 内容
  const isMarkdown = (text: string): boolean => {
    const trimmed = text.trim()
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m, // 标题
      /^\*\*.*\*\*$/m, // 粗体
      /^\[.+\]\(.+\)$/m, // 链接
      /^```/m, // 代码块
      /^[-*+]\s+/m // 列表
    ]
    return markdownPatterns.some(pattern => pattern.test(trimmed))
  }

  // 检测并渲染链接、Pasted text 占位符和 Image 占位符
  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g

    // 合并三个正则，按出现顺序分割
    const combinedRegex =
      /(https?:\/\/[^\s]+|\[Pasted text #\d+(?:\s+\+\d+\s+lines)?\]|\[Image #\d+\])/g
    const parts = text.split(combinedRegex)

    return parts.map((part, index) => {
      // 检查是否为 URL
      if (urlRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: themeVars.primary,
              textDecoration: 'underline',
              cursor: 'pointer'
            }}
            onClick={e => {
              e.stopPropagation()
              window.electronAPI.openExternal(part)
              e.preventDefault()
            }}
          >
            {part}
          </a>
        )
      }

      // 检查是否为 Pasted text 占位符
      const pastedTextMatch = part.match(/\[Pasted text #(\d+)(?:\s+\+(\d+)\s+lines)?\]/)
      if (pastedTextMatch && hasPastedContents && onPastedTextClick) {
        const pastedTextNumber = pastedTextMatch[1]
        const linesCount = pastedTextMatch[2]
        const pastedTextKey = `Pasted text #${pastedTextNumber}`

        return (
          <span
            key={index}
            style={{
              background: `${themeVars.primary}15`,
              color: themeVars.primary,
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: '0.95em',
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${themeVars.primary}30`,
              display: 'inline-block',
              transition: 'all 0.2s'
            }}
            onClick={e => {
              e.stopPropagation()
              onPastedTextClick(pastedTextKey)
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = `${themeVars.primary}25`
              e.currentTarget.style.borderColor = `${themeVars.primary}60`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = `${themeVars.primary}15`
              e.currentTarget.style.borderColor = `${themeVars.primary}30`
            }}
            title={`点击查看 Copy Text 内容${linesCount ? ` (${linesCount} 行)` : ''}`}
          >
            {part}
          </span>
        )
      }

      // 检查是否为 Image 占位符
      const imageMatch = part.match(/\[Image #(\d+)\]/)
      if (imageMatch && images && images.length > 0 && onImageClick) {
        const imageNumber = parseInt(imageMatch[1])

        return (
          <span
            key={index}
            style={{
              background: darkMode ? 'rgba(217, 119, 87, 0.15)' : 'rgba(217, 119, 87, 0.1)',
              color: themeVars.primary,
              padding: '3px 10px',
              borderRadius: 6,
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              border: `1px solid ${darkMode ? 'rgba(217, 119, 87, 0.3)' : 'rgba(217, 119, 87, 0.25)'}`,
              display: 'inline-block',
              transition: 'all 0.2s',
              marginRight: 6,
              verticalAlign: 'middle'
            }}
            onClick={e => {
              e.stopPropagation()
              onImageClick(imageNumber)
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = darkMode
                ? 'rgba(217, 119, 87, 0.25)'
                : 'rgba(217, 119, 87, 0.18)'
              e.currentTarget.style.borderColor = darkMode
                ? 'rgba(217, 119, 87, 0.5)'
                : 'rgba(217, 119, 87, 0.4)'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = `0 2px 8px ${darkMode ? 'rgba(217, 119, 87, 0.2)' : 'rgba(217, 119, 87, 0.15)'}`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = darkMode
                ? 'rgba(217, 119, 87, 0.15)'
                : 'rgba(217, 119, 87, 0.1)'
              e.currentTarget.style.borderColor = darkMode
                ? 'rgba(217, 119, 87, 0.3)'
                : 'rgba(217, 119, 87, 0.25)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
            title={`点击预览图片 #${imageNumber}`}
          >
            {part}
          </span>
        )
      }

      return <span key={index}>{part}</span>
    })
  }

  // 渲染 Markdown（仅用于明确的 Markdown 内容，内嵌代码块仍支持高亮）
  const renderMarkdown = (text: string) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...codeProps }: any) {
            const match = /language-(\w+)/.exec(className || '')
            return !inline && match ? (
              <SyntaxHighlighter
                style={darkMode ? vscDarkPlus : prism}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: 6,
                  fontSize: 13,
                  background: themeVars.bgCode
                }}
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
                  fontSize: 12,
                  fontFamily: 'monospace'
                }}
                {...codeProps}
              >
                {children}
              </code>
            )
          },
          p({ children }) {
            return <p style={{ marginBottom: 8, lineHeight: 1.6 }}>{children}</p>
          },
          pre({ children }) {
            return <>{children}</>
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: themeVars.primary,
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
                onClick={e => {
                  e.stopPropagation()
                  if (href) {
                    window.electronAPI.openExternal(href)
                    e.preventDefault()
                  }
                }}
              >
                {children}
              </a>
            )
          }
        }}
      >
        {text}
      </ReactMarkdown>
    )
  }

  // 渲染纯文本（带链接和占位符检测）
  const renderPlainText = (text: string) => {
    const lines = text.split('\n')
    const shouldTruncate = maxLines && lines.length > maxLines

    return (
      <div
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.6,
          cursor: shouldTruncate && onClick ? 'pointer' : 'default'
        }}
        onClick={shouldTruncate && onClick ? onClick : undefined}
      >
        {(shouldTruncate ? lines.slice(0, maxLines) : lines).map((line, index) => (
          <div key={index}>{renderTextWithLinks(line)}</div>
        ))}
        {shouldTruncate && (
          <Text
            style={{
              fontSize: 12,
              color: themeVars.primary,
              cursor: 'pointer',
              display: 'block',
              marginTop: 8
            }}
          >
            点击查看完整内容...
          </Text>
        )}
      </div>
    )
  }

  /* 主渲染逻辑：列表视图中统一以纯文本展示 prompt，Markdown 内容保留格式化渲染 */
  if (isMarkdown(content)) {
    return renderMarkdown(content)
  }

  return renderPlainText(content)
}

export default SmartContent
