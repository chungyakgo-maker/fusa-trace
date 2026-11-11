/** 업데이트 화면 조각: 상태 받기, 위쪽 알림 띠, 설정의 업데이트 칸 */
import { useEffect, useState, type ReactElement } from 'react'
import { VARIANT_LABEL, type UpdateState } from '../../core/update'
import { AlertIcon, DownloadIcon, FolderIcon, InfoIcon } from './icons'
import { Disclosure } from './ui'

export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    let alive = true
    void window.fusa.update.get().then((s) => alive && setState(s))
    const off = window.fusa.update.onState(setState)
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

const pct = (s: UpdateState): string => `${Math.round((s.progress ?? 0) * 100)}%`
const day = (iso: string | undefined): string => (iso ? iso.slice(0, 10) : '')

/** [업데이트] / 진행 막대 / [지금 설치하고 다시 시작] / [받은 파일 보기] */
function UpdateActions({ state }: { state: UpdateState }): ReactElement | null {
  const api = window.fusa.update
  const { phase } = state
  if (state.latest && (phase === 'available' || phase === 'error'))
    return (
      <button type="button" className="btn btn-primary btn-small" onClick={() => void api.download()}>
        <DownloadIcon /> {phase === 'error' ? '다시 받기' : '업데이트'}
      </button>
    )
  if (phase === 'downloading')
    return <progress className="update-progress" max={1} value={state.progress ?? 0} aria-label={`받는 중 ${pct(state)}`} />
  if (phase === 'downloaded')
    return (
      <>
        {state.variant === 'setup' && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => void api.install()}>
            지금 설치하고 다시 시작
          </button>
        )}
        <button type="button" className="btn btn-small" onClick={() => void api.showFile()}>
          <FolderIcon /> 받은 파일 보기
        </button>
      </>
    )
  return null
}

function bannerText(s: UpdateState): ReactElement | null {
  const v = s.latest?.version
  switch (s.phase) {
    case 'available':
      return (
        <>
          새 버전 <strong>v{v}</strong>이 있습니다 (지금 v{s.current}).
        </>
      )
    case 'downloading':
      return <>새 버전 v{v}을 받는 중… {pct(s)}</>
    case 'downloaded':
      return s.variant === 'setup' ? (
        <>v{v}을 받았습니다. 설치하면 앱이 닫혔다가 다시 켜집니다 (프로젝트·데이터는 그대로).</>
      ) : (
        <>v{v}을 다운로드 폴더에 받았습니다. 이 앱을 닫고 새 파일을 실행해 주세요{s.variant === 'zip' ? ' (zip은 압축을 풀어서)' : ''}.</>
      )
    case 'installing':
      return <>설치 프로그램을 실행했습니다. 잠시 뒤 앱이 다시 켜집니다.</>
    case 'error':
      return <>업데이트하지 못했습니다: {s.error}</>
    default:
      return null
  }
}

/** 화면 위쪽 알림 띠: 새 버전이 있을 때만 */
export function UpdateBanner({ state }: { state: UpdateState | null }): ReactElement | null {
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!state?.latest) return null
  if (state.phase === 'available' && dismissed === state.latest.version) return null
  const text = bannerText(state)
  if (!text) return null
  return (
    <div className={`update-banner${state.phase === 'error' ? ' update-banner-error' : ''}`} role="region" aria-label="업데이트 알림">
      {state.phase === 'error' ? <AlertIcon /> : <InfoIcon />}
      <div className="update-banner-text" role="status">
        {text}
      </div>
      <div className="update-banner-actions">
        <UpdateActions state={state} />
        {state.phase === 'available' && (
          <button type="button" className="btn btn-small" onClick={() => setDismissed(state.latest!.version)}>
            나중에
          </button>
        )}
      </div>
    </div>
  )
}

function statusText(s: UpdateState): string {
  const when = s.checkedAt ? ` · ${new Date(s.checkedAt).toLocaleString('ko-KR')} 확인` : ''
  switch (s.phase) {
    case 'idle':
      return s.autoCheck ? '확인 대기 중 (앱을 켜고 몇 초 뒤 자동으로 확인합니다)' : '아직 확인하지 않았습니다.'
    case 'checking':
      return '확인하는 중…'
    case 'latest':
      return `최신 버전입니다 (v${s.current})${when}`
    case 'available':
      return `새 버전 v${s.latest?.version}이 있습니다${s.latest?.publishedAt ? ` (${day(s.latest.publishedAt)} 공개)` : ''}${when}`
    case 'downloading':
      return `받는 중… ${pct(s)}`
    case 'downloaded':
      return s.variant === 'setup' ? `받았습니다 (확인값 일치). [지금 설치하고 다시 시작]을 누르면 설치합니다.` : `받았습니다 (확인값 일치): ${s.savedPath ?? ''}`
    case 'installing':
      return '설치 프로그램을 실행했습니다. 잠시 뒤 앱이 다시 켜집니다.'
    case 'error':
      return `${s.latest ? '업데이트하지 못했습니다' : '확인하지 못했습니다'}: ${s.error ?? ''}`
  }
}

/** 설정 화면의 업데이트 칸 */
export function UpdateSection(): ReactElement {
  const state = useUpdateState()
  const api = window.fusa.update
  if (!state)
    return (
      <section className="panel pad-panel" aria-labelledby="s-update">
        <h2 id="s-update">업데이트</h2>
      </section>
    )
  const busy = state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'installing'
  return (
    <section className="panel pad-panel" aria-labelledby="s-update">
      <h2 id="s-update">업데이트</h2>
      <dl className="info-list">
        <dt>지금 버전</dt>
        <dd>
          v{state.current} · {VARIANT_LABEL[state.variant]}
        </dd>
      </dl>
      <p className={`update-status${state.phase === 'error' ? ' error-line' : ''}`} data-testid="update-status">
        {state.phase === 'error' && <AlertIcon />} {statusText(state)}
      </p>
      <div className="update-actions">
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void api.check()}>
          버전 확인
        </button>
        <UpdateActions state={state} />
      </div>
      {state.latest?.notes && (
        <Disclosure summary={`v${state.latest.version} 설명 보기`}>
          <pre className="release-notes">{state.latest.notes}</pre>
        </Disclosure>
      )}
      <label className="check-line">
        <input type="checkbox" checked={state.autoCheck} onChange={(e) => void api.setAutoCheck(e.target.checked)} />
        앱을 켤 때 새 버전 자동 확인
      </label>
      <p className="muted small">
        {state.variant === 'setup'
          ? '설치형은 받은 뒤 조용히 덮어 설치하고 앱을 다시 켭니다.'
          : '포터블·압축본은 실행 중인 파일을 바꿀 수 없어서 다운로드 폴더에 새 파일을 받아 드립니다.'}
      </p>
    </section>
  )
}
