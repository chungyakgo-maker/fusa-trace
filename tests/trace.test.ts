import { describe, expect, it } from 'vitest'
import { P, demoProject, importInto } from './helpers'
import { computeSystemTrace, pendingCount, reviewLinks } from '../src/core/trace'
import { activeDocs, diffItems } from '../src/core/project'

const base = importInto(importInto(demoProject(), `${P}_FSR_R01.xlsx`), `${P}_기술안전개념서(TSC)_R1.docx`)
const t = computeSystemTrace(base)
const fsr = (id: string) => t.fsrs.find((f) => f.item.rawId === id)!
const tsr = (id: string, dup = 1) => t.tsrs.find((x) => x.item.rawId === id && x.item.dupIndex === dup)!

describe('시스템 추적성 (SPEC §8)', () => {
  it('TSR이 없는 FSR → 누락 (TSR 없음)', () => {
    expect(fsr('FSR.001.011')).toMatchObject({ status: '누락', reason: 'TSR 없음' })
  })

  it('타 ECU에 요구하는 FSR → 대상 아님', () => {
    expect(fsr('FSR.002.090').status).toBe('대상 아님')
  })

  it('연결됨: 여러 TSR (1:N), 여러 FSR을 가리키는 TSR (N:1), 타 ECU로부터 받은 FSR', () => {
    expect(fsr('FSR.001.010')).toMatchObject({ status: '연결됨' })
    expect(fsr('FSR.001.010').tsrs.map((x) => x.tsr.rawId)).toEqual(['TSR-CTL-SG001-003', 'TSR-CTL-SG001-010', 'TSR-CTL-SG001-020'])
    expect(fsr('FSR.001.009').tsrs.map((x) => x.tsr.rawId)).toContain('TSR-CTL-SG001-002')
    expect(fsr('FSR.006.051').status).toBe('연결됨')
  })

  it('ID 중복 TSR은 두 개 모두 FSR에 연결 (지도에서 같은 ID 카드 2개)', () => {
    expect(fsr('FSR.001.002').tsrs.filter((x) => x.tsr.rawId === 'TSR-CTL-SG001-012')).toHaveLength(2)
    expect(tsr('TSR-CTL-SG001-012', 2).problems).toContain('ID 중복 (#2/2)')
  })

  it('없는 FSR ID를 가리키는 TSR (역방향 확인)', () => {
    expect(tsr('TSR-CTL-SG001-029').problems).toEqual(['없는 FSR 참조: FSR.001.099'])
  })

  it('TSR의 다음 단계(FMEA 근거): 일반 요구·미적용은 대상 아님, 그 외 FMEA 미등록이면 문서 대기', () => {
    expect(tsr('TSR-CTL-GEN-001')).toMatchObject({ status: '대상 아님', reason: expect.stringContaining('일반') })
    expect(tsr('TSR-CTL-SG001-020').status).toBe('대상 아님')
    expect(tsr('TSR-CTL-SG001-001')).toMatchObject({ status: '문서 대기', reason: 'FMEA 미등록' })
  })

  it('단계 카드: FSR 수, TSR 연결 n/대상 FSR, FMEA·통합 시험은 자리', () => {
    expect(t.cards[0]).toEqual({ label: 'FSR', count: 23 })
    expect(t.cards[1]).toEqual({ label: 'TSR 연결', linked: 21, total: 22 })
    expect(t.cards[2].pending).toBe('FMEA 미등록')
    expect(t.cards[3].pending).toContain('자리')
  })

  it('ID 대응표: 없는 ID 1건', () => {
    expect(pendingCount(t)).toBe(1)
    expect(reviewLinks(t).map((l) => `${l.from.rawId}→${l.resolution.ref}:${l.resolution.method}`)).toEqual(['TSR-CTL-SG001-029→FSR.001.099:missing'])
  })

  it('사람이 고르면(별칭) 연결되고, TSC 새 버전에서도 유지', () => {
    const withAlias = { ...base, aliases: [{ sourceKind: 'TSC' as const, ref: 'FSR.001.099', target: 'FSR.001.011', createdAt: '' }] }
    const t2 = computeSystemTrace(withAlias)
    expect(t2.fsrs.find((f) => f.item.rawId === 'FSR.001.011')).toMatchObject({ status: '연결됨' })
    expect(pendingCount(t2)).toBe(0)
    const next = importInto(withAlias, `${P}_기술안전개념서(TSC)_R2.docx`, undefined, '2026-05-20T00:00:00.000Z')
    expect(computeSystemTrace(next).fsrs.find((f) => f.item.rawId === 'FSR.001.011')?.status).toBe('연결됨')
  })

  it('문서가 없으면 문서 대기', () => {
    const onlyFsr = importInto(demoProject(), `${P}_FSR_R01.xlsx`)
    const t3 = computeSystemTrace(onlyFsr)
    expect(t3.fsrs.every((f) => f.status === '문서 대기' || f.status === '대상 아님')).toBe(true)
    expect(t3.cards[1].pending).toBe('TSC 미등록')
  })
})

describe('TSC 개정 비교 (R1 → R2)', () => {
  it('추가·삭제·변경', () => {
    const next = importInto(base, `${P}_기술안전개념서(TSC)_R2.docx`, undefined, '2026-05-20T00:00:00.000Z')
    const [r1, r2] = next.docs.filter((d) => d.kind === 'TSC')
    expect([r1.active, r2.active]).toEqual([false, true])
    const diff = diffItems(r1.items!, r2.items!)
    expect(diff.added.map((a) => a.label)).toEqual(['TSR TSR-CTL-SG002-011'])
    expect(diff.removed.map((a) => a.label)).toEqual(['TSR TSR-CTL-SG002-010'])
    expect(diff.changed).toEqual([expect.objectContaining({ label: 'TSR TSR-CTL-SG002-001', fields: ['내용'] })])
    expect(activeDocs(next, 'TSC')).toHaveLength(1)
  })
})
