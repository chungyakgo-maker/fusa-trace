/** 칸 지정 (FORMATS §13): 처음 보는 양식의 칸 역할을 정해 읽기 규칙으로 저장 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { ParsedDocument, ReadRule, RuleKind, RuleRole } from '../../core/model'
import { DOC_KIND_LABEL, RULE_KINDS } from '../../core/model'
import { makeRule, ROLE_LABEL, ROLES, type PreviewData } from '../../core/rules'
import { normHeader } from '../../core/text'
import { AlertIcon } from './icons'
import { Modal } from './ui'

type RoleChoice = RuleRole | ''

function RoleSelect({ label, value, onChange }: { label: string; value: RoleChoice; onChange: (v: RoleChoice) => void }): ReactElement {
  return (
    <select className={`role-select${value ? ' role-set' : ''}`} aria-label={`${label} 칸의 역할`} value={value} onChange={(e) => onChange(e.target.value as RoleChoice)}>
      <option value="">— 안 씀 —</option>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  )
}

/** 값이 3칸 이상 있는 첫 행을 머리글로 추천 */
function guessHeaderRow(rows: string[][]): number {
  const i = rows.findIndex((r) => r.filter((c) => c.trim()).length >= 3)
  return i < 0 ? 0 : i
}

export function MappingEditor({ entry, onSave, onClose }: { entry: ParsedDocument; onSave: (rule: ReadRule) => void; onClose: () => void }): ReactElement {
  const [preview, setPreview] = useState<PreviewData | { error: string } | null>(null)
  const [docKind, setDocKind] = useState<RuleKind>(RULE_KINDS.includes(entry.kind as RuleKind) ? (entry.kind as RuleKind) : 'HSR')
  const [name, setName] = useState('')
  const [sheetIdx, setSheetIdx] = useState(0)
  const [headerRow, setHeaderRow] = useState(0)
  const [tableIdx, setTableIdx] = useState(0)
  const [layout, setLayout] = useState<'rows' | 'keyvalue'>('rows')
  /** 행 목록형: 열 번호 → 역할 / 키-값형: 행 번호 → 역할 */
  const [roles, setRoles] = useState<Record<number, RoleChoice>>({})

  useEffect(() => {
    void window.fusa.docs.preview(entry.path).then((p) => {
      setPreview(p)
      if ('format' in p && p.format === 'xlsx' && p.sheets) {
        const best = p.sheets.reduce((bi, s, i) => (s.rows.filter((r) => r.some((c) => c.trim())).length > p.sheets![bi].rows.filter((r) => r.some((c) => c.trim())).length ? i : bi), 0)
        setSheetIdx(best)
        setHeaderRow(guessHeaderRow(p.sheets[best].rows))
      }
      if ('format' in p && p.format === 'docx' && p.tables && p.tables.length > 0) {
        const best = p.tables.reduce((bi, t, i) => (t.rows.length > p.tables![bi].rows.length ? i : bi), 0)
        setTableIdx(best)
        setLayout((p.tables[best].rows[0]?.length ?? 0) >= 3 ? 'rows' : 'keyvalue')
      }
    })
  }, [entry.path])

  useEffect(() => setName(`${docKind === 'HSR' ? 'HSR' : 'SW 시험 명세'} 양식 (${entry.fileName.replace(/\.[^.]+$/, '').slice(0, 30)})`), [docKind, entry.fileName])

  const ready = preview && 'format' in preview
  const sheet = ready && preview.format === 'xlsx' ? preview.sheets?.[sheetIdx] : undefined
  const table = ready && preview.format === 'docx' ? preview.tables?.[tableIdx] : undefined

  /** 역할 칸의 글자 (머리글 또는 키) */
  const labelAt = (k: number): string => {
    if (sheet) return sheet.rows[headerRow]?.[k] ?? ''
    if (table && layout === 'rows') return table.rows[0]?.[k] ?? ''
    if (table) return table.rows[k]?.[0] ?? ''
    return ''
  }

  const roleHeaders = useMemo(() => {
    const out: Partial<Record<RuleRole, string>> = {}
    for (const [k, r] of Object.entries(roles)) if (r) out[r] = labelAt(Number(k))
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, sheet, table, layout, headerRow])

  const used = Object.values(roles).filter(Boolean)
  const dupRole = used.find((r, i) => used.indexOf(r) !== i)
  const emptyHeader = Object.entries(roles).some(([k, r]) => r && !normHeader(labelAt(Number(k))))
  const problems = [
    !roleHeaders.id && '"내 ID" 칸을 정해 주세요',
    dupRole && `"${ROLE_LABEL[dupRole]}"이(가) 두 칸에 정해졌습니다`,
    emptyHeader && '머리글(또는 키)이 빈 칸에는 역할을 정할 수 없습니다'
  ].filter(Boolean) as string[]

  const reset = (): void => setRoles({})

  const body = !preview ? (
    <p className="reading">파일을 여는 중…</p>
  ) : 'error' in preview ? (
    <p className="error-line">
      <AlertIcon /> {preview.error}
    </p>
  ) : (
    <div className="mapping">
      <p className="muted">
        처음 보는 양식의 칸 역할을 정합니다. <strong>내 ID</strong>는 꼭 정해 주세요. <strong>위 단계 ID</strong>를 정하면 연결을 계산합니다. 저장한 규칙은 같은 모양(같은 머리글)의 문서에 자동으로 다시 씁니다.
      </p>
      <div className="inline-form">
        <label>
          문서 종류
          <select value={docKind} onChange={(e) => setDocKind(e.target.value as RuleKind)}>
            {RULE_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOC_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          규칙 이름
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      {preview.format === 'xlsx' && preview.sheets && (
        <>
          <div className="inline-form">
            <label>
              시트
              <select
                value={sheetIdx}
                onChange={(e) => {
                  const i = Number(e.target.value)
                  setSheetIdx(i)
                  setHeaderRow(guessHeaderRow(preview.sheets![i].rows))
                  reset()
                }}
              >
                {preview.sheets.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              머리글 행
              <select
                value={headerRow}
                onChange={(e) => {
                  setHeaderRow(Number(e.target.value))
                  reset()
                }}
              >
                {sheet?.rows.map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}행: {r.filter((c) => c.trim()).slice(0, 4).join(' | ') || '(빈 행)'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {sheet && <GridPreview rows={sheet.rows.slice(headerRow, headerRow + 7)} header={sheet.rows[headerRow] ?? []} roles={roles} setRoles={setRoles} />}
        </>
      )}

      {preview.format === 'docx' && preview.tables && (
        <>
          {preview.tables.length === 0 ? (
            <p className="warn-line">
              <AlertIcon /> 이 워드 문서에는 표가 없습니다. 칸 지정은 표로 된 문서만 할 수 있습니다.
            </p>
          ) : (
            <>
              <div className="inline-form">
                <label>
                  예시 표 (이런 모양의 표를 모두 읽음)
                  <select
                    value={tableIdx}
                    onChange={(e) => {
                      const i = Number(e.target.value)
                      setTableIdx(i)
                      setLayout((preview.tables![i].rows[0]?.length ?? 0) >= 3 ? 'rows' : 'keyvalue')
                      reset()
                    }}
                  >
                    {preview.tables.map((t, i) => (
                      <option key={t.index} value={i}>
                        표 {t.index}: {t.rows[0]?.slice(0, 4).join(' | ')}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="radio-row" role="radiogroup" aria-label="표 모양">
                <label>
                  <input
                    type="radio"
                    name="layout"
                    checked={layout === 'rows'}
                    onChange={() => {
                      setLayout('rows')
                      reset()
                    }}
                  />
                  행 목록 (첫 행이 머리글, 한 행 = 항목 하나)
                </label>
                <label>
                  <input
                    type="radio"
                    name="layout"
                    checked={layout === 'keyvalue'}
                    onChange={() => {
                      setLayout('keyvalue')
                      reset()
                    }}
                  />
                  키-값 (첫 칸이 항목 이름, 표 하나 = 항목 하나)
                </label>
              </div>
              {table && layout === 'rows' && <GridPreview rows={table.rows} header={table.rows[0] ?? []} roles={roles} setRoles={setRoles} />}
              {table && layout === 'keyvalue' && (
                <table className="issue-table mapping-kv">
                  <thead>
                    <tr>
                      <th scope="col">항목 이름 (첫 칸)</th>
                      <th scope="col">값 (예시)</th>
                      <th scope="col">역할</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r, k) => (
                      <tr key={k}>
                        <td>{r[0]}</td>
                        <td className="muted">{r.slice(1).join(' ')}</td>
                        <td>
                          <RoleSelect label={r[0] ?? ''} value={roles[k] ?? ''} onChange={(v) => setRoles({ ...roles, [k]: v })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}

      {problems.length > 0 && (
        <ul className="problem-list">
          {problems.map((p) => (
            <li key={p}>
              <AlertIcon size={12} /> {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <Modal
      title={`칸 지정 — ${entry.fileName}`}
      wide
      onClose={onClose}
      footer={
        <>
          <span className="muted small">규칙은 설정 화면에서 보거나 지울 수 있습니다.</span>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!ready || problems.length > 0}
            onClick={() =>
              onSave(
                makeRule({
                  id: crypto.randomUUID(),
                  name,
                  docKind,
                  format: ready ? preview.format : 'xlsx',
                  layout: sheet ? 'rows' : layout,
                  sheet: sheet?.name,
                  roleHeaders,
                  now: new Date().toISOString()
                })
              )
            }
          >
            저장하고 다시 읽기
          </button>
        </>
      }
    >
      {body}
    </Modal>
  )
}

function GridPreview({
  rows,
  header,
  roles,
  setRoles
}: {
  rows: string[][]
  header: string[]
  roles: Record<number, RoleChoice>
  setRoles: (r: Record<number, RoleChoice>) => void
}): ReactElement {
  const cols = header.map((_, i) => i).filter((i) => header[i]?.trim() || rows.some((r) => r[i]?.trim()))
  return (
    <div className="table-scroll mapping-grid">
      <table className="issue-table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} scope="col">
                <div className="mapping-head">{header[c] || <span className="muted">(빈 머리글)</span>}</div>
                <RoleSelect label={header[c] ?? ''} value={roles[c] ?? ''} onChange={(v) => setRoles({ ...roles, [c]: v })} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className={roles[c] ? 'mapped' : ''}>
                  {r[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
