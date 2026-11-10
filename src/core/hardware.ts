/**
 * 하드웨어 탭 계산 (SPEC §8, §9.1): TSR(H/W·BOTH) → HSR → FMEDA(작성 여부만)
 * HSR은 처음 보는 양식이라 칸 지정으로 읽음. 연결 방향: HSR의 위 단계 ID 칸 → TSR
 * 역방향 확인: TSR 연결이 없는 HSR, 없는 TSR 참조
 */
import type { Project, SourceDoc, TraceItem } from './model'
import { activeDocs } from './project'
import { isResolved, Resolver, type Resolution } from './resolve'
import type { RefLink, StageCard, TraceStatus } from './trace'

export interface HwTsrRow {
  item: TraceItem
  /** 다음 단계(HSR) 상태 */
  status: TraceStatus
  reason: string
  hsrs: { hsr: TraceItem; method: Resolution['method'] }[]
  ambiguous: RefLink[]
}

export interface HsrRow {
  item: TraceItem
  /** 다음 단계(FMEDA) 상태 */
  status: TraceStatus
  reason: string
  refs: Resolution[]
  problems: string[]
}

export interface HardwareTrace {
  hasTsc: boolean
  hasHsr: boolean
  hasFmeda: boolean
  tsrs: HwTsrRow[]
  hsrs: HsrRow[]
  cards: StageCard[]
  links: RefLink[]
  sources: Map<TraceItem, SourceDoc>
}

export function isHwAllocated(item: TraceItem): boolean {
  return item.allocation === 'HW' || item.allocation === 'BOTH'
}

export function computeHardwareTrace(p: Project): HardwareTrace {
  const tscDocs = activeDocs(p, 'TSC')
  const hsrDocs = activeDocs(p, 'HSR').filter((d) => (d.items?.length ?? 0) > 0)
  const fmedaDocs = activeDocs(p, 'FMEDA')
  const allTsrs = tscDocs.flatMap((d) => d.items ?? []).filter((i) => i.kind === 'TSR')
  const hsrItems = hsrDocs.flatMap((d) => d.items ?? []).filter((i) => i.kind === 'HSR')
  const sources = new Map<TraceItem, SourceDoc>()
  for (const d of [...tscDocs, ...hsrDocs]) for (const it of d.items ?? []) sources.set(it, d)
  const resolver = new Resolver(allTsrs, p.aliases, 'HSR')

  const links: RefLink[] = []
  const hsrRows: HsrRow[] = hsrItems.map((hsr) => {
    const refs = hsr.refs.map((r) => resolver.resolve(r))
    for (const r of refs) links.push({ from: hsr, resolution: r })
    const problems: string[] = []
    for (const r of refs) {
      if (r.method === 'missing') problems.push(`없는 TSR 참조: ${r.ref}`)
      if (r.method === 'ambiguous') problems.push(`확인 필요: ${r.ref} (${r.reason ?? '후보 여러 개'})`)
    }
    if (refs.length === 0) problems.push('TSR 연결 없음')
    if (hsr.dupCount > 1) problems.push(`ID 중복 (#${hsr.dupIndex}/${hsr.dupCount})`)
    return {
      item: hsr,
      status: hsr.status === 'notApplicable' ? '대상 아님' : '문서 대기',
      reason: hsr.status === 'notApplicable' ? `문서 상태: ${hsr.statusRaw}` : fmedaDocs.length > 0 ? 'FMEDA 등록됨 (양식이 정해지지 않아 내용은 읽지 않음)' : 'FMEDA 미등록',
      refs,
      problems
    }
  })

  const tsrRows: HwTsrRow[] = allTsrs.filter(isHwAllocated).map((tsr) => {
    const linked: HwTsrRow['hsrs'] = []
    const ambiguous: RefLink[] = []
    for (const l of links) {
      if (!l.resolution.targets.includes(tsr)) continue
      if (isResolved(l.resolution)) linked.push({ hsr: l.from, method: l.resolution.method })
      else if (l.resolution.method === 'ambiguous') ambiguous.push(l)
    }
    let status: TraceStatus
    let reason = ''
    if (tsr.status === 'notApplicable') {
      status = '대상 아님'
      reason = `문서 상태: ${tsr.statusRaw}`
    } else if (hsrDocs.length === 0) {
      status = '문서 대기'
      reason = 'HSR 미등록'
    } else if (linked.length > 0) {
      status = '연결됨'
    } else if (ambiguous.length > 0) {
      status = '확인 필요'
      reason = tsr.dupCount > 1 ? 'TSR ID 중복이라 어느 쪽인지 고르기' : '애매한 참조 (ID 대응표에서 고르기)'
    } else {
      status = '누락'
      reason = 'HSR 없음'
    }
    return { item: tsr, status, reason, hsrs: linked, ambiguous }
  })

  const needed = tsrRows.filter((r) => r.status !== '대상 아님')
  const cards: StageCard[] = [
    tscDocs.length > 0 ? { label: 'H/W 할당 TSR', count: tsrRows.length } : { label: 'H/W 할당 TSR', pending: 'TSC 미등록' },
    hsrDocs.length === 0
      ? { label: 'HSR 연결', pending: 'HSR 미등록 ([칸 지정]으로 넣기)' }
      : tscDocs.length === 0
        ? { label: 'HSR 연결', pending: 'TSC 미등록' }
        : { label: 'HSR 연결', linked: needed.filter((r) => r.status === '연결됨').length, total: needed.length },
    { label: 'FMEDA', pending: fmedaDocs.length > 0 ? `등록됨 ${fmedaDocs.length}개 (작성 여부만)` : '문서 미등록' }
  ]
  return { hasTsc: tscDocs.length > 0, hasHsr: hsrDocs.length > 0, hasFmeda: fmedaDocs.length > 0, tsrs: tsrRows, hsrs: hsrRows, cards, links, sources }
}
