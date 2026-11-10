import { describe, expect, it } from 'vitest'
import { P, fixture } from './helpers'
import { previewDocument, readDocument } from '../src/core/importer'
import { makeRule, type PreviewData } from '../src/core/rules'

const read = (name: string, kind?: Parameters<typeof readDocument>[2], options?: Parameters<typeof readDocument>[3]) => readDocument(name, fixture(name), kind, options)
const now = '2026-05-01T00:00:00.000Z'

const hsrRule = makeRule({
  id: 'r1',
  name: 'HSR 양식 (가짜)',
  docKind: 'HSR',
  format: 'xlsx',
  layout: 'rows',
  sheet: 'HW Requirements',
  roleHeaders: { id: 'HW Req No.', ref: 'Parent TSR', title: 'Requirement', asil: 'ASIL', allocation: 'Allocation', status: 'Status' },
  now
})

describe('처음 보는 양식 (칸 지정, FORMATS §13)', () => {
  it('규칙이 없으면: 파일명에 HSR → HSR, 칸 지정 필요', () => {
    const r = read(`${P}_HSR_R1.xlsx`)
    expect(r).toMatchObject({ ok: true, kind: 'HSR', needsMapping: true })
    expect(r.items).toBeUndefined()
    expect(r.report.notes.join()).toContain('[칸 지정]')
  })

  it('미리보기: 엑셀 시트별 위쪽 행 / 워드 표 목록', () => {
    const x = previewDocument(`${P}_HSR_R1.xlsx`, fixture(`${P}_HSR_R1.xlsx`)) as PreviewData
    expect(x.format).toBe('xlsx')
    expect(x.sheets!.map((s) => s.name)).toEqual(['Cover', 'HW Requirements'])
    expect(x.sheets![1].rows[2].slice(0, 3)).toEqual(['HW Req No.', 'Parent TSR', 'Requirement'])
    const d = previewDocument(`${P}_SW 시험 명세_R0.docx`, fixture(`${P}_SW 시험 명세_R0.docx`)) as PreviewData
    expect(d.format).toBe('docx')
    expect(d.tables!.map((t) => t.rows[0][0])).toEqual(['Document', 'Test Case ID'])
    expect(previewDocument('보안문서_DIA.xlsx', fixture('보안문서_DIA.xlsx'))).toHaveProperty('error')
  })

  it('규칙 만들기: 머리글 글자를 정리해서 저장', () => {
    expect(hsrRule.roles).toEqual({ id: 'hw req no.', ref: 'parent tsr', title: 'requirement', asil: 'asil', allocation: 'allocation', status: 'status' })
  })

  it('칸 지정만으로 읽음 (엑셀 행 목록형): ID·참조·제목·ASIL·할당·상태', () => {
    const r = read(`${P}_HSR_R1.xlsx`, 'HSR', { rules: [hsrRule] })
    expect(r).toMatchObject({ ok: true, kind: 'HSR', meta: { rule: 'r1' } })
    expect(r.items).toHaveLength(15)
    const h2 = r.items!.find((i) => i.rawId === 'HSR-002')!
    expect(h2).toMatchObject({ kind: 'HSR', refs: ['TSR-CTL-SG001-003', 'TSR-CTL-SG001-004'], asil: 'B', allocation: 'HW', status: 'inProgress', location: 'HW Requirements 5행' })
    expect(r.items!.find((i) => i.rawId === 'HSR-006')!.refs).toEqual(['TSR-013'])
    expect(r.items!.find((i) => i.rawId === 'HSR-014')!.refs).toEqual([])
    expect(r.report.notes.join()).toContain("'HSR 양식 (가짜)'")
    expect(r.report.skipped).toEqual([]) // ID 없는 메모 행은 지정한 칸이 모두 비어 있어 조용히 무시
  })

  it('같은 모양의 다른 문서는 다음부터 자동으로 같은 규칙', () => {
    const r = read(`${P}_HSR 보조_R0.xlsx`, undefined, { rules: [hsrRule] })
    expect(r).toMatchObject({ kind: 'HSR', meta: { rule: 'r1' } })
    expect(r.items!.map((i) => i.rawId)).toEqual(['HSR-B-001', 'HSR-B-002', 'HSR-B-003', 'HSR-B-004', 'HSR-B-005'])
  })

  it('모양이 다른 문서에는 규칙을 쓰지 않음', () => {
    const r = read(`${P}_Safety Plan 초안_R2.docx`, undefined, { rules: [hsrRule] })
    expect(r.kind).toBeUndefined()
    const dia = read(`${P}_DIA_R1.xlsx`, undefined, { rules: [hsrRule] })
    expect(dia.kind).toBe('DIA')
  })

  it('워드 키-값형 (표 하나 = 요구사항 하나)', () => {
    const rule = makeRule({ id: 'r2', name: 'HSR 키값', docKind: 'HSR', format: 'docx', layout: 'keyvalue', roleHeaders: { id: 'HW Requirement ID', ref: 'Parent', title: 'Description', asil: 'ASIL' }, now })
    const r = read(`${P}_HSR 키값_R0.docx`, undefined, { rules: [rule] })
    expect(r.kind).toBe('HSR')
    expect(r.items!.map((i) => [i.rawId, i.refs[0], i.asil])).toEqual([
      ['HSR-K-001', 'TSR-CTL-SG001-002', 'B'],
      ['HSR-K-002', 'TSR-CTL-SG001-008', 'B'],
      ['HSR-K-003', 'TSR-CTL-SG002-004', 'A']
    ])
  })

  it('워드 행 목록형 SW 시험 명세: 여러 SSR, 빈 참조', () => {
    const rule = makeRule({ id: 'r3', name: 'SW 시험', docKind: 'SWTEST', format: 'docx', layout: 'rows', roleHeaders: { id: 'Test Case ID', ref: 'Verified Requirement', title: 'Test Title' }, now })
    const r = read(`${P}_SW 시험 명세_R0.docx`, 'SWTEST', { rules: [rule] })
    expect(r.kind).toBe('SWTEST')
    expect(r.items!.every((i) => i.kind === 'SWTEST')).toBe(true)
    expect(r.items!.find((i) => i.title === '여러 SSR을 한 번에 검증')!.refs).toEqual(['FS_SSR-100013', 'FS_SSR-100014'])
    expect(r.items!.find((i) => i.title === '검증 대상이 비어 있는 시험')!.refs).toEqual([])
    expect(r.report.counts['SW 시험']).toBe(r.items!.length)
  })

  it('위 단계 ID 칸을 지정하지 않으면 안내', () => {
    const rule = makeRule({ id: 'r4', name: '참조 없음', docKind: 'HSR', format: 'xlsx', layout: 'rows', roleHeaders: { id: 'HW Req No.', title: 'Requirement' }, now })
    expect(read(`${P}_HSR_R1.xlsx`, 'HSR', { rules: [rule] }).report.notes.join()).toContain('위 단계 ID 칸을 지정하지 않아')
  })
})

describe('칸 이름 동의어 (사용자 추가)', () => {
  it('기본 동의어에 없는 머리글은 FSR로 못 알아봄 → 동의어를 추가하면 읽음', () => {
    expect(read(`${P}_FSR_양식C_R00.xlsx`).kind).toBeUndefined()
    const r = read(`${P}_FSR_양식C_R00.xlsx`, undefined, { synonyms: { fsrId: ['FSR 번호'], fsrText: ['요구사항'] } })
    expect(r.kind).toBe('FSR')
    expect(r.items!.filter((i) => i.kind === 'FSR').map((i) => [i.rawId, i.title])).toEqual([
      ['ZZZCTLSR001', '양식C 가짜 요구 1'],
      ['ZZZCTLSR002', '양식C 가짜 요구 2']
    ])
  })

  it('다음 문서를 읽을 때 이전 동의어가 남지 않음', () => {
    read(`${P}_FSR_양식C_R00.xlsx`, undefined, { synonyms: { fsrId: ['FSR 번호'] } })
    expect(read(`${P}_FSR_양식C_R00.xlsx`).kind).toBeUndefined()
  })
})
