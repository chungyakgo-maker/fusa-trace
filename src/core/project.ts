/** 프로젝트 데이터 다루기: 만들기, 문서 반영(버전 관리), 삭제, 버전 비교 — 순수 함수 */
import type { Deliverable, DocKind, ParsedDocument, Project, SourceDoc, TraceItem } from './model'
import { normalizeFileName } from './filename'
import { pruneEdits } from './edits'

export function newProject(id: string, name: string, now: string): Project {
  return {
    schema: 1,
    id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    settings: { milestones: [] },
    docs: [],
    aliases: [],
    docLinks: [],
    vrOverrides: {}
  }
}

export function activeDocs(p: Project, kind?: DocKind): SourceDoc[] {
  return p.docs.filter((d) => d.active && (kind === undefined || d.kind === kind))
}

/** 산출물 목록: 활성 DIA (프로젝트당 1개)의 산출물 */
export function activeDeliverables(p: Project): Deliverable[] {
  return activeDocs(p, 'DIA')[0]?.dia?.deliverables ?? []
}

/** 같은 문서의 이전 버전 (활성). DIA는 이름과 관계없이 프로젝트당 1개 */
export function previousVersion(p: Project, kind: DocKind, normName: string): SourceDoc | undefined {
  return p.docs.find((d) => d.active && d.kind === kind && (kind === 'DIA' || d.normName === normName))
}

export function findSameFile(p: Project, hash: string): SourceDoc | undefined {
  return p.docs.find((d) => d.hash === hash)
}

export function toSourceDoc(parsed: ParsedDocument, kind: DocKind, id: string, now: string): SourceDoc {
  return {
    id,
    kind,
    fileName: parsed.fileName,
    normName: normalizeFileName(parsed.fileName),
    version: parsed.version,
    importedAt: now,
    hash: parsed.hash,
    size: parsed.size,
    active: true,
    report: parsed.report,
    ...(parsed.dia ? { dia: parsed.dia } : {}),
    ...(parsed.items ? { items: parsed.items } : {}),
    ...(parsed.meta ? { meta: parsed.meta } : {})
  }
}

/** 새 문서 반영: 같은 종류·같은 정규화 이름의 이전 버전은 비활성 (보관) */
export function addDocument(p: Project, doc: SourceDoc, now: string): Project {
  const docs = p.docs.map((d) =>
    d.active && d.kind === doc.kind && (doc.kind === 'DIA' || d.normName === doc.normName) ? { ...d, active: false } : d
  )
  // 새 DIA: 고친 값과 같아진 칸은 지움 (반영 끝)
  if (doc.kind === 'DIA' && doc.dia && p.scheduleEdits) return { ...p, docs: [...docs, doc], scheduleEdits: pruneEdits(p.scheduleEdits, doc.dia.deliverables), updatedAt: now }
  return { ...p, docs: [...docs, doc], updatedAt: now }
}

/** 문서 삭제. 활성 문서였으면 같은 문서의 가장 최근 이전 버전을 다시 활성으로 */
export function removeDocument(p: Project, docId: string, now: string): Project {
  const target = p.docs.find((d) => d.id === docId)
  if (!target) return p
  let docs = p.docs.filter((d) => d.id !== docId)
  if (target.active) {
    const same = docs
      .filter((d) => d.kind === target.kind && (target.kind === 'DIA' || d.normName === target.normName))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0]
    if (same) docs = docs.map((d) => (d.id === same.id ? { ...d, active: true } : d))
  }
  return { ...p, docs, updatedAt: now }
}

export interface FieldChange {
  key: string
  label: string
  fields: string[]
}

export interface VersionDiff {
  added: { key: string; label: string }[]
  removed: { key: string; label: string }[]
  changed: FieldChange[]
  countBefore: number
  countAfter: number
  /** 항목 수가 크게 줄었을 때 경고 */
  warning?: string
}

const DELIVERABLE_FIELDS: [keyof Deliverable, string][] = [
  ['workProduct', '산출물'],
  ['planStart', '계획 시작'],
  ['planEnd', '계획 종료'],
  ['realStart', '실적 시작'],
  ['realEnd', '실적 종료'],
  ['team', '담당 팀'],
  ['people', '담당자']
]

function deliverableLabel(d: Deliverable): string {
  return `No.${d.diaNo}${d.lineCount > 1 ? `-${d.line}` : ''} ${d.docLabel || d.workProduct}`.trim()
}

function sizeWarning(before: number, after: number, unit: string): string | undefined {
  if (before >= 4 && after < before * 0.5) return `${unit} 수가 크게 줄었습니다 (${before} → ${after}). 양식이 바뀌었을 수 있으니 확인해 주세요.`
  return undefined
}

export function diffDeliverables(prev: Deliverable[], next: Deliverable[]): VersionDiff {
  const before = new Map(prev.map((d) => [d.key, d]))
  const after = new Map(next.map((d) => [d.key, d]))
  const diff: VersionDiff = { added: [], removed: [], changed: [], countBefore: prev.length, countAfter: next.length }
  for (const [key, d] of after) if (!before.has(key)) diff.added.push({ key, label: deliverableLabel(d) })
  for (const [key, d] of before) if (!after.has(key)) diff.removed.push({ key, label: deliverableLabel(d) })
  for (const [key, d] of after) {
    const old = before.get(key)
    if (!old) continue
    const fields = DELIVERABLE_FIELDS.filter(([f]) => JSON.stringify(old[f] ?? '') !== JSON.stringify(d[f] ?? '')).map(([, label]) => label)
    if (fields.length > 0) diff.changed.push({ key, label: deliverableLabel(d), fields })
  }
  diff.warning = sizeWarning(prev.length, next.length, '산출물')
  return diff
}

/** 항목 키: 정규화 ID, 같은 ID가 여러 개면 `#순번` */
export function itemKey(item: Pick<TraceItem, 'normId' | 'dupIndex' | 'dupCount'>): string {
  return item.dupCount > 1 ? `${item.normId}#${item.dupIndex}` : item.normId
}

const ITEM_FIELDS: [keyof TraceItem, string][] = [
  ['title', '내용'],
  ['asil', 'ASIL'],
  ['allocationRaw', '할당'],
  ['refRaw', '위 단계 참조'],
  ['statusRaw', '상태'],
  ['element', '요소']
]

export function diffItems(prev: TraceItem[], next: TraceItem[]): VersionDiff {
  const k = (i: TraceItem): string => `${i.kind}:${itemKey(i)}`
  const label = (i: TraceItem): string => `${i.kind} ${i.rawId}${i.dupCount > 1 ? ` (중복 #${i.dupIndex})` : ''}`
  const before = new Map(prev.map((i) => [k(i), i]))
  const after = new Map(next.map((i) => [k(i), i]))
  const diff: VersionDiff = { added: [], removed: [], changed: [], countBefore: prev.length, countAfter: next.length }
  for (const [key, i] of after) if (!before.has(key)) diff.added.push({ key, label: label(i) })
  for (const [key, i] of before) if (!after.has(key)) diff.removed.push({ key, label: label(i) })
  for (const [key, i] of after) {
    const old = before.get(key)
    if (!old) continue
    const fields = ITEM_FIELDS.filter(([f]) => JSON.stringify(old[f] ?? '') !== JSON.stringify(i[f] ?? '')).map(([, l]) => l)
    if (fields.length > 0) diff.changed.push({ key, label: label(i), fields })
  }
  diff.warning = sizeWarning(prev.length, next.length, '항목')
  return diff
}

/** 가져오기 결과 화면용: 이전 버전과 비교 */
export function diffWithPrevious(p: Project, kind: DocKind, parsed: ParsedDocument): VersionDiff | undefined {
  const prev = previousVersion(p, kind, normalizeFileName(parsed.fileName))
  if (!prev) return undefined
  if (kind === 'DIA') return diffDeliverables(prev.dia?.deliverables ?? [], parsed.dia?.deliverables ?? [])
  if (prev.items || parsed.items) return diffItems(prev.items ?? [], parsed.items ?? [])
  return undefined
}
