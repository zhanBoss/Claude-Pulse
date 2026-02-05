/**
 * HTTP 请求工具
 * 封装 fetch 并提供 cURL 命令打印功能
 */

import fetch from 'electron-fetch'
import { WebContents } from 'electron'

interface RequestOptions extends RequestInit {
  url: string
  timeout?: number
  webContents?: WebContents  // 可选,用于将日志发送到渲染进程 DevTools
}

/**
 * 生成 cURL 命令字符串
 */
const generateCurlCommand = (url: string, options: RequestInit): string => {
  const method = options.method || 'GET'
  const headers = options.headers as Record<string, string> || {}

  let curl = `curl -X ${method} '${url}'`

  // 添加请求头
  Object.entries(headers).forEach(([key, value]) => {
    curl += ` \\\n  -H '${key}: ${value}'`
  })

  // 添加请求体
  if (options.body) {
    const body = typeof options.body === 'string'
      ? options.body
      : JSON.stringify(options.body)

    // 转义单引号
    const escapedBody = body.replace(/'/g, "'\\''")
    curl += ` \\\n  -d '${escapedBody}'`
  }

  return curl
}

/**
 * 封装的 fetch 请求器
 * 自动打印 cURL 命令到控制台
 */
export const request = async <T = any>(options: RequestOptions): Promise<T> => {
  const { url, timeout, webContents, ...fetchOptions } = options

  // 生成并打印 cURL 命令
  const curlCommand = generateCurlCommand(url, fetchOptions)

  // 同时输出到主进程控制台和渲染进程 DevTools
  console.log('\n[HTTP Request] cURL Command:')
  console.log(curlCommand)
  console.log('')

  // 如果提供了 webContents,也发送到渲染进程
  if (webContents && !webContents.isDestroyed()) {
    webContents.executeJavaScript(`
      console.log('%c[HTTP Request] cURL Command:', 'color: #4CAF50; font-weight: bold');
      console.log(\`${curlCommand.replace(/`/g, '\\`')}\`);
    `).catch(() => {
      // 忽略错误,可能是 webContents 已销毁
    })
  }

  // 如果没有传入 signal 且设置了 timeout,创建 AbortController
  let controller: AbortController | undefined
  let timeoutId: NodeJS.Timeout | undefined

  if (!fetchOptions.signal && timeout) {
    controller = new AbortController()
    timeoutId = setTimeout(() => controller!.abort(), timeout)
    fetchOptions.signal = controller.signal
  }

  try {
    const response = await fetch(url, fetchOptions as any)

    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // 打印响应状态
    const statusMsg = `[HTTP Response] ${response.status} ${response.statusText}`
    console.log(statusMsg)

    // 同时发送到渲染进程
    if (webContents && !webContents.isDestroyed()) {
      const statusColor = response.ok ? '#4CAF50' : '#F44336'
      webContents.executeJavaScript(`
        console.log('%c${statusMsg}', 'color: ${statusColor}; font-weight: bold');
      `).catch(() => {})
    }

    // 如果响应不成功,抛出错误
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
    }

    return response as T
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    const errorMsg = `[HTTP Error] ${error}`
    console.error(errorMsg)

    // 发送错误到渲染进程
    if (webContents && !webContents.isDestroyed()) {
      webContents.executeJavaScript(`
        console.error('%c[HTTP Error]', 'color: #F44336; font-weight: bold', ${JSON.stringify(String(error))});
      `).catch(() => {})
    }

    throw error
  }
}

/**
 * JSON 请求简化方法
 */
export const requestJSON = async <T = any>(options: RequestOptions): Promise<T> => {
  const response = await request<Response>({
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  return response.json() as Promise<T>
}

/**
 * 流式请求简化方法
 */
export const requestStream = async (options: RequestOptions): Promise<Response> => {
  return request<Response>(options)
}
