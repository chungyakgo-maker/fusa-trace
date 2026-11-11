/** 엑셀 출력 공용 서식 (ExcelJS) */
import type ExcelJS from 'exceljs'

const HEADER_FILL = 'FFE8ECF3'

/** 글자 폭 (한글 2칸) */
export function textWidth(v: unknown): number {
  const s = v instanceof Date ? '2026-01-01' : String(v ?? '')
  return Math.max(
    0,
    ...s.split('\n').map((line) => [...line].reduce((w, ch) => w + (/[ᄀ-ￜ]/.test(ch) ? 2 : 1), 0))
  )
}

export function autoWidth(ws: ExcelJS.Worksheet, fromRow: number, min = 6, max = 60): void {
  ws.columns.forEach((col, i) => {
    let w = min
    ws.eachRow((row, r) => {
      if (r < fromRow) return
      w = Math.max(w, textWidth(row.getCell(i + 1).value) + 2)
    })
    col.width = Math.min(max, w)
  })
}

export function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF9AA1AD' } } }
  })
}

export function paint(cell: ExcelJS.Cell, c: { fill: string; font: string }): void {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.fill } }
  cell.font = { color: { argb: c.font }, bold: true }
}
