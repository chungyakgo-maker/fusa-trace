/**
 * 추적성 계산 (SPEC §8): 시스템 탭 (SG → FSR → TSR → FMEA 근거)
 * 상태: 연결됨 / 확인 필요 / 누락 / 대상 아님 / 문서 대기 — 순수 함수 (화면 공용)
 * 연결 방향: TSR의 Ref ID → FSR, FMEA 고장원인의 TSR ID → TSR (적힌 참조만 사용)
 */
import type { DocKind, Project, SourceDoc, TraceItem } from './model'
import { activeDocs } from './project'
import { isResolved, Resolver, type Resolution } from './resolve'
import { ORIGIN_LABEL } from './fsr'

export type TraceStatus = '연결됨' | '확인 필요' | '누락' | '대상 아님' | '문서 대기'
export const TRACE_STATUSES: readonly TraceStatus[] = ['누락', '확인 필요', '연결됨', '대상 아님', '문서 대기']

export interface RefLink {
  from: TraceItem
  resolution: Resolution
}

/** 참조가 적힌 문서 종류 (별칭 저장용) */
export function sourceKindOf(item: TraceItem): DocKind {
  return item.kind === 'TSR' ? 'TSC' : item.kind === 'FMEA_CAUSE' ? 'FMEA' : item.kind === 'SSR' ? 'SRS' : 'OTHER'
}

export function hasAsil(item: TraceItem): boolean {
  return ['A', 'B', 'C', 'D'].includes(item.asilLevel)
}

export interface FsrRow {
  item: TraceItem
  status: TraceStatus
  /** 상태 이유 (예: "TSR 없음", "타 ECU에 요구") */
  reason: string
  /** 연결된 TSR (해석된 참조) */
  tsrs: { tsr: TraceItem; method: Resolution['method'] }[]
  /** 이 FSR이 후보로 들어간 애매한 참조 */
  ambiguous: RefLink[]
}

export interface TsrRow {
  item: TraceItem
  /** 다음 단계(FMEA 근거) 상태 */
  status: TraceStatus
  reason: string
  /** 위 단계(FSR) 참조 해석 */
  refs: Resolution[]
  /** 위로의 문제: 없는 FSR 참조, 애매한 참조, ID 중복, 참조 없음 */
  problems: string[]
  /** 이 TSR을 근거로 가리키는 FMEA 고장원인 */
  causes: { cause: TraceItem; method: Resolution['method'] }[]
  /** 이 TSR이 후보로 들어간 애매한 FMEA 참조 */
  causeAmbiguous: RefLink[]
}

/** FMEA 고장원인 (역방향 확인용) */
export interface FmeaRow {
  item: TraceItem
  refs: Resolution[]
  /** 없는 TSR 참조, 애매한 참조, ASIL 있는데 TSR 없음 */
  problems: string[]
}

export interface StageCard {
  label: string
  /** 문서 미등록·자리만 있음 */
  pending?: string
  count?: number
  linked?: number
  total?: number
}

export interface SystemTrace {
  hasFsr: boolean
  hasTsc: boolean
  sgs: TraceItem[]
  fsrs: FsrRow[]
  tsrs: TsrRow[]
  /** FMEA 고장원인 (TSR 연결 칸이 있는 FMEA만) */
  causes: FmeaRow[]
  /** FMEA가 등록됐지만 TSR 연결 칸이 없음 (작성 여부만) */
  fmeaNoTsrColumn: boolean
  cards: StageCard[]
  /** ID 대응표용: 위 단계 참조 전체 */
  links: RefLink[]
  /** 항목 → 출처 문서 */
  sources: Map<TraceItem, SourceDoc>
}

function fsrLabel(item: TraceItem): string {
  return item.origin ? ORIGIN_LABEL[item.origin] : ''
}

export function computeSystemTrace(p: Project): SystemTrace {
  const fsrDocs = activeDocs(p, 'FSR')
  const tscDocs = activeDocs(p, 'TSC')
  const fmeaDocs = activeDocs(p, 'FMEA')
  const fsrItems = fsrDocs.flatMap((d) => d.items ?? [])
  const fsrs = fsrItems.filter((i) => i.kind === 'FSR')
  const sgs = fsrItems.filter((i) => i.kind === 'SG')
  const tsrs = tscDocs.flatMap((d) => d.items ?? []).filter((i) => i.kind === 'TSR')
  const sources = new Map<TraceItem, SourceDoc>()
  for (const d of [...fsrDocs, ...tscDocs, ...fmeaDocs]) for (const it of d.items ?? []) sources.set(it, d)
  const resolver = new Resolver(fsrs, p.aliases, 'TSC')
  const fmeaWithTsr = fmeaDocs.filter((d) => d.meta?.['tsrColumn'] !== 'no')
  const fmeaNoTsrColumn = fmeaDocs.length > 0 && fmeaWithTsr.length === 0
  const causeItems = fmeaWithTsr.flatMap((d) => d.items ?? []).filter((i) => i.kind === 'FMEA_CAUSE')
  const tsrResolver = new Resolver(tsrs, p.aliases, 'FMEA')
  const fmeaLinks: RefLink[] = []
  const causeRows: FmeaRow[] = causeItems.map((cause) => {
    const refs = cause.refs.map((ref) => tsrResolver.resolve(ref))
    for (const r of refs) fmeaLinks.push({ from: cause, resolution: r })
    const problems: string[] = []
    for (const r of refs) {
      if (r.method === 'missing') problems.push(`없는 TSR 참조: ${r.ref}`)
      if (r.method === 'ambiguous') problems.push(`확인 필요: ${r.ref} (${r.reason ?? '후보 여러 개'})`)
    }
    if (refs.length === 0 && hasAsil(cause)) problems.push(`ASIL ${cause.asil}인데 TSR 연결 없음`)
    return { item: cause, refs, problems }
  })

  // TSR → FSR 참조 해석
  const links: RefLink[] = []
  const tsrRows: TsrRow[] = tsrs.map((tsr) => {
    const refs = tsr.refs.map((ref) => resolver.resolve(ref))
    for (const r of refs) links.push({ from: tsr, resolution: r })
    const problems: string[] = []
    for (const r of refs) {
      if (r.method === 'missing') problems.push(`없는 FSR 참조: ${r.ref}`)
      if (r.method === 'ambiguous') problems.push(`확인 필요: ${r.ref} (${r.reason ?? '후보 여러 개'})`)
    }
    if (tsr.dupCount > 1) problems.push(`ID 중복 (#${tsr.dupIndex}/${tsr.dupCount})`)
    if (refs.length === 0) problems.push('위 단계(FSR) 참조 없음')

    const causes: TsrRow['causes'] = []
    const causeAmbiguous: RefLink[] = []
    for (const l of fmeaLinks) {
      if (!l.resolution.targets.includes(tsr)) continue
      if (isResolved(l.resolution)) causes.push({ cause: l.from, method: l.resolution.method })
      else if (l.resolution.method === 'ambiguous') causeAmbiguous.push(l)
    }
    let status: TraceStatus
    let reason: string
    if (tsr.status === 'notApplicable') {
      status = '대상 아님'
      reason = `문서 상태: ${tsr.statusRaw}`
    } else if (tsr.general) {
      status = '대상 아님'
      reason = '일반 요구 (FMEA 근거 불필요)'
    } else if (fmeaDocs.length === 0) {
      status = '문서 대기'
      reason = 'FMEA 미등록'
    } else if (fmeaNoTsrColumn) {
      status = '문서 대기'
      reason = 'FMEA에 TSR 연결 칸 없음 (작성 여부만)'
    } else if (causes.length > 0) {
      status = '연결됨'
      reason = ''
    } else if (causeAmbiguous.length > 0) {
      status = '확인 필요'
      reason = '애매한 FMEA 참조 (ID 대응표에서 고르기)'
    } else {
      status = '누락'
      reason = 'FMEA 근거 없음'
    }
    return { item: tsr, status, reason, refs, problems, causes, causeAmbiguous }
  })

  // FSR별 상태
  const fsrRows: FsrRow[] = fsrs.map((fsr) => {
    const tsrsOf: FsrRow['tsrs'] = []
    const ambiguous: RefLink[] = []
    for (const l of links) {
      if (!l.resolution.targets.includes(fsr)) continue
      if (isResolved(l.resolution)) tsrsOf.push({ tsr: l.from, method: l.resolution.method })
      else if (l.resolution.method === 'ambiguous') ambiguous.push(l)
    }
    let status: TraceStatus
    let reason = ''
    if (fsr.origin === 'toOther') {
      status = '대상 아님'
      reason = `${fsrLabel(fsr)} (TSR 불필요)`
    } else if (tscDocs.length === 0) {
      status = '문서 대기'
      reason = 'TSC 미등록'
    } else if (fsr.dupCount > 1) {
      status = '확인 필요'
      reason = `FSR ID 중복 (#${fsr.dupIndex}/${fsr.dupCount})`
    } else if (tsrsOf.length > 0) {
      status = '연결됨'
      const applicable = tsrsOf.filter((t) => t.tsr.status !== 'notApplicable').length
      reason = applicable === 0 ? '연결된 TSR이 모두 미적용' : ''
    } else if (ambiguous.length > 0) {
      status = '확인 필요'
      reason = '애매한 참조 (ID 대응표에서 고르기)'
    } else {
      status = '누락'
      reason = 'TSR 없음'
    }
    return { item: fsr, status, reason, tsrs: tsrsOf, ambiguous }
  })

  const needed = fsrRows.filter((r) => r.status !== '대상 아님')
  const tsrNeeded = tsrRows.filter((r) => r.status !== '대상 아님')
  const cards: StageCard[] = [
    fsrDocs.length > 0 ? { label: 'FSR', count: fsrs.length } : { label: 'FSR', pending: '문서 미등록' },
    tscDocs.length > 0
      ? { label: 'TSR 연결', linked: needed.filter((r) => r.status === '연결됨').length, total: needed.length }
      : { label: 'TSR 연결', pending: 'TSC 미등록' },
    fmeaDocs.length === 0
      ? { label: 'FMEA 근거', pending: 'FMEA 미등록' }
      : fmeaNoTsrColumn
        ? { label: 'FMEA 근거', pending: 'TSR 연결 칸 없음 (작성 여부만)' }
        : tscDocs.length === 0
          ? { label: 'FMEA 근거', pending: 'TSC 미등록' }
          : { label: 'FMEA 근거', linked: tsrNeeded.filter((r) => r.status === '연결됨').length, total: tsrNeeded.length },
    { label: '시스템 통합 시험', pending: '문서 미등록 (자리)' }
  ]

  return {
    hasFsr: fsrDocs.length > 0,
    hasTsc: tscDocs.length > 0,
    sgs,
    fsrs: fsrRows,
    tsrs: tsrRows,
    causes: causeRows,
    fmeaNoTsrColumn,
    cards,
    links: [...links, ...fmeaLinks],
    sources
  }
}

/** ID 대응표에 올릴 참조: 확인 필요 / 없는 ID / 약식 표기 / 별칭 */
export function reviewLinks(links: RefLink[]): RefLink[] {
  return links.filter((l) => l.resolution.method !== 'exact' && l.resolution.method !== 'normalized')
}

/** 사람이 골라야 하는 건수 (확인 필요 + 없는 ID). 같은 문서 종류의 같은 참조는 1건 */
export function pendingCount(links: RefLink[]): number {
  const seen = new Set<string>()
  for (const l of links) {
    if (l.resolution.method === 'ambiguous' || l.resolution.method === 'missing') seen.add(`${sourceKindOf(l.from)}|${l.resolution.norm}`)
  }
  return seen.size
}
