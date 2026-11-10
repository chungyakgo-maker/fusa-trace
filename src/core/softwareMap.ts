/**
 * 소프트웨어·하드웨어 탭 연결 지도 배치 (공용): 위 단계(TSR) → 아래 단계(SSR·HSR) → 다음 단계(SW 시험·FMEDA)
 * - 블록: TSR ID의 SG 번호 (없으면 "일반·기타"), TSR 연결이 없는 아래 항목은 맨 아래 "TSR 연결 없음"
 * - 누락: TSR → "SSR 없음"/"HSR 없음" 빈 카드. 없는 TSR 참조·TSR 미기재: TSR 열에 빈 카드
 * - 다음 단계 문서가 있으면 블록마다 "SW 시험 n건" 모음 카드 + "SW 시험 없음" 빈 카드, 없으면 자리 카드
 * - 정상 연결은 블록마다 "정상 TSR n개" / "SSR m개" 묶음
 * - 대상 할당이 아닌 TSR을 가리키는 항목은 그 TSR도 회색 카드로 보여 줌
 */
import type { TraceItem } from './model'
import { isResolved, type Resolution } from './resolve'
import { normalizeId, sgNumber } from './ids'
import type { RefLink, TraceStatus } from './trace'
import type { SoftwareTrace } from './software'
import type { HardwareTrace } from './hardware'
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
  { label: 'SW 요구사항 시험', x: 600, w: 200 }
]
export const HARDWARE_COLUMNS: MapColumn[] = [
  { label: 'TSR (H/W)', x: 0, w: 260 },
  { label: 'HSR', x: 300, w: 260 },
  { label: 'FMEDA', x: 600, w: 200 }
]

export const GENERAL_BLOCK = '일반·기타'
export const NO_TSR_BLOCK = 'TSR 연결 없음'

interface ChainUp {
  item: TraceItem
  status: TraceStatus
  downs: TraceItem[]
  ambiguous: RefLink[]
}
interface ChainDown {
  item: TraceItem
  refs: Resolution[]
  problems: string[]
  /** 지도에 올림 (안전 무관 + 참조 없음은 목록에서만) */
  show: boolean
  /** 문제 없을 때 카드 색 (안전 무관이면 회색) */
  okTone: NodeTone
  next?: { status: TraceStatus; items: TraceItem[]; ambiguous: TraceItem[] }
}
interface ChainSpec {
  columns: MapColumn[]
  up: ChainUp[]
  down: ChainDown[]
  /** "SSR 없음" / "HSR 없음" */
  missingDown: string
  downNoun: string
  /** 다음 단계 문서가 있으면 모음 카드 이름 */
  next?: { noun: string; missing: string }
  placeholder: { title: string; sub: string }
}

function blockOfTsr(item: TraceItem): string {
  const n = sgNumber(item.normId)
  return n !== undefined ? `SG${String(n).padStart(3, '0')}` : GENERAL_BLOCK
}

function buildChainMap(spec: ChainSpec, opts: MapOptions): MapLayout {
  const upOf = new Map(spec.up.map((u) => [u.item, u]))
  const downOf = new Map(spec.down.map((d) => [d.item, d]))
  const cleanDown = (d: ChainDown): boolean => d.problems.length === 0 && (!d.next || (d.next.status !== '누락' && d.next.status !== '확인 필요'))
  const isNormal = (u: ChainUp): boolean => u.status === '연결됨' && u.ambiguous.length === 0 && u.item.dupCount === 1 && u.downs.every((x) => cleanDown(downOf.get(x)!))

  // 아래 항목이 가리키는 TSR 중 대상 할당이 아닌 것도 보여 줌
  const extra = new Set<TraceItem>()
  for (const d of spec.down) for (const r of d.refs) for (const t of r.targets) if (!upOf.has(t)) extra.add(t)

  const downs = spec.down.filter((d) => d.show)
  const downBlock = new Map<ChainDown, string>()
  for (const d of downs) {
    const first = d.refs.flatMap((r) => r.targets)[0]
    downBlock.set(d, first ? blockOfTsr(first) : NO_TSR_BLOCK)
  }
  const keys = [...new Set([...spec.up.map((u) => blockOfTsr(u.item)), ...[...extra].map(blockOfTsr), ...downBlock.values()])]
  keys.sort((a, b) => (a === NO_TSR_BLOCK ? 1 : b === NO_TSR_BLOCK ? -1 : a === GENERAL_BLOCK ? 1 : b === GENERAL_BLOCK ? -1 : a.localeCompare(b)))

  const nodes: MapNode[] = []
  const byId = new Map<string, MapNode>()
  const edges: MapEdge[] = []
  const edgeIds = new Set<string>()
  const blocks: MapLayout['blocks'] = []
  const nodeOf = new Map<TraceItem, string>()
  const groupOfUp = new Map<TraceItem, string>()
  const groupOfDown = new Map<TraceItem, string>()
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
    const ups = spec.up.filter((u) => blockOfTsr(u.item) === key)
    const extras = [...extra].filter((t) => blockOfTsr(t) === key)
    const bdowns = downs.filter((d) => downBlock.get(d) === key)
    if (ups.length === 0 && extras.length === 0 && bdowns.length === 0) continue
    const expanded = opts.expandAll || opts.expanded.has(key)
    const normal = ups.filter(isNormal)
    const normalSet = new Set(normal.map((u) => u.item))
    const grouped = (d: ChainDown): boolean => {
      if (expanded || !cleanDown(d)) return false
      const targets = d.refs.filter(isResolved).flatMap((r) => r.targets)
      return targets.length > 0 && targets.every((t) => normalSet.has(t))
    }
    blocks.push({ key, label: key, collapsible: normal.length })

    // 위 단계 (TSR) 열
    let y = top
    const shown = (expanded ? ups : ups.filter((u) => !normalSet.has(u.item))).sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.item.rawId.localeCompare(b.item.rawId) || a.item.dupIndex - b.item.dupIndex
    )
    for (const u of shown) {
      const id = nodeIdOf(u.item)
      place({ id, col: 0, h: CARD_H, kind: 'item', tone: TONE[u.status], title: idLabel(u.item), sub: oneLine(u.item.title), status: u.status, item: u.item }, y)
      nodeOf.set(u.item, id)
      y += CARD_H + GAP
    }
    for (const t of extras) {
      const id = nodeIdOf(t)
      place({ id, col: 0, h: CARD_H, kind: 'item', tone: 'na', title: idLabel(t), sub: `할당이 다름 · ${t.allocationRaw || '-'}`, item: t }, y)
      nodeOf.set(t, id)
      y += CARD_H + GAP
    }
    if (!expanded && normal.length > 0) {
      const gid = `group-up:${key}`
      place({ id: gid, col: 0, h: CARD_H, kind: 'group', tone: 'group', title: `정상 TSR ${normal.length}개`, sub: `${key} · 누르면 펼치기`, block: key }, y)
      for (const u of normal) groupOfUp.set(u.item, gid)
      y += CARD_H + GAP
    }
    const upBottom = y

    // 아래 단계 열: 연결된 TSR 위치 평균 순서
    const anchorOf = (d: ChainDown): number => {
      const ys = d.refs
        .flatMap((r) => r.targets)
        .map((t) => nodeOf.get(t) ?? groupOfUp.get(t))
        .map((id) => (id ? byId.get(id)?.y : undefined))
        .filter((v): v is number => v !== undefined)
      return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : Number.MAX_SAFE_INTEGER
    }
    type Slot = { anchor: number; kind: 'down'; d: ChainDown } | { anchor: number; kind: 'none'; u: ChainUp } | { anchor: number; kind: 'group'; n: number }
    const groupedDowns = bdowns.filter(grouped)
    const slots: Slot[] = [
      ...bdowns.filter((d) => !grouped(d)).map((d) => ({ anchor: anchorOf(d), kind: 'down' as const, d })),
      ...shown.filter((u) => u.status === '누락').map((u) => ({ anchor: byId.get(nodeIdOf(u.item))!.y, kind: 'none' as const, u }))
    ]
    if (groupedDowns.length > 0) slots.push({ anchor: byId.get(`group-up:${key}`)?.y ?? Number.MAX_SAFE_INTEGER, kind: 'group', n: groupedDowns.length })
    slots.sort((a, b) => a.anchor - b.anchor)
    let dy = top
    for (const s of slots) {
      if (s.kind === 'down') {
        const d = s.d
        const id = nodeIdOf(d.item)
        const missing = d.problems.some((p) => p.startsWith('없는') || p.includes('TSR 없음') || p.includes('TSR 연결 없음'))
        const tone: NodeTone = d.problems.length > 0 ? (missing ? 'missing' : 'check') : d.okTone
        place({ id, col: 1, h: CARD_H, kind: 'item', tone, title: idLabel(d.item), sub: oneLine(d.item.title), status: d.next?.status, item: d.item }, dy)
        nodeOf.set(d.item, id)
        dy += CARD_H + GAP
      } else if (s.kind === 'none') {
        const tid = nodeIdOf(s.u.item)
        const gid = `ghost-down:${tid}`
        place({ id: gid, col: 1, h: GHOST_H, kind: 'ghost', tone: 'ghost', title: spec.missingDown, sub: `${s.u.item.rawId}을(를) 가리키는 ${spec.downNoun}이(가) 없음` }, dy)
        addEdge(tid, gid, 'missing')
        dy += GHOST_H + GAP
      } else {
        const gid = `group-down:${key}`
        place({ id: gid, col: 1, h: CARD_H, kind: 'group', tone: 'group', title: `${spec.downNoun} ${s.n}개`, sub: '정상 연결 · 누르면 펼치기', block: key }, dy)
        for (const x of groupedDowns) groupOfDown.set(x.item, gid)
        addEdge(`group-up:${key}`, gid, 'ok')
        dy += CARD_H + GAP
      }
    }

    // 다음 단계 열: 블록마다 모음 카드 + 없음 빈 카드
    let ny = top
    if (spec.next) {
      const items = new Set<TraceItem>()
      const from = new Map<string, EdgeStyle>()
      const ys: number[] = []
      const ghosts: { id: string; did: string; y: number; d: ChainDown }[] = []
      for (const d of bdowns) {
        if (!d.next) continue
        const did = nodeOf.get(d.item) ?? groupOfDown.get(d.item)
        if (!did) continue
        const dyy = byId.get(did)!.y
        for (const t of d.next.items) {
          items.add(t)
          if (from.get(did) !== 'ok') from.set(did, 'ok')
          ys.push(dyy)
        }
        for (const t of d.next.ambiguous) {
          items.add(t)
          if (!from.has(did)) from.set(did, 'check')
          ys.push(dyy)
        }
        if (d.next.status === '누락' && nodeOf.has(d.item)) ghosts.push({ id: `ghost-next:${did}`, did, y: dyy, d })
      }
      type NSlot = { anchor: number; kind: 'cluster' } | { anchor: number; kind: 'ghost'; g: (typeof ghosts)[number] }
      const nslots: NSlot[] = ghosts.map((g) => ({ anchor: g.y, kind: 'ghost' as const, g }))
      if (items.size > 0) nslots.push({ anchor: ys.reduce((a, b) => a + b, 0) / ys.length, kind: 'cluster' })
      nslots.sort((a, b) => a.anchor - b.anchor)
      for (const s of nslots) {
        if (s.kind === 'cluster') {
          const id = `next:${key}`
          place({ id, col: 2, h: CARD_H, kind: 'cluster', tone: 'ok', title: `${spec.next.noun} ${items.size}건`, sub: `${key} 연결`, items: [...items] }, ny)
          for (const [did, style] of from) addEdge(did, id, style)
          ny += CARD_H + GAP
        } else {
          place({ id: s.g.id, col: 2, h: GHOST_H, kind: 'ghost', tone: 'ghost', title: spec.next.missing, sub: `${s.g.d.item.rawId}을(를) 검증하는 ${spec.next.noun}이 없음` }, ny)
          addEdge(s.g.did, s.g.id, 'missing')
          ny += GHOST_H + GAP
        }
      }
    }

    // TSR 쪽 빈 카드: 없는 TSR 참조, TSR 미기재
    let gy = upBottom
    for (const d of bdowns) {
      const sid = nodeOf.get(d.item)
      if (!sid) continue
      const sy0 = byId.get(sid)!.y
      const ghosts: { id: string; title: string; sub: string }[] = []
      for (const r of d.refs) if (r.method === 'missing') ghosts.push({ id: `ghost-up:${sid}:${normalizeId(r.ref)}`, title: `${r.ref} 없음`, sub: 'TSC에 없는 ID' })
      if (d.refs.length === 0 && d.problems.length > 0) ghosts.push({ id: `ghost-up:${sid}`, title: 'TSR 미기재', sub: d.problems[0] })
      for (const g of ghosts) {
        const at = Math.max(gy, sy0)
        place({ id: g.id, col: 0, h: GHOST_H, kind: 'ghost', tone: 'ghost', title: g.title, sub: g.sub }, at)
        addEdge(g.id, sid, 'missing')
        gy = at + GHOST_H + GAP
      }
    }
    top = Math.max(top + CARD_H + GAP, gy, dy, ny) + BLOCK_GAP
  }

  // TSR → 아래 단계 선
  for (const d of downs) {
    const to = nodeOf.get(d.item) ?? groupOfDown.get(d.item)
    if (!to) continue
    for (const r of d.refs) {
      if (r.method === 'missing') continue
      for (const t of r.targets) {
        const from = nodeOf.get(t) ?? groupOfUp.get(t)
        if (!from) continue
        if (from.startsWith('group-up') && to.startsWith('group-down')) continue
        addEdge(from, to, r.method === 'ambiguous' || t.dupCount > 1 || d.item.dupCount > 1 ? 'check' : 'ok')
      }
    }
  }

  if (!spec.next) nodes.push({ id: 'next-placeholder', col: 2, y: 0, h: CARD_H + 20, kind: 'placeholder', tone: 'pending', title: spec.placeholder.title, sub: spec.placeholder.sub })
  const height = Math.max(CARD_H + 20, ...nodes.map((n) => n.y + n.h)) + 8
  const last = spec.columns[spec.columns.length - 1]
  return { columns: spec.columns, nodes, edges, width: last.x + last.w, height, blocks }
}

export function buildSoftwareMap(sw: SoftwareTrace, opts: MapOptions): MapLayout {
  return buildChainMap(
    {
      columns: SOFTWARE_COLUMNS,
      up: sw.tsrs.map((t) => ({ item: t.item, status: t.status, downs: t.ssrs.map((x) => x.ssr), ambiguous: t.ambiguous })),
      down: sw.ssrs.map((s) => ({
        item: s.item,
        refs: s.refs,
        problems: s.problems,
        show: s.safety || s.refs.length > 0,
        okTone: s.safety ? 'ok' : 'na',
        next: sw.hasTests && s.safety ? { status: s.status, items: s.tests.map((x) => x.test), ambiguous: s.testAmbiguous.map((l) => l.from) } : undefined
      })),
      missingDown: 'SSR 없음',
      downNoun: 'SSR',
      next: sw.hasTests ? { noun: 'SW 시험', missing: 'SW 시험 없음' } : undefined,
      placeholder: { title: 'SW 요구사항 시험', sub: '시험 명세 미등록 (문서 넣기 → [칸 지정])' }
    },
    opts
  )
}

export function buildHardwareMap(hw: HardwareTrace, opts: MapOptions): MapLayout {
  return buildChainMap(
    {
      columns: HARDWARE_COLUMNS,
      up: hw.tsrs.map((t) => ({ item: t.item, status: t.status, downs: t.hsrs.map((x) => x.hsr), ambiguous: t.ambiguous })),
      down: hw.hsrs.map((h) => ({ item: h.item, refs: h.refs, problems: h.problems, show: true, okTone: 'ok' })),
      missingDown: 'HSR 없음',
      downNoun: 'HSR',
      placeholder: { title: 'FMEDA', sub: hw.hasFmeda ? 'FMEDA 등록됨 (양식이 정해지지 않아 내용은 읽지 않음)' : '문서 미등록' }
    },
    opts
  )
}
