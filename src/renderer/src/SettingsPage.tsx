/** 설정 (SPEC §9.5): 프로젝트 이름, 오늘 기준일, 마일스톤, 내 정보, 내 담당, 칸 이름 동의어, 칸 지정 규칙, 문서 읽기(DRM 표식), 업데이트, 업데이트 기록, 앱 정보 */
import { useEffect, useState, type ReactElement } from 'react'
import type { MyScope, Profile, Project } from '../../core/model'
import { DOC_KIND_LABEL, MY_ROLES } from '../../core/model'
import { EMPTY_SCOPE, ROLE_LABEL as MY_ROLE_LABEL, ROLE_PARTS } from '../../core/mine'
import { activeDeliverables } from '../../core/project'
import { CHANGELOG } from '../../shared/changelog'
import { DEFAULT_SYNONYMS, SYNONYM_KEYS, SYNONYM_LABEL, type SynonymKey } from '../../core/headers'
import { ROLE_LABEL } from '../../core/rules'
import { normHeader } from '../../core/text'
import { localToday } from '../../core/dates'
import type { AppInfo } from '../../shared/ipc'
import { PlusIcon, TrashIcon } from './icons'
import { UpdateSection } from './Update'
import { Disclosure } from './ui'

export function SettingsPage({
  project,
  profile,
  onChange,
  onProfile
}: {
  project: Project
  profile: Profile
  onChange: (p: Project) => void
  onProfile: (p: Profile) => void
}): ReactElement {
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

      <ProfileSection profile={profile} onSave={onProfile} />

      <MineSection project={project} profile={profile} onChange={onChange} />

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

      <DrmSection />

      <UpdateSection />

      <HistorySection version={info?.version ?? __APP_VERSION__} />

      <section className="panel pad-panel" aria-labelledby="s-info">
        <h2 id="s-info">앱 정보</h2>
        <dl className="info-list">
          <dt>버전</dt>
          <dd>v{info?.version ?? __APP_VERSION__}</dd>
          <dt>데이터 폴더</dt>
          <dd className="mono small">{info?.dataDir ?? '-'}</dd>
          <dt>로그 파일</dt>
          <dd className="mono small">{info?.logFile ?? '-'} (문서 내용은 기록하지 않음)</dd>
          <dt>만든이</dt>
          <dd>{APP_AUTHOR}</dd>
        </dl>
      </section>
    </div>
  )
}

/** 앱 정보의 만든이 (사용자 결정 2026-11-11, docs/DECISIONS.md) */
export const APP_AUTHOR = '전자설계2팀 이세영 연구원'

function HistoryEntry({ c, current }: { c: (typeof CHANGELOG)[number]; current: boolean }): ReactElement {
  return (
    <li>
      <div className="history-head">
        <strong className="mono">v{c.version}</strong>
        <span className="muted small">{c.date}</span>
        <span>{c.title}</span>
        {current && <span className="tag tag-edit">지금 버전</span>}
      </div>
      <ul>
        {c.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </li>
  )
}

/** 업데이트 기록: 지금 버전만 펼쳐 두고, 지난 기록은 접어 둠 */
function HistorySection({ version }: { version: string }): ReactElement {
  const now = CHANGELOG.find((c) => c.version === version) ?? CHANGELOG[0]
  const past = CHANGELOG.filter((c) => c !== now)
  return (
    <section className="panel pad-panel" aria-labelledby="s-history">
      <h2 id="s-history">업데이트 기록</h2>
      <ol className="history">
        <HistoryEntry c={now} current={now.version === version} />
      </ol>
      {past.length > 0 && (
        <Disclosure summary={`지난 기록 보기 (${past.length}개 버전)`}>
          <ol className="history">
            {past.map((c) => (
              <HistoryEntry key={c.version} c={c} current={false} />
            ))}
          </ol>
        </Disclosure>
      )}
    </section>
  )
}

/** 문서 읽기 — DRM 파일 표식: 파일 앞부분에 이 글자가 있으면 "DRM으로 잠긴 파일"로 안내 (이 PC의 앱 설정에만 저장) */
function DrmSection(): ReactElement {
  const [saved, setSaved] = useState<string[] | null>(null)
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  useEffect(() => {
    void window.fusa.drmMarkers.get().then((m) => {
      setSaved(m)
      setText(m.join('\n'))
    })
  }, [])
  const list = text
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean)
  const changed = saved !== null && list.join('\n') !== saved.join('\n')
  return (
    <section className="panel pad-panel" aria-labelledby="s-drm">
      <h2 id="s-drm">문서 읽기 — DRM 파일 표식</h2>
      <p className="muted small">
        회사 보안 프로그램(DRM)으로 잠긴 파일은 앞부분에 정해진 영문 글자가 들어 있습니다. 그 글자를 적어 두면, 잠긴 파일을 넣었을 때 "읽을 수 없는 파일" 대신 "보안(DRM)이 걸린 파일 — 해제 후 넣어 주세요"로 안내합니다. 한 줄에 하나, 최대 10개. 이 PC에만 저장합니다.
      </p>
      <form
        className="drm-form"
        onSubmit={(e) => {
          e.preventDefault()
          void window.fusa.drmMarkers.save(list).then((m) => {
            setSaved(m)
            setText(m.join('\n'))
            setDone(true)
          })
        }}
      >
        <label>
          DRM 파일 표식
          <textarea
            rows={3}
            value={text}
            placeholder="예: 메모장으로 잠긴 파일을 열었을 때 맨 앞에 보이는 영문 이름"
            onChange={(e) => {
              setText(e.target.value)
              setDone(false)
            }}
          />
        </label>
        <div className="drm-actions">
          <button type="submit" className="btn" disabled={!changed}>
            저장
          </button>
          {done && !changed && (
            <span className="muted small" role="status">
              저장했습니다 ({saved?.length ?? 0}개). 문서를 다시 넣을 때부터 적용됩니다.
            </span>
          )}
        </div>
      </form>
    </section>
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

function ProfileSection({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => void }): ReactElement {
  const [draft, setDraft] = useState(profile)
  useEffect(() => setDraft(profile), [profile])
  const changed = draft.team.trim() !== profile.team || draft.name.trim() !== profile.name || draft.title.trim() !== profile.title
  return (
    <section className="panel pad-panel" aria-labelledby="s-profile">
      <h2 id="s-profile">내 정보</h2>
      <p className="muted small">내 담당 찾기(DIA 담당 칸에 내 이름·팀이 있는지)에 씁니다. 이 PC의 앱 설정에만 저장되고, 모든 프로젝트에 같이 쓰입니다.</p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          onSave({ team: draft.team.trim(), name: draft.name.trim(), title: draft.title.trim() })
        }}
      >
        <label>
          팀
          <input value={draft.team} maxLength={60} placeholder="예: 시스템팀" onChange={(e) => setDraft({ ...draft, team: e.target.value })} />
        </label>
        <label>
          이름
          <input value={draft.name} maxLength={40} placeholder="예: 홍길동" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label>
          직급
          <input value={draft.title} maxLength={20} placeholder="예: 책임" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </label>
        <button type="submit" className="btn" disabled={!changed}>
          저장
        </button>
      </form>
    </section>
  )
}

function MineSection({ project, profile, onChange }: { project: Project; profile: Profile; onChange: (p: Project) => void }): ReactElement {
  const scope = project.settings.myScope ?? EMPTY_SCOPE
  const setScope = (next: MyScope): void => onChange({ ...project, settings: { ...project.settings, myScope: next } })
  const byKey = new Map(activeDeliverables(project).map((d) => [d.key, d]))
  const label = (key: string): string => {
    const d = byKey.get(key)
    if (!d) return `${key} (지금 DIA에 없음)`
    return `No.${d.diaNo}${d.lineCount > 1 ? `-${d.line}` : ''} ${d.workProduct}${d.docLabel ? ` [${d.docLabel}]` : ''}`
  }
  const manual = [...scope.include.map((k) => ({ k, kind: 'include' as const })), ...scope.exclude.map((k) => ({ k, kind: 'exclude' as const }))]
  return (
    <section className="panel pad-panel" aria-labelledby="s-mine">
      <h2 id="s-mine">내 담당</h2>
      <p className="muted small">산출물 일정의 [내 담당] 보기와 엑셀 출력 "내 담당만"에 씁니다. 이 프로젝트에만 저장합니다.</p>
      <div className="mine-roles" role="group" aria-label="내 역할">
        <span className="mine-roles-label">내 역할</span>
        {MY_ROLES.map((r) => {
          const on = scope.roles.includes(r)
          return (
            <label key={r} className={`role-check${on ? ' on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => setScope({ ...scope, roles: on ? scope.roles.filter((x) => x !== r) : [...scope.roles, r] })} />
              {MY_ROLE_LABEL[r]}
            </label>
          )
        })}
      </div>
      <table className="trace-table mine-table">
        <thead>
          <tr>
            <th scope="col">역할</th>
            <th scope="col">자동으로 들어오는 DIA 산출물 (Part-clause 앞 번호)</th>
          </tr>
        </thead>
        <tbody>
          {MY_ROLES.map((r) => (
            <tr key={r}>
              <td>{MY_ROLE_LABEL[r]}</td>
              <td>{ROLE_PARTS[r]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mine-match">
        <label className="check-line">
          <input type="checkbox" checked={Boolean(scope.matchName)} onChange={(e) => setScope({ ...scope, matchName: e.target.checked })} />
          DIA 담당 칸에 내 이름{profile.name ? ` '${profile.name}'` : ''}이 있으면 함께 넣기
        </label>
        <label className="check-line">
          <input type="checkbox" checked={Boolean(scope.matchTeam)} onChange={(e) => setScope({ ...scope, matchTeam: e.target.checked })} />
          DIA 담당 팀이 내 팀{profile.team ? ` '${profile.team}'` : ''}이면 함께 넣기
        </label>
        {(scope.matchName || scope.matchTeam) && !profile.name && !profile.team && <p className="warn-line small">위 "내 정보"에 이름이나 팀을 먼저 적어 주세요.</p>}
      </div>
      <div className="mine-manual-list">
        <div className="mine-manual-head">
          <strong>직접 고른 산출물 ({manual.length})</strong>
          {manual.length > 0 && (
            <button type="button" className="btn btn-small" onClick={() => setScope({ ...scope, include: [], exclude: [] })}>
              모두 원래대로
            </button>
          )}
        </div>
        {manual.length === 0 ? (
          <p className="muted small">없습니다. 산출물 일정에서 ☆를 누르면 여기에 나옵니다.</p>
        ) : (
          <ul>
            {manual.map(({ k, kind }) => (
              <li key={`${kind}-${k}`}>
                <span className={`tag mine-tag mine-${kind}`}>{kind === 'include' ? '★ 직접 넣음' : '직접 뺌'}</span>
                <span className="mine-manual-name">{label(k)}</span>
                <button
                  type="button"
                  className="btn btn-small"
                  aria-label={`${label(k)} 원래대로`}
                  onClick={() => setScope({ ...scope, include: scope.include.filter((x) => x !== k), exclude: scope.exclude.filter((x) => x !== k) })}
                >
                  원래대로
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">직접 고른 것은 산출물 키(No. + 파일명)로 기억해서 다음 DIA 버전에도 유지됩니다.</p>
      </div>
    </section>
  )
}
