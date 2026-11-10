import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { P, demoProject, importInto } from './helpers'
import { computeSystemTrace, pendingCount } from '../src/core/trace'
import { computeSoftwareTrace } from '../src/core/software'
import { buildTraceMap } from '../src/core/traceMap'
import { buildSoftwareMap, NO_TSR_BLOCK } from '../src/core/softwareMap'
import { collectTraceIssues } from '../src/core/issues'
import { buildScheduleXlsx, SHEET_TRACE } from '../src/core/export'

let p = importInto(demoProject(), `${P}_FSR_R01.xlsx`)
p = importInto(p, `${P}_기술안전개념서(TSC)_R1.docx`)
p = importInto(p, `${P}_시스템 FMEA_R1.xlsx`)
p = importInto(p, `${P}_SRS_v1.5.docx`)
const sys = computeSystemTrace(p)
const sw = computeSoftwareTrace(p)
const tsr = (id: string, dup = 1) => sys.tsrs.find((t) => t.item.rawId === id && t.item.dupIndex === dup)!
const swTsr = (id: string, dup = 1) => sw.tsrs.find((t) => t.item.rawId === id && t.item.dupIndex === dup)!
const ssr = (k: number) => sw.ssrs.find((s) => s.item.rawId === `FS_SSR-${100000 + k}`)!

describe('FMEA 근거 (시스템 탭)', () => {
  it('정규화(_ → -)·약식 표기(끝 번호, SG 확인)로 연결', () => {
    expect(tsr('TSR-CTL-SG001-001')).toMatchObject({ status: '연결됨' }) // TSR_CTL_SG001_001
    expect(tsr('TSR-CTL-SG001-001').causes[0].method).toBe('normalized')
    expect(tsr('TSR-CTL-SG001-006').causes[0].method).toBe('tail') // CUST_CTL_SG001_TSR_006
    expect(tsr('TSR-CTL-SG001-017').causes[0].method).toBe('tail') // CUST_CTL_TSR_017 (후보 1개)
    expect(tsr('TSR-CTL-SG002-004').causes[0].method).toBe('tail') // CUST_CTL_SG002_TSR_004
  })

  it('후보 여러 개 / 대상 ID 중복 → 확인 필요', () => {
    expect(tsr('TSR-CTL-SG002-009').status).toBe('확인 필요') // CUST_CTL_TSR_009 → SG001-009, SG002-009
    expect(tsr('TSR-CTL-SG001-009').status).toBe('연결됨') // 다른 고장원인이 정확히 가리킴
    expect(tsr('TSR-CTL-SG001-012', 1).status).toBe('확인 필요') // 중복 ID
    expect(tsr('TSR-CTL-SG001-015', 3).status).toBe('확인 필요')
    expect(tsr('TSR-CTL-SG001-026').status).toBe('확인 필요') // CUST_CTL_SG001_TSR_026 → SG001-026, DOOR-026
  })

  it('FMEA 근거 없음 = 누락, 일반·미적용 = 대상 아님', () => {
    expect(tsr('TSR-CTL-SG001-029')).toMatchObject({ status: '누락', reason: 'FMEA 근거 없음' })
    expect(tsr('TSR-CTL-SG002-010').status).toBe('누락')
    expect(tsr('TSR-CTL-GEN-001').status).toBe('대상 아님')
    expect(tsr('TSR-CTL-SG001-020').status).toBe('대상 아님')
  })

  it('단계 카드: FMEA 근거 27 / 40', () => {
    // 손으로 셈: 대상 TSR 40 (SG001 32줄 − 미적용 3 + SG002 10 + DOOR 1), 연결됨 SG001 20 + SG002 7
    expect(sys.cards[2]).toEqual({ label: 'FMEA 근거', linked: 27, total: 40 })
  })

  it('역방향: ASIL이 있는데 TSR 연결이 없는 고장원인', () => {
    const rev = sys.causes.filter((c) => c.problems.some((x) => x.includes('TSR 연결 없음')))
    expect(rev.map((c) => c.item.rawId)).toEqual(['FMEA_SG001#30', 'FMEA_SG002#15'])
  })

  it('TSR 칸 없는 옛 FMEA만 있으면 작성 여부만 (문서 대기)', () => {
    let q = importInto(demoProject(), `${P}_FSR_R01.xlsx`)
    q = importInto(q, `${P}_기술안전개념서(TSC)_R1.docx`)
    q = importInto(q, `${P}_시스템 FMEA_구양식_R0.xlsx`)
    const t = computeSystemTrace(q)
    expect(t.fmeaNoTsrColumn).toBe(true)
    expect(t.cards[2].pending).toContain('TSR 연결 칸 없음')
    expect(t.tsrs.find((x) => x.item.rawId === 'TSR-CTL-SG001-001')?.reason).toContain('TSR 연결 칸 없음')
  })
})

describe('소프트웨어 탭 (TSR(S/W) → SSR)', () => {
  it('약식 TSR-017, <고객>_<제품>_TSR_018 → 끝 번호로 연결 (완료 기준)', () => {
    expect(ssr(1).refs[0]).toMatchObject({ ref: 'TSR-017', method: 'tail' })
    expect(ssr(1).refs[0].targets[0].rawId).toBe('TSR-CTL-SG001-017')
    expect(ssr(7).refs[0]).toMatchObject({ ref: 'CUST_CTL_TSR_018', method: 'tail' })
    expect(ssr(7).refs[0].targets[0].rawId).toBe('TSR-CTL-SG001-018')
  })

  it('후보 여러 개면 확인 필요 (완료 기준), 약식이 중복 ID를 가리켜도 확인 필요', () => {
    expect(ssr(6).refs[0]).toMatchObject({ ref: 'TSR-005', method: 'ambiguous' })
    expect(ssr(6).refs[0].targets.map((t) => t.rawId)).toEqual(['TSR-CTL-SG001-005', 'TSR-CTL-SG002-005'])
    expect(ssr(5).refs[0]).toMatchObject({ ref: 'TSR-012', method: 'ambiguous', reason: expect.stringContaining('중복') })
  })

  it('SSR 문제: 없는 ID, Yes인데 TSR 없음, ASIL인데 TSR 없음', () => {
    expect(ssr(1).problems).toEqual(['없는 TSR 참조: TSR-037'])
    expect(ssr(3).problems).toEqual(['Functional Safety Related가 Yes인데 TSR 없음'])
    expect(ssr(4).problems).toEqual(['ASIL B인데 TSR 연결 없음'])
    expect(ssr(9).problems).toEqual([])
    expect(ssr(9).status).toBe('대상 아님')
  })

  it('S/W 할당 TSR 상태: 연결됨 / 확인 필요(중복) / 누락 / 대상 아님', () => {
    expect(swTsr('TSR-CTL-SG001-001').status).toBe('연결됨')
    expect(swTsr('TSR-CTL-SG001-015', 2).status).toBe('확인 필요')
    expect(swTsr('TSR-CTL-SG001-016')).toMatchObject({ status: '누락', reason: 'SSR 없음' })
    expect(swTsr('TSR-CTL-GEN-003').status).toBe('누락')
    expect(swTsr('TSR-CTL-SG001-020').status).toBe('대상 아님')
    expect(sw.tsrs.some((t) => t.item.rawId === 'TSR-CTL-SG001-002')).toBe(false) // H/W 할당은 제외
  })

  it('단계 카드: S/W 할당 TSR 30, SSR 연결 22 / 28', () => {
    expect(sw.cards[0]).toEqual({ label: 'S/W 할당 TSR', count: 30 })
    expect(sw.cards[1]).toEqual({ label: 'SSR 연결', linked: 22, total: 28 })
  })
})

describe('ID 대응표 (TSC·FMEA·SRS 참조 모두)', () => {
  it('사람이 골라야 하는 건수 = 문서 종류별 같은 참조 1건', () => {
    // TSC 1 (FSR.001.099) + FMEA 6 (애매한 약식·중복) + SRS 4 (TSR-037, TSR-012, TSR-005, SG001-015)
    expect(pendingCount([...sys.links, ...sw.links])).toBe(11)
  })

  it('별칭은 문서 종류별로 기억', () => {
    const q = { ...p, aliases: [{ sourceKind: 'SRS' as const, ref: 'TSR-005', target: 'TSR-CTL-SG002-005', createdAt: '' }] }
    const s2 = computeSoftwareTrace(q)
    expect(s2.ssrs.find((s) => s.item.rawId === 'FS_SSR-100006')?.refs[0].method).toBe('alias')
    // FMEA의 같은 글자 참조에는 영향 없음
    expect(computeSystemTrace(q).tsrs.find((t) => t.item.rawId === 'TSR-CTL-SG002-009')?.status).toBe('확인 필요')
  })
})

describe('지도 (M4)', () => {
  it('시스템 지도 FMEA 근거 열: 요소별 고장원인 모음 카드 + "FMEA 근거 없음"', () => {
    const l = buildTraceMap(sys, { sg: 'all', expanded: new Set(), expandAll: true })
    const clusters = l.nodes.filter((n) => n.kind === 'cluster')
    expect(clusters.map((n) => n.title).sort()).toContain('Power Control (Element 1)')
    expect(clusters.every((n) => /^고장원인 \d+건$/.test(n.sub))).toBe(true)
    const ghost = l.nodes.find((n) => n.id === 'ghost-fmea:TSR:TSR-CTL-SG001-029#1')
    expect(ghost).toMatchObject({ title: 'FMEA 근거 없음', col: 3 })
    expect(l.nodes.some((n) => n.kind === 'placeholder' && n.col === 3)).toBe(false)
  })

  it('소프트웨어 지도: TSR(S/W) → SSR, SSR 없음·없는 TSR·TSR 미기재 빈 카드', () => {
    const l = buildSoftwareMap(sw, { sg: 'all', expanded: new Set(), expandAll: false })
    expect(l.columns.map((c) => c.label)).toEqual(['TSR (S/W)', 'SSR', 'SW 요구사항 시험'])
    expect(l.nodes.some((n) => n.title === 'SSR 없음')).toBe(true)
    expect(l.nodes.some((n) => n.title === 'TSR-037 없음')).toBe(true)
    expect(l.nodes.filter((n) => n.title === 'TSR 미기재')).toHaveLength(2) // Yes인데 없음, ASIL인데 없음
    expect(l.blocks.map((b) => b.key)).toContain(NO_TSR_BLOCK)
    expect(l.nodes.some((n) => n.kind === 'group')).toBe(true)
    // H/W TSR을 가리키는 SSR → 그 TSR도 회색으로
    expect(l.nodes.find((n) => n.title === 'TSR-CTL-SG001-017')?.tone).toBe('na')
    const full = buildSoftwareMap(sw, { sg: 'all', expanded: new Set(), expandAll: true })
    expect(full.nodes.some((n) => n.kind === 'group')).toBe(false)
  })
})

describe('엑셀 시트 3 "추적성 누락"', () => {
  it('누락·확인 필요 목록 (단계, 항목 ID, 제목, 문제 종류, 출처 문서)', async () => {
    const issues = collectTraceIssues(sys, sw)
    expect(issues.find((i) => i.id === 'FSR.001.011')).toMatchObject({ stage: 'FSR → TSR', problem: '누락: TSR 없음' })
    expect(issues.find((i) => i.stage === 'TSR → FMEA 근거' && i.id === 'TSR-CTL-SG001-029')?.problem).toBe('누락: FMEA 근거 없음')
    expect(issues.find((i) => i.stage === '역방향: SSR' && i.id === 'FS_SSR-100003')?.problem).toContain('Yes인데')
    expect(issues.find((i) => i.id === 'FSR.001.011')?.source).toContain('FSR_R01.xlsx')

    const with3 = new ExcelJS.Workbook()
    await with3.xlsx.load(Buffer.from(await buildScheduleXlsx(importInto(p, `${P}_DIA_R1.xlsx`), '2026-05-15', '2026-05-16', { includeTrace: true })) as unknown as ExcelJS.Buffer)
    expect(with3.worksheets.map((w) => w.name)).toEqual(['작성 리스트', '담당자별 요약', SHEET_TRACE])
    expect(with3.getWorksheet(SHEET_TRACE)!.rowCount).toBe(issues.length + 1)
    const without = new ExcelJS.Workbook()
    await without.xlsx.load(Buffer.from(await buildScheduleXlsx(p, '2026-05-15', '2026-05-16')) as unknown as ExcelJS.Buffer)
    expect(without.worksheets).toHaveLength(2)
  })
})
