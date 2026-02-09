import { useState, useEffect } from 'react'
import { Image, Tooltip, message } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { getThemeVars } from '../theme'
import ImageContextMenu from './ImageContextMenu'

interface CopyableImageProps {
  imagePath: string
  index: number
  darkMode: boolean
  imageCache: Map<string, string>
  onCacheUpdate: (path: string, data: string) => void
}

/**
 * 复制图片到剪贴板（使用 Electron 原生 API）
 * 供 CopyableImage 和 PreviewGroup 复用
 */
const copyImageToClipboard = async (imageDataUrl: string) => {
  if (!imageDataUrl) {
    message.error('图片数据不可用')
    return
  }

  try {
    const result = await window.electronAPI.copyImageToClipboard(imageDataUrl)
    if (result.success) {
      message.success('图片已复制到剪贴板')
    } else {
      message.error(`复制失败: ${result.error || '未知错误'}`)
    }
  } catch (error: any) {
    console.error('复制图片失败:', error)
    message.error(`复制失败: ${error.message || '未知错误'}`)
  }
}

/* 工具栏图标通用样式 */
const toolbarIconStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  cursor: 'pointer',
  color: 'rgba(255, 255, 255, 0.65)',
  transition: 'color 0.15s',
  padding: 4
}

/**
 * 工具栏图标 hover 处理
 */
const handleIconMouseEnter = (
  e: React.MouseEvent<HTMLSpanElement>,
  themeVars: ReturnType<typeof getThemeVars>
) => {
  e.currentTarget.style.color = themeVars.textWhite
}

const handleIconMouseLeave = (e: React.MouseEvent<HTMLSpanElement>) => {
  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)'
}

/**
 * 生成带复制按钮的 Image.PreviewGroup preview 配置
 * 完全自定义工具栏，将复制按钮与原生操作统一在同一容器内
 */
export const getCopyablePreviewConfig = (darkMode?: boolean) => {
  const themeVars = getThemeVars(darkMode || false)

  return {
    actionsRender: (_originalNode: React.ReactElement, info: any) => {
      const { icons, actions } = info

      /* 原生工具栏按钮 */
      const builtinItems = [
        { icon: icons.flipYIcon, action: actions.onFlipY, title: '上下翻转' },
        { icon: icons.flipXIcon, action: actions.onFlipX, title: '左右翻转' },
        {
          icon: icons.rotateLeftIcon,
          action: actions.onRotateLeft,
          title: '逆时针旋转'
        },
        {
          icon: icons.rotateRightIcon,
          action: actions.onRotateRight,
          title: '顺时针旋转'
        },
        { icon: icons.zoomOutIcon, action: actions.onZoomOut, title: '缩小' },
        { icon: icons.zoomInIcon, action: actions.onZoomIn, title: '放大' }
      ]

      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {builtinItems.map((item, i) => (
            <Tooltip key={i} title={item.title}>
              <span
                onClick={item.action}
                style={toolbarIconStyle}
                onMouseEnter={e => handleIconMouseEnter(e, themeVars)}
                onMouseLeave={handleIconMouseLeave}
              >
                {item.icon}
              </span>
            </Tooltip>
          ))}

          {/* 复制图片 */}
          <Tooltip title="复制图片">
            <span
              onClick={() => {
                const imageUrl = info.image?.url || info.image?.src || ''
                copyImageToClipboard(imageUrl)
              }}
              style={toolbarIconStyle}
              onMouseEnter={e => handleIconMouseEnter(e, themeVars)}
              onMouseLeave={handleIconMouseLeave}
            >
              <CopyOutlined />
            </span>
          </Tooltip>
        </div>
      )
    }
  }
}

const CopyableImage = (props: CopyableImageProps) => {
  const { imagePath, index, darkMode, imageCache, onCacheUpdate } = props

  const [imageData, setImageData] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contextMenuVisible, setContextMenuVisible] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const themeVars = getThemeVars(darkMode)

  useEffect(() => {
    // 检查缓存
    if (imageCache.has(imagePath)) {
      setImageData(imageCache.get(imagePath)!)
      setLoading(false)
      return
    }

    let isMounted = true
    let pollTimer: NodeJS.Timeout | null = null
    const startTime = Date.now()
    const maxPollTime = 30000 // 最多轮询30秒

    // 轮询加载图片
    const pollImage = async () => {
      if (!isMounted) return

      if (Date.now() - startTime > maxPollTime) {
        setError('加载超时')
        setLoading(false)
        return
      }

      try {
        const result = await window.electronAPI.readImage(imagePath)

        if (!isMounted) return

        if (result.success && result.data) {
          setImageData(result.data)
          onCacheUpdate(imagePath, result.data)
          setLoading(false)
        } else {
          pollTimer = setTimeout(pollImage, 1000)
        }
      } catch (err: any) {
        if (!isMounted) return
        pollTimer = setTimeout(pollImage, 1000)
      }
    }

    pollImage()

    return () => {
      isMounted = false
      if (pollTimer) {
        clearTimeout(pollTimer)
      }
    }
  }, [imagePath, imageCache, onCacheUpdate])

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!imageData) return
    setContextMenuPosition({ x: e.clientX, y: e.clientY })
    setContextMenuVisible(true)
  }

  if (loading) {
    return (
      <div
        style={{
          width: 64,
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: themeVars.codeBg,
          borderRadius: 6,
          border: `1px solid ${themeVars.border}`,
          fontSize: 10,
          color: themeVars.textSecondary
        }}
      >
        加载中...
      </div>
    )
  }

  if (error || !imageData) {
    return (
      <div
        style={{
          width: 64,
          height: 64,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: themeVars.codeBg,
          borderRadius: 6,
          border: `1px solid ${themeVars.border}`,
          fontSize: 9,
          color: themeVars.textSecondary,
          textAlign: 'center',
          padding: 4,
          gap: 2
        }}
      >
        <span>❌</span>
        <span style={{ fontSize: 8 }}>加载失败</span>
      </div>
    )
  }

  return (
    <>
      <div
        onContextMenu={handleContextMenu}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <Image
          src={imageData}
          alt={`Image ${index + 1}`}
          width={64}
          height={64}
          style={{
            objectFit: 'cover',
            borderRadius: 6,
            border: `1px solid ${themeVars.border}`,
            cursor: 'pointer'
          }}
          preview={{
            src: imageData
          }}
        />
      </div>

      {/* 右键菜单 */}
      <ImageContextMenu
        visible={contextMenuVisible}
        x={contextMenuPosition.x}
        y={contextMenuPosition.y}
        darkMode={darkMode}
        imageDataUrl={imageData}
        imagePath={imagePath}
        onClose={() => setContextMenuVisible(false)}
      />
    </>
  )
}

export default CopyableImage
