import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type FusaApi } from '../shared/ipc'

// 화면(renderer)에 넘겨 주는 기능. 화면은 이 목록에 있는 것만 할 수 있다.
const api: FusaApi = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? ''
  },
  projects: {
    list: () => ipcRenderer.invoke(IPC.projectsList),
    create: (name) => ipcRenderer.invoke(IPC.projectsCreate, name),
    open: (id) => ipcRenderer.invoke(IPC.projectsOpen, id),
    last: () => ipcRenderer.invoke(IPC.projectsLast),
    save: (project) => ipcRenderer.invoke(IPC.projectsSave, project),
    remove: (id) => ipcRenderer.invoke(IPC.projectsDelete, id)
  },
  docs: {
    pick: () => ipcRenderer.invoke(IPC.docsPick),
    pathOf: (file) => webUtils.getPathForFile(file),
    read: (requests, options) => ipcRenderer.invoke(IPC.docsRead, requests, options),
    preview: (path) => ipcRenderer.invoke(IPC.docsPreview, path)
  },
  exportSchedule: (project, today, options) => ipcRenderer.invoke(IPC.exportSchedule, project, today, options),
  showInFolder: (path) => ipcRenderer.invoke(IPC.showInFolder, path),
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  profile: {
    get: () => ipcRenderer.invoke(IPC.profileGet),
    save: (profile) => ipcRenderer.invoke(IPC.profileSave, profile)
  },
  update: {
    get: () => ipcRenderer.invoke(IPC.updateGet),
    check: () => ipcRenderer.invoke(IPC.updateCheck),
    download: () => ipcRenderer.invoke(IPC.updateDownload),
    install: () => ipcRenderer.invoke(IPC.updateInstall),
    setAutoCheck: (on) => ipcRenderer.invoke(IPC.updateSetAuto, on),
    openPage: () => ipcRenderer.invoke(IPC.updateOpenPage),
    showFile: () => ipcRenderer.invoke(IPC.updateShowFile),
    onState: (callback) => {
      const listener = (_e: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]): void => callback(state)
      ipcRenderer.on(IPC.updateState, listener)
      return () => ipcRenderer.removeListener(IPC.updateState, listener)
    }
  }
}

contextBridge.exposeInMainWorld('fusa', api)
