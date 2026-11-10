/**
 * 참조 해석 (SPEC §7, FORMATS §7.3): 별칭 → 그대로 일치 → 정규화 일치 → 끝 번호 일치
 * - 끝 번호: 같은 종류 토큰(TSR/FSR/SSR/HSR)끼리, 마지막 숫자 덩어리가 같고, SG 번호가 양쪽에 있으면 SG도 같아야 함
 * - `FSR.001.009`처럼 점으로 된 형식은 끝 번호 비교를 하지 않음 (전체 정규화 비교만)
 * - 대상 ID가 정의 문서에서 중복이면 = 확인 필요
 */
import type { Alias, DocKind, TraceItem } from './model'
import { itemKey } from './project'
import { normalizeId, sgNumber } from './ids'

export type ResolveMethod = 'alias' | 'exact' | 'normalized' | 'tail' | 'ambiguous' | 'missing'

export const METHOD_LABEL: Record<ResolveMethod, string> = {
  alias: '별칭 (직접 고름)',
  exact: '그대로 일치',
  normalized: '표기 차이 정리 후 일치',
  tail: '약식 표기 (끝 번호)',
  ambiguous: '확인 필요 (후보 여러 개)',
  missing: '없는 ID'
}

export interface Resolution {
  /** 적힌 참조 (뽑아낸 조각) */
  ref: string
  norm: string
  method: ResolveMethod
  /** 연결된 대상 (ambiguous면 후보들) */
  targets: TraceItem[]
  /** ambiguous 이유 */
  reason?: string
}

export function isResolved(r: Resolution): boolean {
  return r.method === 'alias' || r.method === 'exact' || r.method === 'normalized' || r.method === 'tail'
}

const KIND_TOKEN = /(TSR|FSR|SSR|HSR)/

function lastNumber(norm: string): number | undefined {
  const m = /(\d+)(?!.*\d)/.exec(norm)
  return m ? Number(m[1]) : undefined
}

function isDotted(norm: string): boolean {
  return /^[A-Z]+\.\d+(\.\d+)+$/.test(norm)
}

export class Resolver {
  private readonly byNorm = new Map<string, TraceItem[]>()
  private readonly byKey = new Map<string, TraceItem>()

  constructor(
    private readonly defs: TraceItem[],
    private readonly aliases: Alias[],
    private readonly sourceKind: DocKind
  ) {
    for (const d of defs) {
      const list = this.byNorm.get(d.normId) ?? []
      list.push(d)
      this.byNorm.set(d.normId, list)
      this.byKey.set(itemKey(d), d)
    }
  }

  private fromList(list: TraceItem[], method: ResolveMethod, ref: string, norm: string): Resolution {
    if (list.length > 1) return { ref, norm, method: 'ambiguous', targets: list, reason: `대상 ID가 정의 문서에 ${list.length}번 나옴 (ID 중복)` }
    return { ref, norm, method, targets: list }
  }

  resolve(ref: string): Resolution {
    const norm = normalizeId(ref)
    // 1) 별칭
    const alias = this.aliases.find((a) => a.sourceKind === this.sourceKind && a.ref === norm)
    if (alias) {
      const target = this.byKey.get(alias.target)
      if (target) return { ref, norm, method: 'alias', targets: [target] }
    }
    // 2) 그대로 일치
    const exact = this.defs.filter((d) => d.rawId.trim() === ref.trim())
    if (exact.length > 0) return this.fromList(exact, 'exact', ref, norm)
    // 3) 정규화 일치
    const normalized = this.byNorm.get(norm)
    if (normalized && normalized.length > 0) return this.fromList(normalized, 'normalized', ref, norm)
    // 4) 끝 번호 일치
    if (isDotted(norm)) return { ref, norm, method: 'missing', targets: [] }
    const kind = KIND_TOKEN.exec(norm)?.[1]
    const tail = lastNumber(norm)
    if (!kind || tail === undefined) return { ref, norm, method: 'missing', targets: [] }
    const sg = sgNumber(norm)
    const candidates = this.defs.filter((d) => {
      if (!d.normId.includes(kind) || lastNumber(d.normId) !== tail) return false
      const dsg = sgNumber(d.normId)
      return sg === undefined || dsg === undefined || sg === dsg
    })
    if (candidates.length === 0) return { ref, norm, method: 'missing', targets: [] }
    const ids = new Set(candidates.map((c) => c.normId))
    if (candidates.length === 1) return { ref, norm, method: 'tail', targets: candidates }
    return {
      ref,
      norm,
      method: 'ambiguous',
      targets: candidates,
      reason: ids.size === 1 ? `끝 번호가 같은 대상이 ID 중복 (${candidates.length}개)` : `끝 번호가 같은 후보 ${ids.size}개`
    }
  }
}
