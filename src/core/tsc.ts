/**
 * TSC(사내 기술안전개념서, 워드) 읽기 (FORMATS §5)
 * - TSR 표: 첫 행 `Ref ID | TSR ID | Technical Safety Requirements | 분류 | ASIL | Allocation`, 둘째 행 값, 이후 `키 | 값` 속성 행
 * - 한 표 안에 TSR이 2개 이상 붙은 경우: 표 중간에 `Ref ID` 행이 다시 나오면 새 TSR
 * - 요소(Element): 표의 Element/Name of Functional Block 우선, 없으면 바로 앞의 제목 2
 * - FSR 사본 표, Safety Mechanism 목록 표, 목차는 읽지 않음
 */
import type { ImportReport, TraceItem } from './model'
import { emptyReport } from './model'
import type { DocxDocument } from './docx'
import { cleanValue, isTbd, normHeader } from './text'
import { SYNONYMS } from './headers'
import { asilLevel, extractFsrRefs, markDuplicates, newItem, normalizeAllocation, normalizeStatus } from './ids'

export interface TscParseResult {
  items: TraceItem[]
  version: string
  report: ImportReport
}

/** 속성 키 → 표준 이름 (FORMATS §3.4, 사용자 동의어 포함) */
function attrKeys(): [string, readonly string[]][] {
  return [
    ['Element', SYNONYMS.element],
    ['Operating Mode', ['operating mode']],
    ['Safe State', ['safe state', 'safety state', ...SYNONYMS.safeState]],
    ['Safety Mechanism', SYNONYMS.sm],
    ['FTTI', ['ftti', 'ftti / fthi', 'ftti/fthi', 'frti', ...SYNONYMS.ftti]],
    ['Acceptance criteria', SYNONYMS.acceptance],
    ['Status', ['status', '상태']]
  ]
}

function attrName(key: string): string | undefined {
  const n = normHeader(key)
  for (const [name, syn] of attrKeys()) if (syn.includes(n)) return name
  return undefined
}

function isTsrHeader(row: string[]): boolean {
  return normHeader(row[0]).startsWith('ref id') && normHeader(row[1]).startsWith('tsr id')
}

function readVersion(doc: DocxDocument): string {
  for (const b of doc.blocks) {
    if (b.type !== 'table' || b.rows.length === 0) continue
    const head = b.rows[0].map(normHeader)
    const verCol = head.findIndex((h) => h === 'ver.' || h === 'ver' || h === 'version')
    if (verCol < 0 || !head.includes('date')) continue
    let last = ''
    for (const row of b.rows.slice(1)) if (row[verCol]?.trim()) last = row[verCol].trim()
    return last
  }
  return ''
}

/** 제목이 길면 앞부분만 */
export function shortHeading(text: string, max = 40): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function parseTsc(doc: DocxDocument): TscParseResult {
  const report = emptyReport()
  const items: TraceItem[] = []
  let heading2 = ''
  /** 가장 가까운 제목 (위치 표시용) */
  let lastHeading = ''
  let tsrTables = 0

  for (const block of doc.blocks) {
    if (block.type === 'heading') {
      if (block.level === 2) heading2 = block.text
      lastHeading = block.text
      continue
    }
    const rows = block.rows
    if (!rows.some(isTsrHeader)) continue
    tsrTables++
    for (let i = 0; i < rows.length; i++) {
      if (!isTsrHeader(rows[i])) continue
      const head = rows[i].map(normHeader)
      const col = (test: (h: string) => boolean): number => head.findIndex(test)
      const cRef = 0
      const cId = 1
      const cText = col((h) => h.startsWith('technical safety'))
      const cClass = col((h) => h === '분류' || h === 'category')
      const cAsil = col((h) => h === 'asil')
      const cAlloc = col((h) => h.startsWith('allocation'))
      // 값 행: 빈 행은 건너뜀
      let v = i + 1
      while (v < rows.length && rows[v].every((c) => !c.trim())) v++
      // 위치: n번째 TSR 표 (문서의 표 번호) + 가장 가까운 제목 — SPEC 검사 규칙 §위치
      const where = `${tsrTables}번째 TSR 표 (표 ${block.index}${rows.filter(isTsrHeader).length > 1 ? `, ${i + 1}행` : ''})${lastHeading ? ` · ${shortHeading(lastHeading)}` : ''}`
      if (v >= rows.length || isTsrHeader(rows[v])) {
        report.skipped.push({ where, message: 'TSR 머리글 아래에 값 행이 없습니다' })
        continue
      }
      const values = rows[v]
      const get = (c: number): string => (c >= 0 ? (values[c] ?? '').trim() : '')
      // 속성 행: 다음 TSR 머리글 전까지
      const attrs: Record<string, string> = {}
      let k = v + 1
      for (; k < rows.length && !isTsrHeader(rows[k]); k++) {
        const r = rows[k]
        if (r.every((c) => !c.trim())) continue
        const name = attrName(r[0] ?? '')
        const value = r.slice(1).map((c) => c.trim()).filter(Boolean).join(' ')
        if (!name) continue
        attrs[name] = attrs[name] ? `${attrs[name]}\n${value}` : value
      }
      i = k - 1

      const id = cleanValue(get(cId))
      if (!id) {
        report.skipped.push({ where, message: 'TSR ID가 비어 있어 건너뛰었습니다' })
        continue
      }
      const refRaw = get(cRef)
      const allocRaw = get(cAlloc)
      const alloc = normalizeAllocation(allocRaw)
      const cls = get(cClass)
      const asil = get(cAsil)
      for (const [name, value] of Object.entries(attrs)) {
        if (isTbd(value)) report.warnings.push({ where, message: `${id}: ${name} 미정 (${value})` })
      }
      if (alloc.allocation === 'UNKNOWN' || alloc.allocation === 'OTHER') {
        report.warnings.push({ where, message: `${id}: Allocation을 해석하지 못했습니다 ('${allocRaw}')` })
      }
      items.push(
        newItem({
          kind: 'TSR',
          rawId: id,
          title: get(cText),
          asil,
          asilLevel: asilLevel(asil),
          allocation: alloc.allocation,
          allocationRaw: allocRaw,
          allocationNote: alloc.note,
          general: /^(일반|공통|general|common)$/i.test(cls.trim()),
          element: attrs['Element'] || heading2,
          statusRaw: attrs['Status'] ?? '',
          status: normalizeStatus(attrs['Status'] ?? ''),
          refRaw,
          refs: extractFsrRefs(refRaw),
          attrs: { 분류: cls, ...attrs },
          location: where
        })
      )
      if (!refRaw.trim()) report.warnings.push({ where, message: `${id}: Ref ID(위 단계 FSR)가 비어 있습니다` })
    }
  }

  markDuplicates(items)
  for (const it of items) {
    if (it.dupIndex === 2) report.warnings.push({ where: it.location, message: `ID 중복: ${it.rawId}가 ${it.dupCount}번 나옵니다 (내용이 다를 수 있음)` })
  }
  report.counts['TSR'] = items.length
  report.counts['TSR 표'] = tsrTables
  const na = items.filter((i) => i.status === 'notApplicable').length
  if (na > 0) report.notes.push(`Status가 미적용·미해당·N/A인 TSR ${na}개는 "대상 아님"으로 계산에서 뺍니다`)
  if (tsrTables === 0) report.warnings.push({ where: '문서', message: 'TSR 표(Ref ID | TSR ID …)를 찾지 못했습니다' })
  return { items, version: readVersion(doc), report }
}
