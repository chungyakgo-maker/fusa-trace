/**
 * 검사 엔진 (SPEC 검사 규칙, 2026-11-11 SPEC 개정 2) — 순수 함수
 * 넣은 문서에서 추적성 연결성(C) 규칙을 검사해 "지적" 목록을 만든다. 같은 문서면 항상 같은 결과(정렬 고정).
 * 지적 하나 = 규칙 ID + 대상 항목 + 관련 항목 + 내용 + 고칠 문서 + 위치 + 근거 조항 (+ 지문: 예외 처리·이력용)
 * 계산은 추적성 화면과 같은 결과(trace·software·hardware)를 쓴다 → 화면과 검사가 어긋나지 않음
 */
import type { DocKind, Project, SourceDoc, TraceItem } from './model'
import { activeDocs } from './project'
import { computeSystemTrace, hasAsil, type RefLink, type SystemTrace } from './trace'
import { computeSoftwareTrace, isSwAllocated, type SoftwareTrace } from './software'
import { computeHardwareTrace, isHwAllocated, type HardwareTrace } from './hardware'
import { normHeader } from './text'

export type Severity = '오류' | '경고' | '참고'
export const SEVERITIES: readonly Severity[] = ['오류', '경고', '참고']

export interface RuleDef {
  id: string
  name: string
  /** 기본 심각도 (규칙에 따라 일부 지적은 다를 수 있음) */
  severity: Severity
  /** 고칠 문서 */
  fixDoc: string
  /** 근거 (ISO 26262:2018 조항 번호만, 원문은 넣지 않음) */
  clause: string
}

/** 규칙표 — SPEC 검사 규칙. C-11·C-12는 기존 기능 유지를 위해 추가, K-04는 M7에서 M6으로 앞당김 */
export const RULES: readonly RuleDef[] = [
  { id: 'C-01', name: 'ID 중복', severity: '오류', fixDoc: '정의 문서', clause: 'Part 8 Clause 6' },
  { id: 'C-02', name: '없는 ID 참조', severity: '오류', fixDoc: '참조하는 문서', clause: 'Part 8 Clause 6' },
  { id: 'C-03', name: '애매한 약식 표기', severity: '경고', fixDoc: '참조하는 문서', clause: 'Part 8 Clause 6' },
  { id: 'C-04', name: 'TSR이 없는 FSR', severity: '오류', fixDoc: 'TSC', clause: 'Part 4 Clause 6, Part 8 Clause 6' },
  { id: 'C-05', name: 'SSR이 없는 S/W TSR', severity: '오류', fixDoc: 'SRS', clause: 'Part 6 Clause 6' },
  { id: 'C-06', name: 'FMEA 근거가 없는 TSR', severity: '경고', fixDoc: 'FMEA', clause: 'Part 9 Clause 8' },
  { id: 'C-07', name: 'TSR 연결이 없는 안전 관련 SSR', severity: '경고', fixDoc: 'SRS', clause: 'Part 6 Clause 6, Part 8 Clause 6' },
  { id: 'C-08', name: 'TSR 연결이 없는 FMEA 고장원인', severity: '경고', fixDoc: 'FMEA', clause: 'Part 9 Clause 8' },
  { id: 'C-09', name: '"Yes"인데 TSR ID 없음', severity: '경고', fixDoc: 'SRS', clause: 'Part 8 Clause 6' },
  { id: 'C-10', name: '시험이 없는 SSR', severity: '경고', fixDoc: 'SW 시험 명세', clause: 'Part 6 Clause 11' },
  { id: 'C-11', name: 'TSR 연결이 없는 HSR', severity: '경고', fixDoc: 'HSR', clause: 'Part 5 Clause 6, Part 8 Clause 6' },
  { id: 'C-12', name: '검증 대상(SSR)이 없는 SW 시험', severity: '경고', fixDoc: 'SW 시험 명세', clause: 'Part 6 Clause 11' },
  { id: 'K-04', name: '할당과 하위 문서 불일치', severity: '경고', fixDoc: 'HSR / TSC', clause: 'Part 4 Clause 6, Part 5 Clause 6' }
]
const RULE = new Map(RULES.map((r) => [r.id, r]))

/** 지적을 눌렀을 때 추적성 지도에서 강조할 곳 */
export type CheckTab = 'system' | 'software' | 'hardware'

export interface Finding {
  ruleId: string
  ruleName: string
  severity: Severity
  /** 대상 항목 ID (문서 단위 참고는 '') */
  itemId: string
  /** 관련 항목 ID들 */
  related: string[]
  message: string
  /** 고칠 문서 종류 (TSC, SRS …) */
  fixDoc: string
  /** 고칠 파일 (파일명 · 버전) */
  fixFile: string
  /** 위치 (파일 안: 시트 n행 / n번째 TSR 표 · 제목) */
  location: string
  clause: string
  /** 지문: 규칙 ID + 항목 ID + 관련 항목 ID (예외 처리·검사 이력에서 같은 지적인지 판단) */
  fingerprint: string
  /** 화면용: 지도에서 강조할 탭과 항목 (리포트에는 안 씀) */
  tab?: CheckTab
  item?: TraceItem
}

export interface CheckResult {
  findings: Finding[]
  counts: Record<Severity, number>
  /** 검사에 쓴 문서 (종류·파일명·버전·등록일) */
  docs: SourceDoc[]
}

const SEVERITY_ORDER: Record<Severity, number> = { 오류: 0, 경고: 1, 참고: 2 }
const KIND_DOC: Partial<Record<TraceItem['kind'], string>> = { SG: 'FSR', FSR: 'FSR', TSR: 'TSC', SSR: 'SRS', FMEA_CAUSE: 'FMEA', HSR: 'HSR', SWTEST: 'SW 시험 명세' }
const KIND_TAB: Partial<Record<TraceItem['kind'], CheckTab>> = { SG: 'system', FSR: 'system', TSR: 'system', FMEA_CAUSE: 'system', SSR: 'software', SWTEST: 'software', HSR: 'hardware' }
const KIND_LABEL: Partial<Record<TraceItem['kind'], string>> = { FSR: 'FSR', TSR: 'TSR', SSR: 'SSR', HSR: 'HSR', SWTEST: 'SW 시험', FMEA_CAUSE: 'FMEA 고장원인', SG: 'SG' }

/** 화면·리포트에 쓰는 항목 ID (FMEA 고장원인은 ID가 없어 위치로) */
export function itemLabel(item: TraceItem): string {
  if (item.kind === 'FMEA_CAUSE') return `고장원인 (${item.location})`
  return item.dupCount > 1 ? `${item.rawId} (중복 #${item.dupIndex})` : item.rawId
}

const skip = (item: TraceItem): boolean => item.status === 'notApplicable'

interface Ctx {
  sys: SystemTrace
  sw: SoftwareTrace
  hw: HardwareTrace
  sources: Map<TraceItem, SourceDoc>
}

function fileOf(ctx: Ctx, item: TraceItem): SourceDoc | undefined {
  return ctx.sources.get(item)
}

function fileText(doc: SourceDoc | undefined): string {
  return doc ? `${doc.fileName} (${doc.version || '버전 없음'})` : ''
}

function make(ctx: Ctx, ruleId: string, item: TraceItem, message: string, opts: { related?: string[]; relatedKeys?: string[]; severity?: Severity; tab?: CheckTab; fixDoc?: string } = {}): Finding {
  const rule = RULE.get(ruleId)!
  const doc = fileOf(ctx, item)
  const related = opts.related ?? []
  const keyOf = item.kind === 'FMEA_CAUSE' ? item.rawId : `${item.normId}#${item.dupIndex}`
  return {
    ruleId,
    ruleName: rule.name,
    severity: opts.severity ?? rule.severity,
    itemId: itemLabel(item),
    related,
    message,
    fixDoc: opts.fixDoc ?? rule.fixDoc,
    fixFile: fileText(doc),
    location: item.location,
    clause: rule.clause,
    fingerprint: [ruleId, keyOf, ...(opts.relatedKeys ?? related.map((r) => normHeader(r))).sort()].join('|'),
    tab: opts.tab ?? KIND_TAB[item.kind],
    item
  }
}

/** 문서 미등록 등으로 규칙을 건너뛸 때: 프로젝트당 참고 1건 */
function note(ruleId: string, message: string, fixDoc?: string): Finding {
  const rule = RULE.get(ruleId)!
  return {
    ruleId,
    ruleName: rule.name,
    severity: '참고',
    itemId: '',
    related: [],
    message,
    fixDoc: fixDoc ?? rule.fixDoc,
    fixFile: '',
    location: '',
    clause: rule.clause,
    fingerprint: `${ruleId}|skip|${message}`
  }
}

function contentKey(item: TraceItem): string {
  return [item.title, item.asil, item.refRaw].map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase()).join('§')
}

/** C-01: 정의 문서 안에 같은 ID가 다른 내용으로 2번 이상 (대상 아님인 것은 빼고 비교) */
function checkDuplicates(p: Project, ctx: Ctx, out: Finding[]): void {
  const defKinds: DocKind[] = ['FSR', 'TSC', 'SRS', 'HSR', 'SWTEST']
  for (const doc of activeDocs(p).filter((d) => defKinds.includes(d.kind))) {
    const groups = new Map<string, TraceItem[]>()
    for (const it of doc.items ?? []) {
      if (it.kind === 'FMEA_CAUSE' || skip(it)) continue
      const k = `${it.kind}:${it.normId}`
      groups.set(k, [...(groups.get(k) ?? []), it])
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue
      if (new Set(g.map(contentKey)).size < 2) continue // 같은 내용이 두 번: 지적하지 않음
      const first = g[0]
      out.push(
        make(ctx, 'C-01', first, `${first.rawId}가 ${KIND_DOC[first.kind]} 안에 ${g.length}번, 서로 다른 내용으로 나옵니다 (위치: ${g.map((x) => x.location).join(' / ')})`, {
          related: [],
          relatedKeys: [`n${g.length}`],
          fixDoc: KIND_DOC[first.kind]
        })
      )
    }
  }
}

/** C-02·C-03: 없는 ID 참조, 애매한 약식 표기 (참조하는 쪽이 대상 아님이면 검사 안 함) */
function checkRefs(ctx: Ctx, links: RefLink[], targetLabel: (l: RefLink) => string, out: Finding[]): void {
  for (const l of links) {
    if (skip(l.from)) continue
    const r = l.resolution
    const fixDoc = KIND_DOC[l.from.kind]
    if (r.method === 'missing') {
      out.push(make(ctx, 'C-02', l.from, `${itemLabel(l.from)}: 참조 '${r.ref}' — ${targetLabel(l)}에 없는 ID입니다`, { related: [r.ref], relatedKeys: [r.norm], fixDoc }))
    } else if (r.method === 'ambiguous') {
      // 같은 ID가 정의 문서에 여러 번 있어서 애매한 것은 C-01(정의 문서를 고침)로 봄 → 약식 표기의 후보가 서로 다른 ID일 때만
      if (new Set(r.targets.map((t) => t.normId)).size < 2) continue
      const cands = r.targets.map(itemLabel)
      out.push(
        make(ctx, 'C-03', l.from, `${itemLabel(l.from)}: 참조 '${r.ref}' — 끝 번호로 맞추면 후보가 ${cands.length}개입니다 (${cands.join(', ')}). 정확한 ID로 고치거나 ID 대응표에서 골라 주세요`, {
          related: cands,
          relatedKeys: [r.norm],
          fixDoc
        })
      )
    }
  }
}

export function runChecks(p: Project): CheckResult {
  const sys = computeSystemTrace(p)
  const sw = computeSoftwareTrace(p)
  const hw = computeHardwareTrace(p)
  const sources = new Map<TraceItem, SourceDoc>([...sys.sources, ...sw.sources, ...hw.sources])
  const ctx: Ctx = { sys, sw, hw, sources }
  const out: Finding[] = []
  const has = (k: DocKind): boolean => activeDocs(p, k).length > 0

  checkDuplicates(p, ctx, out)

  // C-02·C-03: 위 단계 참조
  const sysTsrLinks = sys.links.filter((l) => l.from.kind === 'TSR')
  const fmeaLinks = sys.links.filter((l) => l.from.kind === 'FMEA_CAUSE')
  if (has('FSR')) checkRefs(ctx, sysTsrLinks, () => 'FSR', out)
  if (has('TSC')) {
    checkRefs(ctx, fmeaLinks, () => 'TSC', out)
    checkRefs(ctx, sw.links.filter((l) => l.from.kind === 'SSR'), () => 'TSC', out)
    checkRefs(ctx, hw.links, () => 'TSC', out)
  }
  if (has('SRS')) checkRefs(ctx, sw.links.filter((l) => l.from.kind === 'SWTEST'), () => 'SRS', out)

  // C-04: TSR이 없는 FSR (타 ECU에 요구하는 FSR·대상 아님 제외)
  if (!has('FSR')) out.push(note('C-04', 'FSR 미등록 — FSR → TSR 연결 검사(C-04) 생략'))
  else if (!has('TSC')) out.push(note('C-04', 'TSC 미등록 — FSR → TSR 연결 검사(C-04) 생략'))
  else for (const f of sys.fsrs) if (f.status === '누락' && !skip(f.item)) out.push(make(ctx, 'C-04', f.item, `${f.item.rawId}: 이 FSR을 구현하는 TSR이 TSC에 없습니다`))

  // C-05: SSR이 없는 S/W TSR / C-07·C-09: TSR 연결이 없는 안전 관련 SSR
  if (has('TSC')) {
    if (!has('SRS')) out.push(note('C-05', 'SRS 미등록 — TSR → SSR 연결 검사(C-05·C-07·C-09) 생략'))
    else
      for (const t of sw.tsrs)
        if (t.status === '누락' && isSwAllocated(t.item)) out.push(make(ctx, 'C-05', t.item, `${t.item.rawId} (할당 ${t.item.allocationRaw.replace(/\s+/g, ' ') || t.item.allocation}): 이 TSR을 구현하는 SSR이 SRS에 없습니다`, { tab: 'software', fixDoc: 'SRS' }))
  }
  for (const s of sw.ssrs) {
    if (skip(s.item) || s.refs.length > 0) continue
    const yes = s.item.attrs['안전관련'] === 'yes'
    if (yes) out.push(make(ctx, 'C-09', s.item, `${s.item.rawId}: Functional Safety Related가 Yes인데 TSR ID가 비어 있습니다`))
    else if (hasAsil(s.item)) out.push(make(ctx, 'C-07', s.item, `${s.item.rawId}: ASIL ${s.item.asil}인 안전 관련 SSR인데 TSR 연결이 없습니다`))
  }

  // C-06: FMEA 근거가 없는 TSR (일반·공통·대상 아님 제외) / C-08: TSR 연결이 없는 FMEA 고장원인
  if (has('TSC')) {
    if (!has('FMEA')) out.push(note('C-06', 'FMEA 미등록 — FMEA 근거 검사(C-06·C-08) 생략'))
    else if (sys.fmeaNoTsrColumn) out.push(note('C-06', 'FMEA에 TSR ID 칸이 없음 — FMEA 근거 검사(C-06·C-08) 생략'))
    else for (const t of sys.tsrs) if (t.status === '누락') out.push(make(ctx, 'C-06', t.item, `${itemLabel(t.item)}: 이 TSR의 근거가 되는 FMEA 고장원인이 없습니다`))
  }
  for (const c of sys.causes) {
    if (skip(c.item) || c.refs.length > 0 || !hasAsil(c.item)) continue
    out.push(make(ctx, 'C-08', c.item, `고장원인 "${c.item.title.slice(0, 40)}": ASIL ${c.item.asil}인데 TSR ID가 없습니다`))
  }

  // C-10: 시험이 없는 SSR / C-12: 검증 대상이 없는 SW 시험
  if (has('SRS')) {
    if (!sw.hasTests) out.push(note('C-10', 'SW 요구사항 시험 명세 미등록 — SSR → 시험 연결 검사(C-10·C-12) 생략'))
    else for (const s of sw.ssrs) if (s.status === '누락' && !skip(s.item)) out.push(make(ctx, 'C-10', s.item, `${s.item.rawId}: 안전 관련 SSR인데 검증하는 SW 시험이 없습니다`))
  }
  for (const t of sw.tests) if (!skip(t.item) && t.refs.length === 0) out.push(make(ctx, 'C-12', t.item, `${itemLabel(t.item)}: 검증 대상(SSR) ID가 비어 있습니다`))

  // C-11: TSR 연결이 없는 HSR
  for (const h of hw.hsrs) if (!skip(h.item) && h.refs.length === 0) out.push(make(ctx, 'C-11', h.item, `${itemLabel(h.item)}: 위 단계(TSR) ID가 비어 있습니다`))

  // K-04: 할당과 하위 문서 불일치 (H/W 쪽만. S/W 쪽은 C-05) / Allocation 빈칸·해석 불가는 오류
  for (const t of sys.tsrs) {
    const it = t.item
    if (skip(it) || it.general) continue
    if (!it.allocationRaw.trim()) out.push(make(ctx, 'K-04', it, `${itemLabel(it)}: Allocation이 비어 있습니다`, { severity: '오류', fixDoc: 'TSC' }))
    else if (it.allocation === 'UNKNOWN' || it.allocation === 'OTHER')
      out.push(make(ctx, 'K-04', it, `${itemLabel(it)}: Allocation '${it.allocationRaw.replace(/\s+/g, ' ')}' — S/W·H/W·General 중 무엇인지 알 수 없습니다`, { severity: '오류', fixDoc: 'TSC', relatedKeys: ['alloc'] }))
  }
  if (has('TSC')) {
    if (!hw.hasHsr) out.push(note('K-04', 'HSR 미등록 — TSR(H/W) → HSR 검사(K-04) 생략', 'HSR'))
    else
      for (const t of hw.tsrs)
        if (t.status === '누락' && isHwAllocated(t.item))
          out.push(make(ctx, 'K-04', t.item, `${itemLabel(t.item)} (할당 ${t.item.allocationRaw.replace(/\s+/g, ' ') || t.item.allocation}): 이 TSR을 구현하는 HSR이 없습니다`, { fixDoc: 'HSR', tab: 'hardware', relatedKeys: ['hsr'] }))
  }

  const findings = sortFindings(dedupe(out))
  const counts: Record<Severity, number> = { 오류: 0, 경고: 0, 참고: 0 }
  for (const f of findings) counts[f.severity]++
  const docs = activeDocs(p).filter((d) => d.kind !== 'OTHER')
  return { findings, counts, docs }
}

function dedupe(list: Finding[]): Finding[] {
  const seen = new Set<string>()
  return list.filter((f) => (seen.has(f.fingerprint) ? false : (seen.add(f.fingerprint), true)))
}

/** 정렬: 심각도 → 고칠 문서 → 항목 ID → 규칙 ID → 위치 (항상 같은 순서) */
export function sortFindings(list: Finding[]): Finding[] {
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
  return [...list].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      cmp(a.fixDoc, b.fixDoc) ||
      cmp(a.itemId, b.itemId) ||
      cmp(a.ruleId, b.ruleId) ||
      cmp(a.location, b.location) ||
      cmp(a.message, b.message)
  )
}

export function ruleOf(id: string): RuleDef | undefined {
  return RULE.get(id)
}

export { KIND_LABEL }
