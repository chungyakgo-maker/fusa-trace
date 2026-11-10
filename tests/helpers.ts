import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDocument } from '../src/core/importer'

export const FIXTURES = join(__dirname, 'fixtures', 'generated')
export const P = '[기능안전]_데모'

export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)))
}

export function readFixture(name: string, forced?: Parameters<typeof readDocument>[2]) {
  return readDocument(name, fixture(name), forced)
}

import type { DocKind, ParsedDocument, Project } from '../src/core/model'
import { addDocument, newProject, toSourceDoc } from '../src/core/project'

let seq = 0
/** 가짜 문서를 프로젝트에 넣기 (화면의 [반영]과 같은 동작) */
export function importInto(p: Project, name: string, forced?: DocKind, at = '2026-05-01T09:00:00.000Z'): Project {
  const r = readFixture(name, forced)
  if (!r.ok || !r.kind) throw new Error(`가져오기 실패: ${name} ${r.error ?? '종류 미정'}`)
  const parsed: ParsedDocument = { ...r, path: name, hash: `hash-${name}-${seq}`, size: 1, elapsedMs: 0 }
  seq++
  return addDocument(p, toSourceDoc(parsed, r.kind, `doc${seq}`, at), at)
}

export function demoProject(): Project {
  return newProject('p1', '데모 차종 · CTL', '2026-05-01T00:00:00.000Z')
}
