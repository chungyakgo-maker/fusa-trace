// 설치형 업데이트 확인 (Windows 전용, Actions에서 실행)
//   1) 이번에 만든 Setup.exe를 조용히 설치 (%LOCALAPPDATA%\Programs\fusa-trace)
//   2) 설치된 앱을 띄움. 가짜 GitHub(내 PC)가 "v99.0.0"이라며 같은 Setup.exe를 줌
//   3) 앱을 켜면 자동 확인 → 알림 띠 [업데이트] → 받기·확인값 → [지금 설치하고 다시 시작]
//      → 앱이 닫히고, 설치 프로그램이 조용히 덮어 설치한 뒤 앱을 다시 켜는지
//
// 사용법: npm run dist:win && node tests/smoke/update-install.mjs
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.platform !== 'win32') {
  console.log('Windows 전용 확인입니다. 건너뜁니다.')
  process.exit(0)
}

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
const setupPath = process.env.SMOKE_SETUP ?? `dist/FuSaTrace-${version}-Setup.exe`
// 사용자 단위 원클릭 설치는 패키지 이름(fusa-trace) 폴더에 깔림 (electron-builder 규칙)
const installDir = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'fusa-trace')
const exe = join(installDir, 'FuSaTrace.exe')
const uninstaller = join(installDir, 'Uninstall FuSa Trace.exe')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(ok, message, detail) {
  console.log(`${ok ? '✓' : '✗'} ${message}${detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

async function waitFor(fn, ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return true
    await sleep(1_000)
  }
  return fn()
}

// 1) 조용히 설치
execFileSync(setupPath, ['/S'], { stdio: 'inherit' })
const installed = await waitFor(() => existsSync(exe) && existsSync(uninstaller), 60_000)
check(installed, '설치형: 관리자 권한 없이 사용자 폴더에 설치됨', installDir)
if (!installed) {
  console.error('\n업데이트 설치 확인 실패: 설치 폴더가 없음')
  process.exit(1)
}
const firstInstall = statSync(uninstaller).mtimeMs

// 2) 가짜 GitHub: v99.0.0 = 같은 Setup.exe
const bytes = readFileSync(setupPath)
const name = 'FuSaTrace-99.0.0-Setup.exe'
const sha = createHash('sha256').update(bytes).digest('hex')
const server = createServer((req, res) => {
  const base = `http://127.0.0.1:${server.address().port}`
  if (req.url === '/latest') {
    res.setHeader('content-type', 'application/json')
    return res.end(
      JSON.stringify({
        tag_name: 'v99.0.0',
        html_url: `${base}/page`,
        published_at: '2026-11-10T00:00:00Z',
        body: '업데이트 설치 확인용',
        assets: [
          { name, browser_download_url: `${base}/dl/${name}`, size: bytes.length },
          { name: 'SHA256SUMS.txt', browser_download_url: `${base}/dl/SHA256SUMS.txt`, size: 100 }
        ]
      })
    )
  }
  if (req.url === '/dl/SHA256SUMS.txt') return res.end(`${sha}  ${name}\n`)
  if (req.url === `/dl/${name}`) {
    res.writeHead(200, { 'content-length': bytes.length, 'content-type': 'application/octet-stream' })
    return res.end(bytes)
  }
  res.writeHead(404)
  res.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const dataDir = mkdtempSync(join(tmpdir(), 'fusa-update-'))
const logFile = join(dataDir, 'logs', 'app.log')
const starts = () => (existsSync(logFile) ? (readFileSync(logFile, 'utf-8').match(/\] start v/g) ?? []).length : 0)

const app = await electron.launch({
  executablePath: exe,
  env: { ...process.env, FUSA_DATA_DIR: dataDir, FUSA_UPDATE_API: `http://127.0.0.1:${server.address().port}/latest` },
  timeout: 60_000
})
let closed = false
app.on('close', () => (closed = true))
try {
  const win = await app.firstWindow()
  await win.waitForSelector('#welcome-title', { timeout: 30_000 })
  await win.getByLabel('새 프로젝트 이름 (차종·제어기)').fill('업데이트 확인')
  await win.getByRole('button', { name: '만들기' }).click()
  const banner = win.getByRole('region', { name: '업데이트 알림' })
  await banner.waitFor({ timeout: 30_000 })
  check((await banner.innerText()).includes('v99.0.0'), '설치형: 앱을 켜면 자동 확인 → 새 버전 알림 띠')
  await banner.getByRole('button', { name: '업데이트', exact: true }).click()
  const installBtn = banner.getByRole('button', { name: '지금 설치하고 다시 시작' })
  await installBtn.waitFor({ timeout: 180_000 })
  check(true, '설치형: 새 Setup.exe를 받고 확인값(SHA256) 일치')
  await installBtn.click()
  check(await waitFor(() => closed, 60_000), '설치형: [지금 설치하고 다시 시작] → 앱이 닫힘')
} catch (error) {
  check(false, '설치형 업데이트 확인 중 오류', error instanceof Error ? error.message : String(error))
}

// 3) 설치 프로그램이 덮어 설치하고 앱을 다시 켰는지: 로그의 "start" 기록이 2번 + 제거 프로그램이 새로 만들어짐
check(await waitFor(() => starts() >= 2, 240_000), '설치형: 조용히 덮어 설치한 뒤 앱이 다시 켜짐', `시작 기록 ${starts()}번`)
check(existsSync(uninstaller) && statSync(uninstaller).mtimeMs > firstInstall, '설치형: 덮어 설치됨 (제거 프로그램을 새로 씀)')
const logText = existsSync(logFile) ? readFileSync(logFile, 'utf-8') : ''
check(logText.includes('update: installing'), '설치형: 앱 로그에 업데이트 설치 기록')

try {
  execFileSync('taskkill', ['/IM', 'FuSaTrace.exe', '/F'], { stdio: 'ignore' })
} catch {
  // 이미 꺼져 있음
}
server.close()

if (failures > 0) {
  console.error(`\n업데이트 설치 확인 실패: ${failures}건`)
  process.exit(1)
}
console.log('\n업데이트 설치 확인 통과')
