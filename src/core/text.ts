/** 글자 정리 도구 (FORMATS §3.1, §3.3) — 화면·작업 스레드 어디서나 쓰는 순수 함수 */

/** 전각 → 반각, 호환 문자 정리 */
export function toHalfWidth(s: string): string {
  return s.normalize('NFKC')
}

/**
 * 헤더 비교용 정리: 줄바꿈·연속 공백 → 공백 1개, 앞뒤 공백 제거, 전각 → 반각, 소문자.
 * 예: `FTTI/EOTI\n[ms]` → `ftti/eoti [ms]`, `TSR  ID` → `tsr id`
 */
export function normHeader(value: unknown): string {
  if (value === null || value === undefined) return ''
  return toHalfWidth(String(value)).replace(/\s+/g, ' ').trim().toLowerCase()
}

/** 셀 안 줄바꿈으로 나눈 줄 (앞뒤 공백 제거, 빈 줄 제외) */
export function splitLines(value: string): string[] {
  return value
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

const EMPTY_PATTERNS = [/^-+$/, /^—+$/, /^–+$/, /^n\/a$/i, /^t\.?b\.?d\.?$/i, /^yyyy[.\-/]mm[.\-/]dd$/i]
const TBD_PATTERNS = [/^t\.?b\.?d\.?$/i, /^\(?정의\s*필요\)?$/]

/** 빈 값으로 보는 글자인지: 빈칸, `-`, `—`, `N/A`, `T.B.D.`, `TBD`, `YYYY.MM.DD` */
export function isBlankValue(value: string | undefined | null): boolean {
  if (value === undefined || value === null) return true
  const t = toHalfWidth(value).trim()
  if (t === '') return true
  return EMPTY_PATTERNS.some((p) => p.test(t))
}

/** "미정"으로 경고할 값인지: `T.B.D.`, `TBD`, `(정의필요)` */
export function isTbd(value: string | undefined | null): boolean {
  if (!value) return false
  const t = toHalfWidth(value).trim()
  return TBD_PATTERNS.some((p) => p.test(t))
}

/** `N/A`인지 (상태값에서는 "대상 아님"으로 따로 처리) */
export function isNA(value: string | undefined | null): boolean {
  if (!value) return false
  return /^n\/?a$/i.test(toHalfWidth(value).trim())
}

/** 빈 값이면 '' 아니면 앞뒤 공백만 제거한 원문 */
export function cleanValue(value: string | undefined | null): string {
  if (isBlankValue(value)) return ''
  return (value ?? '').trim()
}

/** 화면 표시용 짧은 글: 줄바꿈을 공백으로, 길면 자름 */
export function shortText(value: string, max = 80): string {
  const t = value.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
