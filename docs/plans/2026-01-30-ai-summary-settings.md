# AI 总结功能和设置页面化实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 添加基于 DeepSeek API 的 AI 总结功能，并将设置从 Modal 升级为完整的页面视图。

**Architecture:**
- 扩展 viewMode 为三视图模式（realtime/history/settings）
- 创建独立的 AI 服务层处理 DeepSeek API 调用
- 新建 SettingsView 组件替换 SettingsModal，使用卡片布局
- 在 HistoryViewer 和 LogViewer 添加 AI 总结按钮
- 首次使用时引导配置 API Key，结果通过 Modal 展示

**Tech Stack:**
- DeepSeek API (chat completion endpoint)
- Ant Design (Card, Tabs, Input.Password, Modal, Spin)
- Electron Store (加密存储 API Key)
- TypeScript (严格类型检查)

---

## Task 1: 扩展类型定义和数据模型

**Files:**
- Modify: `src/types.ts`

**Step 1: 扩展类型定义**

在 `src/types.ts` 末尾添加新的类型定义：

```typescript
// AI 设置接口
export interface AISettings {
  enabled: boolean
  provider: 'deepseek'
  apiKey: string
  apiBaseUrl: string
  model: string
}

// 扩展 AppSettings
export interface AppSettings {
  darkMode: boolean
  autoStart: boolean
  ai: AISettings
}

// AI 总结请求参数
export interface SummaryRequest {
  records: ClaudeRecord[]
  type: 'brief' | 'detailed'
}

// AI 总结响应
export interface SummaryResponse {
  success: boolean
  summary?: string
  error?: string
  tokensUsed?: number
}

// 扩展 ElectronAPI
export interface ElectronAPI {
  // ... 现有方法保持不变
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

  // 新增 AI 相关方法
  summarizeRecords: (request: SummaryRequest) => Promise<SummaryResponse>
}
```

**Step 2: 提交类型定义更改**

```bash
git add src/types.ts
git commit -m "feat: 添加 AI 总结和设置页面相关的类型定义

- AISettings 接口用于存储 DeepSeek API 配置
- SummaryRequest/Response 接口用于 AI 总结功能
- 扩展 AppSettings 包含 ai 配置
- 扩展 ElectronAPI 添加 summarizeRecords 方法

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 2: 创建 AI 总结服务层

**Files:**
- Create: `src/services/aiSummary.ts`

**Step 1: 创建 AI 服务文件**

创建 `src/services/aiSummary.ts`：

```typescript
import type { ClaudeRecord, AISettings, SummaryRequest } from '../types'

export class AISummaryService {
  private settings: AISettings

  constructor(settings: AISettings) {
    this.settings = settings
  }

  /**
   * 总结对话记录
   * @param records 要总结的记录
   * @param type 总结类型（简短/详细）
   * @returns 总结文本
   */
  async summarize(records: ClaudeRecord[], type: 'brief' | 'detailed' = 'detailed'): Promise<string> {
    if (!this.settings.enabled || !this.settings.apiKey) {
      throw new Error('AI 总结功能未启用或未配置 API Key')
    }

    if (records.length === 0) {
      throw new Error('没有可总结的记录')
    }

    const prompt = this.buildPrompt(records, type)
    const summary = await this.callDeepSeekAPI(prompt)

    return summary
  }

  /**
   * 构建提示词
   */
  private buildPrompt(records: ClaudeRecord[], type: 'brief' | 'detailed'): string {
    // 提取对话内容
    const conversations = records.map((record, index) => {
      return `[对话 ${index + 1}]\n时间: ${new Date(record.timestamp).toLocaleString('zh-CN')}\n内容: ${record.display}`
    }).join('\n\n---\n\n')

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

    return templates[type]
  }

  /**
   * 调用 DeepSeek API
   */
  private async callDeepSeekAPI(prompt: string): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

    try {
      const response = await fetch(`${this.settings.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.apiKey}`
        },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的技术对话总结助手，擅长提取关键信息和技术要点。请使用简洁清晰的中文进行总结。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`DeepSeek API 错误: ${response.status} ${errorData.error?.message || response.statusText}`)
      }

      const data = await response.json()

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('DeepSeek API 返回格式异常')
      }

      return data.choices[0].message.content.trim()

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接')
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 验证 API Key 是否有效
   */
  async validateAPIKey(): Promise<boolean> {
    try {
      const testPrompt = '请回复"OK"'
      await this.callDeepSeekAPI(testPrompt)
      return true
    } catch (error) {
      return false
    }
  }
}

/**
 * 创建 AI 总结服务实例
 */
export function createAISummaryService(settings: AISettings): AISummaryService {
  return new AISummaryService(settings)
}
```

**Step 2: 提交 AI 服务层**

```bash
git add src/services/aiSummary.ts
git commit -m "feat: 实现 AI 总结服务层

- AISummaryService 类封装 DeepSeek API 调用
- 支持简短和详细两种总结模式
- 内置超时控制（30秒）和错误处理
- 提供 API Key 验证功能
- 详细模式使用结构化 Markdown 输出

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 3: 更新 Electron 主进程支持 AI 总结

**Files:**
- Modify: `electron/main.ts`

**Step 1: 导入依赖并更新 AppSettings 默认值**

在 `electron/main.ts` 顶部导入区域添加：

```typescript
import fetch from 'electron-fetch'
```

找到 `getAppSettings` handler，更新默认配置：

```typescript
ipcMain.handle('get-app-settings', async () => {
  const defaultSettings = {
    darkMode: false,
    autoStart: false,
    ai: {
      enabled: false,
      provider: 'deepseek' as const,
      apiKey: '',
      apiBaseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat'
    }
  }

  const darkMode = store.get('darkMode', defaultSettings.darkMode) as boolean
  const autoStart = store.get('autoStart', defaultSettings.autoStart) as boolean
  const ai = store.get('ai', defaultSettings.ai) as any

  return { darkMode, autoStart, ai }
})
```

**Step 2: 添加 summarizeRecords IPC handler**

在 `electron/main.ts` 的 IPC handlers 部分添加：

```typescript
// AI 总结功能
ipcMain.handle('summarize-records', async (_, request: { records: any[], type: 'brief' | 'detailed' }) => {
  try {
    // 获取 AI 设置
    const settings = await ipcMain.handleOnce('get-app-settings', async () => {
      const defaultSettings = {
        darkMode: false,
        autoStart: false,
        ai: {
          enabled: false,
          provider: 'deepseek' as const,
          apiKey: '',
          apiBaseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat'
        }
      }

      const darkMode = store.get('darkMode', defaultSettings.darkMode) as boolean
      const autoStart = store.get('autoStart', defaultSettings.autoStart) as boolean
      const ai = store.get('ai', defaultSettings.ai) as any

      return { darkMode, autoStart, ai }
    })

    const aiSettings = (settings as any).ai

    if (!aiSettings.enabled || !aiSettings.apiKey) {
      return {
        success: false,
        error: 'AI 总结功能未启用或未配置 API Key'
      }
    }

    if (!request.records || request.records.length === 0) {
      return {
        success: false,
        error: '没有可总结的记录'
      }
    }

    // 构建提示词
    const conversations = request.records.map((record: any, index: number) => {
      return `[对话 ${index + 1}]\n时间: ${new Date(record.timestamp).toLocaleString('zh-CN')}\n内容: ${record.display}`
    }).join('\n\n---\n\n')

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

    const prompt = templates[request.type] || templates.detailed

    // 调用 DeepSeek API
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
      const response = await fetch(`${aiSettings.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiSettings.apiKey}`
        },
        body: JSON.stringify({
          model: aiSettings.model,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的技术对话总结助手，擅长提取关键信息和技术要点。请使用简洁清晰的中文进行总结。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 2000
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: `DeepSeek API 错误: ${response.status} ${(errorData as any).error?.message || response.statusText}`
        }
      }

      const data = await response.json()

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        return {
          success: false,
          error: 'DeepSeek API 返回格式异常'
        }
      }

      return {
        success: true,
        summary: data.choices[0].message.content.trim(),
        tokensUsed: data.usage?.total_tokens || 0
      }

    } catch (error: any) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        return {
          success: false,
          error: '请求超时，请检查网络连接'
        }
      }

      return {
        success: false,
        error: error.message || '未知错误'
      }
    }

  } catch (error: any) {
    return {
      success: false,
      error: error.message || '总结失败'
    }
  }
})
```

**Step 3: 更新 preload.ts 暴露 API**

在 `electron/preload.ts` 的 `electronAPI` 对象中添加：

```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  // ... 现有方法
  checkClaudeInstalled: () => ipcRenderer.invoke('check-claude-installed'),
  getClaudeConfig: () => ipcRenderer.invoke('get-claude-config'),
  saveClaudeConfig: (config: string) => ipcRenderer.invoke('save-claude-config', config),
  selectSavePath: () => ipcRenderer.invoke('select-save-path'),
  getRecordConfig: () => ipcRenderer.invoke('get-record-config'),
  saveRecordConfig: (config: any) => ipcRenderer.invoke('save-record-config', config),
  onNewRecord: (callback: (record: any) => void) => {
    const listener = (_: any, record: any) => callback(record)
    ipcRenderer.on('new-record', listener)
    return () => ipcRenderer.removeListener('new-record', listener)
  },
  copyToClipboard: (text: string) => ipcRenderer.invoke('copy-to-clipboard', text),
  openInFinder: (path: string) => ipcRenderer.invoke('open-in-finder', path),
  readHistory: () => ipcRenderer.invoke('read-history'),
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  saveAppSettings: (settings: any) => ipcRenderer.invoke('save-app-settings', settings),
  exportRecords: (options: any) => ipcRenderer.invoke('export-records', options),

  // 新增 AI 总结方法
  summarizeRecords: (request: any) => ipcRenderer.invoke('summarize-records', request)
})
```

**Step 4: 安装依赖**

```bash
npm install electron-fetch
```

**Step 5: 提交 Electron 主进程更改**

```bash
git add electron/main.ts electron/preload.ts package.json package-lock.json
git commit -m "feat: Electron 主进程支持 AI 总结功能

- 添加 summarize-records IPC handler
- 集成 DeepSeek API 调用逻辑
- 更新 AppSettings 默认值包含 AI 配置
- preload.ts 暴露 summarizeRecords 方法
- 添加 electron-fetch 依赖

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 4: 创建设置页面组件（SettingsView）

**Files:**
- Create: `src/components/SettingsView.tsx`

**Step 1: 创建 SettingsView 组件**

创建 `src/components/SettingsView.tsx`：

```typescript
import { useState, useEffect } from 'react'
import { Card, Switch, Input, Button, Space, Typography, message, Tooltip, Tag } from 'antd'
import {
  BulbOutlined,
  RobotOutlined,
  SaveOutlined,
  ClockCircleOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import type { AISettings, AppSettings } from '../types'
import { getThemeVars } from '../theme'

const { Title, Text, Paragraph } = Typography

interface SettingsViewProps {
  onBack: () => void
  darkMode: boolean
}

function SettingsView({ onBack, darkMode }: SettingsViewProps) {
  const [settings, setSettings] = useState<AppSettings>({
    darkMode: false,
    autoStart: false,
    ai: {
      enabled: false,
      provider: 'deepseek',
      apiKey: '',
      apiBaseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat'
    }
  })

  const [loading, setLoading] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const themeVars = getThemeVars(darkMode)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.electronAPI.getAppSettings()
      setSettings(loadedSettings)
    } catch (error: any) {
      message.error(`加载设置失败: ${error.message}`)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.saveAppSettings(settings)
      if (result.success) {
        message.success('设置已保存')
      } else {
        message.error(`保存失败: ${result.error}`)
      }
    } catch (error: any) {
      message.error(`保存失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const updateAISetting = <K extends keyof AISettings>(key: K, value: AISettings[K]) => {
    setSettings(prev => ({
      ...prev,
      ai: {
        ...prev.ai,
        [key]: value
      }
    }))
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: themeVars.bgContainer
    }}>
      {/* 顶部标题栏 */}
      <div style={{
        padding: '16px 24px',
        borderBottom: `1px solid ${themeVars.borderSecondary}`,
        background: themeVars.bgSection,
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
              type="text"
            >
              返回
            </Button>
            <Title level={4} style={{ margin: 0 }}>设置</Title>
          </div>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={loading}
          >
            保存设置
          </Button>
        </div>
      </div>

      {/* 设置内容区域 */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '24px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
          gap: 24,
          maxWidth: 1400
        }}>
          {/* 通用设置 */}
          <Card
            title={
              <Space>
                <BulbOutlined style={{ fontSize: 18 }} />
                <span>通用设置</span>
              </Space>
            }
            size="small"
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>深色模式</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    切换应用主题颜色
                  </Text>
                </div>
                <Switch
                  checked={settings.darkMode}
                  onChange={(checked) => setSettings(prev => ({ ...prev, darkMode: checked }))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>开机自启动</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    系统启动时自动运行应用
                  </Text>
                </div>
                <Switch
                  checked={settings.autoStart}
                  onChange={(checked) => setSettings(prev => ({ ...prev, autoStart: checked }))}
                />
              </div>
            </Space>
          </Card>

          {/* AI 设置 */}
          <Card
            title={
              <Space>
                <RobotOutlined style={{ fontSize: 18 }} />
                <span>AI 总结设置</span>
                <Tag color={settings.ai.enabled ? 'success' : 'default'}>
                  {settings.ai.enabled ? '已启用' : '未启用'}
                </Tag>
              </Space>
            }
            size="small"
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong>启用 AI 总结</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    使用 AI 自动总结对话内容
                  </Text>
                </div>
                <Switch
                  checked={settings.ai.enabled}
                  onChange={(checked) => updateAISetting('enabled', checked)}
                />
              </div>

              <div>
                <Text strong>API 提供商</Text>
                <br />
                <Input
                  value="DeepSeek"
                  disabled
                  style={{ marginTop: 8 }}
                  addonAfter={
                    <Tooltip title="目前仅支持 DeepSeek">
                      <ExclamationCircleOutlined />
                    </Tooltip>
                  }
                />
              </div>

              <div>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong>API Key</Text>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => window.open('https://platform.deepseek.com/api_keys', '_blank')}
                    >
                      获取 API Key
                    </Button>
                  </div>
                  <Input.Password
                    value={settings.ai.apiKey}
                    onChange={(e) => updateAISetting('apiKey', e.target.value)}
                    placeholder="sk-..."
                    visibilityToggle={{
                      visible: apiKeyVisible,
                      onVisibleChange: setApiKeyVisible
                    }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    你的 API Key 将加密存储在本地，不会上传到任何服务器
                  </Text>
                </Space>
              </div>

              <div>
                <Text strong>模型</Text>
                <br />
                <Input
                  value={settings.ai.model}
                  onChange={(e) => updateAISetting('model', e.target.value)}
                  placeholder="deepseek-chat"
                  style={{ marginTop: 8 }}
                />
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
                  推荐使用 deepseek-chat（性价比最高）
                </Text>
              </div>

              <div>
                <Text strong>API 地址</Text>
                <br />
                <Input
                  value={settings.ai.apiBaseUrl}
                  onChange={(e) => updateAISetting('apiBaseUrl', e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  style={{ marginTop: 8 }}
                />
              </div>
            </Space>
          </Card>

          {/* 记录设置（预留） */}
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ fontSize: 18 }} />
                <span>记录设置</span>
              </Space>
            }
            size="small"
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Paragraph type="secondary" style={{ margin: 0 }}>
                记录相关设置将在后续版本中添加
              </Paragraph>
            </Space>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default SettingsView
```

**Step 2: 提交 SettingsView 组件**

```bash
git add src/components/SettingsView.tsx
git commit -m "feat: 创建设置页面组件 SettingsView

- 卡片布局组织设置项（通用、AI、记录）
- 通用设置：深色模式、开机自启动
- AI 设置：启用开关、API Key、模型、API 地址
- 支持保存配置到 Electron Store
- 响应式网格布局，适配不同屏幕尺寸

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 5: 扩展 App.tsx 支持三视图模式

**Files:**
- Modify: `src/App.tsx`

**Step 1: 导入 SettingsView 和更新类型**

在 `src/App.tsx` 顶部添加导入：

```typescript
import SettingsView from './components/SettingsView'

// 更新视图模式类型
type ViewMode = 'realtime' | 'history' | 'settings'
```

**Step 2: 修改视图渲染逻辑**

找到 `Content` 区域的条件渲染，修改为：

```typescript
<Content style={{
  display: 'flex',
  flexDirection: 'column',
  minWidth: 400,
  overflow: 'hidden'
}}>
  {viewMode === 'realtime' ? (
    <LogViewer
      records={records}
      onClear={handleClearRecords}
      onToggleView={handleToggleView}
      onOpenDrawer={() => setDrawerVisible(true)}
      showDrawerButton={siderCollapsed && !drawerVisible}
      darkMode={darkMode}
    />
  ) : viewMode === 'history' ? (
    <HistoryViewer onToggleView={handleToggleView} darkMode={darkMode} />
  ) : (
    <SettingsView
      onBack={() => setViewMode('realtime')}
      darkMode={darkMode}
    />
  )}
</Content>
```

**Step 3: 修改 StatusBar 的设置按钮处理**

找到 `StatusBar` 组件的调用，修改 `onOpenSettings` 回调：

```typescript
<StatusBar
  claudeDir={claudeDir}
  darkMode={darkMode}
  onThemeToggle={handleThemeToggle}
  onOpenSettings={() => setViewMode('settings')}  // 修改为切换视图
/>
```

**Step 4: 移除 SettingsModal 相关代码**

删除以下代码：
- `import SettingsModal from './components/SettingsModal'`
- `const [settingsVisible, setSettingsVisible] = useState<boolean>(false)`
- `handleSettingsClose` 函数
- `<SettingsModal />` 组件渲染

**Step 5: 提交 App.tsx 更改**

```bash
git add src/App.tsx
git commit -m "feat: 扩展 App 支持三视图模式

- ViewMode 扩展为 realtime/history/settings
- 添加 SettingsView 渲染分支
- 设置按钮直接切换到设置视图
- 移除旧的 SettingsModal 组件

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 6: 在 HistoryViewer 添加 AI 总结按钮

**Files:**
- Modify: `src/components/HistoryViewer.tsx`

**Step 1: 添加导入和状态**

在 `src/components/HistoryViewer.tsx` 顶部添加：

```typescript
import { SparklesOutlined } from '@ant-design/icons'  // 添加到现有的图标导入中
```

在组件内部添加状态：

```typescript
// AI 总结相关状态
const [summarizing, setSummarizing] = useState(false)
const [summaryContent, setSummaryContent] = useState<string>('')
const [summaryModalVisible, setSummaryModalVisible] = useState(false)
```

**Step 2: 添加 AI 总结处理函数**

在组件内部添加函数：

```typescript
// 处理 AI 总结
const handleSummarize = async (session: GroupedRecord) => {
  setSummarizing(true)

  try {
    // 检查 AI 配置
    const settings = await window.electronAPI.getAppSettings()

    if (!settings.ai.enabled) {
      Modal.confirm({
        title: '启用 AI 总结功能',
        content: 'AI 总结功能尚未启用，是否前往设置？',
        okText: '去设置',
        cancelText: '取消',
        onOk: () => {
          onToggleView()  // 这会切换到实时视图，用户需要手动点设置
          message.info('请点击右上角设置按钮配置 AI 功能')
        }
      })
      return
    }

    if (!settings.ai.apiKey) {
      Modal.confirm({
        title: '配置 API Key',
        content: '尚未配置 DeepSeek API Key，是否前往设置？',
        okText: '去设置',
        cancelText: '取消',
        onOk: () => {
          onToggleView()
          message.info('请点击右上角设置按钮配置 API Key')
        }
      })
      return
    }

    // 调用总结接口
    const result = await window.electronAPI.summarizeRecords({
      records: session.records,
      type: 'detailed'
    })

    if (result.success && result.summary) {
      setSummaryContent(result.summary)
      setSummaryModalVisible(true)
    } else {
      message.error(`总结失败: ${result.error || '未知错误'}`)
    }

  } catch (error: any) {
    message.error(`总结失败: ${error.message || '未知错误'}`)
  } finally {
    setSummarizing(false)
  }
}

// 复制总结内容
const handleCopySummary = async () => {
  try {
    await window.electronAPI.copyToClipboard(summaryContent)
    message.success('已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}
```

**Step 3: 在会话卡片添加总结按钮**

找到会话卡片的渲染部分（`List.Item` 中的 `Card`），在 `extra` 属性后添加 `actions`：

```typescript
<Card
  hoverable
  size="small"
  onClick={() => handleSessionClick(group)}
  title={
    <Space>
      <Tag color="blue">{getProjectName(group.project)}</Tag>
      {group.sessionId && !group.sessionId.startsWith('single-') && (
        <Text code style={{ fontSize: 11 }}>
          {group.sessionId.slice(0, 8)}
        </Text>
      )}
    </Space>
  }
  extra={
    <ClockCircleOutlined style={{ color: themeVars.textTertiary }} />
  }
  actions={[
    <Button
      key="summarize"
      type="text"
      size="small"
      icon={<SparklesOutlined />}
      loading={summarizing}
      onClick={(e) => {
        e.stopPropagation()
        handleSummarize(group)
      }}
    >
      AI 总结
    </Button>
  ]}
>
  {/* ... 现有内容 */}
</Card>
```

**Step 4: 添加总结结果 Modal**

在组件返回的 JSX 末尾，`Record 详情弹窗` 之后添加：

```typescript
{/* AI 总结结果弹窗 */}
<Modal
  title={
    <Space>
      <SparklesOutlined style={{ color: '#667eea' }} />
      <Text>AI 总结</Text>
    </Space>
  }
  open={summaryModalVisible}
  onCancel={() => setSummaryModalVisible(false)}
  width="60%"
  footer={[
    <Button
      key="copy"
      icon={<CopyOutlined />}
      onClick={handleCopySummary}
    >
      复制总结
    </Button>,
    <Button
      key="close"
      type="primary"
      onClick={() => setSummaryModalVisible(false)}
    >
      关闭
    </Button>
  ]}
  style={{ top: 60 }}
  bodyStyle={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}
>
  <div style={{ fontSize: 14, lineHeight: 1.8 }}>
    {renderMarkdown(summaryContent)}
  </div>
</Modal>
```

**Step 5: 提交 HistoryViewer 更改**

```bash
git add src/components/HistoryViewer.tsx
git commit -m "feat: HistoryViewer 添加 AI 总结功能

- 会话卡片添加 AI 总结按钮
- 首次使用时引导配置 API Key
- 总结结果使用 Modal 展示，支持 Markdown 渲染
- 支持复制总结内容到剪贴板
- 添加 loading 状态和错误处理

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 7: 在 LogViewer 添加 AI 总结按钮

**Files:**
- Modify: `src/components/LogViewer.tsx`

**Step 1: 添加导入和状态**

在 `src/components/LogViewer.tsx` 顶部添加：

```typescript
import { SparklesOutlined, CopyOutlined } from '@ant-design/icons'  // 添加到现有导入
```

添加状态：

```typescript
// AI 总结相关状态
const [summarizing, setSummarizing] = useState(false)
const [summaryContent, setSummaryContent] = useState<string>('')
const [summaryModalVisible, setSummaryModalVisible] = useState(false)
```

**Step 2: 添加总结处理函数**

```typescript
// 处理当前对话总结
const handleSummarizeCurrentLogs = async () => {
  if (records.length === 0) {
    message.warning('当前没有对话记录')
    return
  }

  setSummarizing(true)

  try {
    // 检查 AI 配置
    const settings = await window.electronAPI.getAppSettings()

    if (!settings.ai.enabled) {
      Modal.confirm({
        title: '启用 AI 总结功能',
        content: 'AI 总结功能尚未启用，是否前往设置？',
        okText: '去设置',
        cancelText: '取消',
        onOk: () => {
          message.info('请点击右上角设置按钮配置 AI 功能')
        }
      })
      return
    }

    if (!settings.ai.apiKey) {
      Modal.confirm({
        title: '配置 API Key',
        content: '尚未配置 DeepSeek API Key，是否前往设置？',
        okText: '去设置',
        cancelText: '取消',
        onOk: () => {
          message.info('请点击右上角设置按钮配置 API Key')
        }
      })
      return
    }

    // 调用总结接口
    const result = await window.electronAPI.summarizeRecords({
      records: records,
      type: 'detailed'
    })

    if (result.success && result.summary) {
      setSummaryContent(result.summary)
      setSummaryModalVisible(true)
    } else {
      message.error(`总结失败: ${result.error || '未知错误'}`)
    }

  } catch (error: any) {
    message.error(`总结失败: ${error.message || '未知错误'}`)
  } finally {
    setSummarizing(false)
  }
}

// 复制总结内容
const handleCopySummary = async () => {
  try {
    await window.electronAPI.copyToClipboard(summaryContent)
    message.success('已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}
```

**Step 3: 在顶部工具栏添加总结按钮**

找到顶部工具栏的 `Space` 组件，添加总结按钮：

```typescript
<Space wrap>
  <Button
    icon={<SparklesOutlined />}
    onClick={handleSummarizeCurrentLogs}
    size="small"
    loading={summarizing}
    disabled={records.length === 0}
  >
    AI 总结
  </Button>
  <Button
    icon={<ClockCircleOutlined />}
    type="primary"
    onClick={onToggleView}
    size="small"
  >
    历史对话
  </Button>
  <Button
    icon={<DeleteOutlined />}
    danger
    onClick={onClear}
    size="small"
    disabled={records.length === 0}
  >
    清空
  </Button>
</Space>
```

**Step 4: 添加总结结果 Modal**

在组件返回的 JSX 末尾添加：

```typescript
{/* AI 总结结果弹窗 */}
<Modal
  title={
    <Space>
      <SparklesOutlined style={{ color: '#667eea' }} />
      <Text>当前对话 AI 总结</Text>
    </Space>
  }
  open={summaryModalVisible}
  onCancel={() => setSummaryModalVisible(false)}
  width="60%"
  footer={[
    <Button
      key="copy"
      icon={<CopyOutlined />}
      onClick={handleCopySummary}
    >
      复制总结
    </Button>,
    <Button
      key="close"
      type="primary"
      onClick={() => setSummaryModalVisible(false)}
    >
      关闭
    </Button>
  ]}
  style={{ top: 60 }}
  bodyStyle={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}
>
  <div style={{ fontSize: 14, lineHeight: 1.8 }}>
    <ReactMarkdown
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '')
          return !inline && match ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              customStyle={{
                margin: 0,
                borderRadius: 6,
                fontSize: 13
              }}
              {...props}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code
              style={{
                background: themeVars.codeBg,
                padding: '2px 6px',
                borderRadius: 3,
                fontSize: 12,
                fontFamily: 'monospace'
              }}
              {...props}
            >
              {children}
            </code>
          )
        },
        p({ children }) {
          return <p style={{ marginBottom: 8, lineHeight: 1.6 }}>{children}</p>
        },
        pre({ children }) {
          return <>{children}</>
        }
      }}
    >
      {summaryContent}
    </ReactMarkdown>
  </div>
</Modal>
```

**Step 5: 添加必要的导入**

确保顶部有以下导入：

```typescript
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Modal } from 'antd'  // 添加 Modal
```

**Step 6: 提交 LogViewer 更改**

```bash
git add src/components/LogViewer.tsx
git commit -m "feat: LogViewer 添加实时对话 AI 总结功能

- 顶部工具栏添加 AI 总结按钮
- 总结当前所有实时对话记录
- 首次使用时引导配置 API Key
- 总结结果使用 Modal 展示，支持 Markdown 渲染
- 支持复制总结内容到剪贴板

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 8: 删除旧的 SettingsModal 组件

**Files:**
- Delete: `src/components/SettingsModal.tsx`

**Step 1: 删除文件**

```bash
git rm src/components/SettingsModal.tsx
```

**Step 2: 提交删除**

```bash
git commit -m "refactor: 移除旧的 SettingsModal 组件

已被新的 SettingsView 页面替代

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## Task 9: 测试和验证

**Step 1: 启动开发服务器**

```bash
npm run dev
```

**Step 2: 手动测试清单**

**基础功能测试：**
- [ ] 应用启动正常
- [ ] 三个视图（实时/历史/设置）可以正常切换
- [ ] 设置页面布局正确，卡片显示正常

**设置页面测试：**
- [ ] 深色模式开关工作正常
- [ ] 开机自启动开关工作正常
- [ ] AI 启用开关工作正常
- [ ] API Key 输入框可以输入和显示/隐藏
- [ ] 模型和 API 地址可以修改
- [ ] 点击"保存设置"可以正常保存
- [ ] 刷新应用后设置保持

**AI 总结测试（HistoryViewer）：**
- [ ] 未配置时点击总结按钮，显示引导弹窗
- [ ] 配置 API Key 后，点击总结按钮显示 loading 状态
- [ ] 总结成功后显示 Modal，内容为 Markdown 格式
- [ ] 可以复制总结内容
- [ ] 总结失败时显示错误提示

**AI 总结测试（LogViewer）：**
- [ ] 没有记录时总结按钮禁用
- [ ] 有记录时点击总结按钮工作正常
- [ ] 总结结果正确显示
- [ ] 可以复制总结内容

**Step 3: 记录测试结果**

如果发现问题，记录到 `docs/plans/test-results.md`

---

## Task 10: 更新文档

**Files:**
- Modify: `README.md`

**Step 1: 更新功能列表**

在 `README.md` 的功能部分添加：

```markdown
## 功能

- 自动检测 Claude Code 安装状态
- 可视化编辑配置文件（`~/.claude/settings.json`）
- 实时监控对话记录（`~/.claude/history.jsonl`）
- 自动保存对话历史到指定目录
- 按项目和日期分类存储
- 历史对话查看和搜索
- 代码语法高亮显示
- 🌙 暗色模式切换 (v1.1.0)
- 📤 导出为 Markdown 格式 (v1.1.0)
- 🔍 全局搜索（跨会话搜索，关键词高亮） (v1.1.0)
- 🚀 开机自启动设置 (v1.1.0)
- ✨ AI 总结功能（基于 DeepSeek API） (v1.2.0)
- ⚙️ 设置页面化（完整的设置管理界面） (v1.2.0)
```

**Step 2: 添加版本历史**

在版本历史部分添加：

```markdown
### v1.2.0 (2026-01-30)
- ✨ AI 总结功能（支持 DeepSeek API）
- ⚙️ 设置页面化（卡片式布局）
- 🤖 历史会话智能总结
- 💬 实时对话智能总结
- 🔐 API Key 加密存储

### v1.1.1 (2026-01-30)
- 🐛 修复暗黑模式 UI 问题
- 🐛 修复 macOS 全屏模式兼容性
- 🌏 添加中文语言包支持
```

**Step 3: 添加使用说明**

在使用部分添加：

```markdown
## AI 总结功能

1. 点击右上角设置按钮进入设置页面
2. 在"AI 总结设置"卡片中：
   - 启用 AI 总结开关
   - 填入 DeepSeek API Key（从 https://platform.deepseek.com/api_keys 获取）
   - 保存设置
3. 在历史对话或实时对话页面点击"AI 总结"按钮
4. 查看 AI 生成的结构化总结
```

**Step 4: 提交文档更新**

```bash
git add README.md
git commit -m "docs: 更新 README 添加 v1.2.0 功能说明

- AI 总结功能介绍
- 设置页面化说明
- 使用指南更新
- 版本历史更新

Co-Authored-By: Claude (vertex-ai-claude-opus-4.5) <noreply@anthropic.com>"
```

---

## 完成检查清单

实施完成后，确认以下所有项：

- [ ] 类型定义完整且一致
- [ ] AI 服务层正确实现
- [ ] Electron 主进程正确处理 AI 请求
- [ ] 设置页面正常工作且可保存
- [ ] 三视图切换流畅
- [ ] HistoryViewer 总结功能正常
- [ ] LogViewer 总结功能正常
- [ ] 首次使用引导流程正确
- [ ] 错误处理完善
- [ ] 所有变更已提交
- [ ] 文档已更新

---

## 架构说明

**数据流：**
```
用户点击总结按钮
  ↓
检查 AI 配置（未配置 → 引导设置）
  ↓
调用 window.electronAPI.summarizeRecords()
  ↓
IPC 发送到主进程
  ↓
主进程调用 DeepSeek API
  ↓
返回总结结果
  ↓
渲染进程显示 Modal
```

**文件结构：**
```
src/
├── types.ts                    # 扩展类型定义
├── services/
│   └── aiSummary.ts            # AI 服务层（未在主进程中使用，可选）
├── components/
│   ├── SettingsView.tsx        # 新：设置页面
│   ├── HistoryViewer.tsx       # 修改：添加总结按钮
│   └── LogViewer.tsx           # 修改：添加总结按钮
└── App.tsx                     # 修改：三视图模式

electron/
├── main.ts                     # 修改：AI 总结 IPC handler
└── preload.ts                  # 修改：暴露 summarizeRecords

docs/
└── plans/
    └── 2026-01-30-ai-summary-settings.md
```

**关键设计决策：**
- AI 调用放在主进程（避免渲染进程暴露 API Key）
- 设置使用 Electron Store 加密存储
- 总结结果使用 Modal 展示（不干扰主界面）
- 首次使用引导配置（避免强制配置）
- 支持两种总结场景（历史会话、实时对话）
