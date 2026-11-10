/**
 * DIA(개발 인터페이스 협약서) 읽기 — 산출물 일정의 원본 (FORMATS §6)
 * 읽음: No., Part-clause No., Work products, Actual work product name, PLAN Start/End, Real Start/End, In charge of Team
 * 안 읽음: R/S/A, Delivery type, 협의 칸, Status, 코멘트, 다른 시트
 */
import type { Category, DateSource, DiaContent, DiaLayout, Deliverable, ImportIssue, ImportReport, IsoDate, RawCell } from './model'
import { emptyReport } from './model'
import { type Cell, type Grid, type Workbook, isDateCell } from './xlsx'
import { colLetter } from './cells'
import { type DateParse, excelSerialToIso, parseDateText } from './dates'
import { findCells, sheetHasHeader } from './headers'
import { isNA, normHeader, splitLines, toHalfWidth } from './text'
import { docTokens, labelFromTokens, labelTokens, normalizeFileName } from './filename'
import { isVerificationReportName } from './sniff'

/** 빈 행이 이만큼 이어지면 표가 끝난 것으로 봄 (사용 범위가 100만 행인 시트 대비) */
const EMPTY_RUN_LIMIT = 20
const FILE_LINE_RE = /\.(xlsx|xlsm|xls|docx|doc|pdf|pptx|ppt)\b/i

type DateField = 'planStart' | 'planEnd' | 'realStart' | 'realEnd'
const DATE_FIELD_LABEL: Record<DateField, string> = {
  planStart: '계획 시작',
  planEnd: '계획 종료',
  realStart: '실적 시작',
  realEnd: '실적 종료'
}

export function isDiaSheet(grid: Grid): boolean {
  if (normHeader(grid.name).includes('detailed agreement')) return true
  const hasWp = sheetHasHeader(grid, (n) => n.startsWith('work products'), 40)
  const hasTeam = sheetHasHeader(grid, (n) => n.startsWith('in charge of team'), 40)
  return hasWp && hasTeam
}

export function categoryOf(partClause: string): Category {
  const m = /^\s*(\d+)/.exec(toHalfWidth(partClause))
  const part = m ? Number(m[1]) : NaN
  if (part === 2 || part === 8) return '관리'
  if (part === 3 || part === 4) return '시스템'
  if (part === 6) return 'SW'
  if (part === 5) return 'HW'
  return '기타'
}

/** 담당 칸: 첫 줄 = 팀, 나머지 = 사람 (줄바꿈이나 `,`로 이어짐) */
export function parseAssignee(raw: string): { excluded: boolean; team: string; people: string[] } {
  const t = raw.trim()
  if (isNA(t)) return { excluded: true, team: '', people: [] }
  const lines = splitLines(t)
  if (lines.length === 0) return { excluded: false, team: '', people: [] }
  const [team, ...rest] = lines
  const people = rest
    .flatMap((l) => l.split(/[,，]/))
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  return { excluded: false, team, people }
}

interface DateEntry {
  label: string
  tokens: string[]
  parse: DateParse
  /** 칸 글의 줄 번호 (0부터) */
  line: number
  /** 날짜 앞 글자 ("FMEA: ") */
  prefix: string
  /** 날짜 구분 글자 (- . /) */
  sep: string
}

/** 날짜 글자의 구분 글자 ("2026.06.05" → ".", 모르면 "-") */
export function dateSepOf(text: string): string {
  const m = /(?:\d{4}|yyyy)\s*([-./])/i.exec(text)
  return m ? m[1] : '-'
}

interface DateCellParse {
  /** 행 전체에 적용할 값 (엑셀 날짜 하나, 또는 라벨 없는 글자 하나) */
  whole?: DateParse
  entries: DateEntry[]
  memo: string[]
}

/** 날짜 칸: 엑셀 날짜 / 글자 날짜 / `라벨: 날짜` 여러 줄 (FORMATS §6.4) */
export function parseDateCell(cell: Cell): DateCellParse {
  if (cell === null || cell === undefined) return { entries: [], memo: [] }
  if (isDateCell(cell)) return { whole: { kind: 'date', date: cell.date }, entries: [], memo: [] }
  if (typeof cell === 'number') {
    if (cell >= 19_000_000 && cell <= 21_001_231) return { whole: parseDateText(String(cell).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')), entries: [], memo: [] }
    const iso = cell > 30_000 && cell < 80_000 ? excelSerialToIso(cell) : undefined
    return { whole: iso ? { kind: 'date', date: iso } : { kind: 'invalid', raw: String(cell) }, entries: [], memo: [] }
  }
  const rawLines = String(cell).split(/\r\n|\r|\n/)
  const entries: DateEntry[] = []
  const memo: string[] = []
  rawLines.forEach((raw, index) => {
    const line = raw.trim()
    if (!line) return
    const m = /^(.+?)\s*[:：]\s*(.*)$/.exec(line)
    if (m) {
      const label = m[1].trim()
      const prefix = /^(.*?[:：]\s*)/.exec(raw)?.[1] ?? `${label}: `
      entries.push({ label, tokens: labelTokens(label), parse: parseDateText(m[2]), line: index, prefix, sep: dateSepOf(m[2]) })
      return
    }
    const p = parseDateText(line)
    if (p.kind === 'none') return
    if (p.kind === 'invalid' && !/\d/.test(line)) {
      memo.push(line) // 날짜 없는 줄 (예: "FTA / DFA 제외") → 메모
      return
    }
    entries.push({ label: '', tokens: [], parse: p, line: index, prefix: /^(\s*)/.exec(raw)?.[1] ?? '', sep: dateSepOf(line) })
  })
  if (entries.length === 1 && entries[0].label === '') return { whole: entries[0].parse, entries: [], memo }
  return { entries, memo }
}

interface Line {
  file: string
  fileTokens: string[]
  dates: Partial<Record<DateField, IsoDate>>
  /** 날짜 칸별로 짝지어진 라벨 */
  labels: string[]
  warnings: string[]
  /** 날짜 칸별로 값이 원본 칸의 어디에서 왔는지 */
  src: Partial<Record<DateField, DateSource>>
}

/** 라벨 토큰이 모두 파일 토큰에 들어 있는 파일 중, 남는 토큰이 가장 적은 것 (같으면 애매) */
function bestFileForLabel(lines: Line[], tokens: string[]): number | undefined {
  if (tokens.length === 0) return undefined
  let best: number | undefined
  let bestExtra = Infinity
  let tie = false
  lines.forEach((line, i) => {
    if (!line.file) return
    if (!tokens.every((t) => line.fileTokens.includes(t))) return
    const extra = line.fileTokens.length - tokens.length
    if (extra < bestExtra) {
      best = i
      bestExtra = extra
      tie = false
    } else if (extra === bestExtra) {
      tie = true
    }
  })
  return tie ? undefined : best
}

function assignDates(lines: Line[], field: DateField, parsed: DateCellParse): void {
  const fieldName = DATE_FIELD_LABEL[field]
  const setValue = (line: Line, p: DateParse, label: string, src: DateSource): void => {
    if (p.kind === 'date') line.dates[field] = p.date
    else if (p.kind === 'invalid') line.warnings.push(`${fieldName} 날짜 형식 오류: '${p.raw}'`)
    if (label && !line.labels.includes(label)) line.labels.push(label)
    line.src[field] = src
  }
  const entrySrc = (e: DateEntry): DateSource => ({ kind: 'entry', line: e.line, prefix: e.prefix, sep: e.sep })

  if (parsed.whole) {
    for (const line of lines) setValue(line, parsed.whole, '', { kind: 'whole' })
    return
  }
  const entries = parsed.entries
  if (entries.length === 0) return

  if (lines.length === 1 && !lines[0].file) {
    // 파일명 없는 산출물 1줄
    setValue(lines[0], entries[0].parse, entries[0].label, entrySrc(entries[0]))
    if (entries.length > 1) lines[0].warnings.push(`${fieldName}: 파일명이 없는데 날짜가 ${entries.length}개라 첫 줄만 사용`)
    return
  }

  const assigned = new Set<number>()
  const remaining: DateEntry[] = []
  // 1) 라벨 토큰으로 짝짓기
  for (const e of entries) {
    const i = bestFileForLabel(lines, e.tokens)
    if (i !== undefined && !assigned.has(i)) {
      setValue(lines[i], e.parse, e.label, entrySrc(e))
      assigned.add(i)
    } else {
      remaining.push(e)
    }
  }
  if (remaining.length === 0) return
  const freeLines = lines.map((_, i) => i).filter((i) => !assigned.has(i))
  // 2) 줄 수가 같으면 순서대로
  if (freeLines.length === remaining.length) {
    remaining.forEach((e, k) => setValue(lines[freeLines[k]], e.parse, e.label, entrySrc(e)))
    return
  }
  // 3) 그래도 안 되면 행 전체에 적용하고 경고
  const first = remaining[0]
  const labels = remaining.map((e) => e.label || '(라벨 없음)').join(', ')
  for (const i of freeLines.length > 0 ? freeLines : lines.map((_, k) => k)) {
    if (lines[i].dates[field] === undefined) setValue(lines[i], first.parse, '', { kind: 'guess' })
    else lines[i].src[field] = { kind: 'guess' }
    lines[i].warnings.push(`${fieldName}: 날짜 짝을 찾지 못해 행 전체에 적용 (${labels})`)
  }
}

interface HeaderMap {
  /** 머리글을 찾은 맨 위 행 (0부터) */
  top: number
  row: number
  no: number
  part?: number
  wp: number
  name?: number
  team?: number
  dates: Partial<Record<DateField, number>>
}

function findHeaders(grid: Grid, issues: ImportIssue[]): HeaderMap | undefined {
  const wpCells = findCells(grid, 0, 40, (n) => n.startsWith('work products') || n === 'work product')
  if (wpCells.length === 0) return undefined
  const wpRow = wpCells[0].r
  const from = Math.max(0, wpRow - 4)
  const to = wpRow + 5
  const first = (test: (n: string) => boolean): { r: number; c: number } | undefined => findCells(grid, from, to, test)[0]

  const no = first((n) => n === 'no.' || n === 'no')
  if (!no) return undefined
  const part = first((n) => n.startsWith('part-clause') || n.startsWith('part clause'))
  const name = first((n) => n.startsWith('actual work product name'))
  const team = first((n) => n.startsWith('in charge of team'))
  const starts = findCells(grid, from, to, (n) => n === 'start')
  const ends = findCells(grid, from, to, (n) => n === 'end')

  /** 바로 위 그룹 줄에서 왼쪽으로 가장 가까운 그룹 이름 (PLAN / Real) */
  const groupOf = (pos: { r: number; c: number }): 'plan' | 'real' | undefined => {
    for (let r = pos.r - 1; r >= Math.max(0, pos.r - 3); r--) {
      for (let c = pos.c; c >= 0; c--) {
        const n = normHeader(grid.text(r, c))
        if (n === 'plan' || n.startsWith('plan ')) return 'plan'
        if (n === 'real' || n.startsWith('real ') || n === 'actual') return 'real'
      }
    }
    return undefined
  }

  const dates: Partial<Record<DateField, number>> = {}
  const place = (cells: { r: number; c: number }[], kind: 'Start' | 'End'): void => {
    const sorted = [...cells].sort((a, b) => a.c - b.c)
    sorted.forEach((cell, i) => {
      const g = groupOf(cell) ?? (i === 0 ? 'plan' : 'real')
      const field = `${g}${kind}` as DateField
      if (dates[field] === undefined) dates[field] = cell.c
    })
  }
  place(starts, 'Start')
  place(ends, 'End')

  for (const f of Object.keys(DATE_FIELD_LABEL) as DateField[]) {
    if (dates[f] === undefined) issues.push({ where: grid.name, message: `${DATE_FIELD_LABEL[f]} 칸을 찾지 못했습니다` })
  }
  if (!name) issues.push({ where: grid.name, message: 'Actual work product name 칸을 찾지 못했습니다' })
  if (!team) issues.push({ where: grid.name, message: 'In charge of Team 칸을 찾지 못했습니다' })

  const headerCells = [no, part, name, team, ...starts, ...ends, wpCells[0]].filter(Boolean) as { r: number }[]
  const row = Math.max(...headerCells.map((h) => h.r))
  return { top: from, row, no: no.c, part: part?.c, wp: wpCells[0].c, name: name?.c, team: team?.c, dates }
}

function isSymbolRow(grid: Grid, r: number): boolean {
  const cols = grid.colsOf(r)
  if (cols.length === 0) return false
  return cols.every((c) => /^(r|s|a|r\/s\/a|[rsa](\s*,\s*[rsa])*|-)$/i.test(grid.text(r, c).trim()))
}

export interface DiaParseResult {
  content: DiaContent
  report: ImportReport
}

export function parseDia(wb: Workbook): DiaParseResult {
  const report = emptyReport()
  const sheet =
    wb.sheets.find((s) => normHeader(s.name).includes('detailed agreement')) ??
    wb.sheets.find((s) => sheetHasHeader(s, (n) => n.startsWith('work products'), 40))
  if (!sheet) {
    report.warnings.push({ where: '파일', message: 'DIA 시트(Detailed Agreement)를 찾지 못했습니다' })
    report.counts['산출물'] = 0
    return { content: { deliverables: [] }, report }
  }
  const headerIssues: ImportIssue[] = []
  const h = findHeaders(sheet, headerIssues)
  report.warnings.push(...headerIssues)
  if (!h) {
    report.warnings.push({ where: sheet.name, message: '헤더(No., Work products)를 찾지 못했습니다' })
    report.counts['산출물'] = 0
    return { content: { deliverables: [] }, report }
  }

  const deliverables: Deliverable[] = []
  const usedKeys = new Set<string>()
  let lastPart = ''
  let emptyRun = 0
  let rowCount = 0
  let excludedCount = 0
  let firstNoRow = -1
  let lastNoRow = -1

  for (let r = h.row + 1; r <= sheet.maxRow; r++) {
    if (!sheet.hasRow(r)) {
      emptyRun++
      if (emptyRun >= EMPTY_RUN_LIMIT) break
      continue
    }
    emptyRun = 0
    const where = `${sheet.name} ${r + 1}행`
    const partText = h.part !== undefined ? sheet.text(r, h.part).trim() : ''
    if (partText) lastPart = partText

    const noCell = sheet.get(r, h.no)
    const noText = noCell === null ? '' : String(typeof noCell === 'object' ? '' : noCell).trim()
    const isNumberNo = typeof noCell === 'number' || /^\d+$/.test(noText)
    if (!isNumberNo) {
      if (isSymbolRow(sheet, r)) continue // R/S/A 기호 행 = 헤더의 일부
      const relevant = [h.wp, h.name, h.team, ...Object.values(h.dates)].filter((c): c is number => c !== undefined)
      if (relevant.some((c) => sheet.text(r, c).trim() !== '')) {
        report.skipped.push({ where, message: 'No. 칸에 번호가 없어 산출물로 보지 않았습니다' })
      }
      continue
    }
    rowCount++
    if (firstNoRow < 0) firstNoRow = r
    lastNoRow = r
    const diaNo = Number(noText)
    const assignee = parseAssignee(h.team !== undefined ? sheet.text(r, h.team) : '')
    if (assignee.excluded) {
      excludedCount++
      report.skipped.push({ where, message: `No. ${diaNo}: 담당이 N/A라 일정 대상에서 제외했습니다` })
      continue
    }

    const workProduct = sheet.text(r, h.wp).replace(/\s+/g, ' ').trim()
    const nameLines = h.name !== undefined ? splitLines(sheet.text(r, h.name)) : []
    const files = nameLines.filter((l) => FILE_LINE_RE.test(l))
    const memo = nameLines.filter((l) => !FILE_LINE_RE.test(l) && !/^(-+|n\/a)$/i.test(l))

    const lines: Line[] = (files.length > 0 ? files : ['']).map((file) => ({
      file,
      fileTokens: file ? docTokens(file) : [],
      dates: {},
      labels: [],
      warnings: [],
      src: {}
    }))

    for (const field of Object.keys(DATE_FIELD_LABEL) as DateField[]) {
      const col = h.dates[field]
      if (col === undefined) continue
      const parsed = parseDateCell(sheet.get(r, col))
      for (const m of parsed.memo) if (!memo.includes(m)) memo.push(m)
      assignDates(lines, field, parsed)
    }

    const wpIsVR = /verification/i.test(workProduct)
    lines.forEach((line, i) => {
      if (line.dates.planStart && line.dates.planEnd && line.dates.planEnd < line.dates.planStart) {
        line.warnings.push(`계획 종료(${line.dates.planEnd})가 계획 시작(${line.dates.planStart})보다 빠릅니다`)
      }
      if (line.dates.realStart && line.dates.realEnd && line.dates.realEnd < line.dates.realStart) {
        line.warnings.push(`실적 종료(${line.dates.realEnd})가 실적 시작(${line.dates.realStart})보다 빠릅니다`)
      }
      const normExpected = line.file ? normalizeFileName(line.file) : ''
      let key = `${diaNo}#${normExpected || `line${i + 1}`}`
      while (usedKeys.has(key)) key += '+'
      usedKeys.add(key)
      const docLabel = line.labels[0] ? labelFromTokens(labelTokens(line.labels[0])) : labelFromTokens(line.fileTokens)
      const isVR = wpIsVR || (line.file ? isVerificationReportName(line.file) : false)
      const d: Deliverable = {
        key,
        diaNo,
        line: i + 1,
        lineCount: lines.length,
        sourceRow: r + 1,
        partClause: lastPart,
        category: categoryOf(lastPart),
        workProduct,
        docLabel,
        expectedFileName: line.file,
        normExpected,
        ...line.dates,
        team: assignee.team,
        people: assignee.people,
        memo: [...memo],
        isVR,
        dateWarnings: [...new Set(line.warnings)],
        dateSrc: line.src
      }
      deliverables.push(d)
      for (const w of d.dateWarnings) report.warnings.push({ where: `${where} (No. ${diaNo}${lines.length > 1 ? `-${i + 1}` : ''})`, message: w })
    })
  }

  const layout = firstNoRow >= 0 ? captureLayout(sheet, h, firstNoRow, lastNoRow) : undefined
  report.counts['산출물'] = deliverables.length
  report.counts['DIA 행'] = rowCount
  if (excludedCount > 0) report.notes.push(`담당이 N/A인 ${excludedCount}행은 일정 대상에서 제외했습니다`)
  const unassigned = deliverables.filter((d) => !d.team && d.people.length === 0).length
  if (unassigned > 0) report.notes.push(`담당이 비어 있는 ${unassigned}줄은 "담당 미지정"으로 넣었습니다`)
  return { content: { deliverables, ...(layout ? { layout } : {}) }, report }
}

function toRaw(v: Cell): RawCell | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (isDateCell(v)) return { d: v.date }
  if (typeof v === 'number') return { n: v }
  if (typeof v === 'boolean') return { b: v }
  return { s: v }
}

/** 붙여넣기용 시트를 위해 원본의 칸 위치와 원래 값을 기억 (일정 4칸 + 담당 칸) */
function captureLayout(sheet: Grid, h: HeaderMap, firstNoRow: number, lastNoRow: number): DiaLayout | undefined {
  const pasteCols = [h.dates.planStart, h.dates.planEnd, h.dates.realStart, h.dates.realEnd, h.team].filter((c): c is number => c !== undefined)
  if (pasteCols.length === 0) return undefined
  const pasteFrom = Math.min(...pasteCols)
  const pasteTo = Math.max(...pasteCols)
  if (pasteTo - pasteFrom > 30) return undefined // 칸이 너무 떨어져 있으면 한 범위로 붙여 넣을 수 없음
  const cells: Record<string, RawCell> = {}
  const blockedRows: number[] = []
  for (let r = firstNoRow; r <= lastNoRow; r++) {
    for (let c = pasteFrom; c <= pasteTo; c++) {
      const raw = toRaw(sheet.get(r, c))
      if (raw) cells[`${r + 1},${c}`] = raw
    }
    if (sheet.hasMergeOrFormula(r, pasteFrom, pasteTo)) blockedRows.push(r + 1)
  }
  const headers: Record<string, string> = {}
  const headerCols = new Set([h.no, h.wp, ...(h.name !== undefined ? [h.name] : [])])
  for (let c = pasteFrom; c <= pasteTo; c++) headerCols.add(c)
  for (let r = h.top; r <= h.row; r++) {
    for (const c of headerCols) {
      const t = sheet.text(r, c).trim()
      if (t) headers[`${r + 1},${c}`] = t
    }
  }
  return {
    sheet: sheet.name,
    headerRow: h.row + 1,
    cols: { no: h.no, wp: h.wp, name: h.name, team: h.team, ...h.dates },
    firstRow: firstNoRow + 1,
    lastRow: lastNoRow + 1,
    pasteFrom,
    pasteTo,
    cells,
    blockedRows,
    headers
  }
}

/** 붙여넣기 안내에 쓰는 칸 주소 (예: K12) */
export function cellAddress(row: number, col: number): string {
  return `${colLetter(col)}${row}`
}
