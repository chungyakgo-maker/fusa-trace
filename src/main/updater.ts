/**
 * 업데이트 (2026-11-10 사용자 결정): 설정의 [버전 확인] → [업데이트], 앱을 켤 때 자동 확인.
 *
 * - 업데이트 전용 연결(세션)만 GitHub에 접속한다. 화면과 나머지 앱은 지금처럼 모든 외부 요청을 막는다.
 * - 이 연결은 Windows 프록시 설정을 쓴다 (회사망). 접속할 수 있는 곳은 GitHub 주소 몇 개뿐 (core/update.ts).
 * - 보내는 것: 앱 버전(User-Agent)뿐. 문서·프로젝트 내용은 보내지 않는다.
 * - 받은 파일은 같은 Release의 SHA256SUMS.txt 확인값과 맞을 때만 쓴다.
 * - 설치형: 설치 프로그램을 조용히 실행(/S) → 앱을 닫음 → 설치 프로그램이 앱을 다시 켬.
 *   포터블·압축본: 실행 중인 파일은 바꿀 수 없어서 다운로드 폴더에 받아 둔다.
 */
import { app, BrowserWindow, session, shell, type Session } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  isAllowedUpdateUrl,
  isNewer,
  isReleaseFileUrl,
  parseRelease,
  parseSha256Sums,
  pickAsset,
  SUMS_FILE,
  testOverrideOrigin,
  UPDATE_API_URL,
  type InstallVariant,
  type ReleaseInfo,
  type UpdateState
} from '../core/update'
import { IPC } from '../shared/ipc'
import { log } from './log'
import { readAppConfig, writeAppConfig } from './appConfig'

// 실행 확인 테스트 전용: 내 PC의 가짜 GitHub (127.0.0.1의 http 주소만 받아들임)
const TEST_ORIGIN = testOverrideOrigin(process.env['FUSA_UPDATE_API'])
const API_URL = TEST_ORIGIN ? process.env['FUSA_UPDATE_API']! : UPDATE_API_URL
const MAX_DOWNLOAD = 600 * 1024 * 1024
const AUTO_CHECK_DELAY_MS = 3_000


function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 지금 실행 중인 앱이 설치형·포터블·압축본 중 무엇인지 */
function detectVariant(): InstallVariant {
  if (process.env['PORTABLE_EXECUTABLE_FILE']) return 'portable'
  // 설치형은 실행 파일 옆에 제거 프로그램이 있음 (electron-builder: "Uninstall FuSaTrace.exe" — 이름은 설정에 따라 다를 수 있어 모양으로 봄)
  if (process.platform === 'win32') {
    try {
      if (readdirSync(dirname(process.execPath)).some((f) => /^Uninstall .+\.exe$/i.test(f))) return 'setup'
    } catch {
      // 폴더를 못 읽으면 압축본으로 봄 (받기만 하고 설치 프로그램은 실행하지 않음)
    }
  }
  return 'zip'
}

/** 네트워크 오류를 쉬운 말로 */
function networkError(error: unknown): string {
  const m = errorText(error)
  if (/abort|timeout|timed out/i.test(m)) return '업데이트 서버의 응답이 너무 늦습니다. 잠시 뒤에 다시 시도해 주세요.'
  if (/ERR_BLOCKED|ERR_PROXY|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_ADDRESS|ERR_NETWORK|ERR_CERT|ERR_SSL|fetch failed/i.test(m))
    return `업데이트 서버에 연결하지 못했습니다. 인터넷이 안 되거나 회사망·보안 프로그램에서 막혔을 수 있습니다. (${m.slice(0, 80)})`
  return m.slice(0, 200)
}

export class Updater {
  private readonly ses: Session
  private readonly dataDir: string
  private release: ReleaseInfo | undefined
  private expectedHash: string | undefined
  private state: UpdateState

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.ses = session.fromPartition('fusa-update') // 'persist:' 없음 → 쿠키·캐시를 디스크에 남기지 않음
    // 세션마다 맞춤법 사전을 따로 받으려 함(Google 서버, 요청 차단기에 안 보임) → 기본 세션과 같이 막음
    this.ses.setSpellCheckerLanguages([])
    this.ses.setSpellCheckerEnabled(false)
    // 회사망 프록시를 쓰도록 Windows 설정을 따름 (앱 전체는 --no-proxy-server, 이 연결만 예외). 테스트는 직접 연결
    void this.ses.setProxy(TEST_ORIGIN ? { mode: 'direct' } : { mode: 'system' })
    this.ses.webRequest.onBeforeRequest((details, callback) => {
      const allowed = isAllowedUpdateUrl(details.url, TEST_ORIGIN)
      if (!allowed) log('warn', 'update: blocked a request outside GitHub')
      callback({ cancel: !allowed })
    })
    this.ses.setPermissionRequestHandler((_w, _p, callback) => callback(false))
    this.ses.setPermissionCheckHandler(() => false)
    this.state = { phase: 'idle', current: app.getVersion(), variant: detectVariant(), autoCheck: readAppConfig(dataDir).autoCheckUpdates !== false, auto: false }
  }

  getState(): UpdateState {
    return this.state
  }

  setAutoCheck(on: boolean): UpdateState {
    try {
      writeAppConfig(this.dataDir, { autoCheckUpdates: on })
    } catch (error) {
      log('error', `update: config save failed: ${errorText(error)}`)
    }
    return this.set({ autoCheck: on })
  }

  private set(patch: Partial<UpdateState>): UpdateState {
    this.state = { ...this.state, ...patch }
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IPC.updateState, this.state)
    return this.state
  }

  /** 앱을 켠 뒤 잠깐 기다렸다가 자동 확인 (설정에서 끌 수 있음) */
  scheduleAutoCheck(): void {
    if (!this.state.autoCheck) return
    setTimeout(() => void this.check(true), AUTO_CHECK_DELAY_MS)
  }

  private async fetchOk(url: string, timeoutMs: number): Promise<Response> {
    const res = await this.ses.fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `FuSaTrace/${app.getVersion()}` },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (res.status === 404) throw new Error('아직 올라온 버전이 없습니다.')
    if (res.status === 403 || res.status === 429) throw new Error('업데이트 확인 횟수 제한에 걸렸습니다. 1시간쯤 뒤에 다시 시도해 주세요.')
    if (!res.ok) throw new Error(`업데이트 서버 응답 오류 (${res.status})`)
    return res
  }

  async check(auto = false): Promise<UpdateState> {
    if (['checking', 'downloading', 'installing'].includes(this.state.phase)) return this.state
    this.set({ phase: 'checking', auto, error: undefined })
    try {
      const res = await this.fetchOk(API_URL, 15_000)
      const release = parseRelease(await res.json())
      const checkedAt = new Date().toISOString()
      if (!isNewer(release.version, this.state.current)) {
        this.release = undefined
        log('info', `update: up to date (latest v${release.version})`)
        return this.set({ phase: 'latest', checkedAt, latest: undefined, progress: undefined, savedPath: undefined })
      }
      const asset = pickAsset(release, this.state.variant)
      this.release = release
      this.expectedHash = undefined
      log('info', `update: v${release.version} available`)
      return this.set({
        phase: 'available',
        checkedAt,
        progress: undefined,
        savedPath: undefined,
        latest: { version: release.version, publishedAt: release.publishedAt, notes: release.notes, pageUrl: release.pageUrl, assetName: asset?.name, size: asset?.size }
      })
    } catch (error) {
      const message = error instanceof SyntaxError ? '업데이트 서버의 응답을 읽지 못했습니다.' : networkError(error)
      log('warn', `update: check failed${auto ? ' (auto)' : ''}: ${message.slice(0, 120)}`)
      return this.set({ phase: 'error', error: message, latest: undefined, checkedAt: new Date().toISOString() })
    }
  }

  async download(): Promise<UpdateState> {
    const release = this.release
    if (!release || !['available', 'error'].includes(this.state.phase) || !this.state.latest) return this.state
    const asset = pickAsset(release, this.state.variant)
    const sums = release.assets.find((a) => a.name === SUMS_FILE)
    const fail = (message: string): UpdateState => {
      log('warn', `update: download failed: ${message.slice(0, 120)}`)
      return this.set({ phase: 'error', error: message, progress: undefined })
    }
    if (!asset) return fail(`새 버전에 ${this.state.variant === 'setup' ? '설치형(Setup.exe)' : this.state.variant === 'portable' ? '포터블' : '압축본(zip)'} 파일이 없습니다.`)
    if (!sums) return fail('새 버전에 확인값 파일(SHA256SUMS.txt)이 없어서 받지 않습니다.')
    if (!isReleaseFileUrl(asset.url, TEST_ORIGIN) || !isReleaseFileUrl(sums.url, TEST_ORIGIN)) return fail('받을 파일 주소가 허용된 곳이 아니어서 받지 않습니다.')

    this.set({ phase: 'downloading', progress: 0, error: undefined, savedPath: undefined })
    const dir = this.state.variant === 'setup' ? join(app.getPath('temp'), 'FuSaTrace-update') : process.env['FUSA_DOWNLOAD_DIR'] || app.getPath('downloads')
    const finalPath = join(dir, asset.name)
    const partPath = `${finalPath}.part`
    try {
      const sumsText = await (await this.fetchOk(sums.url, 30_000)).text()
      const expected = parseSha256Sums(sumsText).get(asset.name)
      if (!expected) return fail(`SHA256SUMS.txt에 ${asset.name}의 확인값이 없어서 받지 않습니다.`)

      mkdirSync(dir, { recursive: true })
      const res = await this.fetchOk(asset.url, 15 * 60_000)
      if (!res.body) return fail('받은 내용이 비어 있습니다.')
      const total = Number(res.headers.get('content-length')) || asset.size || 0
      const hash = createHash('sha256')
      const out = createWriteStream(partPath)
      const reader = res.body.getReader()
      let got = 0
      let lastSent = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          got += value.length
          if (got > MAX_DOWNLOAD) throw new Error('파일이 너무 큽니다.')
          hash.update(value)
          if (!out.write(value)) await new Promise<void>((resolve) => out.once('drain', () => resolve()))
          if (Date.now() - lastSent > 200 && total > 0) {
            lastSent = Date.now()
            this.set({ progress: Math.min(got / total, 0.99) })
          }
        }
      } finally {
        await new Promise<void>((resolve) => out.end(() => resolve()))
      }
      if (hash.digest('hex') !== expected) {
        rmSync(partPath, { force: true })
        return fail('받은 파일의 확인값(SHA256)이 새 버전에 적힌 값과 달라서 지웠습니다. 다시 시도해 주세요.')
      }
      rmSync(finalPath, { force: true })
      renameSync(partPath, finalPath)
      this.expectedHash = expected
      log('info', `update: downloaded v${release.version} (${this.state.variant})`)
      return this.set({ phase: 'downloaded', progress: 1, savedPath: finalPath })
    } catch (error) {
      rmSync(partPath, { force: true })
      return fail(networkError(error))
    }
  }

  private hashFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const h = createHash('sha256')
      createReadStream(path)
        .on('data', (d) => h.update(d))
        .on('end', () => resolve(h.digest('hex')))
        .on('error', reject)
    })
  }

  /** 설치형만: 받은 설치 프로그램을 조용히 실행하고 앱을 닫는다. 설치가 끝나면 설치 프로그램이 앱을 다시 켠다 */
  async install(): Promise<UpdateState> {
    const path = this.state.savedPath
    if (this.state.phase !== 'downloaded' || this.state.variant !== 'setup' || !path || !this.expectedHash) return this.state
    try {
      // 받은 뒤 임시 폴더에서 바뀌지 않았는지 한 번 더 확인
      if ((await this.hashFile(path)) !== this.expectedHash) {
        rmSync(path, { force: true })
        return this.set({ phase: 'error', error: '받아 둔 설치 파일이 바뀌어 있어서 지웠습니다. 다시 받아 주세요.' })
      }
      this.set({ phase: 'installing' })
      log('info', `update: installing v${this.state.latest?.version ?? '?'}`)
      // electron-builder 설치 프로그램 옵션: /S 조용히 설치, --force-run 설치 후 앱 실행, --updated 업데이트 설치
      const child = spawn(path, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' })
      await new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('spawn', () => resolve())
      })
      child.unref()
      setTimeout(() => app.quit(), 800)
      return this.state
    } catch (error) {
      log('error', `update: installer start failed: ${errorText(error)}`)
      return this.set({
        phase: 'error',
        error: `설치 프로그램을 실행하지 못했습니다 (보안 프로그램이 막았을 수 있습니다). [받은 파일 보기]로 폴더를 열어 직접 실행해 주세요. (${errorText(error).slice(0, 80)})`
      })
    }
  }

  showDownloaded(): void {
    if (this.state.savedPath && existsSync(this.state.savedPath)) shell.showItemInFolder(this.state.savedPath)
  }
}
