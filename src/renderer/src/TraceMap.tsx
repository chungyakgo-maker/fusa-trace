/** 연결 지도 (SPEC §9.1): 카드 + 선, 카드를 누르면 위·아래 연결 강조와 상세 패널 */
import { memo, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { TraceItem } from '../../core/model'
import { buildTraceMap, COL_W, COL_X, connectedOf, MAP_COLUMNS, nodeIdOf, type MapLayout, type MapNode, type NodeTone } from '../../core/traceMap'
import type { FsrRow, SystemTrace, TsrRow } from '../../core/trace'
import { isResolved, METHOD_LABEL } from '../../core/resolve'
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
  if (n.kind === 'ghost' || n.kind === 'sg' || n.kind === 'placeholder') return ''
  if (n.item?.kind === 'FSR') return n.status ?? ''
  return { ok: '연결됨', check: '확인 필요', missing: '없는 FSR 참조', na: '미적용', pending: '', ghost: '', group: '', sg: '' }[n.tone]
}

const MapCard = memo(function MapCard({
  node,
  selected,
  dim,
  onPick
}: {
  node: MapNode
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
      style={{ left: COL_X[node.col], top: node.y, width: COL_W[node.col], height: node.h }}
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

function edgePath(a: MapNode, b: MapNode): string {
  const x1 = COL_X[a.col] + COL_W[a.col]
  const y1 = a.y + a.h / 2
  const x2 = COL_X[b.col]
  const y2 = b.y + b.h / 2
  const dx = Math.max(24, (x2 - x1) / 2)
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

export function TraceMap({ trace, sg, onGoIdMap }: { trace: SystemTrace; sg: string; onGoIdMap: () => void }): ReactElement {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandAll, setExpandAll] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [scrollTo, setScrollTo] = useState<string | null>(null)

  const layout: MapLayout = useMemo(() => buildTraceMap(trace, { sg, expanded, expandAll }), [trace, sg, expanded, expandAll])
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
            {MAP_COLUMNS.map((c, i) => (
              <span key={c} style={{ left: COL_X[i], width: COL_W[i] }}>
                {c}
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
                return <path key={e.id} d={edgePath(a, b)} className={`edge edge-${e.style}${focus ? (on ? ' hi' : ' dim') : ''}`} />
              })}
            </svg>
            {layout.nodes.map((n) => (
              <MapCard key={n.id} node={n} selected={n.id === selected} dim={Boolean(focus && !focus.nodes.has(n.id))} onPick={pick} />
            ))}
          </div>
        </div>
        {selectedNode && <DetailPanel node={selectedNode} trace={trace} onClose={() => setSelected(null)} onGoTo={goTo} onGoIdMap={onGoIdMap} />}
      </div>
    </div>
  )
}

function DetailPanel({
  node,
  trace,
  onClose,
  onGoTo,
  onGoIdMap
}: {
  node: MapNode
  trace: SystemTrace
  onClose: () => void
  onGoTo: (item: TraceItem) => void
  onGoIdMap: () => void
}): ReactElement {
  const item = node.item
  const fsrRow: FsrRow | undefined = item?.kind === 'FSR' ? trace.fsrs.find((f) => f.item === item) : undefined
  const tsrRow: TsrRow | undefined = item?.kind === 'TSR' ? trace.tsrs.find((t) => t.item === item) : undefined
  const doc = item ? trace.sources.get(item) : undefined
  const needsPick = Boolean(tsrRow?.refs.some((r) => !isResolved(r)) || (fsrRow && fsrRow.ambiguous.length > 0))
  const itemLink = (x: TraceItem): ReactElement => (
    <button type="button" className="link-btn mono" onClick={() => onGoTo(x)}>
      {x.rawId}
      {x.dupCount > 1 ? ` (중복 #${x.dupIndex})` : ''}
    </button>
  )

  return (
    <aside className="map-detail" aria-label="상세">
      <header>
        <div>
          <div className="muted small">{item ? (item.kind === 'SG' ? '안전 목표' : item.kind) : node.kind === 'ghost' ? '빈 자리' : ''}</div>
          <h3 className="mono">{node.title}</h3>
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
      {tsrRow && tsrRow.problems.length > 0 && (
        <ul className="problem-list">
          {tsrRow.problems.map((p) => (
            <li key={p}>
              <AlertIcon size={12} /> {p}
            </li>
          ))}
        </ul>
      )}
      {node.kind === 'ghost' && <p>{node.sub}</p>}
      {node.kind === 'placeholder' && <p className="muted">{node.sub}. FMEA 근거 연결은 M4에서 FMEA를 읽은 뒤 그립니다.</p>}

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
          <div className="muted small">적힌 참조 원문</div>
          <pre className="ref-raw">{tsrRow.item.refRaw || '(비어 있음)'}</pre>
          <ul className="ref-list">
            {tsrRow.refs.map((r, i) => (
              <li key={i}>
                <span className="mono">{r.ref}</span> → <span className={isResolved(r) ? '' : 'warn-text'}>{METHOD_LABEL[r.method]}</span>
                {r.targets.length > 0 && (
                  <div className="ref-targets">
                    {r.targets.map((x, k) => (
                      <span key={k}>{itemLink(x)}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {fsrRow && (
        <section>
          <h4>연결된 TSR {fsrRow.tsrs.length}개</h4>
          {fsrRow.tsrs.length === 0 && <p className="muted small">없음</p>}
          <ul className="ref-list">
            {fsrRow.tsrs.map((x, i) => (
              <li key={i}>
                {itemLink(x.tsr)} <span className="muted small">{METHOD_LABEL[x.method]}</span>
              </li>
            ))}
            {fsrRow.ambiguous.map((l, i) => (
              <li key={`a${i}`}>
                {itemLink(l.from)} <span className="check-text small">후보 (확인 필요: {l.resolution.ref})</span>
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
