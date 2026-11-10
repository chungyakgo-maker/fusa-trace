import { describe, expect, it } from 'vitest'
import { P, readFixture } from './helpers'
import type { Deliverable } from '../src/core/model'
import { categoryOf, parseAssignee } from '../src/core/dia'

const r = readFixture(`${P}_DIA_R1.xlsx`)
const all = r.dia!.deliverables
const row = (no: number): Deliverable[] => all.filter((d) => d.diaNo === no)

describe('DIA 읽기 (FORMATS §6, §9 DIA)', () => {
  it('종류 판별 = DIA, 버전은 파일명에서', () => {
    expect(r.kind).toBe('DIA')
    expect(r.version).toBe('R1')
  })

  it('여러 줄 헤더 + PLAN/Real 그룹으로 Start/End 구분', () => {
    const [d] = row(1)
    expect([d.planStart, d.planEnd, d.realStart, d.realEnd]).toEqual(['2026-03-02', '2026-03-31', '2026-03-03', '2026-03-30'])
  })

  it('R/S/A 기호 행은 데이터가 아님 (건너뜀 목록에도 없음)', () => {
    expect(r.report.skipped.some((s) => s.where.endsWith(' 7행'))).toBe(false)
  })

  it('빈 행 20줄 이후는 읽지 않음 (사용 범위 100만 행 시트)', () => {
    expect(all.some((d) => d.diaNo === 99)).toBe(false)
  })

  it('Part-clause 병합 → 아래로 채움, Part 번호로 구분', () => {
    expect(row(2)[0].partClause).toBe('2-5')
    expect(row(7)[0].partClause).toBe('4-7')
    expect(row(6)[0].category).toBe('시스템')
    expect(row(8)[0].category).toBe('HW')
    expect(row(11)[0].category).toBe('SW')
    expect(row(13)[0].category).toBe('관리')
    expect(row(15)[0].category).toBe('기타')
    expect(categoryOf('6-C')).toBe('SW')
    expect(categoryOf('')).toBe('기타')
  })

  it('한 칸에 파일 5개 → 5줄, 라벨: 날짜 짝짓기 (공백 변형 포함)', () => {
    const lines = row(6)
    expect(lines.map((d) => d.docLabel)).toEqual(['FMEA', 'DFA', 'FTA', 'FMEA VR', 'DFA VR'])
    expect(lines.map((d) => d.planEnd)).toEqual(['2026-05-10', '2026-05-20', '2026-05-25', '2026-06-01', '2026-06-05'])
    expect(lines.map((d) => d.planStart)).toEqual(['2026-04-10', '2026-04-20', undefined, '2026-05-25', '2026-06-01'])
    expect(lines[0].realStart).toBe('2026-04-12')
    expect(lines.every((d) => d.lineCount === 5)).toBe(true)
  })

  it('TSC와 TSC VR을 구분해서 짝지음 (라벨 TSC가 VR 파일에 붙지 않음)', () => {
    const [tsc, vr] = row(5)
    expect(tsc.docLabel).toBe('TSC')
    expect(tsc.isVR).toBe(false)
    expect([tsc.planStart, tsc.planEnd, tsc.realStart]).toEqual(['2026-04-01', '2026-04-27', '2026-04-02'])
    expect(vr.docLabel).toBe('TSC VR')
    expect(vr.isVR).toBe(true)
    expect([vr.planStart, vr.planEnd, vr.realStart]).toEqual(['2026-05-01', '2026-05-15', undefined])
  })

  it('파일명이 아닌 줄과 날짜 없는 줄은 메모', () => {
    expect(row(5)[0].memo).toEqual(['FMEDA 대체', '※ 파일명은 정확히 기재 할 것'])
    expect(row(6)[0].memo).toContain('FTA / DFA 제외')
  })

  it('엑셀 날짜 하나뿐이면 그 행의 모든 줄에 적용', () => {
    expect(row(9).map((d) => [d.planStart, d.planEnd])).toEqual([
      ['2026-06-01', '2026-06-30'],
      ['2026-06-01', '2026-06-30']
    ])
  })

  it('날짜 오류: 한 자리 월 인정, 일 없음 경고, 종료 < 시작 경고, YYYY.MM.DD 자리 표시는 없음', () => {
    expect(row(4)[0].planStart).toBe('2026-06-05')
    expect(row(4)[0].planEnd).toBe('2026-06-30')
    const [hsi, hsiVr] = row(7)
    expect(hsi.planEnd).toBeUndefined()
    expect(hsi.dateWarnings.join()).toContain("'2026-06-'")
    expect(hsiVr.planEnd).toBe('2026-06-20')
    expect(row(8)[0].dateWarnings.join()).toContain('계획 시작')
    expect(row(10).every((d) => !d.planStart && !d.planEnd && d.dateWarnings.length === 0)).toBe(true)
    expect(r.report.warnings.length).toBe(2)
  })

  it('담당 여러 명(줄바꿈·쉼표) / 빈칸 / N/A', () => {
    expect(row(5)[0].team).toBe('시스템팀')
    expect(row(5)[0].people).toEqual(['이영희 책임', '박민수 선임'])
    expect(row(2)[0].people).toEqual(['홍길동 책임', '김철수 선임'])
    expect(row(4)[0]).toMatchObject({ team: 'CUST 개발팀', people: [] })
    expect(row(8)[0]).toMatchObject({ team: '', people: [] }) // 빈칸 → 포함 (담당 미지정)
    expect(row(3)).toHaveLength(0) // N/A → 제외
    expect(r.report.skipped.some((s) => s.message.includes('N/A'))).toBe(true)
  })

  it('파일명 없이 날짜만 있으면 산출물 1줄', () => {
    expect(row(12)).toHaveLength(1)
    expect(row(12)[0]).toMatchObject({ expectedFileName: '', planStart: '2026-07-01', planEnd: '2026-07-31' })
  })

  it('VR 산출물: Work products에 Verification 또는 파일명에 Verification Report', () => {
    expect(row(13)[0].isVR).toBe(true)
    expect(row(13)[0].docLabel).toBe('VR')
    expect(all.filter((d) => d.isVR).map((d) => `${d.diaNo}-${d.line}`)).toEqual(['5-2', '6-4', '6-5', '7-2', '9-2', '10-2', '13-1'])
  })

  it('표 아래 메모 행은 건너뛰고 이유를 남김', () => {
    expect(r.report.skipped.some((s) => s.message.includes('No. 칸에 번호가 없어'))).toBe(true)
  })

  it('읽은 수와 안내', () => {
    expect(r.report.counts['산출물']).toBe(22)
    expect(r.report.counts['DIA 행']).toBe(15)
    expect(r.report.notes.join()).toContain('담당 미지정')
  })

  it('산출물 키는 다음 버전에서도 같음 (No. + 정규화 파일명)', () => {
    const r2 = readFixture(`${P}_DIA_R2.xlsx`)
    const k1 = new Set(all.map((d) => d.key))
    const shared = r2.dia!.deliverables.filter((d) => k1.has(d.key))
    expect(shared.length).toBe(21)
  })
})

describe('담당 칸 읽기', () => {
  it.each([
    ['팀A\n홍길동 책임', '팀A', ['홍길동 책임']],
    ['팀A\n홍길동 책임, 김철수 선임', '팀A', ['홍길동 책임', '김철수 선임']],
    ['팀A\n홍길동 책임\n김철수 선임', '팀A', ['홍길동 책임', '김철수 선임']],
    ['팀A', '팀A', []],
    ['', '', []]
  ])('%j', (raw, team, people) => {
    expect(parseAssignee(raw)).toEqual({ excluded: false, team, people })
  })

  it('N/A는 제외', () => {
    expect(parseAssignee(' N/A ').excluded).toBe(true)
  })
})
