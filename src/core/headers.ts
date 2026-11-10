/** 헤더 칸 찾기 도우미 (FORMATS §3.1, §3.4) */
import type { Grid } from './xlsx'
import { normHeader } from './text'

export interface CellPos {
  r: number
  c: number
}

/** 기본 동의어 사전 (FORMATS §3.4). 모두 normHeader로 정리한 형태 */
export const SYNONYMS = {
  fsrId: ['id_fsr', 'fsr id', '식별번호', 'fsr id/식별번호'],
  fsrText: ['내용', 'fsr'],
  safeState: ['id_safestate', 'ss_id', 'safe state', 'safety state'],
  ftti: ['ftti/eoti [ms]', 'ftti', 'ftti / fthi', '감지/응답시간', 'frti'],
  acceptance: ['acceptance criteria', '허용기준'],
  element: ['element', 'name of functional block'],
  sm: ['safety mechanism', 'sm'],
  srsText: ['detailed requirements', 'requirement description'],
  srsHigher: ['higher-level requirement', 'higher-level requirements'],
  fmeaTsr: ['tsr id']
} as const

export function matchesAny(value: string, synonyms: readonly string[]): boolean {
  const n = normHeader(value)
  return synonyms.includes(n)
}

/** 범위 안에서 조건에 맞는 칸들 */
export function findCells(grid: Grid, fromRow: number, toRow: number, test: (norm: string) => boolean): CellPos[] {
  const out: CellPos[] = []
  const last = Math.min(toRow, grid.maxRow)
  for (let r = Math.max(0, fromRow); r <= last; r++) {
    for (const c of grid.colsOf(r)) {
      if (test(normHeader(grid.text(r, c)))) out.push({ r, c })
    }
  }
  return out
}

/** 한 행에서 조건에 맞는 첫 칸의 열 */
export function findInRow(grid: Grid, r: number, test: (norm: string) => boolean): number | undefined {
  for (const c of grid.colsOf(r)) if (test(normHeader(grid.text(r, c)))) return c
  return undefined
}

/** 시트 위쪽에서 헤더 글자가 있는지 */
export function sheetHasHeader(grid: Grid, test: (norm: string) => boolean, maxRows = 60): boolean {
  return findCells(grid, 0, maxRows, test).length > 0
}
