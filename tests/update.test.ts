import { describe, expect, it } from 'vitest'
import {
  isAllowedUpdateUrl,
  isNewer,
  isReleaseFileUrl,
  parseRelease,
  parseSha256Sums,
  parseVersion,
  pickAsset,
  testOverrideOrigin,
  UPDATE_REPO
} from '../src/core/update'

const dl = (name: string): string => `https://github.com/${UPDATE_REPO}/releases/download/v0.6.0/${name}`
const apiJson = {
  tag_name: 'v0.6.0',
  html_url: `https://github.com/${UPDATE_REPO}/releases/tag/v0.6.0`,
  published_at: '2026-11-10T08:00:00Z',
  body: '## 설치 파일\n- Setup',
  assets: [
    { name: 'FuSaTrace-0.6.0-Setup.exe', browser_download_url: dl('FuSaTrace-0.6.0-Setup.exe'), size: 100 },
    { name: 'FuSaTrace-0.6.0-Portable.exe', browser_download_url: dl('FuSaTrace-0.6.0-Portable.exe'), size: 90 },
    { name: 'FuSaTrace-0.6.0-win-x64.zip', browser_download_url: dl('FuSaTrace-0.6.0-win-x64.zip'), size: 150 },
    { name: 'SHA256SUMS.txt', browser_download_url: dl('SHA256SUMS.txt'), size: 3 },
    { name: 'broken' }
  ]
}

describe('업데이트: 버전 비교', () => {
  it('v 접두어 유무와 관계없이 숫자로 비교', () => {
    expect(parseVersion('v0.10.2')).toEqual([0, 10, 2])
    expect(parseVersion('1.2')).toBeNull()
    expect(isNewer('v0.6.0', '0.5.0')).toBe(true)
    expect(isNewer('0.10.0', '0.9.9')).toBe(true) // 글자 비교가 아님
    expect(isNewer('v0.5.0', '0.5.0')).toBe(false)
    expect(isNewer('v0.4.9', '0.5.0')).toBe(false)
    expect(isNewer('v1.0.0-beta', '0.5.0')).toBe(false) // 모르는 모양은 새 버전으로 보지 않음
  })
})

describe('업데이트: Release 정보', () => {
  it('GitHub API 응답을 읽고 모양이 다른 파일 항목은 건너뜀', () => {
    const r = parseRelease(apiJson)
    expect(r.version).toBe('0.6.0')
    expect(r.assets).toHaveLength(4)
    expect(r.notes).toContain('설치 파일')
  })
  it('태그가 버전 모양이 아니면 오류', () => {
    expect(() => parseRelease({ tag_name: 'latest' })).toThrow('모양')
    expect(() => parseRelease(null)).toThrow()
  })
  it('설치 방식에 맞는 파일을 고름', () => {
    const r = parseRelease(apiJson)
    expect(pickAsset(r, 'setup')?.name).toBe('FuSaTrace-0.6.0-Setup.exe')
    expect(pickAsset(r, 'portable')?.name).toBe('FuSaTrace-0.6.0-Portable.exe')
    expect(pickAsset(r, 'zip')?.name).toBe('FuSaTrace-0.6.0-win-x64.zip')
    expect(pickAsset({ ...r, assets: [] }, 'setup')).toBeUndefined()
  })
  it('SHA256SUMS.txt (sha256sum 형식, CRLF·별표 포함)', () => {
    const h = 'A'.repeat(64)
    const m = parseSha256Sums(`${h}  FuSaTrace-0.6.0-Setup.exe\r\n${'b'.repeat(64)} *FuSaTrace-0.6.0-win-x64.zip\n잘못된 줄\n`)
    expect(m.get('FuSaTrace-0.6.0-Setup.exe')).toBe('a'.repeat(64))
    expect(m.get('FuSaTrace-0.6.0-win-x64.zip')).toBe('b'.repeat(64))
    expect(m.size).toBe(2)
  })
})

describe('업데이트: 접속 허용 범위', () => {
  it('업데이트 연결은 GitHub https 주소만', () => {
    expect(isAllowedUpdateUrl('https://api.github.com/repos/x/y/releases/latest')).toBe(true)
    expect(isAllowedUpdateUrl('https://release-assets.githubusercontent.com/abc')).toBe(true)
    expect(isAllowedUpdateUrl('http://api.github.com/')).toBe(false)
    expect(isAllowedUpdateUrl('https://example.com/')).toBe(false)
    expect(isAllowedUpdateUrl('https://api.github.com.evil.test/')).toBe(false)
    expect(isAllowedUpdateUrl('not a url')).toBe(false)
  })
  it('받을 파일은 이 저장소의 Release만', () => {
    expect(isReleaseFileUrl(dl('a.exe'))).toBe(true)
    expect(isReleaseFileUrl('https://github.com/someone/else/releases/download/v1/a.exe')).toBe(false)
  })
  it('테스트 주소는 내 PC의 http만 받아들임', () => {
    expect(testOverrideOrigin('http://127.0.0.1:5555/latest')).toBe('http://127.0.0.1:5555')
    expect(testOverrideOrigin('http://localhost:1/x')).toBe('http://localhost:1')
    expect(testOverrideOrigin('https://evil.test/latest')).toBeUndefined()
    expect(testOverrideOrigin('http://10.0.0.1/latest')).toBeUndefined()
    expect(testOverrideOrigin(undefined)).toBeUndefined()
    const o = 'http://127.0.0.1:5555'
    expect(isAllowedUpdateUrl(`${o}/dl/a`, o)).toBe(true)
    expect(isAllowedUpdateUrl('http://127.0.0.1:6666/dl/a', o)).toBe(false)
    expect(isReleaseFileUrl(dl('a.exe'), o)).toBe(false)
  })
})
