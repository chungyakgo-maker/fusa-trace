/** 추적성 (SPEC §9.1): 시스템 / 소프트웨어 / 하드웨어 탭. 단계 카드 + 추적성(지도) 보기 / 목록 보기. 지도는 [크게 보기]로 화면 가득 */
import { Fragment, useCallback, useMemo, useState, type ReactElement } from 'react'
import type { Project, TraceItem } from '../../core/model'
import { computeSystemTrace, TRACE_STATUSES, type FsrRow, type StageCard, type SystemTrace, type TraceStatus, type TsrRow } from '../../core/trace'
import { ORIGIN_LABEL } from '../../core/fsr'
import { isResolved } from '../../core/resolve'
import { shortText } from '../../core/text'
import { Disclosure, EmptyState, TraceBadge } from './ui'
import { TraceMap } from './TraceMap'
import { buildTraceMap, UNKNOWN_BLOCK, type MapOptions } from '../../core/traceMap'
import { buildHardwareMap, buildSoftwareMap, GENERAL_BLOCK, NO_TSR_BLOCK } from '../../core/softwareMap'
import { computeHardwareTrace, type HardwareTrace, type HsrRow, type HwTsrRow } from '../../core/hardware'
import { computeSoftwareTrace, type SoftwareTrace, type SsrRow, type SwTsrRow } from '../../core/software'
import { sgNumber } from '../../core/ids'

type Tab = 'system' | 'software' | 'hardware'
const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: 'system', label: '시스템', sub: 'FSR → TSR → FMEA 근거' },
  { id: 'software', label: '소프트웨어', sub: 'TSR → SSR → SW 시험' },
  { id: 'hardware', label: '하드웨어', sub: 'TSR → HSR → FMEDA' }
]

const ALLOC_LABEL: Record<string, string> = { HW: 'H/W', SW: 'S/W', BOTH: 'S/W + H/W', GENERAL: '일반', OTHER: '기타', UNKNOWN: '-' }
const DOC_STATUS_LABEL: Record<string, string> = { done: '완료', inProgress: '진행', notApplicable: '대상 아님', unknown: '-' }

function idText(item: TraceItem): string {
  return item.dupCount > 1 ? `${item.rawId} (중복 #${item.dupIndex})` : item.rawId
}

export function StageCards({ cards }: { cards: StageCard[] }): ReactElement {
  return (
    <div className="stage-cards">
      {cards.map((c, i) => (
        <Fragment key={c.label}>
          {i > 0 && (
            <span className="stage-arrow" aria-hidden="true">
              →
            </span>
          )}
          <div className={`stage-card${c.pending ? ' stage-pending' : ''}`}>
            <div className="stage-label">{c.label}</div>
            {c.pending ? (
              <div className="stage-pending-text">{c.pending}</div>
            ) : c.count !== undefined ? (
              <div className="stage-value">
                {c.count}
                <span className="stage-unit"> 개</span>
              </div>
            ) : (
              <>
                <div className="stage-value">
                  {c.linked}
                  <span className="stage-unit"> / {c.total}</span>
                  <span className="stage-pct">{c.total ? Math.round(((c.linked ?? 0) / c.total) * 100) : 0}%</span>
                </div>
                <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.linked} aria-label={`${c.label} 연결률`}>
                  <div style={{ width: `${c.total ? ((c.linked ?? 0) / c.total) * 100 : 0}%` }} />
                </div>
              </>
            )}
          </div>
        </Fragment>
      ))}
    </div>
  )
}

const STATUS_ORDER: Record<TraceStatus, number> = { 누락: 0, '확인 필요': 1, 연결됨: 2, '문서 대기': 3, '대상 아님': 4 }

export function TracePage({ project, onImport, onGoIdMap }: { project: Project; onImport: () => void; onGoIdMap: () => void }): ReactElement {
  const [tab, setTab] = useState<Tab>('system')
  const trace = useMemo(() => computeSystemTrace(project), [project])
  const sw = useMemo(() => computeSoftwareTrace(project), [project])
  const hw = useMemo(() => computeHardwareTrace(project), [project])

  return (
    <div className="page-stack">
      <div className="tabs" role="tablist" aria-label="추적성 구분">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className="tab" onClick={() => setTab(t.id)}>
            <span className="tab-label">{t.label}</span>
            <span className="tab-sub">{t.sub}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'system' && <SystemTab trace={trace} sw={sw} hw={hw} onImport={onImport} onGoIdMap={onGoIdMap} />}
        {tab === 'software' && <SoftwareTab sys={trace} sw={sw} hw={hw} onImport={onImport} onGoIdMap={onGoIdMap} />}
        {tab === 'hardware' && <HardwareTab sys={trace} sw={sw} hw={hw} onImport={onImport} onGoIdMap={onGoIdMap} />}
      </div>
    </div>
  )
}

function SystemTab({ trace, sw, hw, onImport, onGoIdMap }: { trace: SystemTrace; sw: SoftwareTrace; hw: HardwareTrace; onImport: () => void; onGoIdMap: () => void }): ReactElement {
  const [sg, setSg] = useState('전체')
  const [status, setStatus] = useState<TraceStatus | '전체'>('전체')
  const [view, setView] = useState<'map' | 'list'>('map')
  const build = useCallback((o: MapOptions) => buildTraceMap(trace, o), [trace])

  if (!trace.hasFsr && !trace.hasTsc) {
    return (
      <EmptyState
        title="FSR·TSC를 넣으면 시스템 추적성이 나옵니다"
        action={
          <button type="button" className="btn btn-primary" onClick={onImport}>
            문서 넣기
          </button>
        }
      >
        FSR(엑셀)의 FSR과 TSC(워드)의 TSR을 읽어, TSR의 Ref ID에 적힌 FSR과 연결합니다. 적힌 참조만 쓰고 내용으로 추측하지 않습니다.
      </EmptyState>
    )
  }

  const sgOptions = [...new Set(trace.fsrs.map((f) => f.item.sg ?? '(SG 없음)'))].sort()
  const sgTitle = new Map(trace.sgs.map((s) => [s.normId, s.title]))
  const inSg = (f: FsrRow): boolean => sg === '전체' || (f.item.sg ?? '(SG 없음)') === sg
  const bySg = trace.fsrs.filter(inSg)
  const counts = new Map<TraceStatus, number>(TRACE_STATUSES.map((s) => [s, bySg.filter((f) => f.status === s).length]))
  const rows = bySg.filter((f) => status === '전체' || f.status === status).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const fsrSgs = new Map(trace.fsrs.map((f) => [f.item, f.item.sg]))
  const tsrInSg = (t: TsrRow): boolean =>
    sg === '전체' || t.refs.some((r) => r.targets.some((x) => (fsrSgs.get(x) ?? '(SG 없음)') === sg)) || (t.refs.every((r) => r.targets.length === 0) && sg === '(SG 없음)')
  const problems = trace.tsrs.filter((t) => t.problems.length > 0 && (sg === '전체' || tsrInSg(t) || t.refs.every((r) => !isResolved(r))))

  const sgSelect = (
    <label className="select-label">
      SG
      <select value={sg} onChange={(e) => setSg(e.target.value)}>
        <option value="전체">전체</option>
        {sgOptions.map((s) => (
          <option key={s} value={s}>
            {s}
            {sgTitle.get(s) ? ` · ${shortText(sgTitle.get(s)!, 24)}` : ''}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="page-stack">
      <StageCards cards={trace.cards} />

      <section className="panel" aria-label={view === 'map' ? '추적성' : 'FSR 기준 연결'}>
        <div className="panel-head">
          <div>
            <h2>{view === 'map' ? '추적성' : 'FSR → TSR 연결'}</h2>
            <p className="muted small">문제 있는 항목을 먼저 보여 줍니다. 대상 아님(타 ECU에 요구)은 연결률 계산에서 뺍니다.</p>
          </div>
          <div className="filters">
            {sgSelect}
            {view === 'list' && (
            <div className="chips" role="group" aria-label="상태 거르기">
              <button type="button" className="chip" aria-pressed={status === '전체'} onClick={() => setStatus('전체')}>
                전체 {bySg.length}
              </button>
              {TRACE_STATUSES.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {s} {counts.get(s)}
                </button>
              ))}
            </div>
            )}
            <div className="view-toggle" role="group" aria-label="보기">
              <button type="button" className="chip" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                추적성
              </button>
              <button type="button" className="chip" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                목록
              </button>
            </div>
          </div>
        </div>
        {view === 'map' ? (
          <TraceMap
            build={build}
            sys={trace}
            sw={sw}
            hw={hw}
            sg={sg === '전체' ? 'all' : sg === '(SG 없음)' ? UNKNOWN_BLOCK : sg}
            onGoIdMap={onGoIdMap}
            title="추적성 — 시스템 (FSR → TSR → FMEA 근거)"
            filter={sgSelect}
          />
        ) : (
        <div className="table-scroll">
          <table className="trace-table">
            <thead>
              <tr>
                <th scope="col">상태</th>
                <th scope="col">SG</th>
                <th scope="col">FSR ID</th>
                <th scope="col">내용</th>
                <th scope="col">구분</th>
                <th scope="col">ASIL</th>
                <th scope="col">연결된 TSR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f, i) => (
                <tr key={`${f.item.normId}-${f.item.dupIndex}-${i}`} className={`row-${f.status === '누락' ? 'missing' : f.status === '확인 필요' ? 'check' : 'ok'}`}>
                  <td>
                    <TraceBadge status={f.status} text={f.status === '누락' ? `${f.reason}` : undefined} />
                    {f.status !== '누락' && f.reason && <div className="muted small">{f.reason}</div>}
                  </td>
                  <td className="mono small">{f.item.sg ?? '-'}</td>
                  <td className="mono">{idText(f.item)}</td>
                  <td title={f.item.title}>{shortText(f.item.title, 70)}</td>
                  <td className="small">{f.item.origin ? ORIGIN_LABEL[f.item.origin] : '-'}</td>
                  <td>{f.item.asil || '-'}</td>
                  <td className="mono small">
                    {f.tsrs.length === 0 && f.ambiguous.length === 0 && '-'}
                    {f.tsrs.map((x, k) => (
                      <div key={k}>
                        {idText(x.tsr)}
                        {x.method === 'tail' && <span className="tag">약식 표기</span>}
                        {x.method === 'alias' && <span className="tag">별칭</span>}
                        {x.tsr.status === 'notApplicable' && <span className="tag">미적용</span>}
                      </div>
                    ))}
                    {f.ambiguous.map((l, k) => (
                      <div key={`a${k}`}>
                        <span className="tag tag-check">후보</span> {idText(l.from)} — {l.resolution.ref}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    조건에 맞는 FSR이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </section>

      <section className="panel" aria-label="TSR 쪽 문제 (역방향 확인)">
        <div className="panel-head">
          <div>
            <h2>TSR 쪽 문제 (역방향 확인)</h2>
            <p className="muted small">없는 FSR을 가리키는 TSR, 애매한 참조, ID 중복, 참조가 비어 있는 TSR</p>
          </div>
          {problems.some((p) => p.problems.some((x) => x.startsWith('없는') || x.startsWith('확인 필요'))) && (
            <button type="button" className="btn btn-small" onClick={onGoIdMap}>
              ID 대응표에서 고르기
            </button>
          )}
        </div>
        {problems.length === 0 ? (
          <p className="muted pad">문제 없음</p>
        ) : (
          <div className="table-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th scope="col">TSR ID</th>
                  <th scope="col">문제</th>
                  <th scope="col">적힌 참조 (원문)</th>
                  <th scope="col">위치</th>
                </tr>
              </thead>
              <tbody>
                {problems.map((t, i) => (
                  <tr key={i}>
                    <td className="mono">{idText(t.item)}</td>
                    <td>
                      {t.problems.map((p) => (
                        <div key={p} className={p.startsWith('ID 중복') ? 'check-text' : 'warn-text'}>
                          {p}
                        </div>
                      ))}
                    </td>
                    <td className="mono small pre">{t.item.refRaw || '-'}</td>
                    <td className="small muted">{t.item.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {trace.causes.some((c) => c.problems.length > 0) && (
        <section className="panel" aria-label="FMEA 고장원인 문제 (역방향 확인)">
          <div className="panel-head">
            <div>
              <h2>FMEA 고장원인 문제 (역방향 확인)</h2>
              <p className="muted small">ASIL이 있는데 TSR 연결이 없는 고장원인, 없는 TSR 참조, 애매한 참조</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th scope="col">위치</th>
                  <th scope="col">고장원인</th>
                  <th scope="col">ASIL</th>
                  <th scope="col">문제</th>
                  <th scope="col">적힌 TSR ID (원문)</th>
                </tr>
              </thead>
              <tbody>
                {trace.causes
                  .filter((c) => c.problems.length > 0)
                  .map((c, i) => (
                    <tr key={i}>
                      <td className="small mono">{c.item.location}</td>
                      <td title={c.item.title}>{shortText(c.item.title, 50)}</td>
                      <td>{c.item.asil || '-'}</td>
                      <td>
                        {c.problems.map((p) => (
                          <div key={p} className={p.startsWith('확인 필요') ? 'check-text' : 'warn-text'}>
                            {p}
                          </div>
                        ))}
                      </td>
                      <td className="mono small pre">{c.item.refRaw || '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'list' && trace.tsrs.length > 0 && (
        <section className="panel pad-panel" aria-label="TSR 목록">
          <Disclosure summary={<span>TSR 목록 {trace.tsrs.length}개 (다음 단계: FMEA 근거)</span>}>
            <div className="table-scroll">
              <table className="trace-table">
                <thead>
                  <tr>
                    <th scope="col">TSR ID</th>
                    <th scope="col">내용</th>
                    <th scope="col">분류</th>
                    <th scope="col">ASIL</th>
                    <th scope="col">할당</th>
                    <th scope="col">문서 상태</th>
                    <th scope="col">FMEA 근거</th>
                    <th scope="col">위 단계 FSR</th>
                    <th scope="col">요소</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.tsrs.filter(tsrInSg).map((t, i) => (
                    <tr key={i}>
                      <td className="mono">{idText(t.item)}</td>
                      <td title={t.item.title}>{shortText(t.item.title, 60)}</td>
                      <td>{t.item.attrs['분류'] || '-'}</td>
                      <td>{t.item.asil || '-'}</td>
                      <td title={t.item.allocationRaw}>
                        {ALLOC_LABEL[t.item.allocation]}
                        {t.item.allocationNote && <span className="muted small"> ({t.item.allocationNote})</span>}
                      </td>
                      <td>{DOC_STATUS_LABEL[t.item.status]}</td>
                      <td>
                        <TraceBadge status={t.status} />
                        <div className="muted small">{t.reason}</div>
                      </td>
                      <td className="mono small">
                        {t.refs.map((r, k) => (
                          <div key={k} className={isResolved(r) ? '' : 'warn-text'}>
                            {r.ref}
                          </div>
                        ))}
                      </td>
                      <td className="small">{t.item.element || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Disclosure>
        </section>
      )}
    </div>
  )
}

function swBlockOf(item: TraceItem): string {
  const n = sgNumber(item.normId)
  return n !== undefined ? `SG${String(n).padStart(3, '0')}` : GENERAL_BLOCK
}

function SoftwareTab({ sys, sw, hw, onImport, onGoIdMap }: { sys: SystemTrace; sw: SoftwareTrace; hw: HardwareTrace; onImport: () => void; onGoIdMap: () => void }): ReactElement {
  const [block, setBlock] = useState('전체')
  const [view, setView] = useState<'map' | 'list'>('map')
  const [status, setStatus] = useState<TraceStatus | '전체'>('전체')
  const build = useCallback((o: MapOptions) => buildSoftwareMap(sw, o), [sw])

  if (!sw.hasTsc && !sw.hasSrs) {
    return (
      <div className="page-stack">
        <StageCards cards={sw.cards} />
        <EmptyState
          title="TSC·SRS를 넣으면 소프트웨어 추적성이 나옵니다"
          action={
            <button type="button" className="btn btn-primary" onClick={onImport}>
              문서 넣기
            </button>
          }
        >
          SRS의 Functional Safety Related에 적힌 TSR과 S/W 할당 TSR을 연결합니다.
        </EmptyState>
      </div>
    )
  }

  const blocks = [...new Set([...sw.tsrs.map((t) => swBlockOf(t.item)), ...(sw.ssrs.some((s) => s.refs.length === 0 && s.problems.length > 0) ? [NO_TSR_BLOCK] : [])])].sort()
  const inBlock = (t: SwTsrRow): boolean => block === '전체' || swBlockOf(t.item) === block
  const rows = sw.tsrs.filter(inBlock)
  const counts = new Map<TraceStatus, number>(TRACE_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]))
  const shownRows = rows.filter((r) => status === '전체' || r.status === status).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const ssrProblems: SsrRow[] = sw.ssrs.filter((s) => s.problems.length > 0)

  const blockSelect = (
    <label className="select-label">
      묶음
      <select value={block} onChange={(e) => setBlock(e.target.value)}>
        <option value="전체">전체</option>
        {blocks.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="page-stack">
      <StageCards cards={sw.cards} />
      <section className="panel" aria-label={view === 'map' ? '소프트웨어 추적성' : 'TSR(S/W) → SSR 연결'}>
        <div className="panel-head">
          <div>
            <h2>{view === 'map' ? '추적성' : 'TSR(S/W) → SSR 연결'}</h2>
            <p className="muted small">S/W·S/W+H/W 할당 TSR만 SSR이 필요합니다. 미적용 TSR은 연결률 계산에서 뺍니다.</p>
          </div>
          <div className="filters">
            {blockSelect}
            {view === 'list' && (
              <div className="chips" role="group" aria-label="상태 거르기">
                <button type="button" className="chip" aria-pressed={status === '전체'} onClick={() => setStatus('전체')}>
                  전체 {rows.length}
                </button>
                {TRACE_STATUSES.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => (
                  <button key={s} type="button" className="chip" aria-pressed={status === s} onClick={() => setStatus(s)}>
                    {s} {counts.get(s)}
                  </button>
                ))}
              </div>
            )}
            <div className="view-toggle" role="group" aria-label="보기">
              <button type="button" className="chip" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                추적성
              </button>
              <button type="button" className="chip" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                목록
              </button>
            </div>
          </div>
        </div>
        {view === 'map' ? (
          <TraceMap build={build} sys={sys} sw={sw} hw={hw} sg={block === '전체' ? 'all' : block} onGoIdMap={onGoIdMap} title="추적성 — 소프트웨어 (TSR → SSR → SW 시험)" filter={blockSelect} />
        ) : (
          <div className="table-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th scope="col">상태</th>
                  <th scope="col">TSR ID</th>
                  <th scope="col">내용</th>
                  <th scope="col">할당</th>
                  <th scope="col">ASIL</th>
                  <th scope="col">연결된 SSR</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.map((r, i) => (
                  <tr key={i} className={`row-${r.status === '누락' ? 'missing' : r.status === '확인 필요' ? 'check' : 'ok'}`}>
                    <td>
                      <TraceBadge status={r.status} text={r.status === '누락' ? r.reason : undefined} />
                      {r.status !== '누락' && r.reason && <div className="muted small">{r.reason}</div>}
                    </td>
                    <td className="mono">{idText(r.item)}</td>
                    <td title={r.item.title}>{shortText(r.item.title, 60)}</td>
                    <td title={r.item.allocationRaw}>{ALLOC_LABEL[r.item.allocation]}</td>
                    <td>{r.item.asil || '-'}</td>
                    <td className="mono small">
                      {r.ssrs.length === 0 && r.ambiguous.length === 0 && '-'}
                      {r.ssrs.map((x, k) => (
                        <div key={k}>
                          {x.ssr.rawId}
                          {x.method === 'tail' && <span className="tag">약식 표기</span>}
                          {x.method === 'alias' && <span className="tag">별칭</span>}
                        </div>
                      ))}
                      {r.ambiguous.map((l, k) => (
                        <div key={`a${k}`}>
                          <span className="tag tag-check">후보</span> {l.from.rawId} — {l.resolution.ref}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-label="SSR 쪽 문제 (역방향 확인)">
        <div className="panel-head">
          <div>
            <h2>SSR 쪽 문제 (역방향 확인)</h2>
            <p className="muted small">TSR 연결이 없는 안전 관련 SSR(ASIL A~D, Yes인데 TSR 없음), 없는 TSR 참조, 애매한 참조</p>
          </div>
          {ssrProblems.some((s) => s.problems.some((x) => x.startsWith('없는') || x.startsWith('확인 필요'))) && (
            <button type="button" className="btn btn-small" onClick={onGoIdMap}>
              ID 대응표에서 고르기
            </button>
          )}
        </div>
        {ssrProblems.length === 0 ? (
          <p className="muted pad">{sw.hasSrs ? '문제 없음' : 'SRS 미등록'}</p>
        ) : (
          <div className="table-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th scope="col">SSR ID</th>
                  <th scope="col">제목</th>
                  <th scope="col">ASIL</th>
                  <th scope="col">문제</th>
                  <th scope="col">Functional Safety Related (원문)</th>
                </tr>
              </thead>
              <tbody>
                {ssrProblems.map((s, i) => (
                  <tr key={i}>
                    <td className="mono">{idText(s.item)}</td>
                    <td title={s.item.title}>{shortText(s.item.title, 40)}</td>
                    <td>{s.item.asil || '-'}</td>
                    <td>
                      {s.problems.map((p) => (
                        <div key={p} className={p.startsWith('확인 필요') || p.startsWith('ID 중복') ? 'check-text' : 'warn-text'}>
                          {p}
                        </div>
                      ))}
                    </td>
                    <td className="mono small">{s.item.refRaw || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {sw.hasTests && sw.tests.some((t) => t.problems.length > 0) && (
        <section className="panel" aria-label="SW 시험 쪽 문제 (역방향 확인)">
          <div className="panel-head">
            <div>
              <h2>SW 시험 쪽 문제 (역방향 확인)</h2>
              <p className="muted small">검증 대상(SSR)이 없거나 없는 SSR을 가리키는 시험</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th scope="col">시험 ID</th>
                  <th scope="col">제목</th>
                  <th scope="col">문제</th>
                  <th scope="col">적힌 검증 대상 (원문)</th>
                </tr>
              </thead>
              <tbody>
                {sw.tests
                  .filter((t) => t.problems.length > 0)
                  .map((t, i) => (
                    <tr key={i}>
                      <td className="mono">{idText(t.item)}</td>
                      <td>{shortText(t.item.title, 40)}</td>
                      <td>
                        {t.problems.map((p) => (
                          <div key={p} className={p.startsWith('확인 필요') ? 'check-text' : 'warn-text'}>
                            {p}
                          </div>
                        ))}
                      </td>
                      <td className="mono small">{t.item.refRaw || '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === 'list' && sw.ssrs.length > 0 && (
        <section className="panel pad-panel" aria-label="SSR 목록">
          <Disclosure summary={<span>SSR 목록 {sw.ssrs.length}개 (다음 단계: SW 요구사항 시험)</span>}>
            <div className="table-scroll">
              <table className="trace-table">
                <thead>
                  <tr>
                    <th scope="col">SSR ID</th>
                    <th scope="col">제목</th>
                    <th scope="col">ASIL</th>
                    <th scope="col">안전 관련</th>
                    <th scope="col">위 단계 TSR</th>
                    <th scope="col">SW 시험</th>
                  </tr>
                </thead>
                <tbody>
                  {sw.ssrs.map((s, i) => (
                    <tr key={i}>
                      <td className="mono">{idText(s.item)}</td>
                      <td title={s.item.title}>{shortText(s.item.title, 40)}</td>
                      <td>{s.item.asil || '-'}</td>
                      <td>{s.safety ? '예' : '아니오'}</td>
                      <td className="mono small">
                        {s.refs.map((r, k) => (
                          <div key={k} className={isResolved(r) ? '' : 'warn-text'}>
                            {r.ref}
                          </div>
                        ))}
                      </td>
                      <td>
                        <TraceBadge status={s.status} />
                        <div className="muted small">{s.tests.map((x) => x.test.rawId).join(', ') || s.reason}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Disclosure>
        </section>
      )}
    </div>
  )
}

function HardwareTab({ sys, sw, hw, onImport, onGoIdMap }: { sys: SystemTrace; sw: SoftwareTrace; hw: HardwareTrace; onImport: () => void; onGoIdMap: () => void }): ReactElement {
  const [block, setBlock] = useState('전체')
  const [view, setView] = useState<'map' | 'list'>('map')
  const build = useCallback((o: MapOptions) => buildHardwareMap(hw, o), [hw])
  const blocks = [...new Set([...hw.tsrs.map((t) => swBlockOf(t.item)), ...(hw.hsrs.some((h) => h.refs.length === 0) ? [NO_TSR_BLOCK] : [])])].sort()
  const rows: HwTsrRow[] = hw.tsrs.filter((t) => block === '전체' || swBlockOf(t.item) === block).sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const hsrProblems: HsrRow[] = hw.hsrs.filter((h) => h.problems.length > 0)

  const hwBlockSelect = (
    <label className="select-label">
      묶음
      <select value={block} onChange={(e) => setBlock(e.target.value)}>
        <option value="전체">전체</option>
        {blocks.map((b) => (
          <option key={b}>{b}</option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="page-stack">
      <StageCards cards={hw.cards} />
      {!hw.hasHsr && (
        <section className="panel pad-panel" aria-labelledby="hw-add">
          <h2 id="hw-add">HSR 넣기</h2>
          <p className="muted">
            HSR은 양식이 정해지지 않아 처음 넣을 때 <strong>[칸 지정]</strong>으로 내 ID·위 단계 TSR 칸을 정합니다. 한 번 정하면 같은 모양의 HSR은 다음부터 자동으로 읽습니다.
          </p>
          <button type="button" className="btn btn-primary" onClick={onImport}>
            HSR 넣기
          </button>
        </section>
      )}
      {hw.hasTsc && (
        <section className="panel" aria-label={view === 'map' ? '하드웨어 추적성' : 'TSR(H/W) → HSR 연결'}>
          <div className="panel-head">
            <div>
              <h2>{view === 'map' ? '추적성' : 'TSR(H/W) → HSR 연결'}</h2>
              <p className="muted small">H/W·S/W+H/W 할당 TSR만 HSR이 필요합니다. FMEDA는 양식이 정해지지 않아 작성 여부만 봅니다.</p>
            </div>
            <div className="filters">
              {hwBlockSelect}
              <div className="view-toggle" role="group" aria-label="보기">
                <button type="button" className="chip" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                  추적성
                </button>
                <button type="button" className="chip" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                  목록
                </button>
              </div>
            </div>
          </div>
          {view === 'map' ? (
            <TraceMap build={build} sys={sys} sw={sw} hw={hw} sg={block === '전체' ? 'all' : block} onGoIdMap={onGoIdMap} title="추적성 — 하드웨어 (TSR → HSR → FMEDA)" filter={hwBlockSelect} />
          ) : (
            <div className="table-scroll">
              <table className="trace-table">
                <thead>
                  <tr>
                    <th scope="col">상태</th>
                    <th scope="col">TSR ID</th>
                    <th scope="col">내용</th>
                    <th scope="col">할당</th>
                    <th scope="col">ASIL</th>
                    <th scope="col">연결된 HSR</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`row-${r.status === '누락' ? 'missing' : r.status === '확인 필요' ? 'check' : 'ok'}`}>
                      <td>
                        <TraceBadge status={r.status} text={r.status === '누락' ? r.reason : undefined} />
                        {r.status !== '누락' && r.reason && <div className="muted small">{r.reason}</div>}
                      </td>
                      <td className="mono">{idText(r.item)}</td>
                      <td title={r.item.title}>{shortText(r.item.title, 60)}</td>
                      <td title={r.item.allocationRaw}>{ALLOC_LABEL[r.item.allocation]}</td>
                      <td>{r.item.asil || '-'}</td>
                      <td className="mono small">
                        {r.hsrs.length === 0 && r.ambiguous.length === 0 && '-'}
                        {r.hsrs.map((x, k) => (
                          <div key={k}>
                            {x.hsr.rawId}
                            {x.method === 'tail' && <span className="tag">약식 표기</span>}
                            {x.method === 'alias' && <span className="tag">별칭</span>}
                          </div>
                        ))}
                        {r.ambiguous.map((l, k) => (
                          <div key={`a${k}`}>
                            <span className="tag tag-check">후보</span> {l.from.rawId} — {l.resolution.ref}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {hsrProblems.length > 0 && (
        <section className="panel" aria-label="HSR 쪽 문제 (역방향 확인)">
          <div className="panel-head">
            <div>
              <h2>HSR 쪽 문제 (역방향 확인)</h2>
              <p className="muted small">TSR 연결이 없는 HSR, 없는 TSR 참조, 애매한 참조</p>
            </div>
            {hsrProblems.some((h) => h.problems.some((x) => x.startsWith('없는') || x.startsWith('확인 필요'))) && (
              <button type="button" className="btn btn-small" onClick={onGoIdMap}>
                ID 대응표에서 고르기
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table className="trace-table">
              <thead>
                <tr>
                  <th scope="col">HSR ID</th>
                  <th scope="col">제목</th>
                  <th scope="col">ASIL</th>
                  <th scope="col">문제</th>
                  <th scope="col">적힌 위 단계 ID (원문)</th>
                </tr>
              </thead>
              <tbody>
                {hsrProblems.map((h, i) => (
                  <tr key={i}>
                    <td className="mono">{idText(h.item)}</td>
                    <td>{shortText(h.item.title, 40)}</td>
                    <td>{h.item.asil || '-'}</td>
                    <td>
                      {h.problems.map((p) => (
                        <div key={p} className={p.startsWith('확인 필요') || p.startsWith('ID 중복') ? 'check-text' : 'warn-text'}>
                          {p}
                        </div>
                      ))}
                    </td>
                    <td className="mono small pre">{h.item.refRaw || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel pad-panel" aria-labelledby="fmeda-target">
        <h2 id="fmeda-target">FMEDA 목표값 (참고, ISO 26262-5)</h2>
        <table className="trace-table narrow">
          <thead>
            <tr>
              <th scope="col">ASIL</th>
              <th scope="col">SPFM</th>
              <th scope="col">LFM</th>
              <th scope="col">PMHF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>B</td>
              <td>≥ 90%</td>
              <td>≥ 60%</td>
              <td>&lt; 100 FIT</td>
            </tr>
            <tr>
              <td>C</td>
              <td>≥ 97%</td>
              <td>≥ 80%</td>
              <td>&lt; 100 FIT</td>
            </tr>
            <tr>
              <td>D</td>
              <td>≥ 99%</td>
              <td>≥ 90%</td>
              <td>&lt; 10 FIT</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
