/**
 * 산출물 일정 직접 수정 (2026-11-10 사용자 결정, DECISIONS 참고) — 순수 함수
 * - DIA 값은 그대로 두고, 고친 값만 프로젝트에 따로 저장해 화면·출력에서 덮어 씀
 * - 고칠 때의 DIA 값(base)도 저장 → 새 DIA가 고친 값과 같아지면 지우고, 다르게 바뀌면 "DIA 값이 바뀜" 표시
 * - 담당은 DIA 한 행의 칸 하나라서, 같은 행의 여러 줄에 함께 적용
 */
import type { Deliverable, DiaDateField, IsoDate, Owner, Project, ScheduleEdit } from './model'
import { DIA_DATE_FIELDS } from './model'

export type EditField = DiaDateField | 'owner'
export const EDIT_FIELDS: readonly EditField[] = [...DIA_DATE_FIELDS, 'owner']
export const EDIT_FIELD_LABEL: Record<EditField, string> = {
  planStart: '계획 시작',
  planEnd: '계획 종료',
  realStart: '실적 시작',
  realEnd: '실적 종료',
  owner: '담당'
}

/** 화면에 보이는 수정 정보 */
export interface EditView {
  /** 고친 칸 */
  fields: EditField[]
  /** 고친 뒤 DIA 값이 (고친 값과 다르게) 바뀐 칸 */
  diaChanged: EditField[]
  /** 지금 DIA 값 */
  original: Partial<Record<DiaDateField, IsoDate>> & { owner: Owner }
}

export function ownerOf(d: Pick<Deliverable, 'team' | 'people'>): Owner {
  return { team: d.team, people: [...d.people] }
}

export function cleanOwner(o: Owner): Owner {
  return { team: o.team.trim(), people: o.people.map((p) => p.trim()).filter(Boolean) }
}

export function sameOwner(a: Owner, b: Owner): boolean {
  const x = cleanOwner(a)
  const y = cleanOwner(b)
  return x.team === y.team && x.people.length === y.people.length && x.people.every((p, i) => p === y.people[i])
}

function isEmptyEdit(e: ScheduleEdit): boolean {
  return EDIT_FIELDS.every((f) => e[f] === undefined)
}

/** 고친 값을 덮어 쓴 산출물 + 수정 정보 */
export function applyEdit(d: Deliverable, e: ScheduleEdit | undefined): { d: Deliverable; view?: EditView } {
  if (!e || isEmptyEdit(e)) return { d }
  const out: Deliverable = { ...d }
  const fields: EditField[] = []
  const diaChanged: EditField[] = []
  const original: EditView['original'] = { owner: ownerOf(d) }
  for (const f of DIA_DATE_FIELDS) {
    original[f] = d[f]
    const x = e[f]
    if (!x) continue
    const now = d[f] ?? ''
    if (x.value === now) continue // DIA가 이미 같은 값 = 고친 것이 아님
    fields.push(f)
    if (x.base !== now) diaChanged.push(f)
    if (x.value) out[f] = x.value
    else delete out[f]
  }
  if (e.owner && !sameOwner(e.owner.value, ownerOf(d))) {
    fields.push('owner')
    if (!sameOwner(e.owner.base, ownerOf(d))) diaChanged.push('owner')
    const o = cleanOwner(e.owner.value)
    out.team = o.team
    out.people = o.people
  }
  if (fields.length === 0) return { d }
  // 고친 날짜에 걸린 DIA 경고는 빼고, 순서만 다시 확인
  const editedLabels = fields.filter((f) => f !== 'owner').map((f) => EDIT_FIELD_LABEL[f])
  const warnings = d.dateWarnings.filter((w) => !editedLabels.some((l) => w.includes(l)))
  if (out.planStart && out.planEnd && out.planEnd < out.planStart && (fields.includes('planStart') || fields.includes('planEnd')))
    warnings.push(`계획 종료(${out.planEnd})가 계획 시작(${out.planStart})보다 빠릅니다`)
  if (out.realStart && out.realEnd && out.realEnd < out.realStart && (fields.includes('realStart') || fields.includes('realEnd')))
    warnings.push(`실적 종료(${out.realEnd})가 실적 시작(${out.realStart})보다 빠릅니다`)
  out.dateWarnings = warnings
  return { d: out, view: { fields, diaChanged, original } }
}

function withEdits(p: Project, edits: Record<string, ScheduleEdit>, now: string): Project {
  return { ...p, scheduleEdits: edits, updatedAt: now }
}

/** 날짜 하나 고치기. DIA 값과 같게 고치면 = 원래대로 */
export function setDateEdit(p: Project, d: Deliverable, field: DiaDateField, value: IsoDate | '', now: string): Project {
  const edits = { ...(p.scheduleEdits ?? {}) }
  const cur = edits[d.key] ? { ...edits[d.key] } : { editedAt: now }
  const base = d[field] ?? ''
  if (value === base) delete cur[field]
  else cur[field] = { value, base }
  cur.editedAt = now
  if (isEmptyEdit(cur)) delete edits[d.key]
  else edits[d.key] = cur
  return withEdits(p, edits, now)
}

/** 담당 고치기: 같은 DIA 행의 모든 줄에 함께 적용 */
export function setOwnerEdit(p: Project, rowLines: Deliverable[], owner: Owner, now: string): Project {
  const edits = { ...(p.scheduleEdits ?? {}) }
  const value = cleanOwner(owner)
  for (const d of rowLines) {
    const cur = edits[d.key] ? { ...edits[d.key] } : { editedAt: now }
    const base = ownerOf(d)
    if (sameOwner(value, base)) delete cur.owner
    else cur.owner = { value, base }
    cur.editedAt = now
    if (isEmptyEdit(cur)) delete edits[d.key]
    else edits[d.key] = cur
  }
  return withEdits(p, edits, now)
}

/** 원래대로 (DIA 값으로). fields가 없으면 그 산출물의 고친 칸 전부 */
export function clearEdits(p: Project, keys: string[], now: string, fields: readonly EditField[] = EDIT_FIELDS): Project {
  const edits = { ...(p.scheduleEdits ?? {}) }
  for (const key of keys) {
    const cur = edits[key]
    if (!cur) continue
    const next: ScheduleEdit = { ...cur }
    for (const f of fields) delete next[f]
    if (isEmptyEdit(next)) delete edits[key]
    else edits[key] = next
  }
  return withEdits(p, edits, now)
}

/** 새 DIA를 넣었을 때: DIA가 고친 값과 같아진 칸은 지움 (반영 끝). 다르게 바뀐 칸은 남김 */
export function pruneEdits(edits: Record<string, ScheduleEdit> | undefined, deliverables: Deliverable[]): Record<string, ScheduleEdit> | undefined {
  if (!edits) return edits
  const byKey = new Map(deliverables.map((d) => [d.key, d]))
  const out: Record<string, ScheduleEdit> = {}
  for (const [key, e] of Object.entries(edits)) {
    const d = byKey.get(key)
    if (!d) {
      out[key] = e // 이번 DIA에 없는 산출물: 다시 생길 수 있어 남겨 둠
      continue
    }
    const next: ScheduleEdit = { ...e }
    for (const f of DIA_DATE_FIELDS) if (next[f] && next[f]!.value === (d[f] ?? '')) delete next[f]
    if (next.owner && sameOwner(next.owner.value, ownerOf(d))) delete next.owner
    if (!isEmptyEdit(next)) out[key] = next
  }
  return out
}

/** 지금 DIA 기준으로 고친 칸 수 (산출물 줄 × 칸) */
export function countEdits(p: Project, deliverables: Deliverable[]): number {
  let n = 0
  for (const d of deliverables) n += applyEdit(d, p.scheduleEdits?.[d.key]).view?.fields.length ?? 0
  return n
}
