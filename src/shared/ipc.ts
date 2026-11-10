/** 화면(renderer) ↔ 앱 본체(main) 사이에 주고받는 기능 목록 */
import type { DocKind, IsoDate, ParsedDocument, Project, ProjectSummary, ReadOptions } from '../core/model'
import type { PreviewData } from '../core/rules'
import type { UpdateState } from '../core/update'

export const IPC = {
  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsOpen: 'projects:open',
  projectsLast: 'projects:last',
  projectsSave: 'projects:save',
  projectsDelete: 'projects:delete',
  docsPick: 'docs:pick',
  docsRead: 'docs:read',
  docsPreview: 'docs:preview',
  exportSchedule: 'export:schedule',
  showInFolder: 'shell:showInFolder',
  appInfo: 'app:info',
  updateGet: 'update:get',
  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateSetAuto: 'update:setAuto',
  updateOpenPage: 'update:openPage',
  updateShowFile: 'update:showFile',
  /** 앱 본체 → 화면: 업데이트 상태가 바뀜 */
  updateState: 'update:state'
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
    /** 파일 읽기 (작업 스레드). options: 칸 지정 규칙, 사용자 동의어 */
    read(requests: ReadRequest[], options?: ReadOptions): Promise<ParsedDocument[]>
    /** 칸 지정 화면용 미리보기 (작업 스레드) */
    preview(path: string): Promise<PreviewData | { error: string }>
  }
  exportSchedule(project: Project, today: IsoDate, options: { includeTrace: boolean; includePaste?: boolean }): Promise<ExportResult>
  showInFolder(path: string): Promise<void>
  appInfo(): Promise<AppInfo>
  /** 업데이트 (GitHub Release). 접속은 앱 본체의 업데이트 전용 연결만 함 */
  update: {
    get(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<UpdateState>
    install(): Promise<UpdateState>
    setAutoCheck(on: boolean): Promise<UpdateState>
    openPage(): Promise<void>
    showFile(): Promise<void>
    /** 상태가 바뀔 때마다 부름. 돌려준 함수를 부르면 그만 받음 */
    onState(callback: (state: UpdateState) => void): () => void
  }
}
