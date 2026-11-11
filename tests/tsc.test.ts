import { describe, expect, it } from 'vitest'
import { P, readFixture } from './helpers'

const r = readFixture(`${P}_기술안전개념서(TSC)_R1.docx`)
const items = r.items!
const tsr = (id: string, dup = 1) => items.find((i) => i.rawId === id && i.dupIndex === dup)!

describe('TSC 읽기 (FORMATS §5, §9 TSC)', () => {
  it('종류 판별 = TSC, 버전은 Document Change History 마지막 값', () => {
    expect(r.kind).toBe('TSC')
    expect(r.version).toBe('R1')
  })

  it('TSR 표 40개 이상, FSR 사본 표·SM 표·목차는 읽지 않음', () => {
    expect(r.report.counts['TSR']).toBe(46)
    expect(items.every((i) => i.kind === 'TSR')).toBe(true)
    expect(items.some((i) => i.rawId.startsWith('FSR'))).toBe(false)
  })

  it('한 표 안에 TSR 2개 (사이 빈 행)', () => {
    const a = tsr('TSR-CTL-SG001-007').location
    const b = tsr('TSR-CTL-SG001-008').location
    expect(a).toMatch(/^\d+번째 TSR 표 \(표 \d+, 1행\)/) // 위치: n번째 TSR 표 (문서 표 번호, 행) · 가장 가까운 제목
    expect(a.replace(/, \d+행\)/, ')')).toBe(b.replace(/, \d+행\)/, ')'))
    expect(a).toContain(' · ')
    expect(tsr('TSR-CTL-SG001-008').refs).toEqual(['FSR.001.008'])
  })

  it('같은 TSR ID가 다른 내용으로 2번, 3번 → 각각 보존 + ID 중복', () => {
    expect(items.filter((i) => i.rawId === 'TSR-CTL-SG001-012').map((i) => [i.dupIndex, i.dupCount])).toEqual([[1, 2], [2, 2]])
    expect(items.filter((i) => i.rawId === 'TSR-CTL-SG001-015')).toHaveLength(3)
    expect(tsr('TSR-CTL-SG001-012', 2).title).toContain('중복')
    expect(r.report.warnings.filter((w) => w.message.startsWith('ID 중복'))).toHaveLength(2)
  })

  it('번호 건너뜀(024 없음)은 오류 아님', () => {
    expect(items.some((i) => i.rawId === 'TSR-CTL-SG001-024')).toBe(false)
    expect(r.report.warnings.some((w) => w.message.includes('024'))).toBe(false)
  })

  it('속성 키 변형 (Element / Name of Functional Block, SM / Safety Mechanism, FTTI / FTTI / FTHI)', () => {
    expect(tsr('TSR-CTL-SG001-003').attrs).toMatchObject({ Element: 'MCU [ELE-009]', 'Safety Mechanism': 'SM-003', FTTI: '100 ms' })
    expect(tsr('TSR-CTL-SG001-001').attrs).toMatchObject({ Element: 'MCU [ELE-009]', 'Safety Mechanism': 'SM-001' })
  })

  it('세로 병합 칸은 위 칸 이름을 이어받음', () => {
    expect(tsr('TSR-CTL-SG001-013').attrs['Safety Mechanism']).toBe('SM-01\nSM-02')
  })

  it('요소: 표 값 우선, 없으면 앞의 제목 2 (스타일 이름 heading 2 / 제목 2)', () => {
    expect(tsr('TSR-CTL-SG001-007').element).toBe('Element 21 [Main MCU]')
    expect(tsr('TSR-CTL-SG001-001').element).toBe('MCU [ELE-009]')
  })

  it('Status 한글/영문/미적용 혼합', () => {
    expect(tsr('TSR-CTL-SG001-004').status).toBe('done') // 평가 완료
    expect(tsr('TSR-CTL-SG001-005').status).toBe('done') // Complete
    expect(tsr('TSR-CTL-SG001-002').status).toBe('inProgress')
    expect(tsr('TSR-CTL-SG001-003').status).toBe('inProgress')
    expect(['020', '021', '022'].map((n) => tsr(`TSR-CTL-SG001-${n}`).status)).toEqual(['notApplicable', 'notApplicable', 'notApplicable'])
  })

  it('Allocation 변형 (괄호 오타 포함), 분류 일반/공통 = 일반 요구', () => {
    expect(tsr('TSR-CTL-SG001-006')).toMatchObject({ allocation: 'SW', allocationNote: 'CUST', allocationRaw: 'S/W (CUST))' })
    expect(tsr('TSR-CTL-SG001-004').allocation).toBe('BOTH')
    expect(tsr('TSR-CTL-GEN-002')).toMatchObject({ general: true })
    expect(tsr('TSR-CTL-SG001-001').general).toBe(false)
  })

  it('Ref ID 구분자 혼합 (줄바꿈, `, \\n`, ` / `)', () => {
    expect(tsr('TSR-CTL-SG001-002').refs).toEqual(['FSR.001.002', 'FSR.001.006', 'FSR.001.009'])
    expect(tsr('TSR-CTL-SG001-003').refs).toEqual(['FSR.001.003', 'FSR.001.010'])
    expect(tsr('TSR-CTL-SG001-004').refs).toEqual(['FSR.001.004', 'FSR.001.005'])
  })

  it('표 안 문장을 사용 (제목 3과 다름), 그림 안 글자는 읽지 않음', () => {
    expect(tsr('TSR-CTL-SG001-001').title).toBe('SG1 가짜 기술안전 요구 1: 입력 신호 이상을 감지하면 출력을 차단한다')
    expect(JSON.stringify(items)).not.toContain('그림 안 글자')
    expect(items.some((i) => i.rawId === 'TSR-CTL-SG001-999')).toBe(false)
  })

  it('Safe State의 잘못 들어간 값은 그대로 보관', () => {
    expect(tsr('TSR-CTL-SG001-010').attrs['Safe State']).toBe('Normal Mode')
    expect(tsr('TSR-CTL-SG001-011').attrs['Safe State']).toBe('S N/A')
  })

  it('TSR ID가 빈 표 → 건너뜀 + 이유', () => {
    expect(r.report.skipped).toEqual([expect.objectContaining({ message: 'TSR ID가 비어 있어 건너뛰었습니다' })])
  })
})

describe('대용량 TSC (본문 XML 약 20MB, TSR 표 320개)', () => {
  it('10초 안에 읽음', () => {
    const t0 = Date.now()
    const big = readFixture(`${P}_기술안전개념서_대용량(TSC)_R1.docx`)
    const ms = Date.now() - t0
    expect(big.items).toHaveLength(320)
    expect(ms).toBeLessThan(10_000)
  })
})
