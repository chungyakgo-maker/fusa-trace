/** ID 정규화, 참조 문자열에서 ID 뽑기, 할당·상태·ASIL 정리 (FORMATS §5.2, §7) — 순수 함수 */
import type { Allocation, DocStatus, TraceItem } from './model'
import { normHeader, toHalfWidth } from './text'

/**
 * ID 정규화: 앞뒤 공백 제거, 전각→반각, 대문자, 공백·`_` → `-`, `-` 여러 개 → 하나, 끝의 `,` `.` `)` 제거
 * 예: `ABC_XYZ_TSR_009` → `ABC-XYZ-TSR-009`
 */
export function normalizeId(raw: string): string {
  return toHalfWidth(raw)
    .normalize('NFC')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/[,.)]+$/, '')
    .replace(/^-+|-+$/g, '')
}

/** FSR 참조: 구분자(줄바꿈 `,` `/` 공백 `;`)로 나눈 조각 중 숫자가 들어 있는 것 */
export function extractFsrRefs(cell: string): string[] {
  const out: string[] = []
  for (const piece of toHalfWidth(cell).split(/[\s,/;]+/)) {
    const t = piece.replace(/^[([]+|[)\].,]+$/g, '').trim()
    if (t && /\d/.test(t) && !out.includes(t)) out.push(t)
  }
  return out
}

/**
 * TSR 참조: `TSR`이 들어 있고 숫자로 끝나는 덩어리
 * (`TSR-017`, `TSR_017`, `TSR 017`, `ABC_XYZ_TSR_009`, `TSR-<제어기>-SG001-017`)
 */
export function extractTsrRefs(cell: string): string[] {
  const text = toHalfWidth(cell).replace(/TSR\s+(?=\d)/gi, 'TSR-')
  const out: string[] = []
  for (const m of text.matchAll(/[A-Za-z0-9_-]*TSR[A-Za-z0-9_-]*\d/gi)) {
    const t = m[0].replace(/^[-_]+/, '')
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/** 할당 정리: HW / SW / BOTH, General → GENERAL, 그 외 → OTHER. 괄호 안 담당 주체는 메모로 */
export function normalizeAllocation(raw: string): { allocation: Allocation; note: string } {
  const t = toHalfWidth(raw).trim()
  if (!t || /^(-|n\/a)$/i.test(t)) return { allocation: 'UNKNOWN', note: '' }
  if (/^general$/i.test(t)) return { allocation: 'GENERAL', note: '' }
  const note = [...t.matchAll(/\(([^()]*)\)/g)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    .join(', ')
  const core = t.replace(/\([^()]*\)/g, ' ').replace(/[()]/g, ' ').toUpperCase()
  const sw = /(^|[^A-Z])S\s*\/?\s*W([^A-Z]|$)/.test(core)
  const hw = /(^|[^A-Z])H\s*\/?\s*W([^A-Z]|$)/.test(core)
  return { allocation: sw && hw ? 'BOTH' : sw ? 'SW' : hw ? 'HW' : 'OTHER', note }
}

/** 문서 상태 정리: 평가 완료/Complete → 완료, 설계 진행중/Design in progress → 진행, 미적용/미해당/N/A → 대상 아님 */
export function normalizeStatus(raw: string): DocStatus {
  const t = normHeader(raw)
  if (!t) return 'unknown'
  if (/^(평가\s*완료|complete|completed|완료)$/.test(t)) return 'done'
  if (/진행|in progress/.test(t)) return 'inProgress'
  if (/^(미적용|미해당|n\/?a|not applicable|해당\s*없음)$/.test(t)) return 'notApplicable'
  return 'unknown'
}

/** ASIL 앞 글자: `B(D)` → B, `QM` → QM */
export function asilLevel(raw: string): string {
  const m = /^\s*(QM|[A-D])/i.exec(toHalfWidth(raw))
  return m ? m[1].toUpperCase() : ''
}

/** SG 번호: `SG001`, `SG_01`, `SG-1` → 1 */
export function sgNumber(id: string): number | undefined {
  const m = /SG[-_ ]?0*(\d+)/i.exec(toHalfWidth(id))
  return m ? Number(m[1]) : undefined
}

/** 같은 문서 안의 같은 ID에 순번 매기기 (ID 중복 표시용) */
export function markDuplicates(items: TraceItem[]): void {
  const groups = new Map<string, TraceItem[]>()
  for (const it of items) {
    const k = `${it.kind}:${it.normId}`
    const g = groups.get(k) ?? []
    g.push(it)
    groups.set(k, g)
  }
  for (const g of groups.values()) {
    g.forEach((it, i) => {
      it.dupIndex = i + 1
      it.dupCount = g.length
    })
  }
}

export function newItem(partial: Partial<TraceItem> & Pick<TraceItem, 'kind' | 'rawId' | 'location'>): TraceItem {
  return {
    normId: normalizeId(partial.rawId),
    dupIndex: 1,
    dupCount: 1,
    title: '',
    asil: '',
    asilLevel: '',
    allocation: 'UNKNOWN',
    allocationRaw: '',
    allocationNote: '',
    element: '',
    statusRaw: '',
    status: 'unknown',
    general: false,
    refRaw: '',
    refs: [],
    attrs: {},
    ...partial
  }
}
