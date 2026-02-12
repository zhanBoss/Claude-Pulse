/**
 * 配置管理模块
 * 负责 Claude Code 配置、应用设置、配置备份管理
 */

import fs from 'fs'
import path from 'path'
import { startHistoryMonitor, stopHistoryMonitor } from './history'
import { setupAutoCleanupTimer } from './cache'
import type { ModuleContext } from './types'

// ========== 默认配置 ==========

const DEFAULT_PROVIDERS = {
  groq: {
    apiKey: '',
    apiBaseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile'
  },
  deepseek: {
    apiKey: '',
    apiBaseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  gemini: {
    apiKey: '',
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash-exp'
  },
  custom: {
    apiKey: '',
    apiBaseUrl: '',
    model: ''
  }
}

const DEFAULT_AI_CHAT = {
  apiKey: '',
  apiBaseUrl: '',
  model: ''
}

const DEFAULT_AI_SUMMARY = {
  enabled: false,
  provider: 'groq' as const,
  providers: DEFAULT_PROVIDERS
}

// ========== 工具函数 ==========

/** 提取配置信息（用于备份展示） */
const extractConfigInfo = (
  configContent: string
): {
  model?: string
  baseUrl?: string
  hasApiKey: boolean
} => {
  try {
    const config = JSON.parse(configContent)
    return {
      model: config.env?.ANTHROPIC_MODEL || config.model,
      baseUrl: config.env?.ANTHROPIC_BASE_URL || config.baseUrl,
      hasApiKey: !!(config.env?.ANTHROPIC_API_KEY || config.apiKey)
    }
  } catch {
    return { hasApiKey: false }
  }
}

/** 获取备份文件路径 */
const getBackupFilePath = (id: number, claudeDir: string): string =>
  path.join(claudeDir, `settings.backup-${id}.json`)

// ========== IPC 处理器注册 ==========

export const registerConfigHandlers = (ctx: ModuleContext) => {
  const {
    electron: { ipcMain, dialog, shell, app },
    store,
    CLAUDE_DIR,
    SETTINGS_FILE
  } = ctx

  // 检查 Claude Code 是否安装
  ipcMain.handle('check-claude-installed', async () => {
    try {
      const exists = fs.existsSync(CLAUDE_DIR) && fs.existsSync(SETTINGS_FILE)
      return { installed: exists, claudeDir: CLAUDE_DIR }
    } catch (error) {
      return { installed: false, error: (error as Error).message }
    }
  })

  // 读取 Claude Code 配置
  ipcMain.handle('get-claude-config', async () => {
    try {
      if (!fs.existsSync(SETTINGS_FILE)) {
        throw new Error('配置文件不存在')
      }
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      return { success: true, config: content }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 保存 Claude Code 配置
  ipcMain.handle('save-claude-config', async (_, config: string) => {
    try {
      JSON.parse(config)
      fs.writeFileSync(SETTINGS_FILE, config, 'utf-8')
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // 选择保存路径
  ipcMain.handle('select-save-path', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择对话记录保存目录'
    })

    if (result.canceled) return { canceled: true }
    return { canceled: false, path: result.filePaths[0] }
  })

  // 获取记录配置
  ipcMain.handle('get-record-config', async () => {
    const enabled = store.get('recordEnabled', false) as boolean
    const savePath = store.get('savePath', '') as string
    return { enabled, savePath }
  })

  // 保存记录配置
  ipcMain.handle(
    'save-record-config',
    async (_, config: { enabled: boolean; savePath: string }) => {
      try {
        store.set('recordEnabled', config.enabled)
        store.set('savePath', config.savePath)

        if (config.enabled && config.savePath) {
          if (!fs.existsSync(config.savePath)) {
            fs.mkdirSync(config.savePath, { recursive: true })
          }
        }

        // 启动或停止监控
        if (config.enabled) {
          startHistoryMonitor(config.savePath, ctx)
        } else {
          stopHistoryMonitor()
        }

        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 获取应用设置
  ipcMain.handle('get-app-settings', async () => {
    // 兼容旧的 darkMode 设置
    const oldDarkMode = store.get('darkMode', null)
    if (oldDarkMode !== null && !store.has('themeMode')) {
      store.set('themeMode', oldDarkMode ? 'dark' : 'light')
      store.delete('darkMode')
    }

    const themeMode = store.get('themeMode', 'system') as 'light' | 'dark' | 'system'
    const autoStart = store.get('autoStart', false) as boolean

    // 数据迁移：从旧的 ai 配置迁移到新的 aiChat 和 aiSummary 配置
    const oldAi = store.get('ai', null) as any
    let aiChat = store.get('aiChat', null) as any
    let aiSummary = store.get('aiSummary', null) as any

    if (oldAi && (!aiChat || !aiSummary)) {
      if (!aiChat) {
        const oldProvider = oldAi.provider || 'deepseek'
        const oldProviderConfig = oldAi.providers?.[oldProvider] || {}
        aiChat = {
          apiKey: oldProviderConfig.apiKey || '',
          apiBaseUrl: oldProviderConfig.apiBaseUrl || '',
          model: oldProviderConfig.model || ''
        }
        store.set('aiChat', aiChat)
      }

      if (!aiSummary) {
        aiSummary = {
          enabled: oldAi.enabled || false,
          provider: oldAi.provider || 'groq',
          providers: oldAi.providers || DEFAULT_PROVIDERS
        }
        store.set('aiSummary', aiSummary)
      }

      store.delete('ai')
    }

    if (!aiChat) {
      aiChat = DEFAULT_AI_CHAT
      store.set('aiChat', aiChat)
    }

    if (!aiSummary) {
      aiSummary = DEFAULT_AI_SUMMARY
      store.set('aiSummary', aiSummary)
    }

    const autoCleanup = store.get('autoCleanup', {
      enabled: false,
      intervalMs: 24 * 60 * 60 * 1000,
      retainMs: 12 * 60 * 60 * 1000,
      lastCleanupTime: null,
      nextCleanupTime: null,
      showFloatingBall: true
    }) as any

    return { themeMode, autoStart, aiChat, aiSummary, autoCleanup }
  })

  // 保存应用设置
  ipcMain.handle(
    'save-app-settings',
    async (
      _,
      settings: {
        themeMode: 'light' | 'dark' | 'system'
        autoStart: boolean
        aiChat: any
        aiSummary: any
        autoCleanup?: any
      }
    ) => {
      try {
        store.set('themeMode', settings.themeMode)
        store.set('autoStart', settings.autoStart)
        if (settings.aiChat) store.set('aiChat', settings.aiChat)
        if (settings.aiSummary) store.set('aiSummary', settings.aiSummary)

        if (settings.autoCleanup !== undefined) {
          store.set('autoCleanup', settings.autoCleanup)
          setupAutoCleanupTimer(ctx)
          const mainWindow = ctx.getMainWindow()
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auto-cleanup-config-updated', settings.autoCleanup)
          }
        }

        app.setLoginItemSettings({
          openAtLogin: settings.autoStart,
          openAsHidden: false
        })

        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // 获取配置文件路径
  ipcMain.handle('get-config-path', async () => store.path)

  // 在默认编辑器中打开配置文件
  ipcMain.handle('open-config-file', async () => {
    try {
      await shell.openPath(store.path)
    } catch (error) {
      console.error('打开配置文件失败:', error)
      throw error
    }
  })

  // 在文件管理器中显示配置文件
  ipcMain.handle('show-config-in-folder', async () => {
    try {
      shell.showItemInFolder(store.path)
    } catch (error) {
      console.error('显示配置文件失败:', error)
      throw error
    }
  })

  // 在文件管理器中显示 Claude Code 配置文件
  ipcMain.handle('show-claude-config-in-folder', async () => {
    try {
      shell.showItemInFolder(SETTINGS_FILE)
    } catch (error) {
      console.error('显示 Claude Code 配置文件失败:', error)
      throw error
    }
  })

  // 读取应用配置文件内容
  ipcMain.handle('read-app-config-file', async () => {
    try {
      const content = fs.readFileSync(store.path, 'utf-8')
      return content
    } catch (error) {
      console.error('读取配置文件失败:', error)
      throw new Error('读取配置文件失败')
    }
  })

  // 保存应用配置文件内容
  ipcMain.handle('save-app-config-file', async (_, content: string) => {
    try {
      const parsed = JSON.parse(content)
      fs.writeFileSync(store.path, content, 'utf-8')
      store.store = parsed
    } catch (error) {
      console.error('保存配置文件失败:', error)
      if (error instanceof SyntaxError) throw new Error('JSON 格式错误')
      throw new Error('保存配置文件失败')
    }
  })

  // ==================== Claude Code 配置备份管理 ====================

  // 列出所有备份
  ipcMain.handle('list-claude-config-backups', async () => {
    try {
      const backups = store.get('claudeConfigBackups', []) as any[]

      const validBackups = backups.filter(backup => {
        const filePath = getBackupFilePath(backup.id, CLAUDE_DIR)
        if (!fs.existsSync(filePath)) return false

        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          backup.autoDetectedInfo = extractConfigInfo(content)
        } catch {
          // 忽略读取错误
        }

        return true
      })

      store.set('claudeConfigBackups', validBackups)
      return validBackups
    } catch (error) {
      console.error('列出备份失败:', error)
      return []
    }
  })

  // 创建备份
  ipcMain.handle('create-claude-config-backup', async (_, name: string) => {
    try {
      if (!fs.existsSync(SETTINGS_FILE)) {
        return { success: false, error: '配置文件不存在' }
      }

      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      JSON.parse(content)

      const backups = store.get('claudeConfigBackups', []) as any[]
      const maxId = backups.length > 0 ? Math.max(...backups.map(b => b.id)) : 0
      const newId = maxId + 1

      const backupFilePath = getBackupFilePath(newId, CLAUDE_DIR)
      fs.writeFileSync(backupFilePath, content, 'utf-8')

      const backup = {
        id: newId,
        name: name || `备份 ${newId}`,
        autoDetectedInfo: extractConfigInfo(content),
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      backups.push(backup)
      store.set('claudeConfigBackups', backups)

      return { success: true, backup }
    } catch (error) {
      console.error('创建备份失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 删除备份
  ipcMain.handle('delete-claude-config-backup', async (_, id: number) => {
    try {
      const backups = store.get('claudeConfigBackups', []) as any[]
      const backup = backups.find(b => b.id === id)

      if (!backup) return { success: false, error: '备份不存在' }
      if (backup.isActive) return { success: false, error: '无法删除当前激活的配置' }

      const backupFilePath = getBackupFilePath(id, CLAUDE_DIR)
      if (fs.existsSync(backupFilePath)) fs.unlinkSync(backupFilePath)

      const newBackups = backups.filter(b => b.id !== id)
      store.set('claudeConfigBackups', newBackups)

      return { success: true }
    } catch (error) {
      console.error('删除备份失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 切换配置
  ipcMain.handle('switch-claude-config-backup', async (_, id: number) => {
    try {
      const backups = store.get('claudeConfigBackups', []) as any[]
      const targetBackup = backups.find(b => b.id === id)

      if (!targetBackup) return { success: false, error: '备份不存在' }

      const backupFilePath = getBackupFilePath(id, CLAUDE_DIR)
      if (!fs.existsSync(backupFilePath)) return { success: false, error: '备份文件不存在' }

      const backupContent = fs.readFileSync(backupFilePath, 'utf-8')
      JSON.parse(backupContent)

      const currentActive = backups.find(b => b.isActive)
      if (currentActive) currentActive.isActive = false

      // 将当前 settings.json 保存为备份
      if (!currentActive && fs.existsSync(SETTINGS_FILE)) {
        const currentContent = fs.readFileSync(SETTINGS_FILE, 'utf-8')
        const maxId = backups.length > 0 ? Math.max(...backups.map(b => b.id)) : 0
        const newId = maxId + 1

        const newBackupFilePath = getBackupFilePath(newId, CLAUDE_DIR)
        fs.writeFileSync(newBackupFilePath, currentContent, 'utf-8')

        backups.push({
          id: newId,
          name: `切换前的配置`,
          autoDetectedInfo: extractConfigInfo(currentContent),
          isActive: false,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
      }

      fs.writeFileSync(SETTINGS_FILE, backupContent, 'utf-8')
      targetBackup.isActive = true
      targetBackup.updatedAt = Date.now()

      store.set('claudeConfigBackups', backups)
      return { success: true }
    } catch (error) {
      console.error('切换配置失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 更新备份名称
  ipcMain.handle('update-claude-config-backup-name', async (_, id: number, name: string) => {
    try {
      const backups = store.get('claudeConfigBackups', []) as any[]
      const backup = backups.find(b => b.id === id)

      if (!backup) return { success: false, error: '备份不存在' }

      backup.name = name
      backup.updatedAt = Date.now()
      store.set('claudeConfigBackups', backups)

      return { success: true }
    } catch (error) {
      console.error('更新备份名称失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 获取备份配置内容
  ipcMain.handle('get-claude-config-backup-content', async (_, id: number) => {
    try {
      const backupFilePath = getBackupFilePath(id, CLAUDE_DIR)

      if (!fs.existsSync(backupFilePath)) return { success: false, error: '备份文件不存在' }

      const content = fs.readFileSync(backupFilePath, 'utf-8')
      return { success: true, config: content }
    } catch (error) {
      console.error('读取备份配置失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
