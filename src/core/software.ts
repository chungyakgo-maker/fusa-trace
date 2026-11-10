/**
 * 소프트웨어 탭 계산 (SPEC §8, §9.1): TSR(S/W·BOTH) → SSR → SW 요구사항 시험
 * 연결 방향: SSR의 Functional Safety Related에 적힌 TSR → TSR, SW 시험의 검증 대상 칸(칸 지정) → SSR
 * 역방향 확인: TSR 연결이 없는 안전 관련 SSR (ASIL A~D, "Yes인데 TSR 없음"), SSR 연결이 없는 SW 시험
 */
import type { Project, SourceDoc, TraceItem } from './model'
import { activeDocs } from './project'
import { isResolved, Resolver, type Resolution } from './resolve'
import { hasAsil, type RefLink, type StageCard, type TraceStatus } from './trace'

export interface SwTsrRow {
  item: TraceItem
  /** 다음 단계(SSR) 상태 */
  status: TraceStatus
  reason: string
  ssrs: { ssr: TraceItem; method: Resolution['method'] }[]
  ambiguous: RefLink[]
}

export interface SsrRow {
  item: TraceItem
  /** 다음 단계(SW 시험) 상태 */
  status: TraceStatus
  reason: string
  refs: Resolution[]
  /** 위로의 문제: 없는 TSR 참조, 애매한 참조, Yes인데 TSR 없음, ASIL인데 TSR 없음, ID 중복 */
  problems: string[]
  safety: boolean
  /** 이 SSR을 검증하는 SW 시험 */
  tests: { test: TraceItem; method: Resolution['method'] }[]
  testAmbiguous: RefLink[]
}

/** SW 요구사항 시험 (역방향 확인용) */
export interface SwTestRow {
  item: TraceItem
  refs: Resolution[]
  problems: string[]
}

export interface SoftwareTrace {
  hasTsc: boolean
  hasSrs: boolean
  tsrs: SwTsrRow[]
  ssrs: SsrRow[]
  /** SW 시험 명세가 등록됨 */
  hasTests: boolean
  tests: SwTestRow[]
  cards: StageCard[]
  links: RefLink[]
  sources: Map<TraceItem, SourceDoc>
}

export function isSwAllocated(item: TraceItem): boolean {
  return item.allocation === 'SW' || item.allocation === 'BOTH'
}

export function computeSoftwareTrace(p: Project): SoftwareTrace {
  const tscDocs = activeDocs(p, 'TSC')
  const srsDocs = activeDocs(p, 'SRS')
  const testDocs = activeDocs(p, 'SWTEST')
  const allTsrs = tscDocs.flatMap((d) => d.items ?? []).filter((i) => i.kind === 'TSR')
  const ssrs = srsDocs.flatMap((d) => d.items ?? []).filter((i) => i.kind === 'SSR')
  const testItems = testDocs.flatMap((d) => d.items ?? []).filter((i) => i.kind === 'SWTEST')
  const sources = new Map<TraceItem, SourceDoc>()
  for (const d of [...tscDocs, ...srsDocs, ...testDocs]) for (const it of d.items ?? []) sources.set(it, d)

  // SW 시험 → SSR
  const testResolver = new Resolver(ssrs, p.aliases, 'SWTEST')
  const testLinks: RefLink[] = []
  const testRows: SwTestRow[] = testItems.map((test) => {
    const refs = test.refs.map((r) => testResolver.resolve(r))
    for (const r of refs) testLinks.push({ from: test, resolution: r })
    const problems: string[] = []
    for (const r of refs) {
      if (r.method === 'missing') problems.push(`없는 SSR 참조: ${r.ref}`)
      if (r.method === 'ambiguous') problems.push(`확인 필요: ${r.ref} (${r.reason ?? '후보 여러 개'})`)
    }
    if (refs.length === 0) problems.push('검증 대상(SSR) 없음')
    if (test.dupCount > 1) problems.push(`ID 중복 (#${test.dupIndex}/${test.dupCount})`)
    return { item: test, refs, problems }
  })
  // SSR의 참조는 할당과 관계없이 모든 TSR에서 찾음 (H/W TSR을 가리키는 것도 연결로 보여 줌)
  const resolver = new Resolver(allTsrs, p.aliases, 'SRS')

  const links: RefLink[] = []
  const ssrRows: SsrRow[] = ssrs.map((ssr) => {
    const refs = ssr.refs.map((r) => resolver.resolve(r))
    for (const r of refs) links.push({ from: ssr, resolution: r })
    const yes = ssr.attrs['안전관련'] === 'yes'
    const safety = yes || hasAsil(ssr)
    const problems: string[] = []
    for (const r of refs) {
      if (r.method === 'missing') problems.push(`없는 TSR 참조: ${r.ref}`)
      if (r.method === 'ambiguous') problems.push(`확인 필요: ${r.ref} (${r.reason ?? '후보 여러 개'})`)
    }
    if (yes && refs.length === 0) problems.push('Functional Safety Related가 Yes인데 TSR 없음')
    else if (!refs.some(isResolved) && hasAsil(ssr) && refs.length === 0) problems.push(`ASIL ${ssr.asil}인데 TSR 연결 없음`)
    if (ssr.dupCount > 1) problems.push(`ID 중복 (#${ssr.dupIndex}/${ssr.dupCount})`)
    const tests: SsrRow['tests'] = []
    const testAmbiguous: RefLink[] = []
    for (const l of testLinks) {
      if (!l.resolution.targets.includes(ssr)) continue
      if (isResolved(l.resolution)) tests.push({ test: l.from, method: l.resolution.method })
      else if (l.resolution.method === 'ambiguous') testAmbiguous.push(l)
    }
    let status: TraceStatus
    let reason: string
    if (!safety) {
      status = '대상 아님'
      reason = '안전 무관 (Functional Safety Related: No)'
    } else if (testDocs.length === 0) {
      status = '문서 대기'
      reason = 'SW 요구사항 시험 명세 미등록'
    } else if (tests.length > 0) {
      status = '연결됨'
      reason = ''
    } else if (testAmbiguous.length > 0) {
      status = '확인 필요'
      reason = '애매한 시험 참조 (ID 대응표에서 고르기)'
    } else {
      status = '누락'
      reason = 'SW 시험 없음'
    }
    return { item: ssr, status, reason, refs, problems, safety, tests, testAmbiguous }
  })

  const tsrRows: SwTsrRow[] = allTsrs.filter(isSwAllocated).map((tsr) => {
    const linked: SwTsrRow['ssrs'] = []
    const ambiguous: RefLink[] = []
    for (const l of links) {
      if (!l.resolution.targets.includes(tsr)) continue
      if (isResolved(l.resolution)) linked.push({ ssr: l.from, method: l.resolution.method })
      else if (l.resolution.method === 'ambiguous') ambiguous.push(l)
    }
    let status: TraceStatus
    let reason = ''
    if (tsr.status === 'notApplicable') {
      status = '대상 아님'
      reason = `문서 상태: ${tsr.statusRaw}`
    } else if (srsDocs.length === 0) {
      status = '문서 대기'
      reason = 'SRS 미등록'
    } else if (linked.length > 0) {
      status = '연결됨'
    } else if (ambiguous.length > 0) {
      status = '확인 필요'
      reason = tsr.dupCount > 1 ? 'TSR ID 중복이라 어느 쪽인지 고르기' : '애매한 참조 (ID 대응표에서 고르기)'
    } else {
      status = '누락'
      reason = 'SSR 없음'
    }
    return { item: tsr, status, reason, ssrs: linked, ambiguous }
  })

  const needed = tsrRows.filter((r) => r.status !== '대상 아님')
  const cards: StageCard[] = [
    tscDocs.length > 0 ? { label: 'S/W 할당 TSR', count: tsrRows.length } : { label: 'S/W 할당 TSR', pending: 'TSC 미등록' },
    srsDocs.length === 0
      ? { label: 'SSR 연결', pending: 'SRS 미등록' }
      : tscDocs.length === 0
        ? { label: 'SSR 연결', pending: 'TSC 미등록' }
        : { label: 'SSR 연결', linked: needed.filter((r) => r.status === '연결됨').length, total: needed.length },
    testDocs.length === 0
      ? { label: 'SW 요구사항 시험', pending: '시험 명세 미등록 ([칸 지정]으로 넣기)' }
      : srsDocs.length === 0
        ? { label: 'SW 요구사항 시험', pending: 'SRS 미등록' }
        : { label: 'SW 요구사항 시험', linked: ssrRows.filter((s) => s.status === '연결됨').length, total: ssrRows.filter((s) => s.status !== '대상 아님').length }
  ]
  return {
    hasTsc: tscDocs.length > 0,
    hasSrs: srsDocs.length > 0,
    tsrs: tsrRows,
    ssrs: ssrRows,
    hasTests: testDocs.length > 0,
    tests: testRows,
    cards,
    links: [...links, ...testLinks],
    sources
  }
}
