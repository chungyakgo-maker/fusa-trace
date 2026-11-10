import { describe, expect, it } from 'vitest'
import { P, readFixture } from './helpers'

const r = readFixture(`${P}_시스템 FMEA_R1.xlsx`)
const causes = r.items!
const at = (sheet: string, row: number) => causes.find((c) => c.rawId === `${sheet}#${row}`)!

describe('FMEA 읽기 (FORMATS §10, §9 FMEA)', () => {
  it('종류 판별 = FMEA, 고장원인 시트 2장, 작성 예제·이력·구조 시트는 무시', () => {
    expect(r.kind).toBe('FMEA')
    expect(r.meta).toEqual({ tsrColumn: 'yes' })
    expect(r.report.counts['고장원인']).toBe(35)
    expect(causes.some((c) => c.refs.includes('TSR-EX-001'))).toBe(false)
    expect(r.report.notes.join()).toContain("'작성 예제' 시트")
  })

  it('영문 줄 + 한글 줄: TSR ID(공백 2개)·ASIL은 한글 줄에만 있어도 찾음', () => {
    expect(at('FMEA_SG001', 7)).toMatchObject({ refs: ['TSR-CTL-SG001-003'], asil: 'B' })
    expect(at('FMEA_SG001', 9)).toMatchObject({ asil: 'B(D)', asilLevel: 'B' })
  })

  it('데이터 칸의 "…고장 원인…" 문장을 헤더로 착각하지 않음', () => {
    expect(at('FMEA_SG001', 5).title).toBe('하위 요소 고장 원인 1 (가짜)')
  })

  it('요소: 하위 요소 칸 첫 줄, ↑는 위 값으로 채움', () => {
    expect(at('FMEA_SG001', 5).element).toBe('Signal Input (Element 2)')
    expect(at('FMEA_SG001', 7).element).toBe('Power Control (Element 1)')
    expect(at('FMEA_SG001', 5).attrs['고장 모드']).toBe('고장 모드 1 (가짜)')
    expect(at('FMEA_SG001', 5).attrs.AP).toBe('H')
  })

  it('TSR ID 셀이 줄바꿈으로 시작, 여러 줄', () => {
    expect(at('FMEA_SG001', 8).refs).toEqual(['TSR-CTL-SG001-004', 'TSR-CTL-SG001-005'])
  })

  it('약식·변형 표기는 원문 그대로 보관 (해석은 연결 단계에서)', () => {
    expect(at('FMEA_SG001', 21).refs).toEqual(['CUST_CTL_TSR_017'])
    expect(at('FMEA_SG001', 6).refs).toEqual(['CUST_CTL_SG001_TSR_002'])
  })

  it('N/A 고장원인 → 건너뜀 (대상 아님)', () => {
    expect(r.report.skipped).toEqual([
      expect.objectContaining({ where: 'FMEA_SG001 29행', message: expect.stringContaining('N/A') }),
      expect.objectContaining({ where: 'FMEA_SG002 14행' })
    ])
  })

  it('ASIL B인데 TSR ID 없는 행 → 경고 (역방향 확인 대상)', () => {
    expect(at('FMEA_SG001', 30)).toMatchObject({ asil: 'B', refs: [] })
    expect(r.report.warnings[0].message).toContain('2개')
  })
})

describe('TSR 칸이 없는 옛 양식', () => {
  const old = readFixture(`${P}_시스템 FMEA_구양식_R0.xlsx`)
  it('작성 여부만 관리', () => {
    expect(old.kind).toBe('FMEA')
    expect(old.meta).toEqual({ tsrColumn: 'no' })
    expect(old.report.notes.join()).toContain('TSR 연결 칸 없음')
    expect(old.items!.every((c) => c.refs.length === 0)).toBe(true)
  })
})
