import { app, BrowserWindow, ipcMain, dialog, clipboard, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import Store from 'electron-store'

const store = new Store()

let mainWindow: BrowserWindow | null = null
let historyWatcher: fs.FSWatcher | null = null
let lastFileSize = 0

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 开发模式：加载 Vite 开发服务器
  // 生产模式：加载打包后的文件
  const isDev = process.env.NODE_ENV !== 'production'

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (historyWatcher) {
    historyWatcher.close()
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

// 选择保存路径
ipcMain.handle('select-save-path', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '选择对话记录保存目录'
  })

  if (result.canceled) {
    return { canceled: true }
  }

  return { canceled: false, path: result.filePaths[0] }
})

// 获取记录配置
ipcMain.handle('get-record-config', async () => {
  const enabled = store.get('recordEnabled', false) as boolean
  const savePath = store.get('savePath', '') as string
  return { enabled, savePath }
})

// 保存记录配置
ipcMain.handle('save-record-config', async (_, config: { enabled: boolean; savePath: string }) => {
  try {
    store.set('recordEnabled', config.enabled)
    store.set('savePath', config.savePath)

    // 确保目录存在
    if (config.enabled && config.savePath) {
      if (!fs.existsSync(config.savePath)) {
        fs.mkdirSync(config.savePath, { recursive: true })
      }
    }

    // 启动或停止监控
    if (config.enabled) {
      startHistoryMonitor(config.savePath)
    } else {
      stopHistoryMonitor()
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

// 获取应用设置
ipcMain.handle('get-app-settings', async () => {
  const darkMode = store.get('darkMode', false) as boolean
  const autoStart = store.get('autoStart', false) as boolean
  return { darkMode, autoStart }
})

// 保存应用设置
ipcMain.handle('save-app-settings', async (_, settings: { darkMode: boolean; autoStart: boolean }) => {
  try {
    store.set('darkMode', settings.darkMode)
    store.set('autoStart', settings.autoStart)

    // 设置开机自启
    app.setLoginItemSettings({
      openAtLogin: settings.autoStart,
      openAsHidden: false
    })

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

// 启动历史记录监控
function startHistoryMonitor(savePath: string) {
  if (historyWatcher) {
    historyWatcher.close()
  }

  if (!fs.existsSync(HISTORY_FILE)) {
    return
  }

  // 获取当前文件大小
  const stats = fs.statSync(HISTORY_FILE)
  lastFileSize = stats.size

  historyWatcher = fs.watch(HISTORY_FILE, (eventType) => {
    if (eventType === 'change') {
      readNewLines(savePath)
    }
  })
}

// 停止历史记录监控
function stopHistoryMonitor() {
  if (historyWatcher) {
    historyWatcher.close()
    historyWatcher = null
  }
}

// 读取新增的行
function readNewLines(savePath: string) {
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
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      lines.forEach(line => {
        if (line.trim()) {
          try {
            const record = JSON.parse(line)
            processRecord(record, savePath)
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

// 处理对话记录
function processRecord(record: any, savePath: string) {
  // 发送到渲染进程
  if (mainWindow) {
    mainWindow.webContents.send('new-record', record)
  }

  // 保存到文件
  try {
    const timestamp = new Date(record.timestamp).toISOString()
    const projectName = record.project ? path.basename(record.project) : 'unknown'
    const date = new Date(record.timestamp).toISOString().split('T')[0]

    const fileName = `${projectName}_${date}.jsonl`
    const filePath = path.join(savePath, fileName)

    const logEntry = {
      timestamp,
      project: record.project,
      sessionId: record.sessionId,
      prompt: record.display,
      pastedContents: record.pastedContents
    }

    fs.appendFileSync(filePath, JSON.stringify(logEntry) + '\n', 'utf-8')
  } catch (error) {
    console.error('Failed to save record:', error)
  }
}

// 读取历史记录
ipcMain.handle('read-history', async () => {
  try {
    const savePath = store.get('savePath', '') as string
    if (!savePath) {
      return { success: false, error: '未配置保存路径' }
    }

    if (!fs.existsSync(savePath)) {
      return { success: false, error: '保存路径不存在' }
    }

    const files = fs.readdirSync(savePath).filter(f => f.endsWith('.jsonl'))

    if (files.length === 0) {
      return { success: true, records: [] }
    }

    const records: any[] = []
    const MAX_RECORDS = 1000 // 限制最大记录数，避免 IPC 消息过大

    for (const file of files) {
      if (records.length >= MAX_RECORDS) {
        break
      }

      try {
        const filePath = path.join(savePath, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n').filter(line => line.trim())

        for (const line of lines) {
          if (records.length >= MAX_RECORDS) break

          try {
            const record = JSON.parse(line)
            // 转换时间戳格式（从 ISO 字符串转为毫秒数）
            const timestamp = new Date(record.timestamp).getTime()

            // 验证数据完整性
            if (isNaN(timestamp) || !record.project) {
              continue
            }

            records.push({
              timestamp,
              project: record.project,
              sessionId: record.sessionId || '',
              display: record.prompt || '',
              pastedContents: record.pastedContents || {}
            })
          } catch (e) {
            console.error('解析记录失败:', e, '行内容:', line.substring(0, 100))
          }
        }
      } catch (fileError) {
        console.error(`读取文件 ${file} 失败:`, fileError)
        // 继续处理其他文件
      }
    }

    return { success: true, records }
  } catch (error) {
    console.error('读取历史记录时发生错误:', error)
    return { success: false, error: (error as Error).message }
  }
})

// 导出记录为 Markdown
ipcMain.handle('export-records', async (_, options: any) => {
  try {
    const savePath = store.get('savePath', '') as string
    if (!savePath) {
      return { success: false, error: '未配置保存路径' }
    }

    if (!fs.existsSync(savePath)) {
      return { success: false, error: '保存路径不存在' }
    }

    // 读取所有 .jsonl 文件
    const files = fs.readdirSync(savePath).filter(f => f.endsWith('.jsonl'))
    if (files.length === 0) {
      return { success: false, error: '没有找到记录文件' }
    }

    // 解析所有记录
    const allRecords: any[] = []
    for (const file of files) {
      try {
        const filePath = path.join(savePath, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const record = JSON.parse(line)
            const timestamp = new Date(record.timestamp).getTime()

            if (isNaN(timestamp) || !record.project) {
              continue
            }

            allRecords.push({
              timestamp,
              project: record.project,
              sessionId: record.sessionId || '',
              display: record.prompt || '',
              pastedContents: record.pastedContents || {}
            })
          } catch (e) {
            // 跳过无效记录
          }
        }
      } catch (fileError) {
        console.error(`读取文件 ${file} 失败:`, fileError)
      }
    }

    if (allRecords.length === 0) {
      return { success: false, error: '没有有效的记录' }
    }

    // 过滤记录
    let filteredRecords = allRecords

    // 按 sessionIds 过滤
    if (options.sessionIds && options.sessionIds.length > 0) {
      filteredRecords = filteredRecords.filter(r =>
        options.sessionIds.includes(r.sessionId)
      )
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
            } else {
              markdown += '```json\n'
              markdown += JSON.stringify(value, null, 2)
              markdown += '\n```\n\n'
            }
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

// 初始化时检查是否需要启动监控
app.whenReady().then(() => {
  const enabled = store.get('recordEnabled', false) as boolean
  const savePath = store.get('savePath', '') as string
  if (enabled && savePath) {
    startHistoryMonitor(savePath)
  }
})
