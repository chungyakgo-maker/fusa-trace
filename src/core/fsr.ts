/**
 * FSR(고객 기능안전 요구사양서, 엑셀) 읽기 (FORMATS §4)
 * - `2. 안전 목표` 시트: SG 정의·FTTI·요약 표, Safe State 표 (무관한 표는 무시)
 * - SG마다 FSR 시트, 한 시트에 FSR 표 3개 (자체 / 타 ECU에 요구 / 타 ECU로부터)
 * - 헤더 칸 바깥의 열(팀이 덧붙인 TSR 매핑, 메모)은 읽지 않음
 */
import type { FsrOrigin, ImportReport, TraceItem } from './model'
import { emptyReport } from './model'
import type { Grid, Workbook } from './xlsx'
import { SYNONYMS } from './headers'
import { cleanValue, isTbd, normHeader } from './text'
import { asilLevel, markDuplicates, newItem, normalizeAllocation, normalizeId } from './ids'

export interface FsrParseResult {
  items: TraceItem[]
  version: string
  report: ImportReport
}

type ColMap = Map<string, number>

/** 헤더 행의 칸 이름 → 열 */
function rowHeaders(grid: Grid, r: number): ColMap {
  const m: ColMap = new Map()
  for (const c of grid.colsOf(r)) {
    const n = normHeader(grid.text(r, c))
    if (n && !m.has(n)) m.set(n, c)
  }
  return m
}

function colOf(h: ColMap, synonyms: readonly string[]): number | undefined {
  for (const s of synonyms) if (h.has(s)) return h.get(s)
  return undefined
}

function colStarting(h: ColMap, prefix: string): number | undefined {
  for (const [k, c] of h) if (k.startsWith(prefix)) return c
  return undefined
}

function readVersion(wb: Workbook): string {
  const sheet = wb.sheets.find((s) => /개정\s*이력|history/i.test(s.name))
  if (!sheet) return ''
  for (let r = 0; r <= Math.min(sheet.maxRow, 30); r++) {
    const c = colOf(rowHeaders(sheet, r), ['버전', 'version', 'ver.', 'rev.', 'rev'])
    if (c === undefined) continue
    let last = ''
    for (let k = r + 1; k <= sheet.maxRow; k++) {
      const v = sheet.text(k, c).trim()
      if (v) last = v
    }
    return last
  }
  return ''
}

function readSafetyGoals(wb: Workbook, report: ImportReport): TraceItem[] {
  const sheet =
    wb.sheets.find((s) => s.name.includes('안전 목표') || s.name.includes('안전목표')) ??
    wb.sheets.find((s) => {
      for (let r = 0; r <= Math.min(s.maxRow, 60); r++) if (rowHeaders(s, r).has('id_safetygoal')) return true
      return false
    })
  if (!sheet) {
    report.notes.push('안전 목표(SG) 시트를 찾지 못했습니다. FSR 시트 이름의 SG로만 묶습니다.')
    return []
  }
  const sgs = new Map<string, TraceItem>()
  const states: TraceItem[] = []
  const sgOf = (raw: string, r: number): TraceItem => {
    const key = normalizeId(raw)
    let it = sgs.get(key)
    if (!it) {
      it = newItem({ kind: 'SG', rawId: raw.trim(), location: `${sheet.name} ${r + 1}행` })
      sgs.set(key, it)
    }
    return it
  }
  for (let r = 0; r <= sheet.maxRow; r++) {
    const h = rowHeaders(sheet, r)
    const sgCol = h.get('id_safetygoal')
    const ssCol = h.get('id_safestate')
    if (sgCol === undefined && !(ssCol !== undefined && colStarting(h, '안전 상태') !== undefined)) continue
    for (let k = r + 1; k <= sheet.maxRow; k++) {
      const idCol = sgCol ?? ssCol!
      const id = cleanValue(sheet.text(k, idCol))
      if (!id) break
      if (sgCol !== undefined) {
        const it = sgOf(id, k)
        const title = colStarting(h, '안전 목표')
        const asil = h.get('asil')
        const hazard = colStarting(h, '재난요인')
        const ftti = colStarting(h, 'ftti')
        const ss = h.get('id_safestate')
        const acc = colOf(h, SYNONYMS.acceptance)
        if (title !== undefined) it.title = sheet.text(k, title).trim()
        if (asil !== undefined && sheet.text(k, asil).trim()) {
          it.asil = sheet.text(k, asil).trim()
          it.asilLevel = asilLevel(it.asil)
        }
        if (hazard !== undefined) it.attrs['재난요인'] = sheet.text(k, hazard).trim()
        if (ftti !== undefined) it.attrs['FTTI'] = cleanValue(sheet.text(k, ftti))
        if (ss !== undefined) it.attrs['Safe State'] = cleanValue(sheet.text(k, ss))
        if (acc !== undefined) it.attrs['허용 기준'] = cleanValue(sheet.text(k, acc))
      } else {
        const name = colStarting(h, '안전 상태')!
        const detail = colStarting(h, '상세')
        states.push(
          newItem({
            kind: 'SS',
            rawId: id,
            title: sheet.text(k, name).trim(),
            attrs: detail !== undefined ? { 상세: sheet.text(k, detail).trim() } : {},
            location: `${sheet.name} ${k + 1}행`
          })
        )
      }
    }
  }
  return [...sgs.values(), ...states]
}

const ORIGIN_LABEL: Record<FsrOrigin, string> = { own: '자체', toOther: '타 ECU에 요구', fromOther: '타 ECU로부터' }

/** 표 바로 위의 절 제목으로 구분 확인 */
function originFromTitle(grid: Grid, headerRow: number): FsrOrigin | undefined {
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 6); r--) {
    for (const c of grid.colsOf(r)) {
      const t = normHeader(grid.text(r, c))
      if (t.includes('to other ecu')) return 'toOther'
      if (t.includes('from other ecu')) return 'fromOther'
      if (t.includes('기능안전 요구사항 상세')) return 'own'
    }
  }
  return undefined
}

function isFsrHeaderRow(h: ColMap): boolean {
  return colOf(h, SYNONYMS.fsrId) !== undefined
}

function readFsrSheet(grid: Grid, report: ImportReport): TraceItem[] {
  const items: TraceItem[] = []
  const sgFromName = /\((SG[\s_-]?\d+)\)/i.exec(grid.name)?.[1]
  let tableIndex = 0
  for (let r = 0; r <= grid.maxRow; r++) {
    const h = rowHeaders(grid, r)
    if (!isFsrHeaderRow(h)) continue
    const order: FsrOrigin[] = ['own', 'toOther', 'fromOther']
    const origin = originFromTitle(grid, r) ?? order[Math.min(tableIndex, 2)]
    tableIndex++
    const idCol = colOf(h, SYNONYMS.fsrId)!
    const textCol = colOf(h, SYNONYMS.fsrText)
    const ssCol = colOf(h, SYNONYMS.safeState)
    const asilCol = h.get('asil')
    const fttiCol = colOf(h, SYNONYMS.ftti)
    const accCol = colOf(h, SYNONYMS.acceptance)
    const allocCol = h.get('allocation')
    const sgCol = colOf(h, ['sg_id', 'id_safetygoal', 'sg id'])
    const typeCol = h.get('type')

    let k = r + 1
    for (; k <= grid.maxRow; k++) {
      if (isFsrHeaderRow(rowHeaders(grid, k))) break
      const id = cleanValue(grid.text(k, idCol))
      const text = textCol !== undefined ? grid.text(k, textCol).trim() : ''
      if (!id && !text) break // 표의 끝
      const where = `${grid.name} ${k + 1}행`
      if (!id) {
        report.skipped.push({ where, message: 'FSR ID가 비어 있어 건너뛰었습니다' })
        continue
      }
      const allocRaw = allocCol !== undefined ? grid.text(k, allocCol).trim() : ''
      const alloc = normalizeAllocation(allocRaw)
      const asil = asilCol !== undefined ? grid.text(k, asilCol).trim() : ''
      const sgRaw = (sgCol !== undefined ? cleanValue(grid.text(k, sgCol)) : '') || sgFromName || ''
      const attrs: Record<string, string> = {}
      const put = (label: string, col: number | undefined): void => {
        if (col === undefined) return
        const raw = grid.text(k, col).trim()
        if (isTbd(raw)) report.warnings.push({ where, message: `${id}: ${label} 미정 (${raw})` })
        attrs[label] = cleanValue(raw)
      }
      put('Safe State', ssCol)
      put('FTTI', fttiCol)
      put('허용 기준', accCol)
      if (typeCol !== undefined) attrs['Type'] = grid.text(k, typeCol).trim()
      items.push(
        newItem({
          kind: 'FSR',
          rawId: id,
          title: text,
          asil,
          asilLevel: asilLevel(asil),
          allocation: alloc.allocation,
          allocationRaw: allocRaw,
          allocationNote: alloc.note,
          general: alloc.allocation === 'GENERAL',
          sg: sgRaw ? normalizeId(sgRaw) : undefined,
          origin,
          attrs,
          location: where
        })
      )
    }
    r = k - 1
  }
  return items
}

export function parseFsr(wb: Workbook): FsrParseResult {
  const report = emptyReport()
  const version = readVersion(wb)
  const sgItems = readSafetyGoals(wb, report)

  const candidates = wb.sheets.filter((s) => {
    for (let r = 0; r <= Math.min(s.maxRow, 80); r++) if (isFsrHeaderRow(rowHeaders(s, r))) return true
    return false
  })
  const preferred = candidates.filter((s) => /\(SG[\s_-]?\d+\)|요구사항/i.test(s.name))
  const nonJunk = candidates.filter((s) => !/^(sheet\d*|기타|임시|작업용?)$/i.test(s.name.trim()))
  const sheets = preferred.length > 0 ? preferred : nonJunk.length > 0 ? nonJunk : candidates
  const ignored = candidates.filter((s) => !sheets.includes(s))
  for (const s of ignored) report.notes.push(`'${s.name}' 시트는 작업용으로 보고 읽지 않았습니다`)

  const fsrs = sheets.flatMap((s) => readFsrSheet(s, report))
  const items = [...sgItems, ...fsrs]
  markDuplicates(items)
  for (const it of items) {
    if (it.dupIndex === 2) report.warnings.push({ where: it.location, message: `ID 중복: ${it.rawId}가 ${it.dupCount}번 나옵니다` })
  }

  report.counts['SG'] = sgItems.filter((i) => i.kind === 'SG').length
  report.counts['Safe State'] = sgItems.filter((i) => i.kind === 'SS').length
  report.counts['FSR'] = fsrs.length
  const byOrigin = (o: FsrOrigin): number => fsrs.filter((f) => f.origin === o).length
  report.notes.push(`FSR ${fsrs.length}개: ${(['own', 'fromOther', 'toOther'] as FsrOrigin[]).map((o) => `${ORIGIN_LABEL[o]} ${byOrigin(o)}`).join(' · ')}`)
  return { items, version, report }
}

export { ORIGIN_LABEL }
