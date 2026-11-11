/**
 * 내 담당 (2026-11-11 사용자 결정) — 순수 함수
 * - 역할(세이프티 매니저·시스템·SW·HW)에 맞는 구분의 산출물은 자동으로 내 담당
 * - 설정의 내 정보(이름·팀)가 DIA 담당 칸에 있으면 내 담당 (켰을 때만)
 * - ☆로 직접 넣고 뺀 것이 가장 우선 (산출물 키로 기억 → 다음 DIA 버전에도 유지)
 */
import type { Category, Deliverable, MyRole, MyScope, Profile } from './model'
import { MY_ROLES } from './model'

export const ROLE_LABEL: Record<MyRole, string> = { sm: '세이프티 매니저', system: '시스템', sw: 'SW', hw: 'HW' }
/** 역할 → 산출물 구분 (구분은 DIA Part-clause 앞 번호: Part 2·8 관리, Part 3·4 시스템, Part 5 HW, Part 6 SW, 그 외 기타) */
export const ROLE_CATEGORIES: Record<MyRole, readonly Category[]> = { sm: ['관리', '기타'], system: ['시스템'], sw: ['SW'], hw: ['HW'] }
export const ROLE_PARTS: Record<MyRole, string> = { sm: 'Part 2·8 (관리) + 그 외 Part (기타)', system: 'Part 3·4', sw: 'Part 6', hw: 'Part 5' }
export const ROLE_EXAMPLES: Record<MyRole, string> = {
  sm: 'Safety plan, Safety case, 확인 조치, 산출물 검증',
  system: 'Item definition, TSC, 시스템 FMEA·DFA, HSI',
  sw: 'SRS, SW 설계, SW 시험 명세',
  hw: 'HSR, HW 설계, FMEDA'
}

export type MineReason =
  | { kind: 'role'; role: MyRole }
  | { kind: 'name' }
  | { kind: 'team' }
  | { kind: 'include' }
  | { kind: 'exclude' }

export const EMPTY_SCOPE: MyScope = { roles: [], include: [], exclude: [] }

const norm = (s: string): string => s.replace(/\s+/g, '').toLowerCase()

/** 역할·이름·팀으로 자동 판단 (직접 고른 것 빼고) */
export function autoReason(d: Pick<Deliverable, 'category' | 'team' | 'people'>, scope: MyScope, profile?: Profile): MineReason | undefined {
  const role = MY_ROLES.find((r) => scope.roles.includes(r) && ROLE_CATEGORIES[r].includes(d.category))
  if (role) return { kind: 'role', role }
  const name = norm(profile?.name ?? '')
  if (scope.matchName && name && [d.team, ...d.people].some((x) => norm(x).includes(name))) return { kind: 'name' }
  const team = norm(profile?.team ?? '')
  if (scope.matchTeam && team && norm(d.team) === team) return { kind: 'team' }
  return undefined
}

/** 내 담당인지와 그 이유. 직접 뺀 것 → 직접 넣은 것 → 자동 순 */
export function mineOf(d: Pick<Deliverable, 'key' | 'category' | 'team' | 'people'>, scope: MyScope | undefined, profile?: Profile): { mine: boolean; reason?: MineReason } {
  if (!scope) return { mine: false }
  if (scope.exclude.includes(d.key)) return { mine: false, reason: { kind: 'exclude' } }
  if (scope.include.includes(d.key)) return { mine: true, reason: { kind: 'include' } }
  const auto = autoReason(d, scope, profile)
  return auto ? { mine: true, reason: auto } : { mine: false }
}

export function reasonText(r: MineReason | undefined): string {
  if (!r) return ''
  switch (r.kind) {
    case 'role':
      return `자동 · ${ROLE_LABEL[r.role]}`
    case 'name':
      return '자동 · 내 이름'
    case 'team':
      return '자동 · 내 팀'
    case 'include':
      return '직접 넣음'
    case 'exclude':
      return '직접 뺌'
  }
}

/** ☆ 누르기: 내 담당이면 빼고, 아니면 넣음. 자동과 같아지는 직접 선택은 남기지 않음 */
export function toggleMine(scope: MyScope | undefined, d: Pick<Deliverable, 'key' | 'category' | 'team' | 'people'>, profile?: Profile): MyScope {
  const s = scope ?? EMPTY_SCOPE
  const wasMine = mineOf(d, s, profile).mine
  const include = s.include.filter((k) => k !== d.key)
  const exclude = s.exclude.filter((k) => k !== d.key)
  const auto = Boolean(autoReason(d, s, profile))
  if (wasMine && auto) exclude.push(d.key)
  if (!wasMine && !auto) include.push(d.key)
  return { ...s, include, exclude }
}

/** 내 담당 기준이 하나라도 있는지 (없으면 [내 담당]을 누를 때 역할 고르기 창) */
export function hasScope(scope: MyScope | undefined, profile?: Profile): boolean {
  if (!scope) return false
  return scope.roles.length > 0 || scope.include.length > 0 || Boolean(scope.matchName && profile?.name.trim()) || Boolean(scope.matchTeam && profile?.team.trim())
}

/** 화면·출력 제목용: "시스템 + SW + 직접 고른 것" */
export function scopeText(scope: MyScope | undefined, profile?: Profile): string {
  if (!scope) return ''
  const parts = MY_ROLES.filter((r) => scope.roles.includes(r)).map((r) => ROLE_LABEL[r])
  if (scope.matchName && profile?.name.trim()) parts.push(`이름 '${profile.name.trim()}'`)
  if (scope.matchTeam && profile?.team.trim()) parts.push(`팀 '${profile.team.trim()}'`)
  if (scope.include.length + scope.exclude.length > 0) parts.push('직접 고른 것')
  return parts.join(' + ')
}
