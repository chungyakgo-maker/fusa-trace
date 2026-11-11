/**
 * 문서 1개 읽기: DRM 검사 → 종류 판별 → 종류별 읽기 (SPEC §6, FORMATS §1·§2). 작업 스레드에서 실행.
 */
import type { DocKind, ImportReport, ParsedDocument, ReadOptions, ReadRule } from './model'
import { emptyReport } from './model'
import { DRM_MESSAGE, UNREADABLE_MESSAGE, fileExtension, isVerificationReportName, sniffFile } from './sniff'
import { type Workbook, readWorkbook } from './xlsx'
import { type DocxDocument, isDocx, readDocx } from './docx'
import { isDiaSheet, parseDia } from './dia'
import { SYNONYMS, setExtraSynonyms } from './headers'
import { sheetHasHeader } from './headers'
import { normHeader } from './text'
import { docTokens, versionFromFileName } from './filename'
import { parseWithRule, previewDocx, previewWorkbook, ruleMatches, type PreviewData } from './rules'
import { parseFsr } from './fsr'
import { parseTsc } from './tsc'
import { isFmeaSheet, parseFmea } from './fmea'
import { parseSrs } from './srs'

export type ReadResult = Omit<ParsedDocument, 'path' | 'hash' | 'size' | 'elapsedMs'>

const LATER_NOTE: Partial<Record<DocKind, string>> = {
  VR: 'Verification Report는 내용을 열지 않고 파일명으로만 작성 여부를 판단합니다.',
  FMEDA: 'FMEDA는 양식이 정해지지 않아 파일 등록(작성 여부)만 합니다.',
  OTHER: '기타 문서로 파일만 등록합니다 (산출물 일정의 "등록 문서"). HSR·SW 시험 명세라면 종류를 바꾸고 [칸 지정]을 해 주세요.'
}

function fail(fileName: string, errorKind: NonNullable<ReadResult['errorKind']>, error: string): ReadResult {
  return { fileName, ok: false, errorKind, error, detectedKinds: [], version: '', report: emptyReport() }
}

export function detectWorkbookKinds(wb: Workbook): DocKind[] {
  const kinds: DocKind[] = []
  if (wb.sheets.some((s) => isDiaSheet(s))) kinds.push('DIA')
  if (wb.sheets.some((s) => sheetHasHeader(s, (n) => (SYNONYMS.fsrId as readonly string[]).includes(n), 80))) kinds.push('FSR')
  if (wb.sheets.some((s) => isFmeaSheet(s))) kinds.push('FMEA')
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

type Opened = { wb?: Workbook; doc?: DocxDocument } | { error: ReadResult }

function openDocument(fileName: string, bytes: Uint8Array, drmMarkers: readonly string[] = []): Opened {
  const sniff = sniffFile(bytes, drmMarkers)
  if (sniff === 'DRM') return { error: fail(fileName, 'DRM', DRM_MESSAGE) }
  if (sniff === 'UNKNOWN') return { error: fail(fileName, 'UNREADABLE', UNREADABLE_MESSAGE) }
  if (sniff === 'OLE' && fileExtension(fileName) === 'doc') {
    return { error: fail(fileName, 'UNSUPPORTED', '.doc(옛 워드 형식)는 읽을 수 없습니다. 워드에서 .docx로 저장한 뒤 넣어 주세요.') }
  }
  try {
    if (sniff === 'ZIP' && isDocx(bytes)) return { doc: readDocx(bytes) }
    return { wb: readWorkbook(bytes) }
  } catch {
    return { error: fail(fileName, 'UNREADABLE', UNREADABLE_MESSAGE) }
  }
}

/** 칸 지정 화면용 미리보기. drmMarkers: 설정 → 문서 읽기의 DRM 파일 표식 */
export function previewDocument(fileName: string, bytes: Uint8Array, drmMarkers: readonly string[] = []): PreviewData | { error: string } {
  const o = openDocument(fileName, bytes, drmMarkers)
  if ('error' in o) return { error: o.error.error ?? UNREADABLE_MESSAGE }
  return o.wb ? previewWorkbook(o.wb) : previewDocx(o.doc!)
}

function readWithRule(fileName: string, rule: ReadRule, wb: Workbook | undefined, doc: DocxDocument | undefined, detectedKinds: DocKind[]): ReadResult {
  const r = parseWithRule(rule, wb, doc)
  return { fileName, ok: true, kind: rule.docKind, detectedKinds, version: versionFromFileName(fileName), report: r.report, items: r.items, meta: { rule: rule.id } }
}

/**
 * @param forcedKind 사람이 고른 종류 (판별 실패·애매할 때)
 * @param options 칸 지정 규칙, 사용자 동의어
 */
export function readDocument(fileName: string, bytes: Uint8Array, forcedKind?: DocKind, options: ReadOptions = {}): ReadResult {
  setExtraSynonyms(options.synonyms)
  const rules = options.rules ?? []
  const sniff = sniffFile(bytes, options.drmMarkers)
  if (sniff === 'DRM') return fail(fileName, 'DRM', DRM_MESSAGE)
  if (sniff === 'UNKNOWN') return fail(fileName, 'UNREADABLE', UNREADABLE_MESSAGE)

  // Verification Report: 파일명으로만 판단, 내용은 열지 않음 (FORMATS §12)
  if (isVerificationReportName(fileName) && (forcedKind === undefined || forcedKind === 'VR')) {
    return registerOnly(fileName, 'VR', ['VR'])
  }

  const opened = openDocument(fileName, bytes, options.drmMarkers)
  if ('error' in opened) return opened.error
  const { wb, doc } = opened

  const detectedKinds = wb ? detectWorkbookKinds(wb) : doc ? detectDocxKinds(doc) : []

  // 칸 지정 규칙: 내장 판별이 안 됐거나, 사람이 HSR·SW 시험을 골랐을 때
  const ruleCandidates = forcedKind === 'HSR' || forcedKind === 'SWTEST' ? rules.filter((r) => r.docKind === forcedKind) : forcedKind === undefined && detectedKinds.length === 0 ? rules : []
  const rule = ruleCandidates.find((r) => ruleMatches(r, wb, doc))
  if (rule) return readWithRule(fileName, rule, wb, doc, detectedKinds)

  // 파일명에 HSR·FMEDA가 있으면 그 종류로 (HSR은 칸 지정 필요)
  const tokens = docTokens(fileName)
  const nameKind: DocKind | undefined = detectedKinds.length === 0 ? (tokens.includes('HSR') ? 'HSR' : tokens.includes('FMEDA') ? 'FMEDA' : undefined) : undefined
  const kind = forcedKind ?? (detectedKinds.length === 1 ? detectedKinds[0] : nameKind)
  if (kind === 'HSR' || kind === 'SWTEST') {
    const report = emptyReport()
    report.notes.push('처음 보는 양식입니다. [칸 지정]으로 내 ID·위 단계 ID 칸을 정해 주세요. 정한 규칙은 같은 모양의 문서에 자동으로 다시 씁니다.')
    return { fileName, ok: true, kind, detectedKinds: nameKind ? [nameKind] : detectedKinds, version: versionFromFileName(fileName), report, needsMapping: true }
  }
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
    case 'FMEA': {
      if (!wb) return fail(fileName, 'FAILED', 'FMEA는 엑셀 파일이어야 합니다.')
      const r = parseFmea(wb)
      return { fileName, ok: true, kind, detectedKinds, version, report: r.report, items: r.items, meta: { tsrColumn: r.hasTsrColumn ? 'yes' : 'no' } }
    }
    case 'SRS': {
      if (!doc) return fail(fileName, 'FAILED', 'SRS는 워드(.docx) 파일이어야 합니다.')
      const r = parseSrs(doc)
      return { fileName, ok: true, kind, detectedKinds, version, report: r.report, items: r.items }
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
