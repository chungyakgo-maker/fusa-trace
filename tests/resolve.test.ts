import { describe, expect, it } from 'vitest'
import { Resolver } from '../src/core/resolve'
import { markDuplicates, newItem } from '../src/core/ids'
import type { Alias, TraceItem } from '../src/core/model'

function defs(ids: string[]): TraceItem[] {
  const items = ids.map((rawId, i) => newItem({ kind: 'TSR', rawId, title: `${rawId} 제목`, location: `표 ${i + 1}` }))
  markDuplicates(items)
  return items
}

describe('참조 해석 순서 (SPEC §7)', () => {
  const d = defs(['TSR-CTL-SG001-017', 'TSR-CTL-SG002-018', 'ABC_XYZ_TSR_009', 'TSR-CTL-SG001-020', 'TSR-CTL-SG002-020', 'TSR-CTL-SG001-030', 'TSR-CTL-SG001-030'])
  const r = new Resolver(d, [], 'SRS')

  it('그대로 일치', () => expect(r.resolve('TSR-CTL-SG001-017')).toMatchObject({ method: 'exact', targets: [d[0]] }))
  it('정규화 후 일치 (대소문자, _ 와 -)', () => {
    expect(r.resolve('tsr_ctl_sg001_017')).toMatchObject({ method: 'normalized', targets: [d[0]] })
    expect(r.resolve('ABC-XYZ-TSR-009')).toMatchObject({ method: 'normalized', targets: [d[2]] })
  })
  it('끝 번호 일치: 후보 1개 → 자동 (약식 표기), 앞자리 0 무시', () => {
    expect(r.resolve('TSR-017')).toMatchObject({ method: 'tail', targets: [d[0]] })
    expect(r.resolve('TSR_17')).toMatchObject({ method: 'tail', targets: [d[0]] })
    expect(r.resolve('<고객>_<제품>_TSR_018')).toMatchObject({ method: 'tail', targets: [d[1]] })
  })
  it('끝 번호 후보 2개 이상 → 확인 필요', () => {
    const res = r.resolve('TSR-020')
    expect(res.method).toBe('ambiguous')
    expect(res.targets.map((t) => t.rawId)).toEqual(['TSR-CTL-SG001-020', 'TSR-CTL-SG002-020'])
  })
  it('SG 번호가 양쪽에 있으면 SG도 같아야 함', () => {
    expect(r.resolve('TSR-SG002-020')).toMatchObject({ method: 'tail', targets: [d[4]] })
    expect(r.resolve('TSR-SG003-020').method).toBe('missing')
  })
  it('후보 0개 → 없는 ID', () => expect(r.resolve('TSR-999').method).toBe('missing'))
  it('종류 토큰이 다르면 비교 안 함', () => expect(r.resolve('SSR-017').method).toBe('missing'))
  it('대상 ID가 정의 문서에서 중복 → 확인 필요', () => {
    expect(r.resolve('TSR-CTL-SG001-030')).toMatchObject({ method: 'ambiguous', reason: expect.stringContaining('ID 중복') })
    expect(r.resolve('TSR-030').method).toBe('ambiguous')
  })

  it('점 형식(FSR.001.009)은 끝 번호 비교를 하지 않음', () => {
    const f = defs(['FSR.001.009', 'FSR.002.009']).map((i) => ({ ...i, kind: 'FSR' as const }))
    const fr = new Resolver(f, [], 'TSC')
    expect(fr.resolve('FSR.001.009').method).toBe('exact')
    expect(fr.resolve('FSR.003.009').method).toBe('missing')
  })

  it('별칭이 가장 먼저 (중복 대상 중 하나를 고를 수도 있음)', () => {
    const aliases: Alias[] = [
      { sourceKind: 'SRS', ref: 'TSR-020', target: 'TSR-CTL-SG002-020', createdAt: '' },
      { sourceKind: 'SRS', ref: 'TSR-030', target: 'TSR-CTL-SG001-030#2', createdAt: '' },
      { sourceKind: 'TSC', ref: 'TSR-017', target: 'TSR-CTL-SG002-018', createdAt: '' }
    ]
    const ar = new Resolver(d, aliases, 'SRS')
    expect(ar.resolve('TSR-020')).toMatchObject({ method: 'alias', targets: [d[4]] })
    expect(ar.resolve('TSR-030')).toMatchObject({ method: 'alias', targets: [d[6]] })
    expect(ar.resolve('TSR-017').method).toBe('tail') // 다른 문서 종류의 별칭은 안 씀
  })

  it('별칭 대상이 없어졌으면 무시하고 다음 규칙', () => {
    const ar = new Resolver(d, [{ sourceKind: 'SRS', ref: 'TSR-017', target: 'TSR-GONE', createdAt: '' }], 'SRS')
    expect(ar.resolve('TSR-017').method).toBe('tail')
  })
})
