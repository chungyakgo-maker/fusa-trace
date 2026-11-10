import { describe, expect, it } from 'vitest'
import { P, demoProject, fixture } from './helpers'
import type { DocKind, ParsedDocument, Project, ReadRule } from '../src/core/model'
import { readDocument } from '../src/core/importer'
import { addDocument, toSourceDoc } from '../src/core/project'
import { makeRule } from '../src/core/rules'
import { computeSystemTrace, pendingCount } from '../src/core/trace'
import { computeSoftwareTrace } from '../src/core/software'
import { computeHardwareTrace } from '../src/core/hardware'
import { buildHardwareMap, buildSoftwareMap } from '../src/core/softwareMap'
import { collectTraceIssues } from '../src/core/issues'

const now = '2026-05-01T00:00:00.000Z'
const hsrRule = makeRule({ id: 'h', name: 'HSR 양식', docKind: 'HSR', format: 'xlsx', layout: 'rows', roleHeaders: { id: 'HW Req No.', ref: 'Parent TSR', title: 'Requirement', asil: 'ASIL', status: 'Status' }, now })
const testRule = makeRule({ id: 't', name: 'SW 시험 양식', docKind: 'SWTEST', format: 'docx', layout: 'rows', roleHeaders: { id: 'Test Case ID', ref: 'Verified Requirement', title: 'Test Title' }, now })
const rules: ReadRule[] = [hsrRule, testRule]

let seq = 0
function add(p: Project, name: string, forced?: DocKind): Project {
  const r = readDocument(name, fixture(name), forced, { rules })
  if (!r.ok || !r.kind) throw new Error(`읽기 실패 ${name}`)
  const parsed: ParsedDocument = { ...r, path: name, hash: `h${seq++}`, size: 1, elapsedMs: 0 }
  return addDocument(p, toSourceDoc(parsed, r.kind, `d${seq}`, now), now)
}

let base = demoProject()
for (const f of [`${P}_FSR_R01.xlsx`, `${P}_기술안전개념서(TSC)_R1.docx`, `${P}_시스템 FMEA_R1.xlsx`, `${P}_SRS_v1.5.docx`]) base = add(base, f)
const withHsr1 = add(base, `${P}_HSR_R1.xlsx`)
const full = add(add(withHsr1, `${P}_HSR 보조_R0.xlsx`), `${P}_SW 시험 명세_R0.docx`)

describe('하드웨어 탭: TSR(H/W) → HSR (칸 지정 문서로 연결 = M5 완료 기준)', () => {
  const hw = computeHardwareTrace(full)
  const t = (id: string, dup = 1) => hw.tsrs.find((x) => x.item.rawId === id && x.item.dupIndex === dup)!

  it('HSR 미등록이면 문서 대기', () => {
    const h0 = computeHardwareTrace(base)
    expect(h0.tsrs.every((x) => x.status === '문서 대기' || x.status === '대상 아님')).toBe(true)
    expect(h0.cards[1].pending).toContain('HSR 미등록')
  })

  it('칸 지정으로 읽은 HSR이 TSR에 연결: 그대로·약식 표기, 여러 TSR', () => {
    expect(t('TSR-CTL-SG001-002')).toMatchObject({ status: '연결됨' })
    expect(t('TSR-CTL-SG001-004').hsrs[0].hsr.rawId).toBe('HSR-002')
    expect(t('TSR-CTL-SG001-013').hsrs[0]).toMatchObject({ method: 'tail' })
    expect(t('TSR-CTL-SG002-003').status).toBe('연결됨') // 두 번째 파일 (같은 규칙 자동)
  })

  it('HSR 없음 = 누락, 중복 TSR = 확인 필요, 미적용 = 대상 아님', () => {
    expect(t('TSR-CTL-SG001-018')).toMatchObject({ status: '누락', reason: 'HSR 없음' })
    expect(t('TSR-CTL-SG002-009').status).toBe('누락')
    expect(t('TSR-CTL-SG001-012', 2).status).toBe('확인 필요')
    expect(t('TSR-CTL-SG001-022').status).toBe('대상 아님')
    expect(hw.tsrs.some((x) => x.item.rawId === 'TSR-CTL-SG001-001')).toBe(false) // S/W 할당
  })

  it('단계 카드: H/W 할당 TSR 23, HSR 연결 17 / 22 (보조 파일 전 12 / 22)', () => {
    expect(hw.cards[0]).toEqual({ label: 'H/W 할당 TSR', count: 23 })
    expect(hw.cards[1]).toEqual({ label: 'HSR 연결', linked: 17, total: 22 })
    expect(computeHardwareTrace(withHsr1).cards[1]).toEqual({ label: 'HSR 연결', linked: 12, total: 22 })
  })

  it('역방향: TSR 연결 없는 HSR, 없는 TSR 참조, 애매한 참조', () => {
    const h = (id: string) => hw.hsrs.find((x) => x.item.rawId === id)!
    expect(h('HSR-014').problems).toEqual(['TSR 연결 없음'])
    expect(h('HSR-013').problems).toEqual(['없는 TSR 참조: TSR-CTL-SG001-099'])
    expect(h('HSR-015').problems[0]).toContain('확인 필요: TSR-003')
    expect(h('HSR-001').problems).toEqual([])
  })

  it('하드웨어 지도: HSR 없음·없는 TSR·TSR 미기재, FMEDA 자리', () => {
    const l = buildHardwareMap(hw, { sg: 'all', expanded: new Set(), expandAll: false })
    expect(l.columns.map((c) => c.label)).toEqual(['TSR (H/W)', 'HSR', 'FMEDA'])
    expect(l.nodes.filter((n) => n.title === 'HSR 없음').length).toBe(3)
    expect(l.nodes.some((n) => n.title === 'TSR-CTL-SG001-099 없음')).toBe(true)
    expect(l.nodes.some((n) => n.title === 'TSR 미기재')).toBe(true)
    expect(l.nodes.find((n) => n.kind === 'placeholder')?.title).toBe('FMEDA')
  })
})

describe('소프트웨어 탭 3단계: SSR → SW 시험 (칸 지정)', () => {
  const sw = computeSoftwareTrace(full)
  const s = (k: number) => sw.ssrs.find((x) => x.item.rawId === `FS_SSR-${100000 + k}`)!

  it('시험 명세가 없으면 문서 대기', () => {
    expect(computeSoftwareTrace(base).ssrs.find((x) => x.item.rawId === 'FS_SSR-100001')?.status).toBe('문서 대기')
  })

  it('안전 관련 SSR의 시험 연결: 그대로·약식·여러 SSR, 시험 없음 = 누락', () => {
    expect(s(1).status).toBe('연결됨')
    expect(s(16).tests[0].method).toBe('tail') // SSR-100016
    expect(s(14).tests[0].test.title).toBe('여러 SSR을 한 번에 검증')
    expect(s(11)).toMatchObject({ status: '누락', reason: 'SW 시험 없음' })
    expect(s(9).status).toBe('대상 아님')
  })

  it('단계 카드: SW 요구사항 시험 29 / 31', () => {
    expect(sw.cards[2]).toEqual({ label: 'SW 요구사항 시험', linked: 29, total: 31 })
  })

  it('역방향: SSR 없는 시험, 없는 SSR 참조', () => {
    const probs = sw.tests.flatMap((x) => x.problems)
    expect(probs).toContain('없는 SSR 참조: FS_SSR-199999')
    expect(probs).toContain('검증 대상(SSR) 없음')
  })

  it('소프트웨어 지도 3열: SW 시험 모음 카드 + SW 시험 없음', () => {
    const l = buildSoftwareMap(sw, { sg: 'all', expanded: new Set(), expandAll: true })
    expect(l.nodes.some((n) => n.kind === 'cluster' && /^SW 시험 \d+건$/.test(n.title))).toBe(true)
    expect(l.nodes.filter((n) => n.title === 'SW 시험 없음')).toHaveLength(2)
    expect(l.nodes.some((n) => n.kind === 'placeholder')).toBe(false)
  })
})

describe('ID 대응표·시트 3에 HSR·SW 시험 포함', () => {
  it('확인할 건수: TSC 1 + FMEA 6 + SRS 4 + HSR 3 + SW 시험 1 = 15', () => {
    const links = [...computeSystemTrace(full).links, ...computeSoftwareTrace(full).links, ...computeHardwareTrace(full).links]
    expect(pendingCount(links)).toBe(15)
  })

  it('별칭은 HSR 문서 종류로 따로 기억', () => {
    const p = { ...full, aliases: [{ sourceKind: 'HSR' as const, ref: 'TSR-003', target: 'TSR-CTL-SG002-003', createdAt: '' }] }
    expect(computeHardwareTrace(p).hsrs.find((x) => x.item.rawId === 'HSR-015')?.refs[0].method).toBe('alias')
  })

  it('시트 3 단계에 TSR → HSR, 역방향: HSR, SSR → SW 시험, 역방향: SW 시험', () => {
    const stages = new Set(collectTraceIssues(computeSystemTrace(full), computeSoftwareTrace(full), computeHardwareTrace(full)).map((i) => i.stage))
    for (const s of ['TSR → HSR', '역방향: HSR', 'SSR → SW 시험', '역방향: SW 시험']) expect(stages.has(s)).toBe(true)
  })
})
