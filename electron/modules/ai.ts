/**
 * AI 服务模块
 * 负责 AI 总结（流式/非流式）、AI 对话、Prompt 格式化
 */

import { request as httpRequest } from '../utils/http'
import type { ModuleContext } from './types'

// ========== 提示词模板 ==========

const buildConversationsText = (records: any[]): string =>
  records
    .map(
      (record: any, index: number) =>
        `[对话 ${index + 1}]\n时间: ${new Date(record.timestamp).toLocaleString('zh-CN')}\n内容: ${record.display}`
    )
    .join('\n\n---\n\n')

const getSummaryPrompt = (type: 'brief' | 'detailed', conversations: string): string => {
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

  return templates[type] || templates.detailed
}

// ========== 格式化 System Prompt ==========

const FORMAT_SYSTEM_PROMPT = `你是一个专业的 Markdown 格式化助手。请将用户提供的内容转换为结构化、美观的 Markdown 格式。

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
- 表格必须确保每一行（表头、分隔符、数据行）独占一行
- 如果内容已经是良好的 Markdown 且表格格式正确，保持原样

示例 1 - 代码格式化：
输入：请帮我写一个函数 function add(a, b) { return a + b }
输出：
请帮我写一个函数

\`\`\`javascript
function add(a, b) {
  return a + b;
}
\`\`\`

示例 2 - 修复单行表格：
输入：| 需求项 | 详情 | 确认 | | --- | --- | --- | | 接口返回数据 | 一次性返回 | | | 前端分页 | 数据处理 | |
输出：
| 需求项 | 详情 | 确认 |
|---------|--------|------|
| 接口返回数据 | 一次性返回 | ✓ |
| 前端分页 | 数据处理 | ✓ |`

// ========== 提供商名称映射 ==========

const PROVIDER_NAMES: Record<string, string> = {
  groq: 'Groq',
  deepseek: 'DeepSeek',
  gemini: 'Google Gemini',
  custom: '自定义'
}

// ========== IPC 处理器注册 ==========

export const registerAIHandlers = (ctx: ModuleContext) => {
  const {
    electron: { ipcMain },
    store
  } = ctx

  // AI 总结功能（非流式）
  ipcMain.handle(
    'summarize-records',
    async (event, request: { records: any[]; type: 'brief' | 'detailed' }) => {
      try {
        const aiSummarySettings = store.get('aiSummary') as any

        if (!aiSummarySettings || !aiSummarySettings.enabled) {
          return {
            success: false,
            error: 'AI 总结功能未启用，请先在设置中启用'
          }
        }

        const provider: string = aiSummarySettings.provider || 'groq'
        const currentConfig = aiSummarySettings.providers?.[provider]

        if (!currentConfig || !currentConfig.apiKey) {
          return {
            success: false,
            error: `未配置 ${PROVIDER_NAMES[provider] || 'AI'} API Key，请前往设置页面配置`
          }
        }

        // 验证 API Key 格式
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
        if (provider === 'custom') {
          if (!currentConfig.apiBaseUrl)
            return { success: false, error: '自定义提供商需要配置 API 地址' }
          if (!currentConfig.model) return { success: false, error: '自定义提供商需要配置模型名称' }
        }

        if (!request.records || request.records.length === 0) {
          return { success: false, error: '没有可总结的记录' }
        }

        const conversations = buildConversationsText(request.records)
        const prompt = getSummaryPrompt(request.type, conversations)

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        try {
          if (provider === 'gemini') {
            return await callGeminiSummary(currentConfig, prompt, controller, timeoutId, event)
          }
          return await callOpenAISummary(currentConfig, prompt, controller, timeoutId, event)
        } catch (error: any) {
          clearTimeout(timeoutId)
          if (error.name === 'AbortError') {
            return { success: false, error: '请求超时，请检查网络连接' }
          }
          return { success: false, error: error.message || '未知错误' }
        }
      } catch (error: any) {
        return { success: false, error: error.message || '总结失败' }
      }
    }
  )

  // 流式 AI 总结功能
  ipcMain.handle(
    'summarize-records-stream',
    async (event, request: { records: any[]; type: 'brief' | 'detailed' }) => {
      try {
        const aiSummarySettings = store.get('aiSummary') as any

        if (!aiSummarySettings || !aiSummarySettings.enabled) {
          event.sender.send('summary-stream-error', 'AI 总结功能未启用，请先在设置中启用')
          return
        }

        const provider: string = aiSummarySettings.provider || 'groq'
        const currentConfig = aiSummarySettings.providers?.[provider]

        if (!currentConfig || !currentConfig.apiKey) {
          event.sender.send(
            'summary-stream-error',
            `未配置 ${PROVIDER_NAMES[provider] || 'AI'} API Key，请前往设置页面配置`
          )
          return
        }

        if (!request.records || request.records.length === 0) {
          event.sender.send('summary-stream-error', '没有可总结的记录')
          return
        }

        if (provider === 'gemini') {
          event.sender.send('summary-stream-error', 'Gemini 暂不支持流式输出，请使用普通总结')
          return
        }

        const conversations = buildConversationsText(request.records)
        const prompt = getSummaryPrompt(request.type, conversations)

        await streamOpenAIResponse(
          currentConfig,
          prompt,
          chunk => event.sender.send('summary-stream-chunk', chunk),
          () => event.sender.send('summary-stream-complete'),
          error => event.sender.send('summary-stream-error', error),
          event.sender
        )
      } catch (error: any) {
        event.sender.send('summary-stream-error', error.message || '总结失败')
      }
    }
  )

  // AI 对话流式响应
  ipcMain.handle('chat-stream', async (event, request: { messages: any[] }) => {
    try {
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

      const cleanedMessages = request.messages.map((m: any) => ({
        role: m.role,
        content: m.content
      }))

      const response = await httpRequest<Response>({
        url: `${apiBaseUrl}/chat/completions`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
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

      processSSEStream(
        response,
        chunk => event.sender.send('chat-stream-chunk', chunk),
        () => event.sender.send('chat-stream-complete'),
        error => event.sender.send('chat-stream-error', error)
      )
    } catch (error: any) {
      event.sender.send('chat-stream-error', error.message || '对话失败')
    }
  })

  // AI 格式化 Prompt
  ipcMain.handle(
    'format-prompt',
    async (
      event,
      request: { content: string; contentHash?: string }
    ): Promise<{ success: boolean; formatted?: string; error?: string }> => {
      try {
        const aiSummarySettings = store.get('aiSummary') as any

        if (!aiSummarySettings) {
          return { success: false, error: 'AI 配置不存在' }
        }

        // 检查缓存
        const PROMPT_VERSION = 'v3'
        if (request.contentHash) {
          const cacheKey = `formatted_${PROMPT_VERSION}_${request.contentHash}`
          const cached = store.get(cacheKey) as string | undefined
          if (cached) return { success: true, formatted: cached }
        }

        const provider: string = aiSummarySettings.provider || 'groq'
        const currentConfig = aiSummarySettings.providers?.[provider]

        if (!currentConfig || !currentConfig.apiKey) {
          return { success: false, error: 'AI 配置不完整' }
        }

        // 预处理：修复单行表格格式
        let processedContent = request.content
        if (processedContent.includes('|') && processedContent.includes('---')) {
          processedContent = processedContent
            .replace(/\|\s*\|\s*/g, '|\n|')
            .replace(/\n\s*\n/g, '\n')
        }

        const timeout = aiSummarySettings.formatTimeout || 15000
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        let formatted = ''

        if (provider === 'gemini') {
          const response = await httpRequest<Response>({
            url: `${currentConfig.apiBaseUrl}/models/${currentConfig.model}:generateContent?key=${currentConfig.apiKey}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text:
                        FORMAT_SYSTEM_PROMPT + '\n\n--- 需要格式化的内容 ---\n\n' + processedContent
                    }
                  ]
                }
              ],
              generationConfig: { temperature: 0.3, maxOutputTokens: 4000 }
            }),
            signal: controller.signal,
            webContents: event.sender
          })

          clearTimeout(timeoutId)
          if (!response.ok) return { success: false, error: 'Gemini API 调用失败' }

          const data = (await response.json()) as any
          formatted = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        } else {
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
                { role: 'system', content: FORMAT_SYSTEM_PROMPT },
                { role: 'user', content: processedContent }
              ],
              temperature: 0.3,
              max_tokens: 4000
            }),
            signal: controller.signal,
            webContents: event.sender
          })

          clearTimeout(timeoutId)
          if (!response.ok) return { success: false, error: 'API 调用失败' }

          const data = (await response.json()) as any
          formatted = data.choices?.[0]?.message?.content || ''
        }

        if (!formatted) return { success: false, error: '格式化结果为空' }

        // 缓存结果
        if (request.contentHash) {
          const cacheKey = `formatted_${PROMPT_VERSION}_${request.contentHash}`
          store.set(cacheKey, formatted)
        }

        return { success: true, formatted: formatted.trim() }
      } catch (error: any) {
        if (error.name === 'AbortError') return { success: false, error: '格式化超时' }
        return { success: false, error: error.message || '格式化失败' }
      }
    }
  )
}

// ========== 内部辅助函数 ==========

/**
 * Gemini 非流式调用
 */
const callGeminiSummary = async (
  config: any,
  prompt: string,
  controller: AbortController,
  timeoutId: ReturnType<typeof setTimeout>,
  event: any
) => {
  const response = await httpRequest<Response>({
    url: `${config.apiBaseUrl}/models/${config.model}:generateContent?key=${config.apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      generationConfig: { temperature: 0.3, maxOutputTokens: 2000 }
    }),
    signal: controller.signal,
    webContents: event.sender
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

  if (!summary) return { success: false, error: 'Gemini API 返回格式异常' }

  return {
    success: true,
    summary: summary.trim(),
    tokensUsed: data.usageMetadata?.totalTokenCount || 0
  }
}

/**
 * OpenAI 兼容格式非流式调用
 */
const callOpenAISummary = async (
  config: any,
  prompt: string,
  controller: AbortController,
  timeoutId: ReturnType<typeof setTimeout>,
  event: any
) => {
  const response = await httpRequest<Response>({
    url: `${config.apiBaseUrl}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content:
            '你是一个专业的技术对话总结助手，擅长提取关键信息和技术要点。请使用简洁清晰的中文进行总结。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    }),
    signal: controller.signal,
    webContents: event.sender
  })

  clearTimeout(timeoutId)

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as any
    const errorMessage = errorData.error?.message || response.statusText

    const errorMap: Record<number, string> = {
      401: 'API Key 无效或已过期，请检查并重新配置',
      402: 'DeepSeek 账户余额不足，请前往 https://platform.deepseek.com 充值',
      429: 'API 调用频率超限，请稍后再试',
      500: 'DeepSeek 服务暂时不可用，请稍后再试',
      502: 'DeepSeek 服务暂时不可用，请稍后再试',
      503: 'DeepSeek 服务暂时不可用，请稍后再试'
    }

    return {
      success: false,
      error: errorMap[response.status] || `API 错误 (${response.status}): ${errorMessage}`
    }
  }

  const data = (await response.json()) as any

  if (!data.choices?.[0]?.message) {
    return { success: false, error: 'DeepSeek API 返回格式异常' }
  }

  return {
    success: true,
    summary: data.choices[0].message.content.trim(),
    tokensUsed: data.usage?.total_tokens || 0
  }
}

/**
 * OpenAI 兼容格式流式调用
 */
const streamOpenAIResponse = async (
  config: any,
  prompt: string,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: string) => void,
  webContents: any
) => {
  const response = await httpRequest<Response>({
    url: `${config.apiBaseUrl}/chat/completions`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content:
            '你是一个专业的技术对话总结助手，擅长提取关键信息和技术要点。请使用简洁清晰的中文进行总结。'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      stream: true
    }),
    webContents
  })

  if (!response.ok) {
    await response.json().catch(() => ({}))
    onError(`API 错误: ${response.status}`)
    return
  }

  if (!response.body || typeof response.body === 'string') {
    onError('响应格式错误')
    return
  }

  processSSEStream(response, onChunk, onComplete, onError)
}

/**
 * 处理 SSE 流式响应
 */
const processSSEStream = (
  response: Response,
  onChunk: (chunk: string) => void,
  onComplete: () => void,
  onError: (error: string) => void
) => {
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
            onComplete()
            return
          }

          try {
            const json = JSON.parse(data)
            const content = json.choices?.[0]?.delta?.content
            if (content) onChunk(content)
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    })
    .on('end', () => onComplete())
    .on('error', (error: Error) => onError(error.message || '流式读取失败'))
}
