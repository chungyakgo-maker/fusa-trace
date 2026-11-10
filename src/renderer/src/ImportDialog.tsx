/** 가져오기 결과 화면 (SPEC §6.4): 반영 전에 읽은 결과·건너뛴 행·경고·이전 버전과 비교를 보여 준다 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { DocKind, ImportReport, ParsedDocument, Project, ReadOptions, ReadRule } from '../../core/model'
import { DOC_KINDS, DOC_KIND_LABEL, RULE_KINDS } from '../../core/model'
import { MappingEditor } from './MappingEditor'
import { addDocument, activeDeliverables, diffWithPrevious, findSameFile, toSourceDoc, type VersionDiff } from '../../core/project'
import { computeDocLinks } from '../../core/schedule'
import { AlertIcon, FileIcon, LockIcon } from './icons'
import { Disclosure, Modal } from './ui'

interface Entry {
  parsed: ParsedDocument
  include: boolean
  reading: boolean
}

export interface ApplyItem {
  parsed: ParsedDocument
  kind: DocKind
}

function defaultInclude(p: Project, parsed: ParsedDocument): boolean {
  return parsed.ok && parsed.kind !== undefined && !parsed.needsMapping && !findSameFile(p, parsed.hash)
}

const isRuleKind = (k: DocKind | undefined): boolean => k !== undefined && (RULE_KINDS as readonly string[]).includes(k)

export function ReportView({ report }: { report: ImportReport }): ReactElement {
  const counts = Object.entries(report.counts)
  return (
    <div className="report">
      {counts.length > 0 && (
        <p className="report-counts">
          읽은 항목: {counts.map(([k, v]) => `${k} ${v}`).join(' · ')}
        </p>
      )}
      {report.notes.map((n) => (
        <p key={n} className="report-note">
          {n}
        </p>
      ))}
      {report.skipped.length > 0 && (
        <Disclosure summary={<span>건너뛴 행 {report.skipped.length}개 (이유 보기)</span>}>
          <IssueTable issues={report.skipped} />
        </Disclosure>
      )}
      {report.warnings.length > 0 && (
        <Disclosure tone="warn" defaultOpen={report.warnings.length <= 5} summary={<span>경고 {report.warnings.length}개</span>}>
          <IssueTable issues={report.warnings} />
        </Disclosure>
      )}
    </div>
  )
}

function IssueTable({ issues }: { issues: ImportReport['skipped'] }): ReactElement {
  return (
    <table className="issue-table">
      <thead>
        <tr>
          <th scope="col">위치</th>
          <th scope="col">내용</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((i, k) => (
          <tr key={k}>
            <td>{i.where}</td>
            <td>{i.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DiffView({ diff }: { diff: VersionDiff }): ReactElement {
  const list = (items: { label: string; key: string }[]): ReactElement => (
    <ul className="diff-list">
      {items.slice(0, 200).map((i) => (
        <li key={i.key}>{i.label}</li>
      ))}
      {items.length > 200 && <li>… 외 {items.length - 200}개</li>}
    </ul>
  )
  return (
    <div className="diff">
      {diff.warning && (
        <p className="warn-line">
          <AlertIcon /> {diff.warning}
        </p>
      )}
      <p>
        이전 버전과 비교: {diff.countBefore} → {diff.countAfter}개 · 추가 {diff.added.length} · 삭제 {diff.removed.length} · 변경 {diff.changed.length}
      </p>
      {diff.added.length > 0 && <Disclosure summary={`추가 ${diff.added.length}`}>{list(diff.added)}</Disclosure>}
      {diff.removed.length > 0 && <Disclosure summary={`삭제 ${diff.removed.length}`}>{list(diff.removed)}</Disclosure>}
      {diff.changed.length > 0 && (
        <Disclosure summary={`변경 ${diff.changed.length}`}>
          <ul className="diff-list">
            {diff.changed.slice(0, 200).map((c) => (
              <li key={c.key}>
                {c.label} — {c.fields.join(', ')}
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  )
}

export function ImportDialog({
  project,
  paths,
  onApply,
  onClose,
  onRuleSaved
}: {
  project: Project
  paths: string[]
  onApply: (items: ApplyItem[]) => void
  onClose: () => void
  /** 칸 지정 규칙을 프로젝트에 저장 */
  onRuleSaved: (rule: ReadRule) => void
}): ReactElement {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [rules, setRules] = useState<ReadRule[]>(project.settings.readRules ?? [])
  const [mapping, setMapping] = useState<number | null>(null)
  const options = (r: ReadRule[] = rules): ReadOptions => ({ rules: r, synonyms: project.settings.synonyms })

  useEffect(() => {
    let alive = true
    void window.fusa.docs.read(paths.map((path) => ({ path })), options()).then((results) => {
      if (alive) setEntries(results.map((parsed) => ({ parsed, include: defaultInclude(project, parsed), reading: false })))
    })
    return () => {
      alive = false
    }
    // 처음 한 번만 읽음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rereadAs = async (index: number, kind: DocKind | undefined, withRules: ReadRule[] = rules): Promise<void> => {
    const path = entries![index].parsed.path
    setEntries((list) => list && list.map((e, i) => (i === index ? { ...e, reading: true } : e)))
    const [parsed] = await window.fusa.docs.read([{ path, kind }], options(withRules))
    setEntries((list) => list && list.map((e, i) => (i === index ? { parsed, include: defaultInclude(project, parsed), reading: false } : e)))
  }

  /** 칸 지정 저장 → 이 파일과, 같은 묶음의 칸 지정이 필요한 파일을 다시 읽음 */
  const saveRule = (index: number, rule: ReadRule): void => {
    const next = [...rules, rule]
    setRules(next)
    onRuleSaved(rule)
    setMapping(null)
    entries!.forEach((e, k) => {
      if (k === index) void rereadAs(k, rule.docKind, next)
      else if (e.parsed.ok && (e.parsed.needsMapping || !e.parsed.kind)) void rereadAs(k, e.parsed.needsMapping ? e.parsed.kind : undefined, next)
    })
  }

  // 반영했을 때 DIA 산출물과 어떻게 연결될지 미리 보기
  const linkPreview = useMemo(() => {
    if (!entries) return new Map<number, string>()
    let p = project
    const ids = new Map<string, number>()
    entries.forEach((e, i) => {
      if (!e.include || !e.parsed.kind) return
      const id = `preview-${i}`
      ids.set(id, i)
      p = addDocument(p, toSourceDoc(e.parsed, e.parsed.kind, id, new Date().toISOString()), new Date().toISOString())
    })
    const deliverables = new Map(activeDeliverables(p).map((d) => [d.key, d]))
    const out = new Map<number, string>()
    if (deliverables.size === 0) return out
    for (const link of computeDocLinks(p)) {
      const i = ids.get(link.doc.id)
      if (i === undefined) continue
      const d = link.deliverableKey ? deliverables.get(link.deliverableKey) : undefined
      if (d) out.set(i, `DIA No.${d.diaNo}${d.lineCount > 1 ? `-${d.line}` : ''} ${d.docLabel || d.workProduct}에 ${link.method === 'auto' ? '자동 연결' : '연결'}${link.kindMismatch ? ' (확인 필요: 종류가 안 맞아 보임)' : ''}`)
      else if (link.candidates.length > 0) out.set(i, `DIA에 같은 이름이 없음 — 비슷한 산출물 ${link.candidates.length}개 (문서 관리에서 고를 수 있음)`)
      else out.set(i, 'DIA에 같은 이름의 산출물이 없음')
    }
    return out
  }, [entries, project])

  const selected = entries?.filter((e) => e.include && e.parsed.ok && e.parsed.kind) ?? []

  return (
    <Modal
      title="가져오기 결과"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted small">반영하기 전에는 프로젝트가 바뀌지 않습니다.</span>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={selected.length === 0}
            onClick={() => onApply(selected.map((e) => ({ parsed: e.parsed, kind: e.parsed.kind! })))}
          >
            반영 ({selected.length}개)
          </button>
        </>
      }
    >
      {!entries ? (
        <p className="reading" role="status">
          문서 {paths.length}개를 읽는 중입니다… 큰 워드 파일은 몇 초 걸릴 수 있습니다.
        </p>
      ) : (
        <ul className="import-list">
          {entries.map((e, i) => {
            const p = e.parsed
            const same = p.hash ? findSameFile(project, p.hash) : undefined
            const diff = p.ok && p.kind ? diffWithPrevious(project, p.kind, p) : undefined
            return (
              <li key={`${p.path}-${i}`} className={`import-card${p.ok ? '' : ' import-card-error'}`}>
                <div className="import-head">
                  {p.errorKind === 'DRM' ? <LockIcon /> : <FileIcon />}
                  <strong className="file-name">{p.fileName}</strong>
                  {p.version && <span className="tag">{p.version}</span>}
                  {p.ok && (
                    <label className="include">
                      <input
                        type="checkbox"
                        checked={e.include}
                        disabled={!p.kind}
                        onChange={(ev) => setEntries(entries.map((x, k) => (k === i ? { ...x, include: ev.target.checked } : x)))}
                      />
                      반영
                    </label>
                  )}
                </div>
                {!p.ok ? (
                  <p className="error-line" role="alert">
                    <AlertIcon /> {p.error}
                  </p>
                ) : (
                  <>
                    <div className="kind-row">
                      <label>
                        문서 종류{' '}
                        <select
                          value={p.kind ?? ''}
                          disabled={e.reading}
                          onChange={(ev) => void rereadAs(i, ev.target.value as DocKind)}
                        >
                          {!p.kind && <option value="">골라 주세요</option>}
                          {DOC_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {DOC_KIND_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {p.kind && p.detectedKinds.includes(p.kind) && <span className="muted small">자동 판별</span>}
                      {e.reading && <span className="muted small">다시 읽는 중…</span>}
                      <span className="muted small">{(p.elapsedMs / 1000).toFixed(1)}초</span>
                    </div>
                    {same && (
                      <p className="warn-line">
                        <AlertIcon /> 이미 등록된 파일과 내용이 같습니다 ({same.importedAt.slice(0, 10)} 등록). 반영하지 않아도 됩니다.
                      </p>
                    )}
                    {(p.needsMapping || (isRuleKind(p.kind) && !p.items?.length)) && (
                      <div className="mapping-callout">
                        <AlertIcon /> 처음 보는 양식입니다. 칸 역할을 정하면 읽을 수 있습니다.
                        <button type="button" className="btn btn-small btn-primary" onClick={() => setMapping(i)}>
                          칸 지정
                        </button>
                      </div>
                    )}
                    <ReportView report={p.report} />
                    {diff && <DiffView diff={diff} />}
                    {linkPreview.get(i) && <p className="link-line">{linkPreview.get(i)}</p>}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {mapping !== null && entries && (
        <MappingEditor entry={entries[mapping].parsed} onSave={(rule) => saveRule(mapping, rule)} onClose={() => setMapping(null)} />
      )}
    </Modal>
  )
}
