/** 산출물 일정 직접 고치기 (2026-11-10 사용자 결정): 계획·실적 날짜, 담당. DIA 값은 그대로 두고 고친 값만 따로 저장 */
import { useState, type ReactElement } from 'react'
import type { Deliverable, DiaDateField, IsoDate, Project } from '../../core/model'
import { DIA_DATE_FIELDS } from '../../core/model'
import { clearEdits, EDIT_FIELD_LABEL, ownerOf, sameOwner, setDateEdit, setOwnerEdit } from '../../core/edits'
import type { ScheduleRow } from '../../core/schedule'
import { AlertIcon } from './icons'
import { Modal } from './ui'

export function ScheduleEditDialog({
  project,
  row,
  rowLines,
  onSave,
  onClose
}: {
  project: Project
  row: ScheduleRow
  /** 같은 DIA 행의 줄들 (DIA 값 그대로) — 담당은 함께 바뀜 */
  rowLines: Deliverable[]
  onSave: (p: Project) => void
  onClose: () => void
}): ReactElement {
  const dia = row.dia
  const [dates, setDates] = useState<Record<DiaDateField, IsoDate | ''>>({
    planStart: row.d.planStart ?? '',
    planEnd: row.d.planEnd ?? '',
    realStart: row.d.realStart ?? '',
    realEnd: row.d.realEnd ?? ''
  })
  const [team, setTeam] = useState(row.d.team)
  const [people, setPeople] = useState(row.d.people.join('\n'))
  const name = `${dia.workProduct}${dia.docLabel ? ` [${dia.docLabel}]` : ''}`
  const owner = { team, people: people.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean) }
  const diaOwner = ownerOf(dia)

  const problems = [
    owner.people.length > 0 && !owner.team.trim() && '담당자를 적으려면 팀을 먼저 적어 주세요 (DIA는 담당 칸의 첫 줄을 팀으로 읽습니다)'
  ].filter(Boolean) as string[]
  const warnings = [
    dates.planStart && dates.planEnd && dates.planEnd < dates.planStart && '계획 종료가 계획 시작보다 빠릅니다',
    dates.realStart && dates.realEnd && dates.realEnd < dates.realStart && '실적 종료가 실적 시작보다 빠릅니다'
  ].filter(Boolean) as string[]

  const save = (): void => {
    const now = new Date().toISOString()
    let p = project
    for (const f of DIA_DATE_FIELDS) if (dates[f] !== (row.d[f] ?? '')) p = setDateEdit(p, dia, f, dates[f], now)
    if (!sameOwner(owner, ownerOf(row.d))) p = setOwnerEdit(p, rowLines, owner, now)
    onSave(p)
  }
  const resetAll = (): void => {
    const now = new Date().toISOString()
    onSave(clearEdits(clearEdits(project, [dia.key], now), rowLines.map((l) => l.key), now, ['owner']))
  }

  const diaText = (v: string | undefined): string => (v ? v : '빈칸')
  return (
    <Modal
      title={`일정·담당 고치기 — No.${dia.diaNo}${dia.lineCount > 1 ? `-${dia.line}` : ''} ${name}`}
      onClose={onClose}
      footer={
        <>
          {row.edit && (
            <button type="button" className="btn" onClick={resetAll}>
              모두 DIA 값으로
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="button" className="btn btn-primary" disabled={problems.length > 0} onClick={save}>
            저장
          </button>
        </>
      }
    >
      <p className="muted small">
        DIA 값은 그대로 두고 고친 값만 따로 저장합니다. 고친 칸은 "수정"으로 표시되고, 엑셀 출력의 "DIA 붙여넣기" 시트로 원본 DIA에 옮길 수 있습니다. 상태는 날짜로 다시 계산합니다.
      </p>
      <div className="edit-grid">
        {DIA_DATE_FIELDS.map((f) => (
          <label key={f} className="edit-field">
            <span className="edit-label">{EDIT_FIELD_LABEL[f]}</span>
            <span className="edit-input">
              <input type="date" aria-label={EDIT_FIELD_LABEL[f]} value={dates[f]} onChange={(e) => setDates({ ...dates, [f]: e.target.value })} />
              {dates[f] !== (dia[f] ?? '') && (
                <button type="button" className="link-btn small" onClick={() => setDates({ ...dates, [f]: dia[f] ?? '' })}>
                  DIA 값으로
                </button>
              )}
            </span>
            <span className={`muted small${dates[f] !== (dia[f] ?? '') ? ' edit-was' : ''}`}>DIA: {diaText(dia[f])}</span>
          </label>
        ))}
      </div>
      <div className="edit-owner">
        <label className="edit-field">
          <span className="edit-label">담당 팀</span>
          <input aria-label="담당 팀" value={team} maxLength={60} onChange={(e) => setTeam(e.target.value)} />
        </label>
        <label className="edit-field">
          <span className="edit-label">담당자 (한 줄에 한 명)</span>
          <textarea aria-label="담당자" rows={3} value={people} onChange={(e) => setPeople(e.target.value)} />
        </label>
        <p className="muted small">
          DIA: {diaOwner.team || '담당 미지정'}
          {diaOwner.people.length > 0 && ` · ${diaOwner.people.join(', ')}`}
          {rowLines.length > 1 && ` — 담당은 DIA 한 행의 칸 하나라서 이 행의 ${rowLines.length}줄에 함께 적용됩니다.`}
        </p>
      </div>
      {[...problems, ...warnings].length > 0 && (
        <ul className="problem-list">
          {[...problems, ...warnings].map((p) => (
            <li key={p}>
              <AlertIcon size={12} /> {p}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
