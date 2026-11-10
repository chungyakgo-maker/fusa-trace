/**
 * 처음 보는 양식 (칸 지정, FORMATS §13)
 * 1. 미리보기: 엑셀은 시트별 위쪽 행, 워드는 표 목록
 * 2. 사람이 칸 역할을 정함 (내 ID 필수, 위 단계 ID, 제목, ASIL, 할당, 상태) → 규칙 저장
 * 3. 같은 모양(규칙의 머리글·키가 모두 있음)의 문서는 다음부터 자동으로 이 규칙으로 읽음
 * 작업 스레드에서 실행 (미리보기·읽기). 규칙 만들기 도우미는 화면에서도 씀
 */
import type { ImportReport, ReadRule, RuleRole, TraceItem } from './model'
import { emptyReport } from './model'
import type { Workbook } from './xlsx'
import type { DocxDocument } from './docx'
import { normHeader, splitLines } from './text'
import { asilLevel, extractFsrRefs, extractTsrRefs, markDuplicates, newItem, normalizeAllocation, normalizeStatus } from './ids'

export const ROLE_LABEL: Record<RuleRole, string> = {
  id: '내 ID (필수)',
  ref: '위 단계 ID (참조)',
  title: '제목·내용',
  asil: 'ASIL',
  allocation: '할당',
  status: '상태'
}
export const ROLES: readonly RuleRole[] = ['id', 'ref', 'title', 'asil', 'allocation', 'status']

export interface PreviewSheet {
  name: string
  /** 위쪽 행 (최대 40행 × 26칸, 칸 글자는 80자까지) */
  rows: string[][]
}
export interface PreviewTable {
  index: number
  rows: string[][]
}
export interface PreviewData {
  format: 'xlsx' | 'docx'
  sheets?: PreviewSheet[]
  tables?: PreviewTable[]
}

const cut = (s: string): string => (s.length > 80 ? `${s.slice(0, 79)}…` : s)

export function previewWorkbook(wb: Workbook): PreviewData {
  return {
    format: 'xlsx',
    sheets: wb.sheets.map((g) => {
      const rows: string[][] = []
      const maxCol = Math.min(g.maxCol, 25)
      for (let r = 0; r <= Math.min(g.maxRow, 39); r++) {
        const row: string[] = []
        for (let c = 0; c <= maxCol; c++) row.push(cut(g.text(r, c)))
        rows.push(row)
      }
      return { name: g.name, rows }
    })
  }
}

export function previewDocx(doc: DocxDocument): PreviewData {
  const tables: PreviewTable[] = []
  for (const b of doc.blocks) {
    if (b.type !== 'table') continue
    tables.push({ index: b.index, rows: b.rows.slice(0, 8).map((r) => r.map(cut)) })
    if (tables.length >= 80) break
  }
  return { format: 'docx', tables }
}

/** 규칙의 머리글·키 목록 */
function ruleHeaders(rule: ReadRule): string[] {
  return Object.values(rule.roles).filter((v): v is string => Boolean(v))
}

/** 참조 칸에서 ID 뽑기: TSR이 들어 있으면 TSR 규칙, 아니면 숫자가 든 조각 */
export function extractRefs(cell: string): string[] {
  if (/tsr/i.test(cell)) return extractTsrRefs(cell)
  return extractFsrRefs(cell)
}

interface RowSource {
  /** 위치 표시 */
  where: string
  get: (role: RuleRole) => string
}

function toItems(rule: ReadRule, sources: RowSource[], report: ImportReport): TraceItem[] {
  const kind = rule.docKind === 'HSR' ? 'HSR' : 'SWTEST'
  const items: TraceItem[] = []
  for (const s of sources) {
    const id = s.get('id').trim()
    if (!id) {
      if (ROLES.some((r) => r !== 'id' && s.get(r).trim())) report.skipped.push({ where: s.where, message: 'ID 칸이 비어 있어 건너뛰었습니다' })
      continue
    }
    const refRaw = s.get('ref')
    const allocRaw = s.get('allocation')
    const alloc = normalizeAllocation(allocRaw)
    const asil = s.get('asil').trim()
    const statusRaw = s.get('status').trim()
    items.push(
      newItem({
        kind,
        rawId: splitLines(id)[0] ?? id,
        title: s.get('title').trim(),
        asil,
        asilLevel: asilLevel(asil),
        allocation: alloc.allocation,
        allocationRaw: allocRaw,
        allocationNote: alloc.note,
        statusRaw,
        status: normalizeStatus(statusRaw),
        refRaw: refRaw.trim(),
        refs: extractRefs(refRaw),
        location: s.where
      })
    )
  }
  markDuplicates(items)
  for (const it of items) if (it.dupIndex === 2) report.warnings.push({ where: it.location, message: `ID 중복: ${it.rawId}가 ${it.dupCount}번 나옵니다` })
  return items
}

/** 엑셀에서 규칙의 머리글이 모두 있는 행 */
function findHeaderRow(wb: Workbook, rule: ReadRule): { sheet: number; row: number; cols: Map<string, number> } | undefined {
  const need = ruleHeaders(rule)
  const order = [...wb.sheets.keys()].sort((a, b) => Number(wb.sheets[b].name === rule.sheet) - Number(wb.sheets[a].name === rule.sheet))
  for (const si of order) {
    const g = wb.sheets[si]
    for (let r = 0; r <= Math.min(g.maxRow, 60); r++) {
      const cols = new Map<string, number>()
      for (const c of g.colsOf(r)) {
        const n = normHeader(g.text(r, c))
        if (n && !cols.has(n)) cols.set(n, c)
      }
      if (need.every((h) => cols.has(h))) return { sheet: si, row: r, cols }
    }
  }
  return undefined
}

function docxRowTables(doc: DocxDocument, rule: ReadRule): { index: number; rows: string[][]; cols: Map<string, number> }[] {
  const need = ruleHeaders(rule)
  const out: { index: number; rows: string[][]; cols: Map<string, number> }[] = []
  for (const b of doc.blocks) {
    if (b.type !== 'table' || b.rows.length === 0) continue
    const cols = new Map<string, number>()
    b.rows[0].forEach((cell, c) => {
      const n = normHeader(cell)
      if (n && !cols.has(n)) cols.set(n, c)
    })
    if (need.every((h) => cols.has(h))) out.push({ index: b.index, rows: b.rows, cols })
  }
  return out
}

function docxKeyValueTables(doc: DocxDocument, rule: ReadRule): { index: number; values: Map<string, string> }[] {
  const need = ruleHeaders(rule)
  const out: { index: number; values: Map<string, string> }[] = []
  for (const b of doc.blocks) {
    if (b.type !== 'table') continue
    const values = new Map<string, string>()
    for (const row of b.rows) {
      const k = normHeader(row[0] ?? '')
      if (k && !values.has(k)) values.set(k, row.slice(1).join(' ').trim())
    }
    if (need.every((h) => values.has(h))) out.push({ index: b.index, values })
  }
  return out
}

/** 이 문서가 규칙과 같은 모양인지 */
export function ruleMatches(rule: ReadRule, wb: Workbook | undefined, doc: DocxDocument | undefined): boolean {
  if (rule.format === 'xlsx') return Boolean(wb && findHeaderRow(wb, rule))
  if (!doc) return false
  return rule.layout === 'rows' ? docxRowTables(doc, rule).length > 0 : docxKeyValueTables(doc, rule).length > 0
}

export interface RuleParseResult {
  items: TraceItem[]
  report: ImportReport
}

export function parseWithRule(rule: ReadRule, wb: Workbook | undefined, doc: DocxDocument | undefined): RuleParseResult {
  const report = emptyReport()
  const sources: RowSource[] = []
  if (rule.format === 'xlsx' && wb) {
    const found = findHeaderRow(wb, rule)
    if (found) {
      const g = wb.sheets[found.sheet]
      let empty = 0
      for (let r = found.row + 1; r <= g.maxRow; r++) {
        if (!g.hasRow(r)) {
          if (++empty >= 20) break
          continue
        }
        empty = 0
        const row = r
        sources.push({
          where: `${g.name} ${r + 1}행`,
          get: (role) => {
            const h = rule.roles[role]
            const c = h ? found.cols.get(h) : undefined
            return c === undefined ? '' : g.text(row, c)
          }
        })
      }
    }
  } else if (doc && rule.layout === 'rows') {
    for (const t of docxRowTables(doc, rule)) {
      t.rows.slice(1).forEach((row, i) => {
        sources.push({
          where: `표 ${t.index} ${i + 2}행`,
          get: (role) => {
            const h = rule.roles[role]
            const c = h ? t.cols.get(h) : undefined
            return c === undefined ? '' : row[c] ?? ''
          }
        })
      })
    }
  } else if (doc) {
    for (const t of docxKeyValueTables(doc, rule)) {
      sources.push({ where: `표 ${t.index}`, get: (role) => (rule.roles[role] ? t.values.get(rule.roles[role]!) ?? '' : '') })
    }
  }
  const items = toItems(rule, sources, report)
  report.counts[rule.docKind === 'HSR' ? 'HSR' : 'SW 시험'] = items.length
  report.notes.push(`칸 지정 규칙 '${rule.name}'으로 읽었습니다`)
  if (!rule.roles.ref) report.notes.push('위 단계 ID 칸을 지정하지 않아 연결은 계산하지 않습니다')
  else if (items.length > 0 && items.every((i) => i.refs.length === 0)) report.warnings.push({ where: '문서', message: '위 단계 ID 칸에서 ID를 하나도 찾지 못했습니다. 칸 지정을 확인해 주세요' })
  return { items, report }
}

/** 화면에서 고른 칸으로 규칙 만들기 (머리글 글자는 normHeader로 정리) */
export function makeRule(input: {
  id: string
  name: string
  docKind: ReadRule['docKind']
  format: ReadRule['format']
  layout: ReadRule['layout']
  sheet?: string
  roleHeaders: Partial<Record<RuleRole, string>>
  now: string
}): ReadRule {
  const roles: Partial<Record<RuleRole, string>> = {}
  for (const r of ROLES) {
    const h = input.roleHeaders[r]
    if (h && normHeader(h)) roles[r] = normHeader(h)
  }
  return {
    id: input.id,
    name: input.name.trim() || `${input.docKind} 양식`,
    docKind: input.docKind,
    format: input.format,
    layout: input.layout,
    roles,
    ...(input.sheet ? { sheet: input.sheet } : {}),
    createdAt: input.now
  }
}
