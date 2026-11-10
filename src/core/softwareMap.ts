/**
 * 소프트웨어 탭 연결 지도 배치: TSR (S/W) → SSR → SW 요구사항 시험(자리)
 * - 블록: TSR ID의 SG 번호 (없으면 "일반·기타"), TSR 연결이 없는 SSR은 맨 아래 "TSR 연결 없음"
 * - 누락: TSR → "SSR 없음" 빈 카드, 없는 TSR 참조·Yes인데 TSR 없음·ASIL인데 TSR 없음: TSR 열에 빈 카드
 * - 정상 연결은 블록마다 "정상 TSR n개" / "SSR m개" 묶음
 * - S/W 할당이 아닌 TSR을 가리키는 SSR은 그 TSR도 회색 카드로 보여 줌
 */
import type { TraceItem } from './model'
import { isResolved } from './resolve'
import { normalizeId, sgNumber } from './ids'
import type { SoftwareTrace, SsrRow, SwTsrRow } from './software'
import {
  BLOCK_GAP,
  CARD_H,
  GAP,
  GHOST_H,
  idLabel,
  nodeIdOf,
  oneLine,
  STATUS_ORDER,
  TONE,
  type EdgeStyle,
  type MapColumn,
  type MapEdge,
  type MapLayout,
  type MapNode,
  type MapOptions,
  type NodeTone
} from './traceMap'

export const SOFTWARE_COLUMNS: MapColumn[] = [
  { label: 'TSR (S/W)', x: 0, w: 260 },
  { label: 'SSR', x: 300, w: 260 },
  { label: 'SW 요구사항 시험', x: 600, w: 190 }
]

export const GENERAL_BLOCK = '일반·기타'
export const NO_TSR_BLOCK = 'TSR 연결 없음'

function blockOfTsr(item: TraceItem): string {
  const n = sgNumber(item.normId)
  return n !== undefined ? `SG${String(n).padStart(3, '0')}` : GENERAL_BLOCK
}

export function buildSoftwareMap(sw: SoftwareTrace, opts: MapOptions): MapLayout {
  const rowOfTsr = new Map<TraceItem, SwTsrRow>(sw.tsrs.map((r) => [r.item, r]))
  const cleanSsr = (s: SsrRow): boolean => s.problems.length === 0
  const ssrRowOf = new Map(sw.ssrs.map((s) => [s.item, s]))
  const isNormal = (r: SwTsrRow): boolean =>
    r.status === '연결됨' && r.ambiguous.length === 0 && r.item.dupCount === 1 && r.ssrs.every((x) => cleanSsr(ssrRowOf.get(x.ssr)!))

  // SSR이 가리키는 TSR 중 S/W 할당이 아닌 것도 보여 줌
  const extraTsrs = new Set<TraceItem>()
  for (const s of sw.ssrs) for (const r of s.refs) for (const t of r.targets) if (!rowOfTsr.has(t)) extraTsrs.add(t)

  // 지도에 올릴 SSR: 안전 관련이거나 참조가 있는 것 (안전 무관 + 참조 없음은 목록에서만)
  const ssrs = sw.ssrs.filter((s) => s.safety || s.refs.length > 0)
  const ssrBlock = new Map<SsrRow, string>()
  for (const s of ssrs) {
    const first = s.refs.flatMap((r) => r.targets)[0]
    ssrBlock.set(s, first ? blockOfTsr(first) : NO_TSR_BLOCK)
  }
  const tsrItems = [...sw.tsrs.map((r) => r.item), ...extraTsrs]
  const keys = [...new Set([...tsrItems.map(blockOfTsr), ...ssrBlock.values()])]
  keys.sort((a, b) => (a === NO_TSR_BLOCK ? 1 : b === NO_TSR_BLOCK ? -1 : a === GENERAL_BLOCK ? 1 : b === GENERAL_BLOCK ? -1 : a.localeCompare(b)))

  const nodes: MapNode[] = []
  const byId = new Map<string, MapNode>()
  const edges: MapEdge[] = []
  const edgeIds = new Set<string>()
  const blocks: MapLayout['blocks'] = []
  const nodeOf = new Map<TraceItem, string>()
  const groupOfTsr = new Map<TraceItem, string>()
  const groupOfSsr = new Map<TraceItem, string>()
  const addEdge = (from: string, to: string, style: EdgeStyle): void => {
    const id = `${from}->${to}`
    if (edgeIds.has(id)) return
    edgeIds.add(id)
    edges.push({ id, from, to, style })
  }
  const place = (n: Omit<MapNode, 'y'>, y: number): MapNode => {
    const node = { ...n, y } as MapNode
    nodes.push(node)
    byId.set(node.id, node)
    return node
  }

  let top = 0
  for (const key of keys) {
    if (opts.sg !== 'all' && opts.sg !== key) continue
    const rows = sw.tsrs.filter((r) => blockOfTsr(r.item) === key)
    const extras = [...extraTsrs].filter((t) => blockOfTsr(t) === key)
    const bssrs = ssrs.filter((s) => ssrBlock.get(s) === key)
    if (rows.length === 0 && extras.length === 0 && bssrs.length === 0) continue
    const expanded = opts.expandAll || opts.expanded.has(key)
    const normal = rows.filter(isNormal)
    const normalSet = new Set(normal.map((r) => r.item))
    const grouped = (s: SsrRow): boolean => {
      if (expanded || !cleanSsr(s)) return false
      const targets = s.refs.filter(isResolved).flatMap((r) => r.targets)
      return targets.length > 0 && targets.every((t) => normalSet.has(t))
    }
    blocks.push({ key, label: key, collapsible: normal.length })

    // TSR 열
    let y = top
    const shown = (expanded ? rows : rows.filter((r) => !normalSet.has(r.item))).sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.item.rawId.localeCompare(b.item.rawId) || a.item.dupIndex - b.item.dupIndex
    )
    for (const r of shown) {
      const id = nodeIdOf(r.item)
      place({ id, col: 0, h: CARD_H, kind: 'item', tone: TONE[r.status], title: idLabel(r.item), sub: oneLine(r.item.title), status: r.status, item: r.item }, y)
      nodeOf.set(r.item, id)
      y += CARD_H + GAP
    }
    for (const t of extras) {
      const id = nodeIdOf(t)
      place({ id, col: 0, h: CARD_H, kind: 'item', tone: 'na', title: idLabel(t), sub: `S/W 할당 아님 · ${t.allocationRaw || '-'}`, item: t }, y)
      nodeOf.set(t, id)
      y += CARD_H + GAP
    }
    if (!expanded && normal.length > 0) {
      const gid = `group-tsr:${key}`
      place({ id: gid, col: 0, h: CARD_H, kind: 'group', tone: 'group', title: `정상 TSR ${normal.length}개`, sub: `${key} · 누르면 펼치기`, block: key }, y)
      for (const r of normal) groupOfTsr.set(r.item, gid)
      y += CARD_H + GAP
    }
    const tsrBottom = y

    // SSR 열: 연결된 TSR 위치 평균 순서
    const anchorOf = (s: SsrRow): number => {
      const ys = s.refs
        .flatMap((r) => r.targets)
        .map((t) => nodeOf.get(t) ?? groupOfTsr.get(t))
        .map((id) => (id ? byId.get(id)?.y : undefined))
        .filter((v): v is number => v !== undefined)
      return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : Number.MAX_SAFE_INTEGER
    }
    type Slot = { anchor: number; kind: 'ssr'; s: SsrRow } | { anchor: number; kind: 'none'; r: SwTsrRow } | { anchor: number; kind: 'group'; n: number }
    const groupedSsrs = bssrs.filter(grouped)
    const slots: Slot[] = [
      ...bssrs.filter((s) => !grouped(s)).map((s) => ({ anchor: anchorOf(s), kind: 'ssr' as const, s })),
      ...shown.filter((r) => r.status === '누락').map((r) => ({ anchor: byId.get(nodeIdOf(r.item))!.y, kind: 'none' as const, r }))
    ]
    if (groupedSsrs.length > 0) slots.push({ anchor: byId.get(`group-tsr:${key}`)?.y ?? Number.MAX_SAFE_INTEGER, kind: 'group', n: groupedSsrs.length })
    slots.sort((a, b) => a.anchor - b.anchor)
    let sy = top
    for (const s of slots) {
      if (s.kind === 'ssr') {
        const row = s.s
        const id = nodeIdOf(row.item)
        const tone: NodeTone = row.problems.length > 0 ? (row.problems.some((p) => p.startsWith('없는') || p.includes('TSR 없음') || p.includes('TSR 연결 없음')) ? 'missing' : 'check') : row.safety ? 'ok' : 'na'
        place({ id, col: 1, h: CARD_H, kind: 'item', tone, title: idLabel(row.item), sub: oneLine(row.item.title), status: row.status, item: row.item }, sy)
        nodeOf.set(row.item, id)
        sy += CARD_H + GAP
      } else if (s.kind === 'none') {
        const tid = nodeIdOf(s.r.item)
        const gid = `ghost-ssr:${tid}`
        place({ id: gid, col: 1, h: GHOST_H, kind: 'ghost', tone: 'ghost', title: 'SSR 없음', sub: `${s.r.item.rawId}을(를) 가리키는 SSR이 없음` }, sy)
        addEdge(tid, gid, 'missing')
        sy += GHOST_H + GAP
      } else {
        const gid = `group-ssr:${key}`
        place({ id: gid, col: 1, h: CARD_H, kind: 'group', tone: 'group', title: `SSR ${s.n}개`, sub: '정상 연결 · 누르면 펼치기', block: key }, sy)
        for (const x of groupedSsrs) groupOfSsr.set(x.item, gid)
        addEdge(`group-tsr:${key}`, gid, 'ok')
        sy += CARD_H + GAP
      }
    }

    // TSR 쪽 빈 카드: 없는 TSR 참조, TSR 미기재
    let gy = tsrBottom
    for (const row of bssrs) {
      const sid = nodeOf.get(row.item)
      if (!sid) continue
      const sy0 = byId.get(sid)!.y
      const ghosts: { id: string; title: string; sub: string }[] = []
      for (const r of row.refs) if (r.method === 'missing') ghosts.push({ id: `ghost-tsr:${sid}:${normalizeId(r.ref)}`, title: `${r.ref} 없음`, sub: 'TSC에 없는 ID' })
      if (row.refs.length === 0 && row.problems.length > 0) ghosts.push({ id: `ghost-tsr:${sid}`, title: 'TSR 미기재', sub: row.problems[0] })
      for (const g of ghosts) {
        const at = Math.max(gy, sy0)
        place({ id: g.id, col: 0, h: GHOST_H, kind: 'ghost', tone: 'ghost', title: g.title, sub: g.sub }, at)
        addEdge(g.id, sid, 'missing')
        gy = at + GHOST_H + GAP
      }
    }
    top = Math.max(top + CARD_H + GAP, gy, sy) + BLOCK_GAP
  }

  // TSR → SSR 선
  for (const s of ssrs) {
    const to = nodeOf.get(s.item) ?? groupOfSsr.get(s.item)
    if (!to) continue
    for (const r of s.refs) {
      if (r.method === 'missing') continue
      for (const t of r.targets) {
        const from = nodeOf.get(t) ?? groupOfTsr.get(t)
        if (!from) continue
        if (from.startsWith('group-tsr') && to.startsWith('group-ssr')) continue
        addEdge(from, to, r.method === 'ambiguous' || t.dupCount > 1 || s.item.dupCount > 1 ? 'check' : 'ok')
      }
    }
  }

  nodes.push({ id: 'swtest', col: 2, y: 0, h: CARD_H + 20, kind: 'placeholder', tone: 'pending', title: 'SW 요구사항 시험', sub: '문서 미등록 (양식이 정해지면 M5 칸 지정으로)' })
  const height = Math.max(CARD_H + 20, ...nodes.map((n) => n.y + n.h)) + 8
  const last = SOFTWARE_COLUMNS[SOFTWARE_COLUMNS.length - 1]
  return { columns: SOFTWARE_COLUMNS, nodes, edges, width: last.x + last.w, height, blocks }
}
