import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '@shared/ipc-contract'
import type { WorkBaseAPI } from '@shared/types'
export type { WorkBaseAPI, AppPaths, Settings } from '@shared/types'
const api: WorkBaseAPI = {
  app: { getPaths: () => ipcRenderer.invoke(channels.getPaths), getVersion: () => ipcRenderer.invoke(channels.getVersion) },
  settings: {
    getAll: () => ipcRenderer.invoke(channels.getAll),
    set: (key, value) => ipcRenderer.invoke(channels.set, key, value),
    setPinnedModules: ids => ipcRenderer.invoke(channels.setPinnedModules, ids)
  }
}
contextBridge.exposeInMainWorld('api', api)
