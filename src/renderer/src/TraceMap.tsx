/** 연결 지도 (SPEC §9.1): 카드 + 선, 카드를 누르면 위·아래 연결 강조와 상세 패널. 시스템·소프트웨어 탭 공용 */
import { memo, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { TraceItem } from '../../core/model'
import { connectedOf, nodeIdOf, type MapColumn, type MapLayout, type MapNode, type MapOptions, type NodeTone } from '../../core/traceMap'
import type { SystemTrace } from '../../core/trace'
import type { SoftwareTrace } from '../../core/software'
import type { HardwareTrace } from '../../core/hardware'
import { isResolved, METHOD_LABEL, type Resolution } from '../../core/resolve'
import { ORIGIN_LABEL } from '../../core/fsr'
import { AlertIcon, CheckIcon, CircleIcon, HelpIcon, MinusCircleIcon, PlusIcon, XIcon } from './icons'
import { TraceBadge } from './ui'

const TONE_ICON: Partial<Record<NodeTone, ReactElement>> = {
  ok: <CheckIcon size={13} />,
  check: <HelpIcon size={13} />,
  missing: <AlertIcon size={13} />,
  na: <MinusCircleIcon size={13} />,
  pending: <CircleIcon size={13} />,
  ghost: <AlertIcon size={13} />,
  group: <PlusIcon size={13} />
}

/** 카드에 쓰는 상태 글자 (색만으로 구분하지 않도록) */
function stateText(n: MapNode): string {
  if (n.kind === 'group') return '묶음'
  if (n.kind !== 'item') return ''
  if (n.item?.kind === 'FSR') return n.status ?? ''
  if (n.item?.kind === 'TSR' && n.status && n.tone !== 'missing' && n.tone !== 'check' && n.status !== '대상 아님' && n.status !== '문서 대기') return n.status
  return { ok: '연결됨', check: '확인 필요', missing: '문제', na: '대상 아님', pending: '', ghost: '', group: '', sg: '' }[n.tone]
}

const MapCard = memo(function MapCard({
  node,
  col,
  selected,
  dim,
  onPick
}: {
  node: MapNode
  col: MapColumn
  selected: boolean
  dim: boolean
  onPick: (n: MapNode) => void
}): ReactElement {
  const state = stateText(node)
  return (
    <button
      type="button"
      id={`node-${node.id}`}
      className={`map-card tone-${node.tone} kind-${node.kind}${selected ? ' selected' : ''}${dim ? ' dim' : ''}`}
      style={{ left: col.x, top: node.y, width: col.w, height: node.h }}
      aria-pressed={node.kind === 'group' ? undefined : selected}
      aria-label={`${node.title}${state ? `, ${state}` : ''}${node.sub ? `, ${node.sub}` : ''}`}
      title={node.sub}
      onClick={() => onPick(node)}
    >
      <span className="map-card-top">
        {TONE_ICON[node.tone]}
        <span className={`map-card-title${node.kind === 'item' ? ' mono' : ''}`}>{node.title}</span>
        {state && <span className="map-card-state">{state}</span>}
      </span>
      {node.h > 44 && <span className="map-card-sub">{node.sub}</span>}
    </button>
  )
})

function edgePath(cols: MapColumn[], a: MapNode, b: MapNode): string {
  const x1 = cols[a.col].x + cols[a.col].w
  const y1 = a.y + a.h / 2
  const x2 = cols[b.col].x
  const y2 = b.y + b.h / 2
  const dx = Math.max(24, (x2 - x1) / 2)
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

export function TraceMap({
  build,
  sg,
  sys,
  sw,
  hw,
  onGoIdMap
}: {
  /** 배치 계산 (시스템·소프트웨어·하드웨어) */
  build: (opts: MapOptions) => MapLayout
  sg: string
  sys: SystemTrace
  sw: SoftwareTrace
  hw: HardwareTrace
  onGoIdMap: () => void
}): ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandAll, setExpandAll] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [scrollTo, setScrollTo] = useState<string | null>(null)

  const layout: MapLayout = useMemo(() => build({ sg, expanded, expandAll }), [build, sg, expanded, expandAll])
  const byId = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout])
  const focus = useMemo(() => (selected && byId.has(selected) ? connectedOf(layout, selected) : null), [layout, byId, selected])

  useEffect(() => {
    if (!scrollTo) return
    document.getElementById(`node-${scrollTo}`)?.scrollIntoView({ block: 'center', inline: 'nearest' })
    setScrollTo(null)
  }, [scrollTo, layout])

  const pick = (n: MapNode): void => {
    if (n.kind === 'group' && n.block) {
      setExpanded((s) => new Set([...s, n.block!]))
      setSelected(null)
      return
    }
    setSelected((cur) => (cur === n.id ? null : n.id))
  }

  /** 상세 패널에서 다른 항목으로 이동 (접혀 있으면 펼침) */
  const goTo = (item: TraceItem): void => {
    const id = nodeIdOf(item)
    if (!byId.has(id)) setExpandAll(true)
    setSelected(id)
    setScrollTo(id)
  }

  const collapsibleTotal = layout.blocks.reduce((a, b) => a + b.collapsible, 0)
  const anyExpanded = expandAll || expanded.size > 0
  const selectedNode = selected ? byId.get(selected) : undefined

  return (
    <div className="map-wrap">
      <div className="map-toolbar">
        <button
          type="button"
          className="btn btn-small"
          disabled={collapsibleTotal === 0 && !anyExpanded}
          onClick={() => {
            if (anyExpanded) {
              setExpandAll(false)
              setExpanded(new Set())
            } else setExpandAll(true)
          }}
        >
          {anyExpanded ? '정상 연결 모두 접기' : '모두 펼치기'}
        </button>
        <span className="muted small">
          카드 {layout.nodes.length}개 · 정상 연결은 묶음 카드를 누르면 펼쳐집니다 · 카드를 누르면 위·아래 연결만 강조합니다
        </span>
        <span className="map-legend" aria-label="선 모양 설명">
          <span>
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="28" y2="4" className="edge edge-ok" />
            </svg>
            연결됨
          </span>
          <span>
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="28" y2="4" className="edge edge-check" />
            </svg>
            확인 필요
          </span>
          <span>
            <svg width="28" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="28" y2="4" className="edge edge-missing" />
            </svg>
            누락 · 없는 ID
          </span>
        </span>
      </div>

      <div className="map-body">
        <div className="map-scroll" data-testid="trace-map">
          <div className="map-header" style={{ width: layout.width }}>
            {layout.columns.map((c) => (
              <span key={c.label} style={{ left: c.x, width: c.w }}>
                {c.label}
              </span>
            ))}
          </div>
          <div className="map-canvas" style={{ width: layout.width, height: layout.height }}>
            <svg className="map-edges" width={layout.width} height={layout.height} aria-hidden="true">
              {layout.edges.map((e) => {
                const a = byId.get(e.from)
                const b = byId.get(e.to)
                if (!a || !b) return null
                const on = focus?.edges.has(e.id)
                return <path key={e.id} d={edgePath(layout.columns, a, b)} className={`edge edge-${e.style}${focus ? (on ? ' hi' : ' dim') : ''}`} />
              })}
            </svg>
            {layout.nodes.map((n) => (
              <MapCard key={n.id} node={n} col={layout.columns[n.col]} selected={n.id === selected} dim={Boolean(focus && !focus.nodes.has(n.id))} onPick={pick} />
            ))}
          </div>
        </div>
        {selectedNode && <DetailPanel node={selectedNode} sys={sys} sw={sw} hw={hw} onClose={() => setSelected(null)} onGoTo={goTo} onGoIdMap={onGoIdMap} />}
      </div>
    </div>
  )
}

function RefList({ refs, onGoTo }: { refs: Resolution[]; onGoTo: (x: TraceItem) => void }): ReactElement {
  return (
    <ul className="ref-list">
      {refs.map((r, i) => (
        <li key={i}>
          <span className="mono">{r.ref}</span> → <span className={isResolved(r) ? '' : 'warn-text'}>{METHOD_LABEL[r.method]}</span>
          {r.targets.length > 0 && (
            <div className="ref-targets">
              {r.targets.map((x, k) => (
                <ItemLink key={k} item={x} onGoTo={onGoTo} />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function ItemLink({ item, onGoTo }: { item: TraceItem; onGoTo: (x: TraceItem) => void }): ReactElement {
  return (
    <button type="button" className="link-btn mono" onClick={() => onGoTo(item)}>
      {item.rawId}
      {item.dupCount > 1 ? ` (중복 #${item.dupIndex})` : ''}
    </button>
  )
}

export function DetailPanel({
  node,
  sys,
  sw,
  hw,
  onClose,
  onGoTo,
  onGoIdMap
}: {
  node: MapNode
  sys: SystemTrace
  sw: SoftwareTrace
  hw: HardwareTrace
  onClose: () => void
  onGoTo: (item: TraceItem) => void
  onGoIdMap: () => void
}): ReactElement {
  const item = node.item
  const fsrRow = item?.kind === 'FSR' ? sys.fsrs.find((f) => f.item === item) : undefined
  const tsrRow = item?.kind === 'TSR' ? sys.tsrs.find((t) => t.item === item) : undefined
  const swRow = item?.kind === 'TSR' ? sw.tsrs.find((t) => t.item === item) : undefined
  const ssrRow = item?.kind === 'SSR' ? sw.ssrs.find((s) => s.item === item) : undefined
  const hwRow = item?.kind === 'TSR' ? hw.tsrs.find((t) => t.item === item) : undefined
  const hsrRow = item?.kind === 'HSR' ? hw.hsrs.find((h) => h.item === item) : undefined
  const testRow = item?.kind === 'SWTEST' ? sw.tests.find((t) => t.item === item) : undefined
  const doc = item ? sys.sources.get(item) ?? sw.sources.get(item) ?? hw.sources.get(item) : undefined
  const problems = [...(tsrRow?.problems ?? []), ...(ssrRow?.problems ?? []), ...(hsrRow?.problems ?? []), ...(testRow?.problems ?? [])]
  const upRow = hsrRow ?? testRow
  const needsPick =
    Boolean(tsrRow?.refs.some((r) => !isResolved(r))) ||
    Boolean(ssrRow?.refs.some((r) => !isResolved(r))) ||
    Boolean(upRow?.refs.some((r) => !isResolved(r))) ||
    Boolean(fsrRow && fsrRow.ambiguous.length > 0) ||
    Boolean(tsrRow && tsrRow.causeAmbiguous.length > 0) ||
    Boolean(swRow && swRow.ambiguous.length > 0) ||
    Boolean(hwRow && hwRow.ambiguous.length > 0) ||
    Boolean(ssrRow && ssrRow.testAmbiguous.length > 0)
  const kindLabel = item
    ? ({ SG: '안전 목표', FSR: 'FSR', TSR: 'TSR', SSR: 'SSR', HSR: 'HSR', SWTEST: 'SW 요구사항 시험', FMEA_CAUSE: 'FMEA 고장원인' } as Record<string, string>)[item.kind] ?? item.kind
    : node.kind === 'ghost'
      ? '빈 자리'
      : node.kind === 'cluster'
        ? '모음'
        : ''

  return (
    <aside className="map-detail" aria-label="상세">
      <header>
        <div>
          <div className="muted small">{kindLabel}</div>
          <h3 className={node.kind === 'item' ? 'mono' : ''}>{node.title}</h3>
        </div>
        <button type="button" className="icon-btn" aria-label="상세 닫기" onClick={onClose}>
          <XIcon />
        </button>
      </header>

      {fsrRow && (
        <p>
          <TraceBadge status={fsrRow.status} /> {fsrRow.reason && <span className="muted small">{fsrRow.reason}</span>}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="problem-list">
          {problems.map((p) => (
            <li key={p}>
              <AlertIcon size={12} /> {p}
            </li>
          ))}
        </ul>
      )}
      {node.kind === 'ghost' && <p>{node.sub}</p>}
      {node.kind === 'placeholder' && <p className="muted">{node.sub}</p>}

      {item && (
        <>
          {item.title && <p className="detail-title">{item.title}</p>}
          <dl className="detail-list">
            {doc && (
              <>
                <dt>출처 문서</dt>
                <dd>
                  {doc.fileName}
                  <div className="muted small">
                    {doc.version || '버전 없음'} · {item.location}
                  </div>
                </dd>
              </>
            )}
            {item.asil && (
              <>
                <dt>ASIL</dt>
                <dd>{item.asil}</dd>
              </>
            )}
            {item.origin && (
              <>
                <dt>구분</dt>
                <dd>{ORIGIN_LABEL[item.origin]}</dd>
              </>
            )}
            {item.kind === 'TSR' && (
              <>
                <dt>분류 · 할당</dt>
                <dd>
                  {item.attrs['분류'] || '-'} · {item.allocationRaw || '-'}
                </dd>
                <dt>문서 상태</dt>
                <dd>{item.statusRaw || '-'}</dd>
                <dt>요소</dt>
                <dd>{item.element || '-'}</dd>
              </>
            )}
            {item.kind === 'SSR' && (
              <>
                <dt>요소</dt>
                <dd>{item.element || '-'}</dd>
                <dt>상위 요구</dt>
                <dd>{item.attrs['상위 요구'] || '-'}</dd>
              </>
            )}
            {item.attrs['Safe State'] !== undefined && (
              <>
                <dt>Safe State</dt>
                <dd className="pre">{item.attrs['Safe State'] || '-'}</dd>
              </>
            )}
          </dl>
        </>
      )}

      {tsrRow && (
        <section>
          <h4>위 단계 (FSR) 참조</h4>
          <div className="muted small">적힌 참조 원문 (Ref ID)</div>
          <pre className="ref-raw">{tsrRow.item.refRaw || '(비어 있음)'}</pre>
          <RefList refs={tsrRow.refs} onGoTo={onGoTo} />
          <h4>FMEA 근거</h4>
          <p>
            <TraceBadge status={tsrRow.status} /> {tsrRow.reason && <span className="muted small">{tsrRow.reason}</span>}
          </p>
          <ul className="ref-list">
            {tsrRow.causes.map((c, i) => (
              <li key={i}>
                <span className="mono">{c.cause.location}</span> <span className="muted small">{METHOD_LABEL[c.method]}</span>
                <div className="muted small">{c.cause.title}</div>
              </li>
            ))}
            {tsrRow.causeAmbiguous.map((l, i) => (
              <li key={`a${i}`}>
                {l.from.location} <span className="check-text small">후보 (확인 필요: {l.resolution.ref})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {swRow && (
        <section>
          <h4>SSR 연결</h4>
          <p>
            <TraceBadge status={swRow.status} /> {swRow.reason && <span className="muted small">{swRow.reason}</span>}
          </p>
          <ul className="ref-list">
            {swRow.ssrs.map((x, i) => (
              <li key={i}>
                <ItemLink item={x.ssr} onGoTo={onGoTo} /> <span className="muted small">{METHOD_LABEL[x.method]}</span>
              </li>
            ))}
            {swRow.ambiguous.map((l, i) => (
              <li key={`a${i}`}>
                <ItemLink item={l.from} onGoTo={onGoTo} /> <span className="check-text small">후보 (확인 필요: {l.resolution.ref})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ssrRow && (
        <section>
          <h4>위 단계 (TSR) 참조</h4>
          <div className="muted small">적힌 참조 원문 (Functional Safety Related)</div>
          <pre className="ref-raw">{ssrRow.item.refRaw || '(비어 있음)'}</pre>
          <RefList refs={ssrRow.refs} onGoTo={onGoTo} />
          <h4>SW 요구사항 시험</h4>
          <p>
            <TraceBadge status={ssrRow.status} /> <span className="muted small">{ssrRow.reason}</span>
          </p>
          <ul className="ref-list">
            {ssrRow.tests.map((x, i) => (
              <li key={i}>
                <span className="mono">{x.test.rawId}</span> <span className="muted small">{METHOD_LABEL[x.method]}</span>
                <div className="muted small">{x.test.title}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hwRow && (
        <section>
          <h4>HSR 연결</h4>
          <p>
            <TraceBadge status={hwRow.status} /> {hwRow.reason && <span className="muted small">{hwRow.reason}</span>}
          </p>
          <ul className="ref-list">
            {hwRow.hsrs.map((x, i) => (
              <li key={i}>
                <ItemLink item={x.hsr} onGoTo={onGoTo} /> <span className="muted small">{METHOD_LABEL[x.method]}</span>
              </li>
            ))}
            {hwRow.ambiguous.map((l, i) => (
              <li key={`a${i}`}>
                <ItemLink item={l.from} onGoTo={onGoTo} /> <span className="check-text small">후보 (확인 필요: {l.resolution.ref})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upRow && (
        <section>
          <h4>위 단계 ({hsrRow ? 'TSR' : 'SSR'}) 참조</h4>
          <div className="muted small">적힌 참조 원문 (칸 지정한 위 단계 ID 칸)</div>
          <pre className="ref-raw">{upRow.item.refRaw || '(비어 있음)'}</pre>
          <RefList refs={upRow.refs} onGoTo={onGoTo} />
          {hsrRow && (
            <>
              <h4>FMEDA</h4>
              <p>
                <TraceBadge status={hsrRow.status} /> <span className="muted small">{hsrRow.reason}</span>
              </p>
            </>
          )}
        </section>
      )}

      {fsrRow && (
        <section>
          <h4>연결된 TSR {fsrRow.tsrs.length}개</h4>
          {fsrRow.tsrs.length === 0 && <p className="muted small">없음</p>}
          <ul className="ref-list">
            {fsrRow.tsrs.map((x, i) => (
              <li key={i}>
                <ItemLink item={x.tsr} onGoTo={onGoTo} /> <span className="muted small">{METHOD_LABEL[x.method]}</span>
              </li>
            ))}
            {fsrRow.ambiguous.map((l, i) => (
              <li key={`a${i}`}>
                <ItemLink item={l.from} onGoTo={onGoTo} /> <span className="check-text small">후보 (확인 필요: {l.resolution.ref})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {node.kind === 'cluster' && node.items && (
        <section>
          <h4>{node.items[0]?.kind === 'SWTEST' ? 'SW 시험' : '고장원인'} {node.items.length}건</h4>
          <ul className="ref-list">
            {node.items.map((c, i) => (
              <li key={i}>
                <div>{c.title}</div>
                <div className="muted small">
                  {c.kind === 'SWTEST' ? c.rawId : c.location} · {c.kind === 'SWTEST' ? '검증 대상' : 'TSR ID'}: <span className="mono">{c.refRaw.replace(/\s+/g, ' ').trim() || '-'}</span>
                  {c.asil ? ` · ASIL ${c.asil}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {item?.kind === 'SG' && (
        <dl className="detail-list">
          {Object.entries(item.attrs).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v || '-'}</dd>
            </div>
          ))}
        </dl>
      )}

      {needsPick && (
        <button type="button" className="btn btn-small" onClick={onGoIdMap}>
          ID 대응표에서 고르기
        </button>
      )}
    </aside>
  )
}
