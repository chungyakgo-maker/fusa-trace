/** 설정 (SPEC §9.5): 프로젝트 이름, 오늘 기준일, 마일스톤. 칸 지정·동의어는 M5 */
import { useEffect, useState, type ReactElement } from 'react'
import type { Project } from '../../core/model'
import { localToday } from '../../core/dates'
import type { AppInfo } from '../../shared/ipc'
import { PlusIcon, TrashIcon } from './icons'

export function SettingsPage({ project, onChange }: { project: Project; onChange: (p: Project) => void }): ReactElement {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [name, setName] = useState(project.name)
  const [msName, setMsName] = useState('')
  const [msDate, setMsDate] = useState('')
  useEffect(() => {
    void window.fusa.appInfo().then(setInfo)
  }, [])
  useEffect(() => setName(project.name), [project.name])

  const override = project.settings.todayOverride
  const setSettings = (settings: Project['settings']): void => onChange({ ...project, settings })

  return (
    <div className="page-stack settings">
      <section className="panel pad-panel" aria-labelledby="s-name">
        <h2 id="s-name">프로젝트</h2>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) onChange({ ...project, name: name.trim() })
          }}
        >
          <label>
            이름 (차종·제어기)
            <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={!name.trim() || name.trim() === project.name}>
            이름 바꾸기
          </button>
        </form>
      </section>

      <section className="panel pad-panel" aria-labelledby="s-today">
        <h2 id="s-today">오늘 기준일</h2>
        <p className="muted small">산출물 상태(지연·진행 등)를 이 날짜 기준으로 계산합니다.</p>
        <div className="radio-row">
          <label>
            <input type="radio" name="today" checked={!override} onChange={() => setSettings({ ...project.settings, todayOverride: undefined })} />
            실제 오늘 ({localToday()})
          </label>
          <label>
            <input type="radio" name="today" checked={Boolean(override)} onChange={() => setSettings({ ...project.settings, todayOverride: override || localToday() })} />
            직접 지정
          </label>
          <input
            type="date"
            aria-label="기준일"
            value={override ?? ''}
            disabled={!override}
            onChange={(e) => e.target.value && setSettings({ ...project.settings, todayOverride: e.target.value })}
          />
        </div>
      </section>

      <section className="panel pad-panel" aria-labelledby="s-ms">
        <h2 id="s-ms">프로젝트 마일스톤</h2>
        <p className="muted small">산출물 일정의 간트 막대 위에 세로 점선으로 표시합니다. (예: P1, P2, SOP)</p>
        <ul className="ms-list">
          {project.settings.milestones
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong>
                <span className="mono">{m.date}</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${m.name} 마일스톤 삭제`}
                  onClick={() => setSettings({ ...project.settings, milestones: project.settings.milestones.filter((x) => x.id !== m.id) })}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          {project.settings.milestones.length === 0 && <li className="muted">아직 없습니다.</li>}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!msName.trim() || !msDate) return
            setSettings({ ...project.settings, milestones: [...project.settings.milestones, { id: `${Date.now()}`, name: msName.trim(), date: msDate }] })
            setMsName('')
            setMsDate('')
          }}
        >
          <label>
            이름
            <input value={msName} maxLength={20} placeholder="예: P1" onChange={(e) => setMsName(e.target.value)} />
          </label>
          <label>
            날짜
            <input type="date" value={msDate} onChange={(e) => setMsDate(e.target.value)} />
          </label>
          <button type="submit" className="btn" disabled={!msName.trim() || !msDate}>
            <PlusIcon /> 추가
          </button>
        </form>
      </section>

      <section className="panel pad-panel" aria-labelledby="s-later">
        <h2 id="s-later">칸 이름 동의어 · 처음 보는 양식의 칸 지정</h2>
        <p className="muted">M5에서 제공합니다.</p>
      </section>

      <section className="panel pad-panel" aria-labelledby="s-info">
        <h2 id="s-info">앱 정보</h2>
        <dl className="info-list">
          <dt>버전</dt>
          <dd>v{info?.version ?? __APP_VERSION__}</dd>
          <dt>데이터 폴더</dt>
          <dd className="mono small">{info?.dataDir ?? '-'}</dd>
          <dt>로그 파일</dt>
          <dd className="mono small">{info?.logFile ?? '-'} (문서 내용은 기록하지 않음)</dd>
          <dt>인터넷 연결</dt>
          <dd>사용하지 않음 (자동 업데이트·통계 수집 없음)</dd>
        </dl>
      </section>
    </div>
  )
}
