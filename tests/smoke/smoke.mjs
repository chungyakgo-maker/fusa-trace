// 실행 확인(smoke) 테스트: 빌드된 앱을 실제로 띄워서 확인한다.
//   - 창이 뜨고 왼쪽 메뉴 5개가 보이는지, 메뉴를 누르면 화면 제목이 바뀌는지
//   - 버전 표시, 앱에 포함한 한글 글꼴이 실제로 쓰이는지
//   - 실행 중 외부로 나간 요청이 0건인지, 외부 요청을 시도하면 막히는지
//   - Chromium 네트워크 기록(--log-net-log)으로 앱 코드 밖의 숨은 요청(맞춤법 사전 등)까지 0건인지
//   - 프로젝트 만들기 → 가짜 문서 넣기(DRM·미지원·판별 불가 포함) → 가져오기 결과 → 반영 → 산출물 일정
//     → 엑셀 출력 → 다시 열어도 저장돼 있는지 (먼저 npm run fixtures)
//   - 화면 캡처 저장 (Actions 아티팩트로 올림)
//
// 사용법
//   npm run build && npm run smoke                       ← out/ 폴더의 앱을 실행
//   SMOKE_EXE=dist/win-unpacked/FuSaTrace.exe npm run smoke  ← 설치 파일과 같은 exe를 실행 (Actions)
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const EXPECTED_MENU = ['추적성', '산출물 일정', 'ID 대응표', '문서 관리', '설정']
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'))
const exe = process.env.SMOKE_EXE
const screenshotPath = process.env.SMOKE_SCREENSHOT ?? 'dist/smoke/screenshot.png'
const netLogPath = join(mkdtempSync(join(tmpdir(), 'fusa-smoke-')), 'netlog.json')
// 이 테스트가 일부러 시도하는 외부 주소 (막혀야 함). 이 외의 외부 주소가 네트워크 기록에 있으면 실패.
const PROBE_HOST = 'example.com'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const FIXTURES = fileURLToPath(new URL('../fixtures/generated/', import.meta.url))
const P = '[기능안전]_데모'
const IMPORT_FILES = [`${P}_DIA_R1.xlsx`, `${P}_(TSC) Verification Report_R1.xls`, '보안문서_DIA.xlsx', '옛날양식.doc', '메모.txt', `${P}_Safety Plan 초안_R2.docx`]
const dataDir = mkdtempSync(join(tmpdir(), 'fusa-data-'))

let failures = 0
function check(ok, message, detail) {
  console.log(`${ok ? '✓' : '✗'} ${message}${detail === undefined ? '' : ` — ${detail}`}`)
  if (!ok) failures++
}

const args = [`--log-net-log=${netLogPath}`]
if (process.platform === 'linux') args.push('--no-sandbox')
if (!exe) args.push('.')

const started = Date.now()
const app = await electron.launch({
  executablePath: exe,
  args,
  env: { ...process.env, FUSA_SMOKE: '1', FUSA_DATA_DIR: dataDir },
  timeout: 60_000
})

try {
  const win = await app.firstWindow()
  // 처음 실행: 프로젝트 만들기 화면
  await win.waitForSelector('#welcome-title', { timeout: 30_000 })
  check(true, '창이 뜨고 첫 화면(프로젝트 만들기)이 보임', `${Date.now() - started}ms`)
  check((await win.title()) === 'FuSa Trace', '창 제목', await win.title())
  await win.getByLabel('새 프로젝트 이름 (차종·제어기)').fill('데모 차종 · CTL')
  await win.getByRole('button', { name: '만들기' }).click()
  await win.waitForSelector('nav[aria-label="주 메뉴"]')
  check(true, '프로젝트 만들기')

  const labels = (await win.locator('.menu-item').allInnerTexts()).map((t) => t.trim().replace(/\s*\d+$/, ''))
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

  // ── 문서 넣기: 파일 선택 창 대신 가짜 문서 경로를 돌려줌
  const files = IMPORT_FILES.map((f) => join(FIXTURES, f))
  check(files.every((f) => existsSync(f)), '가짜 문서 준비됨', `${files.length}개`)
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
  }, files)
  await win.locator('.menu-item', { hasText: '산출물 일정' }).click()
  await win.getByRole('button', { name: '문서 넣기' }).first().click()
  await win.waitForSelector('.import-card', { timeout: 60_000 })
  await win.waitForFunction((n) => document.querySelectorAll('.import-card').length === n, files.length, { timeout: 60_000 })
  const dialogText = await win.locator('dialog.modal').innerText()
  check(dialogText.includes('보안(DRM)이 걸린 파일입니다'), '가져오기 결과: DRM 파일 안내')
  check(dialogText.includes('.docx로 저장한 뒤'), '가져오기 결과: .doc 미지원 안내')
  check(dialogText.includes('읽을 수 없는 파일'), '가져오기 결과: 읽을 수 없는 파일 안내')
  check(dialogText.includes('산출물 22'), '가져오기 결과: DIA 산출물 22줄', dialogText.match(/읽은 항목: [^\n]*/)?.[0])
  check(/건너뛴 행 \d+개/.test(dialogText), '가져오기 결과: 건너뛴 행과 이유')
  check(dialogText.includes('골라 주세요'), '가져오기 결과: 판별 못 한 문서는 종류 고르기')
  check(dialogText.includes('자동 연결'), '가져오기 결과: VR 파일이 DIA 산출물에 자동 연결 예정')
  mkdirSync(dirname(screenshotPath), { recursive: true })
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-import.png') })
  const applyButton = win.getByRole('button', { name: /^반영 \(\d+개\)$/ })
  check((await applyButton.innerText()).includes('2개'), '반영할 문서 2개 (DIA, VR)', await applyButton.innerText())
  await applyButton.click()
  await win.waitForSelector('.summary-card')
  const total = (await win.locator('.summary-card').first().locator('.summary-value').innerText()).trim()
  check(total === '22', '산출물 일정: 전체 22줄', total)
  const schedText = await win.locator('.sched').innerText()
  check(schedText.includes('담당 미지정'), '산출물 일정: 담당 미지정 표시')
  check(/등록 R1/.test(schedText), '산출물 일정: 등록 문서 표시')
  await win.screenshot({ path: screenshotPath })
  check(true, '화면 캡처 저장', screenshotPath)

  // ── 엑셀 출력: 저장 창 대신 임시 경로
  const out = join(mkdtempSync(join(tmpdir(), 'fusa-export-')), 'out.xlsx')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, out)
  await win.getByRole('button', { name: '엑셀 출력' }).click()
  await win.waitForSelector('text=엑셀로 저장했습니다', { timeout: 30_000 })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(out)
  check(wb.worksheets.map((w) => w.name).join(',') === '작성 리스트,담당자별 요약', '엑셀 출력: 시트 2개', wb.worksheets.map((w) => w.name).join(', '))
  check(wb.getWorksheet('작성 리스트').rowCount === 6 + 22, '엑셀 출력: 22줄', String(wb.getWorksheet('작성 리스트').rowCount - 6))

  // ── 저장 확인: 화면을 새로 고쳐도 프로젝트가 남아 있음
  await win.reload()
  await win.waitForSelector('.summary-card', { timeout: 30_000 })
  const totalAfter = (await win.locator('.summary-card').first().locator('.summary-value').innerText()).trim()
  check(totalAfter === '22', '다시 열어도 저장된 내용이 그대로', totalAfter)

  await win.locator('.menu-item', { hasText: '문서 관리' }).click()
  const docsText = await win.locator('main').innerText()
  check(docsText.includes('자동') && docsText.includes('TSC VR'), '문서 관리: VR 파일 ↔ DIA 산출물 자동 연결 표시')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-documents.png') })

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

  // 네트워크 기록 검사가 제대로 동작하는지 확인용: 요청 차단기를 거치지 않는 숨은 접속(preconnect)을
  // 테스트에서 일부러 한 번 일으킨다. 아래 Chromium 네트워크 기록 검사에서 이것이 잡혀야 한다.
  await app.evaluate(
    ({ session }, host) => session.defaultSession.preconnect({ url: `https://${host}`, numSockets: 1 }),
    PROBE_HOST
  )
  await win.waitForTimeout(2_000)
} catch (error) {
  check(false, '실행 확인 중 오류', error instanceof Error ? error.message : String(error))
} finally {
  await app.close()
}

// Chromium 네트워크 기록: 앱 코드의 요청 차단기에 보이지 않는 요청까지 모두 남는다
function readNetLogHosts(path) {
  const raw = readFileSync(path, 'utf-8').trim()
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    data = JSON.parse(`${raw.replace(/,\s*$/, '')}]}`) // 끝이 잘린 기록
  }
  const hosts = new Set()
  for (const event of data.events ?? []) {
    const params = event.params ?? {}
    for (const key of ['url', 'original_url']) {
      const value = params[key]
      if (typeof value === 'string' && /^(https?|wss?|ftp):/i.test(value)) hosts.add(new URL(value).hostname)
    }
    if (typeof params.host === 'string') hosts.add(params.host.replace(/^[a-z]+:\/\//i, '').replace(/:\d+$/, ''))
  }
  return [...hosts]
}

try {
  if (!existsSync(netLogPath)) throw new Error('기록 파일이 없음')
  const hosts = readNetLogHosts(netLogPath)
  check(hosts.includes(PROBE_HOST), 'Chromium 네트워크 기록이 숨은 접속도 잡음 (테스트용 preconnect가 기록됨)')
  const unexpected = hosts.filter((h) => h !== PROBE_HOST && !LOCAL_HOSTS.has(h))
  check(unexpected.length === 0, 'Chromium 네트워크 기록: 외부 접속 시도 0건 (숨은 요청 포함)', unexpected.join(', ') || '0건')
} catch (error) {
  check(false, 'Chromium 네트워크 기록 읽기', error instanceof Error ? error.message : String(error))
}

if (failures > 0) {
  console.error(`\n실행 확인 실패: ${failures}건`)
  process.exit(1)
}
console.log('\n실행 확인 통과')
