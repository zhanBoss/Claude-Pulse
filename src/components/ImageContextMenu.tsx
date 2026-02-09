import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { message } from 'antd'
import { CopyOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { getThemeVars } from '../theme'

interface ImageContextMenuProps {
  visible: boolean
  x: number
  y: number
  darkMode: boolean
  imageDataUrl: string
  imagePath?: string
  onClose: () => void
}

/**
 * 简洁的图片右键菜单
 */
const ImageContextMenu = (props: ImageContextMenuProps) => {
  const { visible, x, y, darkMode, imageDataUrl, imagePath, onClose } = props
  const menuRef = useRef<HTMLDivElement>(null)
  const themeVars = getThemeVars(darkMode)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!visible) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, onClose])

  // 复制图片到剪贴板
  const handleCopyImage = async () => {
    onClose()
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

  // 复制图片路径
  const handleCopyPath = async () => {
    onClose()
    if (!imagePath) {
      message.error('图片路径不可用')
      return
    }

    try {
      await window.electronAPI.copyToClipboard(imagePath)
      message.success('图片路径已复制')
    } catch (error) {
      message.error('复制路径失败')
    }
  }

  if (!visible) return null

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        background: themeVars.bgElevated,
        border: `1px solid ${themeVars.border}`,
        borderRadius: 8,
        boxShadow: darkMode
          ? '0 4px 16px rgba(0, 0, 0, 0.4)'
          : '0 4px 16px rgba(0, 0, 0, 0.08)',
        zIndex: 9999,
        minWidth: 140,
        padding: '4px',
        fontSize: 13
      }}
    >
      {/* 复制图片 */}
      <div
        onClick={handleCopyImage}
        className="menu-item"
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 4,
          transition: 'all 0.2s',
          color: themeVars.text,
          fontSize: 13
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = themeVars.primaryBg
          e.currentTarget.style.color = themeVars.primary
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = themeVars.text
        }}
      >
        <CopyOutlined style={{ fontSize: 14 }} />
        <span>复制图片</span>
      </div>

      {/* 复制路径（仅在有路径时显示） */}
      {imagePath && (
        <div
          onClick={handleCopyPath}
          className="menu-item"
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 4,
            transition: 'all 0.2s',
            color: themeVars.text,
            fontSize: 13
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = themeVars.primaryBg
            e.currentTarget.style.color = themeVars.primary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = themeVars.text
          }}
        >
          <FolderOpenOutlined style={{ fontSize: 14 }} />
          <span>复制路径</span>
        </div>
      )}
    </div>,
    document.body
  )
}

export default ImageContextMenu
