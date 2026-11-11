import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { demoProject, importInto, P } from './helpers'
import type { MyScope, Profile } from '../src/core/model'
import { activeDeliverables } from '../src/core/project'
import { hasScope, mineOf, reasonText, scopeText, toggleMine } from '../src/core/mine'
import { CHANGELOG } from '../src/shared/changelog'

const p = importInto(demoProject(), `${P}_DIA_R1.xlsx`)
const ds = activeDeliverables(p)
const count = (scope: MyScope, profile?: Profile): number => ds.filter((d) => mineOf(d, scope, profile).mine).length
const scope = (s: Partial<MyScope>): MyScope => ({ roles: [], include: [], exclude: [], ...s })
const me: Profile = { team: 'SW팀', name: '최지훈', title: '책임' }

describe('내 담당 (mine)', () => {
  it('역할 → 구분: 시스템 3·4부, SW 6부, HW 5부, 세이프티 매니저 = 관리 + 기타', () => {
    expect(count(scope({ roles: ['system'] }))).toBe(10)
    expect(count(scope({ roles: ['sw'] }))).toBe(2)
    expect(count(scope({ roles: ['hw'] }))).toBe(5)
    expect(count(scope({ roles: ['sm'] }))).toBe(4 + 1)
    expect(count(scope({ roles: ['system', 'sw'] }))).toBe(12)
    expect(count(scope({ roles: ['sm', 'system', 'sw', 'hw'] }))).toBe(ds.length)
  })

  it('이유: 자동 · 시스템', () => {
    const tsc = ds.find((d) => d.diaNo === 5)!
    expect(reasonText(mineOf(tsc, scope({ roles: ['system'] })).reason)).toBe('자동 · 시스템')
  })

  it('내 이름이 DIA 담당 칸에 있으면 (켰을 때만), 띄어쓰기 무시', () => {
    expect(count(scope({ matchName: true }), me)).toBe(2) // No.11, 12 (최지훈 책임)
    expect(count(scope({ matchName: false }), me)).toBe(0)
    expect(count(scope({ matchName: true }), { ...me, name: '최 지훈' })).toBe(2)
    expect(count(scope({ matchName: true }), { ...me, name: '' })).toBe(0)
    const srs = ds.find((d) => d.diaNo === 11)!
    expect(reasonText(mineOf(srs, scope({ matchName: true }), me).reason)).toBe('자동 · 내 이름')
  })

  it('내 팀이 DIA 담당 팀과 같으면 (켰을 때만)', () => {
    expect(count(scope({ matchTeam: true }), { ...me, team: 'HW팀' })).toBe(4) // No.9, 10 (각 2줄)
  })

  it('☆: 자동인 것을 누르면 "직접 뺌", 다시 누르면 원래대로', () => {
    const s0 = scope({ roles: ['system'] })
    const tsc = ds.find((d) => d.diaNo === 5)!
    const s1 = toggleMine(s0, tsc)
    expect(s1.exclude).toEqual([tsc.key])
    expect(mineOf(tsc, s1).mine).toBe(false)
    expect(reasonText(mineOf(tsc, s1).reason)).toBe('직접 뺌')
    const s2 = toggleMine(s1, tsc)
    expect(s2.exclude).toEqual([])
    expect(s2.include).toEqual([])
    expect(mineOf(tsc, s2).mine).toBe(true)
  })

  it('☆: 자동이 아닌 것을 누르면 "직접 넣음", 다시 누르면 원래대로', () => {
    const s0 = scope({ roles: ['system'] })
    const hsr = ds.find((d) => d.diaNo === 8)!
    const s1 = toggleMine(s0, hsr)
    expect(s1.include).toEqual([hsr.key])
    expect(reasonText(mineOf(hsr, s1).reason)).toBe('직접 넣음')
    expect(toggleMine(s1, hsr).include).toEqual([])
  })

  it('기준이 있는지, 제목 글', () => {
    expect(hasScope(undefined)).toBe(false)
    expect(hasScope(scope({}))).toBe(false)
    expect(hasScope(scope({ matchName: true }), me)).toBe(true)
    expect(hasScope(scope({ matchName: true }), { ...me, name: ' ' })).toBe(false)
    expect(scopeText(scope({ roles: ['sw', 'system'], include: ['x'], matchName: true }), me)).toBe("시스템 + SW + 이름 '최지훈' + 직접 고른 것")
  })
})

describe('업데이트 기록', () => {
  it('맨 위 기록 = package.json 버전 (새 버전을 올릴 때 기록을 잊지 않게)', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string }
    expect(CHANGELOG[0].version).toBe(version)
  })
  it('버전은 새것부터, 날짜 형식', () => {
    for (let i = 1; i < CHANGELOG.length; i++) expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true)
    for (const c of CHANGELOG) {
      expect(c.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.items.length).toBeGreaterThan(0)
    }
  })
})

describe('엑셀 출력: 내 담당만', async () => {
  const { buildScheduleWorkbook, exportFileName, SHEET_LIST } = await import('../src/core/export')
  it('시트 1이 내 담당만, 제목에 기준, 파일 이름에 _내담당', async () => {
    const q = { ...p, settings: { ...p.settings, myScope: scope({ roles: ['system'], matchName: true }) } }
    const wb = await buildScheduleWorkbook(q, '2026-04-20', '2026-04-20', { includeTrace: false, mineOnly: true, profile: me })
    const ws = wb.getWorksheet(SHEET_LIST)!
    expect(ws.rowCount - 6).toBe(12)
    expect(String(ws.getCell('A1').value)).toBe("산출물 작성 리스트 — 내 담당 (시스템 + 이름 '최지훈')")
    expect(String(ws.getCell('B4').value)).toContain('전체 12')
    expect(exportFileName('데모', '2026-04-20', true)).toBe('데모_산출물작성리스트_20260420_내담당.xlsx')
    const all = await buildScheduleWorkbook(q, '2026-04-20', '2026-04-20', { includeTrace: false })
    expect(all.getWorksheet(SHEET_LIST)!.rowCount - 6).toBe(22)
  })
})
