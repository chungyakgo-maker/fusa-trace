/**
 * 앱 전체 설정 파일: %APPDATA%/FuSaTrace/app-config.json (프로젝트와 별개, 이 PC에만)
 * - autoCheckUpdates: 앱을 켤 때 업데이트 자동 확인
 * - profile: 내 정보 (팀·이름·직급) — 내 담당 찾기에 씀. 저장소·외부로 보내지 않음
 * - drmMarkers: DRM 파일 표식 — 파일 앞부분에 이 글자가 있으면 "DRM으로 잠긴 파일"로 안내. 코드에 두지 않고 사용자가 입력
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Profile } from '../core/model'

export interface AppConfig {
  autoCheckUpdates?: boolean
  profile?: Profile
  drmMarkers?: string[]
}

const file = (dataDir: string): string => join(dataDir, 'app-config.json')

export function readAppConfig(dataDir: string): AppConfig {
  try {
    const v = JSON.parse(readFileSync(file(dataDir), 'utf-8')) as unknown
    return v && typeof v === 'object' ? (v as AppConfig) : {}
  } catch {
    return {}
  }
}

/** 바꾼 키만 덮어 씀 (임시 파일 → 이름 바꾸기) */
export function writeAppConfig(dataDir: string, patch: Partial<AppConfig>): AppConfig {
  const next = { ...readAppConfig(dataDir), ...patch }
  const tmp = `${file(dataDir)}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8')
  renameSync(tmp, file(dataDir))
  return next
}

const clip = (v: unknown, n: number): string => String(v ?? '').trim().slice(0, n)

export function readProfile(dataDir: string): Profile {
  const p = readAppConfig(dataDir).profile
  return { team: clip(p?.team, 60), name: clip(p?.name, 40), title: clip(p?.title, 20) }
}

export function saveProfile(dataDir: string, p: Partial<Profile>): Profile {
  const profile = { team: clip(p.team, 60), name: clip(p.name, 40), title: clip(p.title, 20) }
  writeAppConfig(dataDir, { profile })
  return profile
}

/** DRM 표식: 최대 10개, 각 64자, 빈칸·중복 제거. 파일 앞 32바이트(영문)와 비교하므로 영문·숫자·기호만 의미가 있음 */
export function cleanDrmMarkers(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]/) : []
  const out: string[] = []
  for (const x of list) {
    const m = clip(x, 64)
    if (m && !out.includes(m)) out.push(m)
  }
  return out.slice(0, 10)
}

export function readDrmMarkers(dataDir: string): string[] {
  return cleanDrmMarkers(readAppConfig(dataDir).drmMarkers)
}

export function saveDrmMarkers(dataDir: string, v: unknown): string[] {
  const drmMarkers = cleanDrmMarkers(v)
  writeAppConfig(dataDir, { drmMarkers })
  return drmMarkers
}
