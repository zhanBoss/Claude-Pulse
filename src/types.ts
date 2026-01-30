export interface ClaudeRecord {
  timestamp: number
  project: string
  sessionId?: string
  display: string
  pastedContents?: Record<string, any>
}

export interface RecordConfig {
  enabled: boolean
  savePath: string
}

export interface AppSettings {
  darkMode: boolean
  autoStart: boolean
}

export interface ExportOptions {
  format: 'markdown' | 'csv'
  sessionIds?: string[]
  startDate?: number
  endDate?: number
}

export interface ElectronAPI {
  checkClaudeInstalled: () => Promise<{ installed: boolean; claudeDir?: string; error?: string }>
  getClaudeConfig: () => Promise<{ success: boolean; config?: string; error?: string }>
  saveClaudeConfig: (config: string) => Promise<{ success: boolean; error?: string }>
  selectSavePath: () => Promise<{ canceled: boolean; path?: string }>
  getRecordConfig: () => Promise<RecordConfig>
  saveRecordConfig: (config: RecordConfig) => Promise<{ success: boolean; error?: string }>
  onNewRecord: (callback: (record: ClaudeRecord) => void) => () => void
  copyToClipboard: (text: string) => Promise<{ success: boolean; error?: string }>
  openInFinder: (path: string) => Promise<{ success: boolean; error?: string }>
  readHistory: () => Promise<{ success: boolean; records?: ClaudeRecord[]; error?: string }>
  getAppSettings: () => Promise<AppSettings>
  saveAppSettings: (settings: AppSettings) => Promise<{ success: boolean; error?: string }>
  exportRecords: (options: ExportOptions) => Promise<{ success: boolean; filePath?: string; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
