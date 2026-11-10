/** TSC(기술안전개념서, 워드) 읽기 — M2에서 구현 */
import type { ImportReport, TraceItem } from './model'
import { emptyReport } from './model'
import type { DocxDocument } from './docx'

export interface TscParseResult {
  items: TraceItem[]
  version: string
  report: ImportReport
}

export function parseTsc(_doc: DocxDocument): TscParseResult {
  const report = emptyReport()
  report.notes.push('TSC 내용은 M2부터 읽습니다. 지금은 파일 등록만 합니다.')
  return { items: [], version: '', report }
}
