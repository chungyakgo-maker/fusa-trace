/** 추적성 누락·확인 필요 목록 (엑셀 시트 3 "추적성 누락", SPEC §10) — 순수 함수 */
import type { SourceDoc, TraceItem } from './model'
import type { SystemTrace } from './trace'
import type { SoftwareTrace } from './software'

export interface TraceIssue {
  /** 단계: FSR → TSR, TSR → FMEA 근거, TSR → SSR, 역방향 … */
  stage: string
  id: string
  title: string
  /** 문제 종류 */
  problem: string
  /** 출처 문서 (파일명, 버전, 위치) */
  source: string
}

function sourceText(item: TraceItem, sources: Map<TraceItem, SourceDoc>): string {
  const d = sources.get(item)
  return d ? `${d.fileName} (${d.version || '버전 없음'}) · ${item.location}` : item.location
}

function idOf(item: TraceItem): string {
  return item.dupCount > 1 ? `${item.rawId} (중복 #${item.dupIndex})` : item.rawId
}

export function collectTraceIssues(sys: SystemTrace, sw: SoftwareTrace): TraceIssue[] {
  const out: TraceIssue[] = []
  const add = (stage: string, item: TraceItem, problem: string, sources: Map<TraceItem, SourceDoc>): void => {
    out.push({ stage, id: idOf(item), title: item.title.replace(/\s+/g, ' ').trim(), problem, source: sourceText(item, sources) })
  }
  for (const f of sys.fsrs) if (f.status === '누락' || f.status === '확인 필요') add('FSR → TSR', f.item, `${f.status}: ${f.reason}`, sys.sources)
  for (const t of sys.tsrs) for (const p of t.problems) add('TSR → FSR (참조)', t.item, p, sys.sources)
  for (const t of sys.tsrs) if (t.status === '누락' || t.status === '확인 필요') add('TSR → FMEA 근거', t.item, `${t.status}: ${t.reason}`, sys.sources)
  for (const c of sys.causes) for (const p of c.problems) add('역방향: FMEA 고장원인', c.item, p, sys.sources)
  for (const t of sw.tsrs) if (t.status === '누락' || t.status === '확인 필요') add('TSR → SSR', t.item, `${t.status}: ${t.reason}`, sw.sources)
  for (const s of sw.ssrs) for (const p of s.problems) add('역방향: SSR', s.item, p, sw.sources)
  return out
}
