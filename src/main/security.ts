/**
 * 외부 통신 차단 규칙.
 * 앱은 오프라인 전용이므로, 앱 자신의 파일(file:) 외의 주소는 모두 막는다.
 * 개발 모드(npm run dev)일 때만 로컬 개발 서버 주소를 허용한다.
 */

/** 화면(renderer)에 적용하는 콘텐츠 보안 정책. index.html의 meta 태그와 같은 값이어야 한다. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/** 항상 허용하는 주소 종류: 앱 파일, 개발자 도구, 화면 안에서 만든 데이터 */
const LOCAL_PROTOCOLS = new Set(['file:', 'devtools:', 'data:', 'blob:'])

/** 개발 서버일 때만 허용하는 주소 종류 */
const NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/**
 * 이 주소로 요청해도 되는지 판정한다.
 * @param rawUrl 요청 주소
 * @param devServerUrl 개발 모드의 개발 서버 주소 (배포된 앱에서는 undefined)
 */
export function isAllowedUrl(rawUrl: string, devServerUrl?: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (LOCAL_PROTOCOLS.has(url.protocol)) return true
  if (!NETWORK_PROTOCOLS.has(url.protocol) || !devServerUrl) return false

  let dev: URL
  try {
    dev = new URL(devServerUrl)
  } catch {
    return false
  }
  // 개발 서버는 내 PC(loopback)에 있어야 하고, 호스트·포트가 같아야 한다 (ws:는 화면 자동 새로고침용)
  return isLoopback(dev.hostname) && url.hostname === dev.hostname && url.port === dev.port
}

/** 창 안에서 다른 페이지로 이동해도 되는지: 앱 자신의 화면만 허용 */
export function isAppPageUrl(rawUrl: string, devServerUrl?: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol === 'file:') return true
  return devServerUrl !== undefined && isAllowedUrl(rawUrl, devServerUrl) && url.protocol.startsWith('http')
}
