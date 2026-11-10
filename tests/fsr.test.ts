import { describe, expect, it } from 'vitest'
import { P, readFixture } from './helpers'

const r = readFixture(`${P}_FSR_R01.xlsx`)
const items = r.items!
const fsr = (id: string) => items.find((i) => i.kind === 'FSR' && i.rawId === id)!

describe('FSR 읽기 (FORMATS §4, §9 FSR)', () => {
  it('종류 판별 = FSR, 버전은 개정이력 마지막 값', () => {
    expect(r.kind).toBe('FSR')
    expect(r.version).toBe('R01')
  })

  it('안전목표 시트: ID_SafetyGoal 표 3개를 합쳐 SG, Safe State 표, 무관한 표는 무시', () => {
    const sgs = items.filter((i) => i.kind === 'SG')
    expect(sgs.map((s) => s.rawId)).toEqual(['SG001', 'SG002'])
    expect(sgs[0]).toMatchObject({ title: '의도하지 않은 동작 방지 1 (가짜)', asil: 'B' })
    expect(sgs[0].attrs).toMatchObject({ 재난요인: '주행 중 오동작', FTTI: '200', 'Safe State': 'SS001', '허용 기준': '오동작 없음' })
    expect(items.filter((i) => i.kind === 'SS').map((s) => s.rawId)).toEqual(['SS001', 'SS002'])
  })

  it('SG 시트 2장 × FSR 표 3개 (자체 / to other ECUs / from other ECUs)', () => {
    expect(r.report.counts['FSR']).toBe(23)
    expect(fsr('FSR.001.001')).toMatchObject({ sg: 'SG001', origin: 'own' })
    expect(fsr('FSR.002.090')).toMatchObject({ sg: 'SG002', origin: 'toOther' })
    expect(fsr('FSR.006.051')).toMatchObject({ sg: 'SG001', origin: 'fromOther' })
    expect(items.filter((i) => i.origin === 'toOther')).toHaveLength(1) // SG001의 to other ECUs 표는 비어 있음
  })

  it('헤더 셀 안 줄바꿈, 병합 셀(내용 가로 병합)', () => {
    expect(fsr('FSR.001.002').title).toBe('SG1 가짜 기능안전 요구 2: 고장을 감지하면 안전 상태로 전환한다')
    expect(fsr('FSR.001.002').attrs).toMatchObject({ FTTI: '200', '허용 기준': '고장 감지 후 안전 상태 유지' })
  })

  it('양식 왼쪽에 덧붙인 TSR 매핑 열, 오른쪽 메모 열은 읽지 않음', () => {
    const all = JSON.stringify(items)
    expect(all).not.toContain('TSR-CTL')
    expect(all).not.toContain('읽지 않음')
  })

  it('표 아래 떨어진 메모 행은 무시, ID 없는 행은 건너뜀 + 이유', () => {
    expect(items.some((i) => i.title.includes('비고'))).toBe(false)
    expect(r.report.skipped.filter((s) => s.message.includes('FSR ID가 비어'))).toHaveLength(2)
  })

  it('T.B.D. → 미정 경고, `-` → 빈 값, 여러 줄 Safe State는 그대로', () => {
    expect(fsr('FSR.001.005').attrs['Safe State']).toBe('')
    expect(r.report.warnings.some((w) => w.message.includes('FSR.001.005') && w.message.includes('미정'))).toBe(true)
    expect(fsr('FSR.001.003').attrs['Safe State']).toBe('')
    expect(fsr('FSR.001.004').attrs['Safe State']).toBe('SS001\n(필요 시 SS002)')
  })

  it('Allocation General → 일반', () => {
    expect(fsr('FSR.001.001')).toMatchObject({ allocation: 'GENERAL', general: true })
    expect(fsr('FSR.001.002')).toMatchObject({ allocation: 'OTHER', allocationNote: '도어 제어', general: false })
  })

  it('작업용 시트(Sheet1)는 무시', () => {
    expect(items.some((i) => i.rawId === 'FSR.999.999')).toBe(false)
    expect(r.report.notes.join()).toContain('Sheet1')
  })
})

describe('FSR 양식 변형 (FSR ID / Type / SG_ID, <차종코드><제어기>SR 형식)', () => {
  const v = readFixture(`${P}_FSR_양식B_R00.xlsx`)
  it('패턴을 가정하지 않고 읽음, SG는 SG_ID 칸에서', () => {
    expect(v.kind).toBe('FSR')
    const fsrs = v.items!.filter((i) => i.kind === 'FSR')
    expect(fsrs.map((f) => f.rawId)).toEqual(['XXXCTLSR110', 'XXXCTLSR210', 'YYYCTLSR810'])
    expect(fsrs.map((f) => f.sg)).toEqual(['SG-01', 'SG-02', 'SG-01'])
    expect(fsrs[0].attrs).toMatchObject({ FTTI: '100ms', '허용 기준': '안전 상태 유지', Type: '자체', 'Safe State': 'SS_01' })
    expect(fsrs[0].title).toBe('가짜 요구 110')
  })
})
