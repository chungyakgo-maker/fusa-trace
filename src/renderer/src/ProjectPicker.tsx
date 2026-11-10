/** 프로젝트 고르기·만들기 */
import { useEffect, useState, type ReactElement } from 'react'
import type { Project, ProjectSummary } from '../../core/model'
import { PlusIcon, TrashIcon } from './icons'
import { Modal } from './ui'

export function ProjectPicker({
  current,
  onOpen,
  onClose
}: {
  current: Project | null
  onOpen: (p: Project) => void
  onClose?: () => void
}): ReactElement {
  const [list, setList] = useState<ProjectSummary[] | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<ProjectSummary | null>(null)
  const refresh = (): void => void window.fusa.projects.list().then(setList)
  useEffect(refresh, [])

  const body = (
    <div className="picker">
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setBusy(true)
          const p = await window.fusa.projects.create(name.trim())
          setBusy(false)
          onOpen(p)
        }}
      >
        <label>
          새 프로젝트 이름 (차종·제어기)
          <input autoFocus value={name} maxLength={100} placeholder="예: 데모 차종 · CTL" onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>
          <PlusIcon /> 만들기
        </button>
      </form>

      {list && list.length > 0 && (
        <>
          <h3>내 프로젝트</h3>
          <ul className="project-list">
            {list.map((p) => (
              <li key={p.id} className={current?.id === p.id ? 'current' : ''}>
                <button
                  type="button"
                  className="project-open"
                  onClick={async () => {
                    const opened = await window.fusa.projects.open(p.id)
                    if (opened) onOpen(opened)
                  }}
                >
                  <strong>{p.name}</strong>
                  <span className="muted small">마지막 변경 {p.updatedAt.slice(0, 10)}</span>
                </button>
                {current?.id !== p.id && (
                  <button type="button" className="icon-btn" aria-label={`${p.name} 프로젝트 삭제`} onClick={() => setConfirm(p)}>
                    <TrashIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {confirm && (
        <div className="confirm-box" role="alertdialog" aria-labelledby="confirm-title">
          <p id="confirm-title">
            <strong>{confirm.name}</strong> 프로젝트를 지울까요? 등록한 문서 정보와 연결 기억이 모두 지워집니다. (원본 문서 파일은 그대로)
          </p>
          <button type="button" className="btn" onClick={() => setConfirm(null)}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              await window.fusa.projects.remove(confirm.id)
              setConfirm(null)
              refresh()
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  )

  if (!onClose) {
    return (
      <main className="welcome">
        <section className="panel pad-panel welcome-card" aria-labelledby="welcome-title">
          <h1 id="welcome-title">FuSa Trace</h1>
          <p className="muted">프로젝트(차종 × 제어기)를 하나 만들고 DIA·FSR·TSC 문서를 넣어 주세요.</p>
          {body}
        </section>
      </main>
    )
  }
  return (
    <Modal title="프로젝트" onClose={onClose}>
      {body}
    </Modal>
  )
}
