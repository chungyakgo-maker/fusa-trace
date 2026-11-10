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
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.platform !== 'win32') {
  console.log('Windows 전용 확인입니다. 건너뜁니다.')
  process.exit(0)
}

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
const setupPath = process.env.SMOKE_SETUP ?? `dist/FuSaTrace-${version}-Setup.exe`
// 사용자 단위 원클릭 설치: %LOCALAPPDATA%\Programs\fusa-trace (패키지 이름 폴더), 제거 프로그램은 "Uninstall FuSaTrace.exe"
// (electron-builder 규칙: win.executableName을 정하면 그 이름을 씀). 앱의 설치형 판별과 같게 "Uninstall *.exe" 모양으로 찾음
const installDir = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'fusa-trace')
const exe = join(installDir, 'FuSaTrace.exe')
const listDir = () => (existsSync(installDir) ? readdirSync(installDir) : [])
const uninstallerName = () => listDir().find((f) => /^Uninstall .+\.exe$/i.test(f))
const locate = () => existsSync(exe) && Boolean(uninstallerName())
function diagnose(installMs, exitInfo) {
  console.log('--- 진단 ---')
  console.log(`설치 프로그램: ${setupPath} (${existsSync(setupPath) ? '있음' : '없음'}), ${installMs}ms, ${exitInfo}`)
  console.log(`설치 폴더 ${installDir}: ${listDir().join(', ') || '없음'}`)
}
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
const t0 = Date.now()
let exitInfo = '종료 코드 0'
try {
  execFileSync(resolve(setupPath), ['/S'], { stdio: 'inherit' })
} catch (error) {
  exitInfo = `오류: ${error instanceof Error ? error.message : String(error)}`
}
const installMs = Date.now() - t0
const installed = await waitFor(locate, 90_000)
check(installed, '설치형: 관리자 권한 없이 사용자 폴더에 설치됨', `${installDir} · ${uninstallerName() ?? '제거 프로그램 없음'} · ${installMs}ms`)
if (!installed) {
  diagnose(installMs, exitInfo)
  console.error('\n업데이트 설치 확인 실패: 설치 폴더가 없음')
  process.exit(1)
}

// 덮어 설치 확인용 표시: 업데이트 때 예전 설치 폴더는 통째로 지워지고 새 파일이 깔린다
// (NSIS는 파일 시각을 빌드 때 시각으로 남겨서 시각으로는 알 수 없음)
const marker = join(installDir, 'update-check-marker.txt')
writeFileSync(marker, 'old install')
const removedFile = ['LICENSE.electron.txt', 'LICENSES.chromium.html'].map((f) => join(installDir, f)).find((f) => existsSync(f))
if (removedFile) rmSync(removedFile)
const tasklist = (image) => {
  try {
    return execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH'], { encoding: 'utf-8' })
  } catch {
    return ''
  }
}
const appRunning = () => /FuSaTrace\.exe/i.test(tasklist('FuSaTrace.exe'))

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

// 3) 설치 프로그램이 예전 설치를 지우고 새로 깔았는지 (표시 파일이 사라지고, 지운 파일이 돌아옴)
const reinstalled = await waitFor(() => !existsSync(marker) && existsSync(exe) && (!removedFile || existsSync(removedFile)), 240_000)
check(reinstalled, '설치형: 조용히 덮어 설치됨 (예전 설치를 지우고 새 파일을 깖)', listDir().slice(0, 6).join(', '))
const logText = existsSync(logFile) ? readFileSync(logFile, 'utf-8') : ''
check(logText.includes('update: installing'), '설치형: 앱 로그에 업데이트 설치 기록')

// 4) 설치 프로그램은 탐색기(explorer.exe)를 통해 앱을 다시 켠다 → 이 테스트의 환경 변수와 상관없이 보통 실행으로 켜짐
const hasExplorer = /explorer\.exe/i.test(tasklist('explorer.exe'))
const relaunched = await waitFor(appRunning, 90_000)
if (relaunched || hasExplorer) check(relaunched, '설치형: 설치가 끝나면 앱이 다시 켜짐')
else console.log('- 설치형: 앱 다시 켜짐은 확인하지 않음 (이 CI 컴퓨터에 탐색기가 없음. 설치 프로그램은 탐색기를 통해 앱을 켬)')

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
