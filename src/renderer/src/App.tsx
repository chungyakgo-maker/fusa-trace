import { useState, type ReactElement } from 'react'
import { MENU, type PageId } from './menu'
import { ClockIcon, DownloadIcon, InfoIcon, LinkIcon, OfflineIcon, PageIcon, UploadIcon } from './icons'

export function App(): ReactElement {
  const [page, setPage] = useState<PageId>('trace')
  const current = MENU.find((m) => m.id === page) ?? MENU[0]

  return (
    <div className="app">
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

        <div className="project-card">
          <div className="muted tiny">프로젝트</div>
          <div className="project-name">프로젝트 없음</div>
          <div className="muted small">M1부터 만들 수 있습니다</div>
        </div>

        <ul className="menu">
          {MENU.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="menu-item"
                aria-current={item.id === page ? 'page' : undefined}
                onClick={() => setPage(item.id)}
              >
                <PageIcon id={item.id} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-footer">
          <span className="offline-badge">
            <OfflineIcon />
            외부 연결 없음
          </span>
          <span className="version" data-testid="app-version">
            v{__APP_VERSION__}
          </span>
        </div>
      </nav>

      <main className="main">
        <header className="page-header">
          <div>
            <div className="muted small">프로젝트 없음</div>
            <h1>{current.label}</h1>
          </div>
          <div className="actions">
            <button type="button" className="btn" disabled aria-describedby="actions-note">
              <DownloadIcon />
              엑셀 출력
            </button>
            <button type="button" className="btn btn-primary" disabled aria-describedby="actions-note">
              <UploadIcon />
              문서 넣기
            </button>
          </div>
        </header>

        <div className="notice" role="note">
          <InfoIcon />
          <p id="actions-note">
            설치 확인용 빈 앱(M0)입니다. 왼쪽 메뉴를 눌러 화면이 바뀌는지 확인해 주세요.
            <br />
            [문서 넣기]와 [엑셀 출력]은 M1부터 쓸 수 있습니다.
          </p>
        </div>

        <section className="placeholder" aria-labelledby="placeholder-title">
          <ClockIcon />
          <h2 id="placeholder-title">준비 중</h2>
          <p>{current.summary}</p>
          <span className="milestone-tag">{current.milestone}에서 만들어집니다</span>
        </section>
      </main>
    </div>
  )
}
