/** ID 대응표 (SPEC §9.3): 확인 필요 / 없는 ID / 약식 표기로 자동 연결된 참조, 사람이 고른 별칭 */
import { useMemo, useState, type ReactElement } from 'react'
import type { Alias, DocKind, Project, TraceItem } from '../../core/model'
import { computeSystemTrace, sourceKindOf, type RefLink } from '../../core/trace'
import { computeSoftwareTrace } from '../../core/software'
import { computeHardwareTrace } from '../../core/hardware'
import { itemKey } from '../../core/project'
import { shortText } from '../../core/text'
import { TrashIcon } from './icons'
import { EmptyState, TraceBadge } from './ui'

interface RefGroup {
  sourceKind: DocKind
  norm: string
  ref: string
  method: RefLink['resolution']['method']
  reason?: string
  from: TraceItem[]
  targets: TraceItem[]
}

function groupLinks(links: RefLink[]): RefGroup[] {
  const map = new Map<string, RefGroup>()
  for (const l of links) {
    const sourceKind = sourceKindOf(l.from)
    const k = `${sourceKind}|${l.resolution.method}|${l.resolution.norm}`
    const g = map.get(k) ?? { sourceKind, norm: l.resolution.norm, ref: l.resolution.ref, method: l.resolution.method, reason: l.resolution.reason, from: [], targets: l.resolution.targets }
    if (!g.from.includes(l.from)) g.from.push(l.from)
    map.set(k, g)
  }
  return [...map.values()]
}

function label(item: TraceItem): string {
  if (item.kind === 'FMEA_CAUSE') return item.location
  return `${item.rawId}${item.dupCount > 1 ? ` (중복 #${item.dupIndex})` : ''}`
}

const SOURCE_LABEL: Partial<Record<DocKind, string>> = { TSC: 'TSC → FSR', FMEA: 'FMEA → TSR', SRS: 'SRS → TSR', HSR: 'HSR → TSR', SWTEST: 'SW 시험 → SSR' }
/** 참조 대상 종류: TSC는 FSR, SW 시험은 SSR, 그 외는 TSR */
const TARGET_KIND = (k: DocKind): 'FSR' | 'SSR' | 'TSR' => (k === 'TSC' ? 'FSR' : k === 'SWTEST' ? 'SSR' : 'TSR')

function Picker({ group, options, onSave }: { group: RefGroup; options: TraceItem[]; onSave: (target: TraceItem) => void }): ReactElement {
  const [choice, setChoice] = useState('')
  const name = `pick-${group.sourceKind}-${group.method}-${group.norm}`
  if (options.length <= 6) {
    return (
      <fieldset className="pick">
        <legend className="sr-only">{group.ref}의 대상 고르기</legend>
        {options.map((o) => (
          <label key={itemKey(o)} className="pick-option">
            <input type="radio" name={name} value={itemKey(o)} checked={choice === itemKey(o)} onChange={() => setChoice(itemKey(o))} />
            <span className="mono">{label(o)}</span>
            <span className="muted small">{shortText(o.title, 60)}</span>
            <span className="muted small">· {o.location}</span>
          </label>
        ))}
        <button type="button" className="btn btn-small" disabled={!choice} onClick={() => onSave(options.find((o) => itemKey(o) === choice)!)}>
          이걸로 연결 (기억)
        </button>
      </fieldset>
    )
  }
  return (
    <div className="pick-inline">
      <select aria-label={`${group.ref}의 대상 고르기`} value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">대상 고르기…</option>
        {options.map((o) => (
          <option key={itemKey(o)} value={itemKey(o)}>
            {label(o)} — {shortText(o.title, 40)}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-small" disabled={!choice} onClick={() => onSave(options.find((o) => itemKey(o) === choice)!)}>
        연결 (기억)
      </button>
    </div>
  )
}

export function IdMapPage({ project, onChange }: { project: Project; onChange: (p: Project) => void }): ReactElement {
  const trace = useMemo(() => computeSystemTrace(project), [project])
  const sw = useMemo(() => computeSoftwareTrace(project), [project])
  const hw = useMemo(() => computeHardwareTrace(project), [project])
  const groups = useMemo(
    () => groupLinks([...trace.links, ...sw.links, ...hw.links].filter((l) => l.resolution.method !== 'exact' && l.resolution.method !== 'normalized')),
    [trace, sw, hw]
  )
  const allFsrs = trace.fsrs.map((f) => f.item)
  const allTsrs = trace.tsrs.map((t) => t.item)
  const allSsrs = sw.ssrs.map((s) => s.item)
  const byKey = new Map([...allFsrs, ...allTsrs, ...allSsrs].map((f) => [`${f.kind}:${itemKey(f)}`, f]))
  const optionsFor = (g: RefGroup): TraceItem[] => ({ FSR: allFsrs, SSR: allSsrs, TSR: allTsrs })[TARGET_KIND(g.sourceKind)]

  const saveAlias = (g: RefGroup, target: TraceItem): void => {
    const alias: Alias = { sourceKind: g.sourceKind, ref: g.norm, target: itemKey(target), createdAt: new Date().toISOString() }
    onChange({ ...project, aliases: [...project.aliases.filter((a) => !(a.sourceKind === g.sourceKind && a.ref === g.norm)), alias] })
  }

  if (!trace.hasTsc) {
    return <EmptyState title="TSC를 넣으면 ID 대응표가 채워집니다">TSC(→ FSR), FMEA·SRS·HSR(→ TSR), SW 시험(→ SSR)에 적힌 참조 중 애매하거나 없는 것을 여기서 골라 기억합니다.</EmptyState>
  }

  const ambiguous = groups.filter((g) => g.method === 'ambiguous')
  const missing = groups.filter((g) => g.method === 'missing')
  const tail = groups.filter((g) => g.method === 'tail')

  const section = (title: string, desc: string, list: RefGroup[], render: (g: RefGroup) => ReactElement, emptyText: string): ReactElement => (
    <section className="panel" aria-label={title}>
      <div className="panel-head">
        <div>
          <h2>
            {title} <span className="muted">{list.length}</span>
          </h2>
          <p className="muted small">{desc}</p>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="muted pad">{emptyText}</p>
      ) : (
        <table className="trace-table">
          <thead>
            <tr>
              <th scope="col">문서</th>
              <th scope="col">적힌 참조</th>
              <th scope="col">참조한 항목</th>
              <th scope="col">연결</th>
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={`${g.sourceKind}-${g.method}-${g.norm}`}>
                <td className="small">{SOURCE_LABEL[g.sourceKind] ?? g.sourceKind}</td>
                <td className="mono">{g.ref}</td>
                <td className="mono small">
                  {g.from.slice(0, 8).map((f) => (
                    <div key={`${f.normId}-${f.dupIndex}`}>{label(f)}</div>
                  ))}
                  {g.from.length > 8 && <div className="muted">외 {g.from.length - 8}개</div>}
                </td>
                <td>{render(g)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )

  return (
    <div className="page-stack">
      {section(
        '확인 필요',
        '후보가 여러 개인 참조입니다. 맞는 대상을 한 번 고르면 기억해서, 다음 버전 문서에도 그대로 연결합니다.',
        ambiguous,
        (g) => (
          <>
            <TraceBadge status="확인 필요" text={g.reason ?? '후보 여러 개'} />
            <Picker group={g} options={g.targets} onSave={(t) => saveAlias(g, t)} />
          </>
        ),
        '확인이 필요한 참조가 없습니다.'
      )}
      {section(
        '없는 ID 참조',
        '정의 문서(FSR·TSC)에 없는 ID를 가리킵니다. 오타나 옛 ID라면 맞는 대상을 골라 연결할 수 있습니다. 실제로 없는 요구라면 문서를 고쳐야 합니다.',
        missing,
        (g) => (
          <>
            <TraceBadge status="누락" text="없는 ID" />
            <Picker group={g} options={optionsFor(g)} onSave={(t) => saveAlias(g, t)} />
          </>
        ),
        '없는 ID 참조가 없습니다.'
      )}
      {section(
        '약식 표기로 자동 연결',
        '끝 번호가 같은 대상이 하나뿐이라 자동으로 연결한 참조입니다. 틀렸으면 별칭으로 바꿀 수 있습니다.',
        tail,
        (g) => (
          <span className="mono">
            → {g.targets.map(label).join(', ')} <span className="tag">약식 표기</span>
          </span>
        ),
        '약식 표기 참조가 없습니다.'
      )}

      <section className="panel" aria-label="저장된 별칭">
        <div className="panel-head">
          <div>
            <h2>
              저장된 별칭 <span className="muted">{project.aliases.length}</span>
            </h2>
            <p className="muted small">사람이 고른 연결입니다. 문서를 새 버전으로 넣어도 유지됩니다.</p>
          </div>
        </div>
        {project.aliases.length === 0 ? (
          <p className="muted pad">아직 없습니다.</p>
        ) : (
          <table className="trace-table">
            <thead>
              <tr>
                <th scope="col">문서</th>
                <th scope="col">적힌 참조</th>
                <th scope="col">연결 대상</th>
                <th scope="col">저장일</th>
                <th scope="col">
                  <span className="sr-only">삭제</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {project.aliases.map((a) => {
                const target = byKey.get(`${TARGET_KIND(a.sourceKind)}:${a.target}`)
                return (
                  <tr key={`${a.sourceKind}-${a.ref}`}>
                    <td>{a.sourceKind}</td>
                    <td className="mono">{a.ref}</td>
                    <td className="mono">
                      {a.target}
                      {!target && <span className="tag tag-check">대상이 지금 문서에 없음</span>}
                    </td>
                    <td className="small">{a.createdAt.slice(0, 10)}</td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`${a.ref} 별칭 삭제`}
                        onClick={() => onChange({ ...project, aliases: project.aliases.filter((x) => x !== a) })}
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
