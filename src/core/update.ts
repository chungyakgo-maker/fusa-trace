/**
 * 업데이트 확인 (2026-11-10 사용자 결정, DECISIONS 참고) — 순수 함수
 * GitHub Release(최신)를 읽어 지금 버전보다 새것인지, 어떤 파일을 받을지, 받은 파일의 확인값이 맞는지 정한다.
 */

/** 업데이트를 받는 저장소 (퍼블릭) */
export const UPDATE_REPO = 'chungyakgo-maker/fusa-trace'
export const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
export const RELEASE_PAGE_PREFIX = `https://github.com/${UPDATE_REPO}/releases/`
const DOWNLOAD_PREFIX = `https://github.com/${UPDATE_REPO}/releases/download/`

/** 업데이트 전용 연결이 접속할 수 있는 곳 (그 외는 모두 차단). Release 파일은 github.com → *.githubusercontent.com으로 넘겨짐 */
export const UPDATE_HOSTS = ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'] as const

export const SUMS_FILE = 'SHA256SUMS.txt'

/** 설치형(Setup) / 포터블 / 압축본(zip) — 지금 실행 중인 앱이 어떻게 설치됐는지 */
export type InstallVariant = 'setup' | 'portable' | 'zip'
export const VARIANT_LABEL: Record<InstallVariant, string> = { setup: '설치형', portable: '포터블', zip: '압축본(zip)' }

export interface ReleaseAsset {
  name: string
  url: string
  size: number
}

export interface ReleaseInfo {
  version: string
  tag: string
  publishedAt: string
  notes: string
  pageUrl: string
  assets: ReleaseAsset[]
}

export type UpdatePhase = 'idle' | 'checking' | 'latest' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'

export interface UpdateState {
  phase: UpdatePhase
  current: string
  variant: InstallVariant
  /** 앱을 켤 때 자동 확인 */
  autoCheck: boolean
  /** 마지막 확인을 앱이 켜질 때 자동으로 했는지 */
  auto: boolean
  checkedAt?: string
  /** 새 버전 (지금보다 새것일 때만) */
  latest?: { version: string; publishedAt: string; notes: string; pageUrl: string; assetName?: string; size?: number }
  /** 받기 진행 0~1 */
  progress?: number
  savedPath?: string
  error?: string
}

/** "v1.2.3" / "1.2.3" → [1,2,3]. 다른 모양이면 null */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/** GitHub API(releases/latest) 응답 → ReleaseInfo. 모양이 다르면 오류 */
export function parseRelease(json: unknown): ReleaseInfo {
  const r = json as Record<string, unknown> | null
  const tag = typeof r?.tag_name === 'string' ? r.tag_name : ''
  const v = parseVersion(tag)
  if (!r || !v) throw new Error('GitHub Release 정보의 모양이 예상과 다릅니다')
  const assets: ReleaseAsset[] = Array.isArray(r.assets)
    ? r.assets.flatMap((a) => {
        const x = a as Record<string, unknown>
        return typeof x.name === 'string' && typeof x.browser_download_url === 'string'
          ? [{ name: x.name, url: x.browser_download_url, size: typeof x.size === 'number' ? x.size : 0 }]
          : []
      })
    : []
  return {
    version: v.join('.'),
    tag,
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
    notes: typeof r.body === 'string' ? r.body.slice(0, 4000) : '',
    pageUrl: typeof r.html_url === 'string' ? r.html_url : `${RELEASE_PAGE_PREFIX}tag/${tag}`,
    assets
  }
}

/** 설치 방식에 맞는 파일 (FuSaTrace-<버전>-Setup.exe / -Portable.exe / -win-x64.zip) */
export function pickAsset(release: ReleaseInfo, variant: InstallVariant): ReleaseAsset | undefined {
  const suffix = variant === 'setup' ? '-Setup.exe' : variant === 'portable' ? '-Portable.exe' : '-win-x64.zip'
  return release.assets.find((a) => a.name.startsWith('FuSaTrace-') && a.name.endsWith(suffix))
}

/** sha256sum 형식 ("<64자리>  <파일명>") → 파일명 → 확인값(소문자) */
export function parseSha256Sums(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (m) out.set(m[2], m[1].toLowerCase())
  }
  return out
}

/**
 * 테스트용 업데이트 주소 (실행 확인 테스트 전용): 내 PC(127.0.0.1·localhost)의 http 주소만 받아들인다.
 * 그 외 값이면 무시하고 GitHub을 씀
 */
export function testOverrideOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const u = new URL(value)
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? u.origin : undefined
  } catch {
    return undefined
  }
}

/** 업데이트 전용 연결의 요청 차단기: GitHub https 주소(또는 테스트 주소)만 */
export function isAllowedUpdateUrl(url: string, overrideOrigin?: string): boolean {
  try {
    const u = new URL(url)
    if (overrideOrigin && u.origin === overrideOrigin) return true
    return u.protocol === 'https:' && (UPDATE_HOSTS as readonly string[]).includes(u.hostname)
  } catch {
    return false
  }
}

/** 받을 파일 주소: 이 저장소의 Release 파일만 (테스트 주소는 그 주소 아래만) */
export function isReleaseFileUrl(url: string, overrideOrigin?: string): boolean {
  if (overrideOrigin) return url.startsWith(`${overrideOrigin}/`)
  return url.startsWith(DOWNLOAD_PREFIX)
}

/** 브라우저로 열어도 되는 Release 페이지 주소 */
export function isReleasePageUrl(url: string, overrideOrigin?: string): boolean {
  if (overrideOrigin && url.startsWith(`${overrideOrigin}/`)) return true
  return url.startsWith(RELEASE_PAGE_PREFIX)
}
