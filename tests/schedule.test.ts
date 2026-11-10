import { describe, expect, it } from 'vitest'
import { P, demoProject, importInto } from './helpers'
import { computeDocLinks, computeSchedule, ddayText, ownerOptions, rowMatchesOwner, summarize, summarizeByOwner } from '../src/core/schedule'
import { activeDeliverables, diffDeliverables, removeDocument } from '../src/core/project'

const TODAY = '2026-05-15'
const base = importInto(demoProject(), `${P}_DIA_R1.xlsx`)
const rowOf = (rows: ReturnType<typeof computeSchedule>, no: number, line = 1) => rows.find((r) => r.d.diaNo === no && r.d.line === line)!

describe('산출물 상태 (SPEC §8, 오늘 기준일)', () => {
  const rows = computeSchedule(base, TODAY)

  it('완료: 실적 종료일이 있음', () => expect(rowOf(rows, 1).status).toBe('완료'))
  it('지연: 계획 종료 < 오늘, 실적 종료 없음', () => {
    expect(rowOf(rows, 5).status).toBe('지연')
    expect(rowOf(rows, 14).status).toBe('지연')
  })
  it('진행: 계획 시작 ≤ 오늘 (종료일 = 오늘은 아직 지연 아님)', () => expect(rowOf(rows, 5, 2).status).toBe('진행'))
  it('미착수: 그 외', () => {
    expect(rowOf(rows, 2).status).toBe('미착수')
    expect(rowOf(rows, 4).status).toBe('미착수')
  })
  it('일정 미기재: 계획 일정이 비어 있음 (상태와 별개)', () => {
    expect(rowOf(rows, 10)).toMatchObject({ status: '미착수', noPlan: true })
    expect(rowOf(rows, 7).noPlan).toBe(true) // 계획 종료 형식 오류
  })
  it('D-day', () => {
    expect(ddayText(rowOf(rows, 5, 2))).toBe('D-day')
    expect(ddayText(rowOf(rows, 6))).toBe('D+5')
    expect(ddayText(rowOf(rows, 4))).toBe('D-46')
    expect(ddayText(rowOf(rows, 1))).toBe('완료')
  })
  it('요약', () => {
    // 손으로 셈: 완료 1(No.1) · 지연 5(5-1, 6-1, 8, 11, 14) · 진행 5(5-2, 6-2, 7-1, 7-2, 13) · 미착수 11 · 미기재 5(6-3, 7-1, 10-1, 10-2, 15)
    expect(summarize(rows)).toEqual({ total: 22, done: 1, inProgress: 5, delayed: 5, notStarted: 11, noPlan: 5 })
  })
  it('기준일을 바꾸면 상태가 바뀜', () => {
    const later = computeSchedule({ ...base, settings: { ...base.settings, todayOverride: '2026-12-31' } }, '2026-12-31')
    expect(rowOf(later, 2).status).toBe('지연')
  })
})

describe('VR 작성 여부', () => {
  it('처음엔 X, 짝 VR 줄이 없으면 해당 없음', () => {
    const rows = computeSchedule(base, TODAY)
    expect(rowOf(rows, 5).vr).toBe('X') // TSC → TSC VR 줄
    expect(rowOf(rows, 5, 2).vr).toBe('X') // TSC VR 줄 자체
    expect(rowOf(rows, 6, 3).vr).toBe('해당 없음') // FTA: FTA VR 줄 없음
    expect(rowOf(rows, 12).vr).toBe('해당 없음')
  })

  it('DIA의 VR 파일명과 같은 파일이 등록되면 O (원본 줄에도 표시)', () => {
    const p = importInto(base, `${P}_(TSC) Verification Report_R1.xls`)
    const rows = computeSchedule(p, TODAY)
    expect(rowOf(rows, 5, 2)).toMatchObject({ vr: 'O', vrManual: false })
    expect(rowOf(rows, 5).vr).toBe('O')
    expect(rowOf(rows, 5, 2).doc?.kind).toBe('VR')
    expect(rowOf(rows, 6, 4).vr).toBe('X')
  })

  it('파일명에 Verification Report + 문서 라벨이 있으면 O (DIA 파일명과 달라도)', () => {
    const p = importInto(base, `${P}_(FMEA) Verification Report_R1.xls`)
    // 이름이 DIA와 같아서 연결도 됨. 연결을 끊어도 라벨로 O
    const unlinked = { ...p, docLinks: [{ normName: p.docs[1].normName, deliverableKey: '' }] }
    const rows = computeSchedule(unlinked, TODAY)
    expect(rowOf(rows, 6, 4).vr).toBe('O')
    expect(rowOf(rows, 6).vr).toBe('O')
  })

  it('수동 O/X가 자동보다 우선, 변경 표시', () => {
    const vrKey = rowOf(computeSchedule(base, TODAY), 5, 2).d.key
    const p = { ...base, vrOverrides: { [vrKey]: true } }
    const rows = computeSchedule(p, TODAY)
    expect(rowOf(rows, 5)).toMatchObject({ vr: 'O', vrManual: true, vrKey })
  })
})

describe('문서 ↔ DIA 산출물 연결 (FORMATS §8)', () => {
  it('정규화 파일명이 같으면 자동 연결 → 등록되면 진행', () => {
    const p = importInto(base, `${P}_(TSC) Verification Report_R1.xls`)
    const link = computeDocLinks(p)[0]
    expect(link).toMatchObject({ method: 'auto', kindMismatch: false })
    expect(link.deliverableKey).toBe(rowOf(computeSchedule(p, TODAY), 5, 2).d.key)
  })

  it('비슷한 이름이면 후보만 (자카드 0.8 이상), 사람이 고르면 기억', () => {
    const p = importInto(base, `${P}_Safety Plan 초안_R2.docx`, 'OTHER')
    const link = computeDocLinks(p)[0]
    expect(link.method).toBe('none')
    const key = rowOf(computeSchedule(p, TODAY), 1).d.key
    expect(link.candidates[0].key).toBe(key)
    const chosen = { ...p, docLinks: [{ normName: link.doc.normName, deliverableKey: key }] }
    expect(computeDocLinks(chosen)[0]).toMatchObject({ method: 'manual', deliverableKey: key })
    expect(rowOf(computeSchedule(chosen, TODAY), 1).doc?.fileName).toContain('초안')
  })

  it('파일 종류와 산출물이 안 맞으면 확인 필요', () => {
    const p = importInto(base, `${P}_(TSC) Verification Report_R1.xls`)
    const wrong = { ...p, docLinks: [{ normName: p.docs[1].normName, deliverableKey: rowOf(computeSchedule(p, TODAY), 1).d.key }] }
    expect(computeDocLinks(wrong)[0].kindMismatch).toBe(true)
  })
})

describe('DIA 새 버전', () => {
  const p2 = importInto(base, `${P}_DIA_R2.xlsx`, undefined, '2026-05-10T09:00:00.000Z')

  it('최신만 활성, 이전 버전은 보관', () => {
    expect(p2.docs.filter((d) => d.kind === 'DIA').map((d) => d.active)).toEqual([false, true])
    expect(activeDeliverables(p2).some((d) => d.diaNo === 16)).toBe(true)
  })

  it('추가·삭제·변경 비교', () => {
    const diff = diffDeliverables(activeDeliverables(base), activeDeliverables(p2))
    expect(diff.added.map((a) => a.label)).toEqual(['No.16 Field monitoring plan'])
    expect(diff.removed.map((a) => a.label)).toEqual(['No.14 Safety management report'])
    expect(diff.changed).toEqual([expect.objectContaining({ label: 'No.4 Item definition', fields: ['계획 종료'] })])
  })

  it('새 버전을 지우면 이전 버전이 다시 활성', () => {
    const back = removeDocument(p2, p2.docs[1].id, '2026-05-11T00:00:00.000Z')
    expect(back.docs.map((d) => d.active)).toEqual([true])
  })

  it('VR 수동값은 산출물 키 기준이라 새 버전에서도 유지', () => {
    const vrKey = rowOf(computeSchedule(base, TODAY), 5, 2).d.key
    const rows = computeSchedule({ ...p2, vrOverrides: { [vrKey]: true } }, TODAY)
    expect(rowOf(rows, 5, 2)).toMatchObject({ vr: 'O', vrManual: true })
  })
})

describe('담당자별', () => {
  const rows = computeSchedule(base, TODAY)
  it('모든 담당자를 따로 셈, 지연 많은 순', () => {
    const s = summarizeByOwner(rows)
    expect(s[0].delayed).toBeGreaterThanOrEqual(s[s.length - 1].delayed)
    expect(s.find((o) => o.person === '박민수 선임')).toMatchObject({ team: '시스템팀', total: 4 })
    expect(s.find((o) => o.person === '담당 미지정')).toMatchObject({ total: 1, delayed: 1 })
  })
  it('필터: 팀·사람·담당 미지정', () => {
    expect(ownerOptions(rows)).toContain('담당 미지정')
    expect(rows.filter((r) => rowMatchesOwner(r, '담당 미지정')).map((r) => r.d.diaNo)).toEqual([8])
    expect(rows.filter((r) => rowMatchesOwner(r, '이영희 책임')).length).toBe(7) // No.5 두 줄 + No.6 다섯 줄
  })
})
