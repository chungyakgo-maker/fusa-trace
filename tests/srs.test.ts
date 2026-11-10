import { describe, expect, it } from 'vitest'
import { P, readFixture } from './helpers'

const r = readFixture(`${P}_SRS_v1.5.docx`)
const items = r.items!
const ssr = (k: number) => items.find((i) => i.rawId === `FS_SSR-${100000 + k}`)!

describe('SRS 읽기 (FORMATS §11, §9 SRS)', () => {
  it('종류 판별 = SRS, Item | Description 표 50개 이상, 버전은 파일명', () => {
    expect(r.kind).toBe('SRS')
    expect(r.version).toBe('V1.5')
    expect(items.length).toBe(52)
  })

  it('키 이름 변형 (Detailed Requirements / Requirement Description, FTTI / FRTI, Higher-Level)', () => {
    expect(ssr(1).attrs).toMatchObject({ '요구 내용': expect.stringContaining('입력 1'), FTTI: '100ms', '상위 요구': 'SYS-REQ-001' })
    expect(ssr(2).attrs).toMatchObject({ '요구 내용': expect.stringContaining('입력 2'), FTTI: '100ms', '상위 요구': 'SYS-REQ-002' })
    expect(ssr(1).title).toBe('가짜 SW 안전 요구 1')
    expect(ssr(1).element).toBe('Element 3 [MCU SW]')
  })

  it('No separate identifier assigned, 빈 ID 표 → 건너뜀 + 이유', () => {
    expect(r.report.skipped).toHaveLength(3)
    expect(r.report.skipped[0].message).toContain('No separate identifier assigned')
    expect(items.some((i) => /no separate/i.test(i.rawId))).toBe(false)
  })

  it('Functional Safety Related 값 변형', () => {
    expect(ssr(1).refs).toEqual(['TSR-017', 'TSR-037'])
    expect(ssr(2).refs).toEqual(['TSR-017', 'TSR-018'])
    expect(ssr(3)).toMatchObject({ refs: [], attrs: expect.objectContaining({ 안전관련: 'yes' }) })
    expect(ssr(4).attrs['안전관련']).toBe('no')
    expect(ssr(9).attrs['안전관련']).toBe('no')
    expect(ssr(10).attrs['안전관련']).toBe('no')
    expect(ssr(7).refs).toEqual(['CUST_CTL_TSR_018'])
  })

  it('Yes인데 TSR 없음 → 경고', () => {
    expect(r.report.warnings.map((w) => w.message)).toEqual(['FS_SSR-100003: Functional Safety Related가 Yes인데 TSR이 적혀 있지 않습니다'])
  })

  it('참조 문서 표는 무시', () => {
    expect(JSON.stringify(items)).not.toContain('CodeBeamer')
  })
})
