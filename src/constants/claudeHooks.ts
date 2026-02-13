/**
 * Claude Code Hooks 配置常量
 * 基于官方文档: https://docs.anthropic.com/en/docs/claude-code/hooks
 */

export interface ClaudeHookOption {
  /* 事件名称（官方原名） */
  type: string
  /* 中文描述 */
  description: string
  /* 触发时机 */
  triggerTiming: string
  /* 是否支持 matcher */
  supportsMatcher: boolean
  /* matcher 匹配目标 */
  matcherTarget?: string
  /* 是否可阻止（exit code 2） */
  canBlock: boolean
}

/* Claude Code 官方 Hook 事件 */
export const CLAUDE_HOOK_OPTIONS: ClaudeHookOption[] = [
  {
    type: 'SessionStart',
    description: '会话开始或恢复时触发',
    triggerTiming: '会话启动/恢复',
    supportsMatcher: true,
    matcherTarget: 'startup, resume, clear, compact',
    canBlock: false
  },
  {
    type: 'UserPromptSubmit',
    description: '用户提交提示后、Claude 处理前触发',
    triggerTiming: '用户发送消息时',
    supportsMatcher: false,
    canBlock: true
  },
  {
    type: 'PreToolUse',
    description: '工具调用执行前触发，可阻止调用',
    triggerTiming: '工具执行前',
    supportsMatcher: true,
    matcherTarget: 'Bash, Edit, Write, mcp__.*',
    canBlock: true
  },
  {
    type: 'PermissionRequest',
    description: '权限对话框出现时触发',
    triggerTiming: '请求权限时',
    supportsMatcher: true,
    matcherTarget: '工具名称',
    canBlock: true
  },
  {
    type: 'PostToolUse',
    description: '工具调用成功后触发',
    triggerTiming: '工具执行成功后',
    supportsMatcher: true,
    matcherTarget: 'Bash, Edit, Write, mcp__.*',
    canBlock: false
  },
  {
    type: 'PostToolUseFailure',
    description: '工具调用失败后触发',
    triggerTiming: '工具执行失败后',
    supportsMatcher: true,
    matcherTarget: '工具名称',
    canBlock: false
  },
  {
    type: 'Notification',
    description: 'Claude Code 发送通知时触发',
    triggerTiming: '通知发送时',
    supportsMatcher: true,
    matcherTarget: 'permission_prompt, idle_prompt, auth_success',
    canBlock: false
  },
  {
    type: 'SubagentStart',
    description: '子代理生成时触发',
    triggerTiming: '子代理启动时',
    supportsMatcher: true,
    matcherTarget: 'Bash, Explore, Plan',
    canBlock: false
  },
  {
    type: 'SubagentStop',
    description: '子代理完成时触发',
    triggerTiming: '子代理结束时',
    supportsMatcher: true,
    matcherTarget: '代理名称',
    canBlock: true
  },
  {
    type: 'Stop',
    description: 'Claude 完成响应时触发',
    triggerTiming: '回复结束时',
    supportsMatcher: false,
    canBlock: true
  },
  {
    type: 'TeammateIdle',
    description: '代理团队队友即将闲置时触发',
    triggerTiming: '队友闲置前',
    supportsMatcher: false,
    canBlock: true
  },
  {
    type: 'TaskCompleted',
    description: '任务标记为完成时触发',
    triggerTiming: '任务完成时',
    supportsMatcher: false,
    canBlock: true
  },
  {
    type: 'PreCompact',
    description: '上下文压缩前触发',
    triggerTiming: '上下文压缩前',
    supportsMatcher: true,
    matcherTarget: 'manual, auto',
    canBlock: false
  },
  {
    type: 'SessionEnd',
    description: '会话终止时触发',
    triggerTiming: '会话结束时',
    supportsMatcher: true,
    matcherTarget: 'clear, logout, prompt_input_exit',
    canBlock: false
  }
]

/* 生成 Hook 的 JSON 配置预览 */
export const generateHookJson = (values: {
  type?: string
  matcher?: string
  handlerType?: 'command' | 'prompt' | 'agent'
  command?: string
  prompt?: string
  timeout?: number
  async?: boolean
}): string => {
  if (!values.type) return '{}'

  const handler: Record<string, any> = {
    type: values.handlerType || 'command'
  }

  if (values.handlerType === 'command' || !values.handlerType) {
    if (values.command) handler.command = values.command
    if (values.async) handler.async = true
  } else {
    if (values.prompt) handler.prompt = values.prompt
  }

  if (values.timeout) handler.timeout = values.timeout

  const matcherGroup: Record<string, any> = {
    hooks: [handler]
  }

  if (values.matcher) {
    matcherGroup.matcher = values.matcher
  }

  const config = {
    hooks: {
      [values.type]: [matcherGroup]
    }
  }

  return JSON.stringify(config, null, 2)
}
