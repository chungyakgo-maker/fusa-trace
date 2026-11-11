/**
 * SRS(소프트웨어 요구사양서, 워드) 읽기 (FORMATS §11)
 * - 요구사항 1개 = 첫 행이 `Item | Description`인 2칸 표 1개, 아래는 `키 | 값`
 * - ID가 빈칸이거나 `No separate identifier assigned`인 표 = 개발 제약 → 건너뜀
 * - TSR 참조는 `Functional Safety Related`에서 뽑음 (`Yes (TSR-017, …)`, `Yes`, `No`, 빈칸, `-`)
 * - 참조 문서 표 등 다른 표는 무시
 */
import { shortHeading } from './tsc'
import type { ImportReport, TraceItem } from './model'
import { emptyReport } from './model'
import type { DocxDocument } from './docx'
import { SYNONYMS } from './headers'
import { normHeader, toHalfWidth } from './text'
import { asilLevel, extractTsrRefs, markDuplicates, newItem } from './ids'

export interface SrsParseResult {
  items: TraceItem[]
  report: ImportReport
}

/** 키 → 표준 이름 (동의어는 읽을 때마다 최신 값을 씀) */
function keys(): [string, readonly string[]][] {
  return [
    ['id', ['requirement identifier']],
    ['title', ['requirement title']],
    ['text', SYNONYMS.srsText],
    ['fsr', ['functional safety related']],
    ['asil', ['asil']],
    ['ftti', ['ftti', 'frti', ...SYNONYMS.ftti]],
    ['safeState', ['safety state', 'safe state', ...SYNONYMS.safeState]],
    ['higher', SYNONYMS.srsHigher]
  ]
}

function keyOf(raw: string): string | undefined {
  const n = normHeader(raw)
  for (const [k, syn] of keys()) if (syn.includes(n)) return k
  return undefined
}

/** `Functional Safety Related` 값: 안전 관련 여부 */
export function safetyRelated(value: string): 'yes' | 'no' {
  return /^\s*yes/i.test(toHalfWidth(value)) ? 'yes' : 'no'
}

export function isSrsTable(rows: string[][]): boolean {
  return rows.length > 1 && rows[0].length === 2 && normHeader(rows[0][0]) === 'item' && normHeader(rows[0][1]) === 'description'
}

export function parseSrs(doc: DocxDocument): SrsParseResult {
  const report = emptyReport()
  const items: TraceItem[] = []
  let heading2 = ''
  let lastHeading = ''
  let reqTables = 0
  let constraints = 0
  for (const b of doc.blocks) {
    if (b.type === 'heading') {
      if (b.level === 2) heading2 = b.text
      lastHeading = b.text
      continue
    }
    if (!isSrsTable(b.rows)) continue
    reqTables++
    const v: Record<string, string> = {}
    const extra: Record<string, string> = {}
    for (const row of b.rows.slice(1)) {
      const key = keyOf(row[0] ?? '')
      const value = row.slice(1).join(' ').trim()
      if (key) v[key] = value
      else if (row[0]?.trim()) extra[row[0].trim()] = value
    }
    const where = `${reqTables}번째 요구사항 표 (표 ${b.index})${lastHeading ? ` · ${shortHeading(lastHeading)}` : ''}`
    const id = (v.id ?? '').trim()
    if (!id || /no separate identifier/i.test(id)) {
      constraints++
      report.skipped.push({ where, message: `요구사항 ID가 ${id ? `'${id}'` : '비어 있어'} 개발 제약 항목으로 보고 건너뛰었습니다` })
      continue
    }
    const fsr = v.fsr ?? ''
    const refs = extractTsrRefs(fsr)
    const related = safetyRelated(fsr)
    if (related === 'yes' && refs.length === 0) report.warnings.push({ where, message: `${id}: Functional Safety Related가 Yes인데 TSR이 적혀 있지 않습니다` })
    const asil = (v.asil ?? '').trim()
    items.push(
      newItem({
        kind: 'SSR',
        rawId: id,
        title: v.title || v.text || '',
        asil,
        asilLevel: asilLevel(asil),
        element: heading2,
        refRaw: fsr,
        refs,
        attrs: {
          'Functional Safety Related': fsr,
          안전관련: related,
          '요구 내용': v.text ?? '',
          FTTI: v.ftti ?? '',
          'Safety State': v.safeState ?? '',
          '상위 요구': v.higher ?? '',
          ...extra
        },
        location: where
      })
    )
  }
  markDuplicates(items)
  for (const it of items) if (it.dupIndex === 2) report.warnings.push({ where: it.location, message: `ID 중복: ${it.rawId}가 ${it.dupCount}번 나옵니다` })
  report.counts['SSR'] = items.length
  report.counts['안전 관련 SSR'] = items.filter((i) => i.attrs['안전관련'] === 'yes').length
  if (constraints > 0) report.notes.push(`ID가 없는 표 ${constraints}개는 요구사항이 아닌 개발 제약으로 보고 건너뛰었습니다`)
  return { items, report }
}
