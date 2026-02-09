/**
 * 常用命令管理模块
 * 负责常用命令的 CRUD、排序、置顶等操作
 */

import type { ModuleContext } from './types'

export const registerCommandHandlers = (ctx: ModuleContext) => {
  const {
    electron: { ipcMain, shell },
    store
  } = ctx

  // 获取所有常用命令
  ipcMain.handle('get-common-commands', async () => {
    try {
      const commands = store.get('commonCommands', []) as any[]
      return commands
    } catch (error) {
      console.error('获取常用命令失败:', error)
      return []
    }
  })

  // 添加常用命令
  ipcMain.handle('add-common-command', async (_, name: string, content: string) => {
    try {
      const commands = store.get('commonCommands', []) as any[]
      // 计算新命令的 order：取当前最大 order + 1
      const maxOrder = commands.length > 0 ? Math.max(...commands.map(cmd => cmd.order || 0)) : -1

      const newCommand = {
        id: `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        name,
        content,
        pinned: false,
        order: maxOrder + 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      commands.push(newCommand)
      store.set('commonCommands', commands)

      return { success: true, command: newCommand }
    } catch (error) {
      console.error('添加常用命令失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 更新常用命令
  ipcMain.handle('update-common-command', async (_, id: string, name: string, content: string) => {
    try {
      const commands = store.get('commonCommands', []) as any[]
      const commandIndex = commands.findIndex(cmd => cmd.id === id)

      if (commandIndex === -1) {
        return { success: false, error: '命令不存在' }
      }

      commands[commandIndex] = {
        ...commands[commandIndex],
        name,
        content,
        updatedAt: Date.now()
      }

      store.set('commonCommands', commands)
      return { success: true }
    } catch (error) {
      console.error('更新常用命令失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 删除常用命令
  ipcMain.handle('delete-common-command', async (_, id: string) => {
    try {
      const commands = store.get('commonCommands', []) as any[]
      const filteredCommands = commands.filter(cmd => cmd.id !== id)

      store.set('commonCommands', filteredCommands)
      return { success: true }
    } catch (error) {
      console.error('删除常用命令失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 切换置顶状态
  ipcMain.handle('toggle-pin-command', async (_, id: string) => {
    try {
      const commands = store.get('commonCommands', []) as any[]
      const commandIndex = commands.findIndex(cmd => cmd.id === id)

      if (commandIndex === -1) {
        return { success: false, error: '命令不存在' }
      }

      commands[commandIndex] = {
        ...commands[commandIndex],
        pinned: !commands[commandIndex].pinned,
        updatedAt: Date.now()
      }

      store.set('commonCommands', commands)
      return { success: true }
    } catch (error) {
      console.error('切换置顶失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 打开常用命令配置文件
  ipcMain.handle('open-common-commands-file', async () => {
    try {
      const configPath = store.path
      await shell.openPath(configPath)
      return { success: true }
    } catch (error) {
      console.error('打开配置文件失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 更新命令排序
  ipcMain.handle('reorder-commands', async (_, commands: any[]) => {
    try {
      store.set('commonCommands', commands)
      return { success: true }
    } catch (error) {
      console.error('更新排序失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })
}
