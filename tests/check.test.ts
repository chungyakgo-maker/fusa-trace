import { describe, expect, it } from 'vitest'
import { demoProject, importInto, P } from './helpers'
import type { Project, SourceDoc, TraceItem } from '../src/core/model'
import { emptyReport } from '../src/core/model'
import { addDocument } from '../src/core/project'
import { newItem } from '../src/core/ids'
import { RULES, runChecks, type Finding } from '../src/core/check'

const C = '[기능안전]_검사'
const NOW = '2026-11-11T09:00:00.000Z'

function checkProject(fmea = `${C}_시스템 FMEA_R1.xlsx`): Project {
  let p = demoProject()
  for (const f of [`${C}_FSR_R1.xlsx`, `${C}_기술안전개념서(TSC)_R1.docx`, fmea, `${C}_SRS_v1.0.docx`]) p = importInto(p, f)
  return p
}
const ids = (fs: Finding[], rule: string): string[] => fs.filter((f) => f.ruleId === rule && f.itemId).map((f) => f.itemId)

describe('검사 규칙 C (검사용 가짜 문서)', () => {
  const r = runChecks(checkProject())
  const f = r.findings

  it('C-01 ID 중복: 다른 내용이면 오류, 같은 내용이면 지적 안 함', () => {
    expect(ids(f, 'C-01')).toEqual(['FSR.001.003 (중복 #1)'])
    expect(f.find((x) => x.ruleId === 'C-01')!.severity).toBe('오류')
  })

  it('C-02 없는 ID 참조: TSC·FMEA·SRS 각각 고칠 문서로, 미적용 TSR은 제외', () => {
    const c02 = f.filter((x) => x.ruleId === 'C-02')
    expect(c02.map((x) => [x.itemId, x.fixDoc]).sort()).toEqual([
      ['FS_SSR-900006', 'SRS'],
      ['TSR-CHK-SG001-004', 'TSC'],
      ['고장원인 (FMEA_SG001 6행)', 'FMEA']
    ])
    expect(ids(f, 'C-02')).not.toContain('TSR-CHK-SG001-006')
  })

  it('C-03 애매한 약식 표기: 끝 번호 후보가 서로 다른 ID일 때만 (같은 ID 중복 때문인 것은 C-01)', () => {
    const c03 = f.filter((x) => x.ruleId === 'C-03')
    expect(c03.map((x) => x.itemId)).toEqual(['FS_SSR-900005'])
    expect(c03[0].related).toEqual(['TSR-CHK-SG001-005', 'TSR-CHK-SG002-005'])
    expect(c03[0].severity).toBe('경고')
  })

  it('C-04 TSR이 없는 FSR: 자체·타 ECU로부터 받은 FSR은 걸리고, 타 ECU에 요구하는 FSR은 제외', () => {
    expect(ids(f, 'C-04').sort()).toEqual(['FSR.001.002', 'FSR.006.051'])
  })

  it('C-05 SSR이 없는 S/W TSR (H/W·일반·미적용 제외)', () => {
    expect(ids(f, 'C-05').sort()).toEqual(['TSR-CHK-SG001-002', 'TSR-CHK-SG001-004'])
  })

  it('C-06 FMEA 근거가 없는 TSR: 일반 TSR·미적용 TSR은 제외', () => {
    const c06 = ids(f, 'C-06')
    expect(c06).toContain('TSR-CHK-SG001-002')
    expect(c06).not.toContain('TSR-CHK-GEN-001')
    expect(c06).not.toContain('TSR-CHK-SG001-006')
    expect(c06).not.toContain('TSR-CHK-SG001-001')
  })

  it('C-07 / C-09: ASIL만 있으면 C-07, "Yes"인데 TSR 칸이 비면 C-09만, 안전 무관은 제외', () => {
    expect(ids(f, 'C-07')).toEqual(['FS_SSR-900002'])
    expect(ids(f, 'C-09')).toEqual(['FS_SSR-900003'])
  })

  it('C-08 TSR 연결이 없는 FMEA 고장원인: ASIL B만, QM은 제외', () => {
    expect(f.filter((x) => x.ruleId === 'C-08').map((x) => x.message)).toEqual(['고장원인 "TSR 연결이 빠진 고장 원인 (가짜)": ASIL B인데 TSR ID가 없습니다'])
  })

  it('K-04 Allocation 빈칸·해석 불가는 오류 (일반 TSR은 제외), HSR 미등록이면 참고 1건', () => {
    const k04 = f.filter((x) => x.ruleId === 'K-04' && x.itemId)
    expect(k04.map((x) => [x.itemId, x.severity])).toEqual([
      ['TSR-CHK-SG001-007', '오류'],
      ['TSR-CHK-SG001-008', '오류']
    ])
    expect(f.filter((x) => x.ruleId === 'K-04' && !x.itemId).map((x) => x.severity)).toEqual(['참고'])
  })

  it('지적마다 고칠 문서·파일·위치·근거 조항·지문', () => {
    for (const x of f.filter((y) => y.itemId)) {
      expect(x.fixDoc, x.message).not.toBe('')
      expect(x.fixFile, x.message).toMatch(/\((R1|V1\.0)\)$/i)
      expect(x.location, x.message).not.toBe('')
      expect(x.clause, x.message).toMatch(/^Part \d/)
      expect(x.fingerprint.startsWith(x.ruleId)).toBe(true)
    }
    const tsc = f.find((x) => x.itemId === 'TSR-CHK-SG001-004' && x.ruleId === 'C-02')!
    expect(tsc.location).toBe('4번째 TSR 표 (표 4) · 4.4 TSR-CHK-SG001-004')
    expect(new Set(f.map((x) => x.fingerprint)).size).toBe(f.length)
  })

  it('정렬: 오류 → 경고 → 참고, 같은 문서를 넣으면 항상 같은 결과', () => {
    const order = f.map((x) => ['오류', '경고', '참고'].indexOf(x.severity))
    expect(order).toEqual([...order].sort((a, b) => a - b))
    const again = runChecks(checkProject()).findings
    expect(again.map((x) => x.fingerprint)).toEqual(f.map((x) => x.fingerprint))
    expect(r.counts).toEqual({ 오류: 10, 경고: 11, 참고: 2 })
  })

  it('규칙표: 모든 규칙에 근거 조항', () => {
    for (const rule of RULES) expect(rule.clause).toMatch(/Part \d+ Clause \d+/)
  })
})

describe('문서 미등록·옛 양식: 항목마다 지적하지 않고 참고 1건', () => {
  it('FSR만 넣으면: TSC 미등록 참고 1건', () => {
    const p = importInto(demoProject(), `${C}_FSR_R1.xlsx`)
    const r = runChecks(p)
    expect(r.findings.filter((x) => x.ruleId === 'C-04').map((x) => [x.severity, x.message])).toEqual([['참고', 'TSC 미등록 — FSR → TSR 연결 검사(C-04) 생략']])
  })
  it('TSR ID 칸이 없는 옛 FMEA: C-06·C-08 생략 + 참고 1건', () => {
    const r = runChecks(checkProject(`${C}_시스템 FMEA_구양식_R0.xlsx`))
    expect(r.findings.filter((x) => x.ruleId === 'C-06').map((x) => x.severity)).toEqual(['참고'])
    expect(r.findings.some((x) => x.ruleId === 'C-08')).toBe(false)
  })
  it('SRS 미등록: C-05·C-07·C-09 대신 참고 1건', () => {
    let p = demoProject()
    for (const f of [`${C}_FSR_R1.xlsx`, `${C}_기술안전개념서(TSC)_R1.docx`]) p = importInto(p, f)
    const r = runChecks(p)
    expect(r.findings.filter((x) => x.ruleId === 'C-05').map((x) => x.severity)).toEqual(['참고'])
  })
})

/** 칸 지정으로 읽는 문서(HSR·SW 시험 명세)는 항목을 직접 만들어 넣음 */
function addItems(p: Project, kind: 'HSR' | 'SWTEST', items: TraceItem[], name: string): Project {
  const doc: SourceDoc = { id: name, kind, fileName: name, normName: name, version: 'R1', importedAt: NOW, hash: name, size: 1, active: true, report: emptyReport(), items }
  return addDocument(p, doc, NOW)
}

describe('C-10 · C-11 · C-12 · K-04(HSR)', () => {
  let p = checkProject()
  p = addItems(
    p,
    'HSR',
    [
      newItem({ kind: 'HSR', rawId: 'HSR-1', location: 'HW 1행', refs: ['TSR-CHK-SG001-003'], refRaw: 'TSR-CHK-SG001-003' }),
      newItem({ kind: 'HSR', rawId: 'HSR-2', location: 'HW 2행', refs: [], refRaw: '' }),
      newItem({ kind: 'HSR', rawId: 'HSR-3', location: 'HW 3행', refs: [], refRaw: '', status: 'notApplicable', statusRaw: 'N/A' })
    ],
    '[기능안전]_검사_HSR_R1.xlsx'
  )
  p = addItems(
    p,
    'SWTEST',
    [
      newItem({ kind: 'SWTEST', rawId: 'SWT-1', location: '표 1 2행', refs: ['FS_SSR-900001'], refRaw: 'FS_SSR-900001' }),
      newItem({ kind: 'SWTEST', rawId: 'SWT-2', location: '표 1 3행', refs: [], refRaw: '' })
    ],
    '[기능안전]_검사_SW 시험 명세_R1.docx'
  )
  const f = runChecks(p).findings

  it('C-10 시험이 없는 안전 관련 SSR (SSR-900001은 시험 있음)', () => {
    const c10 = ids(f, 'C-10')
    expect(c10).not.toContain('FS_SSR-900001')
    expect(c10).toContain('FS_SSR-900007')
    expect(c10).not.toContain('FS_SSR-900004') // 안전 무관
  })
  it('C-11 TSR 연결이 없는 HSR (대상 아님은 제외)', () => {
    expect(ids(f, 'C-11')).toEqual(['HSR-2'])
  })
  it('C-12 검증 대상이 없는 SW 시험', () => {
    expect(ids(f, 'C-12')).toEqual(['SWT-2'])
  })
  it('K-04: H/W TSR에 HSR이 있으면 통과, HSR 등록 후에는 참고 대신 항목별', () => {
    expect(f.some((x) => x.ruleId === 'K-04' && x.itemId === 'TSR-CHK-SG001-003')).toBe(false)
    expect(f.some((x) => x.ruleId === 'K-04' && !x.itemId)).toBe(false)
  })
})

describe('데모 가짜 문서 (FSR + TSC + FMEA + SRS)', () => {
  let p = demoProject()
  for (const f of [`${P}_FSR_R01.xlsx`, `${P}_기술안전개념서(TSC)_R1.docx`, `${P}_시스템 FMEA_R1.xlsx`, `${P}_SRS_v1.5.docx`]) p = importInto(p, f)
  const r = runChecks(p)
  it('추적성 화면과 같은 문제를 규칙으로: 누락 FSR, 없는 FSR, ID 중복, SSR 없음', () => {
    expect(ids(r.findings, 'C-04')).toContain('FSR.001.011')
    expect(r.findings.some((x) => x.ruleId === 'C-02' && x.message.includes('FSR.001.099'))).toBe(true)
    expect(ids(r.findings, 'C-01')).toContain('TSR-CTL-SG001-012 (중복 #1)')
    expect(ids(r.findings, 'C-05').length).toBeGreaterThan(0)
    expect(r.counts.오류).toBeGreaterThan(0)
  })
})


describe('검사 리포트 엑셀 (시트 1 요약, 시트 2 지적 목록)', async () => {
  const ExcelJS = (await import('exceljs')).default
  const { buildCheckReport, checkReportFileName, SHEET_FINDINGS, SHEET_SUMMARY } = await import('../src/core/checkReport')
  const p = checkProject()
  const wb = await buildCheckReport(p, new Date(2026, 10, 11, 9, 5), '0.9.0')
  it('파일 이름: <프로젝트>_검사리포트_YYYYMMDD_HHMM', () => {
    expect(checkReportFileName('데모 차종 · CTL', new Date(2026, 10, 11, 9, 5))).toBe('데모 차종 · CTL_검사리포트_20261111_0905.xlsx')
  })
  it('요약: 검사에 쓴 문서, 심각도·규칙·문서별 건수', () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual([SHEET_SUMMARY, SHEET_FINDINGS])
    const text: string[] = []
    wb.getWorksheet(SHEET_SUMMARY)!.eachRow((row) => row.eachCell((c) => text.push(String(c.value))))
    const all = text.join('|')
    expect(all).toContain('v0.9.0')
    expect(all).toContain('[기능안전]_검사_기술안전개념서(TSC)_R1.docx')
    expect(all).toContain('오류 10 · 경고 11 · 참고 2')
    expect(all).toContain('C-04|TSR이 없는 FSR|오류|2')
  })
  it('지적 목록: 열, 정렬, 심각도 색 + 글자, 조치 빈칸', () => {
    const ws = wb.getWorksheet(SHEET_FINDINGS)!
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(['No', '심각도', '규칙 ID', '규칙 이름', '고칠 문서', '항목 ID', '관련 항목', '내용', '위치', '근거 조항', '조치'])
    expect(ws.rowCount).toBe(1 + 23)
    expect(ws.getCell('B2').value).toBe('오류')
    expect((ws.getCell('B2').fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFDEEE3')
    expect(ws.getCell('K2').value ?? '').toBe('')
    expect(String(ws.getCell('I2').value)).toMatch(/\(R1\) · |\(V1\.0\) · /)
    void ExcelJS
  })
})
