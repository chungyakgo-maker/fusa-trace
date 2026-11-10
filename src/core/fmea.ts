/**
 * FMEA(AIAG-VDA 양식, 엑셀) 읽기 (FORMATS §10)
 * - 헤더에 Failure Cause / 고장 원인 (FC)가 있는 시트 (작성 예제·작성법·평가 기준 시트는 무시)
 * - 헤더 2줄: 영문 줄 + 한글 줄. TSR ID·ASIL은 한글 줄에만 있음 → 두 줄을 함께 봄
 * - `↑` = 바로 위 값, 병합 셀은 채움. 고장원인이 비었거나 N/A면 건너뜀 (대상 아님)
 * - TSR ID 칸이 없는 옛 양식 → "TSR 연결 칸 없음 — 작성 여부만 관리"
 */
import type { ImportReport, TraceItem } from './model'
import { emptyReport } from './model'
import type { Grid, Workbook } from './xlsx'
import { SYNONYMS } from './headers'
import { isNA, normHeader, splitLines } from './text'
import { asilLevel, extractTsrRefs, markDuplicates, newItem } from './ids'

export interface FmeaParseResult {
  items: TraceItem[]
  report: ImportReport
  /** TSR ID 칸이 있는지 */
  hasTsrColumn: boolean
}

const EMPTY_RUN_LIMIT = 20
const IGNORE_SHEET = /예제|작성법|작성\s*방법|example|guide|sample|rating|criteria|classification|matrix|history|architecture|system element/i

/** 헤더 글자인지 (데이터 칸의 "…고장 원인…" 문장을 헤더로 착각하지 않도록 모양으로 판단) */
const isFcHeader = (n: string): boolean => /^(\d\.\s*)?failure cause/.test(n) || /^고장\s*원인(\s*\(fc\))?$/.test(n)
const isFmHeader = (n: string): boolean => /^(\d\.\s*)?failure mode/.test(n) || /^고장\s*모드(\s*\(fm\))?$/.test(n)
const isElemHeader = (n: string): boolean => n.startsWith('3. next lower level') || /^하위\s*요소$/.test(n)

export function isFmeaSheet(grid: Grid): boolean {
  for (let r = 0; r <= Math.min(grid.maxRow, 30); r++) for (const c of grid.colsOf(r)) if (isFcHeader(normHeader(grid.text(r, c)))) return true
  return false
}

interface Cols {
  fc: number
  fm?: number
  elem?: number
  tsr?: number
  asil?: number
  ap?: number
  dataStart: number
}

function findCols(grid: Grid): Cols | undefined {
  const headerRows: number[] = []
  for (let r = 0; r <= Math.min(grid.maxRow, 30); r++) {
    if (grid.colsOf(r).some((c) => isFcHeader(normHeader(grid.text(r, c))))) headerRows.push(r)
  }
  if (headerRows.length === 0) return undefined
  const lastHeader = Math.max(...headerRows)
  // 고장 원인 줄 바로 아래 줄에 TSR ID 같은 헤더가 있으면 그 줄까지 헤더
  const isTsrHeader = (n: string): boolean => (SYNONYMS.fmeaTsr as readonly string[]).includes(n)
  const nextIsHeader = grid.colsOf(lastHeader + 1).some((c) => isTsrHeader(normHeader(grid.text(lastHeader + 1, c))))
  // 영문 줄과 한글 줄을 함께 봄 (TSR ID·ASIL은 한글 줄에만 있음)
  const rows = nextIsHeader ? [...headerRows, lastHeader + 1] : headerRows
  const texts = (c: number): string[] => rows.map((r) => normHeader(grid.text(r, c))).filter(Boolean)
  const cols = new Set<number>()
  for (const r of rows) for (const c of grid.colsOf(r)) cols.add(c)
  const find = (test: (n: string) => boolean): number | undefined => [...cols].sort((a, b) => a - b).find((c) => texts(c).some(test))
  const fc = find(isFcHeader)
  if (fc === undefined) return undefined
  return {
    fc,
    fm: find(isFmHeader),
    elem: find(isElemHeader),
    tsr: find(isTsrHeader),
    asil: find((n) => n === 'asil'),
    ap: find((n) => /^(system fmea |dfmea |fmea )?ap$/.test(n)),
    dataStart: lastHeader + (nextIsHeader ? 2 : 1)
  }
}

export function parseFmea(wb: Workbook): FmeaParseResult {
  const report = emptyReport()
  const items: TraceItem[] = []
  const sheets = wb.sheets.filter((s) => isFmeaSheet(s))
  const used = sheets.filter((s) => !IGNORE_SHEET.test(s.name))
  for (const s of sheets.filter((x) => !used.includes(x))) report.notes.push(`'${s.name}' 시트는 작성 예제·작성법으로 보고 읽지 않았습니다`)
  let hasTsrColumn = false
  let skippedNa = 0

  for (const grid of used) {
    const cols = findCols(grid)
    if (!cols) {
      report.warnings.push({ where: grid.name, message: '고장 원인(Failure Cause) 칸을 찾지 못했습니다' })
      continue
    }
    if (cols.tsr !== undefined) hasTsrColumn = true
    const prev = new Map<number, string>()
    /** `↑`는 위 값으로 채움 */
    const val = (r: number, c: number | undefined): string => {
      if (c === undefined) return ''
      let v = grid.text(r, c).trim()
      if (v === '↑' || v === '〃') v = prev.get(c) ?? ''
      prev.set(c, v)
      return v
    }
    let empty = 0
    for (let r = cols.dataStart; r <= grid.maxRow; r++) {
      if (!grid.hasRow(r)) {
        if (++empty >= EMPTY_RUN_LIMIT) break
        continue
      }
      empty = 0
      const elem = val(r, cols.elem)
      const fm = val(r, cols.fm)
      const fc = val(r, cols.fc)
      const tsrRaw = cols.tsr !== undefined ? grid.text(r, cols.tsr) : ''
      const asil = val(r, cols.asil)
      const ap = val(r, cols.ap)
      const where = `${grid.name} ${r + 1}행`
      if (!fc || isNA(fc)) {
        skippedNa++
        report.skipped.push({ where, message: `고장원인이 ${fc ? 'N/A라' : '비어 있어'} 건너뛰었습니다 (대상 아님)` })
        continue
      }
      items.push(
        newItem({
          kind: 'FMEA_CAUSE',
          rawId: `${grid.name}#${r + 1}`,
          title: fc,
          asil,
          asilLevel: asilLevel(asil),
          element: splitLines(elem)[0] ?? '',
          refRaw: tsrRaw.trim(),
          refs: extractTsrRefs(tsrRaw),
          attrs: { '고장 모드': fm, AP: ap },
          location: where
        })
      )
    }
  }
  markDuplicates(items)
  report.counts['고장원인'] = items.length
  if (used.length === 0) report.warnings.push({ where: '파일', message: 'FMEA 시트(고장 원인 칸)를 찾지 못했습니다' })
  if (!hasTsrColumn && used.length > 0) report.notes.push('TSR 연결 칸 없음 — 작성 여부만 관리합니다 (FMEA 근거 연결은 계산하지 않음)')
  if (skippedNa > 0) report.notes.push(`고장원인이 비었거나 N/A인 ${skippedNa}행은 대상 아님으로 건너뛰었습니다`)
  const asilNoTsr = items.filter((i) => i.asilLevel && i.asilLevel !== 'QM' && i.refs.length === 0).length
  if (hasTsrColumn && asilNoTsr > 0) report.warnings.push({ where: '파일', message: `ASIL이 있는데 TSR ID가 비어 있는 고장원인 ${asilNoTsr}개 (추적성 화면의 역방향 확인에 표시)` })
  return { items, report, hasTsrColumn }
}
