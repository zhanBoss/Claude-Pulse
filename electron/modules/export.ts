/**
 * 导出服务模块
 * 负责记录导出（Markdown/HTML/PDF）和 AI 对话历史导出
 */

import fs from 'fs'
import path from 'path'
import type { ModuleContext } from './types'

// ========== 语法高亮器 ==========

/** 各语言关键字集合 */
const KEYWORD_SETS: Record<string, string[]> = {
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
    'auto',
    'bool',
    'break',
    'case',
    'catch',
    'char',
    'class',
    'const',
    'constexpr',
    'continue',
    'default',
    'delete',
    'do',
    'double',
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
    'nullptr',
    'operator',
    'private',
    'protected',
    'public',
    'return',
    'short',
    'signed',
    'sizeof',
    'static',
    'struct',
    'switch',
    'template',
    'this',
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
    'while'
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

/**
 * 基于正则的语法高亮器
 */
const highlightCode = (code: string, language: string): string => {
  const lang = language.toLowerCase()
  const keywords = KEYWORD_SETS[lang] || KEYWORD_SETS['javascript'] || []
  const keywordSet = new Set(keywords)
  const caseSensitive = lang !== 'sql'

  const tokens: string[] = []
  let i = 0

  while (i < code.length) {
    // 多行注释
    if (code[i] === '/' && code[i + 1] === '*') {
      let end = code.indexOf('*/', i + 2)
      if (end === -1) end = code.length
      else end += 2
      tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
      i = end
      continue
    }

    // 单行注释 //
    if (code[i] === '/' && code[i + 1] === '/') {
      let end = code.indexOf('\n', i)
      if (end === -1) end = code.length
      tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
      i = end
      continue
    }

    // Python/Shell # 注释
    if (code[i] === '#' && ['python', 'ruby', 'shell', 'bash', 'yaml', 'yml'].includes(lang)) {
      let end = code.indexOf('\n', i)
      if (end === -1) end = code.length
      tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
      i = end
      continue
    }

    // SQL -- 注释
    if (code[i] === '-' && code[i + 1] === '-' && lang === 'sql') {
      let end = code.indexOf('\n', i)
      if (end === -1) end = code.length
      tokens.push(`<span class="hl-comment">${code.slice(i, end)}</span>`)
      i = end
      continue
    }

    // 模板字符串
    if (code[i] === '`' && ['javascript', 'typescript', 'js', 'ts', 'jsx', 'tsx'].includes(lang)) {
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

    // 字符串
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

    // Python 三引号字符串
    if ((code.slice(i, i + 3) === '"""' || code.slice(i, i + 3) === "'''") && lang === 'python') {
      const triple = code.slice(i, i + 3)
      let j = i + 3
      const end = code.indexOf(triple, j)
      if (end === -1) j = code.length
      else j = end + 3
      tokens.push(`<span class="hl-string">${code.slice(i, j)}</span>`)
      i = j
      continue
    }

    // 数字
    if (/[0-9]/.test(code[i]) && (i === 0 || !/[a-zA-Z_$]/.test(code[i - 1]))) {
      let j = i
      if (code[i] === '0' && code[i + 1] && /[xXbBoO]/.test(code[i + 1])) {
        j += 2
        while (j < code.length && /[0-9a-fA-F_]/.test(code[j])) j++
      } else {
        while (j < code.length && /[0-9._eE]/.test(code[j])) j++
      }
      if (j < code.length && /[nfFlLuU]/.test(code[j])) j++
      tokens.push(`<span class="hl-number">${code.slice(i, j)}</span>`)
      i = j
      continue
    }

    // 标识符/关键字
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

    // 运算符
    if (/[+\-*/%=<>!&|^~?:.]/.test(code[i])) {
      let j = i
      while (j < code.length && /[+\-*/%=<>!&|^~?:.]/.test(code[j]) && j - i < 3) j++
      tokens.push(`<span class="hl-operator">${code.slice(i, j)}</span>`)
      i = j
      continue
    }

    tokens.push(code[i])
    i++
  }

  return tokens.join('')
}

// ========== HTML 生成 ==========

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

const formatContent = (content: string): string => {
  let html = escapeHtml(content)

  // 代码块
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang || 'text'
    const langDisplay = language.toUpperCase()
    const highlightedCode = highlightCode(code, language)
    return `<pre data-lang="${langDisplay}"><code class="language-${language}">${highlightedCode}</code></pre>`
  })

  // 行内代码
  html = html.replace(/`([^`]+)`/g, "<code class='inline-code'>$1</code>")

  // 换行
  html = html.replace(/\n(?![^<]*<\/pre>)/g, '<br>')

  return html
}

/** 生成 Markdown 格式的对话历史 */
const generateMarkdown = (
  messages: Array<{ role: string; content: string; timestamp: number }>
): string => {
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

/** 生成 HTML 格式的对话历史 */
const generateHTML = (
  messages: Array<{ role: string; content: string; timestamp: number }>
): string => {
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
        <div class="role" style="font-weight: 600; font-size: 14px; color: #333; margin-bottom: 8px;">${role}</div>
        <div class="time" style="font-size: 12px; color: #666; margin-bottom: 12px;">${time}</div>
        <div class="content" style="line-height: 1.7; color: #333; font-size: 14px;">${formatContent(msg.content)}</div>
      </div>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI 对话历史</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; padding: 40px 20px; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { font-size: 28px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
    .export-info { font-size: 13px; color: #666; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e0e0e0; }
    .inline-code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-family: "SF Mono", "Fira Code", "Consolas", monospace; font-size: 0.9em; color: #d97757; border: 1px solid #e0e0e0; }
    pre { background: #1e1e2e; padding: 40px 20px 16px 20px; border-radius: 8px; overflow-x: auto; margin: 12px 0; border: 1px solid #313244; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); position: relative; }
    pre code { color: #cdd6f4; background: none; padding: 0; font-family: "SF Mono", "Fira Code", "Consolas", monospace; font-size: 13px; line-height: 1.65; display: block; white-space: pre; tab-size: 2; }
    .hl-keyword { color: #cba6f7; font-weight: 600; }
    .hl-string { color: #a6e3a1; }
    .hl-number { color: #fab387; }
    .hl-comment { color: #6c7086; font-style: italic; }
    .hl-function { color: #89b4fa; }
    .hl-operator { color: #89dceb; }
    pre::before { content: attr(data-lang); position: absolute; top: 10px; right: 14px; font-size: 11px; color: #6c7086; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🤖 AI 对话历史</h1>
    <div class="export-info">导出时间: ${new Date().toLocaleString('zh-CN')}</div>
    ${messageHtml}
  </div>
</body>
</html>`.trim()
}

// ========== IPC 处理器注册 ==========

export const registerExportHandlers = (ctx: ModuleContext) => {
  const {
    electron: { ipcMain, dialog, BrowserWindow, app },
    store
  } = ctx

  // 导出记录为 Markdown
  ipcMain.handle('export-records', async (_, options: any) => {
    try {
      const savePath = store.get('savePath', '') as string
      if (!savePath) return { success: false, error: '未配置保存路径' }
      if (!fs.existsSync(savePath)) return { success: false, error: '保存路径不存在' }

      const files = fs.readdirSync(savePath).filter((f: string) => f.endsWith('.jsonl'))
      if (files.length === 0) return { success: false, error: '没有找到记录文件' }

      // 解析所有记录
      const allRecords: any[] = []
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

              allRecords.push({
                timestamp,
                project: record.project,
                sessionId: record.sessionId || '',
                display: record.prompt || '',
                pastedContents: record.pastedContents || {},
                images: record.images || []
              })
            } catch (e) {
              // 跳过无效记录
            }
          }
        } catch (fileError) {
          console.error(`读取文件 ${file} 失败:`, fileError)
        }
      }

      if (allRecords.length === 0) return { success: false, error: '没有有效的记录' }

      // 过滤记录
      let filteredRecords = allRecords
      if (options.sessionIds?.length > 0) {
        filteredRecords = filteredRecords.filter(r => options.sessionIds.includes(r.sessionId))
      }
      if (options.startDate) {
        filteredRecords = filteredRecords.filter(r => r.timestamp >= options.startDate)
      }
      if (options.endDate) {
        filteredRecords = filteredRecords.filter(r => r.timestamp <= options.endDate)
      }

      if (filteredRecords.length === 0) return { success: false, error: '筛选后没有记录' }

      filteredRecords.sort((a, b) => a.timestamp - b.timestamp)

      // 按会话分组
      const sessions = new Map<string, any[]>()
      for (const record of filteredRecords) {
        const sessionId = record.sessionId || `single-${record.timestamp}`
        if (!sessions.has(sessionId)) sessions.set(sessionId, [])
        sessions.get(sessionId)!.push(record)
      }

      // 生成 Markdown
      const now = new Date()
      const dateStr = now.toISOString().split('T')[0]
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')

      let markdown = '# Claude Code 对话记录导出\n\n'
      markdown += `**导出时间**: ${now.toLocaleString('zh-CN')}\n\n`
      markdown += `**记录总数**: ${filteredRecords.length} 条对话\n\n`
      markdown += `**会话总数**: ${sessions.size} 个会话\n\n`
      markdown += '---\n\n'

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

        for (let i = 0; i < records.length; i++) {
          const record = records[i]
          markdown += `### 对话 #${i + 1}\n\n`
          markdown += `**时间**: ${new Date(record.timestamp).toLocaleString('zh-CN')}\n\n`
          markdown += '**内容**:\n\n```\n'
          markdown += record.display
          markdown += '\n```\n\n'

          if (record.pastedContents && Object.keys(record.pastedContents).length > 0) {
            markdown += '**附加内容**:\n\n'
            for (const [key, value] of Object.entries(record.pastedContents)) {
              markdown += `- 附件 ${key}:\n`
              if (typeof value === 'string') {
                markdown += '```\n' + value + '\n```\n\n'
              } else if (value && typeof value === 'object' && (value as any).content) {
                markdown += '```\n' + (value as any).content + '\n```\n\n'
              } else {
                markdown += '```json\n' + JSON.stringify(value, null, 2) + '\n```\n\n'
              }
            }
          }

          if (record.images?.length > 0) {
            markdown += '**图片**:\n\n'
            for (const imagePath of record.images) {
              markdown += `![图片](${imagePath})\n\n`
            }
          }

          markdown += '---\n\n'
        }

        sessionIndex++
      }

      // 保存文件
      const result = await dialog.showSaveDialog({
        title: '保存 Markdown 文件',
        defaultPath: `claude-code-export-${dateStr}-${timeStr}.md`,
        filters: [
          { name: 'Markdown Files', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || !result.filePath) return { success: false, error: '用户取消了保存' }

      fs.writeFileSync(result.filePath, markdown, 'utf-8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      console.error('导出记录失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 导出 AI 对话历史
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
        const chatMessages = messages.filter(msg => msg.role !== 'system')

        if (chatMessages.length === 0) return { success: false, error: '没有可导出的对话' }

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

        if (result.canceled || !result.filePath) return { success: false, error: '用户取消操作' }

        const filePath = result.filePath

        if (format === 'markdown') {
          fs.writeFileSync(filePath, generateMarkdown(chatMessages), 'utf-8')
        } else if (format === 'html' || format === 'word') {
          fs.writeFileSync(filePath, generateHTML(chatMessages), 'utf-8')
        } else if (format === 'pdf') {
          const htmlContent = generateHTML(chatMessages)
          const tempHtmlPath = path.join(app.getPath('temp'), `chat-${Date.now()}.html`)
          fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8')

          const win = new BrowserWindow({ show: false })
          await win.loadFile(tempHtmlPath)
          const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
          })
          fs.writeFileSync(filePath, pdfData)
          win.close()

          fs.unlinkSync(tempHtmlPath)
        }

        return { success: true, filePath }
      } catch (error: any) {
        console.error('导出对话历史失败:', error)
        return { success: false, error: error.message || '导出失败' }
      }
    }
  )
}
