/** 설정 (SPEC §9.5): 프로젝트 이름, 오늘 기준일, 마일스톤, 칸 이름 동의어, 칸 지정 규칙 */
import { useEffect, useState, type ReactElement } from 'react'
import type { Project } from '../../core/model'
import { DOC_KIND_LABEL } from '../../core/model'
import { DEFAULT_SYNONYMS, SYNONYM_KEYS, SYNONYM_LABEL, type SynonymKey } from '../../core/headers'
import { ROLE_LABEL } from '../../core/rules'
import { normHeader } from '../../core/text'
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

      <SynonymSection project={project} onChange={onChange} />

      <section className="panel pad-panel" aria-labelledby="s-rules">
        <h2 id="s-rules">칸 지정 규칙 (처음 보는 양식)</h2>
        <p className="muted small">문서 넣기 → 가져오기 결과의 [칸 지정]으로 만듭니다. 같은 머리글(또는 키)이 있는 문서는 이 규칙으로 자동으로 읽습니다.</p>
        {(project.settings.readRules ?? []).length === 0 ? (
          <p className="muted">아직 없습니다.</p>
        ) : (
          <table className="trace-table">
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">문서 종류</th>
                <th scope="col">모양</th>
                <th scope="col">칸 역할</th>
                <th scope="col">
                  <span className="sr-only">삭제</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(project.settings.readRules ?? []).map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.name}
                    <div className="muted small">{r.createdAt.slice(0, 10)}</div>
                  </td>
                  <td>{DOC_KIND_LABEL[r.docKind]}</td>
                  <td className="small">
                    {r.format === 'xlsx' ? `엑셀${r.sheet ? ` · 시트 '${r.sheet}'` : ''}` : `워드 · ${r.layout === 'rows' ? '행 목록' : '키-값'}`}
                  </td>
                  <td className="small">
                    {Object.entries(r.roles).map(([role, h]) => (
                      <div key={role}>
                        {ROLE_LABEL[role as keyof typeof ROLE_LABEL]}: <span className="mono">{h}</span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`${r.name} 규칙 삭제`}
                      onClick={() => setSettings({ ...project.settings, readRules: (project.settings.readRules ?? []).filter((x) => x.id !== r.id) })}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted small">규칙을 지워도 이미 넣은 문서는 그대로입니다. 다시 읽으려면 문서를 다시 넣어 주세요.</p>
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

function SynonymSection({ project, onChange }: { project: Project; onChange: (p: Project) => void }): ReactElement {
  const [key, setKey] = useState<SynonymKey>('fsrId')
  const [text, setText] = useState('')
  const extra = project.settings.synonyms ?? {}
  const setExtra = (next: Record<string, string[]>): void => onChange({ ...project, settings: { ...project.settings, synonyms: next } })
  const add = (): void => {
    const t = text.trim()
    if (!t) return
    const n = normHeader(t)
    const list = extra[key] ?? []
    if ((DEFAULT_SYNONYMS[key] as readonly string[]).includes(n) || list.some((x) => normHeader(x) === n)) return setText('')
    setExtra({ ...extra, [key]: [...list, t] })
    setText('')
  }
  return (
    <section className="panel pad-panel" aria-labelledby="s-syn">
      <h2 id="s-syn">칸 이름 동의어</h2>
      <p className="muted small">
        문서마다 같은 칸을 다르게 부를 때 추가합니다 (예: FSR ID를 "요구사항 번호"로 쓰는 양식). 대소문자·띄어쓰기·줄바꿈 차이는 원래 무시합니다. 바꾼 동의어는 <strong>문서를 다시 넣을 때부터</strong> 적용됩니다.
      </p>
      <table className="trace-table">
        <thead>
          <tr>
            <th scope="col">칸</th>
            <th scope="col">기본 동의어</th>
            <th scope="col">추가한 동의어</th>
          </tr>
        </thead>
        <tbody>
          {SYNONYM_KEYS.map((k) => (
            <tr key={k}>
              <td>{SYNONYM_LABEL[k]}</td>
              <td className="small muted">{DEFAULT_SYNONYMS[k].join(', ')}</td>
              <td>
                <div className="syn-chips">
                  {(extra[k] ?? []).map((v) => (
                    <span key={v} className="syn-chip">
                      {v}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`동의어 ${v} 삭제`}
                        onClick={() => setExtra({ ...extra, [k]: (extra[k] ?? []).filter((x) => x !== v) })}
                      >
                        <TrashIcon size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <label>
          칸
          <select value={key} aria-label="동의어를 추가할 칸" onChange={(e) => setKey(e.target.value as SynonymKey)}>
            {SYNONYM_KEYS.map((k) => (
              <option key={k} value={k}>
                {SYNONYM_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          문서에 적힌 칸 이름
          <input value={text} maxLength={60} placeholder="예: 요구사항 번호" onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={!text.trim()}>
          <PlusIcon /> 동의어 추가
        </button>
      </form>
    </section>
  )
}
