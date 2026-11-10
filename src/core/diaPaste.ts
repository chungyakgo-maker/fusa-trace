/**
 * DIA 붙여넣기용 시트 계산 (2026-11-10 사용자 결정) — 순수 함수
 * 원본 DIA와 같은 행 번호·같은 열 위치에 일정 4칸 + 담당 칸을 둔다.
 * - 고치지 않은 칸 = 원본 값 그대로 (붙여 넣어도 바뀌지 않음)
 * - 고친 칸 = 원본 칸의 모양대로 다시 만듦 ("FMEA: 날짜" 여러 줄, "팀\n이름 직급", 글자 날짜의 구분 글자)
 * - 병합·수식이 있는 행은 한 번에 붙여 넣을 수 없어 범위에서 빼고, 바뀐 칸 목록으로 직접 고치게 안내
 */
import type { DateSource, Deliverable, DiaDateField, DiaLayout, IsoDate, Owner, Project, RawCell, SourceDoc } from './model'
import { DIA_DATE_FIELDS } from './model'
import { activeDocs } from './project'
import { applyEdit, EDIT_FIELD_LABEL, ownerOf, sameOwner, type EditField } from './edits'
import { colLetter, rowRuns } from './cells'
import { dateSepOf } from './dia'

export interface PasteChange {
  row: number
  col: number
  /** 칸 주소 (예: L12) */
  address: string
  diaNo?: number
  workProduct: string
  /** 바뀐 항목 (계획 종료, 담당 …) */
  fields: string[]
  before: string
  after: string
  /** 병합·수식 때문에 붙여넣기 범위에서 뺀 행 */
  blocked: boolean
  /** 원래 모양으로 다시 만들 수 없어서 직접 고쳐야 함 (붙여넣기 시트에는 원본 값을 둠) */
  manual: boolean
  note?: string
}

export interface PastePlan {
  doc: SourceDoc
  layout: DiaLayout
  /** 붙여넣기 범위 안의 최종 값: "행,열" → 값 */
  cells: Map<string, RawCell>
  changes: PasteChange[]
  /** 한 번에 붙여 넣을 범위 (병합·수식 행을 피해 나뉠 수 있음) */
  fullRanges: string[]
  /** 바뀐 행만 붙여 넣을 범위 */
  changedRanges: string[]
  /** 참고용: 행 → No. · 산출물 */
  refRows: Map<number, { diaNo: number; workProduct: string }>
}

const key = (r: number, c: number): string => `${r},${c}`

export function rawText(v: RawCell | undefined): string {
  if (!v) return ''
  if ('d' in v) return v.d
  if ('s' in v) return v.s
  if ('n' in v) return String(v.n)
  return v.b ? 'TRUE' : 'FALSE'
}

function sameRaw(a: RawCell | undefined, b: RawCell | undefined): boolean {
  if (!a || !b) return !a && !b
  return JSON.stringify(a) === JSON.stringify(b)
}

function fmtDate(iso: IsoDate, sep: string): string {
  return sep === '-' ? iso : iso.split('-').join(sep)
}

/** 날짜 하나를 원본 칸과 같은 종류로 (글자면 글자, 8자리 숫자면 숫자, 그 외는 엑셀 날짜) */
function dateCellLike(iso: IsoDate, orig: RawCell | undefined): RawCell {
  if (orig && 's' in orig) return { s: fmtDate(iso, dateSepOf(orig.s)) }
  if (orig && 'n' in orig && orig.n >= 19_000_000 && orig.n <= 21_001_231) return { n: Number(iso.replace(/-/g, '')) }
  return { d: iso }
}

function lineLabel(d: Deliverable): string {
  return d.docLabel || d.expectedFileName || `줄 ${d.line}`
}

interface Effective {
  dia: Deliverable
  d: Deliverable
  fields: EditField[]
}

/** 날짜 칸 하나 다시 만들기. manual = 원래 모양으로 만들 수 없음 */
function rebuildDateCell(lines: Effective[], field: DiaDateField, orig: RawCell | undefined): { cell: RawCell | undefined; manual: boolean; note?: string } {
  const srcs: DateSource[] = lines.map((l) => l.dia.dateSrc?.[field] ?? { kind: 'empty' })
  const edited = lines.map((l) => l.fields.includes(field))
  if (srcs.some((s, i) => edited[i] && s.kind === 'guess')) return { cell: orig, manual: true, note: '원본 칸의 날짜 짝을 알 수 없어 직접 고쳐 주세요' }
  const values = lines.map((l) => l.d[field] ?? '')
  const hasEntry = srcs.some((s) => s.kind === 'entry')

  if (!orig || !('s' in orig) || !hasEntry) {
    // 칸 값 하나 (엑셀 날짜·글자 날짜 하나·빈 칸)
    if (lines.length === 1 || values.every((v) => v === values[0])) return { cell: values[0] ? dateCellLike(values[0], orig) : undefined, manual: false }
    const sep = orig && 's' in orig ? dateSepOf(orig.s) : '-'
    const text = lines
      .filter((l) => l.d[field])
      .map((l) => `${lineLabel(l.d)}: ${fmtDate(l.d[field]!, sep)}`)
      .join('\n')
    return { cell: text ? { s: text } : undefined, manual: false, note: '줄마다 날짜가 달라져서 "라벨: 날짜" 여러 줄로 바꿈' }
  }

  // 여러 줄 글 ("FMEA: 2026-04-10\nDFA: 2026-04-20") → 고친 줄만 바꿈
  const rawLines: (string | null)[] = orig.s.split(/\r\n|\r|\n/)
  const added: string[] = []
  lines.forEach((l, i) => {
    if (!edited[i]) return
    const src = srcs[i]
    const v = values[i]
    if (src.kind === 'entry') rawLines[src.line] = v ? `${src.prefix}${fmtDate(v, src.sep)}` : null
    else if (v) added.push(`${lineLabel(l.d)}: ${fmtDate(v, dateSepOf(orig.s))}`)
  })
  const text = [...rawLines.filter((x): x is string => x !== null), ...added].join('\n')
  return { cell: text.trim() ? { s: text } : undefined, manual: false }
}

/** 담당 칸: "팀\n사람1\n사람2" (원본이 "사람1, 사람2"처럼 한 줄이면 그 모양으로) */
function ownerCell(owner: Owner, orig: RawCell | undefined): RawCell | undefined {
  const o = { team: owner.team.trim(), people: owner.people.map((p) => p.trim()).filter(Boolean) }
  const origLines = orig && 's' in orig ? orig.s.split(/\r\n|\r|\n/).slice(1) : []
  const commaStyle = origLines.some((l) => /[,，]/.test(l))
  const peopleLines = o.people.length === 0 ? [] : commaStyle ? [o.people.join(', ')] : o.people
  const text = [o.team, ...peopleLines].filter(Boolean).join('\n')
  return text ? { s: text } : undefined
}

function rangeText(from: number, to: number, runs: [number, number][]): string[] {
  return runs.map(([a, b]) => `${colLetter(from)}${a}:${colLetter(to)}${b}`)
}

export function buildPastePlan(p: Project): PastePlan | { reason: string } {
  const doc = activeDocs(p, 'DIA')[0]
  if (!doc?.dia) return { reason: 'DIA가 없습니다' }
  const layout = doc.dia.layout
  if (!layout) return { reason: '이 DIA는 칸 위치를 기억하기 전(v0.7.0 이전)에 넣은 것입니다. DIA를 한 번 다시 넣어 주세요' }

  const cells = new Map<string, RawCell>(Object.entries(layout.cells))
  const blocked = new Set(layout.blockedRows)
  const changes: PasteChange[] = []
  const refRows = new Map<number, { diaNo: number; workProduct: string }>()

  const byRow = new Map<number, Effective[]>()
  for (const dia of doc.dia.deliverables) {
    refRows.set(dia.sourceRow, { diaNo: dia.diaNo, workProduct: dia.workProduct })
    const a = applyEdit(dia, p.scheduleEdits?.[dia.key])
    const list = byRow.get(dia.sourceRow) ?? []
    list.push({ dia, d: a.d, fields: a.view?.fields ?? [] })
    byRow.set(dia.sourceRow, list)
  }

  for (const [row, lines] of byRow) {
    lines.sort((a, b) => a.dia.line - b.dia.line)
    const ref = refRows.get(row)
    const record = (col: number, fields: EditField[], before: RawCell | undefined, after: RawCell | undefined, manual: boolean, note?: string): void => {
      if (!manual && sameRaw(before, after)) return
      changes.push({
        row,
        col,
        address: `${colLetter(col)}${row}`,
        diaNo: ref?.diaNo,
        workProduct: ref?.workProduct ?? '',
        fields: fields.map((f) => EDIT_FIELD_LABEL[f]),
        before: rawText(before),
        after: manual ? lines.map((l) => l.d[fields[0] as DiaDateField] ?? '').filter(Boolean).join(' / ') : rawText(after),
        blocked: blocked.has(row),
        manual,
        note
      })
    }

    for (const field of DIA_DATE_FIELDS) {
      const col = layout.cols[field]
      if (col === undefined || !lines.some((l) => l.fields.includes(field))) continue
      const orig = cells.get(key(row, col))
      const r = rebuildDateCell(lines, field, orig)
      if (!r.manual) {
        if (r.cell) cells.set(key(row, col), r.cell)
        else cells.delete(key(row, col))
      }
      record(col, [field], orig, r.cell, r.manual, r.note)
    }

    const teamCol = layout.cols.team
    const ownerLine = lines.find((l) => l.fields.includes('owner'))
    if (teamCol !== undefined && ownerLine) {
      const orig = cells.get(key(row, teamCol))
      const owner = ownerOf(ownerLine.d)
      // 담당은 행 하나에 칸 하나: 줄마다 다르게 고쳤으면 첫 번째 고친 값을 씀
      const differs = lines.some((l) => l.fields.includes('owner') && !sameOwner(ownerOf(l.d), owner))
      const cell = ownerCell(owner, orig)
      if (cell) cells.set(key(row, teamCol), cell)
      else cells.delete(key(row, teamCol))
      record(teamCol, ['owner'], orig, cell, false, differs ? '같은 행의 줄마다 담당을 다르게 고쳐서 첫 번째 값을 씀' : undefined)
    }
  }
  changes.sort((a, b) => a.row - b.row || a.col - b.col)

  const allRows: number[] = []
  for (let r = layout.firstRow; r <= layout.lastRow; r++) if (!blocked.has(r)) allRows.push(r)
  const changedRows = changes.filter((c) => !c.blocked && !c.manual).map((c) => c.row)
  return {
    doc,
    layout,
    cells,
    changes,
    fullRanges: rangeText(layout.pasteFrom, layout.pasteTo, rowRuns(allRows)),
    changedRanges: rangeText(layout.pasteFrom, layout.pasteTo, rowRuns(changedRows)),
    refRows
  }
}
