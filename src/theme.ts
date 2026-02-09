import { ThemeConfig, theme as antdTheme } from 'antd'

// 亮色模式主题
export const lightTheme: ThemeConfig = {
  token: {
    // 设计系统主色 - Claude Code 橙棕色
    colorPrimary: '#D97757',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#D97757',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    // 背景色
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBgLayout: '#f5f7fa',
    // 边框色
    colorBorder: '#e5e7eb',
    colorBorderSecondary: '#f3f4f6',
    // 文本色
    colorText: '#1f2937',
    colorTextSecondary: '#6b7280',
    colorTextTertiary: '#9ca3af'
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 32,
      fontWeight: 500
    },
    Card: {
      borderRadiusLG: 8,
      paddingLG: 16
    },
    Modal: {
      borderRadiusLG: 12
    },
    Input: {
      borderRadius: 6,
      controlHeight: 36
    },
    Tag: {
      borderRadiusSM: 4
    },
    Layout: {
      bodyBg: '#f5f7fa',
      headerBg: '#ffffff',
      siderBg: '#ffffff',
      triggerBg: '#f0f0f0'
    },
    Menu: {
      itemSelectedBg: '#FFF5ED', // 浅橙色/米色选中背景
      itemSelectedColor: '#D97757' // 选中文字颜色
    }
  }
}

// 暗色模式主题
export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...lightTheme.token,
    // 暗色模式特定配置 - 提高对比度
    colorBgContainer: '#1f1f1f',
    colorBgElevated: '#262626',
    colorBgLayout: '#141414',
    colorBorder: '#434343',
    colorBorderSecondary: '#303030',
    colorText: '#f0f0f0', // 提高主文字对比度
    colorTextSecondary: '#b8b8b8', // 提高次级文字对比度
    colorTextTertiary: '#8c8c8c' // 提高三级文字对比度
  },
  components: {
    ...lightTheme.components,
    Layout: {
      bodyBg: '#141414',
      headerBg: '#1f1f1f',
      siderBg: '#1f1f1f',
      triggerBg: '#262626'
    },
    Card: {
      ...lightTheme.components?.Card,
      colorBgContainer: '#1f1f1f'
    },
    Modal: {
      ...lightTheme.components?.Modal,
      contentBg: '#1f1f1f',
      headerBg: '#1f1f1f' // 与 contentBg 保持一致，避免颜色割裂
    },
    Menu: {
      itemSelectedBg: '#2A2420', // 深色模式下的深橙棕色选中背景
      itemSelectedColor: '#E88B6F' // 选中文字颜色(更亮)
    }
  }
}

// 向后兼容
export const theme = lightTheme

// 图表颜色方案 - 基于 Claude Code 主题色扩展
export const CHART_COLORS = [
  '#D97757', // primary - Claude Code 橙棕色
  '#52c41a', // success - 绿色
  '#722ed1', // purple - 紫色
  '#E88B6F', // primaryLight - 浅橙色
  '#eb2f96', // pink - 粉色
  '#13c2c2', // cyan - 青色
  '#2f54eb', // geekblue - 极客蓝
  '#C86847', // primaryHover - 深橙色
  '#a0d911', // lime - 青柠色
  '#f5222d'  // red - 红色
] as const

// 语义化统计颜色 - 用于数据可视化
export const STAT_COLORS = {
  // Token 相关 - 使用主题色
  tokens: '#D97757',
  // 成本相关 - 使用成功色
  cost: '#52c41a',
  // 会话/消息相关 - 使用紫色
  sessions: '#722ed1',
  messages: '#722ed1',
  // 项目/文件夹相关 - 使用浅橙色
  projects: '#E88B6F',
  folders: '#E88B6F',
  // 工具调用相关 - 使用青色
  tools: '#13c2c2',
  // 时间相关 - 使用极客蓝
  time: '#2f54eb',
  duration: '#2f54eb'
} as const

// 导出 CSS 变量用于内联样式
export const getThemeVars = (isDark: boolean) => ({
  bgContainer: isDark ? '#1f1f1f' : '#ffffff',
  bgElevated: isDark ? '#262626' : '#ffffff',
  bgLayout: isDark ? '#141414' : '#f5f7fa',
  bgSection: isDark ? '#1a1a1a' : '#f9fafb',
  bgCode: isDark ? '#1e1e1e' : '#f6f8fa',
  bgCodeHeader: isDark ? '#2a2a2a' : '#f6f8fa',
  border: isDark ? '#434343' : '#e5e7eb',
  borderSecondary: isDark ? '#303030' : '#f3f4f6',
  borderCode: isDark ? '#444' : '#ddd',
  borderQuote: isDark ? '#444' : '#ddd',
  text: isDark ? '#f0f0f0' : '#1f2937',
  textSecondary: isDark ? '#b8b8b8' : '#6b7280',
  textTertiary: isDark ? '#8c8c8c' : '#9ca3af',
  textWhite: '#fff',
  textQuote: isDark ? '#aaa' : '#666',
  textError: isDark ? '#e06c75' : '#d73a49',
  codeBg: isDark ? '#2a2a2a' : '#f3f4f6',
  hoverBg: isDark ? '#2a2a2a' : '#f9fafb',
  // 卡片/条目交互状态
  itemBorder: isDark ? '#303030' : '#f0f0f0',
  itemBg: isDark ? '#1a1a1a' : '#fafafa',
  itemHoverBorder: '#D97757',
  itemHoverBg: isDark ? '#2A2420' : '#FFF5ED',
  // Claude Code 主题色
  primary: '#D97757',
  primaryHover: '#C86847',
  primaryLight: '#E88B6F',
  primaryBg: isDark ? '#2A2420' : '#FFF5ED',
  primaryGradient: 'linear-gradient(135deg, #E88B6F 0%, #D97757 100%)',
  primaryShadow: 'rgba(217, 119, 87, 0.3)',
  // AI 消息背景色
  aiBg: isDark ? '#333' : '#fde3cf',
  // 状态颜色
  success: '#52c41a',
  successLight: isDark ? 'rgba(82, 196, 26, 0.15)' : 'rgba(82, 196, 26, 0.1)',
  successBorder: isDark ? 'rgba(82, 196, 26, 0.3)' : '#d9f7be',
  warning: '#faad14',
  warningLight: isDark ? 'rgba(250, 173, 20, 0.15)' : 'rgba(250, 173, 20, 0.1)',
  warningBorder: isDark ? 'rgba(250, 173, 20, 0.3)' : '#ffe58f',
  error: '#ff4d4f',
  errorLight: isDark ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 77, 79, 0.1)',
  errorBorder: isDark ? 'rgba(255, 77, 79, 0.3)' : '#ffccc7',
  // 语义化统计颜色
  statTokens: '#D97757',
  statCost: '#52c41a',
  statSessions: '#722ed1',
  statProjects: '#E88B6F',
  statTools: '#13c2c2',
  statTime: '#2f54eb',
  // 信息色
  info: isDark ? '#69b1ff' : '#1677ff',
  // 链接颜色 - 使用主题色
  link: isDark ? '#E88B6F' : '#D97757',
  linkHover: isDark ? '#D97757' : '#C86847',
  // 高亮颜色
  highlightBg: isDark ? 'rgba(217, 119, 87, 0.3)' : 'rgba(217, 119, 87, 0.2)',
  highlightText: '#fff',
  // 进度条颜色
  progressBg: isDark ? '#333' : '#eee',
  progressSuccess: '#52c41a',
  progressWarning: '#faad14',
  progressError: '#f5222d',
  // Tag 颜色（使用主题色替代默认蓝色）
  tagPrimary: '#D97757',
  tagPrimaryBg: isDark ? 'rgba(217, 119, 87, 0.15)' : 'rgba(217, 119, 87, 0.1)',
  tagPrimaryBorder: isDark ? 'rgba(217, 119, 87, 0.3)' : 'rgba(217, 119, 87, 0.3)',
  // Diff 颜色（GitHub 标准）
  diffAddBg: isDark ? '#2ea04370' : '#e6ffed',
  diffRemoveBg: isDark ? '#da363370' : '#ffeef0',
  diffAddText: isDark ? '#7ee787' : '#22863a',
  diffRemoveText: isDark ? '#f85149' : '#cb2431',
  diffNeutralText: isDark ? '#d4d4d4' : '#24292e',
  diffAddBorder: '#2ea043',
  diffRemoveBorder: '#da3633'
})
