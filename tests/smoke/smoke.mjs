// 실행 확인(smoke) 테스트: 빌드된 앱을 실제로 띄워서 확인한다.
//   - 창이 뜨고 왼쪽 메뉴 5개가 보이는지, 메뉴를 누르면 화면 제목이 바뀌는지
//   - 버전 표시, 앱에 포함한 한글 글꼴이 실제로 쓰이는지
//   - 실행 중 외부로 나간 요청이 0건인지, 외부 요청을 시도하면 막히는지
//   - Chromium 네트워크 기록(--log-net-log)으로 앱 코드 밖의 숨은 요청(맞춤법 사전 등)까지 0건인지
//   - 프로젝트 만들기 → 가짜 문서 넣기(DRM·미지원·판별 불가 포함) → 가져오기 결과 → 반영 → 산출물 일정
//     → 엑셀 출력 → 다시 열어도 저장돼 있는지 (먼저 npm run fixtures)
//   - FSR + TSC → 추적성(누락·없는 ID·ID 중복) → 연결 지도·상세 패널 → ID 대응표에서 골라 연결
//   - FMEA + SRS → FMEA 근거, 소프트웨어 탭(지도·역방향 확인), ID 대응표(SRS 참조), 엑셀 시트 3
//   - 산출물 일정 직접 고치기 → 상태 다시 계산 → 엑셀 출력의 DIA 붙여넣기 시트(원본과 같은 칸 주소)
//   - 내 담당: 내 정보 → 역할 고르기 → ☆ 직접 넣기 → 엑셀 "내 담당만" → 업데이트 기록
//   - 처음 보는 양식: HSR 칸 지정 → 하드웨어 탭 연결, 같은 모양 자동, SW 시험 명세 칸 지정, 동의어 추가
//   - 대량(TSR 320개): 읽기 시간, 지도 모두 펼치기·카드 누르기·탭 전환 시간
//   - 업데이트: 가짜 GitHub(내 PC)로 자동 확인·버전 확인·받기·확인값 불일치·업데이트 연결 차단 범위
//   - 화면 캡처 저장 (Actions 아티팩트로 올림)
//
// 사용법
//   npm run build && npm run smoke                       ← out/ 폴더의 앱을 실행
//   SMOKE_EXE=dist/win-unpacked/FuSaTrace.exe npm run smoke  ← 설치 파일과 같은 exe를 실행 (Actions)
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
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

// ── 가짜 GitHub (업데이트 확인용, 내 PC의 127.0.0.1에서만). mode: current = 최신, new = v99.0.0, badhash = 확인값이 틀림
const fakeGithub = { mode: 'current', hits: [] }
const NEW_VERSION = '99.0.0'
const fakeAssets = {
  [`FuSaTrace-${NEW_VERSION}-Setup.exe`]: Buffer.from('fake setup'),
  [`FuSaTrace-${NEW_VERSION}-Portable.exe`]: Buffer.from('fake portable'),
  [`FuSaTrace-${NEW_VERSION}-win-x64.zip`]: Buffer.from(`fake zip ${'x'.repeat(300_000)}`)
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const githubServer = createServer((req, res) => {
  fakeGithub.hits.push(req.url)
  const base = `http://127.0.0.1:${githubServer.address().port}`
  const url = decodeURIComponent(req.url ?? '')
  if (url === '/latest') {
    const v = fakeGithub.mode === 'current' ? version : NEW_VERSION
    const assets = Object.entries(fakeAssets).map(([name, b]) => ({ name: name.replace(NEW_VERSION, v), browser_download_url: `${base}/dl/${name.replace(NEW_VERSION, v)}`, size: b.length }))
    assets.push({ name: 'SHA256SUMS.txt', browser_download_url: `${base}/dl/SHA256SUMS.txt`, size: 300 })
    res.setHeader('content-type', 'application/json')
    return res.end(JSON.stringify({ tag_name: `v${v}`, html_url: `${base}/page`, published_at: '2026-11-10T00:00:00Z', body: '가짜 Release 설명', assets }))
  }
  if (url === '/dl/SHA256SUMS.txt') return res.end(Object.entries(fakeAssets).map(([n, b]) => `${fakeGithub.mode === 'badhash' ? '0'.repeat(64) : sha256(b)}  ${n}`).join('\n'))
  const dl = /^\/dl\/(.+)$/.exec(url)
  if (dl) {
    // GitHub처럼 다른 주소로 한 번 넘겨 줌
    res.writeHead(302, { location: `/blob/${encodeURIComponent(dl[1])}` })
    return res.end()
  }
  const blob = /^\/blob\/(.+)$/.exec(url)
  if (blob && fakeAssets[blob[1]]) {
    res.writeHead(200, { 'content-length': fakeAssets[blob[1]].length, 'content-type': 'application/octet-stream' })
    return res.end(fakeAssets[blob[1]])
  }
  res.writeHead(404)
  res.end()
})
await new Promise((resolve) => githubServer.listen(0, '127.0.0.1', resolve))
const downloadDir = mkdtempSync(join(tmpdir(), 'fusa-dl-'))

const args = [`--log-net-log=${netLogPath}`]
if (process.platform === 'linux') args.push('--no-sandbox')
if (!exe) args.push('.')

const started = Date.now()
const app = await electron.launch({
  executablePath: exe,
  args,
  env: {
    ...process.env,
    FUSA_SMOKE: '1',
    FUSA_DATA_DIR: dataDir,
    FUSA_UPDATE_API: `http://127.0.0.1:${githubServer.address().port}/latest`,
    FUSA_DOWNLOAD_DIR: downloadDir
  },
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
  await win.getByRole('button', { name: '저장할 곳 고르기' }).click()
  await win.waitForSelector('text=엑셀로 저장했습니다', { timeout: 30_000 })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(out)
  check(wb.worksheets.map((w) => w.name).join(',') === '작성 리스트,담당자별 요약,추적성 누락', '엑셀 출력: 시트 3개 (추적성 누락 포함)', wb.worksheets.map((w) => w.name).join(', '))
  check(wb.getWorksheet('작성 리스트').rowCount === 6 + 22, '엑셀 출력: 22줄', String(wb.getWorksheet('작성 리스트').rowCount - 6))

  // ── 산출물 일정 직접 고치기 → 상태 다시 계산 → 엑셀 출력의 DIA 붙여넣기 시트 (원본과 같은 칸 주소)
  const noPlanCard = win.locator('.summary-card', { hasText: '일정 미기재' }).locator('.summary-value')
  const noPlanBefore = Number(await noPlanCard.innerText())
  await win.getByRole('button', { name: /^No\.1 .*일정·담당 고치기$/ }).click()
  await win.getByLabel('계획 종료', { exact: true }).fill('2026-04-15')
  await win.getByLabel('담당 팀', { exact: true }).fill('품질팀')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-edit.png') })
  await win.getByRole('button', { name: '저장', exact: true }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  await win.getByRole('button', { name: /^No\.12 .*일정·담당 고치기$/ }).click()
  await win.getByLabel('계획 시작', { exact: true }).fill('')
  await win.getByRole('button', { name: '저장', exact: true }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  const editText = await win.locator('main').innerText()
  check(editText.includes('직접 고친 칸 3개') && editText.includes('수정'), '일정 고치기: 고친 칸에 "수정" 표시, 고친 칸 3개', editText.match(/직접 고친 칸 \d+개/)?.[0])
  const noPlanAfter = Number(await noPlanCard.innerText())
  check(noPlanAfter === noPlanBefore + 1, '일정 고치기: 계획 시작을 비우면 "일정 미기재"로 다시 계산', `${noPlanBefore} → ${noPlanAfter}`)
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-edited.png') })

  const outPaste = join(mkdtempSync(join(tmpdir(), 'fusa-export-')), 'paste.xlsx')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, outPaste)
  await win.getByRole('button', { name: '엑셀 출력' }).click()
  check(await win.getByLabel(/DIA 붙여넣기" 시트 포함/).isChecked(), '엑셀 출력: 고친 칸이 있으면 "DIA 붙여넣기" 시트 포함 (기본 켬)')
  await win.getByRole('button', { name: '저장할 곳 고르기' }).click()
  await win.waitForSelector('text=엑셀로 저장했습니다', { timeout: 30_000 })
  const wbp = new ExcelJS.Workbook()
  await wbp.xlsx.readFile(outPaste)
  const names = wbp.worksheets.map((w) => w.name)
  check(names.includes('DIA 붙여넣기 안내') && names.includes('DIA 붙여넣기'), '엑셀 출력: DIA 붙여넣기 안내 + 붙여넣기 시트', names.join(', '))
  const ps = wbp.getWorksheet('DIA 붙여넣기')
  const l8 = ps.getCell('L8').value
  check(l8 instanceof Date && l8.toISOString().startsWith('2026-04-15') && ps.getCell('O8').value === '품질팀\n홍길동 책임', '붙여넣기 시트: 원본 DIA와 같은 칸(L8 계획 종료, O8 담당)에 고친 값', `${l8 instanceof Date ? l8.toISOString().slice(0, 10) : l8} / ${JSON.stringify(ps.getCell('O8').value)}`)
  const guide = []
  wbp.getWorksheet('DIA 붙여넣기 안내').eachRow((row) => row.eachCell((c) => guide.push(String(c.value))))
  check(guide.join(' ').includes('K8:O') && guide.join(' ').includes('3개'), '붙여넣기 안내: 범위(K8:O…)와 바뀐 칸 3개', guide.find((g) => g.includes('K8:')))

  // ── 저장 확인: 화면을 새로 고쳐도 프로젝트가 남아 있음
  await win.reload()
  await win.waitForSelector('.summary-card', { timeout: 30_000 })
  const totalAfter = (await win.locator('.summary-card').first().locator('.summary-value').innerText()).trim()
  check(totalAfter === '22', '다시 열어도 저장된 내용이 그대로', totalAfter)
  check((await win.locator('main').innerText()).includes('직접 고친 칸 3개'), '다시 열어도 고친 칸이 그대로')

  // ── 내 담당: 설정의 내 정보 → [내 담당] → 역할 고르기 → ☆ 직접 넣기 → 엑셀 "내 담당만" → 업데이트 기록
  await win.locator('.menu-item', { hasText: '설정' }).click()
  const prof = win.locator('section[aria-labelledby="s-profile"]')
  await prof.getByLabel('팀', { exact: true }).fill('SW팀')
  await prof.getByLabel('이름', { exact: true }).fill('최지훈')
  await prof.getByLabel('직급', { exact: true }).fill('책임')
  await prof.getByRole('button', { name: '저장' }).click()
  await win.waitForSelector('text=내 정보를 저장했습니다', { timeout: 10_000 })
  check(true, '설정: 내 정보(팀·이름·직급) 저장')
  await win.locator('.menu-item', { hasText: '산출물 일정' }).click()
  await win.getByRole('button', { name: /^내 담당/ }).click()
  check((await win.getByLabel('내 이름', { exact: true }).inputValue()) === '최지훈', '내 담당: 처음 누르면 역할 고르기 창 (내 이름은 설정 값)')
  await win.getByRole('checkbox', { name: /^시스템/ }).check()
  await win.getByRole('checkbox', { name: /내 이름이 있는 산출물/ }).check()
  const preview = (await win.locator('.mine-count').innerText()).trim()
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-mine-picker.png') })
  await win.getByRole('button', { name: '이대로 보기' }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  const mineTotal = (await win.locator('.summary-card').first().locator('.summary-value').innerText()).trim()
  const tags = (await win.locator('.mine-tag').allInnerTexts()).join(' ')
  check(preview.includes('12건') && mineTotal === '12' && tags.includes('자동 · 시스템') && tags.includes('자동 · 내 이름'), '내 담당: 시스템(10) + 내 이름(2) = 12건, 들어온 이유 표시', `${preview} / 요약 ${mineTotal}`)
  await win.getByRole('button', { name: /^전체 산출물/ }).click()
  await win.getByRole('button', { name: /^No\.8 .*내 담당에 넣기$/ }).click()
  const mineTab = (await win.getByRole('button', { name: /^내 담당/ }).innerText()).replace(/\s+/g, ' ')
  check(mineTab.includes('13'), '내 담당: ☆로 직접 넣기 (12 → 13)', mineTab)
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-mine-all.png') })
  await win.getByRole('button', { name: /^내 담당/ }).click()
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-mine.png') })

  const outMine = join(mkdtempSync(join(tmpdir(), 'fusa-export-')), 'mine.xlsx')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async (...a) => {
      globalThis.__fusaSaveDefault = (a[1] ?? a[0])?.defaultPath
      return { canceled: false, filePath: path }
    }
  }, outMine)
  await win.getByRole('button', { name: '엑셀 출력' }).click()
  await win.getByRole('radio', { name: /내 담당만 13건/ }).check()
  await win.getByRole('button', { name: '저장할 곳 고르기' }).click()
  await win.waitForSelector('text=엑셀로 저장했습니다', { timeout: 30_000 })
  const wbm = new ExcelJS.Workbook()
  await wbm.xlsx.readFile(outMine)
  const listM = wbm.getWorksheet('작성 리스트')
  const saveDefault = String(await app.evaluate(() => globalThis.__fusaSaveDefault))
  check(listM.rowCount - 6 === 13 && String(listM.getCell('A1').value).includes('내 담당') && saveDefault.endsWith('_내담당.xlsx'), '엑셀 출력 "내 담당만": 13줄, 제목에 기준, 파일 이름 끝 _내담당', `${listM.rowCount - 6}줄 · ${listM.getCell('A1').value}`)

  await win.locator('.menu-item', { hasText: '설정' }).click()
  const settingsMine = await win.locator('main').innerText()
  check(settingsMine.includes('직접 고른 산출물 (1)') && settingsMine.includes(`v${version}`) && settingsMine.includes('지금 버전'), '설정: 내 담당(직접 고른 산출물) + 업데이트 기록(지금 버전 표시)')
  await win.locator('section[aria-labelledby="s-history"]').screenshot({ path: screenshotPath.replace(/\.png$/, '-history.png') })

  await win.locator('.menu-item', { hasText: '문서 관리' }).click()
  const docsText = await win.locator('main').innerText()
  check(docsText.includes('자동') && docsText.includes('TSC VR'), '문서 관리: VR 파일 ↔ DIA 산출물 자동 연결 표시')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-documents.png') })

  // ── M2: FSR + TSC → 시스템 추적성
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
  }, [join(FIXTURES, `${P}_FSR_R01.xlsx`), join(FIXTURES, `${P}_기술안전개념서(TSC)_R1.docx`)])
  await win.getByRole('button', { name: '문서 넣기' }).first().click()
  await win.waitForFunction(() => document.querySelectorAll('.import-card').length === 2, null, { timeout: 60_000 })
  const m2Text = await win.locator('dialog.modal').innerText()
  check(m2Text.includes('FSR 23') && m2Text.includes('TSR 46'), '가져오기 결과: FSR 23개, TSR 46개')
  check(m2Text.includes('ID 중복'), '가져오기 결과: TSR ID 중복 경고')
  await win.getByRole('button', { name: /^반영 \(2개\)$/ }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  await win.locator('.menu-item', { hasText: '추적성' }).click()
  await win.waitForSelector('.stage-cards')
  const cardsText = await win.locator('.stage-cards').innerText()
  check(/21\s*\/\s*22/.test(cardsText), '추적성: TSR 연결 21 / 22', cardsText.replace(/\s+/g, ' '))

  // ── M3: 연결 지도 (기본 보기)
  await win.waitForSelector('[data-testid="trace-map"] .map-card')
  const mapText = await win.getByTestId('trace-map').innerText()
  check(mapText.includes('TSR 없음'), '연결 지도: 누락 FSR → "TSR 없음" 빈 카드')
  check(mapText.includes('FSR.001.099 없음'), '연결 지도: 없는 FSR 참조 → "FSR.001.099 없음" 빈 카드')
  check(mapText.includes('TSR-CTL-SG001-012 (중복 #1)') && mapText.includes('TSR-CTL-SG001-012 (중복 #2)'), '연결 지도: ID 중복 TSR 카드 2개')
  check(/정상 FSR \d+개/.test(mapText), '연결 지도: 정상 연결은 묶음 카드')
  const dashed = await win.locator('path.edge-missing').count()
  check(dashed >= 2, '연결 지도: 주황 점선 (누락·없는 ID)', `${dashed}개`)
  let t0 = Date.now()
  await win.locator('.map-card', { hasText: 'TSR-CTL-SG001-029' }).click()
  await win.waitForSelector('.map-detail')
  const clickMs = Date.now() - t0
  const detail = await win.locator('.map-detail').innerText()
  check(detail.includes('적힌 참조 원문') && detail.includes('FSR.001.099') && detail.includes('없는 ID'), '연결 지도: 카드 누르면 상세 패널 (적힌 참조 원문, 해석 방식)', `${clickMs}ms`)
  check((await win.locator('.map-card.dim').count()) > 0, '연결 지도: 고른 카드의 연결만 강조 (나머지 흐리게)')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-map.png') })
  await win.getByRole('button', { name: '목록', exact: true }).click()
  const traceText = await win.locator('main').innerText()
  check(traceText.includes('누락 1'), '추적성: TSR 없는 FSR 1개 (누락)')
  check(traceText.includes('없는 FSR 참조: FSR.001.099'), '추적성: 없는 FSR을 가리키는 TSR')
  check(traceText.includes('ID 중복 (#2/2)'), '추적성: TSR ID 중복 표시')
  const pill = (await win.locator('.count-pill').count()) > 0 ? (await win.locator('.count-pill').innerText()).trim() : '0'
  check(pill === '1', 'ID 대응표 메뉴에 확인할 건수 표시', pill)
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-trace.png') })

  // ID 대응표: 없는 ID를 맞는 FSR로 골라 기억
  await win.locator('.menu-item', { hasText: 'ID 대응표' }).click()
  await win.getByLabel('FSR.001.099의 대상 고르기').selectOption('FSR.001.011')
  await win.getByRole('button', { name: '연결 (기억)' }).click()
  await win.waitForFunction(() => document.querySelectorAll('.count-pill').length === 0)
  check(true, 'ID 대응표: 고르면 확인 건수가 사라짐')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-idmap.png') })
  await win.locator('.menu-item', { hasText: '추적성' }).click()
  const cardsAfter = await win.locator('.stage-cards').innerText()
  check(/22\s*\/\s*22/.test(cardsAfter), '추적성: 별칭으로 연결되어 22 / 22', cardsAfter.replace(/\s+/g, ' '))

  // ── M4: FMEA + SRS → FMEA 근거, 소프트웨어 탭, 역방향 확인
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
  }, [join(FIXTURES, `${P}_시스템 FMEA_R1.xlsx`), join(FIXTURES, `${P}_SRS_v1.5.docx`)])
  await win.getByRole('button', { name: '문서 넣기' }).first().click()
  await win.waitForFunction(() => document.querySelectorAll('.import-card').length === 2, null, { timeout: 60_000 })
  const m4Text = await win.locator('dialog.modal').innerText()
  check(m4Text.includes('고장원인 35') && m4Text.includes('SSR 52'), '가져오기 결과: FMEA 고장원인 35개, SRS SSR 52개')
  check(m4Text.includes('Yes인데 TSR이 적혀 있지 않습니다'), '가져오기 결과: SRS "Yes인데 TSR 없음" 경고')
  await win.getByRole('button', { name: /^반영 \(2개\)$/ }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  await win.locator('.menu-item', { hasText: '추적성' }).click()
  await win.waitForSelector('[data-testid="trace-map"] .map-card')
  const fmeaCards = await win.locator('.stage-cards').innerText()
  check(/27\s*\/\s*40/.test(fmeaCards), '시스템 탭: FMEA 근거 27 / 40', fmeaCards.replace(/\s+/g, ' '))
  const sysMap = await win.getByTestId('trace-map').innerText()
  check(sysMap.includes('FMEA 근거 없음') && /고장원인 \d+건/.test(sysMap), '시스템 지도: FMEA 근거 열 (요소별 고장원인, FMEA 근거 없음)')
  check((await win.locator('main').innerText()).includes('ASIL B인데 TSR 연결 없음'), '시스템 탭: 역방향 확인 (ASIL 있는데 TSR 없는 고장원인)')
  await win.getByRole('tab', { name: /소프트웨어/ }).click()
  await win.waitForSelector('[data-testid="trace-map"] .map-card')
  const swCards = await win.locator('.stage-cards').innerText()
  check(/22\s*\/\s*28/.test(swCards), '소프트웨어 탭: SSR 연결 22 / 28', swCards.replace(/\s+/g, ' '))
  const swMap = await win.getByTestId('trace-map').innerText()
  check(swMap.includes('SSR 없음') && swMap.includes('TSR-037 없음') && swMap.includes('TSR 미기재'), '소프트웨어 지도: SSR 없음 / 없는 TSR / TSR 미기재 빈 카드')
  const swText = await win.locator('main').innerText()
  check(swText.includes('Functional Safety Related가 Yes인데 TSR 없음') && swText.includes('ASIL B인데 TSR 연결 없음'), '소프트웨어 탭: 역방향 확인 (TSR 연결 없는 안전 관련 SSR)')
  await win.locator('.map-card', { hasText: 'FS_SSR-100001' }).click()
  const ssrDetail = await win.locator('.map-detail').innerText()
  check(ssrDetail.includes('Yes (TSR-017, TSR-037)') && ssrDetail.includes('약식 표기') && ssrDetail.includes('없는 ID'), '소프트웨어 지도: SSR 상세 (원문, 약식 표기, 없는 ID)')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-software.png') })
  const pill10 = (await win.locator('.count-pill').innerText()).trim()
  check(pill10 === '10', 'ID 대응표: FMEA 6 + SRS 4 = 10건', pill10)
  await win.locator('.menu-item', { hasText: 'ID 대응표' }).click()
  const idmapText = await win.locator('main').innerText()
  check(idmapText.includes('SRS → TSR') && idmapText.includes('FMEA → TSR'), 'ID 대응표: 문서 종류별 (TSC·FMEA·SRS)')
  const row005 = win.locator('tr', { hasText: 'SRS → TSR' }).filter({ hasText: 'TSR-005' })
  await row005.getByLabel('TSR-CTL-SG002-005').check()
  await row005.getByRole('button', { name: '이걸로 연결 (기억)' }).click()
  await win.waitForFunction(() => document.querySelector('.count-pill')?.textContent?.trim() === '9')
  check(true, 'ID 대응표: SRS의 TSR-005 → 후보 중 골라 기억 (10 → 9건)')
  // 시트 3 내용
  const out2 = join(mkdtempSync(join(tmpdir(), 'fusa-export-')), 'out2.xlsx')
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path })
  }, out2)
  await win.getByRole('button', { name: '엑셀 출력' }).click()
  await win.getByRole('button', { name: '저장할 곳 고르기' }).click()
  await win.waitForFunction(() => document.querySelectorAll('.toast').length > 0 && [...document.querySelectorAll('.toast')].some((t) => t.textContent?.includes('엑셀로 저장했습니다')))
  await win.waitForTimeout(500)
  const wb3 = new ExcelJS.Workbook()
  await wb3.xlsx.readFile(out2)
  const s3 = wb3.getWorksheet('추적성 누락')
  const stages = new Set()
  s3?.eachRow((r, i) => i > 1 && stages.add(String(r.getCell(1).value)))
  // (FSR 누락은 앞에서 ID 대응표로 연결해 0건)
  check(['TSR → FSR (참조)', 'TSR → FMEA 근거', 'TSR → SSR', '역방향: SSR', '역방향: FMEA 고장원인'].every((x) => stages.has(x)) && !stages.has('FSR → TSR'), '엑셀 시트 3: 단계별 누락·확인 필요', [...stages].join(', '))

  // ── M5: 처음 보는 양식 칸 지정 → 하드웨어 탭, SW 시험, 같은 모양 자동, 동의어
  const pick = async (paths) => {
    await app.evaluate(({ dialog }, ps) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ps })
    }, paths)
    await win.getByRole('button', { name: '문서 넣기' }).first().click()
    await win.waitForFunction((n) => document.querySelectorAll('.import-card').length === n, paths.length, { timeout: 60_000 })
  }
  await pick([join(FIXTURES, `${P}_HSR_R1.xlsx`)])
  check((await win.locator('dialog.modal').innerText()).includes('처음 보는 양식입니다'), '칸 지정: HSR(처음 보는 양식) → 칸 지정 안내')
  await win.getByRole('button', { name: '칸 지정', exact: true }).click()
  await win.getByLabel('HW Req No. 칸의 역할').selectOption('id')
  await win.getByLabel('Parent TSR 칸의 역할').selectOption('ref')
  await win.getByLabel('Requirement 칸의 역할').selectOption('title')
  await win.getByLabel('ASIL 칸의 역할').selectOption('asil')
  await win.getByLabel('Status 칸의 역할').selectOption('status')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-mapping.png') })
  await win.getByRole('button', { name: '저장하고 다시 읽기' }).click()
  await win.waitForFunction(() => document.querySelector('.import-card')?.textContent?.includes('HSR 15'), null, { timeout: 60_000 })
  check(true, '칸 지정: 머리글 칸 역할만 정하면 HSR 15개를 읽음')
  await win.getByRole('button', { name: /^반영 \(1개\)$/ }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  await win.locator('.menu-item', { hasText: '추적성' }).click()
  await win.getByRole('tab', { name: /하드웨어/ }).click()
  await win.waitForSelector('[data-testid="trace-map"] .map-card')
  const hwCards = await win.locator('.stage-cards').innerText()
  check(/12\s*\/\s*22/.test(hwCards), '하드웨어 탭: 칸 지정한 HSR이 TSR에 연결 (12 / 22)', hwCards.replace(/\s+/g, ' '))
  const hwMap = await win.getByTestId('trace-map').innerText()
  check(hwMap.includes('HSR 없음') && hwMap.includes('TSR 미기재') && hwMap.includes('TSR-CTL-SG001-099 없음'), '하드웨어 지도: HSR 없음 / TSR 미기재 / 없는 TSR')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-hardware.png') })

  await pick([join(FIXTURES, `${P}_HSR 보조_R0.xlsx`)])
  const autoText = await win.locator('dialog.modal').innerText()
  check(autoText.includes('칸 지정 규칙') && autoText.includes('HSR 5'), '같은 모양의 다른 HSR 파일은 규칙을 자동으로 다시 씀')
  await win.getByRole('button', { name: /^반영 \(1개\)$/ }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  const hwCards2 = await win.locator('.stage-cards').innerText()
  check(/17\s*\/\s*22/.test(hwCards2), '하드웨어 탭: 두 번째 HSR 파일까지 17 / 22', hwCards2.replace(/\s+/g, ' '))

  await pick([join(FIXTURES, `${P}_SW 시험 명세_R0.docx`)])
  await win.locator('.import-card').getByLabel('문서 종류').selectOption('SWTEST')
  await win.getByRole('button', { name: '칸 지정', exact: true }).click()
  await win.getByLabel('Test Case ID 칸의 역할').selectOption('id')
  await win.getByLabel('Verified Requirement 칸의 역할').selectOption('ref')
  await win.getByLabel('Test Title 칸의 역할').selectOption('title')
  await win.getByRole('button', { name: '저장하고 다시 읽기' }).click()
  await win.waitForFunction(() => /SW 시험 \d+/.test(document.querySelector('.import-card')?.textContent ?? ''), null, { timeout: 60_000 })
  await win.getByRole('button', { name: /^반영 \(1개\)$/ }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })
  await win.getByRole('tab', { name: /소프트웨어/ }).click()
  const swCards3 = await win.locator('.stage-cards').innerText()
  check(/29\s*\/\s*31/.test(swCards3), '소프트웨어 탭: 칸 지정한 SW 시험 명세 → SW 요구사항 시험 29 / 31', swCards3.replace(/\s+/g, ' '))
  check((await win.getByTestId('trace-map').innerText()).includes('SW 시험 없음'), '소프트웨어 지도: SW 시험 없음')
  const pill13 = (await win.locator('.count-pill').innerText()).trim()
  check(pill13 === '13', 'ID 대응표: HSR 3 + SW 시험 1 추가 (9 → 13건)', pill13)

  // 설정: 칸 지정 규칙 목록, 동의어 추가 → 기본 동의어에 없는 FSR 양식을 읽음
  await win.locator('.menu-item', { hasText: '설정' }).click()
  const settingsText = await win.locator('main').innerText()
  check(settingsText.includes('칸 지정 규칙') && settingsText.includes('HSR 양식') && settingsText.includes('SW 시험 명세 양식'), '설정: 저장된 칸 지정 규칙 2개')
  await win.getByLabel('동의어를 추가할 칸').selectOption('fsrId')
  await win.getByLabel('문서에 적힌 칸 이름').fill('FSR 번호')
  await win.getByRole('button', { name: '동의어 추가' }).click()
  await win.getByLabel('동의어를 추가할 칸').selectOption('fsrText')
  await win.getByLabel('문서에 적힌 칸 이름').fill('요구사항')
  await win.getByRole('button', { name: '동의어 추가' }).click()
  await pick([join(FIXTURES, `${P}_FSR_양식C_R00.xlsx`)])
  const synText = await win.locator('dialog.modal').innerText()
  check(synText.includes('FSR 2'), '설정: 동의어를 추가하면 처음 보는 머리글의 FSR도 읽음')
  await win.getByRole('button', { name: '취소' }).click()

  // ── 업데이트 (가짜 GitHub). 지금 설정 화면
  const updStatus = (text, timeout = 30_000) =>
    win.waitForFunction((t) => document.querySelector('[data-testid="update-status"]')?.textContent?.includes(t), text, { timeout })
  const banner = win.getByRole('region', { name: '업데이트 알림' })
  check(fakeGithub.hits.includes('/latest'), '업데이트: 앱을 켜면 자동으로 새 버전 확인', `${fakeGithub.hits.length}번 접속`)
  await updStatus('최신 버전입니다')
  check((await banner.count()) === 0, '업데이트: 최신이면 "최신 버전입니다", 알림 띠 없음')
  fakeGithub.mode = 'new'
  await win.getByRole('button', { name: '버전 확인' }).click()
  await updStatus(`새 버전 v${NEW_VERSION}`)
  check((await banner.innerText()).includes(`v${NEW_VERSION}`), '업데이트: [버전 확인] → 새 버전이 있으면 위쪽 알림 띠')
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-update.png') })
  await win.locator('.update-actions').getByRole('button', { name: '업데이트', exact: true }).click()
  await updStatus('받았습니다')
  const zipName = `FuSaTrace-${NEW_VERSION}-win-x64.zip`
  const savedZip = join(downloadDir, zipName)
  check(existsSync(savedZip) && readFileSync(savedZip).equals(fakeAssets[zipName]), '업데이트: [업데이트] → 확인값(SHA256)이 맞는 새 파일을 다운로드 폴더에 받음 (압축본)')
  check((await banner.innerText()).includes('다운로드 폴더'), '업데이트: 알림 띠에 받은 뒤 할 일 안내')

  rmSync(savedZip)
  fakeGithub.mode = 'badhash'
  await win.getByRole('button', { name: '버전 확인' }).click()
  await updStatus(`새 버전 v${NEW_VERSION}`)
  await win.locator('.update-actions').getByRole('button', { name: '업데이트', exact: true }).click()
  await updStatus('확인값(SHA256)')
  check(!existsSync(savedZip) && !existsSync(`${savedZip}.part`), '업데이트: 확인값이 다르면 받은 파일을 지우고 이유 표시')

  const updateFetch = await app.evaluate(async ({ session }) => {
    try {
      await session.fromPartition('fusa-update').fetch('https://example.com/')
      return 'reached'
    } catch {
      return 'blocked'
    }
  })
  check(updateFetch === 'blocked', '업데이트 연결도 GitHub 말고 다른 곳은 차단', updateFetch)

  fakeGithub.mode = 'current'
  await win.getByRole('button', { name: '버전 확인' }).click()
  await updStatus('최신 버전입니다')
  check((await banner.count()) === 0, '업데이트: 다시 최신이면 알림 띠가 사라짐')

  // ── 대량: 새 프로젝트에 FSR + 대용량 TSC (본문 XML 약 20MB, TSR 320개)
  await win.getByRole('button', { name: /^프로젝트:/ }).click()
  await win.getByLabel('새 프로젝트 이름 (차종·제어기)').fill('대용량 확인')
  await win.getByRole('button', { name: '만들기' }).click()
  await win.waitForFunction(() => document.querySelector('.project-name')?.textContent === '대용량 확인')
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
  }, [join(FIXTURES, `${P}_FSR_R01.xlsx`), join(FIXTURES, `${P}_기술안전개념서_대용량(TSC)_R1.docx`)])
  await win.getByRole('button', { name: '문서 넣기' }).first().click()
  await win.waitForFunction(() => document.querySelectorAll('.import-card').length === 2, null, { timeout: 60_000 })
  const bigText = await win.locator('.import-card', { hasText: '대용량' }).innerText()
  const secs = Number(/(\d+\.\d)초/.exec(bigText)?.[1] ?? 'NaN')
  check(bigText.includes('TSR 320') && secs < 10, '대용량 TSC(20MB, TSR 320개) 10초 안에 읽음', `${secs}초`)
  await win.getByRole('button', { name: /^반영 \(2개\)$/ }).click()
  await win.waitForSelector('dialog.modal', { state: 'detached' })

  t0 = Date.now()
  await win.locator('.menu-item', { hasText: '추적성' }).click()
  await win.waitForSelector('[data-testid="trace-map"] .map-card')
  check(Date.now() - t0 < 1000, '대량: 추적성 탭 열기 1초 이내', `${Date.now() - t0}ms · 카드 ${await win.locator('.map-card').count()}개 (접힘)`)
  t0 = Date.now()
  await win.getByRole('button', { name: '모두 펼치기' }).click()
  await win.waitForFunction(() => document.querySelectorAll('.map-card.kind-item').length >= 320 + 23)
  const expandMs = Date.now() - t0
  check(expandMs < 1000, '대량: 모두 펼치기 (TSR 320 + FSR 23 카드) 1초 이내', `${expandMs}ms`)
  // 앱 반응 시간 = 화면이 클릭을 받은 순간 → 상세 패널이 생긴 순간 (사람이 느끼는 시간).
  // Playwright 클릭 전체 시간(스크롤·가림 대기 포함)과 누르기 전에 카드를 가린 것도 함께 남김
  const pre = await win.evaluate(() => {
    const card = [...document.querySelectorAll('.map-card')].find((e) => e.textContent?.includes('FSR.001.001'))
    const r = card?.getBoundingClientRect()
    const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
    const w = window
    w.__pick = { click: 0, shown: 0 }
    document.addEventListener('click', () => (w.__pick.click ||= performance.now()), { capture: true, once: true })
    new MutationObserver((_, obs) => {
      if (document.querySelector('.map-detail')) {
        obs.disconnect()
        // 다음 화면 그리기까지 포함
        requestAnimationFrame(() => setTimeout(() => (w.__pick.shown = performance.now())))
      }
    }).observe(document.body, { childList: true, subtree: true })
    return { covered: hit && card && !card.contains(hit) ? `${hit.tagName}.${hit.className}` : '', toasts: document.querySelectorAll('.toast').length }
  })
  t0 = Date.now()
  await win.locator('.map-card', { hasText: 'FSR.001.001' }).click()
  await win.waitForSelector('.map-detail')
  const totalMs = Date.now() - t0
  await win.waitForFunction(() => window.__pick.shown > 0)
  const pickMs = await win.evaluate(() => {
    const p = window.__pick
    return Math.round(p.shown - p.click)
  })
  check(
    pickMs >= 0 && pickMs < 1000,
    '대량: 카드 누르기 → 강조·상세 1초 이내 (앱 반응 시간)',
    `${pickMs}ms · 클릭 동작 포함 ${totalMs}ms · 알림 ${pre.toasts}개${pre.covered ? ` · 누르기 전 카드를 가린 것: ${pre.covered}` : ''}`
  )
  await win.screenshot({ path: screenshotPath.replace(/\.png$/, '-map-large.png') })
  t0 = Date.now()
  await win.locator('.menu-item', { hasText: '산출물 일정' }).click()
  await win.locator('.menu-item', { hasText: '추적성' }).click()
  await win.waitForSelector('[data-testid="trace-map"] .map-card')
  check(Date.now() - t0 < 1000, '대량: 탭 전환 (일정 → 추적성) 1초 이내', `${Date.now() - t0}ms`)


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
  githubServer.close()
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
