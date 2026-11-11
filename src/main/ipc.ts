/** 화면에서 부르는 기능 연결 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Profile, Project, ReadOptions } from '../core/model'
import { buildScheduleXlsx, exportFileName } from '../core/export'
import { buildCheckReportXlsx, checkReportFileName } from '../core/checkReport'
import { localToday } from '../core/dates'
import { IPC, type AppInfo, type ExportResult, type ReadRequest, type SaveResult } from '../shared/ipc'
import { ProjectStore } from './store'
import { previewFile, readDocuments } from './documents'
import { log } from './log'
import type { Updater } from './updater'
import { readDrmMarkers, readProfile, saveDrmMarkers, saveProfile } from './appConfig'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerIpc(store: ProjectStore, logFile: string, updater: Updater, dataDir: string): void {
  ipcMain.handle(IPC.windowFullScreen, (e, on: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win && !win.isDestroyed()) win.setFullScreen(on === true)
  })
  ipcMain.handle(IPC.profileGet, () => readProfile(dataDir))
  ipcMain.handle(IPC.profileSave, (_e, p: unknown) => saveProfile(dataDir, (p ?? {}) as Partial<Profile>))
  ipcMain.handle(IPC.drmMarkersGet, () => readDrmMarkers(dataDir))
  ipcMain.handle(IPC.drmMarkersSave, (_e, v: unknown) => saveDrmMarkers(dataDir, v))
  ipcMain.handle(IPC.updateGet, () => updater.getState())
  ipcMain.handle(IPC.updateCheck, () => updater.check(false))
  ipcMain.handle(IPC.updateDownload, () => updater.download())
  ipcMain.handle(IPC.updateInstall, () => updater.install())
  ipcMain.handle(IPC.updateSetAuto, (_e, on: unknown) => updater.setAutoCheck(on === true))
  ipcMain.handle(IPC.updateShowFile, () => updater.showDownloaded())

  ipcMain.handle(IPC.projectsList, () => store.list())

  ipcMain.handle(IPC.projectsCreate, (_e, name: string) => {
    const p = store.create(String(name ?? '').slice(0, 100))
    log('info', 'project created')
    return p
  })

  ipcMain.handle(IPC.projectsOpen, (_e, id: string) => {
    const p = store.load(id)
    if (p) store.setLast(p.id)
    return p
  })

  ipcMain.handle(IPC.projectsLast, () => {
    const id = store.last()
    if (!id) return null
    try {
      return store.load(id)
    } catch (error) {
      log('error', `last project load failed: ${errorText(error)}`)
      return null
    }
  })

  ipcMain.handle(IPC.projectsSave, (_e, p: Project): SaveResult => {
    try {
      store.save(p)
      return { ok: true }
    } catch (error) {
      log('error', `save failed: ${errorText(error)}`)
      return { ok: false, error: errorText(error) }
    }
  })

  ipcMain.handle(IPC.projectsDelete, (_e, id: string): SaveResult => {
    try {
      store.remove(id)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: errorText(error) }
    }
  })

  ipcMain.handle(IPC.docsPick, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: '문서 넣기',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '엑셀·워드 문서', extensions: ['xlsx', 'xlsm', 'xls', 'docx', 'doc'] },
        { name: '모든 파일', extensions: ['*'] }
      ]
    }
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return r.canceled ? [] : r.filePaths
  })

  // DRM 파일 표식은 화면에서 넘기지 않고 이 PC의 앱 설정에서 읽어 붙인다
  ipcMain.handle(IPC.docsRead, (_e, requests: ReadRequest[], options?: ReadOptions) => readDocuments(requests, { ...(options ?? {}), drmMarkers: readDrmMarkers(dataDir) }))
  ipcMain.handle(IPC.docsPreview, (_e, path: string) => previewFile(path, readDrmMarkers(dataDir)))

  ipcMain.handle(IPC.exportCheckReport, async (e, p: Project): Promise<ExportResult> => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const at = new Date()
      const options: Electron.SaveDialogOptions = {
        title: '검사 리포트',
        defaultPath: join(app.getPath('documents'), checkReportFileName(p.name, at)),
        filters: [{ name: '엑셀', extensions: ['xlsx'] }]
      }
      const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      await writeFile(r.filePath, await buildCheckReportXlsx(p, at, app.getVersion()))
      log('info', 'check report ok')
      return { ok: true, path: r.filePath }
    } catch (error) {
      log('error', `check report failed: ${errorText(error)}`)
      const busy = /EBUSY|EPERM/.test(errorText(error))
      return { ok: false, error: busy ? '파일이 다른 프로그램(엑셀 등)에서 열려 있어 저장하지 못했습니다. 닫고 다시 시도해 주세요.' : errorText(error) }
    }
  })

  ipcMain.handle(IPC.exportSchedule, async (e, p: Project, today: string, exportOptions?: { includeTrace?: boolean; includePaste?: boolean; mineOnly?: boolean }): Promise<ExportResult> => {
    try {
      const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
      const exportDate = localToday()
      const mineOnly = Boolean(exportOptions?.mineOnly)
      const options: Electron.SaveDialogOptions = {
        title: '엑셀 출력',
        defaultPath: join(app.getPath('documents'), exportFileName(p.name, exportDate, mineOnly)),
        filters: [{ name: '엑셀', extensions: ['xlsx'] }]
      }
      const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      const bytes = await buildScheduleXlsx(p, today, exportDate, { includeTrace: Boolean(exportOptions?.includeTrace), includePaste: Boolean(exportOptions?.includePaste), mineOnly, profile: readProfile(dataDir) })
      await writeFile(r.filePath, bytes)
      log('info', 'export ok')
      return { ok: true, path: r.filePath }
    } catch (error) {
      log('error', `export failed: ${errorText(error)}`)
      const busy = /EBUSY|EPERM/.test(errorText(error))
      return { ok: false, error: busy ? '파일이 다른 프로그램(엑셀 등)에서 열려 있어 저장하지 못했습니다. 닫고 다시 시도해 주세요.' : errorText(error) }
    }
  })

  ipcMain.handle(IPC.showInFolder, (_e, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({ version: app.getVersion(), dataDir: store.dataDir, logFile }))
}
