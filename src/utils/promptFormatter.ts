/**
 * Prompt 格式化工具
 * 处理 pastedContents 的替换和格式化
 */

/**
 * 检测内容是否为 JSON
 */
const isJSON = (str: string): boolean => {
  try {
    JSON.parse(str)
    return true
  } catch {
    return false
  }
}

/**
 * 格式化内容
 * - JSON 自动格式化
 * - 其他内容保持原样
 */
export const formatContent = (content: string): string => {
  if (isJSON(content)) {
    try {
      return JSON.stringify(JSON.parse(content), null, 2)
    } catch {
      return content
    }
  }
  return content
}

/**
 * 替换 prompt 中的 pastedContents 占位符
 * 例如：[Pasted text #1 +19 lines] -> 实际内容
 */
export const replacePastedContents = (
  prompt: string,
  pastedContents: Record<string, any>
): string => {
  if (!pastedContents || Object.keys(pastedContents).length === 0) {
    return prompt
  }

  let result = prompt

  // 匹配占位符：[Pasted text #N +X lines] 或 [Pasted text #N]
  const regex = /\[Pasted text #(\d+)(?:\s+\+\d+\s+lines)?\]/g

  result = result.replace(regex, (match, index) => {
    const key = `Pasted text #${index}`
    const content = pastedContents[key]

    if (content !== undefined) {
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      return `\n\n--- ${key} ---\n${formatContent(contentStr)}\n--- End ---\n\n`
    }

    return match // 如果找不到对应内容，保持原样
  })

  return result
}

/**
 * 检查文本是否超过指定行数
 */
export const isTextOverflowing = (text: string, maxLines: number): boolean => {
  const lines = text.split('\n')
  return lines.length > maxLines
}

/**
 * 格式化 pastedContents 用于弹窗显示
 */
export const formatPastedContentsForModal = (
  pastedContents: Record<string, any>
): Array<{ key: string; content: string }> => {
  return Object.entries(pastedContents).map(([key, value]) => {
    const contentStr = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    return {
      key,
      content: formatContent(contentStr)
    }
  })
}
