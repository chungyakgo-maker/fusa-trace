import { app, BrowserWindow, Menu, session } from 'electron'
import { join } from 'node:path'
import { isAllowedUrl, isAppPageUrl } from './security'

// 개발 모드(npm run dev)에서만 electron-vite가 개발 서버 주소를 넣어 준다. 배포된 앱에서는 없음.
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']

// 데이터 폴더: %APPDATA%/FuSaTrace (SPEC §3). 앱 준비 전에 정해야 한다.
app.setPath('userData', join(app.getPath('appData'), 'FuSaTrace'))

// 프록시를 쓰지 않는다. 앱은 어떤 서버에도 접속하지 않는데, 기본값이면 Chromium이 Windows의
// "프록시 자동 검색"(WPAD: 회사망에서 wpad 서버를 찾아 설정 파일을 받음)을 시도한다. 앱 준비 전에 정해야 한다.
app.commandLine.appendSwitch('no-proxy-server')

// 실행 확인(smoke) 테스트에서만 요청 기록을 남긴다. 주소만 기록하고 문서 내용은 기록하지 않는다.
type NetLogEntry = { url: string; allowed: boolean }
const netLog: NetLogEntry[] | undefined = process.env['FUSA_SMOKE'] === '1' ? [] : undefined
if (netLog) (globalThis as { __fusaNetLog?: NetLogEntry[] }).__fusaNetLog = netLog

function lockDownSession(): void {
  const ses = session.defaultSession

  // 1) 맞춤법 사전 다운로드 방지 — 가장 먼저.
  //    Electron은 맞춤법 검사를 꺼도 시작할 때 사전(en-US)을 Google 서버(redirector.gvt1.com)에서
  //    받으려 한다. 이 요청은 아래 요청 차단기에 보이지 않으므로, 사전 언어 목록을 비워서 아예 시작하지 않게 한다.
  //    (실행 확인 테스트가 Chromium 네트워크 기록으로 이 요청이 없는지 검사한다)
  ses.setSpellCheckerLanguages([])
  ses.setSpellCheckerEnabled(false)

  // 2) 외부로 나가는 모든 요청 차단 (화면의 CSP와 별개인 두 번째 방어선)
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = isAllowedUrl(details.url, DEV_SERVER_URL)
    if (netLog && netLog.length < 500) netLog.push({ url: details.url.slice(0, 200), allowed })
    callback({ cancel: !allowed })
  })

  // 3) 카메라·알림·위치 같은 권한 요청은 모두 거절
  ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'FuSa Trace',
    backgroundColor: '#F4F5F7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

// 모든 창: 새 창 열기, 외부 페이지 이동, webview 삽입 금지
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isAppPageUrl(url, DEV_SERVER_URL)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

// 한 번에 하나만 실행 (같은 프로젝트 파일을 두 창이 동시에 저장하지 않도록)
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('local.fusatrace.app')
    // Electron 기본 메뉴에는 Electron 홈페이지 링크가 있어서 없앤다
    Menu.setApplicationMenu(null)
    lockDownSession()
    mainWindow = createWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  })

  app.on('window-all-closed', () => app.quit())
}
