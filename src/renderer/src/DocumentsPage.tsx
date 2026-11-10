/** 문서 관리 (SPEC §9.4): 등록된 문서, 버전 이력, 가져오기 결과 다시 보기, DIA 산출물 연결 바꾸기, 삭제 */
import { useMemo, useState, type ReactElement } from 'react'
import type { Deliverable, Project, SourceDoc } from '../../core/model'
import { DOC_KINDS, DOC_KIND_LABEL } from '../../core/model'
import { activeDeliverables, removeDocument } from '../../core/project'
import { computeDocLinks, type DocLinkInfo } from '../../core/schedule'
import { ReportView } from './ImportDialog'
import { AlertIcon, TrashIcon } from './icons'
import { Disclosure, EmptyState, Modal } from './ui'

function deliverableName(d: Deliverable): string {
  return `No.${d.diaNo}${d.lineCount > 1 ? `-${d.line}` : ''} ${d.docLabel || d.workProduct}${d.expectedFileName ? ` — ${d.expectedFileName}` : ''}`
}

function countsText(doc: SourceDoc): string {
  const c = Object.entries(doc.report.counts)
  return c.length ? c.map(([k, v]) => `${k} ${v}`).join(' · ') : '파일 등록'
}

export function DocumentsPage({ project, onChange, onImport }: { project: Project; onChange: (p: Project) => void; onImport: () => void }): ReactElement {
  const [reportOf, setReportOf] = useState<SourceDoc | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SourceDoc | null>(null)
  const deliverables = useMemo(() => activeDeliverables(project), [project])
  const links = useMemo(() => new Map<string, DocLinkInfo>(computeDocLinks(project).map((l) => [l.doc.id, l])), [project])

  if (project.docs.length === 0) {
    return (
      <EmptyState
        title="등록된 문서가 없습니다"
        action={
          <button type="button" className="btn btn-primary" onClick={onImport}>
            문서 넣기
          </button>
        }
      >
        DIA, FSR, TSC 등 엑셀·워드 문서를 끌어다 놓거나 [문서 넣기]로 고르세요. 보안(DRM)을 해제한 파일을 넣어 주세요.
      </EmptyState>
    )
  }

  const setLink = (doc: SourceDoc, value: string): void => {
    const others = project.docLinks.filter((l) => l.normName !== doc.normName)
    const docLinks = value === '__auto' ? others : [...others, { normName: doc.normName, deliverableKey: value === '__none' ? '' : value }]
    onChange({ ...project, docLinks })
  }

  const linkText = (l: DocLinkInfo | undefined): ReactElement => {
    if (!l || deliverables.length === 0) return <span className="muted">DIA 미등록</span>
    const d = deliverables.find((x) => x.key === l.deliverableKey)
    if (d)
      return (
        <span>
          {l.method === 'auto' ? '자동' : '직접 고름'}: No.{d.diaNo}
          {d.lineCount > 1 ? `-${d.line}` : ''} {d.docLabel || d.workProduct}
          {l.kindMismatch && (
            <span className="tag tag-check">
              <AlertIcon size={12} /> 확인 필요: 종류가 안 맞아 보임
            </span>
          )}
        </span>
      )
    if (l.candidates.length > 0) return <span className="warn-text">연결 안 됨 — 비슷한 산출물 {l.candidates.length}개, 오른쪽에서 골라 주세요</span>
    return <span className="muted">{l.method === 'none' && project.docLinks.some((x) => x.normName === l.doc.normName) ? '연결하지 않음 (직접 지정)' : 'DIA에 같은 이름 없음'}</span>
  }

  return (
    <div className="page-stack">
      {DOC_KINDS.map((kind) => {
        const docs = project.docs.filter((d) => d.kind === kind)
        if (docs.length === 0) return null
        const active = docs.filter((d) => d.active)
        return (
          <section key={kind} className="panel" aria-label={DOC_KIND_LABEL[kind]}>
            <div className="panel-head">
              <h2>{DOC_KIND_LABEL[kind]}</h2>
              <span className="muted small">{active.length}개 문서 · 전체 버전 {docs.length}개</span>
            </div>
            <table className="doc-table">
              <thead>
                <tr>
                  <th scope="col">파일</th>
                  <th scope="col">버전</th>
                  <th scope="col">등록일</th>
                  <th scope="col">읽은 항목</th>
                  <th scope="col">경고</th>
                  {kind !== 'DIA' && <th scope="col">DIA 산출물 연결</th>}
                  <th scope="col">
                    <span className="sr-only">동작</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {active.map((doc) => {
                  const l = links.get(doc.id)
                  const older = docs.filter((d) => !d.active && (kind === 'DIA' || d.normName === doc.normName)).sort((a, b) => b.importedAt.localeCompare(a.importedAt))
                  const manual = project.docLinks.find((x) => x.normName === doc.normName)
                  return (
                    <tr key={doc.id}>
                      <td className="file-cell">
                        <div className="file-name">{doc.fileName}</div>
                        {older.length > 0 && (
                          <Disclosure summary={`이전 버전 ${older.length}개`}>
                            <ul className="older-list">
                              {older.map((o) => (
                                <li key={o.id}>
                                  <span>
                                    {o.fileName} · {o.version || '버전 없음'} · {o.importedAt.slice(0, 10)}
                                  </span>
                                  <button type="button" className="link-btn" onClick={() => setReportOf(o)}>
                                    결과 보기
                                  </button>
                                  <button type="button" className="link-btn danger" onClick={() => setConfirmDelete(o)}>
                                    삭제
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </Disclosure>
                        )}
                      </td>
                      <td>{doc.version || '-'}</td>
                      <td>{doc.importedAt.slice(0, 10)}</td>
                      <td>{countsText(doc)}</td>
                      <td>{doc.report.warnings.length > 0 ? <span className="warn-text">{doc.report.warnings.length}</span> : '0'}</td>
                      {kind !== 'DIA' && (
                        <td className="link-cell">
                          <div>{linkText(l)}</div>
                          {deliverables.length > 0 && (
                            <select
                              aria-label={`${doc.fileName} DIA 산출물 연결 바꾸기`}
                              value={manual ? manual.deliverableKey || '__none' : '__auto'}
                              onChange={(e) => setLink(doc, e.target.value)}
                            >
                              <option value="__auto">자동 (파일명으로)</option>
                              <option value="__none">연결하지 않음</option>
                              {l && l.candidates.length > 0 && (
                                <optgroup label="비슷한 이름">
                                  {l.candidates.map((c) => {
                                    const d = deliverables.find((x) => x.key === c.key)!
                                    return (
                                      <option key={`c-${c.key}`} value={c.key}>
                                        {deliverableName(d)} ({Math.round(c.score * 100)}%)
                                      </option>
                                    )
                                  })}
                                </optgroup>
                              )}
                              <optgroup label="모든 산출물">
                                {deliverables.map((d) => (
                                  <option key={d.key} value={d.key}>
                                    {deliverableName(d)}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          )}
                        </td>
                      )}
                      <td className="actions-cell">
                        <button type="button" className="btn btn-small" onClick={() => setReportOf(doc)}>
                          가져오기 결과
                        </button>
                        <button type="button" className="icon-btn" aria-label={`${doc.fileName} 삭제`} onClick={() => setConfirmDelete(doc)}>
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )
      })}

      {reportOf && (
        <Modal title={`가져오기 결과 — ${reportOf.fileName}`} wide onClose={() => setReportOf(null)}>
          <p className="muted small">
            {DOC_KIND_LABEL[reportOf.kind]} · {reportOf.version || '버전 없음'} · {reportOf.importedAt.slice(0, 16).replace('T', ' ')} 등록
          </p>
          <ReportView report={reportOf.report} />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="문서 삭제"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>
                취소
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  onChange(removeDocument(project, confirmDelete.id, new Date().toISOString()))
                  setConfirmDelete(null)
                }}
              >
                삭제
              </button>
            </>
          }
        >
          <p>
            <strong>{confirmDelete.fileName}</strong>을(를) 프로젝트에서 지울까요? 원본 파일은 지워지지 않습니다.
            {confirmDelete.active && ' 이전 버전이 있으면 그 버전이 다시 쓰입니다.'}
          </p>
        </Modal>
      )}
    </div>
  )
}
