import { ThemeConfig, theme as antdTheme } from 'antd'

export const lightTheme: ThemeConfig = {
  token: {
    colorPrimary: '#667eea',
    colorSuccess: '#52c41a',
    colorWarning: '#faad14',
    colorError: '#f5222d',
    colorInfo: '#1890ff',
    borderRadius: 6,
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 32,
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 8,
      paddingLG: 16,
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Input: {
      borderRadius: 6,
      controlHeight: 36,
    },
    Tag: {
      borderRadiusSM: 4,
    },
  },
}

export const darkTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...lightTheme.token,
  },
  components: {
    ...lightTheme.components,
  },
}

// 向后兼容
export const theme = lightTheme
