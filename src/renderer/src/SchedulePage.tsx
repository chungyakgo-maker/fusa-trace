/** 산출물 일정 화면 (SPEC §9.2) — 일정·담당은 DIA가 원본이라 여기서 고치지 않음. VR 작성 O/X만 바꿀 수 있음 */
import { useMemo, useState, type ReactElement } from 'react'
import type { Category, IsoDate, Project } from '../../core/model'
import { CATEGORIES } from '../../core/model'
import { addDays, daysBetween } from '../../core/dates'
import {
  assigneeText,
  computeSchedule,
  ddayText,
  groupByCategory,
  ownerOptions,
  rowMatchesOwner,
  SCHEDULE_STATUSES,
  summarize,
  type ScheduleRow,
  type ScheduleStatus
} from '../../core/schedule'
import { AlertIcon } from './icons'
import { EmptyState, ScheduleBadge } from './ui'

/** 올해 날짜는 월-일만, 다른 해는 연도까지 */
function shortDate(d: IsoDate | undefined, today: IsoDate): string {
  if (!d) return '-'
  return d.slice(0, 4) === today.slice(0, 4) ? d.slice(5) : d
}

type StatusFilter = '전체' | ScheduleStatus | '일정 미기재'

function monthStart(d: IsoDate): IsoDate {
  return `${d.slice(0, 7)}-01`
}
function nextMonth(d: IsoDate): IsoDate {
  const [y, m] = d.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

interface Timeline {
  start: IsoDate
  days: number
  pct(d: IsoDate): number
  months: { label: string; left: number; width: number }[]
}

function buildTimeline(rows: ScheduleRow[], today: IsoDate, milestones: IsoDate[]): Timeline {
  const dates = [today, ...milestones]
  for (const r of rows) for (const d of [r.d.planStart, r.d.planEnd, r.d.realStart, r.d.realEnd]) if (d) dates.push(d)
  dates.sort()
  const start = monthStart(dates[0])
  const end = nextMonth(dates[dates.length - 1])
  const days = Math.max(28, daysBetween(start, end))
  const pct = (d: IsoDate): number => (daysBetween(start, d) / days) * 100
  const starts: IsoDate[] = []
  for (let m = start; m < end; m = nextMonth(m)) starts.push(m)
  // 기간이 길면 월 이름을 건너뛰며 표시 (최대 7개 정도)
  const step = Math.max(1, Math.ceil(starts.length / 7))
  const months: Timeline['months'] = starts.map((m, i) => {
    const [y, mm] = m.split('-').map(Number)
    const label = i % step !== 0 ? '' : i === 0 || mm === 1 ? `${String(y).slice(2)}.${mm}월` : `${mm}월`
    return { label, left: pct(m), width: pct(nextMonth(m)) - pct(m) }
  })
  return { start, days, pct, months }
}

const BAR_CLASS: Record<ScheduleStatus, string> = { 완료: 'bar-done', 진행: 'bar-progress', 지연: 'bar-delayed', 미착수: 'bar-todo' }

export function SchedulePage({
  project,
  today,
  onChange,
  onImport
}: {
  project: Project
  today: IsoDate
  onChange: (p: Project) => void
  onImport: () => void
}): ReactElement {
  const rows = useMemo(() => computeSchedule(project, today), [project, today])
  const [category, setCategory] = useState<Category | '전체'>('전체')
  const [owner, setOwner] = useState('전체')
  const [status, setStatus] = useState<StatusFilter>('전체')

  const filtered = rows.filter(
    (r) =>
      (category === '전체' || r.d.category === category) &&
      (owner === '전체' || rowMatchesOwner(r, owner)) &&
      (status === '전체' || (status === '일정 미기재' ? r.noPlan : r.status === status))
  )
  const summary = summarize(rows)
  const milestones = project.settings.milestones.filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date))
  const timeline = useMemo(() => buildTimeline(rows, today, milestones.map((m) => m.date)), [rows, today, milestones])

  if (rows.length === 0) {
    return (
      <EmptyState
        title="DIA를 넣으면 산출물 일정이 나옵니다"
        action={
          <button type="button" className="btn btn-primary" onClick={onImport}>
            문서 넣기
          </button>
        }
      >
        DIA(개발 인터페이스 협약서) 엑셀 파일의 Detailed Agreement 시트에서 산출물, 담당, 계획·실적 일정을 읽습니다.
      </EmptyState>
    )
  }

  const setVr = (key: string, value: 'auto' | 'O' | 'X'): void => {
    const vrOverrides = { ...project.vrOverrides }
    if (value === 'auto') delete vrOverrides[key]
    else vrOverrides[key] = value === 'O'
    onChange({ ...project, vrOverrides })
  }

  const cards: { label: StatusFilter; value: number; tone: string }[] = [
    { label: '전체', value: summary.total, tone: '' },
    { label: '완료', value: summary.done, tone: 'done' },
    { label: '진행', value: summary.inProgress, tone: 'progress' },
    { label: '지연', value: summary.delayed, tone: 'delayed' },
    { label: '미착수', value: summary.notStarted, tone: 'todo' },
    { label: '일정 미기재', value: summary.noPlan, tone: 'warn' }
  ]

  return (
    <div className="page-stack">
      <div className="summary-cards" role="group" aria-label="상태별 건수 (누르면 거르기)">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`summary-card ${c.tone ? `summary-${c.tone}` : ''}`}
            aria-pressed={status === c.label}
            onClick={() => setStatus(status === c.label ? '전체' : c.label)}
          >
            <span className="summary-label">{c.label}</span>
            <span className="summary-value">{c.value}</span>
          </button>
        ))}
      </div>

      <section className="panel" aria-label="산출물 일정표">
        <div className="panel-head">
          <div>
            <h2>산출물별 일정</h2>
            <p className="muted small">일정·담당은 DIA가 원본입니다. 바꾸려면 DIA를 고쳐서 다시 넣어 주세요. VR 작성만 여기서 바꿀 수 있습니다.</p>
          </div>
          <div className="filters">
            <div className="chips" role="group" aria-label="구분">
              {(['전체', ...CATEGORIES] as const).map((c) => (
                <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            <label className="select-label">
              담당
              <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="전체">전체</option>
                {ownerOptions(rows).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="select-label">
              상태
              <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                {(['전체', ...SCHEDULE_STATUSES, '일정 미기재'] as const).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="table-scroll">
          <div className="sched" role="table" aria-label="산출물 일정">
            <div className="sched-row sched-header" role="row">
              <div role="columnheader">산출물</div>
              <div role="columnheader">담당</div>
              <div role="columnheader">상태</div>
              <div role="columnheader">일정 (계획 · 실적)</div>
              <div role="columnheader">VR 작성</div>
              <div role="columnheader" className="gantt-head">
                {timeline.months.map((m) => (
                  <span key={m.left} className="month" style={{ left: `${m.left}%`, width: `${m.width}%` }}>
                    {m.label}
                  </span>
                ))}
                {milestones.map((m) => (
                  <span key={m.id} className="ms-flag" style={{ left: `${timeline.pct(m.date)}%` }} title={`${m.name} ${m.date}`}>
                    {m.name}
                  </span>
                ))}
                <span className="today-flag" style={{ left: `${timeline.pct(today)}%` }}>
                  오늘
                </span>
              </div>
            </div>

            {groupByCategory(filtered).map((g) => (
              <div key={g.category} role="rowgroup">
                <div className="sched-group" role="row">
                  <div role="cell">
                    {g.category} <span className="muted">· {g.rows.length}건</span>
                  </div>
                </div>
                {g.rows.map((r) => (
                  <ScheduleLine key={r.d.key} r={r} timeline={timeline} today={today} milestones={milestones.map((m) => m.date)} onVr={setVr} />
                ))}
              </div>
            ))}
            {filtered.length === 0 && <p className="muted pad">조건에 맞는 산출물이 없습니다.</p>}
          </div>
        </div>
        <div className="legend">
          <span>
            <i className="legend-bar bar-done" />
            완료
          </span>
          <span>
            <i className="legend-bar bar-progress" />
            진행
          </span>
          <span>
            <i className="legend-bar bar-delayed" />
            지연
          </span>
          <span>
            <i className="legend-bar bar-todo" />
            미착수
          </span>
          <span>
            <i className="legend-ms" />
            마일스톤 (설정에서 입력)
          </span>
          <span>기준일 {today}</span>
        </div>
      </section>
    </div>
  )
}

function ScheduleLine({
  r,
  timeline,
  today,
  milestones,
  onVr
}: {
  r: ScheduleRow
  timeline: Timeline
  today: IsoDate
  milestones: IsoDate[]
  onVr: (key: string, v: 'auto' | 'O' | 'X') => void
}): ReactElement {
  const a = assigneeText(r.d)
  const name = `${r.d.workProduct}${r.d.docLabel ? ` [${r.d.docLabel}]` : ''}`
  const warnings = r.d.dateWarnings
  const hasBar = r.d.planStart && r.d.planEnd && r.d.planEnd >= r.d.planStart
  const reg = r.doc ? `등록 ${r.doc.version || '버전 없음'} · ${r.doc.importedAt.slice(5, 10).replace('-', '/')}` : '미등록'
  return (
    <div className={`sched-row${r.d.line > 1 ? ' sched-sub' : ''}`} role="row">
      <div role="cell" className="cell-name">
        <div className="name-line">
          <span className="no">No.{r.d.diaNo}{r.d.lineCount > 1 ? `-${r.d.line}` : ''}</span>
          <strong>{name}</strong>
        </div>
        <div className={`sub-line${r.doc ? '' : ' unregistered'}`} title={r.d.expectedFileName || undefined}>
          {reg}
          {r.docLink?.kindMismatch && <span className="tag tag-check"> 확인 필요</span>}
        </div>
        {r.d.memo.length > 0 && <div className="memo-line">{r.d.memo.join(' · ')}</div>}
        {warnings.map((w) => (
          <div key={w} className="warn-line small">
            <AlertIcon size={12} /> {w}
          </div>
        ))}
      </div>
      <div role="cell" className="cell-owner">
        <div>{a.team}</div>
        <div className="muted small">{a.people}</div>
      </div>
      <div role="cell">
        <ScheduleBadge status={r.status} />
        {r.noPlan && <div className="tag tag-warn">일정 미기재</div>}
      </div>
      <div role="cell" className="cell-dates small">
        <div>
          <span className="date-label">계획</span>
          <span className="mono">
            {shortDate(r.d.planStart, today)} → {shortDate(r.d.planEnd, today)}
          </span>
          <span className={r.status === '지연' ? 'dday-late' : r.status === '완료' ? 'dday-done' : 'muted'}> {ddayText(r)}</span>
        </div>
        {(r.d.realStart || r.d.realEnd) && (
          <div>
            <span className="date-label">실적</span>
            <span className="mono">
              {shortDate(r.d.realStart, today)} → {shortDate(r.d.realEnd, today)}
            </span>
          </div>
        )}
      </div>
      <div role="cell">
        {r.vr === '해당 없음' || !r.vrKey ? (
          <span className="muted small">해당 없음</span>
        ) : (
          <label className="vr-select">
            <span className={`vr-mark vr-${r.vr}`} aria-hidden="true">
              {r.vr}
            </span>
            <select
              aria-label={`${name} VR 작성`}
              value={r.vrManual ? r.vr : 'auto'}
              onChange={(e) => onVr(r.vrKey!, e.target.value as 'auto' | 'O' | 'X')}
            >
              <option value="auto">자동</option>
              <option value="O">O (수동)</option>
              <option value="X">X (수동)</option>
            </select>
            {r.vrManual && <span className="tag">수동</span>}
          </label>
        )}
      </div>
      <div role="cell" className="gantt-cell" aria-hidden="true">
        {timeline.months.map((m) => (
          <i key={m.left} className="gantt-month" style={{ left: `${m.left}%` }} />
        ))}
        {milestones.map((d) => (
          <i key={d} className="gantt-ms" style={{ left: `${timeline.pct(d)}%` }} />
        ))}
        <i className="gantt-today" style={{ left: `${timeline.pct(today)}%` }} />
        {hasBar ? (
          <i
            className={`gantt-bar ${BAR_CLASS[r.status]}`}
            style={{ left: `${timeline.pct(r.d.planStart!)}%`, width: `${Math.max(0.6, timeline.pct(addDays(r.d.planEnd!, 1)) - timeline.pct(r.d.planStart!))}%` }}
            title={`${r.d.planStart} → ${r.d.planEnd}`}
          />
        ) : (
          <span className="gantt-none">일정 미기재</span>
        )}
      </div>
    </div>
  )
}
