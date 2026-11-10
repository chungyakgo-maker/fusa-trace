import { describe, expect, it } from 'vitest'
import { P, demoProject, importInto } from './helpers'
import { computeSystemTrace } from '../src/core/trace'
import { buildTraceMap, connectedOf, type MapLayout, type MapNode } from '../src/core/traceMap'

const p = importInto(importInto(demoProject(), `${P}_FSR_R01.xlsx`), `${P}_기술안전개념서(TSC)_R1.docx`)
const t = computeSystemTrace(p)
const collapsed = buildTraceMap(t, { sg: 'all', expanded: new Set(), expandAll: false })
const full = buildTraceMap(t, { sg: 'all', expanded: new Set(), expandAll: true })

const node = (l: MapLayout, title: string): MapNode => {
  const n = l.nodes.find((x) => x.title === title)
  if (!n) throw new Error(`카드 없음: ${title}`)
  return n
}
const edgeStyle = (l: MapLayout, from: string, to: string) => l.edges.find((e) => e.from === from && e.to === to)?.style

/** 같은 열에서 카드가 겹치지 않음 */
function noOverlap(l: MapLayout): boolean {
  for (const col of [0, 1, 2, 3]) {
    const list = l.nodes.filter((n) => n.col === col).sort((a, b) => a.y - b.y)
    for (let i = 1; i < list.length; i++) if (list[i].y < list[i - 1].y + list[i - 1].h) return false
  }
  return true
}

describe('연결 지도 배치 (SPEC §9.1)', () => {
  it('열: SG → FSR → TSR → FMEA 근거(자리), SG에서 FSR로 갈라짐', () => {
    expect(node(collapsed, 'SG001').col).toBe(0)
    expect(node(collapsed, 'FSR.001.011').col).toBe(1)
    expect(node(collapsed, 'TSR-CTL-SG001-029').col).toBe(2)
    expect(node(collapsed, 'FMEA 근거')).toMatchObject({ col: 3, kind: 'placeholder', sub: 'FMEA 미등록' })
    expect(edgeStyle(collapsed, 'sg:SG001', node(collapsed, 'FSR.001.011').id)).toBe('ok')
  })

  it('누락: FSR → "TSR 없음" 빈 카드로 주황 점선', () => {
    const f = node(collapsed, 'FSR.001.011')
    expect(f.tone).toBe('missing')
    const ghost = collapsed.nodes.find((n) => n.id === `ghost-tsr:${f.id}`)!
    expect(ghost).toMatchObject({ title: 'TSR 없음', col: 2 })
    expect(edgeStyle(collapsed, f.id, ghost.id)).toBe('missing')
  })

  it('없는 FSR 참조: "FSR.001.099 없음" 빈 카드 → TSR 주황 점선', () => {
    const tsr = node(collapsed, 'TSR-CTL-SG001-029')
    expect(tsr.tone).toBe('missing')
    const ghost = node(collapsed, 'FSR.001.099 없음')
    expect(ghost.col).toBe(1)
    expect(edgeStyle(collapsed, ghost.id, tsr.id)).toBe('missing')
  })

  it('ID 중복: 같은 ID 카드 2개에 노란 점선이 같이 걸림', () => {
    const a = node(collapsed, 'TSR-CTL-SG001-012 (중복 #1)')
    const b = node(collapsed, 'TSR-CTL-SG001-012 (중복 #2)')
    const f = node(collapsed, 'FSR.001.002')
    expect([a.tone, b.tone]).toEqual(['check', 'check'])
    expect([edgeStyle(collapsed, f.id, a.id), edgeStyle(collapsed, f.id, b.id)]).toEqual(['check', 'check'])
    expect(collapsed.nodes.filter((n) => n.title.startsWith('TSR-CTL-SG001-015'))).toHaveLength(3)
  })

  it('1:N, N:1 연결을 모두 그림', () => {
    const f = node(full, 'FSR.001.010')
    expect(full.edges.filter((e) => e.from === f.id).map((e) => full.nodes.find((n) => n.id === e.to)!.title)).toEqual([
      'TSR-CTL-SG001-003',
      'TSR-CTL-SG001-010',
      'TSR-CTL-SG001-020'
    ])
    const tsr2 = node(full, 'TSR-CTL-SG001-002')
    expect(full.edges.filter((e) => e.to === tsr2.id)).toHaveLength(3)
  })

  it('정상 연결은 SG마다 묶음 카드로 접힘, 문제 항목은 위에', () => {
    // 손으로 셈: SG001의 FSR 12 + 타 ECU로부터 1 중 누락(011)·중복 TSR 연결(002, 005) 3개를 뺀 10개
    const g = node(collapsed, '정상 FSR 10개')
    expect(g).toMatchObject({ kind: 'group', block: 'SG001', col: 1 })
    expect(collapsed.nodes.some((n) => n.kind === 'group' && n.col === 2 && n.block === 'SG001')).toBe(true)
    const sg1 = collapsed.nodes.filter((n) => n.col === 1 && n.y < g.y && n.kind === 'item')
    expect(sg1[0].title).toBe('FSR.001.011') // 누락이 맨 위
    expect(collapsed.nodes.filter((n) => n.kind === 'item').length).toBeLessThan(full.nodes.filter((n) => n.kind === 'item').length)
    expect(collapsed.blocks.find((b) => b.key === 'SG001')?.collapsible).toBe(10)
  })

  it('펼치면 묶음 없이 모든 항목 (FSR 23, TSR 46)', () => {
    expect(full.nodes.some((n) => n.kind === 'group')).toBe(false)
    expect(full.nodes.filter((n) => n.kind === 'item' && n.col === 1)).toHaveLength(23)
    expect(full.nodes.filter((n) => n.kind === 'item' && n.col === 2)).toHaveLength(46)
  })

  it('블록 하나만 펼치기', () => {
    const one = buildTraceMap(t, { sg: 'all', expanded: new Set(['SG002']), expandAll: false })
    expect(one.nodes.some((n) => n.kind === 'group' && n.block === 'SG002')).toBe(false)
    expect(one.nodes.some((n) => n.kind === 'group' && n.block === 'SG001')).toBe(true)
  })

  it('SG 하나씩 보기', () => {
    const sg2 = buildTraceMap(t, { sg: 'SG002', expanded: new Set(), expandAll: true })
    expect(sg2.nodes.filter((n) => n.kind === 'sg').map((n) => n.title)).toEqual(['SG002'])
    expect(sg2.nodes.some((n) => n.title.startsWith('FSR.001'))).toBe(false)
    expect(sg2.nodes.filter((n) => n.col === 1 && n.kind === 'item')).toHaveLength(10)
  })

  it('대상 아님(타 ECU에 요구)은 회색 카드', () => {
    expect(node(full, 'FSR.002.090').tone).toBe('na')
  })

  it('카드가 겹치지 않음', () => {
    expect(noOverlap(collapsed)).toBe(true)
    expect(noOverlap(full)).toBe(true)
  })

  it('카드를 고르면 위·아래 연결만 (형제 FSR로는 번지지 않음)', () => {
    const f = node(full, 'FSR.001.010')
    const c = connectedOf(full, f.id)
    const titles = [...c.nodes].map((id) => full.nodes.find((n) => n.id === id)!.title).sort()
    expect(titles).toEqual(['FSR.001.010', 'SG001', 'TSR-CTL-SG001-003', 'TSR-CTL-SG001-010', 'TSR-CTL-SG001-020'])
    const tsr = node(full, 'TSR-CTL-SG001-002')
    const up = [...connectedOf(full, tsr.id).nodes].map((id) => full.nodes.find((n) => n.id === id)!.title).sort()
    expect(up).toEqual(['FSR.001.002', 'FSR.001.006', 'FSR.001.009', 'SG001', 'TSR-CTL-SG001-002'])
  })
})

describe('대량 (TSR 320개)', () => {
  const big = importInto(importInto(demoProject(), `${P}_FSR_R01.xlsx`), `${P}_기술안전개념서_대용량(TSC)_R1.docx`)
  const bt = computeSystemTrace(big)

  it('접힌 기본 보기는 카드 수가 적음', () => {
    const l = buildTraceMap(bt, { sg: 'all', expanded: new Set(), expandAll: false })
    expect(l.nodes.length).toBeLessThan(40)
  })

  it('모두 펼쳐도 배치 계산이 빠름 (200ms 이내), 겹침 없음', () => {
    const t0 = performance.now()
    const l = buildTraceMap(bt, { sg: 'all', expanded: new Set(), expandAll: true })
    const ms = performance.now() - t0
    expect(l.nodes.filter((n) => n.col === 2 && n.kind === 'item')).toHaveLength(320)
    expect(ms).toBeLessThan(200)
    expect(noOverlap(l)).toBe(true)
    const t1 = performance.now()
    connectedOf(l, l.nodes.find((n) => n.title === 'FSR.001.001')!.id)
    expect(performance.now() - t1).toBeLessThan(50)
  })
})
