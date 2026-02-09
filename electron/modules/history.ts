/**
 * 历史记录模块
 * 负责文件监控、记录处理、图片提取、历史记录读取等
 */

import fs from 'fs'
import path from 'path'
import type { ModuleContext } from './types'

// 模块私有状态
let historyWatcher: fs.FSWatcher | null = null
let lastFileSize = 0

// ========== 图片处理函数 ==========

/**
 * 从 Claude Code 2.0.55+ projects 目录提取图片
 * @param sessionId - 会话 ID
 * @param project - 项目路径
 * @param savePath - 应用保存路径
 * @param displayText - 记录的 display 文本，用于识别图片编号
 * @param claudeDir - Claude 配置目录路径
 * @returns 图片路径数组
 */
const extractImagesFromProjects = async (
  sessionId: string,
  project: string,
  savePath: string,
  displayText: string,
  claudeDir: string
): Promise<string[]> => {
  const images: string[] = []

  try {
    // 从 display 文本中提取图片编号
    const imageMatches = displayText.match(/\[Image #(\d+)\]/g)
    if (!imageMatches || imageMatches.length === 0) {
      return images
    }

    const imageNumbers = imageMatches
      .map(match => {
        const num = match.match(/\d+/)
        return num ? parseInt(num[0]) : null
      })
      .filter(n => n !== null) as number[]

    if (imageNumbers.length === 0) {
      return images
    }

    console.log(`[Image Extract] 记录中需要 ${imageNumbers.length} 张图片:`, imageNumbers)

    // 构建 project 路径
    const projectFolderName = project.replace(/\//g, '-')
    const projectSessionFile = path.join(
      claudeDir,
      'projects',
      projectFolderName,
      `${sessionId}.jsonl`
    )

    if (!fs.existsSync(projectSessionFile)) {
      console.log(`[Image Extract] Session 文件不存在，跳过`)
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

    console.log(`[Image Extract] Session 中共有 ${base64Images.length} 张图片`)

    // 只保存当前记录需要的图片
    const imagesDir = path.join(savePath, 'images', sessionId)
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true })
    }

    for (const imageNum of imageNumbers) {
      const imageData = base64Images.find(img => img.index === imageNum)

      if (imageData) {
        const imageFileName = `${imageNum}.png`
        const imagePath = path.join(imagesDir, imageFileName)

        if (!fs.existsSync(imagePath)) {
          const buffer = Buffer.from(imageData.data, 'base64')
          fs.writeFileSync(imagePath, buffer)
          console.log(`[Image Extract] 成功提取图片 #${imageNum}`)
        }

        images.push(`images/${sessionId}/${imageFileName}`)
      } else {
        console.warn(`[Image Extract] 找不到图片 #${imageNum}`)
      }
    }

    if (images.length > 0) {
      console.log(`[Image Extract] 本条记录提取了 ${images.length} 张图片`)
    }
  } catch (err) {
    console.error('[Image Extract] 提取图片失败:', err)
  }

  return images
}

// ========== 粘贴内容处理 ==========

/**
 * 展开粘贴内容：将 contentHash 引用替换为实际内容
 */
const expandPastedContents = (
  pastedContents: Record<string, any>,
  claudeDir: string
): Record<string, any> => {
  const expandedContents: Record<string, any> = {}

  for (const [key, value] of Object.entries(pastedContents)) {
    if (
      value &&
      typeof value === 'object' &&
      (value as any).contentHash &&
      !(value as any).content
    ) {
      const contentHash = (value as any).contentHash
      const pasteFilePath = path.join(claudeDir, 'paste-cache', `${contentHash}.txt`)

      try {
        if (fs.existsSync(pasteFilePath)) {
          const actualContent = fs.readFileSync(pasteFilePath, 'utf-8')
          expandedContents[key] = { ...value, content: actualContent }
        } else {
          expandedContents[key] = value
        }
      } catch (err) {
        console.error(`Failed to read paste cache ${contentHash}:`, err)
        expandedContents[key] = value
      }
    } else {
      expandedContents[key] = value
    }
  }

  return expandedContents
}

// ========== Image-Cache 目录图片处理 ==========

/**
 * 从 image-cache 目录复制图片（兼容多个版本的 Claude Code）
 */
const processImageCache = async (
  record: any,
  savePath: string,
  claudeDir: string
): Promise<string[]> => {
  const images: string[] = []
  if (!record.sessionId) return images

  const imageCacheDirNew = path.join(claudeDir, 'image-cache', record.sessionId)
  const imageCacheDirOld = path.join(claudeDir, 'images', record.sessionId)
  const possibleDirs = [imageCacheDirNew, imageCacheDirOld]

  // 等待图片目录创建
  let waitCount = 0
  while (waitCount < 30) {
    if (possibleDirs.some(dir => fs.existsSync(dir))) break
    await new Promise(resolve => setTimeout(resolve, 100))
    waitCount++
  }

  try {
    for (const imageCacheDir of possibleDirs) {
      if (!fs.existsSync(imageCacheDir)) continue

      await new Promise(resolve => setTimeout(resolve, 300))

      const allImageFiles = fs
        .readdirSync(imageCacheDir)
        .filter(
          (f: string) =>
            f.endsWith('.png') ||
            f.endsWith('.jpg') ||
            f.endsWith('.jpeg') ||
            f.endsWith('.gif') ||
            f.endsWith('.webp')
        )

      if (allImageFiles.length === 0) continue

      const imagesDir = path.join(savePath, 'images', record.sessionId)
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true })
      }

      const recordTimestamp = new Date(record.timestamp).getTime()
      const imageMatches = record.display.match(/\[Image #(\d+)\]/g)

      if (imageMatches && imageMatches.length > 0) {
        // 使用精确匹配
        const imageNumbers = imageMatches
          .map((match: string) => {
            const num = match.match(/\d+/)
            return num ? parseInt(num[0]) : null
          })
          .filter((n: number | null) => n !== null) as number[]

        const sortedImageFiles = allImageFiles.sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0')
          const numB = parseInt(b.match(/\d+/)?.[0] || '0')
          return numA - numB
        })

        console.log(
          `[Image Matcher] 找到 ${imageNumbers.length} 个图片标记, ${sortedImageFiles.length} 个图片文件`
        )

        for (const imageNum of imageNumbers) {
          let imageFile = sortedImageFiles.find(f => {
            const fileNum = parseInt(f.match(/\d+/)?.[0] || '0')
            return fileNum === imageNum
          })

          if (!imageFile) {
            const imageIndex = imageNum - 1
            if (imageIndex >= 0 && imageIndex < sortedImageFiles.length) {
              imageFile = sortedImageFiles[imageIndex]
            }
          }

          if (imageFile) {
            const srcPath = path.join(imageCacheDir, imageFile)
            const destPath = path.join(imagesDir, imageFile)

            try {
              if (!fs.existsSync(destPath)) {
                fs.copyFileSync(srcPath, destPath)
                console.log(`[Image Copy] 成功复制: ${imageFile}`)
              }
              images.push(`images/${record.sessionId}/${imageFile}`)
            } catch (err) {
              console.error(`Failed to copy image ${imageFile}:`, err)
            }
          }
        }
      } else {
        // 使用时间戳匹配
        console.log(`[Image Matcher] 无标记，使用时间戳匹配`)
        for (const imageFile of allImageFiles) {
          const srcPath = path.join(imageCacheDir, imageFile)
          const stat = fs.statSync(srcPath)
          const timeDiff = Math.abs(stat.mtimeMs - recordTimestamp)

          if (timeDiff <= 5000) {
            const destPath = path.join(imagesDir, imageFile)

            try {
              if (!fs.existsSync(destPath)) {
                fs.copyFileSync(srcPath, destPath)
                console.log(`[Image Copy] 时间戳匹配复制: ${imageFile}`)
              }
              images.push(`images/${record.sessionId}/${imageFile}`)
            } catch (err) {
              console.error(`Failed to copy image ${imageFile}:`, err)
            }
          }
        }
      }

      if (images.length > 0) break
    }
  } catch (err) {
    console.error('Failed to process images:', err)
  }

  return images
}

// ========== 记录处理 ==========

/**
 * 处理对话记录：保存到文件，提取图片，发送到渲染进程
 */
const processRecord = async (record: any, savePath: string, ctx: ModuleContext) => {
  try {
    const { CLAUDE_DIR, getMainWindow } = ctx
    const timestamp = new Date(record.timestamp).toISOString()
    const projectName = record.project ? path.basename(record.project) : 'unknown'
    const date = new Date(record.timestamp).toISOString().split('T')[0]

    const fileName = `${projectName}_${date}.jsonl`
    const filePath = path.join(savePath, fileName)

    // 展开粘贴内容
    const expandedPastedContents =
      record.pastedContents && typeof record.pastedContents === 'object'
        ? expandPastedContents(record.pastedContents, CLAUDE_DIR)
        : {}

    // 处理图片
    const images: string[] = []

    if (record.sessionId) {
      // 方案1: 从 projects 目录提取 base64 图片
      const extractedImages = await extractImagesFromProjects(
        record.sessionId,
        record.project,
        savePath,
        record.display,
        CLAUDE_DIR
      )
      images.push(...extractedImages)

      // 方案2: 从 image-cache 目录
      if (images.length === 0) {
        const cacheImages = await processImageCache(record, savePath, CLAUDE_DIR)
        images.push(...cacheImages)
      }

      if (images.length === 0 && record.display.includes('[Image #')) {
        console.warn(`[Image Warning] Session ${record.sessionId} 包含图片标记但未找到图片文件`)
      }
    }

    const logEntry = {
      timestamp,
      project: record.project,
      sessionId: record.sessionId,
      prompt: record.display,
      pastedContents: expandedPastedContents,
      images: images.length > 0 ? images : undefined
    }

    fs.appendFileSync(filePath, JSON.stringify(logEntry) + '\n', 'utf-8')

    // 发送到渲染进程
    const enrichedRecord = {
      ...record,
      pastedContents: expandedPastedContents,
      images: images.length > 0 ? images : undefined
    }

    const mainWindow = getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('new-record', enrichedRecord)
    }
  } catch (error) {
    console.error('Failed to save record:', error)
  }
}

// ========== 文件监控 ==========

/**
 * 启动历史记录监控
 */
export const startHistoryMonitor = (savePath: string, ctx: ModuleContext) => {
  if (historyWatcher) {
    historyWatcher.close()
  }

  if (!fs.existsSync(ctx.HISTORY_FILE)) {
    return
  }

  const stats = fs.statSync(ctx.HISTORY_FILE)
  lastFileSize = stats.size

  historyWatcher = fs.watch(ctx.HISTORY_FILE, (eventType: string) => {
    if (eventType === 'change') {
      readNewLines(savePath, ctx)
    }
  })
}

/**
 * 停止历史记录监控
 */
export const stopHistoryMonitor = () => {
  if (historyWatcher) {
    historyWatcher.close()
    historyWatcher = null
  }
}

/**
 * 读取新增的行
 */
const readNewLines = (savePath: string, ctx: ModuleContext) => {
  try {
    const stats = fs.statSync(ctx.HISTORY_FILE)
    const currentSize = stats.size

    if (currentSize <= lastFileSize) {
      return
    }

    const stream = fs.createReadStream(ctx.HISTORY_FILE, {
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
            processRecord(record, savePath, ctx)
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

// ========== IPC 处理器注册 ==========

export const registerHistoryHandlers = (ctx: ModuleContext) => {
  const {
    electron: { ipcMain },
    store,
    CLAUDE_DIR
  } = ctx

  // 读取历史记录元数据（轻量级，只返回会话信息）
  ipcMain.handle('read-history-metadata', async () => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) return { success: false, error: '未配置保存路径' }
      if (!fs.existsSync(savePath)) return { success: false, error: '保存路径不存在' }

      const files = fs.readdirSync(savePath).filter((f: string) => f.endsWith('.jsonl'))

      if (files.length === 0) return { success: true, sessions: [] }

      const sessionsMap = new Map<
        string,
        {
          sessionId: string
          project: string
          latestTimestamp: number
          recordCount: number
          firstTimestamp: number
        }
      >()

      for (const file of files) {
        try {
          const filePath = path.join(savePath, file)
          const content = fs.readFileSync(filePath, 'utf-8')
          const lines = content.split('\n').filter((line: string) => line.trim())

          for (const line of lines) {
            try {
              const record = JSON.parse(line)
              const timestamp = new Date(record.timestamp).getTime()

              if (isNaN(timestamp) || !record.project) continue

              const sessionId = record.sessionId || `single-${timestamp}`

              if (!sessionsMap.has(sessionId)) {
                sessionsMap.set(sessionId, {
                  sessionId,
                  project: record.project,
                  latestTimestamp: timestamp,
                  firstTimestamp: timestamp,
                  recordCount: 0
                })
              }

              const session = sessionsMap.get(sessionId)!
              session.recordCount++
              session.latestTimestamp = Math.max(session.latestTimestamp, timestamp)
              session.firstTimestamp = Math.min(session.firstTimestamp, timestamp)
            } catch (e) {
              // 跳过无效记录
            }
          }
        } catch (fileError) {
          console.error(`读取文件 ${file} 失败:`, fileError)
        }
      }

      const sessions = Array.from(sessionsMap.values()).sort(
        (a, b) => b.latestTimestamp - a.latestTimestamp
      )

      return { success: true, sessions }
    } catch (error) {
      console.error('读取历史记录元数据时发生错误:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 读取指定会话的详细记录
  ipcMain.handle('read-session-details', async (_, sessionId: string) => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) return { success: false, error: '未配置保存路径' }
      if (!fs.existsSync(savePath)) return { success: false, error: '保存路径不存在' }

      const files = fs.readdirSync(savePath).filter((f: string) => f.endsWith('.jsonl'))

      if (files.length === 0) return { success: true, records: [] }

      const records: any[] = []

      for (const file of files) {
        try {
          const filePath = path.join(savePath, file)
          const content = fs.readFileSync(filePath, 'utf-8')
          const lines = content.split('\n').filter((line: string) => line.trim())

          for (const line of lines) {
            try {
              const record = JSON.parse(line)
              const timestamp = new Date(record.timestamp).getTime()

              if (isNaN(timestamp) || !record.project) continue

              const recordSessionId = record.sessionId || `single-${timestamp}`
              if (recordSessionId !== sessionId) continue

              // 展开粘贴内容
              let pastedContents = record.pastedContents || {}
              if (pastedContents && typeof pastedContents === 'object') {
                pastedContents = expandPastedContents(pastedContents, CLAUDE_DIR)
              }

              // 提取图片
              let images = record.images || []
              if (images.length === 0 && record.prompt && record.prompt.includes('[Image #')) {
                try {
                  const extractedImages = await extractImagesFromProjects(
                    recordSessionId,
                    record.project,
                    savePath,
                    record.prompt,
                    CLAUDE_DIR
                  )
                  images = extractedImages
                } catch (err) {
                  console.error('读取历史时提取图片失败:', err)
                }
              }

              records.push({
                timestamp,
                project: record.project,
                sessionId: recordSessionId,
                display: record.prompt || '',
                pastedContents,
                images
              })
            } catch (e) {
              console.error('解析记录失败:', e)
            }
          }
        } catch (fileError) {
          console.error(`读取文件 ${file} 失败:`, fileError)
        }
      }

      records.sort((a, b) => b.timestamp - a.timestamp)
      return { success: true, records }
    } catch (error) {
      console.error('读取会话详情时发生错误:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 读取历史记录（保留旧接口以兼容）
  ipcMain.handle('read-history', async () => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) return { success: false, error: '未配置保存路径' }
      if (!fs.existsSync(savePath)) return { success: false, error: '保存路径不存在' }

      const files = fs.readdirSync(savePath).filter((f: string) => f.endsWith('.jsonl'))

      if (files.length === 0) return { success: true, records: [] }

      const records: any[] = []
      const MAX_RECORDS = 1000

      for (const file of files) {
        if (records.length >= MAX_RECORDS) break

        try {
          const filePath = path.join(savePath, file)
          const content = fs.readFileSync(filePath, 'utf-8')
          const lines = content.split('\n').filter((line: string) => line.trim())

          for (const line of lines) {
            if (records.length >= MAX_RECORDS) break

            try {
              const record = JSON.parse(line)
              const timestamp = new Date(record.timestamp).getTime()

              if (isNaN(timestamp) || !record.project) continue

              let pastedContents = record.pastedContents || {}
              if (pastedContents && typeof pastedContents === 'object') {
                pastedContents = expandPastedContents(pastedContents, CLAUDE_DIR)
              }

              let images = record.images || []
              const recordSessionId = record.sessionId || ''
              if (images.length === 0 && record.prompt && record.prompt.includes('[Image #')) {
                try {
                  const extractedImages = await extractImagesFromProjects(
                    recordSessionId,
                    record.project,
                    savePath,
                    record.prompt,
                    CLAUDE_DIR
                  )
                  images = extractedImages
                } catch (err) {
                  console.error('读取历史时提取图片失败:', err)
                }
              }

              records.push({
                timestamp,
                project: record.project,
                sessionId: recordSessionId,
                display: record.prompt || '',
                pastedContents,
                images
              })
            } catch (e) {
              console.error('解析记录失败:', e, '行内容:', line.substring(0, 100))
            }
          }
        } catch (fileError) {
          console.error(`读取文件 ${file} 失败:`, fileError)
        }
      }

      return { success: true, records }
    } catch (error) {
      console.error('读取历史记录时发生错误:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 删除单条历史记录（包括相关图片）
  ipcMain.handle('delete-record', async (_, targetSessionId: string, timestamp: number) => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) return { success: false, error: '未配置保存路径' }
      if (!fs.existsSync(savePath)) return { success: false, error: '保存路径不存在' }

      const files = fs.readdirSync(savePath).filter((f: string) => f.endsWith('.jsonl'))
      let recordFound = false
      let recordToDelete: any = null

      for (const file of files) {
        const filePath = path.join(savePath, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n').filter((line: string) => line.trim())
        const newLines: string[] = []
        let fileModified = false

        for (const line of lines) {
          try {
            const record = JSON.parse(line)
            const recordTimestamp = new Date(record.timestamp).getTime()
            const recordSessionId = record.sessionId || `single-${recordTimestamp}`

            if (recordSessionId === targetSessionId && recordTimestamp === timestamp) {
              recordFound = true
              recordToDelete = record
              fileModified = true
              continue
            }

            newLines.push(line)
          } catch (e) {
            newLines.push(line)
          }
        }

        if (fileModified) {
          if (newLines.length === 0) {
            fs.unlinkSync(filePath)
          } else {
            fs.writeFileSync(filePath, newLines.join('\n') + '\n', 'utf-8')
          }
        }
      }

      if (!recordFound) return { success: false, error: '未找到该记录' }

      // 删除相关图片
      if (recordToDelete?.images && Array.isArray(recordToDelete.images)) {
        const imagesDir = path.join(savePath, 'images')
        for (const imagePath of recordToDelete.images) {
          try {
            const fullImagePath = path.join(imagesDir, path.basename(imagePath))
            if (fs.existsSync(fullImagePath)) {
              fs.unlinkSync(fullImagePath)
            }
          } catch (error) {
            console.error('删除图片失败:', error)
          }
        }
      }

      return { success: true }
    } catch (error) {
      console.error('删除记录失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  /**
   * 读取会话的 image-cache 图片列表
   * 从 ~/.claude/image-cache/{sessionId}/ 和 ~/.claude/images/{sessionId}/ 读取
   */
  ipcMain.handle('read-session-image-cache', async (_, sessionId: string) => {
    try {
      if (!sessionId) return { success: false, error: 'sessionId 不能为空', images: [] }

      const images: Array<{ filename: string; dataUrl: string }> = []
      const dirs = [
        path.join(CLAUDE_DIR, 'image-cache', sessionId),
        path.join(CLAUDE_DIR, 'images', sessionId)
      ]

      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue

        const files = fs
          .readdirSync(dir)
          .filter((f: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))

        for (const file of files) {
          /* 避免重复（两个目录可能有相同文件名） */
          if (images.some(img => img.filename === file)) continue

          const filePath = path.join(dir, file)
          const buffer = fs.readFileSync(filePath)
          const ext = path.extname(file).toLowerCase()
          const mime =
            ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : ext === '.gif'
                ? 'image/gif'
                : ext === '.webp'
                  ? 'image/webp'
                  : 'image/png'

          images.push({
            filename: file,
            dataUrl: `data:${mime};base64,${buffer.toString('base64')}`
          })
        }
      }

      /* 按文件名中的数字排序 */
      images.sort((a, b) =>
        a.filename.localeCompare(b.filename, undefined, { numeric: true })
      )

      return { success: true, images }
    } catch (error) {
      console.error('读取 image-cache 失败:', error)
      return { success: false, error: (error as Error).message, images: [] }
    }
  })

  /**
   * 读取会话的 paste-cache 粘贴内容
   * 从 history.jsonl 中找到该会话的 pastedContents，展开 contentHash 引用
   */
  ipcMain.handle('read-session-paste-cache', async (_, sessionId: string) => {
    try {
      if (!sessionId) return { success: false, error: 'sessionId 不能为空', pastes: [] }

      const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl')
      const pastes: Array<{
        key: string
        filename: string
        content: string
        contentHash?: string
        timestamp?: number
      }> = []

      if (!fs.existsSync(HISTORY_FILE)) {
        return { success: true, pastes }
      }

      const lines = fs
        .readFileSync(HISTORY_FILE, 'utf-8')
        .split('\n')
        .filter((l: string) => l.trim())

      const seenHashes = new Set<string>()

      for (const line of lines) {
        try {
          const record = JSON.parse(line)
          if (record.sessionId !== sessionId) continue
          if (!record.pastedContents || typeof record.pastedContents !== 'object') continue

          const recordTimestamp = new Date(record.timestamp).getTime()

          for (const [key, value] of Object.entries(record.pastedContents)) {
            if (!value || typeof value !== 'object') continue
            const v = value as any
            let content = v.content || ''
            const contentHash = v.contentHash || ''

            /* 去重 */
            if (contentHash && seenHashes.has(contentHash)) continue
            if (contentHash) seenHashes.add(contentHash)

            /* 从 paste-cache 展开 */
            if (!content && contentHash) {
              const pasteFilePath = path.join(CLAUDE_DIR, 'paste-cache', `${contentHash}.txt`)
              if (fs.existsSync(pasteFilePath)) {
                content = fs.readFileSync(pasteFilePath, 'utf-8')
              }
            }

            if (content) {
              pastes.push({
                key,
                filename: v.basename || key,
                content,
                contentHash: contentHash || undefined,
                timestamp: isNaN(recordTimestamp) ? undefined : recordTimestamp
              })
            }
          }
        } catch {
          /* 跳过无效行 */
        }
      }

      return { success: true, pastes }
    } catch (error) {
      console.error('读取 paste-cache 失败:', error)
      return { success: false, error: (error as Error).message, pastes: [] }
    }
  })
}
