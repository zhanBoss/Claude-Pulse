/**
 * 缓存管理模块
 * 负责缓存清理、按时间范围清理、自动清理定时器等
 */

import fs from 'fs'
import path from 'path'
import type { ModuleContext } from './types'

// 模块私有状态
let autoCleanupTimer: ReturnType<typeof setInterval> | null = null
let autoCleanupTickTimer: ReturnType<typeof setInterval> | null = null

/**
 * 按时间范围清理记录（通用逻辑，供多处调用）
 */
const cleanRecordsByAge = (savePath: string, retainMs: number): number => {
  const cutoffTime = Date.now() - retainMs
  let deletedCount = 0
  const files = fs.readdirSync(savePath)

  for (const file of files) {
    const filePath = path.join(savePath, file)
    const stat = fs.statSync(filePath)

    if (stat.isFile() && file.endsWith('.jsonl')) {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())
      const retainedLines: string[] = []
      let removedInFile = 0

      for (const line of lines) {
        try {
          const record = JSON.parse(line)
          if (record.timestamp && record.timestamp >= cutoffTime) {
            retainedLines.push(line)
          } else {
            removedInFile++
          }
        } catch {
          retainedLines.push(line)
        }
      }

      if (removedInFile > 0) {
        if (retainedLines.length > 0) {
          fs.writeFileSync(filePath, retainedLines.join('\n') + '\n', 'utf-8')
        } else {
          fs.unlinkSync(filePath)
        }
        deletedCount += removedInFile
      }
    }
  }

  // 清理过期图片缓存目录
  const imagesDir = path.join(savePath, 'images')
  if (fs.existsSync(imagesDir)) {
    const sessionDirs = fs.readdirSync(imagesDir)
    for (const sessionDir of sessionDirs) {
      const sessionDirPath = path.join(imagesDir, sessionDir)
      const sessionStat = fs.statSync(sessionDirPath)
      if (sessionStat.isDirectory() && sessionStat.mtimeMs < cutoffTime) {
        fs.rmSync(sessionDirPath, { recursive: true, force: true })
      }
    }
  }

  return deletedCount
}

/**
 * 自动清理缓存定时器管理
 */
export const setupAutoCleanupTimer = (ctx: ModuleContext) => {
  const { store, getMainWindow } = ctx

  // 清除旧定时器
  if (autoCleanupTimer) {
    clearInterval(autoCleanupTimer)
    autoCleanupTimer = null
  }
  if (autoCleanupTickTimer) {
    clearInterval(autoCleanupTickTimer)
    autoCleanupTickTimer = null
  }

  const autoCleanup = store.get('autoCleanup', null) as any
  if (!autoCleanup || !autoCleanup.enabled) return

  const now = Date.now()

  // 确定下次清理时间
  let nextCleanupTime = autoCleanup.nextCleanupTime
  if (!nextCleanupTime || nextCleanupTime <= now) {
    nextCleanupTime = now + autoCleanup.intervalMs
    store.set('autoCleanup.nextCleanupTime', nextCleanupTime)
  }

  // 执行清理的函数
  const executeCleanup = async () => {
    try {
      const config = store.get('autoCleanup', null) as any
      if (!config || !config.enabled) return

      const savePath = store.get('savePath', '') as string
      if (!savePath || !fs.existsSync(savePath)) return

      const deletedCount = cleanRecordsByAge(savePath, config.retainMs)

      // 更新状态
      const newNextCleanupTime = Date.now() + config.intervalMs
      store.set('autoCleanup.lastCleanupTime', Date.now())
      store.set('autoCleanup.nextCleanupTime', newNextCleanupTime)

      console.log(
        `[自动清理] 完成，删除了 ${deletedCount} 条记录，下次清理时间: ${new Date(newNextCleanupTime).toLocaleString()}`
      )

      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-cleanup-executed', {
          deletedCount,
          nextCleanupTime: newNextCleanupTime
        })
      } else {
        console.warn('[自动清理] 主窗口不可用，无法发送清理完成通知')
      }

      scheduleNextCleanup(config.intervalMs)
    } catch (error) {
      console.error('[自动清理] 执行失败:', error)
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-cleanup-error', {
          error: (error as Error).message
        })
      }
      const config = store.get('autoCleanup', null) as any
      if (config && config.enabled) {
        scheduleNextCleanup(config.intervalMs)
      }
    }
  }

  // 调度下次清理
  const scheduleNextCleanup = (intervalMs: number) => {
    if (autoCleanupTimer) {
      clearTimeout(autoCleanupTimer)
      autoCleanupTimer = null
    }
    autoCleanupTimer = setTimeout(executeCleanup, intervalMs) as any
  }

  // 首次执行延迟
  const initialDelay = Math.max(0, nextCleanupTime - now)
  setTimeout(executeCleanup, initialDelay)

  // 每秒向渲染进程发送倒计时更新
  autoCleanupTickTimer = setInterval(() => {
    const currentConfig = store.get('autoCleanup', null) as any
    if (!currentConfig || !currentConfig.enabled) {
      if (autoCleanupTickTimer) {
        clearInterval(autoCleanupTickTimer)
        autoCleanupTickTimer = null
      }
      return
    }

    const currentNextTime = currentConfig.nextCleanupTime
    if (!currentNextTime) return

    const remaining = Math.max(0, currentNextTime - Date.now())
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-cleanup-tick', {
        nextCleanupTime: currentNextTime,
        remainingMs: remaining
      })
    }
  }, 1000)

  console.log(
    `[自动清理] 定时器已启动，间隔: ${autoCleanup.intervalMs}ms，保留: ${autoCleanup.retainMs}ms，下次执行: ${new Date(nextCleanupTime).toLocaleString()}`
  )
}

/**
 * 清理定时器（应用退出时调用）
 */
export const cleanupTimers = () => {
  if (autoCleanupTimer) {
    clearInterval(autoCleanupTimer)
    autoCleanupTimer = null
  }
  if (autoCleanupTickTimer) {
    clearInterval(autoCleanupTickTimer)
    autoCleanupTickTimer = null
  }
}

export const registerCacheHandlers = (ctx: ModuleContext) => {
  const {
    electron: { ipcMain },
    store
  } = ctx

  // 清除缓存（清空保存路径下的所有数据）
  ipcMain.handle('clear-cache', async () => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) return { success: false, error: '未配置保存路径' }
      if (!fs.existsSync(savePath)) return { success: false, error: '保存路径不存在' }

      const files = fs.readdirSync(savePath)
      let deletedCount = 0

      for (const file of files) {
        const filePath = path.join(savePath, file)
        const stat = fs.statSync(filePath)

        if (stat.isFile() && file.endsWith('.jsonl')) {
          fs.unlinkSync(filePath)
          deletedCount++
        } else if (stat.isDirectory() && file === 'images') {
          fs.rmSync(filePath, { recursive: true, force: true })
        }
      }

      return { success: true, deletedCount }
    } catch (error) {
      console.error('清除缓存失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 按时间范围清理缓存
  ipcMain.handle('clear-cache-by-age', async (_, retainMs: number) => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) return { success: false, error: '未配置保存路径' }
      if (!fs.existsSync(savePath)) return { success: false, error: '保存路径不存在' }

      const deletedCount = cleanRecordsByAge(savePath, retainMs)
      return { success: true, deletedCount }
    } catch (error) {
      console.error('按时间范围清理缓存失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取自动清理状态
  ipcMain.handle('get-auto-cleanup-status', async () => {
    const autoCleanup = store.get('autoCleanup', null) as any
    if (!autoCleanup || !autoCleanup.enabled) {
      return { enabled: false, nextCleanupTime: null, remainingMs: null }
    }

    const now = Date.now()
    const nextCleanupTime = autoCleanup.nextCleanupTime || null
    const remainingMs = nextCleanupTime ? Math.max(0, nextCleanupTime - now) : null

    return { enabled: true, nextCleanupTime, remainingMs }
  })

  // 手动触发自动清理
  ipcMain.handle('trigger-auto-cleanup', async () => {
    try {
      const config = store.get('autoCleanup', null) as any
      if (!config || !config.enabled) {
        return { success: false, error: '自动清理未启用' }
      }

      const savePath = store.get('savePath', '') as string
      if (!savePath || !fs.existsSync(savePath)) {
        return { success: false, error: '保存路径不存在' }
      }

      const deletedCount = cleanRecordsByAge(savePath, config.retainMs)

      // 更新下次清理时间
      const newNextCleanupTime = Date.now() + config.intervalMs
      store.set('autoCleanup.lastCleanupTime', Date.now())
      store.set('autoCleanup.nextCleanupTime', newNextCleanupTime)

      console.log(`[手动清理] 完成，删除了 ${deletedCount} 条记录`)

      // 重新启动定时器
      setupAutoCleanupTimer(ctx)

      // 通知渲染进程
      const mainWindow = ctx.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-cleanup-executed', {
          deletedCount,
          nextCleanupTime: newNextCleanupTime
        })
      }

      return {
        success: true,
        deletedCount,
        nextCleanupTime: newNextCleanupTime
      }
    } catch (error) {
      console.error('[手动清理] 执行失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
