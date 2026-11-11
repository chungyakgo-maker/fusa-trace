/** 처음 [내 담당]을 누를 때: 내 역할 고르기 (+ DIA 담당 칸에서 내 이름 찾기) */
import { useState, type ReactElement } from 'react'
import type { Deliverable, MyRole, MyScope, Profile } from '../../core/model'
import { MY_ROLES } from '../../core/model'
import { EMPTY_SCOPE, mineOf, ROLE_EXAMPLES, ROLE_LABEL, ROLE_PARTS } from '../../core/mine'
import { Modal } from './ui'

export function MinePicker({
  scope,
  profile,
  deliverables,
  onSave,
  onClose
}: {
  scope: MyScope | undefined
  profile: Profile
  /** 지금 보이는 산출물 (고친 담당 포함) — 미리 세기용 */
  deliverables: Deliverable[]
  onSave: (scope: MyScope, profile: Profile) => void
  onClose: () => void
}): ReactElement {
  const base = scope ?? EMPTY_SCOPE
  const [roles, setRoles] = useState<MyRole[]>(base.roles)
  const [matchName, setMatchName] = useState(Boolean(base.matchName))
  const [name, setName] = useState(profile.name)
  const next: MyScope = { ...base, roles, matchName }
  const nextProfile = { ...profile, name: name.trim() }
  const count = deliverables.filter((d) => mineOf(d, next, nextProfile).mine).length
  const toggle = (r: MyRole): void => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])

  return (
    <Modal
      title="내 역할을 골라 주세요"
      onClose={onClose}
      footer={
        <>
          <span className="muted small">설정에서 언제든 바꿀 수 있습니다.</span>
          <button type="button" className="btn" onClick={onClose}>
            나중에
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(next, nextProfile)}>
            이대로 보기
          </button>
        </>
      }
    >
      <p className="muted small">역할에 맞는 DIA 산출물을 자동으로 "내 담당"에 넣습니다. 여러 개 고를 수 있습니다.</p>
      <div className="role-cards">
        {MY_ROLES.map((r) => (
          <label key={r} className={`role-card${roles.includes(r) ? ' on' : ''}`}>
            <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />
            <span>
              <strong>{ROLE_LABEL[r]}</strong>
              <span className="muted small">
                {ROLE_PARTS[r]}
                <br />
                예: {ROLE_EXAMPLES[r]}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="mine-name">
        <label className="check-line">
          <input type="checkbox" checked={matchName} onChange={(e) => setMatchName(e.target.checked)} />
          DIA 담당 칸에 내 이름이 있는 산출물도 함께 넣기
        </label>
        <label className="inline-label">
          내 이름
          <input value={name} maxLength={40} placeholder="예: 홍길동" aria-label="내 이름" onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="muted small">이름은 이 PC의 앱 설정에만 저장되고, 설정 → 내 정보에서 바꿀 수 있습니다.</p>
      </div>
      <p className="mine-count" role="status">
        지금 고른 기준으로 내 담당 {count}건
      </p>
    </Modal>
  )
}
