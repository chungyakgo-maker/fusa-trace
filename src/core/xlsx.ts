/**
 * 엑셀(.xlsx, .xls) 읽기 → 시트별 격자. 작업 스레드에서만 쓴다 (SheetJS).
 * - 병합 셀: 왼쪽 위 값을 범위 전체에 채움 (FORMATS §3.2)
 * - 날짜 셀: 'YYYY-MM-DD' (시간대 영향 없이)
 * - 사용 범위가 100만 행이어도 실제 값이 있는 셀만 보관
 */
import * as XLSX from 'xlsx'
import type { IsoDate } from './model'
import { excelSerialToIso } from './dates'

export interface DateCell {
  date: IsoDate
}
export type Cell = string | number | boolean | DateCell | null

export function isDateCell(v: Cell): v is DateCell {
  return typeof v === 'object' && v !== null && 'date' in v
}

/** 셀 값 → 글자 (날짜는 'YYYY-MM-DD') */
export function cellToText(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (isDateCell(v)) return v.date
  return String(v)
}

export class Grid {
  /** 실제 값이 있는 마지막 행·열 (0부터) */
  maxRow = -1
  maxCol = -1
  private readonly rows = new Map<number, Map<number, Cell>>()

  constructor(readonly name: string) {}

  set(r: number, c: number, v: Cell): void {
    if (v === null || v === '') return
    let row = this.rows.get(r)
    if (!row) {
      row = new Map()
      this.rows.set(r, row)
    }
    row.set(c, v)
    if (r > this.maxRow) this.maxRow = r
    if (c > this.maxCol) this.maxCol = c
  }

  get(r: number, c: number): Cell {
    return this.rows.get(r)?.get(c) ?? null
  }

  text(r: number, c: number): string {
    return cellToText(this.get(r, c))
  }

  hasRow(r: number): boolean {
    return (this.rows.get(r)?.size ?? 0) > 0
  }

  /** 값이 있는 열 번호들 */
  colsOf(r: number): number[] {
    return [...(this.rows.get(r)?.keys() ?? [])].sort((a, b) => a - b)
  }
}

export interface Workbook {
  sheets: Grid[]
}

export function readWorkbook(bytes: Uint8Array): Workbook {
  const wb = XLSX.read(bytes, {
    type: 'array',
    cellNF: true,
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    sheetStubs: false
  })
  const date1904 = Boolean((wb.Workbook as { WBProps?: { date1904?: boolean } } | undefined)?.WBProps?.date1904)
  const sheets: Grid[] = []
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const grid = new Grid(name)
    if (!ws) {
      sheets.push(grid)
      continue
    }
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue
      const cell = ws[key] as XLSX.CellObject
      const { r, c } = XLSX.utils.decode_cell(key)
      grid.set(r, c, convertCell(cell, date1904))
    }
    fillMerges(grid, (ws['!merges'] as XLSX.Range[] | undefined) ?? [])
    sheets.push(grid)
  }
  return { sheets }
}

function convertCell(cell: XLSX.CellObject, date1904: boolean): Cell {
  if (cell.v === undefined || cell.v === null) return null
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  }
  if (cell.t === 'n' && typeof cell.v === 'number') {
    const fmt = typeof cell.z === 'string' ? cell.z : ''
    if (fmt && XLSX.SSF.is_date(fmt)) {
      const iso = excelSerialToIso(cell.v, date1904)
      if (iso) return { date: iso }
    }
    return cell.v
  }
  if (cell.t === 'b') return Boolean(cell.v)
  if (cell.t === 'e') return null
  return String(cell.v)
}

function fillMerges(grid: Grid, merges: XLSX.Range[]): void {
  for (const m of merges) {
    const area = (m.e.r - m.s.r + 1) * (m.e.c - m.s.c + 1)
    if (area <= 1 || area > 20_000) continue
    const v = grid.get(m.s.r, m.s.c)
    if (v === null) continue
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue
        if (grid.get(r, c) === null) grid.set(r, c, v)
      }
    }
  }
}
