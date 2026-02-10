/**
 * 模块共享类型定义
 * 所有子模块通过 ModuleContext 获取共享依赖
 *
 * 注意：Electron API 通过 ctx 传递而非直接 import，
 * 避免 Vite 打包时 CJS 互操作导致 electron 命名导出丢失
 */

import type { IpcMain, Dialog, Shell, App, Clipboard, BrowserWindow } from 'electron'
import { nativeImage } from 'electron'
import type Store from 'electron-store'

/**
 * Electron API 集合：由 main.ts 统一导入后注入
 */
export interface ElectronAPIs {
  ipcMain: IpcMain
  dialog: Dialog
  shell: Shell
  app: App
  clipboard: Clipboard
  nativeImage: typeof nativeImage
  BrowserWindow: typeof BrowserWindow
}

/**
 * 模块上下文：统一传递给各子模块的共享依赖
 */
export interface ModuleContext {
  electron: ElectronAPIs
  store: Store
  getMainWindow: () => BrowserWindow | null
  CLAUDE_DIR: string
  HISTORY_FILE: string
  SETTINGS_FILE: string
}
