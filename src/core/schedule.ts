/**
 * 산출물 일정: 문서 ↔ 산출물 연결, 상태(SPEC §8), VR 작성 여부, 요약 — 순수 함수 (화면·엑셀 출력 공용)
 */
import type { Category, Deliverable, IsoDate, Project, SourceDoc } from './model'
import { CATEGORIES } from './model'
import { activeDeliverables, activeDocs } from './project'
import { daysBetween, localToday } from './dates'
import { docTokens, fileNameTokens, jaccard, labelTokens } from './filename'
import { applyEdit, type EditView } from './edits'

export type ScheduleStatus = '완료' | '진행' | '지연' | '미착수'
export const SCHEDULE_STATUSES: readonly ScheduleStatus[] = ['완료', '진행', '지연', '미착수']
export type VrMark = 'O' | 'X' | '해당 없음'

export interface DocLinkInfo {
  doc: SourceDoc
  deliverableKey?: string
  method: 'auto' | 'manual' | 'none'
  /** 비슷한 이름의 산출물 후보 (자동 연결이 안 됐을 때) */
  candidates: { key: string; score: number }[]
  /** 파일 종류와 산출물이 안 맞아 보임 */
  kindMismatch: boolean
}

export interface ScheduleRow {
  d: Deliverable
  status: ScheduleStatus
  /** 일정 미기재: 계획 시작·종료 중 하나라도 비어 있음 */
  noPlan: boolean
  /** 계획 종료까지 남은 일수 (음수 = 지남) */
  dday?: number
  /** 연결된 등록 문서 (가장 최근) */
  doc?: SourceDoc
  docLink?: DocLinkInfo
  vr: VrMark
  /** VR 값이 사람이 바꾼 것인지 */
  vrManual: boolean
  /** VR 값을 바꿀 때 쓰는 키 (VR 행의 키). 해당 없음이면 undefined */
  vrKey?: string
  /** 직접 고친 칸 (d에는 고친 값이 들어 있음) */
  edit?: EditView
  /** 고치기 전 DIA 값 그대로의 산출물 */
  dia: Deliverable
}

export interface ScheduleSummary {
  total: number
  done: number
  inProgress: number
  delayed: number
  notStarted: number
  noPlan: number
}

export function effectiveToday(p: Project, now = new Date()): IsoDate {
  return p.settings.todayOverride || localToday(now)
}

const KIND_TOKEN: Partial<Record<string, string>> = { FSR: 'FSR', TSC: 'TSC', FMEA: 'FMEA', SRS: 'SRS' }

function isKindMismatch(doc: SourceDoc, d: Deliverable): boolean {
  if ((doc.kind === 'VR') !== d.isVR) return true
  const token = KIND_TOKEN[doc.kind]
  const labels = labelTokens(d.docLabel).filter((t) => t !== 'VR')
  return Boolean(token && labels.length > 0 && !labels.includes(token))
}

/** 등록 문서 ↔ DIA 산출물 연결 (FORMATS §8) */
export function computeDocLinks(p: Project): DocLinkInfo[] {
  const deliverables = activeDeliverables(p)
  const byKey = new Map(deliverables.map((d) => [d.key, d]))
  const out: DocLinkInfo[] = []
  for (const doc of activeDocs(p)) {
    if (doc.kind === 'DIA') continue
    const manual = p.docLinks.find((l) => l.normName === doc.normName)
    if (manual) {
      const d = manual.deliverableKey ? byKey.get(manual.deliverableKey) : undefined
      out.push({ doc, deliverableKey: d?.key, method: d ? 'manual' : 'none', candidates: [], kindMismatch: d ? isKindMismatch(doc, d) : false })
      continue
    }
    const exact = deliverables.find((d) => d.normExpected && d.normExpected === doc.normName)
    if (exact) {
      out.push({ doc, deliverableKey: exact.key, method: 'auto', candidates: [], kindMismatch: isKindMismatch(doc, exact) })
      continue
    }
    const tokens = fileNameTokens(doc.fileName)
    const candidates = deliverables
      .filter((d) => d.expectedFileName)
      .map((d) => ({ key: d.key, score: jaccard(tokens, fileNameTokens(d.expectedFileName)) }))
      .filter((c) => c.score >= 0.8)
      .sort((a, b) => b.score - a.score)
    out.push({ doc, method: 'none', candidates, kindMismatch: false })
  }
  return out
}

export function scheduleStatus(d: Deliverable, today: IsoDate, hasDoc: boolean): ScheduleStatus {
  if (d.realEnd) return '완료'
  if (d.planEnd && d.planEnd < today) return '지연'
  if ((d.planStart && d.planStart <= today) || hasDoc || d.realStart) return '진행'
  return '미착수'
}

function sameTokenSet(a: string[], b: string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((t) => sb.has(t))
}

export function computeSchedule(p: Project, today: IsoDate): ScheduleRow[] {
  const raw = activeDeliverables(p)
  const applied = raw.map((d) => applyEdit(d, p.scheduleEdits?.[d.key]))
  const deliverables = applied.map((a) => a.d)
  const links = computeDocLinks(p)
  const docsByKey = new Map<string, DocLinkInfo[]>()
  for (const l of links) {
    if (!l.deliverableKey) continue
    const list = docsByKey.get(l.deliverableKey) ?? []
    list.push(l)
    docsByKey.set(l.deliverableKey, list)
  }
  const vrDocs = activeDocs(p, 'VR')

  /** VR 행의 자동 판정: 연결된 VR 문서가 있거나, 파일명에 Verification Report + 문서 라벨이 든 VR 문서가 있음 */
  const vrAuto = (vrRow: Deliverable): boolean => {
    if ((docsByKey.get(vrRow.key) ?? []).length > 0) return true
    const need = labelTokens(vrRow.docLabel).filter((t) => t !== 'VR')
    if (need.length === 0) return false
    return vrDocs.some((doc) => {
      const t = docTokens(doc.fileName)
      return t.includes('VR') && need.every((n) => t.includes(n))
    })
  }
  const vrValue = (vrRow: Deliverable): { mark: VrMark; manual: boolean } => {
    const manual = p.vrOverrides[vrRow.key]
    if (manual !== undefined) return { mark: manual ? 'O' : 'X', manual: true }
    return { mark: vrAuto(vrRow) ? 'O' : 'X', manual: false }
  }

  return deliverables.map((d, index) => {
    const linked = (docsByKey.get(d.key) ?? []).sort((a, b) => b.doc.importedAt.localeCompare(a.doc.importedAt))
    const doc = linked[0]?.doc
    let vr: VrMark = '해당 없음'
    let vrManual = false
    let vrKey: string | undefined
    if (d.isVR) {
      const v = vrValue(d)
      vr = v.mark
      vrManual = v.manual
      vrKey = d.key
    } else if (d.docLabel) {
      const want = [...labelTokens(d.docLabel), 'VR']
      const pair = deliverables.find((x) => x.isVR && sameTokenSet(labelTokens(x.docLabel), want))
      if (pair) {
        const v = vrValue(pair)
        vr = v.mark
        vrManual = v.manual
        vrKey = pair.key
      }
    }
    return {
      d,
      status: scheduleStatus(d, today, Boolean(doc)),
      noPlan: !d.planStart || !d.planEnd,
      dday: d.planEnd ? daysBetween(today, d.planEnd) : undefined,
      doc,
      docLink: linked[0],
      vr,
      vrManual,
      vrKey,
      edit: applied[index].view,
      dia: raw[index]
    }
  })
}

export function summarize(rows: ScheduleRow[]): ScheduleSummary {
  return {
    total: rows.length,
    done: rows.filter((r) => r.status === '완료').length,
    inProgress: rows.filter((r) => r.status === '진행').length,
    delayed: rows.filter((r) => r.status === '지연').length,
    notStarted: rows.filter((r) => r.status === '미착수').length,
    noPlan: rows.filter((r) => r.noPlan).length
  }
}

export function ddayText(row: Pick<ScheduleRow, 'dday' | 'status'>): string {
  if (row.status === '완료') return '완료'
  if (row.dday === undefined) return '-'
  if (row.dday === 0) return 'D-day'
  return row.dday > 0 ? `D-${row.dday}` : `D+${-row.dday}`
}

export const UNASSIGNED = '담당 미지정'

/** 담당 표시: 팀 / 사람들. 둘 다 비면 "담당 미지정" */
export function assigneeText(d: Deliverable): { team: string; people: string } {
  if (!d.team && d.people.length === 0) return { team: UNASSIGNED, people: UNASSIGNED }
  return { team: d.team || '-', people: d.people.length > 0 ? d.people.join(', ') : '-' }
}

export interface OwnerSummary {
  person: string
  team: string
  total: number
  done: number
  inProgress: number
  delayed: number
  notStarted: number
}

/** 담당자별 요약 (엑셀 시트 2). 지연 많은 순 */
export function summarizeByOwner(rows: ScheduleRow[]): OwnerSummary[] {
  const map = new Map<string, OwnerSummary>()
  for (const r of rows) {
    const persons = r.d.people.length > 0 ? r.d.people : [r.d.team ? '(팀 담당)' : UNASSIGNED]
    for (const person of persons) {
      const key = `${person}|${r.d.team}`
      const s = map.get(key) ?? { person, team: r.d.team || '-', total: 0, done: 0, inProgress: 0, delayed: 0, notStarted: 0 }
      s.total++
      if (r.status === '완료') s.done++
      else if (r.status === '진행') s.inProgress++
      else if (r.status === '지연') s.delayed++
      else s.notStarted++
      map.set(key, s)
    }
  }
  return [...map.values()].sort((a, b) => b.delayed - a.delayed || b.total - a.total || a.person.localeCompare(b.person, 'ko'))
}

/** 담당자 목록 (필터용) */
export function ownerOptions(rows: ScheduleRow[]): string[] {
  const set = new Set<string>()
  for (const r of rows) {
    if (r.d.people.length === 0 && !r.d.team) set.add(UNASSIGNED)
    for (const person of r.d.people) set.add(person)
    if (r.d.team) set.add(r.d.team)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
}

export function rowMatchesOwner(r: ScheduleRow, owner: string): boolean {
  if (owner === UNASSIGNED) return r.d.people.length === 0 && !r.d.team
  return r.d.team === owner || r.d.people.includes(owner)
}

export function groupByCategory(rows: ScheduleRow[]): { category: Category; rows: ScheduleRow[] }[] {
  return CATEGORIES.map((category) => ({ category, rows: rows.filter((r) => r.d.category === category) })).filter((g) => g.rows.length > 0)
}
