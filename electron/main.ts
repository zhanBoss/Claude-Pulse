import { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import Store from 'electron-store'
import { request as httpRequest } from './utils/http'

// 扩展 global 类型
declare global {
  var processedImages: Map<string, Set<string>> | undefined
}

const store = new Store()

let mainWindow: BrowserWindow | null = null
let historyWatcher: fs.FSWatcher | null = null
let lastFileSize = 0

/* 元数据缓存：避免重复解析大量JSONL文件 */
interface MetadataCache {
  sessions: any[]
  historyFileSize: number
  sessionFileSizes: Map<string, number>
  lastUpdated: number
}
let metadataCache: MetadataCache | null = null
const CACHE_TTL_MS = 30000 // 30秒缓存有效期

// 应用内部缓存目录（用于图片缓存等，替代用户自定义 savePath）
const APP_CACHE_DIR = path.join(app.getPath('userData'), 'cache')

// 自动清理缓存定时器
let autoCleanupTimer: ReturnType<typeof setInterval> | null = null

// ========== 粘贴内容展开工具函数 ==========

/**
 * 计算单次 API 调用的成本（USD）
 * 基于用户配置的价格或默认价格（Claude 3.5 Sonnet）
 * @param usage - Token 使用量
 * @param customPricing - 用户自定义价格配置（可选）
 * @returns 成本（USD）
 */
const calculateCost = (
  usage: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  },
  customPricing?: {
    inputPrice: number
    outputPrice: number
    cacheWritePrice: number
    cacheReadPrice: number
  }
): number => {
  if (!usage) return 0

  // 默认价格：Claude 3.5 Sonnet (2024年1月价格)
  const defaultPricing = {
    inputPrice: 3.0,      // $3 per MTok
    outputPrice: 15.0,    // $15 per MTok
    cacheWritePrice: 3.75, // $3.75 per MTok
    cacheReadPrice: 0.3    // $0.30 per MTok
  }

  // 使用用户配置的价格，如果没有则使用默认价格
  const pricing = customPricing || defaultPricing

  const inputTokens = usage.input_tokens || 0
  const outputTokens = usage.output_tokens || 0
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0
  const cacheReadTokens = usage.cache_read_input_tokens || 0

  // 计算各部分成本（单位：USD）
  // 价格是 per Million Tokens，所以除以 1,000,000
  const inputCost = (inputTokens * pricing.inputPrice) / 1_000_000
  const outputCost = (outputTokens * pricing.outputPrice) / 1_000_000
  const cacheWriteCost = (cacheWriteTokens * pricing.cacheWritePrice) / 1_000_000
  const cacheReadCost = (cacheReadTokens * pricing.cacheReadPrice) / 1_000_000

  return inputCost + outputCost + cacheWriteCost + cacheReadCost
}

/**
 * 将 project 绝对路径转换为文件夹名称
 * 例如：/Users/name/project -> -Users-name-project
 */
const getProjectFolderName = (projectPath: string): string => {
  if (!projectPath || projectPath.trim() === '') {
    return ''
  }
  return projectPath.replace(/\//g, '-')
}

/**
 * 展开粘贴内容：将 contentHash 引用替换为实际内容
 */
const expandPastedContents = (pastedContents: Record<string, any>): Record<string, any> => {
  const expandedContents: Record<string, any> = {}
  for (const [key, value] of Object.entries(pastedContents)) {
    if (
      value &&
      typeof value === 'object' &&
      (value as any).contentHash &&
      !(value as any).content
    ) {
      const contentHash = (value as any).contentHash
      const pasteFilePath = path.join(CLAUDE_DIR, 'paste-cache', `${contentHash}.txt`)
      try {
        if (fs.existsSync(pasteFilePath)) {
          const actualContent = fs.readFileSync(pasteFilePath, 'utf-8')
          expandedContents[key] = { ...value, content: actualContent }
        } else {
          expandedContents[key] = value
        }
      } catch (err) {
        expandedContents[key] = value
      }
    } else {
      expandedContents[key] = value
    }
  }
  return expandedContents
}

// ========== 图片处理函数（独立提取，供多处调用） ==========

/**
 * 从 Claude Code 2.0.55+ projects 目录提取图片
 * @param sessionId - 会话 ID
 * @param project - 项目路径
 * @param displayText - 记录的 display 文本，用于识别图片编号
 * @returns 图片路径数组
 */
async function extractImagesFromProjects(
  sessionId: string,
  project: string,
  displayText: string
): Promise<string[]> {
  const images: string[] = []

  try {
    // 参数验证
    if (!project || project.trim() === '') {
      return images
    }

    // 从 display 文本中提取图片编号
    const imageMatches = displayText.match(/\[Image #(\d+)\]/g)
    if (!imageMatches || imageMatches.length === 0) {
      // 如果没有图片标记，直接返回
      return images
    }

    // 提取所有图片编号
    const imageNumbers = imageMatches
      .map(match => {
        const num = match.match(/\d+/)
        return num ? parseInt(num[0]) : null
      })
      .filter(n => n !== null) as number[]

    if (imageNumbers.length === 0) {
      return images
    }

    // 构建 project 路径
    const projectFolderName = getProjectFolderName(project)
    const projectSessionFile = path.join(
      CLAUDE_DIR,
      'projects',
      projectFolderName,
      `${sessionId}.jsonl`
    )

    if (!fs.existsSync(projectSessionFile)) {
      return images
    }

    const lines = fs
      .readFileSync(projectSessionFile, 'utf-8')
      .split('\n')
      .filter(line => line.trim())

    // 从 session 文件中提取所有 base64 图片
    const base64Images: { index: number; data: string }[] = []
    let currentImageIndex = 1

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)
        // 查找用户消息中的图片
        if (
          entry.message &&
          Array.isArray(entry.message.content) &&
          entry.message.role === 'user'
        ) {
          for (const content of entry.message.content) {
            if (
              content.type === 'image' &&
              content.source &&
              content.source.type === 'base64' &&
              content.source.data
            ) {
              base64Images.push({
                index: currentImageIndex,
                data: content.source.data
              })
              currentImageIndex++
            }
          }
        }
      } catch (err) {
        // 忽略解析错误的行
      }
    }

    // 只保存当前记录需要的图片（保存到应用内部缓存目录）
    const imagesDir = path.join(APP_CACHE_DIR, 'images', sessionId)
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    for (const imageNum of imageNumbers) {
      // 在 base64Images 数组中查找对应编号的图片
      const imageData = base64Images.find(img => img.index === imageNum)

      if (imageData) {
        const imageFileName = `${imageNum}.png`
        const imagePath = path.join(imagesDir, imageFileName)

        // 如果图片已存在，跳过
        if (!fs.existsSync(imagePath)) {
          // 将 base64 数据写入文件
          const buffer = Buffer.from(imageData.data, 'base64')
          fs.writeFileSync(imagePath, buffer)
        }

        images.push(`images/${sessionId}/${imageFileName}`)
      } else {
        console.warn(`[Image Extract] 找不到图片 #${imageNum}`)
      }
    }

  } catch (err) {
    console.error('[Image Extract] 提取图片失败:', err)
  }

  return images
}

// ==========================================================

let autoCleanupTickTimer: ReturnType<typeof setInterval> | null = null

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects')

function createWindow() {
  /* 应用图标路径：开发模式使用 build 目录，打包后使用 resources 目录 */
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(__dirname, '..', 'build', 'icon.png')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  /* macOS Dock 图标设置 */
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  // 开发模式：加载 Vite 开发服务器
  // 生产模式：加载打包后的文件
  const isDev = !app.isPackaged
  // 开发构建模式：打包后仍然显示 DevTools（通过环境变量控制）
  const isDevBuild = process.env.ELECTRON_DEV_BUILD === 'true'

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产环境：加载打包后的 index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))

    // 如果是开发构建模式，打开 DevTools 方便调试
    if (isDevBuild) {
      mainWindow.webContents.openDevTools()
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  // 确保应用内部缓存目录存在
  if (!fs.existsSync(APP_CACHE_DIR)) {
    fs.mkdirSync(APP_CACHE_DIR, { recursive: true })
  }

  // 应用启动时，自动启动文件监控（直接读取 ~/.claude，无需用户配置）
  startHistoryMonitor()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopHistoryMonitor()
  // 清理自动清理定时器
  if (autoCleanupTimer) {
    clearInterval(autoCleanupTimer)
    autoCleanupTimer = null
  }
  if (autoCleanupTickTimer) {
    clearInterval(autoCleanupTickTimer)
    autoCleanupTickTimer = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

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
    // 验证 JSON 格式
    JSON.parse(config)
    fs.writeFileSync(SETTINGS_FILE, config, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// 获取应用设置
ipcMain.handle('get-app-settings', async () => {
  const defaultProviders = {
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

  const defaultSettings = {
    themeMode: 'system' as 'light' | 'dark' | 'system',
    autoStart: false,
    // AI 对话配置（简化版，只需三个字段）
    aiChat: {
      apiKey: '',
      apiBaseUrl: '',
      model: ''
    },
    // AI 总结配置
    aiSummary: {
      enabled: false,
      provider: 'groq' as 'groq' | 'deepseek' | 'gemini' | 'custom',
      providers: defaultProviders
    }
  }

  // 兼容旧的 darkMode 设置，迁移到 themeMode
  const oldDarkMode = store.get('darkMode', null)
  if (oldDarkMode !== null && !store.has('themeMode')) {
    store.set('themeMode', oldDarkMode ? 'dark' : 'light')
    store.delete('darkMode')
  }

  const themeMode = store.get('themeMode', defaultSettings.themeMode) as 'light' | 'dark' | 'system'
  const autoStart = store.get('autoStart', defaultSettings.autoStart) as boolean

  // 数据迁移：从旧的 ai 配置迁移到新的 aiChat 和 aiSummary 配置
  const oldAi = store.get('ai', null) as any

  let aiChat = store.get('aiChat', null) as any
  let aiSummary = store.get('aiSummary', null) as any

  // 如果旧配置存在且新配置不存在，执行迁移
  if (oldAi && (!aiChat || !aiSummary)) {
    // 迁移到 aiChat（对话配置简化为三个字段）
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

    // 迁移到 aiSummary（总结配置继承旧配置）
    if (!aiSummary) {
      aiSummary = {
        enabled: oldAi.enabled || false,
        provider: oldAi.provider || 'groq',
        providers: oldAi.providers || defaultProviders
      }
      store.set('aiSummary', aiSummary)
    }

    // 删除旧配置
    store.delete('ai')
  }

  // 如果没有旧配置，使用默认值
  if (!aiChat) {
    aiChat = defaultSettings.aiChat
    store.set('aiChat', aiChat)
  }

  if (!aiSummary) {
    aiSummary = defaultSettings.aiSummary
    store.set('aiSummary', aiSummary)
  }

  // 自动清理缓存配置
  const autoCleanup = store.get('autoCleanup', {
    enabled: false,
    intervalMs: 24 * 60 * 60 * 1000, // 默认 24 小时
    retainMs: 12 * 60 * 60 * 1000, // 默认保留 12 小时
    lastCleanupTime: null,
    nextCleanupTime: null,
    showFloatingBall: true // 默认显示悬浮球
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
      if (settings.aiChat) {
        store.set('aiChat', settings.aiChat)
      }
      if (settings.aiSummary) {
        store.set('aiSummary', settings.aiSummary)
      }
      if (settings.autoCleanup !== undefined) {
        store.set('autoCleanup', settings.autoCleanup)
        // 重新启动或停止自动清理定时器
        setupAutoCleanupTimer()
        // 通知渲染进程配置已更新
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auto-cleanup-config-updated', settings.autoCleanup)
        }
      }

      // 设置开机自启
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

// 获取 Token 价格配置
ipcMain.handle('get-token-pricing', async () => {
  try {
    const settings = (store.get('appSettings') || {}) as Record<string, any>
    return {
      success: true,
      tokenPricing: settings.tokenPricing || {
        inputPrice: 3.0,
        outputPrice: 15.0,
        cacheWritePrice: 3.75,
        cacheReadPrice: 0.3
      }
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// 保存 Token 价格配置
ipcMain.handle('save-token-pricing', async (_, tokenPricing: {
  inputPrice: number
  outputPrice: number
  cacheWritePrice: number
  cacheReadPrice: number
}) => {
  try {
    const settings = (store.get('appSettings') || {}) as Record<string, any>
    settings.tokenPricing = tokenPricing
    store.set('appSettings', settings)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

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

/* 轮询定时器，替代不可靠的 fs.watch */
let pollingTimer: ReturnType<typeof setInterval> | null = null
const POLLING_INTERVAL_MS = 2000 // 每 2 秒检查一次

// 启动历史记录监控（使用轮询替代 fs.watch，确保 macOS 下可靠检测文件变化）
function startHistoryMonitor() {
  stopHistoryMonitor()

  if (!fs.existsSync(HISTORY_FILE)) {
    // 文件不存在时也启动轮询，等待文件创建
    pollingTimer = setInterval(() => {
      if (fs.existsSync(HISTORY_FILE)) {
        lastFileSize = 0 // 从头开始读取
        readNewLines()
      }
    }, POLLING_INTERVAL_MS)
    return
  }

  // 获取当前文件大小
  const stats = fs.statSync(HISTORY_FILE)
  lastFileSize = stats.size

  pollingTimer = setInterval(() => {
    try {
      if (!fs.existsSync(HISTORY_FILE)) return
      const currentStats = fs.statSync(HISTORY_FILE)
      if (currentStats.size > lastFileSize) {
        readNewLines()
      }
    } catch (error) {
      console.error('[监控] 轮询检查文件失败:', error)
    }
  }, POLLING_INTERVAL_MS)
}

// 停止历史记录监控
function stopHistoryMonitor() {
  if (historyWatcher) {
    historyWatcher.close()
    historyWatcher = null
  }
  if (pollingTimer) {
    clearInterval(pollingTimer)
    pollingTimer = null
  }
}

// 读取新增的行
function readNewLines() {
  try {
    const stats = fs.statSync(HISTORY_FILE)
    const currentSize = stats.size

    if (currentSize <= lastFileSize) {
      return
    }

    const stream = fs.createReadStream(HISTORY_FILE, {
      start: lastFileSize,
      end: currentSize,
      encoding: 'utf-8'
    })

    let buffer = ''
    stream.on('data', (chunk: string | Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      lines.forEach(line => {
        if (line.trim()) {
          try {
            const record = JSON.parse(line)
            processRecord(record)
          } catch (e) {
            console.error('Failed to parse line:', e)
          }
        }
      })
    })

    stream.on('end', () => {
      lastFileSize = currentSize
    })
  } catch (error) {
    console.error('Error reading new lines:', error)
  }
}

// 处理对话记录（不再保存到文件，直接发送到渲染进程）
async function processRecord(record: any) {
  try {
    // 处理粘贴内容：读取实际内容
    const expandedPastedContents: Record<string, any> = {}
    if (record.pastedContents && typeof record.pastedContents === 'object') {
      for (const [key, value] of Object.entries(record.pastedContents)) {
        if (value && typeof value === 'object' && (value as any).contentHash) {
          const contentHash = (value as any).contentHash
          const pasteFilePath = path.join(CLAUDE_DIR, 'paste-cache', `${contentHash}.txt`)

          try {
            if (fs.existsSync(pasteFilePath)) {
              const actualContent = fs.readFileSync(pasteFilePath, 'utf-8')
              expandedPastedContents[key] = {
                ...value,
                content: actualContent
              }
            } else {
              expandedPastedContents[key] = value
            }
          } catch (err) {
            console.error(`Failed to read paste cache ${contentHash}:`, err)
            expandedPastedContents[key] = value
          }
        } else {
          expandedPastedContents[key] = value
        }
      }
    }

    // 处理图片
    const images: string[] = []

    if (record.sessionId && record.display && record.display.includes('[Image #')) {
      // 从 projects 目录提取 base64 图片到应用缓存
      const extractedImages = await extractImagesFromProjects(
        record.sessionId,
        record.project,
        record.display
      )
      images.push(...extractedImages)
    }

    // 发送到渲染进程
    const enrichedRecord = {
      ...record,
      pastedContents: expandedPastedContents,
      images: images.length > 0 ? images : undefined
    }

    if (mainWindow) {
      mainWindow.webContents.send('new-record', enrichedRecord)
    }
  } catch (error) {
    console.error('Failed to process record:', error)
  }
}

// 读取最近的实时记录（用于实时对话页面加载当天数据）
ipcMain.handle('read-recent-records', async (_, hoursAgo: number = 24) => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { success: true, records: [] }
    }

    const content = fs.readFileSync(HISTORY_FILE, 'utf-8')
    const lines = content.split('\n').filter((line: string) => line.trim())
    const cutoffTime = Date.now() - hoursAgo * 60 * 60 * 1000

    const recentRecords: any[] = []

    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        if (record.timestamp >= cutoffTime) {
          // 展开粘贴内容
          const expandedPastedContents: Record<string, any> = {}
          if (record.pastedContents && typeof record.pastedContents === 'object') {
            for (const [key, value] of Object.entries(record.pastedContents)) {
              if (value && typeof value === 'object' && (value as any).contentHash) {
                const contentHash = (value as any).contentHash
                const pasteFilePath = path.join(CLAUDE_DIR, 'paste-cache', `${contentHash}.txt`)
                try {
                  if (fs.existsSync(pasteFilePath)) {
                    expandedPastedContents[key] = {
                      ...value,
                      content: fs.readFileSync(pasteFilePath, 'utf-8')
                    }
                  } else {
                    expandedPastedContents[key] = value
                  }
                } catch {
                  expandedPastedContents[key] = value
                }
              } else {
                expandedPastedContents[key] = value
              }
            }
          }

          recentRecords.push({
            ...record,
            pastedContents: expandedPastedContents
          })
        }
      } catch {
        /* 跳过解析失败的行 */
      }
    }

    return { success: true, records: recentRecords }
  } catch (error) {
    console.error('[实时记录] 加载失败:', error)
    return { success: false, error: (error as Error).message, records: [] }
  }
})

// 读取历史记录元数据（从 history.jsonl 聚合会话信息，确保与 readSessionDetails 数据源一致）
ipcMain.handle('read-history-metadata', async () => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { success: true, sessions: [] }
    }

    // 获取用户配置的 Token 价格
    const settings = (store.get('appSettings') || {}) as any
    const tokenPricing = settings.tokenPricing || undefined

    /* 检查缓存是否有效 */
    const currentStats = fs.statSync(HISTORY_FILE)
    if (
      metadataCache &&
      metadataCache.historyFileSize === currentStats.size &&
      Date.now() - metadataCache.lastUpdated < CACHE_TTL_MS
    ) {
      return { success: true, sessions: metadataCache.sessions }
    }

    const content = fs.readFileSync(HISTORY_FILE, 'utf-8')
    const lines = content.split('\n').filter((line: string) => line.trim())

    // 按 sessionId 聚合
    const sessionMap = new Map<
      string,
      {
        sessionId: string
        project: string
        firstTimestamp: number
        latestTimestamp: number
        recordCount: number
      }
    >()

    for (const line of lines) {
      try {
        const record = JSON.parse(line)

        // 解析时间戳（兼容数字和字符串格式）
        let timestamp: number
        if (typeof record.timestamp === 'number') {
          // 如果小于 1e12，视为秒级时间戳，转为毫秒
          timestamp = record.timestamp < 1e12 ? record.timestamp * 1000 : record.timestamp
        } else if (typeof record.timestamp === 'string') {
          timestamp = new Date(record.timestamp).getTime()
        } else {
          continue // 没有有效时间戳，跳过
        }

        if (isNaN(timestamp)) continue

        // 使用记录中的 sessionId（UUID 格式），如果缺失则跳过该记录
        const sessionId = record.sessionId
        if (!sessionId) continue // 没有 sessionId 的记录无法定位会话文件

        const project = record.project || ''

        if (sessionMap.has(sessionId)) {
          const session = sessionMap.get(sessionId)!
          session.recordCount++
          session.firstTimestamp = Math.min(session.firstTimestamp, timestamp)
          session.latestTimestamp = Math.max(session.latestTimestamp, timestamp)
        } else {
          sessionMap.set(sessionId, {
            sessionId,
            project,
            firstTimestamp: timestamp,
            latestTimestamp: timestamp,
            recordCount: 1
          })
        }
      } catch (e) {
        // 跳过无效行
      }
    }

    // 为每个会话提取 Token 统计和工具调用信息
    const sessions = Array.from(sessionMap.values())
    const enrichedSessions = sessions.map(session => {
      try {
        // 如果 project 为空，返回基础信息（无法定位会话文件）
        if (!session.project || session.project.trim() === '') {
          return session
        }

        // 构建 project 路径
        const projectFolderName = getProjectFolderName(session.project)
        const projectSessionFile = path.join(
          CLAUDE_DIR,
          'projects',
          projectFolderName,
          `${session.sessionId}.jsonl`
        )

        // 如果会话文件不存在，返回基础信息
        if (!fs.existsSync(projectSessionFile)) {
          return session
        }

        // 读取会话文件，提取 Token 和工具调用信息
        const sessionLines = fs
          .readFileSync(projectSessionFile, 'utf-8')
          .split('\n')
          .filter(l => l.trim())

        let totalTokens = 0
        let totalCost = 0
        let hasToolUse = false
        let hasErrors = false
        let toolUseCount = 0
        const toolUsageMap = new Map<string, number>()
        const toolErrorsMap = new Map<string, number>()
        /* 用于匹配 tool_use id -> tool name */
        const toolIdToName = new Map<string, string>()
        /* 工具耗时追踪: tool_use_id -> { name, timestamp } */
        const pendingToolCalls = new Map<string, { name: string; timestamp: number }>()
        /* 每个工具的总耗时和调用次数 */
        const toolDurationMap = new Map<string, { totalMs: number; count: number }>()

        for (const sessionLine of sessionLines) {
          try {
            const entry = JSON.parse(sessionLine)

            // 检查错误
            if (entry.error) {
              hasErrors = true
            }

            // 提取助手响应中的 Token 使用量和成本（数据在 message.usage 中）
            if (entry.message && entry.message.usage) {
              const usage = entry.message.usage
              totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0)
              totalCost += calculateCost(usage, tokenPricing)
            }

            // 检查工具调用并统计工具类型（数据在 message.content 中）
            if (entry.message && entry.message.content) {
              const content = Array.isArray(entry.message.content)
                ? entry.message.content
                : [entry.message.content]

              for (const c of content) {
                if (c.type === 'tool_use') {
                  hasToolUse = true
                  toolUseCount++
                  // 统计工具名称使用频率
                  if (c.name) {
                    toolUsageMap.set(c.name, (toolUsageMap.get(c.name) || 0) + 1)
                    // 记录 tool_use id -> name 映射
                    if (c.id) {
                      toolIdToName.set(c.id, c.name)
                      // 记录工具调用时间戳用于耗时计算
                      if (entry.timestamp) {
                        pendingToolCalls.set(c.id, { name: c.name, timestamp: entry.timestamp })
                      }
                    }
                  }
                }
              }
            }

            // 检查工具结果（用户消息中）
            if (entry.message && entry.message.content) {
              const content = Array.isArray(entry.message.content)
                ? entry.message.content
                : [entry.message.content]

              for (const c of content) {
                if (c.type === 'tool_result') {
                  hasToolUse = true
                  // 统计工具错误
                  if (c.is_error && c.tool_use_id) {
                    const toolName = toolIdToName.get(c.tool_use_id) || 'unknown'
                    toolErrorsMap.set(toolName, (toolErrorsMap.get(toolName) || 0) + 1)
                  }
                  // 计算工具耗时
                  if (c.tool_use_id && entry.timestamp) {
                    const pending = pendingToolCalls.get(c.tool_use_id)
                    if (pending) {
                      const durationMs = entry.timestamp - pending.timestamp
                      if (durationMs >= 0 && durationMs < 600000) {
                        // 合理范围内（< 10 分钟）
                        const existing = toolDurationMap.get(pending.name) || { totalMs: 0, count: 0 }
                        existing.totalMs += durationMs
                        existing.count += 1
                        toolDurationMap.set(pending.name, existing)
                      }
                      pendingToolCalls.delete(c.tool_use_id)
                    }
                  }
                }
              }
            }
          } catch (err) {
            // 忽略解析错误
          }
        }

        // 转换工具使用统计为对象
        const toolUsage = toolUsageMap.size > 0 ? Object.fromEntries(toolUsageMap) : undefined
        const toolErrors = toolErrorsMap.size > 0 ? Object.fromEntries(toolErrorsMap) : undefined
        // 转换工具平均耗时 { "Read": 150, "Bash": 3200 } (ms)
        const toolAvgDuration: Record<string, number> = {}
        for (const [name, dur] of toolDurationMap) {
          toolAvgDuration[name] = Math.round(dur.totalMs / dur.count)
        }
        const toolDuration = Object.keys(toolAvgDuration).length > 0 ? toolAvgDuration : undefined

        return {
          ...session,
          total_tokens: totalTokens > 0 ? totalTokens : undefined,
          total_cost_usd: totalCost > 0 ? totalCost : undefined,
          has_tool_use: hasToolUse || undefined,
          has_errors: hasErrors || undefined,
          tool_use_count: toolUseCount > 0 ? toolUseCount : undefined,
          tool_usage: toolUsage,
          tool_errors: toolErrors,
          tool_avg_duration: toolDuration
        }
      } catch (err) {
        console.error(`提取会话 ${session.sessionId} 的元数据失败:`, err)
        return session
      }
    })

    // 按最新时间倒序排序
    enrichedSessions.sort((a, b) => b.latestTimestamp - a.latestTimestamp)

    /* 更新缓存 */
    metadataCache = {
      sessions: enrichedSessions,
      historyFileSize: currentStats.size,
      sessionFileSizes: new Map(),
      lastUpdated: Date.now()
    }

    return { success: true, sessions: enrichedSessions }
  } catch (error) {
    console.error('读取历史记录元数据时发生错误:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 读取项目级别的统计数据
ipcMain.handle('read-project-statistics', async () => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { success: true, projects: [] }
    }

    // 获取用户配置的 Token 价格
    const settings = (store.get('appSettings') || {}) as any
    const tokenPricing = settings.tokenPricing || undefined

    // 读取 history.jsonl 文件
    const content = fs.readFileSync(HISTORY_FILE, 'utf-8')
    const lines = content.split('\n').filter(line => line.trim())
    const records = lines.map(line => JSON.parse(line))

    // 按 project 和 sessionId 分组会话
    const sessionMap = new Map<string, any[]>()

    for (const record of records) {
      const key = `${record.project}|${record.sessionId}`
      if (!sessionMap.has(key)) {
        sessionMap.set(key, [])
      }
      sessionMap.get(key)!.push(record)
    }

    // 提取每个会话的元数据（包含 Token 统计）
    const sessions: any[] = []

    for (const [key, records] of sessionMap.entries()) {
      const [project, sessionId] = key.split('|')
      const firstTimestamp = records[0].timestamp
      const latestTimestamp = records[records.length - 1].timestamp

      let totalTokens = 0
      let totalCost = 0
      let hasToolUse = false
      let hasErrors = false
      const toolUsageMap = new Map<string, number>()

      // 读取对应的 projects/{sessionId}.jsonl
      if (project && project.trim() !== '') {
        const projectFolderName = getProjectFolderName(project)
        const projectsDir = PROJECTS_DIR
        const projectFile = path.join(projectsDir, projectFolderName, `${sessionId}.jsonl`)

        if (fs.existsSync(projectFile)) {
          try {
            const projectContent = fs.readFileSync(projectFile, 'utf-8')
            const projectLines = projectContent.split('\n').filter(line => line.trim())

            for (const line of projectLines) {
              try {
                const entry = JSON.parse(line)

                // 聚合 Token 统计
                if (entry.response?.usage) {
                  totalTokens +=
                    (entry.response.usage.input_tokens || 0) +
                    (entry.response.usage.output_tokens || 0) +
                    (entry.response.usage.cache_creation_input_tokens || 0) +
                    (entry.response.usage.cache_read_input_tokens || 0)

                  // 计算成本
                  totalCost += calculateCost(entry.response.usage, tokenPricing)
                }

                // 检查工具调用
                if (entry.response?.content && Array.isArray(entry.response.content)) {
                  for (const c of entry.response.content) {
                    if (c.type === 'tool_use') {
                      hasToolUse = true
                      if (c.name) {
                        toolUsageMap.set(c.name, (toolUsageMap.get(c.name) || 0) + 1)
                      }
                    }
                  }
                }

                // 检查错误
                if (entry.response?.stop_reason === 'error' || entry.response?.error) {
                  hasErrors = true
                }
              } catch {
                // 忽略单行解析错误
              }
            }
          } catch {
            // 忽略文件读取错误
          }
        }
      }

      sessions.push({
        sessionId,
        project,
        firstTimestamp,
        latestTimestamp,
        recordCount: records.length,
        total_tokens: totalTokens > 0 ? totalTokens : undefined,
        total_cost_usd: totalCost > 0 ? totalCost : undefined,
        has_tool_use: hasToolUse || undefined,
        has_errors: hasErrors || undefined,
        tool_use_count: toolUsageMap.size > 0 ? Array.from(toolUsageMap.values()).reduce((a, b) => a + b, 0) : undefined,
        tool_usage: toolUsageMap.size > 0 ? Object.fromEntries(toolUsageMap) : undefined
      })
    }

    // 按项目聚合
    const projectMap = new Map<
      string,
      {
        project: string
        sessionCount: number
        totalTokens: number
        totalCost: number
        totalRecords: number
        toolUsageMap: Map<string, number>
        hasToolUse: boolean
        hasErrors: boolean
        firstTimestamp: number
        latestTimestamp: number
      }
    >()

    for (const session of sessions) {
      const projectKey = session.project

      if (!projectMap.has(projectKey)) {
        projectMap.set(projectKey, {
          project: projectKey,
          sessionCount: 0,
          totalTokens: 0,
          totalCost: 0,
          totalRecords: 0,
          toolUsageMap: new Map(),
          hasToolUse: false,
          hasErrors: false,
          firstTimestamp: session.firstTimestamp,
          latestTimestamp: session.latestTimestamp
        })
      }

      const projectData = projectMap.get(projectKey)!
      projectData.sessionCount++
      projectData.totalRecords += session.recordCount || 0
      projectData.totalTokens += session.total_tokens || 0
      projectData.totalCost += session.total_cost_usd || 0
      projectData.hasToolUse = projectData.hasToolUse || session.has_tool_use || false
      projectData.hasErrors = projectData.hasErrors || session.has_errors || false
      projectData.firstTimestamp = Math.min(projectData.firstTimestamp, session.firstTimestamp)
      projectData.latestTimestamp = Math.max(projectData.latestTimestamp, session.latestTimestamp)

      // 聚合工具使用统计
      if (session.tool_usage) {
        for (const [tool, count] of Object.entries(session.tool_usage)) {
          projectData.toolUsageMap.set(
            tool,
            (projectData.toolUsageMap.get(tool) || 0) + (count as number)
          )
        }
      }
    }

    // 转换为数组并格式化
    const projects = Array.from(projectMap.values())
      .map(project => ({
        project: project.project,
        projectName: path.basename(project.project),
        sessionCount: project.sessionCount,
        totalRecords: project.totalRecords,
        totalTokens: project.totalTokens > 0 ? project.totalTokens : undefined,
        totalCost: project.totalCost > 0 ? project.totalCost : undefined,
        hasToolUse: project.hasToolUse || undefined,
        hasErrors: project.hasErrors || undefined,
        toolUsage:
          project.toolUsageMap.size > 0 ? Object.fromEntries(project.toolUsageMap) : undefined,
        firstTimestamp: project.firstTimestamp,
        latestTimestamp: project.latestTimestamp
      }))
      .sort((a, b) => b.latestTimestamp - a.latestTimestamp)

    return { success: true, projects }
  } catch (error) {
    console.error('读取项目统计时发生错误:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 读取指定会话的详细记录（直接从 ~/.claude/history.jsonl 读取）
ipcMain.handle('read-session-details', async (_, sessionId: string) => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { success: true, records: [] }
    }

    const content = fs.readFileSync(HISTORY_FILE, 'utf-8')
    const lines = content.split('\n').filter((line: string) => line.trim())

    const records: any[] = []

    for (const line of lines) {
      try {
        const record = JSON.parse(line)

        // 解析时间戳（兼容数字和字符串格式）
        let timestamp: number
        if (typeof record.timestamp === 'number') {
          timestamp = record.timestamp < 1e12 ? record.timestamp * 1000 : record.timestamp
        } else if (typeof record.timestamp === 'string') {
          timestamp = new Date(record.timestamp).getTime()
        } else {
          continue
        }

        if (isNaN(timestamp) || !record.project) {
          continue
        }

        const recordSessionId = record.sessionId || `single-${timestamp}`

        // 只加载匹配的 sessionId
        if (recordSessionId !== sessionId) {
          continue
        }

        // 展开粘贴内容
        let pastedContents = record.pastedContents || {}
        if (pastedContents && typeof pastedContents === 'object') {
          pastedContents = expandPastedContents(pastedContents)
        }

        // 提取图片
        let images: string[] = []
        const displayText = record.display || ''
        if (displayText.includes('[Image #')) {
          try {
            images = await extractImagesFromProjects(recordSessionId, record.project, displayText)
          } catch (err) {
            console.error('读取历史时提取图片失败:', err)
          }
        }

        records.push({
          timestamp,
          project: record.project,
          sessionId: recordSessionId,
          display: displayText,
          pastedContents,
          images
        })
      } catch (e) {
        // 跳过无效行
      }
    }

    // 按时间倒序排序（最新的在前）
    records.sort((a, b) => b.timestamp - a.timestamp)

    return { success: true, records }
  } catch (error) {
    console.error('读取会话详情时发生错误:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 读取完整对话（从 projects/{sessionId}.jsonl）
ipcMain.handle('read-full-conversation', async (_, sessionId: string, project: string) => {
  try {
    // 参数验证
    if (!sessionId || sessionId.trim() === '') {
      return { success: false, error: 'sessionId 不能为空' }
    }
    if (!project || project.trim() === '') {
      return { success: false, error: 'project 路径不能为空' }
    }

    // 优先按 project 推断路径；若失败则按 sessionId 全局兜底查找
    const projectFolderName = getProjectFolderName(project)
    const preferredSessionFile = path.join(
      CLAUDE_DIR,
      'projects',
      projectFolderName,
      `${sessionId}.jsonl`
    )
    let projectSessionFile = preferredSessionFile

    if (!fs.existsSync(projectSessionFile)) {
      const projectsDir = PROJECTS_DIR
      if (fs.existsSync(projectsDir)) {
        const folders = fs.readdirSync(projectsDir)
        for (const folder of folders) {
          const candidate = path.join(projectsDir, folder, `${sessionId}.jsonl`)
          if (fs.existsSync(candidate)) {
            projectSessionFile = candidate
            break
          }
        }
      }
    }

    if (!fs.existsSync(projectSessionFile)) {
      return {
        success: false,
        error: `完整对话文件不存在（sessionId: ${sessionId}）`
      }
    }

    const lines = fs
      .readFileSync(projectSessionFile, 'utf-8')
      .split('\n')
      .filter(line => line.trim())

    const messages: any[] = []
    let totalTokens = 0
    let totalCost = 0
    let hasToolUse = false
    let hasErrors = false
    let toolUseCount = 0
    const toolUsageMap = new Map<string, number>()
    const fileEdits: Array<{
      messageId: string
      snapshotMessageId?: string
      timestamp: string
      files: string[]
      isSnapshotUpdate?: boolean
    }> = []

    for (const line of lines) {
      try {
        const entry = JSON.parse(line)

        // 获取消息子类型
        const entryType = entry.type || 'unknown'

        // 检查错误
        if (entry.error) {
          hasErrors = true
        }

        // 提取文件编辑快照
        if (entryType === 'file-history-snapshot') {
          const snapshot = entry.snapshot || {}
          const trackedFiles = snapshot.trackedFileBackups || {}
          const filePaths = Object.keys(trackedFiles)
          if (filePaths.length > 0) {
            // 安全处理 timestamp：确保它是字符串或数字
            let timestampValue: string | number = ''
            if (snapshot.timestamp) {
              if (typeof snapshot.timestamp === 'string' || typeof snapshot.timestamp === 'number') {
                timestampValue = snapshot.timestamp
              } else if (typeof snapshot.timestamp === 'object' && 'timestamp' in snapshot.timestamp) {
                // 如果是对象且包含 timestamp 字段，提取该字段
                timestampValue = snapshot.timestamp.timestamp
              } else {
                // 其他情况使用 entry.timestamp 或当前时间
                timestampValue = entry.timestamp || Date.now()
              }
            }

            fileEdits.push({
              messageId: entry.messageId || '',
              snapshotMessageId: snapshot.messageId || undefined,
              timestamp: String(timestampValue),
              files: filePaths,
              isSnapshotUpdate: entry.isSnapshotUpdate || false
            })
          }
          continue
        }

        // 跳过非消息类型（如 queue-operation）
        if (entryType === 'queue-operation') {
          continue
        }

        // 提取用户消息
        if (entry.message && entry.message.role && entry.message.content) {
          /* 安全处理 content：可能是 string / array / object(如 file-history metadata) */
          let messageContent: any[]
          if (Array.isArray(entry.message.content)) {
            messageContent = entry.message.content
          } else if (typeof entry.message.content === 'string') {
            messageContent = [{ type: 'text', text: entry.message.content }]
          } else {
            // content 是对象（如 {backupFileName, version, backupTime}）等非标准格式
            messageContent = [{ type: 'text', text: JSON.stringify(entry.message.content) }]
          }

          // 检查工具结果
          for (const content of messageContent) {
            if (content.type === 'tool_result') {
              hasToolUse = true
            }
          }

          messages.push({
            role: entry.message.role,
            content: messageContent,
            timestamp: entry.timestamp || Date.now(),
            messageId: entry.messageId || undefined,
            subType: entryType
          })
        }

        // 提取助手响应（包含 Token 和成本信息）
        if (entry.response && entry.response.role && entry.response.content) {
          /* 安全处理 response content：可能是 string / array / object */
          let responseContent: any[]
          if (Array.isArray(entry.response.content)) {
            responseContent = entry.response.content
          } else if (typeof entry.response.content === 'string') {
            responseContent = [{ type: 'text', text: entry.response.content }]
          } else {
            responseContent = [{ type: 'text', text: JSON.stringify(entry.response.content) }]
          }

          // 检查工具调用并统计工具类型
          for (const content of responseContent) {
            if (content.type === 'tool_use') {
              hasToolUse = true
              toolUseCount++
              // 统计工具名称使用频率
              if (content.name) {
                toolUsageMap.set(content.name, (toolUsageMap.get(content.name) || 0) + 1)
              }
            }
          }

          // 提取 Token 使用量和计算成本
          const usage = entry.response.usage
          const model = entry.response.model

          let messageCost = 0
          if (usage) {
            const tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0)
            totalTokens += tokens
            messageCost = calculateCost(usage, model)
            totalCost += messageCost
          }

          messages.push({
            role: entry.response.role,
            content: responseContent,
            timestamp: entry.timestamp || Date.now(),
            messageId: entry.messageId || undefined,
            subType: entryType,
            model,
            usage,
            cost_usd: messageCost > 0 ? messageCost : undefined,
            duration_ms: entry.response.duration_ms
          })
        }
      } catch (err) {
        console.error('解析对话行失败:', err)
      }
    }

    // 转换工具使用统计为对象
    const toolUsage = toolUsageMap.size > 0 ? Object.fromEntries(toolUsageMap) : undefined

    const conversation = {
      sessionId,
      project,
      messages,
      total_tokens: totalTokens > 0 ? totalTokens : undefined,
      total_cost_usd: totalCost > 0 ? totalCost : undefined,
      has_tool_use: hasToolUse || undefined,
      has_errors: hasErrors || undefined,
      tool_use_count: toolUseCount > 0 ? toolUseCount : undefined,
      tool_usage: toolUsage,
      fileEdits: fileEdits.length > 0 ? fileEdits : undefined
    }

    return { success: true, conversation }
  } catch (error) {
    console.error('读取完整对话时发生错误:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 读取文件快照内容（获取完整的文件备份内容）
ipcMain.handle(
  'read-file-snapshot-content',
  async (_, sessionId: string, messageId: string, filePath: string) => {
    try {
      const projectsDir = PROJECTS_DIR
      if (!fs.existsSync(projectsDir)) {
        return { success: false, error: '项目目录不存在' }
      }

      // 在所有项目目录中查找对应的会话文件
      const projectFolders = fs.readdirSync(projectsDir)

      for (const folder of projectFolders) {
        const sessionFile = path.join(projectsDir, folder, `${sessionId}.jsonl`)
        if (!fs.existsSync(sessionFile)) continue

        const content = fs.readFileSync(sessionFile, 'utf-8')
        const lines = content.split('\n').filter(l => l.trim())

        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            if (
              entry.type === 'file-history-snapshot' &&
              entry.messageId === messageId
            ) {
              const snapshot = entry.snapshot || {}
              const trackedFiles = snapshot.trackedFileBackups || {}
              const fileMetadata = trackedFiles[filePath]

              if (fileMetadata !== undefined) {
                // fileMetadata 是一个对象: {backupFileName, version, backupTime}
                // 需要读取实际的备份文件内容
                if (typeof fileMetadata === 'object' && fileMetadata.backupFileName) {
                  const backupFilePath = path.join(
                    CLAUDE_DIR,
                    'file-history',
                    sessionId,
                    fileMetadata.backupFileName
                  )

                  if (fs.existsSync(backupFilePath)) {
                    const backupContent = fs.readFileSync(backupFilePath, 'utf-8')
                    return { success: true, content: backupContent }
                  } else {
                    return { success: false, error: '备份文件不存在' }
                  }
                } else if (typeof fileMetadata === 'string') {
                  // 旧版本可能直接存储字符串内容
                  return { success: true, content: fileMetadata }
                } else if (
                  typeof fileMetadata === 'object' &&
                  'backupFileName' in fileMetadata &&
                  !fileMetadata.backupFileName
                ) {
                  // 新建文件场景：创建前不存在备份，返回当前文件内容用于预览，并标记为新增快照
                  const currentContent = fs.existsSync(filePath)
                    ? fs.readFileSync(filePath, 'utf-8')
                    : ''
                  return {
                    success: true,
                    content: currentContent,
                    isNewFileSnapshot: true
                  }
                } else {
                  return { success: false, error: '无效的文件快照格式' }
                }
              }
            }
          } catch {
            // 跳过
          }
        }
      }

      return { success: false, error: '未找到对应的文件快照' }
    } catch (error) {
      console.error('读取文件快照内容失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }
)

// 从快照恢复文件（将快照内容写回原始文件路径）
ipcMain.handle(
  'restore-file-from-snapshot',
  async (_, sessionId: string, messageId: string, filePath: string) => {
    try {
      // 先获取快照内容
      const projectsDir = PROJECTS_DIR
      if (!fs.existsSync(projectsDir)) {
        return { success: false, error: '项目目录不存在' }
      }

      const projectFolders = fs.readdirSync(projectsDir)
      let snapshotContent: string | null = null
      let isNewFileSnapshot = false

      for (const folder of projectFolders) {
        const sessionFile = path.join(projectsDir, folder, `${sessionId}.jsonl`)
        if (!fs.existsSync(sessionFile)) continue

        const content = fs.readFileSync(sessionFile, 'utf-8')
        const lines = content.split('\n').filter(l => l.trim())

        for (const line of lines) {
          try {
            const entry = JSON.parse(line)
            if (
              entry.type === 'file-history-snapshot' &&
              entry.messageId === messageId
            ) {
              const snapshot = entry.snapshot || {}
              const trackedFiles = snapshot.trackedFileBackups || {}
              const fileMetadata = trackedFiles[filePath]

              if (fileMetadata !== undefined) {
                // fileMetadata 是一个对象: {backupFileName, version, backupTime}
                // 需要读取实际的备份文件内容
                if (typeof fileMetadata === 'object' && fileMetadata.backupFileName) {
                  const backupFilePath = path.join(
                    CLAUDE_DIR,
                    'file-history',
                    sessionId,
                    fileMetadata.backupFileName
                  )

                  if (fs.existsSync(backupFilePath)) {
                    snapshotContent = fs.readFileSync(backupFilePath, 'utf-8')
                    break
                  }
                } else if (typeof fileMetadata === 'string') {
                  // 旧版本可能直接存储字符串内容
                  snapshotContent = fileMetadata
                  break
                } else if (
                  typeof fileMetadata === 'object' &&
                  'backupFileName' in fileMetadata &&
                  !fileMetadata.backupFileName
                ) {
                  // 新建文件快照：表示恢复到「文件不存在」状态
                  isNewFileSnapshot = true
                  snapshotContent = ''
                  break
                }
              }
            }
          } catch {
            // 跳过
          }
        }
        if (snapshotContent !== null) break
      }

      if (snapshotContent === null) {
        return { success: false, error: '未找到对应的文件快照内容' }
      }

      // 新建文件快照恢复：目标状态为文件不存在，若当前存在则删除
      if (isNewFileSnapshot) {
        if (fs.existsSync(filePath)) {
          const backupPath = `${filePath}.backup-${Date.now()}`
          fs.copyFileSync(filePath, backupPath)
          fs.unlinkSync(filePath)
        }
        return { success: true }
      }

      // 检查目标文件所在目录是否存在
      const targetDir = path.dirname(filePath)
      if (!fs.existsSync(targetDir)) {
        return { success: false, error: `目标目录不存在: ${targetDir}` }
      }

      // 如果目标文件已存在，先备份
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.backup-${Date.now()}`
        fs.copyFileSync(filePath, backupPath)
      }

      // 写入快照内容
      fs.writeFileSync(filePath, snapshotContent, 'utf-8')

      return { success: true }
    } catch (error) {
      console.error('恢复文件失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }
)

// 读取历史记录（直接从 ~/.claude/history.jsonl 读取）
ipcMain.handle('read-history', async () => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { success: true, records: [] }
    }

    const content = fs.readFileSync(HISTORY_FILE, 'utf-8')
    const lines = content.split('\n').filter((line: string) => line.trim())

    const records: any[] = []
    const MAX_RECORDS = 1000

    for (const line of lines) {
      if (records.length >= MAX_RECORDS) break

      try {
        const record = JSON.parse(line)
        const timestamp =
          typeof record.timestamp === 'number'
            ? record.timestamp
            : new Date(record.timestamp).getTime()

        if (isNaN(timestamp) || !record.project) {
          continue
        }

        // 展开粘贴内容
        let pastedContents = record.pastedContents || {}
        if (pastedContents && typeof pastedContents === 'object') {
          pastedContents = expandPastedContents(pastedContents)
        }

        // 提取图片
        let images: string[] = []
        const sessionId = record.sessionId || ''
        const displayText = record.display || ''
        if (displayText.includes('[Image #')) {
          try {
            images = await extractImagesFromProjects(sessionId, record.project, displayText)
          } catch (err) {
            console.error('读取历史时提取图片失败:', err)
          }
        }

        records.push({
          timestamp,
          project: record.project,
          sessionId,
          display: displayText,
          pastedContents,
          images
        })
      } catch (e) {
        // 跳过无效行
      }
    }

    return { success: true, records }
  } catch (error) {
    console.error('读取历史记录时发生错误:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 导出记录为 Markdown（直接从 ~/.claude/history.jsonl 读取）
ipcMain.handle('export-records', async (_, options: any) => {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      return { success: false, error: '历史记录文件不存在' }
    }

    const fileContent = fs.readFileSync(HISTORY_FILE, 'utf-8')
    const lines = fileContent.split('\n').filter((line: string) => line.trim())

    if (lines.length === 0) {
      return { success: false, error: '没有找到记录' }
    }

    // 解析所有记录
    const allRecords: any[] = []
    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        const timestamp =
          typeof record.timestamp === 'number'
            ? record.timestamp
            : new Date(record.timestamp).getTime()

        if (isNaN(timestamp) || !record.project) {
          continue
        }

        allRecords.push({
          timestamp,
          project: record.project,
          sessionId: record.sessionId || '',
          display: record.display || '',
          pastedContents: record.pastedContents || {},
          images: record.images || []
        })
      } catch (e) {
        // 跳过无效记录
      }
    }

    if (allRecords.length === 0) {
      return { success: false, error: '没有有效的记录' }
    }

    // 过滤记录
    let filteredRecords = allRecords

    // 按 sessionIds 过滤
    if (options.sessionIds && options.sessionIds.length > 0) {
      filteredRecords = filteredRecords.filter(r => options.sessionIds.includes(r.sessionId))
    }

    // 按日期范围过滤
    if (options.startDate) {
      filteredRecords = filteredRecords.filter(r => r.timestamp >= options.startDate)
    }
    if (options.endDate) {
      filteredRecords = filteredRecords.filter(r => r.timestamp <= options.endDate)
    }

    if (filteredRecords.length === 0) {
      return { success: false, error: '筛选后没有记录' }
    }

    // 按时间排序
    filteredRecords.sort((a, b) => a.timestamp - b.timestamp)

    // 按会话分组
    const sessions = new Map<string, any[]>()
    for (const record of filteredRecords) {
      const sessionId = record.sessionId || `single-${record.timestamp}`
      if (!sessions.has(sessionId)) {
        sessions.set(sessionId, [])
      }
      sessions.get(sessionId)!.push(record)
    }

    // 生成 Markdown 内容
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')

    let markdown = '# Claude Code 对话记录导出\n\n'
    markdown += `**导出时间**: ${now.toLocaleString('zh-CN')}\n\n`
    markdown += `**记录总数**: ${filteredRecords.length} 条对话\n\n`
    markdown += `**会话总数**: ${sessions.size} 个会话\n\n`
    markdown += '---\n\n'

    // 遍历每个会话
    let sessionIndex = 1
    for (const [sessionId, records] of sessions) {
      const firstRecord = records[0]
      const projectName = path.basename(firstRecord.project)

      markdown += `## 会话 ${sessionIndex}: ${projectName}\n\n`

      if (sessionId && !sessionId.startsWith('single-')) {
        markdown += `**Session ID**: \`${sessionId}\`\n\n`
      }

      markdown += `**项目路径**: \`${firstRecord.project}\`\n\n`
      markdown += `**对话数量**: ${records.length} 条\n\n`
      markdown += `**时间范围**: ${new Date(records[0].timestamp).toLocaleString('zh-CN')} ~ ${new Date(records[records.length - 1].timestamp).toLocaleString('zh-CN')}\n\n`
      markdown += '---\n\n'

      // 遍历每条对话
      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        markdown += `### 对话 #${i + 1}\n\n`
        markdown += `**时间**: ${new Date(record.timestamp).toLocaleString('zh-CN')}\n\n`
        markdown += '**内容**:\n\n'
        markdown += '```\n'
        markdown += record.display
        markdown += '\n```\n\n'

        // 如果有附加内容
        if (record.pastedContents && Object.keys(record.pastedContents).length > 0) {
          markdown += '**附加内容**:\n\n'
          for (const [key, value] of Object.entries(record.pastedContents)) {
            markdown += `- 附件 ${key}:\n`
            if (typeof value === 'string') {
              markdown += '```\n'
              markdown += value
              markdown += '\n```\n\n'
            } else if (value && typeof value === 'object' && (value as any).content) {
              // 新格式：包含 content 字段
              markdown += '```\n'
              markdown += (value as any).content
              markdown += '\n```\n\n'
            } else {
              markdown += '```json\n'
              markdown += JSON.stringify(value, null, 2)
              markdown += '\n```\n\n'
            }
          }
        }

        // 如果有图片
        if (record.images && record.images.length > 0) {
          markdown += '**图片**:\n\n'
          for (const imagePath of record.images) {
            markdown += `![图片](${imagePath})\n\n`
          }
        }

        markdown += '---\n\n'
      }

      sessionIndex++
    }

    // 让用户选择保存位置
    const result = await dialog.showSaveDialog({
      title: '保存 Markdown 文件',
      defaultPath: `claude-code-export-${dateStr}-${timeStr}.md`,
      filters: [
        { name: 'Markdown Files', extensions: ['md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '用户取消了保存' }
    }

    // 写入文件
    fs.writeFileSync(result.filePath, markdown, 'utf-8')

    return { success: true, filePath: result.filePath }
  } catch (error) {
    console.error('导出记录失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// AI 总结功能
ipcMain.handle(
  'summarize-records',
  async (event, request: { records: any[]; type: 'brief' | 'detailed' }) => {
    try {
      // 获取 AI 总结设置（使用独立的 aiSummary 配置）
      const aiSummarySettings = store.get('aiSummary') as any

      if (!aiSummarySettings || !aiSummarySettings.enabled) {
        return {
          success: false,
          error: 'AI 总结功能未启用，请先在设置中启用'
        }
      }

      const provider: 'groq' | 'deepseek' | 'gemini' | 'custom' =
        aiSummarySettings.provider || 'groq'
      const currentConfig = aiSummarySettings.providers?.[provider]

      if (!currentConfig || !currentConfig.apiKey) {
        const providerNames: Record<'groq' | 'deepseek' | 'gemini' | 'custom', string> = {
          groq: 'Groq',
          deepseek: 'DeepSeek',
          gemini: 'Google Gemini',
          custom: '自定义'
        }
        return {
          success: false,
          error: `未配置 ${providerNames[provider] || 'AI'} API Key，请前往设置页面配置`
        }
      }

      // 验证 API Key 格式（只对特定提供商验证）
      if (provider === 'deepseek' && !currentConfig.apiKey.startsWith('sk-')) {
        return {
          success: false,
          error: 'API Key 格式不正确，DeepSeek API Key 应以 "sk-" 开头'
        }
      }

      if (provider === 'groq' && !currentConfig.apiKey.startsWith('gsk_')) {
        return {
          success: false,
          error: 'API Key 格式不正确，Groq API Key 应以 "gsk_" 开头'
        }
      }

      // 自定义提供商需要验证必填字段
      if (provider === 'custom') {
        if (!currentConfig.apiBaseUrl) {
          return {
            success: false,
            error: '自定义提供商需要配置 API 地址'
          }
        }
        if (!currentConfig.model) {
          return {
            success: false,
            error: '自定义提供商需要配置模型名称'
          }
        }
      }

      if (!request.records || request.records.length === 0) {
        return {
          success: false,
          error: '没有可总结的记录'
        }
      }

      // 构建提示词
      const conversations = request.records
        .map((record: any, index: number) => {
          return `[对话 ${index + 1}]\n时间: ${new Date(record.timestamp).toLocaleString('zh-CN')}\n内容: ${record.display}`
        })
        .join('\n\n---\n\n')

      const templates = {
        brief: `请用 1-2 句话简短总结以下 Claude Code 对话的核心内容：\n\n${conversations}`,
        detailed: `请详细总结以下 Claude Code 对话记录，使用 Markdown 格式，包含以下结构：

## 📋 会话摘要
（用一段话概括整个对话的主题和目的）

## 🎯 主要讨论点
（列出 3-5 个要点）

## 💡 解决方案/结论
（总结得出的结论或实施的方案）

## 🔧 涉及的技术/工具
（如果有，列出提到的技术栈、工具或文件）

对话记录：

${conversations}`
      }

      const prompt = templates[request.type] || templates.detailed

      // 调用 AI API
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        // Gemini 使用不同的 API 格式（注意：自定义提供商默认使用 OpenAI 格式）
        if (provider === 'gemini') {
          const response = await httpRequest<Response>({
            url: `${currentConfig.apiBaseUrl}/models/${currentConfig.model}:generateContent?key=${currentConfig.apiKey}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text:
                        '你是一个专业的技术对话总结助手，擅长提取关键信息和技术要点。请使用简洁清晰的中文进行总结。\n\n' +
                        prompt
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2000
              }
            }),
            signal: controller.signal,
            webContents: event.sender // 传递 webContents 以在 DevTools 中显示日志
          })

          clearTimeout(timeoutId)

          if (!response.ok) {
            const errorData = (await response.json().catch(() => ({}))) as any
            return {
              success: false,
              error: `Gemini API 错误: ${response.status} ${errorData.error?.message || response.statusText}`
            }
          }

          const data = (await response.json()) as any
          const summary = data.candidates?.[0]?.content?.parts?.[0]?.text

          if (!summary) {
            return {
              success: false,
              error: 'Gemini API 返回格式异常'
            }
          }

          return {
            success: true,
            summary: summary.trim(),
            tokensUsed: data.usageMetadata?.totalTokenCount || 0
          }
        }

        // OpenAI 兼容格式 (Groq, DeepSeek, 自定义)
        // 注意：自定义提供商默认使用 OpenAI 格式，用户可自行配置兼容的 API
        const response = await httpRequest<Response>({
          url: `${currentConfig.apiBaseUrl}/chat/completions`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentConfig.apiKey}`
          },
          body: JSON.stringify({
            model: currentConfig.model,
            messages: [
              {
                role: 'system',
                content:
                  '你是一个专业的技术对话总结助手，擅长提取关键信息和技术要点。请使用简洁清晰的中文进行总结。'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.3,
            max_tokens: 2000
          }),
          signal: controller.signal,
          webContents: event.sender // 传递 webContents 以在 DevTools 中显示日志
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = (errorData as any).error?.message || response.statusText

          // 针对不同错误码提供友好提示
          let userFriendlyError = ''
          switch (response.status) {
            case 401:
              userFriendlyError = 'API Key 无效或已过期，请检查并重新配置'
              break
            case 402:
              userFriendlyError = 'DeepSeek 账户余额不足，请前往 https://platform.deepseek.com 充值'
              break
            case 429:
              userFriendlyError = 'API 调用频率超限，请稍后再试'
              break
            case 500:
            case 502:
            case 503:
              userFriendlyError = 'DeepSeek 服务暂时不可用，请稍后再试'
              break
            default:
              userFriendlyError = `API 错误 (${response.status}): ${errorMessage}`
          }

          return {
            success: false,
            error: userFriendlyError
          }
        }

        const data = (await response.json()) as any

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          return {
            success: false,
            error: 'DeepSeek API 返回格式异常'
          }
        }

        return {
          success: true,
          summary: data.choices[0].message.content.trim(),
          tokensUsed: data.usage?.total_tokens || 0
        }
      } catch (error: any) {
        clearTimeout(timeoutId)

        if (error.name === 'AbortError') {
          return {
            success: false,
            error: '请求超时，请检查网络连接'
          }
        }

        return {
          success: false,
          error: error.message || '未知错误'
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '总结失败'
      }
    }
  }
)

// 流式 AI 总结功能
ipcMain.handle(
  'summarize-records-stream',
  async (event, request: { records: any[]; type: 'brief' | 'detailed' }) => {
    try {
      // 获取 AI 总结设置（使用独立的 aiSummary 配置）
      const aiSummarySettings = store.get('aiSummary') as any

      if (!aiSummarySettings || !aiSummarySettings.enabled) {
        event.sender.send('summary-stream-error', 'AI 总结功能未启用，请先在设置中启用')
        return
      }

      const provider: 'groq' | 'deepseek' | 'gemini' | 'custom' =
        aiSummarySettings.provider || 'groq'
      const currentConfig = aiSummarySettings.providers?.[provider]

      if (!currentConfig || !currentConfig.apiKey) {
        const providerNames: Record<'groq' | 'deepseek' | 'gemini', string> = {
          groq: 'Groq',
          deepseek: 'DeepSeek',
          gemini: 'Google Gemini'
        }
        event.sender.send(
          'summary-stream-error',
          `未配置 ${providerNames[provider as 'groq' | 'deepseek' | 'gemini'] || 'AI'} API Key，请前往设置页面配置`
        )
        return
      }

      if (!request.records || request.records.length === 0) {
        event.sender.send('summary-stream-error', '没有可总结的记录')
        return
      }

      // 构建提示词
      const conversations = request.records
        .map((record: any, index: number) => {
          return `[对话 ${index + 1}]\n时间: ${new Date(record.timestamp).toLocaleString('zh-CN')}\n内容: ${record.display}`
        })
        .join('\n\n---\n\n')

      const templates = {
        brief: `请用 1-2 句话简短总结以下 Claude Code 对话的核心内容：\n\n${conversations}`,
        detailed: `请详细总结以下 Claude Code 对话记录，使用 Markdown 格式，包含以下结构：

## 📋 会话摘要
（用一段话概括整个对话的主题和目的）

## 🎯 主要讨论点
（列出 3-5 个要点）

## 💡 解决方案/结论
（总结得出的结论或实施的方案）

## 🔧 涉及的技术/工具
（如果有，列出提到的技术栈、工具或文件）

对话记录：

${conversations}`
      }

      const prompt = templates[request.type] || templates.detailed

      // Gemini 不支持流式
      if (provider === 'gemini') {
        event.sender.send('summary-stream-error', 'Gemini 暂不支持流式输出，请使用普通总结')
        return
      }

      // OpenAI 兼容格式的流式请求 (Groq, DeepSeek, 自定义)
      // 自定义提供商需要确保 API 兼容 OpenAI 的流式格式
      const response = await httpRequest<Response>({
        url: `${currentConfig.apiBaseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentConfig.apiKey}`
        },
        body: JSON.stringify({
          model: currentConfig.model,
          messages: [
            {
              role: 'system',
              content:
                '你是一个专业的技术对话总结助手，擅长提取关键信息和技术要点。请使用简洁清晰的中文进行总结。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2000,
          stream: true // 启用流式输出
        }),
        webContents: event.sender // 传递 webContents 以在 DevTools 中显示日志
      })

      if (!response.ok) {
        await response.json().catch(() => ({}))
        event.sender.send('summary-stream-error', `API 错误: ${response.status}`)
        return
      }

      // 确保 body 是 Readable stream
      if (!response.body || typeof response.body === 'string') {
        event.sender.send('summary-stream-error', '响应格式错误')
        return
      }

      // 读取流式响应 - 使用 Node.js Stream API
      let buffer = ''
      ;(response.body as any)
        .on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')

          // 保留最后一个不完整的行
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() === '') continue

            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()

              if (data === '[DONE]') {
                event.sender.send('summary-stream-complete')
                return
              }

              try {
                const json = JSON.parse(data)
                const content = json.choices?.[0]?.delta?.content
                if (content) {
                  event.sender.send('summary-stream-chunk', content)
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        })
        .on('end', () => {
          event.sender.send('summary-stream-complete')
        })
        .on('error', (error: Error) => {
          event.sender.send('summary-stream-error', error.message || '流式读取失败')
        })
    } catch (error: any) {
      event.sender.send('summary-stream-error', error.message || '总结失败')
    }
  }
)

// 获取配置文件路径
ipcMain.handle('get-config-path', async () => {
  return store.path
})

// 在默认编辑器中打开配置文件
ipcMain.handle('open-config-file', async () => {
  try {
    const configPath = store.path
    await shell.openPath(configPath)
  } catch (error) {
    console.error('打开配置文件失败:', error)
    throw error
  }
})

// 在文件管理器中显示配置文件
ipcMain.handle('show-config-in-folder', async () => {
  try {
    const configPath = store.path
    shell.showItemInFolder(configPath)
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

// 删除单条历史记录（已弃用：Claude Code 原始数据不应被修改）
ipcMain.handle('delete-record', async (_, _sessionId: string, _timestamp: number) => {
  // 不再支持删除 Claude Code 的原始数据
  return { success: false, error: '已切换到直接读取 Claude Code 数据，不支持删除原始记录' }
})

// 读取应用配置文件内容
ipcMain.handle('read-app-config-file', async () => {
  try {
    const configPath = store.path
    const content = fs.readFileSync(configPath, 'utf-8')
    return content
  } catch (error) {
    console.error('读取配置文件失败:', error)
    throw new Error('读取配置文件失败')
  }
})

// 保存应用配置文件内容
ipcMain.handle('save-app-config-file', async (_, content: string) => {
  try {
    // 验证 JSON 格式
    const parsed = JSON.parse(content)

    // 保存到文件
    const configPath = store.path
    fs.writeFileSync(configPath, content, 'utf-8')

    // 重新加载 store
    store.store = parsed
  } catch (error) {
    console.error('保存配置文件失败:', error)
    if (error instanceof SyntaxError) {
      throw new Error('JSON 格式错误')
    }
    throw new Error('保存配置文件失败')
  }
})

// 清除所有应用缓存（清理 APP_CACHE_DIR 下的所有内容）
ipcMain.handle('clear-cache', async () => {
  try {
    let deletedCount = 0

    if (fs.existsSync(APP_CACHE_DIR)) {
      // 遍历并删除缓存目录下的所有内容
      const entries = fs.readdirSync(APP_CACHE_DIR)
      for (const entry of entries) {
        const entryPath = path.join(APP_CACHE_DIR, entry)
        fs.rmSync(entryPath, { recursive: true, force: true })
        deletedCount++
      }
    }

    // 确保缓存目录本身仍然存在（应用可能还需要写入）
    if (!fs.existsSync(APP_CACHE_DIR)) {
      fs.mkdirSync(APP_CACHE_DIR, { recursive: true })
    }

    return { success: true, deletedCount }
  } catch (error) {
    console.error('清除缓存失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 清除所有缓存（本项目涉及的所有资源：history.jsonl、projects、image-cache、paste-cache、应用缓存）
ipcMain.handle('clear-all-cache', async () => {
  try {
    // 先停止文件监控，避免清理过程中触发事件
    stopHistoryMonitor()

    const result = {
      historyCleared: false,
      projectsCleared: false,
      imageCacheCleared: false,
      pasteCacheCleared: false,
      appCacheCleared: false
    }

    // 1. 清空 history.jsonl
    if (fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, '', 'utf-8')
      result.historyCleared = true
    }

    // 2. 清除 ~/.claude/projects/
    const projectsDir = PROJECTS_DIR
    if (fs.existsSync(projectsDir)) {
      fs.rmSync(projectsDir, { recursive: true, force: true })
      fs.mkdirSync(projectsDir, { recursive: true })
      result.projectsCleared = true
    }

    // 3. 清除 ~/.claude/image-cache/
    const imageCacheDir = path.join(CLAUDE_DIR, 'image-cache')
    if (fs.existsSync(imageCacheDir)) {
      fs.rmSync(imageCacheDir, { recursive: true, force: true })
      fs.mkdirSync(imageCacheDir, { recursive: true })
      result.imageCacheCleared = true
    }

    // 4. 清除 ~/.claude/paste-cache/
    const pasteCacheDir = path.join(CLAUDE_DIR, 'paste-cache')
    if (fs.existsSync(pasteCacheDir)) {
      fs.rmSync(pasteCacheDir, { recursive: true, force: true })
      fs.mkdirSync(pasteCacheDir, { recursive: true })
      result.pasteCacheCleared = true
    }

    // 5. 清除应用内部缓存
    if (fs.existsSync(APP_CACHE_DIR)) {
      const entries = fs.readdirSync(APP_CACHE_DIR)
      for (const entry of entries) {
        const entryPath = path.join(APP_CACHE_DIR, entry)
        fs.rmSync(entryPath, { recursive: true, force: true })
      }
      result.appCacheCleared = true
    }
    if (!fs.existsSync(APP_CACHE_DIR)) {
      fs.mkdirSync(APP_CACHE_DIR, { recursive: true })
    }

    // 重置文件监控位置并重新启动
    lastFileSize = 0
    startHistoryMonitor()

    return { success: true, result }
  } catch (error) {
    console.error('[清除缓存] 失败:', error)
    try {
      startHistoryMonitor()
    } catch (_) {
      /* ignore */
    }
    return { success: false, error: (error as Error).message }
  }
})

/**
 * 按时间范围清理所有对话资源（统一清理逻辑）
 * 清理范围：history.jsonl（过期条目）、projects（过期会话）、image-cache、paste-cache、APP_CACHE_DIR/images
 */
const cleanupByAge = (retainMs: number): number => {
  const cutoffTime = Date.now() - retainMs
  let deletedCount = 0

  // 1. 清理 history.jsonl 中过期的条目
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const content = fs.readFileSync(HISTORY_FILE, 'utf-8')
      const lines = content.split('\n').filter((line: string) => line.trim())
      const retainedLines: string[] = []

      for (const line of lines) {
        try {
          const record = JSON.parse(line)
          let timestamp: number
          if (typeof record.timestamp === 'number') {
            timestamp = record.timestamp < 1e12 ? record.timestamp * 1000 : record.timestamp
          } else if (typeof record.timestamp === 'string') {
            timestamp = new Date(record.timestamp).getTime()
          } else {
            retainedLines.push(line) // 无法解析时间戳的条目保留
            continue
          }
          if (isNaN(timestamp) || timestamp >= cutoffTime) {
            retainedLines.push(line)
          } else {
            deletedCount++
          }
        } catch {
          retainedLines.push(line) // 无法解析的行保留
        }
      }

      if (retainedLines.length < lines.length) {
        fs.writeFileSync(
          HISTORY_FILE,
          retainedLines.join('\n') + (retainedLines.length > 0 ? '\n' : ''),
          'utf-8'
        )
      }
    } catch (err) {
      console.error('[清理] history.jsonl 清理失败:', err)
    }
  }

  // 2. 清理 ~/.claude/projects/ 中过期的会话文件
  const projectsDir = PROJECTS_DIR
  if (fs.existsSync(projectsDir)) {
    try {
      const projectFolders = fs.readdirSync(projectsDir)
      for (const folder of projectFolders) {
        const folderPath = path.join(projectsDir, folder)
        if (!fs.statSync(folderPath).isDirectory()) continue

        const files = fs.readdirSync(folderPath)
        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          const filePath = path.join(folderPath, file)
          const stat = fs.statSync(filePath)
          if (stat.mtimeMs < cutoffTime) {
            fs.rmSync(filePath, { force: true })
            deletedCount++
          }
        }

        // 如果文件夹为空，删除文件夹
        const remaining = fs.readdirSync(folderPath)
        if (remaining.length === 0) {
          fs.rmSync(folderPath, { recursive: true, force: true })
        }
      }
    } catch (err) {
      console.error('[清理] projects 清理失败:', err)
    }
  }

  // 3. 清理 ~/.claude/image-cache/ 中过期的内容
  const imageCacheDir = path.join(CLAUDE_DIR, 'image-cache')
  if (fs.existsSync(imageCacheDir)) {
    try {
      const entries = fs.readdirSync(imageCacheDir)
      for (const entry of entries) {
        const entryPath = path.join(imageCacheDir, entry)
        const stat = fs.statSync(entryPath)
        if (stat.mtimeMs < cutoffTime) {
          fs.rmSync(entryPath, { recursive: true, force: true })
          deletedCount++
        }
      }
    } catch (err) {
      console.error('[清理] image-cache 清理失败:', err)
    }
  }

  // 4. 清理 ~/.claude/paste-cache/ 中过期的内容
  const pasteCacheDir = path.join(CLAUDE_DIR, 'paste-cache')
  if (fs.existsSync(pasteCacheDir)) {
    try {
      const entries = fs.readdirSync(pasteCacheDir)
      for (const entry of entries) {
        const entryPath = path.join(pasteCacheDir, entry)
        const stat = fs.statSync(entryPath)
        if (stat.mtimeMs < cutoffTime) {
          fs.rmSync(entryPath, { recursive: true, force: true })
          deletedCount++
        }
      }
    } catch (err) {
      console.error('[清理] paste-cache 清理失败:', err)
    }
  }

  // 5. 清理应用内部图片缓存
  const appImagesDir = path.join(APP_CACHE_DIR, 'images')
  if (fs.existsSync(appImagesDir)) {
    try {
      const sessionDirs = fs.readdirSync(appImagesDir)
      for (const sessionDir of sessionDirs) {
        const sessionDirPath = path.join(appImagesDir, sessionDir)
        const stat = fs.statSync(sessionDirPath)
        if (stat.isDirectory() && stat.mtimeMs < cutoffTime) {
          fs.rmSync(sessionDirPath, { recursive: true, force: true })
          deletedCount++
        }
      }
    } catch (err) {
      console.error('[清理] APP_CACHE_DIR/images 清理失败:', err)
    }
  }

  return deletedCount
}

// 按时间范围清理所有对话资源
ipcMain.handle('clear-cache-by-age', async (_, retainMs: number) => {
  try {
    const deletedCount = cleanupByAge(retainMs)
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

    const deletedCount = cleanupByAge(config.retainMs)

    // 更新下次清理时间
    const newNextCleanupTime = Date.now() + config.intervalMs
    store.set('autoCleanup.lastCleanupTime', Date.now())
    store.set('autoCleanup.nextCleanupTime', newNextCleanupTime)

    setupAutoCleanupTimer()

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-cleanup-executed', {
        deletedCount,
        nextCleanupTime: newNextCleanupTime
      })
    }

    return { success: true, deletedCount, nextCleanupTime: newNextCleanupTime }
  } catch (error) {
    console.error('[手动清理] 执行失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

/**
 * 自动清理缓存定时器管理
 * 启动、停止和执行自动清理任务
 */
const setupAutoCleanupTimer = () => {
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
  if (!autoCleanup || !autoCleanup.enabled) {
    return
  }

  const now = Date.now()

  // 确定下次清理时间
  let nextCleanupTime = autoCleanup.nextCleanupTime
  if (!nextCleanupTime || nextCleanupTime <= now) {
    nextCleanupTime = now + autoCleanup.intervalMs
    store.set('autoCleanup.nextCleanupTime', nextCleanupTime)
  }

  // 执行清理的函数（清理所有对话资源）
  const executeCleanup = async () => {
    try {
      const config = store.get('autoCleanup', null) as any
      if (!config || !config.enabled) return

      const deletedCount = cleanupByAge(config.retainMs)

      // 更新状态
      const newNextCleanupTime = Date.now() + config.intervalMs
      store.set('autoCleanup.lastCleanupTime', Date.now())
      store.set('autoCleanup.nextCleanupTime', newNextCleanupTime)

      // 通知渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-cleanup-executed', {
          deletedCount,
          nextCleanupTime: newNextCleanupTime
        })
      }

      scheduleNextCleanup(config.intervalMs)
    } catch (error) {
      console.error('[自动清理] 执行失败:', error)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-cleanup-error', {
          error: (error as Error).message
        })
      }
      // 即使失败也要调度下次清理
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

  // 计算首次执行的延���
  const initialDelay = Math.max(0, nextCleanupTime - now)

  // 设置首次执行
  setTimeout(executeCleanup, initialDelay)

  // 每秒向渲染进程发送倒计时更新
  autoCleanupTickTimer = setInterval(() => {
    const currentConfig = store.get('autoCleanup', null) as any
    if (!currentConfig || !currentConfig.enabled) {
      // 配置已禁用，停止发送更新
      if (autoCleanupTickTimer) {
        clearInterval(autoCleanupTickTimer)
        autoCleanupTickTimer = null
      }
      return
    }

    const currentNextTime = currentConfig.nextCleanupTime
    if (!currentNextTime) return

    const remaining = Math.max(0, currentNextTime - Date.now())

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-cleanup-tick', {
        nextCleanupTime: currentNextTime,
        remainingMs: remaining
      })
    } else if (mainWindow && mainWindow.isDestroyed()) {
      console.warn('[自动清理] 主窗口已销毁，无法发送倒计时更新')
    }
  }, 1000)

}

// 卸载应用
ipcMain.handle('uninstall-app', async () => {
  try {
    // 停止文件监控
    stopHistoryMonitor()

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
          // 只删除备份文件，保留 settings.json 和 history.jsonl
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
      // 继续执行，不阻断卸载流程
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

// 打开开发者工具
ipcMain.handle('open-devtools', async () => {
  try {
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

// 读取图片文件（返回 base64，从应用内部缓存目录读取）
ipcMain.handle('read-image', async (_, imagePath: string) => {
  try {
    const fullPath = path.join(APP_CACHE_DIR, imagePath)

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

// ==================== Claude Code 配置备份管理 ====================

// 提取配置信息
function extractConfigInfo(configContent: string): {
  model?: string
  baseUrl?: string
  hasApiKey: boolean
} {
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

// 获取备份文件路径
function getBackupFilePath(id: number): string {
  return path.join(CLAUDE_DIR, `settings.backup-${id}.json`)
}

// 列出所有备份
ipcMain.handle('list-claude-config-backups', async () => {
  try {
    const backups = store.get('claudeConfigBackups', []) as any[]

    // 验证备份文件是否存在，并更新自动识别信息
    const validBackups = backups.filter(backup => {
      const filePath = getBackupFilePath(backup.id)
      if (!fs.existsSync(filePath)) {
        return false
      }

      // 更新自动识别信息
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        backup.autoDetectedInfo = extractConfigInfo(content)
      } catch {
        // 忽略读取错误
      }

      return true
    })

    // 保存清理后的备份列表
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

    // 读取当前配置
    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')

    // 验证 JSON 格式
    JSON.parse(content)

    // 获取现有备份列表
    const backups = store.get('claudeConfigBackups', []) as any[]

    // 生成新的备份ID
    const maxId = backups.length > 0 ? Math.max(...backups.map(b => b.id)) : 0
    const newId = maxId + 1

    // 创建备份文件
    const backupFilePath = getBackupFilePath(newId)
    fs.writeFileSync(backupFilePath, content, 'utf-8')

    // 创建备份元数据
    const backup = {
      id: newId,
      name: name || `备份 ${newId}`,
      autoDetectedInfo: extractConfigInfo(content),
      isActive: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    // 保存到 store
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

    if (!backup) {
      return { success: false, error: '备份不存在' }
    }

    if (backup.isActive) {
      return { success: false, error: '无法删除当前激活的配置' }
    }

    // 删除备份文件
    const backupFilePath = getBackupFilePath(id)
    if (fs.existsSync(backupFilePath)) {
      fs.unlinkSync(backupFilePath)
    }

    // 从 store 中移除
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

    if (!targetBackup) {
      return { success: false, error: '备份不存在' }
    }

    const backupFilePath = getBackupFilePath(id)
    if (!fs.existsSync(backupFilePath)) {
      return { success: false, error: '备份文件不存在' }
    }

    // 读取目标备份内容
    const backupContent = fs.readFileSync(backupFilePath, 'utf-8')

    // 验证 JSON 格式
    JSON.parse(backupContent)

    // 如果当前有激活的备份，取消激活状态
    const currentActive = backups.find(b => b.isActive)
    if (currentActive) {
      currentActive.isActive = false
    }

    // 将当前 settings.json 保存为备份（如果不是从备份切换来的）
    if (!currentActive && fs.existsSync(SETTINGS_FILE)) {
      const currentContent = fs.readFileSync(SETTINGS_FILE, 'utf-8')

      // 生成新的备份ID
      const maxId = backups.length > 0 ? Math.max(...backups.map(b => b.id)) : 0
      const newId = maxId + 1

      // 创建备份文件
      const newBackupFilePath = getBackupFilePath(newId)
      fs.writeFileSync(newBackupFilePath, currentContent, 'utf-8')

      // 创建备份元数据
      const newBackup = {
        id: newId,
        name: `切换前的配置`,
        autoDetectedInfo: extractConfigInfo(currentContent),
        isActive: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      backups.push(newBackup)
    }

    // 将目标备份内容写入 settings.json
    fs.writeFileSync(SETTINGS_FILE, backupContent, 'utf-8')

    // 标记为激活状态
    targetBackup.isActive = true
    targetBackup.updatedAt = Date.now()

    // 保存到 store
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

    if (!backup) {
      return { success: false, error: '备份不存在' }
    }

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
    const backupFilePath = getBackupFilePath(id)

    if (!fs.existsSync(backupFilePath)) {
      return { success: false, error: '备份文件不存在' }
    }

    const content = fs.readFileSync(backupFilePath, 'utf-8')
    return { success: true, config: content }
  } catch (error) {
    console.error('读取备份配置失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// ==================== MCP/Skills/Plugins 管理 ====================

// Cursor MCP 配置文件路径
const CURSOR_MCP_FILE = path.join(os.homedir(), '.cursor', 'mcp.json')

// 获取 MCP 服务器列表（同时读取 Claude Code 和 Cursor IDE 配置）
ipcMain.handle('get-mcp-servers', async () => {
  try {
    const servers: Array<{
      name: string
      command: string
      args: string[]
      env?: Record<string, string>
      cwd?: string
      url?: string
      source: 'claude' | 'cursor'
    }> = []

    // 读取 Claude Code 的 MCP 配置（~/.claude/settings.json）
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
        const config = JSON.parse(content)
        const mcpServers = config.mcpServers || {}

        Object.entries(mcpServers).forEach(([name, serverConfig]) => {
          const cfg = serverConfig as Record<string, any>
          servers.push({
            name,
            command: cfg.command || '',
            args: cfg.args || [],
            env: cfg.env,
            cwd: cfg.cwd,
            url: cfg.url,
            source: 'claude'
          })
        })
      } catch (e) {
        console.error('解析 Claude settings.json 失败:', e)
      }
    }

    // 读取 Cursor IDE 的 MCP 配置（~/.cursor/mcp.json）
    if (fs.existsSync(CURSOR_MCP_FILE)) {
      try {
        const content = fs.readFileSync(CURSOR_MCP_FILE, 'utf-8')
        const config = JSON.parse(content)
        const mcpServers = config.mcpServers || {}

        Object.entries(mcpServers).forEach(([name, serverConfig]) => {
          const cfg = serverConfig as Record<string, any>
          servers.push({
            name,
            command: cfg.command || '',
            args: cfg.args || [],
            env: cfg.env,
            cwd: cfg.cwd,
            url: cfg.url,
            source: 'cursor'
          })
        })
      } catch (e) {
        console.error('解析 Cursor mcp.json 失败:', e)
      }
    }

    return { success: true, servers }
  } catch (error) {
    console.error('读取 MCP 服务器失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 保存 MCP 服务器
ipcMain.handle(
  'save-mcp-server',
  async (_, name: string, serverConfig: { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }) => {
    try {
      let config: Record<string, any> = {}
      if (fs.existsSync(SETTINGS_FILE)) {
        const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
        config = JSON.parse(content)
      }

      if (!config.mcpServers) {
        config.mcpServers = {}
      }

      config.mcpServers[name] = {
        command: serverConfig.command,
        ...(serverConfig.args && serverConfig.args.length > 0 && { args: serverConfig.args }),
        ...(serverConfig.env && Object.keys(serverConfig.env).length > 0 && { env: serverConfig.env }),
        ...(serverConfig.cwd && { cwd: serverConfig.cwd })
      }

      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), 'utf-8')
      return { success: true }
    } catch (error) {
      console.error('保存 MCP 服务器失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }
)

// 删除 MCP 服务器（旧版，仅删除 Claude 配置）
ipcMain.handle('delete-mcp-server', async (_, name: string) => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { success: false, error: '配置文件不存在' }
    }

    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
    const config = JSON.parse(content)

    if (!config.mcpServers || !config.mcpServers[name]) {
      return { success: false, error: 'MCP 服务器不存在' }
    }

    delete config.mcpServers[name]
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('删除 MCP 服务器失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// ==================== MCP 市场功能 ====================

// MCP Registry API 端点
const MCP_REGISTRY_API = 'https://prod.registry.modelcontextprotocol.io/v0.1/servers'

// 获取 MCP 市场列表
ipcMain.handle(
  'fetch-mcp-market',
  async (_, params: { search?: string; limit?: number; cursor?: string }) => {
    try {
      const { search, limit = 30, cursor } = params
      const url = new URL(MCP_REGISTRY_API)
      url.searchParams.set('limit', String(limit))
      if (search) url.searchParams.set('search', search)
      if (cursor) url.searchParams.set('cursor', cursor)

      const response = await fetch(url.toString())
      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`)
      }

      const data = (await response.json()) as {
        servers?: Array<{
          server: Record<string, any>
          _meta?: Record<string, any>
        }>
        metadata?: {
          nextCursor?: string
          count?: number
        }
      }

      // 解析服务器列表
      const servers = (data.servers || []).map(
        (item: { server: Record<string, any>; _meta?: Record<string, any> }) => {
          const server = item.server
          const meta = item._meta?.['io.modelcontextprotocol.registry/official'] || {}

          return {
            name: server.name || '',
            title: server.title || server.name?.split('/').pop() || '',
            description: server.description || '',
            version: server.version || '',
            repositoryUrl: server.repository?.url,
            packages: server.packages?.map((pkg: Record<string, any>) => ({
              registryType: pkg.registryType || 'npm',
              identifier: pkg.identifier || '',
              transport: pkg.transport,
              environmentVariables: pkg.environmentVariables
            })),
            remotes: server.remotes?.map((remote: Record<string, any>) => ({
              type: remote.type || 'streamable-http',
              url: remote.url || ''
            })),
            isOfficial: meta.status === 'active',
            publishedAt: meta.publishedAt
          }
        }
      )

      return {
        success: true,
        result: {
          servers,
          nextCursor: data.metadata?.nextCursor,
          count: data.metadata?.count || servers.length
        }
      }
    } catch (error) {
      console.error('获取 MCP 市场失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }
)

// 安装 MCP 服务器到配置文件
ipcMain.handle(
  'install-mcp-server',
  async (
    _,
    name: string,
    config: { command?: string; args?: string[]; env?: Record<string, string>; url?: string },
    target: 'claude' | 'cursor'
  ) => {
    try {
      const targetFile = target === 'claude' ? SETTINGS_FILE : CURSOR_MCP_FILE

      // 确保目录存在
      const targetDir = path.dirname(targetFile)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      // 读取现有配置
      let fileConfig: Record<string, any> = {}
      if (fs.existsSync(targetFile)) {
        const content = fs.readFileSync(targetFile, 'utf-8')
        fileConfig = JSON.parse(content)
      }

      // 确保 mcpServers 字段存在
      if (!fileConfig.mcpServers) {
        fileConfig.mcpServers = {}
      }

      // 构建服务器配置
      const serverConfig: Record<string, any> = {}
      if (config.url) {
        serverConfig.url = config.url
      } else {
        if (config.command) serverConfig.command = config.command
        if (config.args && config.args.length > 0) serverConfig.args = config.args
        if (config.env && Object.keys(config.env).length > 0) serverConfig.env = config.env
      }

      // 添加服务器
      fileConfig.mcpServers[name] = serverConfig

      // 写入文件
      fs.writeFileSync(targetFile, JSON.stringify(fileConfig, null, 2), 'utf-8')

      return { success: true }
    } catch (error) {
      console.error('安装 MCP 服务器失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }
)

// 卸载 MCP 服务器
ipcMain.handle('uninstall-mcp-server', async (_, name: string, source: 'claude' | 'cursor') => {
  try {
    const targetFile = source === 'claude' ? SETTINGS_FILE : CURSOR_MCP_FILE

    if (!fs.existsSync(targetFile)) {
      return { success: false, error: '配置文件不存在' }
    }

    const content = fs.readFileSync(targetFile, 'utf-8')
    const config = JSON.parse(content)

    if (!config.mcpServers || !config.mcpServers[name]) {
      return { success: false, error: 'MCP 服务器不存在' }
    }

    delete config.mcpServers[name]
    fs.writeFileSync(targetFile, JSON.stringify(config, null, 2), 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('卸载 MCP 服务器失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 更新 MCP 服务器配置
ipcMain.handle(
  'update-mcp-server',
  async (
    _,
    name: string,
    config: { command?: string; args?: string[]; env?: Record<string, string>; url?: string },
    source: 'claude' | 'cursor'
  ) => {
    try {
      const targetFile = source === 'claude' ? SETTINGS_FILE : CURSOR_MCP_FILE

      if (!fs.existsSync(targetFile)) {
        return { success: false, error: '配置文件不存在' }
      }

      const content = fs.readFileSync(targetFile, 'utf-8')
      const fileConfig = JSON.parse(content)

      if (!fileConfig.mcpServers) {
        return { success: false, error: 'MCP 服务器配置不存在' }
      }

      // 构建服务器配置
      const serverConfig: Record<string, any> = {}
      if (config.url) {
        serverConfig.url = config.url
      } else {
        if (config.command) serverConfig.command = config.command
        if (config.args && config.args.length > 0) serverConfig.args = config.args
        if (config.env && Object.keys(config.env).length > 0) serverConfig.env = config.env
      }

      // 更新服务器配置
      fileConfig.mcpServers[name] = serverConfig

      fs.writeFileSync(targetFile, JSON.stringify(fileConfig, null, 2), 'utf-8')

      return { success: true }
    } catch (error) {
      console.error('更新 MCP 服务器失败:', error)
      return { success: false, error: (error as Error).message }
    }
  }
)

// 获取 Skills 列表
ipcMain.handle('get-claude-skills', async () => {
  try {
    const skillsDir = path.join(CLAUDE_DIR, 'skills')
    if (!fs.existsSync(skillsDir)) {
      return { success: true, skills: [] }
    }

    const skills: Array<{ name: string; path: string; description?: string; files: string[] }> = []
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(skillsDir, entry.name)
        const files = fs.readdirSync(skillPath).filter(f => !f.startsWith('.'))

        let description: string | undefined
        const skillMdPath = path.join(skillPath, 'SKILL.md')
        if (fs.existsSync(skillMdPath)) {
          const mdContent = fs.readFileSync(skillMdPath, 'utf-8')
          const descMatch = mdContent.match(/description:\s*(.+)/i)
          if (descMatch) {
            description = descMatch[1].trim()
          } else {
            const lines = mdContent.split('\n').filter(l => l.trim())
            if (lines.length > 0) {
              description = lines[0].replace(/^#\s*/, '').substring(0, 100)
            }
          }
        }

        skills.push({ name: entry.name, path: skillPath, description, files })
      }
    }

    return { success: true, skills }
  } catch (error) {
    console.error('读取 Skills 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 获取 Plugins 列表
ipcMain.handle('get-claude-plugins', async () => {
  try {
    const pluginsFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json')
    if (!fs.existsSync(pluginsFile)) {
      return { success: true, plugins: [] }
    }

    const content = fs.readFileSync(pluginsFile, 'utf-8')
    const pluginsData = JSON.parse(content)

    const plugins: Array<{ name: string; version?: string; enabled: boolean; description?: string; installPath?: string }> =
      []

    // 读取 settings.json 获取 enabledPlugins
    let enabledPlugins: Record<string, boolean> = {}
    if (fs.existsSync(SETTINGS_FILE)) {
      try {
        const settingsContent = fs.readFileSync(SETTINGS_FILE, 'utf-8')
        const settings = JSON.parse(settingsContent)
        enabledPlugins = settings.enabledPlugins || {}
      } catch {
        // 忽略解析错误
      }
    }

    // 新版格式: { version: 2, plugins: { "pluginName@marketplace": [{ ... }] } }
    if (pluginsData.plugins && typeof pluginsData.plugins === 'object') {
      for (const [pluginKey, pluginVersions] of Object.entries(pluginsData.plugins)) {
        const pluginName = pluginKey.split('@')[0]
        const versions = pluginVersions as Array<Record<string, any>>
        if (versions.length > 0) {
          const latestVersion = versions[versions.length - 1]
          plugins.push({
            name: pluginName,
            version: latestVersion.version,
            enabled: enabledPlugins[pluginKey] === true,
            installPath: latestVersion.installPath
          })
        }
      }
    }
    // 兼容旧版格式（数组）
    else if (Array.isArray(pluginsData)) {
      for (const plugin of pluginsData) {
        plugins.push({
          name: plugin.name || plugin.id || 'Unknown',
          version: plugin.version,
          enabled: plugin.enabled !== false,
          description: plugin.description
        })
      }
    }

    return { success: true, plugins }
  } catch (error) {
    console.error('读取 Plugins 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 删除 Skill
ipcMain.handle('delete-claude-skill', async (_, name: string) => {
  try {
    const skillPath = path.join(CLAUDE_DIR, 'skills', name)
    if (!fs.existsSync(skillPath)) {
      return { success: false, error: 'Skill 不存在' }
    }

    // 删除整个 Skill 文件夹
    fs.rmSync(skillPath, { recursive: true, force: true })

    return { success: true }
  } catch (error) {
    console.error('删除 Skill 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 创建新 Skill
ipcMain.handle('create-claude-skill', async (_, name: string, description: string, content?: string) => {
  try {
    const skillsDir = path.join(CLAUDE_DIR, 'skills')
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true })
    }

    const skillPath = path.join(skillsDir, name)
    if (fs.existsSync(skillPath)) {
      return { success: false, error: 'Skill 已存在' }
    }

    // 创建 Skill 文件夹
    fs.mkdirSync(skillPath, { recursive: true })

    // 创建 SKILL.md 文件（支持自定义内容）
    const skillMdContent = content || `---
name: ${name}
description: ${description}
---

# ${name}

## 使用说明

在此编写 Skill 的详细说明和使用示例。

## 示例

\`\`\`typescript
// 示例代码
\`\`\`
`

    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skillMdContent, 'utf-8')

    return { success: true, skillPath }
  } catch (error) {
    console.error('创建 Skill 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 读取 Skill 内容
ipcMain.handle('read-claude-skill-content', async (_, name: string) => {
  try {
    const skillPath = path.join(CLAUDE_DIR, 'skills', name, 'SKILL.md')
    if (!fs.existsSync(skillPath)) {
      return { success: false, error: 'SKILL.md 文件不存在' }
    }

    const content = fs.readFileSync(skillPath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    console.error('读取 Skill 内容失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 更新 Skill
ipcMain.handle('update-claude-skill', async (_, name: string, _description: string, content: string) => {
  try {
    const skillPath = path.join(CLAUDE_DIR, 'skills', name)
    if (!fs.existsSync(skillPath)) {
      return { success: false, error: 'Skill 不存在' }
    }

    // 更新 SKILL.md 文件
    fs.writeFileSync(path.join(skillPath, 'SKILL.md'), content, 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('更新 Skill 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 切换 Plugin 启用/禁用
ipcMain.handle('toggle-claude-plugin', async (_, name: string, enabled: boolean) => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { success: false, error: '配置文件不存在' }
    }

    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(content)

    if (!settings.enabledPlugins) {
      settings.enabledPlugins = {}
    }

    // 查找完整的 pluginKey (name@marketplace)
    const pluginsFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json')
    if (fs.existsSync(pluginsFile)) {
      const pluginsContent = fs.readFileSync(pluginsFile, 'utf-8')
      const pluginsData = JSON.parse(pluginsContent)
      if (pluginsData.plugins) {
        for (const pluginKey of Object.keys(pluginsData.plugins)) {
          if (pluginKey.startsWith(name + '@') || pluginKey === name) {
            settings.enabledPlugins[pluginKey] = enabled
            break
          }
        }
      }
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('切换 Plugin 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 卸载 Plugin
ipcMain.handle('uninstall-claude-plugin', async (_, name: string) => {
  try {
    const pluginsFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json')
    if (!fs.existsSync(pluginsFile)) {
      return { success: false, error: '插件文件不存在' }
    }

    const content = fs.readFileSync(pluginsFile, 'utf-8')
    const pluginsData = JSON.parse(content)

    if (pluginsData.plugins) {
      let foundKey: string | null = null
      for (const pluginKey of Object.keys(pluginsData.plugins)) {
        if (pluginKey.startsWith(name + '@') || pluginKey === name) {
          foundKey = pluginKey
          break
        }
      }

      if (foundKey) {
        // 获取安装路径以便清理
        const versions = pluginsData.plugins[foundKey] as Array<Record<string, any>>
        const installPaths = versions.map(v => v.installPath).filter(Boolean)

        // 删除 plugins 数据
        delete pluginsData.plugins[foundKey]
        fs.writeFileSync(pluginsFile, JSON.stringify(pluginsData, null, 2), 'utf-8')

        // 从 settings.json 中移除 enabledPlugins
        if (fs.existsSync(SETTINGS_FILE)) {
          const settingsContent = fs.readFileSync(SETTINGS_FILE, 'utf-8')
          const settings = JSON.parse(settingsContent)
          if (settings.enabledPlugins && settings.enabledPlugins[foundKey]) {
            delete settings.enabledPlugins[foundKey]
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
          }
        }

        // 清理安装目录
        for (const installPath of installPaths) {
          if (installPath && fs.existsSync(installPath)) {
            try {
              fs.rmSync(installPath, { recursive: true, force: true })
            } catch {
              // 忽略清理错误
            }
          }
        }
      }
    }

    return { success: true }
  } catch (error) {
    console.error('卸载 Plugin 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 获取 Hooks 配置（从 settings.json 读取）
ipcMain.handle('get-claude-hooks', async () => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { success: true, hooks: [] }
    }

    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(content)

    const hooks: Array<Record<string, any>> = []

    if (settings.hooks && typeof settings.hooks === 'object') {
      for (const [eventType, matcherGroups] of Object.entries(settings.hooks)) {
        if (!Array.isArray(matcherGroups)) continue
        for (const group of matcherGroups as Array<Record<string, any>>) {
          const handlers = group.hooks || []
          for (const handler of handlers) {
            hooks.push({
              type: eventType,
              matcher: group.matcher || undefined,
              handlerType: handler.type || 'command',
              command: handler.command || undefined,
              prompt: handler.prompt || undefined,
              timeout: handler.timeout || undefined,
              async: handler.async || false,
              enabled: true
            })
          }
        }
      }
    }

    return { success: true, hooks }
  } catch (error) {
    console.error('读取 Hooks 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 保存 Hook 配置（写入 settings.json）
ipcMain.handle('save-claude-hook', async (_, type: string, config: Record<string, any>) => {
  try {
    let settings: Record<string, any> = {}
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      settings = JSON.parse(content)
    }

    if (!settings.hooks) {
      settings.hooks = {}
    }

    // 构建 handler
    const handler: Record<string, any> = {
      type: config.handlerType || 'command'
    }

    if (handler.type === 'command') {
      if (config.command) handler.command = config.command
      if (config.async) handler.async = true
    } else {
      if (config.prompt) handler.prompt = config.prompt
    }

    if (config.timeout) handler.timeout = config.timeout

    // 构建 matcher group
    const matcherGroup: Record<string, any> = {
      hooks: [handler]
    }

    if (config.matcher) {
      matcherGroup.matcher = config.matcher
    }

    // 如果已存在同类型的 hook，先移除旧的再添加
    if (!settings.hooks[type]) {
      settings.hooks[type] = []
    }

    // 简单替换: 移除旧的同 matcher 的，添加新的
    const existingGroups = settings.hooks[type] as Array<Record<string, any>>
    const newGroups = existingGroups.filter(g => g.matcher !== (config.matcher || undefined))
    newGroups.push(matcherGroup)
    settings.hooks[type] = newGroups

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存 Hook 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 删除 Hook 配置（从 settings.json 移除）
ipcMain.handle('delete-claude-hook', async (_, type: string) => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return { success: true }
    }

    const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(content)

    if (settings.hooks && settings.hooks[type]) {
      delete settings.hooks[type]

      // 如果 hooks 为空则移除整个字段
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks
      }
    }

    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('删除 Hook 失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 导出完整配置
ipcMain.handle('export-claude-config', async () => {
  try {
    const { dialog } = require('electron')
    const result = await dialog.showSaveDialog({
      title: '导出 Claude Code 配置',
      defaultPath: path.join(app.getPath('downloads'), `claude-config-${Date.now()}.json`),
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: '用户取消' }
    }

    // 读取完整配置
    const configResult = await new Promise<any>((resolve) => {
      ipcMain.emit('get-claude-code-full-config', { reply: resolve } as any)
    })

    if (!configResult.success) {
      return { success: false, error: '读取配置失败' }
    }

    // 导出配置（包含元数据）
    const exportData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      config: configResult.config
    }

    fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf-8')

    return { success: true, filePath: result.filePath }
  } catch (error) {
    console.error('导出配置失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 导入配置
ipcMain.handle('import-claude-config', async (_, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在' }
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const importData = JSON.parse(content)

    if (!importData.config) {
      return { success: false, error: '配置文件格式错误' }
    }

    // 备份当前配置
    const backupDir = path.join(CLAUDE_DIR, 'backups')
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    const backupFile = path.join(backupDir, `settings-backup-${Date.now()}.json`)
    if (fs.existsSync(SETTINGS_FILE)) {
      fs.copyFileSync(SETTINGS_FILE, backupFile)
    }

    // 导入 settings.json
    if (importData.config.settings) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(importData.config.settings, null, 2), 'utf-8')
    }

    // 导入 hooks.json
    if (importData.config.hooks && importData.config.hooks.length > 0) {
      const hooksFile = path.join(CLAUDE_DIR, 'hooks.json')
      fs.writeFileSync(
        hooksFile,
        JSON.stringify({ hooks: importData.config.hooks }, null, 2),
        'utf-8'
      )
    }

    return { success: true }
  } catch (error) {
    console.error('导入配置失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 获取 Claude Code 完整配置
ipcMain.handle('get-claude-code-full-config', async () => {
  try {
    let settings: Record<string, any> = {}
    const mcpServers: Array<{
      name: string
      command: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string
      url?: string
      source: 'claude' | 'cursor'
    }> = []

    // 读取 Claude Code settings.json
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, 'utf-8')
      settings = JSON.parse(content)

      // 从 Claude settings.json 读取 MCP 服务器
      if (settings.mcpServers) {
        Object.entries(settings.mcpServers).forEach(([name, serverConfig]) => {
          const cfg = serverConfig as Record<string, any>
          mcpServers.push({
            name,
            command: cfg.command || '',
            args: cfg.args || [],
            env: cfg.env,
            cwd: cfg.cwd,
            url: cfg.url,
            source: 'claude'
          })
        })
      }
    }

    // 从 Cursor mcp.json 读取 MCP 服务器
    if (fs.existsSync(CURSOR_MCP_FILE)) {
      try {
        const content = fs.readFileSync(CURSOR_MCP_FILE, 'utf-8')
        const cursorConfig = JSON.parse(content)
        if (cursorConfig.mcpServers) {
          Object.entries(cursorConfig.mcpServers).forEach(([name, serverConfig]) => {
            const cfg = serverConfig as Record<string, any>
            mcpServers.push({
              name,
              command: cfg.command || '',
              args: cfg.args || [],
              env: cfg.env,
              cwd: cfg.cwd,
              url: cfg.url,
              source: 'cursor'
            })
          })
        }
      } catch (e) {
        console.error('解析 Cursor mcp.json 失败:', e)
      }
    }

    // 读取 Skills
    const skills: Array<{ name: string; path: string; description?: string; files: string[] }> = []
    const skillsDir = path.join(CLAUDE_DIR, 'skills')
    if (fs.existsSync(skillsDir)) {
      const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(skillsDir, entry.name)
          const files = fs.readdirSync(skillPath).filter(f => !f.startsWith('.'))

          let description: string | undefined
          const skillMdPath = path.join(skillPath, 'SKILL.md')
          if (fs.existsSync(skillMdPath)) {
            const mdContent = fs.readFileSync(skillMdPath, 'utf-8')
            const descMatch = mdContent.match(/description:\s*(.+)/i)
            if (descMatch) {
              description = descMatch[1].trim()
            } else {
              const lines = mdContent.split('\n').filter(l => l.trim())
              if (lines.length > 0) {
                description = lines[0].replace(/^#\s*/, '').substring(0, 100)
              }
            }
          }

          skills.push({ name: entry.name, path: skillPath, description, files })
        }
      }
    }

    // 读取 Plugins（正确解析新版格式）
    const plugins: Array<{ name: string; version?: string; enabled: boolean; description?: string; installPath?: string }> =
      []
    const pluginsFile = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json')
    if (fs.existsSync(pluginsFile)) {
      const pluginsContent = fs.readFileSync(pluginsFile, 'utf-8')
      const pluginsData = JSON.parse(pluginsContent)

      // 新版格式: { version: 2, plugins: { "pluginName@marketplace": [{ ... }] } }
      if (pluginsData.plugins && typeof pluginsData.plugins === 'object') {
        const enabledPlugins = settings.enabledPlugins || {}

        for (const [pluginKey, pluginVersions] of Object.entries(pluginsData.plugins)) {
          // pluginKey 格式: "pluginName@marketplace"
          const pluginName = pluginKey.split('@')[0]

          // pluginVersions 是一个数组，取最新版本（第一个或最后一个）
          const versions = pluginVersions as Array<Record<string, any>>
          if (versions.length > 0) {
            const latestVersion = versions[versions.length - 1] // 取最新安装的版本
            plugins.push({
              name: pluginName,
              version: latestVersion.version,
              enabled: enabledPlugins[pluginKey] === true,
              installPath: latestVersion.installPath
            })
          }
        }
      }
      // 兼容旧版格式（数组）
      else if (Array.isArray(pluginsData)) {
        for (const plugin of pluginsData) {
          plugins.push({
            name: plugin.name || plugin.id || 'Unknown',
            version: plugin.version,
            enabled: plugin.enabled !== false,
            description: plugin.description
          })
        }
      }
    }

    // 读取 Hooks（从 settings.json 中读取）
    const hooks: Array<Record<string, any>> = []
    if (settings.hooks && typeof settings.hooks === 'object') {
      for (const [eventType, matcherGroups] of Object.entries(settings.hooks)) {
        if (!Array.isArray(matcherGroups)) continue
        for (const group of matcherGroups as Array<Record<string, any>>) {
          const handlers = group.hooks || []
          for (const handler of handlers) {
            hooks.push({
              type: eventType,
              matcher: group.matcher || undefined,
              handlerType: handler.type || 'command',
              command: handler.command || undefined,
              prompt: handler.prompt || undefined,
              timeout: handler.timeout || undefined,
              async: handler.async || false,
              enabled: true
            })
          }
        }
      }
    }

    return { success: true, config: { settings, mcpServers, skills, plugins, hooks } }
  } catch (error) {
    console.error('读取 Claude Code 完整配置失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// ==================== 常用命令管理 ====================

// 获取所有常用命令
ipcMain.handle('get-common-commands', async () => {
  try {
    const commands = store.get('commonCommands', []) as any[]
    return commands
  } catch (error) {
    console.error('获取常用命令失败:', error)
    return []
  }
})

// 添加常用命令
ipcMain.handle('add-common-command', async (_, name: string, content: string) => {
  try {
    const commands = store.get('commonCommands', []) as any[]
    // 计算新命令的 order：取当前最大 order + 1
    const maxOrder = commands.length > 0 ? Math.max(...commands.map(cmd => cmd.order || 0)) : -1

    const newCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      name,
      content,
      pinned: false,
      order: maxOrder + 1, // 新命令排在最后
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    commands.push(newCommand)
    store.set('commonCommands', commands)

    return { success: true, command: newCommand }
  } catch (error) {
    console.error('添加常用命令失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 更新常用命令
ipcMain.handle('update-common-command', async (_, id: string, name: string, content: string) => {
  try {
    const commands = store.get('commonCommands', []) as any[]
    const commandIndex = commands.findIndex(cmd => cmd.id === id)

    if (commandIndex === -1) {
      return { success: false, error: '命令不存在' }
    }

    commands[commandIndex] = {
      ...commands[commandIndex],
      name,
      content,
      updatedAt: Date.now()
    }

    store.set('commonCommands', commands)
    return { success: true }
  } catch (error) {
    console.error('更新常用命令失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 删除常用命令
ipcMain.handle('delete-common-command', async (_, id: string) => {
  try {
    const commands = store.get('commonCommands', []) as any[]
    const filteredCommands = commands.filter(cmd => cmd.id !== id)

    store.set('commonCommands', filteredCommands)
    return { success: true }
  } catch (error) {
    console.error('删除常用命令失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 切换置顶状态
ipcMain.handle('toggle-pin-command', async (_, id: string) => {
  try {
    const commands = store.get('commonCommands', []) as any[]
    const commandIndex = commands.findIndex(cmd => cmd.id === id)

    if (commandIndex === -1) {
      return { success: false, error: '命令不存在' }
    }

    commands[commandIndex] = {
      ...commands[commandIndex],
      pinned: !commands[commandIndex].pinned,
      updatedAt: Date.now()
    }

    store.set('commonCommands', commands)
    return { success: true }
  } catch (error) {
    console.error('切换置顶失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 打开常用命令配置文件
ipcMain.handle('open-common-commands-file', async () => {
  try {
    const configPath = store.path
    // 在默认编辑器中打开配置文件
    await shell.openPath(configPath)
    return { success: true }
  } catch (error) {
    console.error('打开配置文件失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 更新命令排序
ipcMain.handle('reorder-commands', async (_, commands: any[]) => {
  try {
    // 保存更新后的命令列表
    store.set('commonCommands', commands)
    return { success: true }
  } catch (error) {
    console.error('更新排序失败:', error)
    return { success: false, error: (error as Error).message }
  }
})

// ==================== AI 对话功能 ====================

// AI 对话流式响应
ipcMain.handle(
  'chat-stream',
  async (
    event,
    request: {
      messages: any[]
    }
  ) => {
    try {
      // 获取 AI 对话设置（简化版，只有三个字段）
      const aiChatSettings = store.get('aiChat') as any

      if (!aiChatSettings) {
        event.sender.send('chat-stream-error', 'AI 配置未找到，请前往设置页面配置')
        return
      }

      const { apiKey, apiBaseUrl, model } = aiChatSettings

      if (!apiKey || !apiBaseUrl || !model) {
        event.sender.send('chat-stream-error', 'AI 配置不完整，请填写 API Key、API 地址和模型名称')
        return
      }

      if (!request.messages || request.messages.length === 0) {
        event.sender.send('chat-stream-error', '消息不能为空')
        return
      }

      // 清理消息格式，只保留 role 和 content（API 不接受多余字段）
      const cleanedMessages = request.messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))

      // OpenAI 兼容格式的流式请求
      const response = await httpRequest<Response>({
        url: `${apiBaseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: cleanedMessages,
          temperature: 0.7,
          max_tokens: 4000,
          stream: true
        }),
        webContents: event.sender
      })

      if (!response.body || typeof response.body === 'string') {
        event.sender.send('chat-stream-error', '响应格式错误')
        return
      }

      let buffer = ''
      ;(response.body as any)
        .on('data', (chunk: Buffer) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() === '') continue
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()

              if (data === '[DONE]') {
                event.sender.send('chat-stream-complete')
                return
              }

              try {
                const json = JSON.parse(data)
                const content = json.choices?.[0]?.delta?.content
                if (content) {
                  event.sender.send('chat-stream-chunk', content)
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        })
        .on('end', () => {
          event.sender.send('chat-stream-complete')
        })
        .on('error', (error: Error) => {
          event.sender.send('chat-stream-error', error.message || '流式读取失败')
        })
    } catch (error: any) {
      event.sender.send('chat-stream-error', error.message || '对话失败')
    }
  }
)

// AI 格式化 Prompt（保持内容不变，转换为结构化 Markdown）
ipcMain.handle(
  'format-prompt',
  async (
    event,
    request: {
      content: string
      contentHash?: string // 用于缓存
    }
  ): Promise<{ success: boolean; formatted?: string; error?: string }> => {
    try {
      // 使用 AI 总结配置（格式化是轻量任务，用总结 API 更合适）
      const aiSummarySettings = store.get('aiSummary') as any

      // 检查 AI 配置是否存在
      if (!aiSummarySettings) {
        return { success: false, error: 'AI 配置不存在' }
      }

      // 检查缓存（包含 prompt 版本）
      const PROMPT_VERSION = 'v3' // 更新 prompt 版本以失效旧缓存（v3：增加表格预处理）
      if (request.contentHash) {
        const cacheKey = `formatted_${PROMPT_VERSION}_${request.contentHash}`
        const cached = store.get(cacheKey) as string | undefined
        if (cached) {
          return { success: true, formatted: cached }
        }
      }

      const provider: 'groq' | 'deepseek' | 'gemini' | 'custom' =
        aiSummarySettings.provider || 'groq'
      const currentConfig = aiSummarySettings.providers?.[provider]

      if (!currentConfig || !currentConfig.apiKey) {
        return { success: false, error: 'AI 配置不完整' }
      }

      // 🔧 预处理：修复单行表格格式（关键步骤）
      let processedContent = request.content

      // 检测单行表格模式：多个 | 字符且包含 --- 分隔符
      if (processedContent.includes('|') && processedContent.includes('---')) {
        // 正则匹配：| xxx | xxx | | --- | --- | | data | data |
        // 策略：在每个 " | | " 处添加换行符，将单行表格拆分为多行
        processedContent = processedContent
          .replace(/\|\s*\|\s*/g, '|\n|') // | | 替换为 |\n|
          .replace(/\n\s*\n/g, '\n') // 清理多余空行
      }

      // 构建格式化 system prompt
      const systemPrompt = `你是一个专业的 Markdown 格式化助手。请将用户提供的内容转换为结构化、美观的 Markdown 格式。

核心原则：
1. **内容保真** - 不修改、删除或添加任何实质性内容
2. **结构化呈现** - 合理使用 Markdown 语法组织内容
3. **表格优先** - 遇到表格相关内容（包含 | 字符），优先识别为表格并修复格式

格式化规则：

📝 **文本结构**
- 识别标题层级，使用 # ## ### 标记
- 列表内容使用 - 或 1. 2. 3. 格式
- 重要内容使用 **加粗** 或 *斜体*
- 引用内容使用 > 引用块

💻 **代码识别**
- 单行代码用 \`code\` 包裹
- 多行代码用 \`\`\`语言名 包裹
- 自动识别语言：javascript, typescript, python, json, bash, sql, html, css 等
- 保持代码缩进和换行

📊 **表格处理**（最高优先级！）
⚠️ 关键：如果内容包含多个 | 字符，极有可能是表格，必须按表格处理！

表格识别规则：
1. 识别格式错误的 Markdown 表格（单行挤压的表格）
2. 识别表格分隔符 | --- | --- | (可能在同一行)
3. 将单行表格拆分为多行，每个数据行独立

表格输出格式（强制要求）：
| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 数据1 | 数据2 | 数据3 |
| 数据4 | 数据5 | 数据6 |

修复步骤：
- 步骤1: 识别表头（第一组 | xxx | xxx | 之间的内容）
- 步骤2: 识别分隔符（| --- | --- | 或 | - | - |）
- 步骤3: 识别数据行（后续所有 | xxx | xxx | 之间的内容）
- 步骤4: 将每个部分独立成行，确保换行符正确

常见错误格式示例：
❌ 错误: | A | B | | --- | --- | | 数据1 | 数据2 | | 数据3 | 数据4 |
✅ 正确:
| A | B |
|---|---|
| 数据1 | 数据2 |
| 数据3 | 数据4 |

🔗 **链接和分隔**
- URL 转换为 [链接文本](URL) 格式
- 使用 --- 或 *** 添加分隔线（章节之间）

⚠️ **注意事项**
- 不要添加"以下是格式化后的内容"等说明
- 非表格内容保留原有的换行和空行
- 表格必须确保每一行（表头、分隔符、数据行）独占一行，即使原始内容是单行挤压的
- 如果内容已经是良好的 Markdown 且表格格式正确（每行独占一行），保持原样

示例 1 - 代码格式化：
输入：请帮我写一个函数 function add(a, b) { return a + b }
输出：
请帮我写一个函数

\`\`\`javascript
function add(a, b) {
  return a + b;
}
\`\`\`

示例 2 - 修复单行表格（关键！）：
输入：| 需求项 | 详情 | 确认 | | --- | --- | --- | | 接口返回数据 | 一次性返回 | | | 前端分页 | 数据处理 | |
输出：
| 需求项 | 详情 | 确认 |
|---------|--------|------|
| 接口返回数据 | 一次性返回 | ✓ |
| 前端分页 | 数据处理 | ✓ |

示例 3 - 表格格式化：
输入：需求项 | 详情 | 确认 接口返回所有数据 不再分页 前端实现分页功能 前端实现筛选功能
输出：
| 需求项 | 详情 | 确认 |
|--------|------|------|
| 接口返回所有数据 | 不再分页 | ✓ |
| 前端实现分页功能 | - | ✓ |
| 前端实现筛选功能 | - | ✓ |

示例 4 - 结构化内容：
输入：页面大优化需求 需求概述 页面地址：http://example.com 优化内容：接口返回所有数据 前端实现分页功能 前端实现筛选功能
输出：
# 页面大优化需求

## 需求概述

**页面地址**：http://example.com

**优化内容**：
- 接口返回所有数据，不再分页
- 前端实现分页功能
- 前端实现筛选功能
- 前端实现禁用启用的筛选功能`

      const timeout = aiSummarySettings.formatTimeout || 15000 // 默认15秒超时
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      let formatted = ''

      // Gemini 使用非流式模式
      if (provider === 'gemini') {
        const response = await httpRequest<Response>({
          url: `${currentConfig.apiBaseUrl}/models/${currentConfig.model}:generateContent?key=${currentConfig.apiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: systemPrompt + '\n\n--- 需要格式化的内容 ---\n\n' + processedContent
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.3, // 适中温度，平衡创造性和准确性
              maxOutputTokens: 4000
            }
          }),
          signal: controller.signal,
          webContents: event.sender
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          return { success: false, error: 'Gemini API 调用失败' }
        }

        const data = (await response.json()) as any
        formatted = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      } else {
        // OpenAI 兼容格式 (Groq, DeepSeek, 自定义)
        const response = await httpRequest<Response>({
          url: `${currentConfig.apiBaseUrl}/chat/completions`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentConfig.apiKey}`
          },
          body: JSON.stringify({
            model: currentConfig.model,
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: processedContent
              }
            ],
            temperature: 0.3, // 适中温度，平衡创造性和准确性
            max_tokens: 4000
          }),
          signal: controller.signal,
          webContents: event.sender
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          return { success: false, error: 'API 调用失败' }
        }

        const data = (await response.json()) as any
        formatted = data.choices?.[0]?.message?.content || ''
      }

      if (!formatted) {
        return { success: false, error: '格式化结果为空' }
      }

      // 缓存结果（包含版本号）
      if (request.contentHash) {
        const cacheKey = `formatted_${PROMPT_VERSION}_${request.contentHash}`
        store.set(cacheKey, formatted)
      }

      return { success: true, formatted: formatted.trim() }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { success: false, error: '格式化超时' }
      }
      return { success: false, error: error.message || '格式化失败' }
    }
  }
)

// ========== 导出 AI 对话历史 ==========
ipcMain.handle(
  'export-chat-history',
  async (
    _,
    request: {
      messages: Array<{ role: string; content: string; timestamp: number }>
      format: 'pdf' | 'html' | 'markdown' | 'word'
    }
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const { messages, format } = request

      // 过滤掉系统消息
      const chatMessages = messages.filter(msg => msg.role !== 'system')

      if (chatMessages.length === 0) {
        return { success: false, error: '没有可导出的对话' }
      }

      // 选择保存路径
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const extensions: Record<typeof format, string> = {
        pdf: 'pdf',
        html: 'html',
        markdown: 'md',
        word: 'docx'
      }

      const result = await dialog.showSaveDialog({
        title: '导出对话历史',
        defaultPath: `Claude-Chat-${timestamp}.${extensions[format]}`,
        filters: [
          { name: '导出文件', extensions: [extensions[format]] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, error: '用户取消操作' }
      }

      const filePath = result.filePath

      // 根据格式生成内容
      if (format === 'markdown') {
        const mdContent = generateMarkdown(chatMessages)
        fs.writeFileSync(filePath, mdContent, 'utf-8')
      } else if (format === 'html') {
        const htmlContent = generateHTML(chatMessages)
        fs.writeFileSync(filePath, htmlContent, 'utf-8')
      } else if (format === 'pdf') {
        // 生成 HTML 然后转换为 PDF
        const htmlContent = generateHTML(chatMessages)
        const tempHtmlPath = path.join(app.getPath('temp'), `chat-${Date.now()}.html`)
        fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8')

        // 使用 Electron 的打印功能生成 PDF
        const win = new BrowserWindow({ show: false })
        await win.loadFile(tempHtmlPath)
        const pdfData = await win.webContents.printToPDF({
          printBackground: true,
          margins: {
            top: 0.5,
            bottom: 0.5,
            left: 0.5,
            right: 0.5
          }
        })
        fs.writeFileSync(filePath, pdfData)
        win.close()

        // 清理临时文件
        fs.unlinkSync(tempHtmlPath)
      } else if (format === 'word') {
        // 对于 Word 格式,生成简单的 HTML (可以被 Word 打开)
        const htmlContent = generateHTML(chatMessages)
        fs.writeFileSync(filePath, htmlContent, 'utf-8')
      }

      return { success: true, filePath }
    } catch (error: any) {
      console.error('导出对话历史失败:', error)
      return { success: false, error: error.message || '导出失败' }
    }
  }
)

// 生成 Markdown 格式
function generateMarkdown(
  messages: Array<{ role: string; content: string; timestamp: number }>
): string {
  const lines: string[] = []

  lines.push('# AI 对话历史')
  lines.push('')
  lines.push(`导出时间: ${new Date().toLocaleString('zh-CN')}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  messages.forEach((msg, index) => {
    const role = msg.role === 'user' ? '👤 用户' : '🤖 AI 助手'
    const time = new Date(msg.timestamp).toLocaleString('zh-CN')

    lines.push(`## ${role}`)
    lines.push('')
    lines.push(`*时间: ${time}*`)
    lines.push('')
    lines.push(msg.content)
    lines.push('')

    if (index < messages.length - 1) {
      lines.push('---')
      lines.push('')
    }
  })

  return lines.join('\n')
}

// 生成 HTML 格式
function generateHTML(
  messages: Array<{ role: string; content: string; timestamp: number }>
): string {
  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  /**
   * 基于正则的语法高亮器
   * 将代码文本中的 token 包裹在对应的 <span> 中以实现语法着色
   */
  const highlightCode = (code: string, language: string): string => {
    /* 通用关键字集合（覆盖 JS/TS/Python/Java/Go/Rust/C 等主流语言） */
    const keywordSets: Record<string, string[]> = {
      javascript: [
        'abstract',
        'arguments',
        'async',
        'await',
        'break',
        'case',
        'catch',
        'class',
        'const',
        'continue',
        'debugger',
        'default',
        'delete',
        'do',
        'else',
        'enum',
        'export',
        'extends',
        'false',
        'finally',
        'for',
        'from',
        'function',
        'if',
        'implements',
        'import',
        'in',
        'instanceof',
        'interface',
        'let',
        'new',
        'null',
        'of',
        'package',
        'private',
        'protected',
        'public',
        'return',
        'static',
        'super',
        'switch',
        'this',
        'throw',
        'true',
        'try',
        'typeof',
        'undefined',
        'var',
        'void',
        'while',
        'with',
        'yield'
      ],
      typescript: [
        'abstract',
        'any',
        'as',
        'async',
        'await',
        'boolean',
        'break',
        'case',
        'catch',
        'class',
        'const',
        'constructor',
        'continue',
        'debugger',
        'declare',
        'default',
        'delete',
        'do',
        'else',
        'enum',
        'export',
        'extends',
        'false',
        'finally',
        'for',
        'from',
        'function',
        'get',
        'if',
        'implements',
        'import',
        'in',
        'infer',
        'instanceof',
        'interface',
        'is',
        'keyof',
        'let',
        'module',
        'namespace',
        'never',
        'new',
        'null',
        'number',
        'object',
        'of',
        'package',
        'private',
        'protected',
        'public',
        'readonly',
        'return',
        'set',
        'static',
        'string',
        'super',
        'switch',
        'symbol',
        'this',
        'throw',
        'true',
        'try',
        'type',
        'typeof',
        'undefined',
        'unique',
        'unknown',
        'var',
        'void',
        'while',
        'with',
        'yield'
      ],
      python: [
        'False',
        'None',
        'True',
        'and',
        'as',
        'assert',
        'async',
        'await',
        'break',
        'class',
        'continue',
        'def',
        'del',
        'elif',
        'else',
        'except',
        'finally',
        'for',
        'from',
        'global',
        'if',
        'import',
        'in',
        'is',
        'lambda',
        'nonlocal',
        'not',
        'or',
        'pass',
        'raise',
        'return',
        'try',
        'while',
        'with',
        'yield',
        'self',
        'print'
      ],
      java: [
        'abstract',
        'assert',
        'boolean',
        'break',
        'byte',
        'case',
        'catch',
        'char',
        'class',
        'const',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extends',
        'final',
        'finally',
        'float',
        'for',
        'goto',
        'if',
        'implements',
        'import',
        'instanceof',
        'int',
        'interface',
        'long',
        'native',
        'new',
        'null',
        'package',
        'private',
        'protected',
        'public',
        'return',
        'short',
        'static',
        'strictfp',
        'super',
        'switch',
        'synchronized',
        'this',
        'throw',
        'throws',
        'transient',
        'try',
        'void',
        'volatile',
        'while',
        'true',
        'false'
      ],
      go: [
        'break',
        'case',
        'chan',
        'const',
        'continue',
        'default',
        'defer',
        'else',
        'fallthrough',
        'for',
        'func',
        'go',
        'goto',
        'if',
        'import',
        'interface',
        'map',
        'package',
        'range',
        'return',
        'select',
        'struct',
        'switch',
        'type',
        'var',
        'true',
        'false',
        'nil'
      ],
      rust: [
        'as',
        'async',
        'await',
        'break',
        'const',
        'continue',
        'crate',
        'dyn',
        'else',
        'enum',
        'extern',
        'false',
        'fn',
        'for',
        'if',
        'impl',
        'in',
        'let',
        'loop',
        'match',
        'mod',
        'move',
        'mut',
        'pub',
        'ref',
        'return',
        'self',
        'Self',
        'static',
        'struct',
        'super',
        'trait',
        'true',
        'type',
        'unsafe',
        'use',
        'where',
        'while'
      ],
      c: [
        'auto',
        'break',
        'case',
        'char',
        'const',
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extern',
        'float',
        'for',
        'goto',
        'if',
        'inline',
        'int',
        'long',
        'register',
        'restrict',
        'return',
        'short',
        'signed',
        'sizeof',
        'static',
        'struct',
        'switch',
        'typedef',
        'union',
        'unsigned',
        'void',
        'volatile',
        'while',
        'NULL',
        'true',
        'false'
      ],
      cpp: [
        'alignas',
        'alignof',
        'and',
        'and_eq',
        'asm',
        'auto',
        'bitand',
        'bitor',
        'bool',
        'break',
        'case',
        'catch',
        'char',
        'char8_t',
        'char16_t',
        'char32_t',
        'class',
        'compl',
        'concept',
        'const',
        'consteval',
        'constexpr',
        'constinit',
        'const_cast',
        'continue',
        'co_await',
        'co_return',
        'co_yield',
        'decltype',
        'default',
        'delete',
        'do',
        'double',
        'dynamic_cast',
        'else',
        'enum',
        'explicit',
        'export',
        'extern',
        'false',
        'float',
        'for',
        'friend',
        'goto',
        'if',
        'inline',
        'int',
        'long',
        'mutable',
        'namespace',
        'new',
        'noexcept',
        'not',
        'not_eq',
        'nullptr',
        'operator',
        'or',
        'or_eq',
        'private',
        'protected',
        'public',
        'register',
        'reinterpret_cast',
        'requires',
        'return',
        'short',
        'signed',
        'sizeof',
        'static',
        'static_assert',
        'static_cast',
        'struct',
        'switch',
        'template',
        'this',
        'thread_local',
        'throw',
        'true',
        'try',
        'typedef',
        'typeid',
        'typename',
        'union',
        'unsigned',
        'using',
        'virtual',
        'void',
        'volatile',
        'wchar_t',
        'while',
        'xor',
        'xor_eq'
      ],
      ruby: [
        'BEGIN',
        'END',
        'alias',
        'and',
        'begin',
        'break',
        'case',
        'class',
        'def',
        'defined?',
        'do',
        'else',
        'elsif',
        'end',
        'ensure',
        'false',
        'for',
        'if',
        'in',
        'module',
        'next',
        'nil',
        'not',
        'or',
        'redo',
        'rescue',
        'retry',
        'return',
        'self',
        'super',
        'then',
        'true',
        'undef',
        'unless',
        'until',
        'when',
        'while',
        'yield'
      ],
      swift: [
        'associatedtype',
        'class',
        'deinit',
        'enum',
        'extension',
        'fileprivate',
        'func',
        'import',
        'init',
        'inout',
        'internal',
        'let',
        'open',
        'operator',
        'private',
        'protocol',
        'public',
        'rethrows',
        'static',
        'struct',
        'subscript',
        'typealias',
        'var',
        'break',
        'case',
        'continue',
        'default',
        'defer',
        'do',
        'else',
        'fallthrough',
        'for',
        'guard',
        'if',
        'in',
        'repeat',
        'return',
        'switch',
        'where',
        'while',
        'as',
        'catch',
        'false',
        'is',
        'nil',
        'super',
        'self',
        'Self',
        'throw',
        'throws',
        'true',
        'try',
        'async',
        'await'
      ],
      sql: [
        'SELECT',
        'FROM',
        'WHERE',
        'INSERT',
        'INTO',
        'VALUES',
        'UPDATE',
        'SET',
        'DELETE',
        'DROP',
        'CREATE',
        'TABLE',
        'ALTER',
        'ADD',
        'COLUMN',
        'INDEX',
        'VIEW',
        'AND',
        'OR',
        'NOT',
        'NULL',
        'IS',
        'IN',
        'BETWEEN',
        'LIKE',
        'ORDER',
        'BY',
        'GROUP',
        'HAVING',
        'JOIN',
        'INNER',
        'LEFT',
        'RIGHT',
        'OUTER',
        'ON',
        'AS',
        'DISTINCT',
        'COUNT',
        'SUM',
        'AVG',
        'MIN',
        'MAX',
        'LIMIT',
        'OFFSET',
        'UNION',
        'ALL',
        'EXISTS',
        'CASE',
        'WHEN',
        'THEN',
        'ELSE',
        'END',
        'PRIMARY',
        'KEY',
        'FOREIGN',
        'REFERENCES',
        'CONSTRAINT',
        'DEFAULT',
        'CHECK',
        'UNIQUE',
        'select',
        'from',
        'where',
        'insert',
        'into',
        'values',
        'update',
        'set',
        'delete',
        'drop',
        'create',
        'table',
        'alter',
        'add',
        'column',
        'index',
        'view',
        'and',
        'or',
        'not',
        'null',
        'is',
        'in',
        'between',
        'like',
        'order',
        'by',
        'group',
        'having',
        'join',
        'inner',
        'left',
        'right',
        'outer',
        'on',
        'as',
        'distinct',
        'count',
        'sum',
        'avg',
        'min',
        'max',
        'limit',
        'offset',
        'union',
        'all',
        'exists',
        'case',
        'when',
        'then',
        'else',
        'end',
        'primary',
        'key',
        'foreign',
        'references',
        'constraint',
        'default',
        'check',
        'unique'
      ],
      shell: [
        'if',
        'then',
        'else',
        'elif',
        'fi',
        'case',
        'esac',
        'for',
        'while',
        'until',
        'do',
        'done',
        'in',
        'function',
        'select',
        'time',
        'coproc',
        'echo',
        'read',
        'exit',
        'return',
        'export',
        'local',
        'declare',
        'typeset',
        'readonly',
        'unset',
        'shift',
        'set',
        'source',
        'alias'
      ],
      bash: [
        'if',
        'then',
        'else',
        'elif',
        'fi',
        'case',
        'esac',
        'for',
        'while',
        'until',
        'do',
        'done',
        'in',
        'function',
        'select',
        'time',
        'coproc',
        'echo',
        'read',
        'exit',
        'return',
        'export',
        'local',
        'declare',
        'typeset',
        'readonly',
        'unset',
        'shift',
        'set',
        'source',
        'alias'
      ]
    }

    /* 根据语言选择关键字，回退到 JS/TS 通用关键字 */
    const lang = language.toLowerCase()
    const keywords = keywordSets[lang] || keywordSets['javascript'] || []
    const keywordSet = new Set(keywords)

    /* 是否区分大小写（SQL 不区分） */
    const caseSensitive = lang !== 'sql'

    /**
     * 分词+高亮核心逻辑
     * 按优先级匹配：注释 > 字符串 > 数字 > 关键字/标识符 > 运算符 > 其他
     */
    const tokens: string[] = []
    let i = 0

    while (i < code.length) {
      /* ---- 多行注释 ---- */
      if (code[i] === '/' && code[i + 1] === '*') {
        let end = code.indexOf('*/', i + 2)
        if (end === -1) end = code.length
        else end += 2
        tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
        i = end
        continue
      }

      /* ---- 单行注释 // ---- */
      if (code[i] === '/' && code[i + 1] === '/') {
        let end = code.indexOf('\n', i)
        if (end === -1) end = code.length
        tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
        i = end
        continue
      }

      /* ---- Python/Shell # 注释 ---- */
      if (code[i] === '#' && ['python', 'ruby', 'shell', 'bash', 'yaml', 'yml'].includes(lang)) {
        let end = code.indexOf('\n', i)
        if (end === -1) end = code.length
        tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
        i = end
        continue
      }

      /* ---- SQL -- 注释 ---- */
      if (code[i] === '-' && code[i + 1] === '-' && lang === 'sql') {
        let end = code.indexOf('\n', i)
        if (end === -1) end = code.length
        tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
        i = end
        continue
      }

      /* ---- 模板字符串 ---- */
      if (
        code[i] === '`' &&
        ['javascript', 'typescript', 'js', 'ts', 'jsx', 'tsx'].includes(lang)
      ) {
        let j = i + 1
        while (j < code.length) {
          if (code[j] === '\\') {
            j += 2
            continue
          }
          if (code[j] === '`') {
            j++
            break
          }
          j++
        }
        tokens.push(`<span class="hl-string">${code.slice(i, j)}</span>`)
        i = j
        continue
      }

      /* ---- 字符串 (双引号 / 单引号) ---- */
      if (code[i] === '"' || code[i] === "'") {
        const quote = code[i]
        let j = i + 1
        while (j < code.length) {
          if (code[j] === '\\') {
            j += 2
            continue
          }
          if (code[j] === quote) {
            j++
            break
          }
          if (code[j] === '\n') {
            j++
            break
          }
          j++
        }
        tokens.push(`<span class="hl-string">${code.slice(i, j)}</span>`)
        i = j
        continue
      }

      /* ---- Python 三引号字符串 ---- */
      if (
        (code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") &&
        ['python'].includes(lang)
      ) {
        const triple = code.slice(i, i + 3)
        let j = i + 3
        const end = code.indexOf(triple, j)
        if (end === -1) j = code.length
        else j = end + 3
        tokens.push(`<span class="hl-string">${code.slice(i, j)}</span>`)
        i = j
        continue
      }

      /* ---- 数字 ---- */
      if (/[0-9]/.test(code[i]) && (i === 0 || !/[a-zA-Z_$]/.test(code[i - 1]))) {
        let j = i
        /* 十六进制 / 二进制 / 八进制 */
        if (code[i] === '0' && code[i + 1] && /[xXbBoO]/.test(code[i + 1])) {
          j += 2
          while (j < code.length && /[0-9a-fA-F_]/.test(code[j])) j++
        } else {
          while (j < code.length && /[0-9._eE]/.test(code[j])) j++
        }
        /* 后缀 n (BigInt)、f/F/L (C/Java) */
        if (j < code.length && /[nfFlLuU]/.test(code[j])) j++
        tokens.push(`<span class="hl-number">${code.slice(i, j)}</span>`)
        i = j
        continue
      }

      /* ---- 标识符 / 关键字 ---- */
      if (/[a-zA-Z_$@]/.test(code[i])) {
        let j = i
        while (j < code.length && /[a-zA-Z0-9_$?]/.test(code[j])) j++
        const word = code.slice(i, j)
        const isKeyword = caseSensitive
          ? keywordSet.has(word)
          : keywordSet.has(word.toLowerCase()) || keywordSet.has(word)

        if (isKeyword) {
          tokens.push(`<span class="hl-keyword">${word}</span>`)
        } else {
          /* 检查是否为函数调用（后面紧跟括号） */
          let k = j
          while (k < code.length && code[k] === ' ') k++
          if (k < code.length && code[k] === '(') {
            tokens.push(`<span class="hl-function">${word}</span>`)
          } else {
            tokens.push(word)
          }
        }
        i = j
        continue
      }

      /* ---- 运算符 ---- */
      if (/[+\-*/%=<>!&|^~?:.]/.test(code[i])) {
        let j = i
        while (j < code.length && /[+\-*/%=<>!&|^~?:.]/.test(code[j]) && j - i < 3) j++
        tokens.push(`<span class="hl-operator">${code.slice(i, j)}</span>`)
        i = j
        continue
      }

      /* ---- 其余字符原样输出 ---- */
      tokens.push(code[i])
      i++
    }

    return tokens.join('')
  }

  const formatContent = (content: string) => {
    // 简单的 Markdown 转 HTML (支持代码块)
    let html = escapeHtml(content)

    // 代码块 - 使用语言标记并添加语言标签，并应用语法高亮
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      const language = lang || 'text'
      const langDisplay = language.toUpperCase()
      const highlightedCode = highlightCode(code, language)
      return `<pre data-lang="${langDisplay}"><code class="language-${language}">${highlightedCode}</code></pre>`
    })

    // 行内代码
    html = html.replace(/`([^`]+)`/g, "<code class='inline-code'>$1</code>")

    // 换行 (但不要破坏 pre 标签内的换行)
    html = html.replace(/\n(?![^<]*<\/pre>)/g, '<br>')

    return html
  }

  const messageHtml = messages
    .map(msg => {
      const isUser = msg.role === 'user'
      const role = isUser ? '👤 用户' : '🤖 AI 助手'
      const time = new Date(msg.timestamp).toLocaleString('zh-CN')
      const bgColor = isUser ? '#f0f4f8' : '#ffffff'
      const borderColor = isUser ? '#d97757' : '#e0e0e0'

      return `
      <div class="message ${isUser ? 'user' : 'assistant'}" style="
        margin-bottom: 20px;
        padding: 15px 20px;
        border-left: 4px solid ${borderColor};
        background: ${bgColor};
        border-radius: 8px;
      ">
        <div class="role" style="
          font-weight: 600;
          font-size: 14px;
          color: #333;
          margin-bottom: 8px;
        ">${role}</div>
        <div class="time" style="
          font-size: 12px;
          color: #666;
          margin-bottom: 12px;
        ">${time}</div>
        <div class="content" style="
          line-height: 1.7;
          color: #333;
          font-size: 14px;
        ">${formatContent(msg.content)}</div>
      </div>
    `
    })
    .join('')

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 对话历史</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f9fafb;
      padding: 40px 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .export-info {
      font-size: 13px;
      color: #666;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e0e0e0;
    }
    .inline-code {
      background: #f0f0f0;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: "SF Mono", "Fira Code", "Consolas", "Monaco", "Courier New", monospace;
      font-size: 0.9em;
      color: #d97757;
      border: 1px solid #e0e0e0;
    }
    pre {
      background: #1e1e2e;
      padding: 40px 20px 16px 20px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
      border: 1px solid #313244;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      position: relative;
    }
    pre code {
      color: #cdd6f4;
      background: none;
      padding: 0;
      font-family: "SF Mono", "Fira Code", "Consolas", "Monaco", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.65;
      display: block;
      white-space: pre;
      word-wrap: normal;
      tab-size: 2;
    }

    /* 语法高亮样式 - Catppuccin Mocha 风格 */
    .hl-keyword { color: #cba6f7; font-weight: 600; }
    .hl-string { color: #a6e3a1; }
    .hl-number { color: #fab387; }
    .hl-comment { color: #6c7086; font-style: italic; }
    .hl-function { color: #89b4fa; }
    .hl-operator { color: #89dceb; }

    /* 代码块语言标签 */
    pre::before {
      content: attr(data-lang);
      position: absolute;
      top: 10px;
      right: 14px;
      font-size: 11px;
      color: #6c7086;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 AI 对话历史</h1>
    <div class="export-info">导出时间: ${new Date().toLocaleString('zh-CN')}</div>
    ${messageHtml}
  </div>
</body>
</html>
  `.trim()
}
