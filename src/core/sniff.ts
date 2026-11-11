/** 파일 앞부분으로 형식 판별 (FORMATS §1) */

export type FileSniff = 'ZIP' | 'OLE' | 'DRM' | 'UNKNOWN'

/**
 * DRM 파일 표식: 회사 DRM 파일 앞부분(32바이트 안)에 들어 있는 글자.
 * 회사 제품을 알 수 있는 글자라 코드에 넣지 않고, 설정(이 PC의 앱 설정)에서 입력받아 넘겨받는다
 */

export const DRM_MESSAGE = '보안(DRM)이 걸린 파일입니다. 보안 해제 후 다시 넣어 주세요.'
export const UNREADABLE_MESSAGE =
  '읽을 수 없는 파일입니다. 엑셀(.xlsx, .xls) 또는 워드(.docx) 파일인지 확인해 주세요. 보안(DRM)이 걸린 파일이면 설정 → 문서 읽기의 "DRM 파일 표식"을 적어 두면 그렇게 알려 줍니다.'

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

export function sniffFile(bytes: Uint8Array, drmMarkers: readonly string[] = []): FileSniff {
  const head = bytes.subarray(0, 32)
  let ascii = ''
  for (const b of head) ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ' '
  if (drmMarkers.some((m) => m.trim() && ascii.includes(m.trim()))) return 'DRM'
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return 'ZIP'
  if (bytes.length >= 8 && OLE_MAGIC.every((b, i) => bytes[i] === b)) return 'OLE'
  return 'UNKNOWN'
}

/** 파일명에 Verification Report가 있는지 (FORMATS §12) — 이런 파일은 내용을 열지 않는다 */
export function isVerificationReportName(fileName: string): boolean {
  return /verification[\s_-]*report/i.test(fileName)
}

export function fileExtension(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName)
  return m ? m[1].toLowerCase() : ''
}
