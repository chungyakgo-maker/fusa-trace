import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY, isAllowedUrl, isAppPageUrl } from '../src/main/security'

const DEV = 'http://localhost:5173'

describe('외부 요청 차단 (배포된 앱)', () => {
  it.each([
    'file:///C:/Users/me/AppData/Local/Programs/FuSa%20Trace/resources/app.asar/out/renderer/index.html',
    'file:///C:/x/assets/PretendardVariable.woff2',
    'data:image/png;base64,AAAA',
    'blob:file:///1234',
    'devtools://devtools/bundled/inspector.html'
  ])('앱 내부 주소는 허용: %s', (url) => {
    expect(isAllowedUrl(url)).toBe(true)
  })

  it.each([
    'https://example.com/',
    'http://example.com/',
    'https://fonts.googleapis.com/css2?family=Pretendard',
    'https://update.electronjs.org/',
    'wss://example.com/socket',
    'http://localhost:5173/', // 배포된 앱에서는 개발 서버도 차단
    'ftp://example.com/file',
    'chrome-extension://abc/x.js',
    'not a url',
    ''
  ])('외부·알 수 없는 주소는 차단: %s', (url) => {
    expect(isAllowedUrl(url)).toBe(false)
  })
})

describe('외부 요청 차단 (개발 모드)', () => {
  it('같은 개발 서버(호스트·포트)만 허용', () => {
    expect(isAllowedUrl('http://localhost:5173/src/main.tsx', DEV)).toBe(true)
    expect(isAllowedUrl('ws://localhost:5173/', DEV)).toBe(true)
  })

  it('다른 포트·다른 호스트는 차단', () => {
    expect(isAllowedUrl('http://localhost:8080/', DEV)).toBe(false)
    expect(isAllowedUrl('https://example.com/', DEV)).toBe(false)
  })

  it('개발 서버 주소가 내 PC가 아니면 허용하지 않음', () => {
    expect(isAllowedUrl('http://example.com:5173/', 'http://example.com:5173')).toBe(false)
  })
})

describe('페이지 이동', () => {
  it('앱 자신의 화면만 허용', () => {
    expect(isAppPageUrl('file:///C:/x/out/renderer/index.html')).toBe(true)
    expect(isAppPageUrl('https://example.com/')).toBe(false)
    expect(isAppPageUrl('http://localhost:5173/')).toBe(false)
    expect(isAppPageUrl('http://localhost:5173/', DEV)).toBe(true)
  })
})

describe('콘텐츠 보안 정책(CSP)', () => {
  it('index.html의 CSP가 security.ts와 같음', () => {
    const html = readFileSync(resolve(__dirname, '../src/renderer/index.html'), 'utf-8')
    const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
    expect(match?.[1]).toBe(CONTENT_SECURITY_POLICY)
  })

  it('원격 주소를 허용하는 항목이 없음', () => {
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|wss?:|\*/)
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'")
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self'")
  })
})
