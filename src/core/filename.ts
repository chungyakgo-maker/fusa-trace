/** 파일명 정규화와 문서 토큰 (FORMATS §6.4, §8, §12) — 순수 함수 */
import { isVerificationReportName } from './sniff'

/** 알려진 문서 토큰 */
export const KNOWN_DOC_TOKENS = [
  'TSC', 'FSC', 'FMEA', 'FTA', 'DFA', 'HSI', 'HSR', 'HSD', 'FMEDA', 'SSR', 'SRS', 'TSR', 'FSR', 'HARA', 'DIA', 'SAS', 'SDD'
] as const

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

export function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '')
}

const VERSION_RE = /(^|[\s_\-[\]()])(?:rev|ver|r|v)\.?\s?\d+(?:\.\d+)*(?=$|[\s_\-[\]().])/gi
const DROP_TOKENS = new Set(['eng', 'kor', 'draft', 'final', 'copy', '복사본'])

/**
 * 비교용 파일명 토큰: 경로·확장자 제거 → NFC → 소문자 → 구분자(`_` `-` `.` 공백 `[` `]` `(` `)`)로 나눔.
 * 버전(r1, r00, r2.0, v1.5, rev00), 4~8자리 숫자(날짜·일련), 언어(eng, kor), draft, final, 복사본 표시 (1)은 버림.
 */
export function fileNameTokens(fileName: string): string[] {
  let s = stripExtension(baseName(fileName)).normalize('NFC').toLowerCase()
  s = s.replace(/\s*\(\d{1,2}\)\s*$/, '') // 복사본 표시 "(1)"
  s = s.replace(VERSION_RE, '$1 ')
  return s
    .split(/[\s_\-.[\]()]+/)
    .filter((t) => t.length > 0)
    .filter((t) => !/^\d{4,8}$/.test(t))
    .filter((t) => !/^(?:rev|ver|r|v)\d+$/.test(t))
    .filter((t) => !DROP_TOKENS.has(t))
}

/** 정규화 파일명 (토큰을 공백으로 이은 것). 같으면 같은 문서 (버전·날짜 표기 무시) */
export function normalizeFileName(fileName: string): string {
  return fileNameTokens(fileName).join(' ')
}

/** 토큰 겹침 비율 (자카드) */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 && sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  return inter / (sa.size + sb.size - inter)
}

/** 파일명에서 버전 표기 찾기 (예: R1, R00, v1.5) — 문서 안에 버전이 없을 때 표시용 */
export function versionFromFileName(fileName: string): string {
  const s = stripExtension(baseName(fileName))
  const m = /(?:^|[\s_\-[\]()])((?:rev|ver|r|v)\.?\s?\d+(?:\.\d+)*)(?=$|[\s_\-[\]().])/i.exec(s)
  return m ? m[1].replace(/\s/g, '').toUpperCase() : ''
}

/**
 * 문서 토큰: 괄호 안 글자(예: `(TSC)`), 알려진 토큰(TSC, FMEA …), Verification Report면 `VR`. 대문자.
 * 예: `…(TSC) Verification Report_R1.xls` → ['TSC', 'VR']
 */
export function docTokens(fileName: string): string[] {
  const name = stripExtension(baseName(fileName)).normalize('NFKC')
  const out: string[] = []
  const add = (t: string): void => {
    const u = t.trim().toUpperCase()
    if (u && !out.includes(u)) out.push(u)
  }
  for (const m of name.matchAll(/\(([^()]{1,24})\)/g)) {
    const inner = m[1].trim()
    if (/^[A-Za-z][A-Za-z0-9 ]*$/.test(inner)) add(inner)
  }
  const upperWords = name.toUpperCase().split(/[^A-Z0-9]+/)
  for (const t of KNOWN_DOC_TOKENS) if (upperWords.includes(t)) add(t)
  if (isVerificationReportName(name)) add('VR')
  return out
}

/** 날짜 줄 라벨의 토큰: `TSC VR` → ['TSC', 'VR'], `FTA ` → ['FTA'] */
export function labelTokens(label: string): string[] {
  return label
    .normalize('NFKC')
    .toUpperCase()
    .split(/[\s/,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** 화면 표시용 문서 라벨: 알려진 토큰 순서 + VR은 맨 뒤 */
export function labelFromTokens(tokens: readonly string[]): string {
  const vr = tokens.includes('VR')
  const rest = tokens.filter((t) => t !== 'VR')
  return [...rest, ...(vr ? ['VR'] : [])].join(' ')
}
