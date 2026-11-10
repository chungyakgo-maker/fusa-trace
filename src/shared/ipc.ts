/** 화면(renderer) ↔ 앱 본체(main) 사이에 주고받는 기능 목록 */
import type { DocKind, IsoDate, ParsedDocument, Project, ProjectSummary } from '../core/model'

export const IPC = {
  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsOpen: 'projects:open',
  projectsLast: 'projects:last',
  projectsSave: 'projects:save',
  projectsDelete: 'projects:delete',
  docsPick: 'docs:pick',
  docsRead: 'docs:read',
  exportSchedule: 'export:schedule',
  showInFolder: 'shell:showInFolder',
  appInfo: 'app:info'
} as const

export interface SaveResult {
  ok: boolean
  error?: string
}

export interface ExportResult {
  ok: boolean
  canceled?: boolean
  path?: string
  error?: string
}

export interface ReadRequest {
  path: string
  /** 사람이 고른 종류 */
  kind?: DocKind
}

export interface AppInfo {
  version: string
  dataDir: string
  logFile: string
}

export interface FusaApi {
  platform: string
  versions: { electron: string; chrome: string }
  projects: {
    list(): Promise<ProjectSummary[]>
    create(name: string): Promise<Project>
    open(id: string): Promise<Project | null>
    last(): Promise<Project | null>
    save(project: Project): Promise<SaveResult>
    remove(id: string): Promise<SaveResult>
  }
  docs: {
    /** 파일 선택 창 → 고른 파일 경로들 */
    pick(): Promise<string[]>
    /** 끌어다 놓은 파일의 경로 */
    pathOf(file: File): string
    /** 파일 읽기 (작업 스레드) */
    read(requests: ReadRequest[]): Promise<ParsedDocument[]>
  }
  exportSchedule(project: Project, today: IsoDate, options: { includeTrace: boolean }): Promise<ExportResult>
  showInFolder(path: string): Promise<void>
  appInfo(): Promise<AppInfo>
}
