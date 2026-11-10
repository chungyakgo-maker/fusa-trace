/** FSR(고객 기능안전 요구사양서, 엑셀) 읽기 — M2에서 구현 */
import type { ImportReport, TraceItem } from './model'
import { emptyReport } from './model'
import type { Workbook } from './xlsx'

export interface FsrParseResult {
  items: TraceItem[]
  version: string
  report: ImportReport
}

export function parseFsr(_wb: Workbook): FsrParseResult {
  const report = emptyReport()
  report.notes.push('FSR 내용은 M2부터 읽습니다. 지금은 파일 등록만 합니다.')
  return { items: [], version: '', report }
}
