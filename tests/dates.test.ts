import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, excelSerialToIso, parseDateText } from '../src/core/dates'

describe('날짜 읽기 (FORMATS §6.5)', () => {
  it.each([
    ['2026-04-27', '2026-04-27'],
    ['2026-6-05', '2026-06-05'],
    ['2026.06.05', '2026-06-05'],
    ['2026/06/05', '2026-06-05'],
    [' 2026-06-30 ', '2026-06-30']
  ])('인정: %s', (raw, iso) => {
    expect(parseDateText(raw)).toEqual({ kind: 'date', date: iso })
  })

  it.each(['N/A', '', 'YYYY.MM.DD', '-', 'TBD'])('없음: "%s"', (raw) => {
    expect(parseDateText(raw).kind).toBe('none')
  })

  it.each(['2026-06-', '2026-05-', '2026-13-01', '2026-02-30', '6월 말'])('해석 불가 → 경고: %s', (raw) => {
    expect(parseDateText(raw).kind).toBe('invalid')
  })

  it('엑셀 일련번호 → 날짜 (시간대 영향 없음)', () => {
    expect(excelSerialToIso(46_142)).toBe('2026-04-30')
    expect(excelSerialToIso(1)).toBe('1899-12-31')
  })

  it('일수 계산', () => {
    expect(daysBetween('2026-05-15', '2026-05-20')).toBe(5)
    expect(daysBetween('2026-05-15', '2026-05-01')).toBe(-14)
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02')
  })
})
