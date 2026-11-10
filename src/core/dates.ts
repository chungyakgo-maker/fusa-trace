/** 날짜 읽기 (FORMATS §6.5) */
import type { IsoDate } from './model'
import { toHalfWidth } from './text'

export type DateParse = { kind: 'date'; date: IsoDate } | { kind: 'none' } | { kind: 'invalid'; raw: string }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function validYmd(y: number, m: number, d: number): IsoDate | undefined {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return undefined
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > days) return undefined
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * 글자 날짜: `2026-04-27`, `2026-6-05`(한 자리 월), `2026.06.05`, `2026/06/05` 인정.
 * `N/A`, 빈칸, `YYYY.MM.DD`, `-` → 없음. `2026-06-`(일 없음) 등 → 해석 불가.
 */
export function parseDateText(raw: string): DateParse {
  const t = toHalfWidth(raw).trim().replace(/\.$/, '')
  if (t === '' || /^(n\/a|-+|—+|yyyy[.\-/]mm[.\-/]dd|tbd|t\.b\.d)$/i.test(t)) return { kind: 'none' }
  const m = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/.exec(t)
  if (m) {
    const iso = validYmd(Number(m[1]), Number(m[2]), Number(m[3]))
    if (iso) return { kind: 'date', date: iso }
  }
  return { kind: 'invalid', raw: raw.trim() }
}

/** 엑셀 날짜 일련번호 → 'YYYY-MM-DD' (시간대 영향 없이 계산) */
export function excelSerialToIso(serial: number, date1904 = false): IsoDate | undefined {
  if (!Number.isFinite(serial) || serial <= 0) return undefined
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)
  const d = new Date(base + Math.floor(serial) * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 'YYYY-MM-DD' 두 날짜 사이 일수 (b - a) */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const pa = a.split('-').map(Number)
  const pb = b.split('-').map(Number)
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86_400_000)
}

export function addDays(a: IsoDate, n: number): IsoDate {
  const p = a.split('-').map(Number)
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2]) + n * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** 내 PC의 오늘 날짜 */
export function localToday(now = new Date()): IsoDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' (파일명용) */
export function compactDate(d: IsoDate): string {
  return d.replace(/-/g, '')
}
