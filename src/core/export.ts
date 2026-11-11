/**
 * 엑셀 출력 (SPEC §10, 보조 출력): 시트 1 "작성 리스트", 시트 2 "담당자별 요약", 시트 3 "추적성 누락"(선택, 검사 엔진 결과),
 * "DIA 붙여넣기 안내" + "DIA 붙여넣기"(선택: 직접 고친 일정·담당을 원본 DIA에 붙여 넣기). 메인 프로세스에서 실행 (ExcelJS)
 */
import ExcelJS from 'exceljs'
import type { IsoDate, Project } from './model'
import { assigneeText, computeSchedule, ddayText, summarize, summarizeByOwner, type ScheduleRow } from './schedule'
import { compactDate } from './dates'
import { runChecks } from './check'
import { writeFindingsSheet } from './checkReport'
import { autoWidth, paint, styleHeader } from './xlsxStyle'
import { buildPastePlan, type PastePlan } from './diaPaste'
import { EDIT_FIELD_LABEL } from './edits'
import type { Profile, RawCell } from './model'
import { mineOf, scopeText } from './mine'

export const SHEET_LIST = '작성 리스트'
export const SHEET_OWNERS = '담당자별 요약'
export const SHEET_TRACE = '추적성 누락'
export const SHEET_PASTE_GUIDE = 'DIA 붙여넣기 안내'
export const SHEET_PASTE = 'DIA 붙여넣기'

export interface ExportOptions {
  /** 시트 3 "추적성 누락" 포함 */
  includeTrace: boolean
  /** 직접 고친 일정·담당을 원본 DIA에 붙여 넣을 시트 포함 */
  includePaste?: boolean
  /** 시트 1·2를 내 담당 산출물만으로 */
  mineOnly?: boolean
  /** 내 정보 (내 담당 이름·팀 찾기) */
  profile?: Profile
}

const COLORS = {
  headerFill: 'FFE8ECF3',
  done: { fill: 'FFE6F4EC', font: 'FF1F7A4D' },
  delayed: { fill: 'FFFDEEE3', font: 'FFB4480C' },
  missing: { fill: 'FFEEF0F3', font: 'FF5B6270' },
  edited: { fill: 'FFFFF4D6', font: 'FF8A6100' }
}

export function exportFileName(projectName: string, date: IsoDate, mineOnly = false): string {
  const safe = projectName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || '프로젝트'
  return `${safe}_산출물작성리스트_${compactDate(date)}${mineOnly ? '_내담당' : ''}.xlsx`
}

function toExcelDate(iso: string | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
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
  const scope = p.settings.myScope
  const mineOnly = Boolean(options.mineOnly)
  const rows = computeSchedule(p, today).filter((r) => !mineOnly || mineOf(r.d, scope, options.profile).mine)
  const s = summarize(rows)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FuSa Trace'
  wb.created = new Date()

  // ── 시트 1: 작성 리스트
  const ws = wb.addWorksheet(SHEET_LIST, {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  })
  ws.addRow([mineOnly ? `산출물 작성 리스트 — 내 담당 (${scopeText(scope, options.profile) || '기준 없음'})` : '산출물 작성 리스트']).font = { bold: true, size: 14 }
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
    if (r.edit) {
      for (const f of r.edit.fields) {
        const was = f === 'owner' ? [r.edit.original.owner.team, ...r.edit.original.owner.people].filter(Boolean).join(' ') : r.edit.original[f]
        notes.push(`${EDIT_FIELD_LABEL[f]} 직접 고침 (DIA: ${was || '빈칸'})`)
      }
      for (const f of r.edit.diaChanged) notes.push(`${EDIT_FIELD_LABEL[f]}: 고친 뒤 DIA 값이 바뀜 — 확인 필요`)
    }
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
    // 직접 고친 칸 (색 + 비고 글자)
    const EDIT_COL = { owner: [6, 7], planStart: [8], planEnd: [9], realStart: [10], realEnd: [11] } as const
    for (const f of r.edit?.fields ?? []) for (const c of EDIT_COL[f]) paint(row.getCell(c), COLORS.edited)
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

  // ── 시트 3: 추적성 누락 (선택) — 검사 결과 화면·검사 리포트와 같은 검사 엔진 결과
  if (options.includeTrace) {
    const ts = wb.addWorksheet(SHEET_TRACE, { pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    writeFindingsSheet(ts, runChecks(p).findings)
  }
  if (options.includePaste) addPasteSheets(wb, buildPastePlan(p))
  return wb
}

function writeRaw(cell: ExcelJS.Cell, v: RawCell | undefined): void {
  if (!v) return
  if ('d' in v) {
    cell.value = toExcelDate(v.d)
    cell.numFmt = 'yyyy-mm-dd'
  } else if ('s' in v) {
    cell.value = v.s
    if (v.s.includes('\n')) cell.alignment = { wrapText: true, vertical: 'top' }
  } else if ('n' in v) cell.value = v.n
  else cell.value = v.b
}

/** "DIA 붙여넣기 안내" + "DIA 붙여넣기": 원본 DIA와 같은 행·열 위치에 일정·담당 칸 */
function addPasteSheets(wb: ExcelJS.Workbook, plan: PastePlan | { reason: string }): void {
  const gs = wb.addWorksheet(SHEET_PASTE_GUIDE)
  gs.addRow(['DIA 붙여넣기 안내']).font = { bold: true, size: 14 }
  if ('reason' in plan) {
    gs.addRow(['만들지 못함', plan.reason])
    gs.getColumn(1).width = 14
    gs.getColumn(2).width = 90
    return
  }
  const L = plan.layout
  const rowsChanged = new Set(plan.changes.map((c) => c.row)).size
  const manual = plan.changes.filter((c) => c.blocked || c.manual)
  const lines: [string, string][] = [
    ['원본', `${plan.doc.fileName} (${plan.doc.version || '버전 없음'}) · 시트 '${L.sheet}'`],
    ['고친 칸', plan.changes.length === 0 ? '없음 (직접 고친 일정·담당이 없습니다)' : `${plan.changes.length}개 (${rowsChanged}행)`],
    ['', ''],
    ['붙이는 방법', ''],
    ['1', '원본 DIA 파일을 엽니다. 혹시 모르니 먼저 다른 이름으로 사본을 저장해 두세요.'],
    ['2', '원본에 필터가 걸려 있으면 먼저 해제합니다 (숨은 행이 있으면 줄이 어긋날 수 있습니다).'],
    ['3', `이 파일의 '${SHEET_PASTE}' 시트에서 아래 범위를 선택하고 복사(Ctrl+C)합니다.`],
    ['4', `원본 DIA의 '${L.sheet}' 시트에서 같은 주소의 첫 칸을 누르고, 마우스 오른쪽 → 붙여넣기 옵션 → [값](123 그림)을 누릅니다. 그냥 Ctrl+V를 하면 원본의 글꼴·테두리·색이 바뀝니다.`],
    ['5', '저장한 뒤 이 앱에 그 DIA를 다시 넣으면, 반영된 칸은 "수정" 표시가 사라집니다.'],
    ['', ''],
    ['범위 (한 번에)', plan.fullRanges.join(', ')],
    ['범위 (바뀐 행만)', plan.changedRanges.join(', ') || '없음'],
    ['참고', '고치지 않은 칸은 원본 값 그대로라서 한 번에 붙여 넣어도 바뀌지 않습니다. 다만 칸 안 일부 글자에만 준 서식(굵게·색)은 값 붙여넣기로 사라질 수 있으니, 그런 칸이 있으면 "바뀐 행만" 범위를 쓰세요.']
  ]
  if (manual.length > 0) lines.push(['직접 고칠 칸', `${manual.length}개 — 병합된 칸·수식이 있는 행이나 원래 모양으로 만들 수 없는 칸은 범위에서 뺐습니다. 아래 표에서 "직접 고치기"인 칸은 원본에서 손으로 고쳐 주세요.`])
  for (const [a, b] of lines) {
    const row = gs.addRow([a, b])
    row.getCell(1).font = { bold: true }
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  }
  gs.addRow([])
  const head = gs.addRow(['칸', 'No.', '산출물', '바뀐 항목', '원래 값', '고친 값', '붙여넣기', '비고'])
  styleHeader(head)
  for (const c of plan.changes) {
    const row = gs.addRow([c.address, c.diaNo ?? '', c.workProduct, c.fields.join(', '), c.before || '(빈칸)', c.after || '(빈칸)', c.blocked || c.manual ? '직접 고치기' : '범위에 포함', c.note ?? (c.blocked ? '병합·수식이 있는 행' : '')])
    for (const i of [3, 5, 6, 8]) row.getCell(i).alignment = { wrapText: true, vertical: 'top' }
    if (c.blocked || c.manual) paint(row.getCell(7), COLORS.delayed)
  }
  gs.getColumn(1).width = 16
  gs.getColumn(2).width = 8
  gs.getColumn(3).width = 36
  gs.getColumn(4).width = 14
  gs.getColumn(5).width = 30
  gs.getColumn(6).width = 30
  gs.getColumn(7).width = 12
  gs.getColumn(8).width = 40
  gs.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

  // 붙여넣기 시트: 원본과 같은 행 번호·열 위치 (엑셀 열은 1부터)
  const ps = wb.addWorksheet(SHEET_PASTE)
  const gray = { color: { argb: 'FF5B6270' } }
  for (const [k, text] of Object.entries(L.headers)) {
    const [r, c] = k.split(',').map(Number)
    const cell = ps.getCell(r, c + 1)
    cell.value = text
    cell.font = { ...gray, bold: true }
    cell.alignment = { wrapText: true, vertical: 'middle' }
  }
  const inPaste = (c: number): boolean => c >= L.pasteFrom && c <= L.pasteTo
  for (const [r, ref] of plan.refRows) {
    if (!inPaste(L.cols.no)) Object.assign(ps.getCell(r, L.cols.no + 1), { value: ref.diaNo, font: gray })
    if (!inPaste(L.cols.wp)) Object.assign(ps.getCell(r, L.cols.wp + 1), { value: ref.workProduct, font: gray })
  }
  for (let r = L.firstRow; r <= L.lastRow; r++) {
    for (let c = L.pasteFrom; c <= L.pasteTo; c++) writeRaw(ps.getCell(r, c + 1), plan.cells.get(`${r},${c}`))
  }
  // 범위 밖 오른쪽 칸: 이 행에서 바뀐 것
  const markCol = L.pasteTo + 2
  const byRow = new Map<number, typeof plan.changes>()
  for (const c of plan.changes) byRow.set(c.row, [...(byRow.get(c.row) ?? []), c])
  for (const [r, list] of byRow) {
    const cell = ps.getCell(r, markCol)
    const direct = list.some((c) => c.blocked || c.manual)
    cell.value = `◀ ${direct ? '직접 고치기' : '바뀜'}: ${[...new Set(list.flatMap((c) => c.fields))].join(', ')}`
    paint(cell, direct ? COLORS.delayed : COLORS.edited)
  }
  const top = Math.min(...Object.keys(L.headers).map((k) => Number(k.split(',')[0])), L.firstRow)
  if (top > 1) {
    const note = ps.getCell(1, 1)
    note.value = `※ 붙여넣을 범위와 방법은 '${SHEET_PASTE_GUIDE}' 시트에 있습니다. 범위: ${plan.fullRanges.join(', ')}`
    note.font = { bold: true, color: { argb: 'FF8A6100' } }
  }
  for (let c = L.pasteFrom; c <= L.pasteTo; c++) ps.getColumn(c + 1).width = c === L.cols.team ? 24 : 16
  if (!inPaste(L.cols.wp)) ps.getColumn(L.cols.wp + 1).width = 36
  ps.getColumn(markCol).width = 30
}

export async function buildScheduleXlsx(p: Project, today: IsoDate, exportDate: IsoDate, options?: ExportOptions): Promise<Uint8Array> {
  const wb = await buildScheduleWorkbook(p, today, exportDate, options)
  const buf = await wb.xlsx.writeBuffer()
  return new Uint8Array(buf as ArrayBuffer)
}
