// 실행 확인(smoke) 테스트: 빌드된 앱을 실제로 띄워서 확인한다.
//   - 창이 뜨고 왼쪽 메뉴 5개가 보이는지, 메뉴를 누르면 화면 제목이 바뀌는지
//   - 버전 표시, 앱에 포함한 한글 글꼴이 실제로 쓰이는지
//   - 실행 중 외부로 나간 요청이 0건인지, 외부 요청을 시도하면 막히는지
//   - 화면 캡처 저장 (Actions 아티팩트로 올림)
//
// 사용법
//   npm run build && npm run smoke                       ← out/ 폴더의 앱을 실행
//   SMOKE_EXE=dist/win-unpacked/FuSaTrace.exe npm run smoke  ← 설치 파일과 같은 exe를 실행 (Actions)
import { _electron as electron } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

const EXPECTED_MENU = ['추적성', '산출물 일정', 'ID 대응표', '문서 관리', '설정']
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
const exe = process.env.SMOKE_EXE
const screenshotPath = process.env.SMOKE_SCREENSHOT ?? 'dist/smoke/screenshot.png'

let failures = 0
function check(ok, message, detail) {
  console.log(`${ok ? '✓' : '✗'} ${message}${detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

const args = []
if (process.platform === 'linux') args.push('--no-sandbox')
if (!exe) args.push('.')

const started = Date.now()
const app = await electron.launch({
  executablePath: exe,
  args,
  env: { ...process.env, FUSA_SMOKE: '1' },
  timeout: 60_000
})

try {
  const win = await app.firstWindow()
  await win.waitForSelector('nav[aria-label="주 메뉴"]', { timeout: 30_000 })
  check(true, '창이 뜨고 왼쪽 메뉴가 보임', `${Date.now() - started}ms`)
  check((await win.title()) === 'FuSa Trace', '창 제목', await win.title())

  const labels = (await win.locator('.menu-item').allInnerTexts()).map((t) => t.trim())
  check(JSON.stringify(labels) === JSON.stringify(EXPECTED_MENU), '메뉴 5개 (SPEC §9 순서)', labels.join(' / '))

  for (const label of EXPECTED_MENU) {
    await win.locator('.menu-item', { hasText: label }).click()
    const heading = (await win.locator('main h1').innerText()).trim()
    check(heading === label, `메뉴 [${label}] 누르면 화면 제목이 바뀜`, heading)
  }

  const versionText = (await win.getByTestId('app-version').innerText()).trim()
  check(versionText === `v${version}`, '버전 표시', versionText)

  const fontLoaded = await win.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].some((f) => f.family.includes('Pretendard') && f.status === 'loaded')
  })
  check(fontLoaded, '앱에 포함한 한글 글꼴(Pretendard) 사용')

  // 화면 캡처 (첫 화면으로 돌아가서)
  await win.locator('.menu-item', { hasText: EXPECTED_MENU[0] }).click()
  mkdirSync(dirname(screenshotPath), { recursive: true })
  await win.screenshot({ path: screenshotPath })
  check(true, '화면 캡처 저장', screenshotPath)

  // 지금까지(시작 ~ 메뉴 클릭) 나간 요청: 모두 앱 내부(file: 등)여야 함
  const startupLog = (await app.evaluate(() => globalThis.__fusaNetLog)) ?? []
  const external = startupLog.filter((e) => !/^(file|data|devtools|blob):/.test(e.url) || !e.allowed)
  check(startupLog.length > 0, '요청 기록이 동작함', `${startupLog.length}건 (모두 앱 내부 파일이어야 함)`)
  check(external.length === 0, '실행 중 외부 요청 0건', external.map((e) => e.url).join(', ') || '0건')

  // 일부러 외부 요청을 시도 → 막혀야 함
  const rendererFetch = await win.evaluate(async () => {
    try {
      await fetch('https://example.com/')
      return 'reached'
    } catch {
      return 'blocked'
    }
  })
  check(rendererFetch === 'blocked', '화면에서 외부 요청 시도 → 차단 (CSP)', rendererFetch)

  const mainFetch = await app.evaluate(async ({ net }) => {
    try {
      const res = await net.fetch('https://example.com/')
      return `reached (${res.status})`
    } catch {
      return 'blocked'
    }
  })
  check(mainFetch === 'blocked', '메인 프로세스에서 외부 요청 시도 → 차단 (요청 차단기)', mainFetch)
  const finalLog = (await app.evaluate(() => globalThis.__fusaNetLog)) ?? []
  const blockedByUs = finalLog.some((e) => e.url.startsWith('https://example.com') && !e.allowed)
  check(blockedByUs, '차단기 기록에 막은 요청이 남음 (다른 이유로 실패한 것이 아님)')
} catch (error) {
  check(false, '실행 확인 중 오류', error instanceof Error ? error.message : String(error))
} finally {
  await app.close()
}

if (failures > 0) {
  console.error(`\n실행 확인 실패: ${failures}건`)
  process.exit(1)
}
console.log('\n실행 확인 통과')
