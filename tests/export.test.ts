import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { P, demoProject, importInto } from './helpers'
import { LIST_HEADERS, SHEET_LIST, SHEET_OWNERS, buildScheduleXlsx, exportFileName } from '../src/core/export'

const TODAY = '2026-05-15'

async function exported() {
  let p = importInto(demoProject(), `${P}_DIA_R1.xlsx`)
  p = importInto(p, `${P}_(TSC) Verification Report_R1.xls`)
  const bytes = await buildScheduleXlsx(p, TODAY, '2026-05-16')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer)
  return wb
}

const findRow = (ws: ExcelJS.Worksheet, pred: (r: ExcelJS.Row) => boolean): ExcelJS.Row => {
  let found: ExcelJS.Row | undefined
  ws.eachRow((r) => {
    if (!found && pred(r)) found = r
  })
  if (!found) throw new Error('행 없음')
  return found
}

describe('엑셀 출력 (SPEC §10)', () => {
  it('파일명: <프로젝트>_산출물작성리스트_YYYYMMDD.xlsx (파일명에 못 쓰는 글자 바꿈)', () => {
    expect(exportFileName('데모 차종 · CTL', '2026-05-16')).toBe('데모 차종 · CTL_산출물작성리스트_20260516.xlsx')
    expect(exportFileName('A/B:C', '2026-05-16')).toBe('A_B_C_산출물작성리스트_20260516.xlsx')
  })

  it('시트 1 머리말·요약·표 머리글', async () => {
    const ws = (await exported()).getWorksheet(SHEET_LIST)!
    expect(ws.getCell('B2').value).toBe('데모 차종 · CTL')
    expect(ws.getCell('B3').value).toBe('2026-05-16')
    expect(String(ws.getCell('B4').value)).toBe('전체 22 · 완료 1 · 진행 5 · 지연 5 · 미착수 11 · 일정 미기재 5')
    expect(ws.getRow(6).values).toEqual([undefined, ...LIST_HEADERS])
  })

  it('DIA 순서, 한 행의 여러 파일은 하위 줄(└), N/A 행 제외', async () => {
    const ws = (await exported()).getWorksheet(SHEET_LIST)!
    const nos: number[] = []
    ws.eachRow((r, i) => {
      if (i > 6) nos.push(Number(r.getCell(1).value))
    })
    expect(nos).toHaveLength(22)
    expect(nos).not.toContain(3)
    expect(nos).toEqual([...nos].sort((a, b) => a - b))
    const sub = findRow(ws, (r) => String(r.getCell(3).value).startsWith('└') && r.getCell(1).value === 6)
    expect(String(sub.getCell(3).value)).toBe('└ System safety analysis [DFA]')
  })

  it('담당자 모두 표시, 빈칸은 담당 미지정', async () => {
    const ws = (await exported()).getWorksheet(SHEET_LIST)!
    expect(findRow(ws, (r) => r.getCell(1).value === 5).getCell(7).value).toBe('이영희 책임, 박민수 선임')
    const hsr = findRow(ws, (r) => r.getCell(1).value === 8)
    expect([hsr.getCell(6).value, hsr.getCell(7).value]).toEqual(['담당 미지정', '담당 미지정'])
  })

  it('날짜는 엑셀 날짜, 상태·VR·비고', async () => {
    const ws = (await exported()).getWorksheet(SHEET_LIST)!
    const tscVr = findRow(ws, (r) => String(r.getCell(3).value).includes('[TSC VR]'))
    expect((tscVr.getCell(8).value as Date).toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(tscVr.getCell(8).numFmt).toBe('yyyy-mm-dd')
    expect(tscVr.getCell(12).value).toBe('진행')
    expect(tscVr.getCell(14).value).toBe('O')
    expect(String(tscVr.getCell(5).value)).toContain('Verification Report_R1.xls (R1,')
    const fmeda = findRow(ws, (r) => String(r.getCell(3).value).includes('[FMEDA]'))
    expect(fmeda.getCell(12).value).toBe('미착수 · 일정 미기재')
    const hsi = findRow(ws, (r) => String(r.getCell(3).value).includes('[HSI]'))
    expect(String(hsi.getCell(15).value)).toContain("날짜 형식 오류: '2026-06-'")
    const tsc = findRow(ws, (r) => String(r.getCell(3).value).includes('[TSC]'))
    expect(String(tsc.getCell(15).value)).toContain('FMEDA 대체')
  })

  it('서식: 상태 색(완료 초록·지연 주황), 미등록 회색, 틀 고정, 자동 필터, 가로 인쇄 한 페이지 너비', async () => {
    const ws = (await exported()).getWorksheet(SHEET_LIST)!
    const fill = (c: ExcelJS.Cell) => (c.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb
    expect(fill(findRow(ws, (r) => r.getCell(12).value === '완료').getCell(12))).toBe('FFE6F4EC')
    expect(fill(findRow(ws, (r) => r.getCell(12).value === '지연').getCell(12))).toBe('FFFDEEE3')
    expect(fill(findRow(ws, (r) => r.getCell(5).value === '미등록').getCell(5))).toBe('FFEEF0F3')
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 6 })
    expect(ws.autoFilter).toBeTruthy()
    expect(ws.pageSetup).toMatchObject({ orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 })
    expect(ws.getColumn(3).width).toBeGreaterThan(10)
  })

  it('시트 2 담당자별 요약: 지연 많은 순', async () => {
    const os = (await exported()).getWorksheet(SHEET_OWNERS)!
    expect(os.getRow(1).values).toEqual([undefined, '담당자', '팀', '전체', '완료', '진행', '지연', '미착수'])
    const delayed: number[] = []
    os.eachRow((r, i) => {
      if (i > 1) delayed.push(Number(r.getCell(6).value))
    })
    expect(delayed).toEqual([...delayed].sort((a, b) => b - a))
    expect(delayed.length).toBeGreaterThan(5)
  })
})
