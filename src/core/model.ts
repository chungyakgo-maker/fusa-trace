/**
 * 데이터 구조 (SPEC §5). 프로젝트 1개 = JSON 파일 1개.
 * 원본 문서의 내용은 넣을 때 읽은 결과만 저장하고, 연결·상태는 화면에서 매번 계산한다.
 */

export type DocKind = 'DIA' | 'FSR' | 'TSC' | 'FMEA' | 'SRS' | 'VR' | 'OTHER'

export const DOC_KINDS: readonly DocKind[] = ['DIA', 'FSR', 'TSC', 'FMEA', 'SRS', 'VR', 'OTHER']

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  DIA: 'DIA (개발 인터페이스 협약서)',
  FSR: 'FSR (기능안전 요구사양서)',
  TSC: 'TSC (기술안전개념서)',
  FMEA: 'FMEA',
  SRS: 'SRS (소프트웨어 요구사양서)',
  VR: 'Verification Report (동료검토)',
  OTHER: '기타 문서'
}

/** 이 버전에서 내용까지 읽는 종류. 나머지는 파일 등록만 (일정 화면의 "등록 문서" 표시용) */
export const CONTENT_READ_KINDS: readonly DocKind[] = ['DIA', 'FSR', 'TSC', 'FMEA', 'SRS']

/** 날짜 'YYYY-MM-DD' */
export type IsoDate = string

export interface ImportIssue {
  /** 위치: 예) "Detailed Agreement 시트 12행", "표 15" */
  where: string
  message: string
}

/** 가져오기 결과 (SPEC §6.4) */
export interface ImportReport {
  /** 읽은 항목 수 (종류별) 예) { 산출물: 120 } / { SG: 2, FSR: 33 } */
  counts: Record<string, number>
  skipped: ImportIssue[]
  warnings: ImportIssue[]
  /** 안내 (예: "내용은 M4부터 읽습니다") */
  notes: string[]
}

export type Category = '관리' | '시스템' | 'SW' | 'HW' | '기타'
export const CATEGORIES: readonly Category[] = ['관리', '시스템', 'SW', 'HW', '기타']

/** DIA에서 온 산출물 1줄 (한 DIA 행에 파일이 여러 개면 여러 줄) */
export interface Deliverable {
  /** 다음 버전 DIA에서도 같은 산출물을 가리키는 키: `No.#정규화 파일명` 또는 `No.#줄번호` */
  key: string
  diaNo: number
  /** 같은 DIA 행 안의 순번 (1부터) / 그 행의 줄 수 */
  line: number
  lineCount: number
  /** 엑셀 행 번호 (1부터) */
  sourceRow: number
  partClause: string
  category: Category
  workProduct: string
  /** 문서 라벨: FMEA, DFA, TSC VR … (없으면 '') */
  docLabel: string
  /** DIA의 실제 파일명 한 줄 (없으면 '') */
  expectedFileName: string
  /** 정규화 예상 파일명 (FORMATS §8) */
  normExpected: string
  planStart?: IsoDate
  planEnd?: IsoDate
  realStart?: IsoDate
  realEnd?: IsoDate
  team: string
  people: string[]
  /** 파일명이 아닌 글 ("FMEDA 대체" 등) */
  memo: string[]
  isVR: boolean
  /** 날짜 경고 (형식 오류, 종료 < 시작, 짝 못 찾음) */
  dateWarnings: string[]
}

export interface DiaContent {
  deliverables: Deliverable[]
}

export type ItemKind = 'SG' | 'SS' | 'FSR' | 'TSR' | 'FMEA_CAUSE' | 'SSR' | 'SWTEST' | 'HSR'

/** 할당: HW / SW / BOTH, 일반(General), 타 제어기 등 그 외, 알 수 없음 */
export type Allocation = 'HW' | 'SW' | 'BOTH' | 'GENERAL' | 'OTHER' | 'UNKNOWN'

/** 문서에 적힌 상태의 정규화: 완료 / 진행 / 대상 아님(미적용·미해당·N/A) / 알 수 없음 */
export type DocStatus = 'done' | 'inProgress' | 'notApplicable' | 'unknown'

export type FsrOrigin = 'own' | 'toOther' | 'fromOther'

/** 추적 대상 1개 */
export interface TraceItem {
  kind: ItemKind
  /** 적힌 ID 그대로 */
  rawId: string
  /** 정규화 ID (FORMATS §7.1) */
  normId: string
  /** 같은 문서 안 같은 ID의 순번 (1부터) / 같은 ID 개수. 2개 이상이면 "ID 중복" */
  dupIndex: number
  dupCount: number
  title: string
  asil: string
  /** ASIL 앞 글자: A~D, QM, '' */
  asilLevel: string
  allocation: Allocation
  allocationRaw: string
  /** 할당 괄호 안 담당 주체 등 */
  allocationNote: string
  element: string
  statusRaw: string
  status: DocStatus
  /** 일반 요구 (TSR 분류 일반/공통, FSR Allocation General) */
  general: boolean
  /** FSR: 속한 SG (정규화) */
  sg?: string
  /** FSR: 구분 */
  origin?: FsrOrigin
  /** 위 단계 참조: 적힌 칸 원문 */
  refRaw: string
  /** 위 단계 참조: 뽑아낸 ID들 (원문 조각) */
  refs: string[]
  /** 그 밖의 속성 (Safe State, FTTI 등) */
  attrs: Record<string, string>
  /** 문서 안 위치 */
  location: string
}

export interface SourceDoc {
  id: string
  kind: DocKind
  fileName: string
  /** 정규화 파일명 (FORMATS §8) */
  normName: string
  /** 문서 안 버전 (있으면) */
  version: string
  importedAt: string
  hash: string
  size: number
  /** 같은 종류·같은 정규화 이름 중 최신만 활성 */
  active: boolean
  report: ImportReport
  dia?: DiaContent
  items?: TraceItem[]
  /** 문서별 부가 정보 (예: FMEA의 TSR 연결 칸 유무 tsrColumn: 'yes' | 'no') */
  meta?: Record<string, string>
}

/** 사람이 고른 연결 기억 (SPEC §5 Alias) */
export interface Alias {
  /** 참조가 적힌 문서 종류 */
  sourceKind: DocKind
  /** 적힌 참조 (정규화) */
  ref: string
  /** 대상 항목 키 (`정규화ID` 또는 중복이면 `정규화ID#순번`) */
  target: string
  createdAt: string
}

/** 문서 ↔ DIA 산출물 연결을 사람이 고른 기억 (정규화 파일명 기준이라 다음 버전부터 자동) */
export interface DocLink {
  normName: string
  /** 연결할 산출물 키. '' = 연결하지 않음 */
  deliverableKey: string
}

export interface Milestone {
  id: string
  name: string
  date: IsoDate
}

export interface ProjectSettings {
  /** 오늘 기준일 덮어쓰기 (없으면 실제 오늘) */
  todayOverride?: IsoDate
  milestones: Milestone[]
}

export interface Project {
  schema: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
  docs: SourceDoc[]
  aliases: Alias[]
  docLinks: DocLink[]
  /** VR 작성 수동 체크 (산출물 키 → O/X) */
  vrOverrides: Record<string, boolean>
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

/** 작업 스레드가 문서 1개를 읽은 결과 */
export interface ParsedDocument {
  path: string
  fileName: string
  size: number
  hash: string
  ok: boolean
  errorKind?: 'DRM' | 'UNREADABLE' | 'UNSUPPORTED' | 'FAILED'
  error?: string
  /** 판별된 종류 (판별 실패·여러 개면 undefined → 사람이 고름) */
  kind?: DocKind
  /** 판별 신호가 맞은 종류들 */
  detectedKinds: DocKind[]
  version: string
  report: ImportReport
  dia?: DiaContent
  items?: TraceItem[]
  meta?: Record<string, string>
  /** 읽는 데 걸린 시간 (ms) */
  elapsedMs: number
}

export function emptyReport(): ImportReport {
  return { counts: {}, skipped: [], warnings: [], notes: [] }
}
