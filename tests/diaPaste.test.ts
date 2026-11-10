import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { demoProject, fixture, importInto, P } from './helpers'
import type { Deliverable, ParsedDocument, Project, RawCell } from '../src/core/model'
import { readDocument } from '../src/core/importer'
import { activeDeliverables, addDocument, toSourceDoc } from '../src/core/project'
import { applyEdit, clearEdits, countEdits, ownerOf, pruneEdits, setDateEdit, setOwnerEdit } from '../src/core/edits'
import { buildPastePlan, type PastePlan } from '../src/core/diaPaste'
import { computeSchedule } from '../src/core/schedule'
import { colLetter, rowRuns } from '../src/core/cells'

const NOW = '2026-05-02T10:00:00.000Z'
const DIA = `${P}_DIA_R1.xlsx`

function line(p: Project, no: number, label?: string): Deliverable {
  const d = activeDeliverables(p).find((x) => x.diaNo === no && (label === undefined || x.docLabel === label))
  if (!d) throw new Error(`No.${no} ${label ?? ''} 없음`)
  return d
}

/** 화면에서 여러 칸을 고친 프로젝트 */
function editedProject(): Project {
  let p = importInto(demoProject(), DIA)
  p = setDateEdit(p, line(p, 1), 'planEnd', '2026-04-15', NOW) // 엑셀 날짜 칸
  p = setDateEdit(p, line(p, 5, 'TSC VR'), 'planEnd', '2026-05-20', NOW) // "TSC: …\nTSC VR: …" 여러 줄
  p = setDateEdit(p, line(p, 4), 'planEnd', '2026-07-05', NOW) // 글자 날짜 "2026.06.30"
  p = setDateEdit(p, line(p, 6, 'DFA'), 'realStart', '2026-04-15', NOW) // 칸에 그 줄 값이 없음 → 줄 추가
  p = setDateEdit(p, line(p, 7, 'HSI'), 'planEnd', '2026-06-25', NOW) // 형식 오류("2026-06-") 고치기
  p = setDateEdit(p, line(p, 12), 'planStart', '', NOW) // 비우기
  const row2 = activeDeliverables(p).filter((d) => d.diaNo === 2)
  p = setOwnerEdit(p, row2, { team: '기능안전팀', people: ['홍길동 책임', '이몽룡 선임'] }, NOW) // "이름, 이름" 한 줄 모양
  const row5 = activeDeliverables(p).filter((d) => d.diaNo === 5)
  p = setOwnerEdit(p, row5, { team: '시스템팀', people: ['박민수 선임'] }, NOW) // 여러 줄 행 → 두 줄 모두
  return p
}

const cellOf = (plan: PastePlan, row: number, col: number): RawCell | undefined => plan.cells.get(`${row},${col}`)

describe('산출물 일정 직접 수정 (edits)', () => {
  it('고친 값이 일정·상태에 반영되고, DIA 값은 따로 남음', () => {
    const p = editedProject()
    const rows = computeSchedule(p, '2026-04-20')
    const r1 = rows.find((r) => r.d.diaNo === 1)!
    expect(r1.d.planEnd).toBe('2026-04-15')
    expect(r1.dia.planEnd).toBe('2026-03-31')
    expect(r1.edit?.fields).toEqual(['planEnd'])
    expect(r1.edit?.original.planEnd).toBe('2026-03-31')
    const r12 = rows.find((r) => r.d.diaNo === 12)!
    expect(r12.d.planStart).toBeUndefined()
    expect(r12.noPlan).toBe(true)
    // 형식 오류 경고는 고친 칸이면 사라짐
    const hsi = rows.find((r) => r.d.diaNo === 7 && r.d.docLabel === 'HSI')!
    expect(hsi.dia.dateWarnings.some((w) => w.includes('계획 종료'))).toBe(true)
    expect(hsi.d.dateWarnings.some((w) => w.includes('계획 종료'))).toBe(false)
  })

  it('담당은 같은 DIA 행의 모든 줄에 함께 적용', () => {
    const p = editedProject()
    const row5 = computeSchedule(p, '2026-04-20').filter((r) => r.d.diaNo === 5)
    expect(row5.length).toBe(2)
    for (const r of row5) expect(ownerOf(r.d)).toEqual({ team: '시스템팀', people: ['박민수 선임'] })
  })

  it('DIA 값과 같게 고치면 원래대로, [원래대로]는 그 칸만 지움', () => {
    let p = editedProject()
    const before = countEdits(p, activeDeliverables(p))
    p = setDateEdit(p, line(p, 1), 'planEnd', '2026-03-31', NOW)
    expect(countEdits(p, activeDeliverables(p))).toBe(before - 1)
    p = clearEdits(p, [line(p, 4).key], NOW)
    expect(countEdits(p, activeDeliverables(p))).toBe(before - 2)
  })

  it('새 DIA: 고친 값과 같아진 칸은 지우고, 다르게 바뀐 칸은 "DIA 값이 바뀜"', () => {
    const p = editedProject()
    const ds = activeDeliverables(p)
    const next = ds.map((d) =>
      d.diaNo === 1 ? { ...d, planEnd: '2026-04-15' } : d.diaNo === 4 ? { ...d, planEnd: '2026-06-28' } : d
    )
    const pruned = pruneEdits(p.scheduleEdits, next)!
    expect(pruned[line(p, 1).key]).toBeUndefined()
    const e4 = pruned[line(p, 4).key]
    expect(e4?.planEnd?.value).toBe('2026-07-05')
    const view = applyEdit(next.find((d) => d.diaNo === 4)!, e4).view!
    expect(view.diaChanged).toEqual(['planEnd'])
  })
})

describe('DIA 붙여넣기용 시트 (diaPaste)', () => {
  const p = editedProject()
  const plan = buildPastePlan(p) as PastePlan
  const L = plan.layout

  it('원본의 칸 위치를 기억함 (시트, 열, 행 범위)', () => {
    expect(L.sheet).toBe('Detailed Agreement')
    expect([L.cols.planStart, L.cols.planEnd, L.cols.realStart, L.cols.realEnd, L.cols.team]).toEqual([10, 11, 12, 13, 14]) // K~O
    expect(L.firstRow).toBe(8)
    expect(L.blockedRows).toEqual([])
    expect(plan.fullRanges).toEqual([`K8:O${L.lastRow}`])
  })

  it('고친 칸을 원본 모양대로 다시 만듦', () => {
    const row = (no: number): number => line(p, no).sourceRow
    expect(cellOf(plan, row(1), 11)).toEqual({ d: '2026-04-15' })
    expect(cellOf(plan, row(5), 11)).toEqual({ s: 'TSC: 2026-04-27\nTSC VR: 2026-05-20' })
    expect(cellOf(plan, row(4), 11)).toEqual({ s: '2026.07.05' })
    expect(cellOf(plan, row(6), 12)).toEqual({ s: 'FMEA: 2026-04-12\nDFA: 2026-04-15' })
    expect(cellOf(plan, row(7), 11)).toEqual({ s: 'HSI: 2026-06-25\nHSI VR: 2026-06-20' })
    expect(cellOf(plan, row(12), 10)).toBeUndefined()
    expect(cellOf(plan, row(2), 14)).toEqual({ s: '기능안전팀\n홍길동 책임, 이몽룡 선임' })
    expect(cellOf(plan, row(5), 14)).toEqual({ s: '시스템팀\n박민수 선임' })
  })

  it('바뀐 칸 목록 (주소, 원래 값 → 고친 값)과 바뀐 행만 범위', () => {
    const row = (no: number): number => line(p, no).sourceRow
    const c1 = plan.changes.find((c) => c.address === `L${row(1)}`)!
    expect(c1.before).toBe('2026-03-31')
    expect(c1.after).toBe('2026-04-15')
    expect(c1.fields).toEqual(['계획 종료'])
    expect(plan.changes.length).toBe(8)
    expect(plan.changes.every((c) => !c.manual && !c.blocked)).toBe(true)
    const rows = [...new Set(plan.changes.map((c) => c.row))]
    expect(plan.changedRanges.length).toBe(rowRuns(rows).length)
  })

  it('고치지 않은 칸은 원본 값 그대로', () => {
    for (const [k, v] of Object.entries(L.cells)) {
      const [r, c] = k.split(',').map(Number)
      if (plan.changes.some((x) => x.row === r && x.col === c)) continue
      expect(plan.cells.get(k)).toEqual(v)
    }
  })

  it('원본 DIA에 붙여 넣고(값만) 다시 읽으면: 고친 값이 들어가고 나머지는 그대로, 고친 칸은 모두 반영 끝', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(fixture(DIA)) as unknown as ExcelJS.Buffer)
    const ws = wb.getWorksheet(L.sheet)!
    for (const range of plan.fullRanges) {
      const [, , r1, , r2] = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range)!.map((x, i) => (i === 2 || i === 4 ? Number(x) : x)) as [string, string, number, string, number]
      for (let r = r1; r <= r2; r++) {
        for (let c = L.pasteFrom; c <= L.pasteTo; c++) {
          const v = plan.cells.get(`${r},${c}`)
          const cell = ws.getCell(r, c + 1)
          if (!v) cell.value = null
          else if ('d' in v) {
            const [y, m, d] = v.d.split('-').map(Number)
            cell.value = new Date(Date.UTC(y, m - 1, d))
            if (!cell.numFmt || cell.numFmt === 'General') cell.numFmt = 'yyyy-mm-dd'
          } else if ('s' in v) cell.value = v.s
          else if ('n' in v) cell.value = v.n
          else cell.value = v.b
        }
      }
    }
    const bytes = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    const r = readDocument('붙여넣은_DIA_R2.xlsx', bytes)
    expect(r.ok && r.kind).toBe('DIA')
    const after = r.dia!.deliverables
    const want = computeSchedule(p, '2026-04-20').map((x) => x.d)
    expect(after.length).toBe(want.length)
    for (const w of want) {
      const a = after.find((x) => x.key === w.key)!
      expect([a.planStart, a.planEnd, a.realStart, a.realEnd, a.team, a.people], w.key).toEqual([w.planStart, w.planEnd, w.realStart, w.realEnd, w.team, w.people])
    }
    // 원본의 다른 칸(파일명, Work products 등)은 그대로
    expect(after.map((d) => d.expectedFileName)).toEqual(activeDeliverables(p).map((d) => d.expectedFileName))
    // 새 DIA로 넣으면 고친 칸은 모두 반영 끝 → 지워짐
    const parsed: ParsedDocument = { ...r, path: 'x', hash: 'patched', size: 1, elapsedMs: 0 }
    const q = addDocument(p, toSourceDoc(parsed, 'DIA', 'patched', NOW), NOW)
    expect(Object.keys(q.scheduleEdits ?? {})).toEqual([])
  })

  it('이 기능 전에 넣은 DIA(칸 위치 없음)는 다시 넣으라고 안내', () => {
    const q: Project = { ...p, docs: p.docs.map((d) => (d.dia ? { ...d, dia: { deliverables: d.dia.deliverables } } : d)) }
    const r = buildPastePlan(q)
    expect('reason' in r && r.reason).toContain('다시 넣어')
  })
})

describe('병합·수식이 있는 행은 붙여넣기 범위에서 뺌', () => {
  it('병합 칸·수식 칸 행을 피해서 범위를 나눔', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Detailed Agreement')
    const head = ['No.', 'Work products', 'Actual work product name', 'Start', 'End', 'Start', 'End', 'In charge of Team']
    ws.getCell('D1').value = 'PLAN'
    ws.getCell('F1').value = 'Real'
    head.forEach((h, i) => (ws.getRow(2).getCell(i + 1).value = h))
    for (let i = 0; i < 6; i++) {
      const r = 3 + i
      ws.getCell(r, 1).value = i + 1
      ws.getCell(r, 2).value = `WP ${i + 1}`
      ws.getCell(r, 3).value = `Doc_${i + 1}_R1.docx`
      ws.getCell(r, 4).value = new Date(Date.UTC(2026, 3, 1 + i))
      ws.getCell(r, 4).numFmt = 'yyyy-mm-dd'
      ws.getCell(r, 8).value = `팀${i}\n사람${i} 책임`
    }
    ws.mergeCells('E4:E5') // 계획 종료 칸 병합 (4~5행)
    ws.getCell('F7').value = { formula: 'D7+1', result: new Date(Date.UTC(2026, 3, 6)) }
    ws.getCell('F7').numFmt = 'yyyy-mm-dd'
    const bytes = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    const r = readDocument('수식_DIA_R1.xlsx', bytes, 'DIA')
    const layout = r.dia!.layout!
    expect(layout.blockedRows).toEqual([4, 5, 7])
    let p: Project = demoProject()
    const parsed: ParsedDocument = { ...r, path: 'x', hash: 'h', size: 1, elapsedMs: 0 }
    p = addDocument(p, toSourceDoc(parsed, 'DIA', 'd1', NOW), NOW)
    p = setDateEdit(p, activeDeliverables(p).find((d) => d.diaNo === 2)!, 'planStart', '2026-05-01', NOW)
    const plan = buildPastePlan(p) as PastePlan
    expect(plan.fullRanges).toEqual(['D3:H3', 'D6:H6', 'D8:H8'])
    const c = plan.changes.find((x) => x.row === 4)!
    expect(c.blocked).toBe(true)
    expect(plan.changedRanges).toEqual([])
  })

  it('열 글자', () => {
    expect([colLetter(0), colLetter(25), colLetter(26), colLetter(27)]).toEqual(['A', 'Z', 'AA', 'AB'])
    expect(rowRuns([9, 3, 4, 5, 4])).toEqual([[3, 5], [9, 9]])
  })
})

describe('엑셀 출력: 고친 칸 표시 + DIA 붙여넣기 시트', async () => {
  const { buildScheduleWorkbook, SHEET_LIST, SHEET_PASTE, SHEET_PASTE_GUIDE } = await import('../src/core/export')
  const p = editedProject()

  it('붙여넣기 시트는 고른 때만', async () => {
    const wb = await buildScheduleWorkbook(p, '2026-04-20', '2026-04-20', { includeTrace: false })
    expect(wb.getWorksheet(SHEET_PASTE)).toBeUndefined()
  })

  it('작성 리스트: 고친 칸에 색 + 비고에 DIA 원래 값', async () => {
    const wb = await buildScheduleWorkbook(p, '2026-04-20', '2026-04-20', { includeTrace: false, includePaste: true })
    const ws = wb.getWorksheet(SHEET_LIST)!
    let found = false
    ws.eachRow((row) => {
      if (row.getCell(1).value === 1 && String(row.getCell(3).value).startsWith('Safety plan')) {
        found = true
        expect((row.getCell(9).value as Date).toISOString().slice(0, 10)).toBe('2026-04-15')
        expect((row.getCell(9).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFFF4D6')
        expect(String(row.getCell(15).value)).toContain('계획 종료 직접 고침 (DIA: 2026-03-31)')
      }
    })
    expect(found).toBe(true)
  })

  it('붙여넣기 안내(범위·방법·바뀐 칸 표) + 붙여넣기 시트(원본과 같은 주소)', async () => {
    const wb = await buildScheduleWorkbook(p, '2026-04-20', '2026-04-20', { includeTrace: false, includePaste: true })
    const gs = wb.getWorksheet(SHEET_PASTE_GUIDE)!
    const text: string[] = []
    gs.eachRow((row) => row.eachCell((c) => text.push(String(c.value))))
    const all = text.join('\n')
    expect(all).toContain('K8:O')
    expect(all).toContain('[값]')
    expect(all).toContain('8개')
    const ps = wb.getWorksheet(SHEET_PASTE)!
    const row1 = line(p, 1).sourceRow
    expect((ps.getCell(`L${row1}`).value as Date).toISOString().slice(0, 10)).toBe('2026-04-15')
    expect(ps.getCell(`O${line(p, 2).sourceRow}`).value).toBe('기능안전팀\n홍길동 책임, 이몽룡 선임')
    expect(String(ps.getCell(`P${row1}`).value)).toContain('바뀜: 계획 종료')
    expect(ps.getCell(`C${row1}`).value).toBe(1) // 참고용 No. (원본과 같은 열)
    expect(ps.getCell('K6').value).toBe('Start') // 원본 머리글
  })

  it('칸 위치가 없는 옛 DIA면 안내 시트에 이유만', async () => {
    const q: Project = { ...p, docs: p.docs.map((d) => (d.dia ? { ...d, dia: { deliverables: d.dia.deliverables } } : d)) }
    const wb = await buildScheduleWorkbook(q, '2026-04-20', '2026-04-20', { includeTrace: false, includePaste: true })
    expect(String(wb.getWorksheet(SHEET_PASTE_GUIDE)!.getCell('B2').value)).toContain('다시 넣어')
    expect(wb.getWorksheet(SHEET_PASTE)).toBeUndefined()
  })
})
