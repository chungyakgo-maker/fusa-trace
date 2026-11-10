import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { Project } from '../../core/model'
import { addDocument, toSourceDoc } from '../../core/project'
import { effectiveToday } from '../../core/schedule'
import { MENU, type PageId } from './menu'
import { DownloadIcon, LinkIcon, OfflineIcon, PageIcon, UploadIcon } from './icons'
import { ImportDialog, type ApplyItem } from './ImportDialog'
import { SchedulePage } from './SchedulePage'
import { DocumentsPage } from './DocumentsPage'
import { SettingsPage } from './SettingsPage'
import { TracePage } from './TracePage'
import { IdMapPage } from './IdMapPage'
import { ProjectPicker } from './ProjectPicker'
import { Modal, ToastProvider, useToast } from './ui'
import { pendingReviewCount } from './traceView'
import { UpdateBanner, useUpdateState } from './Update'

export function App(): ReactElement {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

function Shell(): ReactElement {
  const toast = useToast()
  const updateState = useUpdateState()
  const [project, setProject] = useState<Project | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [page, setPage] = useState<PageId>('schedule')
  const [importPaths, setImportPaths] = useState<string[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [includeTrace, setIncludeTrace] = useState(true)

  useEffect(() => {
    void window.fusa.projects.last().then((p) => {
      setProject(p)
      setLoaded(true)
    })
  }, [])

  /** 바꾼 내용을 바로 저장 (임시 파일 → 바꿔치기) */
  const update = useCallback(
    async (next: Project) => {
      const stamped = { ...next, updatedAt: new Date().toISOString() }
      setProject(stamped)
      const r = await window.fusa.projects.save(stamped)
      if (!r.ok) toast.show('error', `저장하지 못했습니다: ${r.error}. 이전 데이터는 그대로 남아 있습니다.`)
    },
    [toast]
  )

  const today = project ? effectiveToday(project) : ''
  const reviewCount = useMemo(() => (project ? pendingReviewCount(project) : 0), [project])

  const pickFiles = async (): Promise<void> => {
    const paths = await window.fusa.docs.pick()
    if (paths.length > 0) setImportPaths(paths)
  }

  const applyImport = (items: ApplyItem[]): void => {
    if (!project) return
    let p = project
    for (const item of items) {
      const now = new Date().toISOString()
      p = addDocument(p, toSourceDoc(item.parsed, item.kind, crypto.randomUUID(), now), now)
    }
    void update(p)
    setImportPaths(null)
    toast.show('ok', `문서 ${items.length}개를 반영했습니다.`)
    if (items.some((i) => i.kind === 'DIA')) setPage('schedule')
  }

  const exportExcel = async (): Promise<void> => {
    if (!project) return
    setExportOpen(false)
    setExporting(true)
    const r = await window.fusa.exportSchedule(project, today, { includeTrace })
    setExporting(false)
    if (r.ok && r.path) {
      const path = r.path
      toast.show('ok', '엑셀로 저장했습니다.', { label: '폴더 열기', run: () => void window.fusa.showInFolder(path) })
    } else if (!r.canceled) toast.show('error', `엑셀 출력 실패: ${r.error}`)
  }

  if (!loaded) return <div className="loading" />
  if (!project)
    return (
      <ProjectPicker
        current={null}
        onOpen={(p) => {
          setProject(p)
          setPage('schedule')
        }}
      />
    )

  const current = MENU.find((m) => m.id === page) ?? MENU[0]
  const hasDia = project.docs.some((d) => d.active && d.kind === 'DIA')

  return (
    <div
      className="app"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const paths = [...e.dataTransfer.files].map((f) => window.fusa.docs.pathOf(f)).filter(Boolean)
        if (paths.length > 0) setImportPaths(paths)
      }}
    >
      <nav className="sidebar" aria-label="주 메뉴">
        <div className="brand">
          <div className="brand-mark">
            <LinkIcon size={18} />
          </div>
          <div>
            <div className="brand-name">FuSa Trace</div>
            <div className="muted small">기능안전 추적성</div>
          </div>
        </div>

        <button type="button" className="project-card" onClick={() => setPickerOpen(true)} aria-label={`프로젝트: ${project.name} (바꾸기)`}>
          <span className="muted tiny">프로젝트</span>
          <span className="project-name">{project.name}</span>
          <span className="muted small">문서 {project.docs.filter((d) => d.active).length}개 · 바꾸기</span>
        </button>

        <ul className="menu">
          {MENU.map((item) => (
            <li key={item.id}>
              <button type="button" className="menu-item" aria-current={item.id === page ? 'page' : undefined} onClick={() => setPage(item.id)}>
                <PageIcon id={item.id} />
                {item.label}
                {item.id === 'idmap' && reviewCount > 0 && (
                  <span className="count-pill" aria-label={`확인 필요 ${reviewCount}건`}>
                    {reviewCount}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {project.settings.milestones.length > 0 && (
          <div className="side-ms">
            <div className="side-title">마일스톤</div>
            {project.settings.milestones
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((m) => (
                <div key={m.id} className="side-ms-row">
                  <strong>{m.name}</strong>
                  <span className="mono">{m.date}</span>
                </div>
              ))}
          </div>
        )}

        <div className="sidebar-footer">
          <span className="offline-badge" title="문서·프로젝트 내용은 밖으로 보내지 않습니다. 외부 접속은 업데이트 확인(GitHub)만 합니다.">
            <OfflineIcon />
            외부 연결: 업데이트만
          </span>
          <span className="version" data-testid="app-version">
            v{__APP_VERSION__}
          </span>
        </div>
      </nav>

      <main className="main">
        <UpdateBanner state={updateState} />
        <header className="page-header">
          <div>
            <div className="muted small">
              {project.name} · 기준일 {today}
              {project.settings.todayOverride ? ' (직접 지정)' : ''}
            </div>
            <h1>{current.label}</h1>
          </div>
          <div className="actions">
            <button type="button" className="btn" disabled={!hasDia || exporting} onClick={() => setExportOpen(true)} title={hasDia ? undefined : 'DIA를 먼저 넣어 주세요'}>
              <DownloadIcon />
              {exporting ? '만드는 중…' : '엑셀 출력'}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void pickFiles()}>
              <UploadIcon />
              문서 넣기
            </button>
          </div>
        </header>

        {page === 'schedule' && <SchedulePage project={project} today={today} onChange={(p) => void update(p)} onImport={() => void pickFiles()} />}
        {page === 'documents' && <DocumentsPage project={project} onChange={(p) => void update(p)} onImport={() => void pickFiles()} />}
        {page === 'settings' && <SettingsPage project={project} onChange={(p) => void update(p)} />}
        {page === 'trace' && <TracePage project={project} onImport={() => void pickFiles()} onGoIdMap={() => setPage('idmap')} />}
        {page === 'idmap' && <IdMapPage project={project} onChange={(p) => void update(p)} />}
      </main>

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <UploadIcon />
            <p>여기에 놓으면 문서를 읽습니다</p>
          </div>
        </div>
      )}

      {importPaths && (
        <ImportDialog
          project={project}
          paths={importPaths}
          onApply={applyImport}
          onClose={() => setImportPaths(null)}
          onRuleSaved={(rule) => {
            const next = { ...project, settings: { ...project.settings, readRules: [...(project.settings.readRules ?? []), rule] } }
            setProject(next)
            void update(next)
            toast.show('ok', `칸 지정 규칙 '${rule.name}'을(를) 저장했습니다. 같은 모양의 문서는 다음부터 자동으로 읽습니다.`)
          }}
        />
      )}

      {exportOpen && (
        <Modal
          title="엑셀 출력"
          onClose={() => setExportOpen(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setExportOpen(false)}>
                취소
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void exportExcel()}>
                저장할 곳 고르기
              </button>
            </>
          }
        >
          <p>
            파일 이름: <span className="mono small">{project.name}_산출물작성리스트_{today.replace(/-/g, '')}.xlsx</span>
          </p>
          <ul className="export-sheets">
            <li>시트 1 "작성 리스트" — DIA 산출물별 담당·일정·상태·등록 문서·VR</li>
            <li>시트 2 "담당자별 요약" — 지연 많은 순</li>
            <li>
              <label>
                <input type="checkbox" checked={includeTrace} onChange={(e) => setIncludeTrace(e.target.checked)} /> 시트 3 "추적성 누락" 포함 — 누락·확인 필요 항목 (단계, ID, 문제, 출처 문서)
              </label>
            </li>
          </ul>
        </Modal>
      )}

      {pickerOpen && (
        <ProjectPicker
          current={project}
          onOpen={(p) => {
            setProject(p)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
