/** 검사 결과 (SPEC 검사 결과 화면): 오류·경고·참고 건수, 문서별 지적 막대, 지적 목록과 거르기, 지적 → 추적성 지도에서 강조 */
import { useMemo, useState, type ReactElement } from 'react'
import type { Project } from '../../core/model'
import { RULES, runChecks, SEVERITIES, type Finding, type Severity } from '../../core/check'
import { AlertIcon, CircleIcon, DownloadIcon, InfoIcon } from './icons'
import { EmptyState } from './ui'

const SEV_CLASS: Record<Severity, string> = { 오류: 'sev-error', 경고: 'sev-warn', 참고: 'sev-note' }

export function SeverityBadge({ s }: { s: Severity }): ReactElement {
  return (
    <span className={`sev ${SEV_CLASS[s]}`}>
      {s === '오류' ? <AlertIcon size={12} /> : s === '경고' ? <InfoIcon /> : <CircleIcon size={12} />}
      {s}
    </span>
  )
}

export function CheckPage({
  project,
  onFocus,
  onImport,
  onReport
}: {
  project: Project
  /** 지적 → 추적성 지도에서 해당 항목 강조 */
  onFocus: (f: Finding) => void
  onImport: () => void
  onReport: () => void
}): ReactElement {
  const result = useMemo(() => runChecks(project), [project])
  const [sev, setSev] = useState<Severity | '전체'>('전체')
  const [rule, setRule] = useState('전체')
  const [doc, setDoc] = useState('전체')

  const docs = useMemo(() => {
    const m = new Map<string, Record<Severity, number>>()
    for (const f of result.findings) {
      const c = m.get(f.fixDoc) ?? { 오류: 0, 경고: 0, 참고: 0 }
      c[f.severity]++
      m.set(f.fixDoc, c)
    }
    return [...m].sort((a, b) => b[1].오류 - a[1].오류 || b[1].경고 - a[1].경고 || a[0].localeCompare(b[0]))
  }, [result])
  const maxDoc = Math.max(1, ...docs.map(([, c]) => c.오류 + c.경고 + c.참고))

  if (result.docs.filter((d) => d.kind !== 'DIA' && d.kind !== 'VR').length === 0) {
    return (
      <EmptyState
        title="문서를 넣으면 검사 결과가 나옵니다"
        action={
          <button type="button" className="btn btn-primary" onClick={onImport}>
            문서 넣기
          </button>
        }
      >
        FSR, TSC, FMEA, SRS 등을 넣으면 추적성 연결이 끊긴 곳을 규칙(C-01~C-12, K-04)으로 찾아, 고칠 문서·위치·근거 조항과 함께 보여 줍니다.
      </EmptyState>
    )
  }

  const shown = result.findings.filter((f) => (sev === '전체' || f.severity === sev) && (rule === '전체' || f.ruleId === rule) && (doc === '전체' || f.fixDoc === doc))
  const usedRules = RULES.filter((r) => result.findings.some((f) => f.ruleId === r.id))

  return (
    <div className="page-stack">
      <div className="summary-cards check-cards" role="group" aria-label="심각도별 건수 (누르면 거르기)">
        {SEVERITIES.map((s) => (
          <button key={s} type="button" className={`summary-card check-card ${SEV_CLASS[s]}`} aria-pressed={sev === s} onClick={() => setSev(sev === s ? '전체' : s)}>
            <span className="summary-label">
              <SeverityBadge s={s} />
            </span>
            <span className="summary-value">{result.counts[s]}</span>
            <span className="muted small">{s === '오류' ? '제출 전 반드시 수정' : s === '경고' ? '확인 필요' : '문서 대기 등'}</span>
          </button>
        ))}
        <div className="summary-card check-report">
          <span className="summary-label">검사 리포트</span>
          <button type="button" className="btn btn-primary btn-small" onClick={onReport}>
            <DownloadIcon /> 엑셀로 저장
          </button>
          <span className="muted small">요약 + 지적 목록 (조치 칸 포함)</span>
        </div>
      </div>

      <section className="panel pad-panel" aria-labelledby="c-docs">
        <h2 id="c-docs">어느 문서를 먼저 고칠지</h2>
        <p className="muted small">고칠 문서별 지적 건수 (오류 많은 순). 막대를 누르면 그 문서의 지적만 봅니다.</p>
        <ul className="doc-bars">
          {docs.map(([name, c]) => {
            const total = c.오류 + c.경고 + c.참고
            return (
              <li key={name}>
                <button type="button" className="doc-bar-btn" aria-pressed={doc === name} onClick={() => setDoc(doc === name ? '전체' : name)}>
                  <span className="doc-bar-name">{name}</span>
                  <span className="doc-bar" aria-hidden="true">
                    {SEVERITIES.map((s) => (c[s] > 0 ? <i key={s} className={SEV_CLASS[s]} style={{ width: `${(c[s] / maxDoc) * 100}%` }} /> : null))}
                  </span>
                  <span className="doc-bar-count small">
                    오류 {c.오류} · 경고 {c.경고} · 참고 {c.참고} (합계 {total})
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel" aria-labelledby="c-list">
        <div className="panel-head">
          <div>
            <h2 id="c-list">지적 목록 {shown.length}건</h2>
            <p className="muted small">지적을 누르면 추적성 지도에서 그 항목과 연결을 강조합니다. 같은 문서를 넣으면 항상 같은 결과가 나옵니다.</p>
          </div>
          <div className="filters">
            <label className="select-label">
              심각도
              <select value={sev} onChange={(e) => setSev(e.target.value as Severity | '전체')}>
                <option value="전체">전체</option>
                {SEVERITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="select-label">
              규칙
              <select value={rule} onChange={(e) => setRule(e.target.value)}>
                <option value="전체">전체</option>
                {usedRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-label">
              문서
              <select value={doc} onChange={(e) => setDoc(e.target.value)}>
                <option value="전체">전체</option>
                {docs.map(([name]) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="table-scroll">
          <table className="trace-table check-table">
            <thead>
              <tr>
                <th scope="col">심각도</th>
                <th scope="col">규칙</th>
                <th scope="col">고칠 문서</th>
                <th scope="col">항목 · 내용</th>
                <th scope="col">위치</th>
                <th scope="col">근거 조항</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.fingerprint}>
                  <td>
                    <SeverityBadge s={f.severity} />
                  </td>
                  <td className="nowrap">
                    <span className="mono">{f.ruleId}</span>
                    <div className="muted small">{f.ruleName}</div>
                  </td>
                  <td>
                    {f.fixDoc}
                    {f.fixFile && <div className="muted small">{f.fixFile}</div>}
                  </td>
                  <td>
                    {f.item ? (
                      <button type="button" className="link-btn finding-link" aria-label={`${f.itemId} 추적성에서 보기`} onClick={() => onFocus(f)}>
                        <span className="mono">{f.itemId}</span>
                      </button>
                    ) : (
                      <span className="muted">(문서 전체)</span>
                    )}
                    <div>{f.message}</div>
                    {f.related.length > 0 && <div className="muted small">관련: {f.related.join(', ')}</div>}
                  </td>
                  <td className="small">{f.location || '-'}</td>
                  <td className="small nowrap">{f.clause}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    조건에 맞는 지적이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
