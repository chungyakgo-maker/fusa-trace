/**
 * 연결 지도 배치 계산 (SPEC §9.1) — 화면과 분리한 순수 함수
 * - 열: SG → FSR → TSR → FMEA 근거 (M4 전까지 자리)
 * - SG마다 묶음(블록)으로 위에서 아래로 쌓음. 문제 있는 항목을 먼저
 * - 정상 연결은 SG마다 "정상 FSR n개" / "TSR m개" 묶음 카드로 접음 (펼치기 가능)
 * - 누락: FSR → "TSR 없음" 빈 카드로 주황 점선. 없는 FSR 참조: "○○ 없음" 빈 카드 → TSR로 주황 점선
 * - 확인 필요(애매한 참조, ID 중복): 노란 점선
 */
import type { TraceItem } from './model'
import { isResolved } from './resolve'
import { normalizeId, sgNumber } from './ids'
import type { FsrRow, SystemTrace, TraceStatus, TsrRow } from './trace'

export const MAP_COLUMNS = ['안전 목표 (SG)', 'FSR', 'TSR', 'FMEA 근거'] as const
export const COL_X = [0, 186, 452, 728]
export const COL_W = [150, 230, 240, 160]
export const CARD_H = 56
export const GHOST_H = 40
const GAP = 10
const BLOCK_GAP = 28

export type NodeTone = 'ok' | 'check' | 'missing' | 'na' | 'pending' | 'ghost' | 'group' | 'sg'
export type EdgeStyle = 'ok' | 'check' | 'missing'

export interface MapNode {
  id: string
  col: number
  y: number
  h: number
  kind: 'sg' | 'item' | 'group' | 'ghost' | 'placeholder'
  tone: NodeTone
  title: string
  sub: string
  status?: TraceStatus
  item?: TraceItem
  /** 묶음 카드: 펼칠 SG 블록 */
  block?: string
}

export interface MapEdge {
  id: string
  from: string
  to: string
  style: EdgeStyle
}

export interface MapLayout {
  nodes: MapNode[]
  edges: MapEdge[]
  width: number
  height: number
  /** 블록(SG) 목록: 키 → 접힌 정상 항목 수 */
  blocks: { key: string; label: string; collapsible: number }[]
}

export interface MapOptions {
  /** 'all' 또는 SG 블록 키 */
  sg: string
  /** 펼친 블록 */
  expanded: ReadonlySet<string>
  expandAll: boolean
}

export const UNKNOWN_BLOCK = '(SG 미상)'
const STATUS_ORDER: Record<TraceStatus, number> = { 누락: 0, '확인 필요': 1, 연결됨: 2, '문서 대기': 3, '대상 아님': 4 }
const TONE: Record<TraceStatus, NodeTone> = { 연결됨: 'ok', '확인 필요': 'check', 누락: 'missing', '대상 아님': 'na', '문서 대기': 'pending' }

export function nodeIdOf(item: TraceItem): string {
  return `${item.kind}:${item.normId}#${item.dupIndex}`
}

function oneLine(s: string, max = 40): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

function idLabel(item: TraceItem): string {
  return item.dupCount > 1 ? `${item.rawId} (중복 #${item.dupIndex})` : item.rawId
}

/** SG 블록 키: FSR의 SG (정규화). SG 번호가 같으면 같은 블록 (`SG001` = `SG_01`) */
function blockKeyFor(sg: string | undefined, sgKeys: string[]): string {
  if (!sg) return UNKNOWN_BLOCK
  const n = sgNumber(sg)
  const same = sgKeys.find((k) => k === sg || (n !== undefined && sgNumber(k) === n))
  return same ?? sg
}

export function buildTraceMap(t: SystemTrace, opts: MapOptions): MapLayout {
  const sgByKey = new Map(t.sgs.map((s) => [s.normId, s]))
  const sgKeys = [...sgByKey.keys()]

  // FSR → 블록
  const fsrBlock = new Map<TraceItem, string>()
  for (const f of t.fsrs) fsrBlock.set(f.item, blockKeyFor(f.item.sg, sgKeys))

  // TSR → 블록: 처음 연결된 FSR의 블록, 없으면 TSR ID의 SG 번호, 그래도 없으면 SG 미상
  const tsrBlock = new Map<TsrRow, string>()
  for (const tr of t.tsrs) {
    const first = tr.refs.flatMap((r) => r.targets).find((x) => fsrBlock.has(x))
    let key = first ? fsrBlock.get(first)! : undefined
    if (!key) {
      const n = sgNumber(tr.item.normId)
      key = n !== undefined ? sgKeys.find((k) => sgNumber(k) === n) ?? `SG${String(n).padStart(3, '0')}` : UNKNOWN_BLOCK
    }
    tsrBlock.set(tr, key)
  }

  const clean = (tr: TsrRow): boolean => tr.problems.length === 0
  const tsrRowOf = new Map(t.tsrs.map((tr) => [tr.item, tr]))
  const isNormalFsr = (f: FsrRow): boolean =>
    f.status === '연결됨' && f.ambiguous.length === 0 && f.item.dupCount === 1 && f.tsrs.every((x) => clean(tsrRowOf.get(x.tsr)!))

  // 블록 순서: SG 문서 순서 → 그 밖의 SG → SG 미상
  const blockKeys: string[] = []
  const addKey = (k: string): void => {
    if (!blockKeys.includes(k)) blockKeys.push(k)
  }
  sgKeys.forEach(addKey)
  ;[...new Set([...fsrBlock.values(), ...tsrBlock.values()])].filter((k) => k !== UNKNOWN_BLOCK).sort().forEach(addKey)
  if ([...fsrBlock.values(), ...tsrBlock.values()].includes(UNKNOWN_BLOCK)) addKey(UNKNOWN_BLOCK)

  const nodes: MapNode[] = []
  const byId = new Map<string, MapNode>()
  const edges: MapEdge[] = []
  const blocks: MapLayout['blocks'] = []
  const nodeOfItem = new Map<TraceItem, string>()
  const groupOfFsr = new Map<TraceItem, string>()
  const groupOfTsr = new Map<TraceItem, string>()
  const edgeIds = new Set<string>()
  const addEdge = (from: string, to: string, style: EdgeStyle): void => {
    const id = `${from}->${to}`
    if (edgeIds.has(id)) return
    edgeIds.add(id)
    edges.push({ id, from, to, style })
  }

  let top = 0
  for (const key of blockKeys) {
    if (opts.sg !== 'all' && opts.sg !== key) continue
    const fsrs = t.fsrs.filter((f) => fsrBlock.get(f.item) === key)
    const tsrs = t.tsrs.filter((tr) => tsrBlock.get(tr) === key)
    if (fsrs.length === 0 && tsrs.length === 0 && !sgByKey.has(key)) continue

    const normal = fsrs.filter(isNormalFsr)
    const normalSet = new Set(normal.map((f) => f.item))
    const expanded = opts.expandAll || opts.expanded.has(key)
    // 정상 FSR에만 연결된 깨끗한 TSR은 묶음에 넣음
    const groupedTsr = (tr: TsrRow): boolean => {
      if (expanded || !clean(tr)) return false
      const targets = tr.refs.filter(isResolved).flatMap((r) => r.targets)
      return targets.length > 0 && targets.every((x) => normalSet.has(x))
    }
    const shownFsrs = (expanded ? fsrs : fsrs.filter((f) => !normalSet.has(f.item))).sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.item.rawId.localeCompare(b.item.rawId) || a.item.dupIndex - b.item.dupIndex
    )
    const grouped = tsrs.filter(groupedTsr)
    const shownTsrs = tsrs.filter((tr) => !groupedTsr(tr))
    const collapsible = normal.length
    blocks.push({ key, label: key, collapsible })

    // SG 카드
    const sg = sgByKey.get(key)
    const sgId = `sg:${key}`
    const sgNode: MapNode = {
      id: sgId,
      col: 0,
      y: top,
      h: CARD_H,
      kind: 'sg',
      tone: 'sg',
      title: key,
      sub: sg ? oneLine(`${sg.asil ? `ASIL ${sg.asil} · ` : ''}${sg.title}`, 26) : key === UNKNOWN_BLOCK ? 'SG를 알 수 없는 항목' : 'SG 정의 없음',
      item: sg
    }
    nodes.push(sgNode)
    byId.set(sgId, sgNode)

    // FSR 열
    let y = top
    const place = (n: Omit<MapNode, 'y'>, at: number): MapNode => {
      const node = { ...n, y: at } as MapNode
      nodes.push(node)
      byId.set(node.id, node)
      return node
    }
    for (const f of shownFsrs) {
      const id = nodeIdOf(f.item)
      place({ id, col: 1, h: CARD_H, kind: 'item', tone: TONE[f.status], title: idLabel(f.item), sub: oneLine(f.item.title), status: f.status, item: f.item }, y)
      nodeOfItem.set(f.item, id)
      addEdge(sgId, id, 'ok')
      y += CARD_H + GAP
    }
    if (!expanded && normal.length > 0) {
      const gid = `group-fsr:${key}`
      place({ id: gid, col: 1, h: CARD_H, kind: 'group', tone: 'group', title: `정상 FSR ${normal.length}개`, sub: '누르면 펼치기', block: key }, y)
      for (const f of normal) groupOfFsr.set(f.item, gid)
      addEdge(sgId, gid, 'ok')
      y += CARD_H + GAP
    }
    const fsrBottom = y

    // TSR 열: 연결된 FSR 위치의 평균 순서 (선이 덜 꼬이게)
    const yOf = (id: string | undefined): number | undefined => (id ? byId.get(id)?.y : undefined)
    const fsrNodeY = new Map<string, number>()
    for (const f of shownFsrs) fsrNodeY.set(nodeIdOf(f.item), byId.get(nodeIdOf(f.item))!.y)
    const grp = byId.get(`group-fsr:${key}`)
    if (grp) fsrNodeY.set(grp.id, grp.y)
    const anchor = (tr: TsrRow): number => {
      const ys = tr.refs
        .flatMap((r) => r.targets)
        .map((x) => nodeOfItem.get(x) ?? groupOfFsr.get(x))
        .map((id) => (id ? fsrNodeY.get(id) : undefined))
        .filter((v): v is number => v !== undefined)
      return ys.length > 0 ? ys.reduce((a, b) => a + b, 0) / ys.length : Number.MAX_SAFE_INTEGER
    }
    type TsrSlot = { anchor: number; kind: 'tsr'; tr: TsrRow } | { anchor: number; kind: 'none'; f: FsrRow } | { anchor: number; kind: 'group' }
    const slots: TsrSlot[] = [
      ...shownTsrs.map((tr) => ({ anchor: anchor(tr), kind: 'tsr' as const, tr })),
      ...shownFsrs.filter((f) => f.status === '누락').map((f) => ({ anchor: yOf(nodeOfItem.get(f.item)) ?? 0, kind: 'none' as const, f }))
    ]
    if (grouped.length > 0) slots.push({ anchor: fsrNodeY.get(`group-fsr:${key}`) ?? Number.MAX_SAFE_INTEGER, kind: 'group' })
    slots.sort((a, b) => a.anchor - b.anchor)

    let ty = top
    for (const s of slots) {
      if (s.kind === 'tsr') {
        const tr = s.tr
        const id = nodeIdOf(tr.item)
        const tone: NodeTone = tr.problems.length > 0 ? (tr.problems.some((p) => p.startsWith('없는')) ? 'missing' : 'check') : tr.status === '대상 아님' && tr.item.status === 'notApplicable' ? 'na' : 'ok'
        place({ id, col: 2, h: CARD_H, kind: 'item', tone, title: idLabel(tr.item), sub: oneLine(tr.item.title), status: tr.status, item: tr.item }, ty)
        nodeOfItem.set(tr.item, id)
        ty += CARD_H + GAP
      } else if (s.kind === 'none') {
        const fid = nodeIdOf(s.f.item)
        const gid = `ghost-tsr:${fid}`
        place({ id: gid, col: 2, h: GHOST_H, kind: 'ghost', tone: 'ghost', title: 'TSR 없음', sub: `${s.f.item.rawId}을(를) 가리키는 TSR이 없음` }, ty)
        addEdge(fid, gid, 'missing')
        ty += GHOST_H + GAP
      } else {
        const gid = `group-tsr:${key}`
        place({ id: gid, col: 2, h: CARD_H, kind: 'group', tone: 'group', title: `TSR ${grouped.length}개`, sub: '정상 연결 · 누르면 펼치기', block: key }, ty)
        for (const tr of grouped) groupOfTsr.set(tr.item, gid)
        addEdge(`group-fsr:${key}`, gid, 'ok')
        ty += CARD_H + GAP
      }
    }

    // 없는 FSR 참조: FSR 열에 빈 카드
    let gy = fsrBottom
    for (const tr of shownTsrs) {
      const tid = nodeIdOf(tr.item)
      const ty0 = byId.get(tid)!.y
      for (const r of tr.refs) {
        if (r.method !== 'missing') continue
        const gid = `ghost-fsr:${tid}:${normalizeId(r.ref)}`
        const at = Math.max(gy, ty0)
        place({ id: gid, col: 1, h: GHOST_H, kind: 'ghost', tone: 'ghost', title: `${r.ref} 없음`, sub: 'FSR 문서에 없는 ID' }, at)
        addEdge(gid, tid, 'missing')
        gy = at + GHOST_H + GAP
      }
    }
    top = Math.max(top + CARD_H + GAP, gy, ty) + BLOCK_GAP
  }

  // TSR → FSR 선 (블록을 넘나드는 선 포함). 화면에 없는 블록의 항목은 생략
  for (const tr of t.tsrs) {
    const to = nodeOfItem.get(tr.item) ?? groupOfTsr.get(tr.item)
    if (!to) continue
    for (const r of tr.refs) {
      if (r.method === 'missing') continue
      for (const target of r.targets) {
        const from = nodeOfItem.get(target) ?? groupOfFsr.get(target)
        if (!from) continue
        if (from.startsWith('group-fsr') && to.startsWith('group-tsr')) continue // 묶음끼리는 위에서 한 줄
        const style: EdgeStyle = r.method === 'ambiguous' || tr.item.dupCount > 1 || target.dupCount > 1 ? 'check' : 'ok'
        addEdge(from, to, style)
      }
    }
  }

  // FMEA 근거 열 (M4 전까지 자리)
  const fmea = t.cards[2]
  nodes.push({ id: 'fmea', col: 3, y: 0, h: CARD_H + 20, kind: 'placeholder', tone: 'pending', title: 'FMEA 근거', sub: fmea?.pending ?? '' })

  const height = Math.max(CARD_H + 20, ...nodes.map((n) => n.y + n.h)) + 8
  return { nodes, edges, width: COL_X[3] + COL_W[3], height, blocks }
}

/** 고른 카드의 위쪽(선 거꾸로)과 아래쪽(선 따라) 연결. 형제 카드로는 번지지 않음 */
export function connectedOf(layout: MapLayout, nodeId: string): { nodes: Set<string>; edges: Set<string> } {
  const out = new Map<string, MapEdge[]>()
  const into = new Map<string, MapEdge[]>()
  for (const e of layout.edges) {
    out.set(e.from, [...(out.get(e.from) ?? []), e])
    into.set(e.to, [...(into.get(e.to) ?? []), e])
  }
  const nodes = new Set([nodeId])
  const edges = new Set<string>()
  const walk = (next: Map<string, MapEdge[]>, pick: (e: MapEdge) => string): void => {
    const seen = new Set([nodeId])
    const stack = [nodeId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const e of next.get(cur) ?? []) {
        edges.add(e.id)
        const n = pick(e)
        nodes.add(n)
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
  }
  walk(into, (e) => e.from)
  walk(out, (e) => e.to)
  return { nodes, edges }
}
