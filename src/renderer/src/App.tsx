import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { Profile, Project } from '../../core/model'
import { activeDeliverables, activeDocs, addDocument, toSourceDoc } from '../../core/project'
import { countEdits } from '../../core/edits'
import { hasScope, mineOf, scopeText } from '../../core/mine'
import { computeSchedule } from '../../core/schedule'
import { effectiveToday } from '../../core/schedule'
import { MENU, type PageId } from './menu'
import { DownloadIcon, LinkIcon, OfflineIcon, PageIcon, UploadIcon } from './icons'
import { ImportDialog, type ApplyItem } from './ImportDialog'
import { SchedulePage } from './SchedulePage'
import { DocumentsPage } from './DocumentsPage'
import { SettingsPage } from './SettingsPage'
import { TracePage, type TraceFocus } from './TracePage'
import { CheckPage } from './CheckPage'
import { runChecks } from '../../core/check'
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
  const [profile, setProfile] = useState<Profile>({ team: '', name: '', title: '' })
  const [mineOnly, setMineOnly] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [page, setPage] = useState<PageId>('schedule')
  const [importPaths, setImportPaths] = useState<string[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [includeTrace, setIncludeTrace] = useState(true)
  const [includePaste, setIncludePaste] = useState(true)

  useEffect(() => {
    void window.fusa.profile.get().then(setProfile)
  }, [])
  const saveProfile = useCallback(
    async (p: Profile): Promise<void> => {
      setProfile(await window.fusa.profile.save(p))
      toast.show('ok', '내 정보를 저장했습니다.')
    },
    [toast]
  )

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
  /** 직접 고친 일정·담당 칸 수, 원본 DIA 칸 위치를 기억하는지 (엑셀 출력의 붙여넣기 시트) */
  const editCount = project ? countEdits(project, activeDeliverables(project)) : 0
  const hasLayout = Boolean(project && activeDocs(project, 'DIA')[0]?.dia?.layout)
  const reviewCount = useMemo(() => (project ? pendingReviewCount(project) : 0), [project])
  /** 검사 결과의 오류 건수 (메뉴에 표시) */
  const errorCount = useMemo(() => (project ? runChecks(project).counts.오류 : 0), [project])
  const [traceFocus, setTraceFocus] = useState<TraceFocus | null>(null)
  useEffect(() => setTraceFocus(null), [project?.id])

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

  const exportCheckReport = async (): Promise<void> => {
    if (!project) return
    const r = await window.fusa.exportCheckReport(project)
    if (r.ok && r.path) {
      const path = r.path
      toast.show('ok', '검사 리포트를 저장했습니다.', { label: '폴더 열기', run: () => void window.fusa.showInFolder(path) })
    } else if (!r.canceled) toast.show('error', `검사 리포트 저장 실패: ${r.error}`)
  }

  const exportExcel = async (): Promise<void> => {
    if (!project) return
    setExportOpen(false)
    setExporting(true)
    const r = await window.fusa.exportSchedule(project, today, { includeTrace, includePaste: includePaste && editCount > 0, mineOnly: mineOnly && hasScope(project.settings.myScope, profile) })
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
  const exportRowCount = (() => {
    if (!exportOpen) return { all: 0, mine: 0 }
    const rows = computeSchedule(project, today)
    return { all: rows.length, mine: rows.filter((r) => mineOf(r.d, project.settings.myScope, profile).mine).length }
  })()
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
              <button
                type="button"
                className="menu-item"
                aria-current={item.id === page ? 'page' : undefined}
                onClick={() => {
                  setTraceFocus(null) // 검사 결과에서 온 강조는 한 번만
                  setPage(item.id)
                }}
              >
                <PageIcon id={item.id} />
                {item.label}
                {item.id === 'check' && errorCount > 0 && (
                  <span className="err-pill" aria-label={`오류 ${errorCount}건`}>
                    {errorCount}
                  </span>
                )}
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
          <span className="offline-badge" title="문서·프로젝트 내용은 밖으로 보내지 않습니다. 외부 접속은 업데이트 확인·받기만 합니다.">
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

        {page === 'schedule' && (
          <SchedulePage project={project} today={today} profile={profile} onChange={(p) => void update(p)} onProfile={(p) => void saveProfile(p)} onImport={() => void pickFiles()} />
        )}
        {page === 'documents' && <DocumentsPage project={project} onChange={(p) => void update(p)} onImport={() => void pickFiles()} />}
        {page === 'settings' && <SettingsPage project={project} profile={profile} onChange={(p) => void update(p)} onProfile={(p) => void saveProfile(p)} />}
        {page === 'check' && (
          <CheckPage
            project={project}
            onImport={() => void pickFiles()}
            onReport={() => void exportCheckReport()}
            onFocus={(f) => {
              if (!f.item || !f.tab) return
              setTraceFocus({ tab: f.tab, item: f.item, seq: Date.now() })
              setPage('trace')
            }}
          />
        )}
        {page === 'trace' && <TracePage project={project} focus={traceFocus} onImport={() => void pickFiles()} onGoIdMap={() => setPage('idmap')} />}
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
          {hasScope(project.settings.myScope, profile) && (
            <fieldset className="export-range">
              <legend>출력 범위</legend>
              <label>
                <input type="radio" name="range" checked={!mineOnly} onChange={() => setMineOnly(false)} /> 전체 산출물 {exportRowCount.all}건
              </label>
              <label>
                <input type="radio" name="range" checked={mineOnly} onChange={() => setMineOnly(true)} /> 내 담당만 {exportRowCount.mine}건 ({scopeText(project.settings.myScope, profile)})
              </label>
            </fieldset>
          )}
          <p>
            파일 이름:{' '}
            <span className="mono small">
              {project.name}_산출물작성리스트_{today.replace(/-/g, '')}
              {mineOnly && hasScope(project.settings.myScope, profile) ? '_내담당' : ''}.xlsx
            </span>
          </p>
          <ul className="export-sheets">
            <li>시트 1 "작성 리스트" — DIA 산출물별 담당·일정·상태·등록 문서·VR</li>
            <li>시트 2 "담당자별 요약" — 지연 많은 순</li>
            <li>
              <label>
                <input type="checkbox" checked={includeTrace} onChange={(e) => setIncludeTrace(e.target.checked)} /> 시트 3 "추적성 누락" 포함 — 누락·확인 필요 항목 (단계, ID, 문제, 출처 문서)
              </label>
            </li>
            {editCount > 0 && (
              <li>
                <label>
                  <input type="checkbox" checked={includePaste} onChange={(e) => setIncludePaste(e.target.checked)} /> "DIA 붙여넣기" 시트 포함 — 직접 고친 칸 {editCount}개를 원본 DIA와 같은 칸 위치에 (붙이는 방법·범위는 "DIA 붙여넣기 안내" 시트)
                </label>
                {!hasLayout && <p className="warn-line small">이 DIA는 칸 위치를 기억하기 전에 넣은 것이라 붙여넣기 시트를 만들 수 없습니다. DIA를 한 번 다시 넣어 주세요.</p>}
              </li>
            )}
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
