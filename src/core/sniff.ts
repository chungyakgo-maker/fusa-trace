/** 파일 앞부분으로 형식 판별 (FORMATS §1) */

export type FileSniff = 'ZIP' | 'OLE' | 'DRM' | 'UNKNOWN'

/** DRM 파일 앞부분(32바이트 안)에 들어 있는 글자 */
export const DRM_MARKER = 'DocuRay'

export const DRM_MESSAGE = '보안(DRM)이 걸린 파일입니다. 보안 해제 후 다시 넣어 주세요.'
export const UNREADABLE_MESSAGE = '읽을 수 없는 파일입니다. 엑셀(.xlsx, .xls) 또는 워드(.docx) 파일인지 확인해 주세요.'

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

export function sniffFile(bytes: Uint8Array): FileSniff {
  const head = bytes.subarray(0, 32)
  let ascii = ''
  for (const b of head) ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ' '
  if (ascii.includes(DRM_MARKER)) return 'DRM'
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
