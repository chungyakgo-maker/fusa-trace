/** 엑셀 칸 주소 도우미 */

/** 열 번호(0부터) → 엑셀 열 글자 (0 → A, 25 → Z, 26 → AA) */
export function colLetter(col: number): string {
  let n = col + 1
  let out = ''
  while (n > 0) {
    const m = (n - 1) % 26
    out = String.fromCharCode(65 + m) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

/** 이어진 행 번호들을 묶음으로: [3,4,5,9] → [[3,5],[9,9]] */
export function rowRuns(rows: number[]): [number, number][] {
  const sorted = [...new Set(rows)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r === last[1] + 1) last[1] = r
    else out.push([r, r])
  }
  return out
}
