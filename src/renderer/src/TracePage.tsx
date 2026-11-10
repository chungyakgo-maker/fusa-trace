/** 추적성 (SPEC §9.1): 시스템 / 소프트웨어 / 하드웨어 탭. M2: 시스템 탭 단계 카드 + 목록 보기 (연결 지도는 M3) */
import { Fragment, useMemo, useState, type ReactElement } from 'react'
import type { Project, TraceItem } from '../../core/model'
import { computeSystemTrace, TRACE_STATUSES, type FsrRow, type StageCard, type SystemTrace, type TraceStatus, type TsrRow } from '../../core/trace'
import { ORIGIN_LABEL } from '../../core/fsr'
import { isResolved } from '../../core/resolve'
import { shortText } from '../../core/text'
import { Disclosure, EmptyState, TraceBadge } from './ui'

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
        {tab === 'system' && <SystemTab trace={trace} onImport={onImport} onGoIdMap={onGoIdMap} />}
        {tab === 'software' && <SoftwareTab trace={trace} />}
        {tab === 'hardware' && <HardwareTab trace={trace} onImport={onImport} />}
      </div>
    </div>
  )
}

function SystemTab({ trace, onImport, onGoIdMap }: { trace: SystemTrace; onImport: () => void; onGoIdMap: () => void }): ReactElement {
  const [sg, setSg] = useState('전체')
  const [status, setStatus] = useState<TraceStatus | '전체'>('전체')

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

  return (
    <div className="page-stack">
      <StageCards cards={trace.cards} />

      <section className="panel" aria-label="FSR 기준 연결">
        <div className="panel-head">
          <div>
            <h2>FSR → TSR 연결</h2>
            <p className="muted small">문제 있는 항목을 먼저 보여 줍니다. 대상 아님(타 ECU에 요구)은 연결률 계산에서 뺍니다.</p>
          </div>
          <div className="filters">
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
            <div className="view-toggle" role="group" aria-label="보기">
              <button type="button" className="chip" aria-pressed="true">
                목록
              </button>
              <button type="button" className="chip" disabled title="M3에서 제공">
                연결 지도 (M3)
              </button>
            </div>
          </div>
        </div>
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

      {trace.tsrs.length > 0 && (
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

function SoftwareTab({ trace }: { trace: SystemTrace }): ReactElement {
  const sw = trace.tsrs.filter((t) => t.item.allocation === 'SW' || t.item.allocation === 'BOTH')
  return (
    <div className="page-stack">
      <StageCards
        cards={[
          trace.hasTsc ? { label: 'S/W 할당 TSR', count: sw.length } : { label: 'S/W 할당 TSR', pending: 'TSC 미등록' },
          { label: 'SSR 연결', pending: 'SRS 내용은 M4부터 읽음' },
          { label: 'SW 요구사항 시험', pending: '문서 미등록 (자리)' }
        ]}
      />
      <EmptyState title="소프트웨어 탭은 M4에서 만들어집니다">
        SRS를 읽어 TSR(S/W) → SSR 연결과, TSR 연결이 없는 안전 관련 SSR(역방향 확인)을 보여 줍니다.
      </EmptyState>
    </div>
  )
}

function HardwareTab({ trace, onImport }: { trace: SystemTrace; onImport: () => void }): ReactElement {
  const hw = trace.tsrs.filter((t) => t.item.allocation === 'HW' || t.item.allocation === 'BOTH')
  return (
    <div className="page-stack">
      <StageCards
        cards={[
          trace.hasTsc ? { label: 'H/W 할당 TSR', count: hw.length } : { label: 'H/W 할당 TSR', pending: 'TSC 미등록' },
          { label: 'HSR 연결', pending: '문서 미등록' },
          { label: 'FMEDA', pending: '문서 미등록' }
        ]}
      />
      <section className="panel pad-panel" aria-labelledby="hw-later">
        <h2 id="hw-later">HSR · FMEDA (양식 미정)</h2>
        <p className="muted">HSR 문서 양식이 정해지면 칸 지정(M5)으로 연결합니다.</p>
        <button type="button" className="btn" onClick={onImport}>
          HSR 넣기
        </button>
        <h3 className="sub-title">FMEDA 목표값 (참고, ISO 26262-5)</h3>
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
