/**
 * 엑셀 출력 (SPEC §10): 시트 1 "작성 리스트", 시트 2 "담당자별 요약". 메인 프로세스에서 실행 (ExcelJS)
 */
import ExcelJS from 'exceljs'
import type { IsoDate, Project } from './model'
import { assigneeText, computeSchedule, ddayText, summarize, summarizeByOwner, type ScheduleRow } from './schedule'
import { compactDate } from './dates'
import { computeSystemTrace } from './trace'
import { computeSoftwareTrace } from './software'
import { collectTraceIssues } from './issues'

export const SHEET_LIST = '작성 리스트'
export const SHEET_OWNERS = '담당자별 요약'
export const SHEET_TRACE = '추적성 누락'

export interface ExportOptions {
  /** 시트 3 "추적성 누락" 포함 */
  includeTrace: boolean
}

const COLORS = {
  headerFill: 'FFE8ECF3',
  done: { fill: 'FFE6F4EC', font: 'FF1F7A4D' },
  delayed: { fill: 'FFFDEEE3', font: 'FFB4480C' },
  missing: { fill: 'FFEEF0F3', font: 'FF5B6270' }
}

export function exportFileName(projectName: string, date: IsoDate): string {
  const safe = projectName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || '프로젝트'
  return `${safe}_산출물작성리스트_${compactDate(date)}.xlsx`
}

function toExcelDate(iso: string | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** 글자 폭 (한글 2칸) */
function textWidth(v: unknown): number {
  const s = v instanceof Date ? '2026-01-01' : String(v ?? '')
  return Math.max(
    0,
    ...s.split('\n').map((line) => [...line].reduce((w, ch) => w + (/[ᄀ-ￜ]/.test(ch) ? 2 : 1), 0))
  )
}

function autoWidth(ws: ExcelJS.Worksheet, fromRow: number, min = 6, max = 60): void {
  ws.columns.forEach((col, i) => {
    let w = min
    ws.eachRow((row, r) => {
      if (r < fromRow) return
      w = Math.max(w, textWidth(row.getCell(i + 1).value) + 2)
    })
    col.width = Math.min(max, w)
  })
}

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerFill } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9AA1AD' } } }
  })
}

function paint(cell: ExcelJS.Cell, c: { fill: string; font: string }): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.fill } }
  cell.font = { color: { argb: c.font }, bold: true }
}

export const LIST_HEADERS = [
  'DIA No.', '구분', '산출물', '예상 파일명', '등록 문서', '담당 팀', '담당자',
  '계획 시작', '계획 종료', '실적 시작', '실적 종료', '상태', 'D-day', 'VR 작성', '비고'
] as const

function registeredText(r: ScheduleRow): string {
  if (!r.doc) return '미등록'
  return `${r.doc.fileName} (${r.doc.version || '버전 없음'}, ${r.doc.importedAt.slice(0, 10)} 등록)`
}

export async function buildScheduleWorkbook(p: Project, today: IsoDate, exportDate: IsoDate, options: ExportOptions = { includeTrace: false }): Promise<ExcelJS.Workbook> {
  const rows = computeSchedule(p, today)
  const s = summarize(rows)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FuSa Trace'
  wb.created = new Date()

  // ── 시트 1: 작성 리스트
  const ws = wb.addWorksheet(SHEET_LIST, {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  })
  ws.addRow(['산출물 작성 리스트']).font = { bold: true, size: 14 }
  ws.addRow(['프로젝트', p.name])
  ws.addRow(['출력일', exportDate, '기준일', today])
  ws.addRow([
    '요약',
    `전체 ${s.total} · 완료 ${s.done} · 진행 ${s.inProgress} · 지연 ${s.delayed} · 미착수 ${s.notStarted} · 일정 미기재 ${s.noPlan}`
  ])
  for (const r of [2, 3, 4]) ws.getRow(r).getCell(1).font = { bold: true }
  ws.getRow(3).getCell(3).font = { bold: true }
  ws.addRow([])
  const headerRowNo = 6
  const header = ws.addRow([...LIST_HEADERS])
  styleHeader(header)

  for (const r of rows) {
    const a = assigneeText(r.d)
    const label = `${r.d.workProduct}${r.d.docLabel ? ` [${r.d.docLabel}]` : ''}`
    const notes = [...r.d.memo, ...r.d.dateWarnings]
    const row = ws.addRow([
      r.d.diaNo,
      r.d.category,
      r.d.line > 1 ? `└ ${label}` : label,
      r.d.expectedFileName || '-',
      registeredText(r),
      a.team,
      a.people,
      toExcelDate(r.d.planStart),
      toExcelDate(r.d.planEnd),
      toExcelDate(r.d.realStart),
      toExcelDate(r.d.realEnd),
      r.noPlan ? `${r.status} · 일정 미기재` : r.status,
      ddayText(r),
      r.vr,
      notes.join('\n')
    ])
    for (let c = 8; c <= 11; c++) row.getCell(c).numFmt = 'yyyy-mm-dd'
    row.getCell(4).alignment = { wrapText: true, vertical: 'top' }
    row.getCell(15).alignment = { wrapText: true, vertical: 'top' }
    const status = row.getCell(12)
    if (r.status === '완료') paint(status, COLORS.done)
    else if (r.status === '지연') paint(status, COLORS.delayed)
    if (!r.doc) paint(row.getCell(5), COLORS.missing)
  }
  ws.views = [{ state: 'frozen', ySplit: headerRowNo, xSplit: 0 }]
  ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo + rows.length, column: LIST_HEADERS.length } }
  autoWidth(ws, headerRowNo)
  ws.getColumn(4).width = Math.min(ws.getColumn(4).width ?? 40, 50)
  ws.getColumn(15).width = Math.min(ws.getColumn(15).width ?? 40, 50)
  ws.pageSetup.printTitlesRow = `${headerRowNo}:${headerRowNo}`

  // ── 시트 2: 담당자별 요약
  const os = wb.addWorksheet(SHEET_OWNERS, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
  styleHeader(os.addRow(['담당자', '팀', '전체', '완료', '진행', '지연', '미착수']))
  for (const o of summarizeByOwner(rows)) {
    const row = os.addRow([o.person, o.team, o.total, o.done, o.inProgress, o.delayed, o.notStarted])
    if (o.delayed > 0) paint(row.getCell(6), COLORS.delayed)
  }
  os.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
  os.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, os.rowCount), column: 7 } }
  autoWidth(os, 1, 8, 40)

  // ── 시트 3: 추적성 누락 (선택)
  if (options.includeTrace) {
    const issues = collectTraceIssues(computeSystemTrace(p), computeSoftwareTrace(p))
    const ts = wb.addWorksheet(SHEET_TRACE, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    styleHeader(ts.addRow(['단계', '항목 ID', '제목', '문제 종류', '출처 문서']))
    for (const i of issues) {
      const row = ts.addRow([i.stage, i.id, i.title, i.problem, i.source])
      row.getCell(3).alignment = { wrapText: true, vertical: 'top' }
      if (i.problem.startsWith('누락') || i.problem.startsWith('없는') || i.problem.includes('TSR 없음') || i.problem.includes('TSR 연결 없음')) paint(row.getCell(4), COLORS.delayed)
    }
    if (issues.length === 0) ts.addRow(['', '', '누락·확인 필요 항목이 없습니다', '', ''])
    ts.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
    ts.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ts.rowCount), column: 5 } }
    autoWidth(ts, 1, 8, 60)
  }
  return wb
}

export async function buildScheduleXlsx(p: Project, today: IsoDate, exportDate: IsoDate, options?: ExportOptions): Promise<Uint8Array> {
  const wb = await buildScheduleWorkbook(p, today, exportDate, options)
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
