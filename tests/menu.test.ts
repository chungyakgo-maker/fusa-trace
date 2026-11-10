import { describe, expect, it } from 'vitest'
import { MENU } from '../src/renderer/src/menu'

describe('왼쪽 메뉴', () => {
  it('SPEC §9 순서: 추적성 / 산출물 일정 / ID 대응표 / 문서 관리 / 설정', () => {
    expect(MENU.map((m) => m.label)).toEqual(['추적성', '산출물 일정', 'ID 대응표', '문서 관리', '설정'])
  })

  it('id가 겹치지 않음', () => {
    const ids = MENU.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 메뉴에 안내 문구와 마일스톤이 있음', () => {
    for (const item of MENU) {
      expect(item.summary.length).toBeGreaterThan(0)
      expect(item.milestone).toMatch(/^M\d/)
    }
  })
})
