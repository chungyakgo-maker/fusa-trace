/**
 * 문서 1개 읽기: DRM 검사 → 종류 판별 → 종류별 읽기 (SPEC §6, FORMATS §1·§2). 작업 스레드에서 실행.
 */
import type { DocKind, ImportReport, ParsedDocument } from './model'
import { emptyReport } from './model'
import { DRM_MESSAGE, UNREADABLE_MESSAGE, fileExtension, isVerificationReportName, sniffFile } from './sniff'
import { type Workbook, readWorkbook } from './xlsx'
import { type DocxDocument, isDocx, readDocx } from './docx'
import { isDiaSheet, parseDia } from './dia'
import { SYNONYMS } from './headers'
import { sheetHasHeader } from './headers'
import { normHeader } from './text'
import { versionFromFileName } from './filename'
import { parseFsr } from './fsr'
import { parseTsc } from './tsc'

export type ReadResult = Omit<ParsedDocument, 'path' | 'hash' | 'size' | 'elapsedMs'>

const LATER_NOTE: Partial<Record<DocKind, string>> = {
  FMEA: 'FMEA 내용(고장원인·TSR 연결)은 M4부터 읽습니다. 지금은 파일 등록(산출물 일정의 "등록 문서")만 합니다.',
  SRS: 'SRS 내용(SSR·TSR 연결)은 M4부터 읽습니다. 지금은 파일 등록만 합니다.',
  VR: 'Verification Report는 내용을 열지 않고 파일명으로만 작성 여부를 판단합니다.',
  OTHER: '처음 보는 양식입니다. 칸 지정 기능은 M5부터 제공합니다. 지금은 파일 등록만 합니다.'
}

function fail(fileName: string, errorKind: NonNullable<ReadResult['errorKind']>, error: string): ReadResult {
  return { fileName, ok: false, errorKind, error, detectedKinds: [], version: '', report: emptyReport() }
}

export function detectWorkbookKinds(wb: Workbook): DocKind[] {
  const kinds: DocKind[] = []
  if (wb.sheets.some((s) => isDiaSheet(s))) kinds.push('DIA')
  if (wb.sheets.some((s) => sheetHasHeader(s, (n) => (SYNONYMS.fsrId as readonly string[]).includes(n), 80))) kinds.push('FSR')
  if (wb.sheets.some((s) => sheetHasHeader(s, (n) => n.includes('failure cause') || n.includes('고장 원인'), 30))) kinds.push('FMEA')
  return kinds
}

export function detectDocxKinds(doc: DocxDocument): DocKind[] {
  const kinds: DocKind[] = []
  let tsc = false
  let srs = false
  for (const b of doc.blocks) {
    if (b.type !== 'table' || b.rows.length === 0) continue
    const first = b.rows[0].map(normHeader)
    if (!tsc && first[0]?.startsWith('ref id') && first[1]?.startsWith('tsr id')) tsc = true
    if (!srs && first.length === 2 && first[0] === 'item' && first[1] === 'description') {
      if (b.rows.some((r) => normHeader(r[0]) === 'requirement identifier')) srs = true
    }
    if (tsc && srs) break
  }
  if (tsc) kinds.push('TSC')
  if (srs) kinds.push('SRS')
  return kinds
}

/**
 * @param forcedKind 사람이 고른 종류 (판별 실패·애매할 때)
 */
export function readDocument(fileName: string, bytes: Uint8Array, forcedKind?: DocKind): ReadResult {
  const sniff = sniffFile(bytes)
  if (sniff === 'DRM') return fail(fileName, 'DRM', DRM_MESSAGE)
  if (sniff === 'UNKNOWN') return fail(fileName, 'UNREADABLE', UNREADABLE_MESSAGE)
  const ext = fileExtension(fileName)

  // Verification Report: 파일명으로만 판단, 내용은 열지 않음 (FORMATS §12)
  if (isVerificationReportName(fileName) && (forcedKind === undefined || forcedKind === 'VR')) {
    return registerOnly(fileName, 'VR', ['VR'])
  }

  let wb: Workbook | undefined
  let doc: DocxDocument | undefined
  if (sniff === 'OLE') {
    if (ext === 'doc') return fail(fileName, 'UNSUPPORTED', '.doc(옛 워드 형식)는 읽을 수 없습니다. 워드에서 .docx로 저장한 뒤 넣어 주세요.')
    try {
      wb = readWorkbook(bytes)
    } catch {
      return fail(fileName, 'UNREADABLE', UNREADABLE_MESSAGE)
    }
  } else if (isDocx(bytes)) {
    doc = readDocx(bytes)
  } else {
    try {
      wb = readWorkbook(bytes)
    } catch {
      return fail(fileName, 'UNREADABLE', UNREADABLE_MESSAGE)
    }
  }

  const detectedKinds = wb ? detectWorkbookKinds(wb) : doc ? detectDocxKinds(doc) : []
  const kind = forcedKind ?? (detectedKinds.length === 1 ? detectedKinds[0] : undefined)
  if (!kind) {
    const report = emptyReport()
    report.notes.push(
      detectedKinds.length > 1
        ? `여러 종류(${detectedKinds.join(', ')})로 보입니다. 문서 종류를 골라 주세요.`
        : '문서 종류를 알아내지 못했습니다. 문서 종류를 골라 주세요.'
    )
    return { fileName, ok: true, detectedKinds, version: versionFromFileName(fileName), report }
  }

  const version = versionFromFileName(fileName)
  switch (kind) {
    case 'DIA': {
      if (!wb) return fail(fileName, 'FAILED', 'DIA는 엑셀 파일이어야 합니다.')
      const { content, report } = parseDia(wb)
      return { fileName, ok: true, kind, detectedKinds, version, report, dia: content }
    }
    case 'FSR': {
      if (!wb) return fail(fileName, 'FAILED', 'FSR은 엑셀 파일이어야 합니다.')
      const r = parseFsr(wb)
      return { fileName, ok: true, kind, detectedKinds, version: r.version || version, report: r.report, items: r.items }
    }
    case 'TSC': {
      if (!doc) return fail(fileName, 'FAILED', 'TSC는 워드(.docx) 파일이어야 합니다.')
      const r = parseTsc(doc)
      return { fileName, ok: true, kind, detectedKinds, version: r.version || version, report: r.report, items: r.items }
    }
    default:
      return registerOnly(fileName, kind, detectedKinds)
  }
}

function registerOnly(fileName: string, kind: DocKind, detectedKinds: DocKind[]): ReadResult {
  const report: ImportReport = emptyReport()
  const note = LATER_NOTE[kind]
  if (note) report.notes.push(note)
  return { fileName, ok: true, kind, detectedKinds, version: versionFromFileName(fileName), report }
}
