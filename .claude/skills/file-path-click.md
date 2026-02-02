# 文件路径点击功能

## 功能描述

在 CCMonitor 项目中实现了路径点击功能，用户可以点击任何显示的文件路径来查看或编辑文件。

## 核心特性

### 1. 智能文件打开
- **文件夹路径**：点击后在文件管理器中打开
- **文件路径**：点击后在代码编辑器中打开
- **缓存文件**：以只读模式打开（如 JSONL 历史记录文件）

### 2. 支持的文件类型
- `.json` - JSON 配置文件
- `.jsonl` - JSONL 日志文件
- `.js/.ts/.tsx/.jsx` - JavaScript/TypeScript 文件
- `.md` - Markdown 文件
- `.txt` - 文本文件

### 3. 编辑器功能
- 语法高亮
- 行号显示
- JSON 格式化
- 只读模式（用于缓存文件）
- 打开文件位置
- 重新加载

## 实现细节

### 主进程 API (electron/main.ts)

```typescript
// 读取文件内容
ipcMain.handle('read-file-content', async (_, filePath: string) => {
  const content = fs.readFileSync(filePath, 'utf-8')
  return { success: true, content }
})

// 保存文件内容
ipcMain.handle('save-file-content', async (_, filePath: string, content: string) => {
  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true }
})

// 在系统默认编辑器中打开文件
ipcMain.handle('open-file-in-editor', async (_, filePath: string) => {
  await shell.openPath(filePath)
  return { success: true }
})
```

### 组件结构

#### FileViewer 组件 (src/components/FileViewer.tsx)
通用文件查看/编辑器组件，基于 Monaco Editor。

**Props:**
- `filePath`: 文件路径
- `darkMode`: 深色模式
- `visible`: 是否显示
- `onClose`: 关闭回调
- `readOnly`: 是否只读（默认 false）

**功能:**
- 自动检测文件类型和语言
- 支持 JSON 格式化
- 只读模式保护缓存文件
- 打开文件位置
- 重新加载文件

#### LogViewer 集成
在实时对话页面中：
- 文件路径：点击打开文件夹
- 消息路径：点击以只读模式打开 JSONL 文件

#### HistoryViewer 集成
在历史记录页面中：
- 项目路径：点击打开文件夹
- 可扩展支持更多路径点击

## 使用示例

### 在组件中使用 FileViewer

```typescript
import FileViewer from './FileViewer'

function MyComponent() {
  const [fileViewerVisible, setFileViewerVisible] = useState(false)
  const [viewingFilePath, setViewingFilePath] = useState('')
  const [fileViewerReadOnly, setFileViewerReadOnly] = useState(false)

  const handleOpenFile = (filePath: string, readOnly: boolean = false) => {
    setViewingFilePath(filePath)
    setFileViewerReadOnly(readOnly)
    setFileViewerVisible(true)
  }

  return (
    <>
      {/* 可点击的路径 */}
      <Text
        style={{ cursor: 'pointer', color: themeVars.primary }}
        onClick={() => handleOpenFile('/path/to/file.json', false)}
      >
        /path/to/file.json
      </Text>

      {/* 文件查看器 */}
      <FileViewer
        filePath={viewingFilePath}
        darkMode={darkMode}
        visible={fileViewerVisible}
        onClose={() => setFileViewerVisible(false)}
        readOnly={fileViewerReadOnly}
      />
    </>
  )
}
```

### 打开缓存文件（只读）

```typescript
// 缓存文件应该以只读模式打开
const jsonlPath = `${savePath}/project_2026-02-02.jsonl`
handleOpenFile(jsonlPath, true) // readOnly = true
```

### 打开可编辑文件

```typescript
// 配置文件可以编辑
const configPath = '/path/to/config.json'
handleOpenFile(configPath, false) // readOnly = false
```

## 文件类型检测

FileViewer 会根据文件扩展名自动选择合适的语言模式：

| 扩展名 | 语言模式 |
|--------|----------|
| .json  | json     |
| .jsonl | json     |
| .js    | javascript |
| .ts    | typescript |
| .tsx   | typescript |
| .jsx   | javascript |
| .md    | markdown |
| .txt   | plaintext |

## 注意事项

1. **缓存文件保护**：所有历史记录 JSONL 文件应该以只读模式打开，防止误修改
2. **路径验证**：打开文件前会检查文件是否存在
3. **错误处理**：所有文件操作都有完善的错误处理和用户提示
4. **性能优化**：使用 Monaco Editor 的虚拟滚动，支持大文件查看

## 相关文件

- `electron/main.ts` - 主进程文件操作 API
- `electron/preload.ts` - IPC 方法暴露
- `src/types.ts` - TypeScript 接口定义
- `src/components/FileViewer.tsx` - 文件查看器组件
- `src/components/LogViewer.tsx` - 实时对话页面（集成）
- `src/components/HistoryViewer.tsx` - 历史记录页面（集成）

## 未来扩展

可以考虑添加：
- 文件对比功能
- 搜索和替换
- 多文件标签页
- 文件历史版本
- 更多文件类型支持
