/**
 * 文件工具模块
 * 负责剪贴板、文件读写、外部打开等通用操作的 IPC 处理
 */

import fs from 'fs'
import path from 'path'
import type { ModuleContext } from './types'

export const registerFileUtilsHandlers = (ctx: ModuleContext) => {
  const {
    electron: { ipcMain, clipboard, nativeImage, shell, app },
    store,
    CLAUDE_DIR
  } = ctx

  // 复制到剪贴板
  ipcMain.handle('copy-to-clipboard', async (_, text: string) => {
    try {
      clipboard.writeText(text)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 复制图片到剪贴板（使用原生 nativeImage）
  ipcMain.handle('copy-image-to-clipboard', async (_, base64Data: string) => {
    try {
      const image = nativeImage.createFromDataURL(base64Data)
      if (image.isEmpty()) {
        return { success: false, error: '无法解析图片数据' }
      }
      clipboard.writeImage(image)
      return { success: true }
    } catch (error) {
      console.error('复制图片到剪贴板失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 在 Finder 中打开文件夹
  ipcMain.handle('open-in-finder', async (_, folderPath: string) => {
    try {
      if (fs.existsSync(folderPath)) {
        shell.showItemInFolder(folderPath)
        return { success: true }
      } else {
        return { success: false, error: '文件夹不存在' }
      }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 在外部浏览器中打开链接
  ipcMain.handle('open-external', async (_, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 读取图片文件（返回 base64）
  ipcMain.handle('read-image', async (_, imagePath: string) => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) {
        return { success: false, error: '未配置保存路径' }
      }

      const fullPath = path.join(savePath, imagePath)

      if (!fs.existsSync(fullPath)) {
        return { success: false, error: '图片文件不存在' }
      }

      const imageBuffer = fs.readFileSync(fullPath)
      const base64 = imageBuffer.toString('base64')

      // 检测图片类型
      let mimeType = 'image/png'
      if (imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg')) {
        mimeType = 'image/jpeg'
      } else if (imagePath.endsWith('.gif')) {
        mimeType = 'image/gif'
      }

      return {
        success: true,
        data: `data:${mimeType};base64,${base64}`
      }
    } catch (error) {
      console.error('读取图片失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 读取任意文件内容（用于代码编辑器查看）
  ipcMain.handle('read-file-content', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content }
    } catch (error) {
      console.error('读取文件失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 保存文件内容（用于代码编辑器保存）
  ipcMain.handle('save-file-content', async (_, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('保存文件失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 在系统默认编辑器中打开文件
  ipcMain.handle('open-file-in-editor', async (_, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '文件不存在' }
      }
      await shell.openPath(filePath)
      return { success: true }
    } catch (error) {
      console.error('打开文件失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 打开开发者工具
  ipcMain.handle('open-devtools', async () => {
    try {
      const mainWindow = ctx.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.openDevTools()
        return { success: true }
      }
      return { success: false, error: '窗口不存在' }
    } catch (error) {
      console.error('打开开发者工具失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 卸载应用
  ipcMain.handle('uninstall-app', async () => {
    try {
      // 获取配置文件路径
      const configPath = store.path
      const configDir = path.dirname(configPath)

      // 删除应用配置文件
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath)
      }

      // 删除 Claude Code 配置备份文件
      try {
        if (fs.existsSync(CLAUDE_DIR)) {
          const files = fs.readdirSync(CLAUDE_DIR)
          files.forEach((file: string) => {
            if (file.startsWith('settings.backup-') && file.endsWith('.json')) {
              const backupPath = path.join(CLAUDE_DIR, file)
              if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath)
              }
            }
          })
        }
      } catch (err) {
        console.error('删除备份文件失败:', err)
      }

      // 删除应用配置目录（如果为空）
      try {
        if (fs.existsSync(configDir)) {
          const files = fs.readdirSync(configDir)
          if (files.length === 0) {
            fs.rmdirSync(configDir)
          }
        }
      } catch (err) {
        // 忽略删除目录的错误
      }

      // 延迟退出，确保响应已发送
      setTimeout(() => {
        app.quit()
      }, 500)

      return { success: true }
    } catch (error) {
      console.error('卸载应用失败:', error)
      throw error
    }
  })
}
