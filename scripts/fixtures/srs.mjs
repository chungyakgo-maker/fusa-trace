// 가짜 SRS 워드 (FORMATS §11, §9 SRS) — 형태만 같은 가짜 데이터
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { docx, para, table } from './docx.mjs'

const P = '[기능안전]_데모'
const pad = (n) => String(n).padStart(3, '0')

/** 요구사항 표 1개 */
export function reqTable(k, { id, fsr, asil = 'B', alt = k % 2 === 0 }) {
  return table([
    ['Item', 'Description'],
    ['Requirement Identifier', id],
    ['Requirement Title', `가짜 SW 안전 요구 ${k}`],
    [alt ? 'Requirement Description' : 'Detailed Requirements', `SW는 입력 ${k}을(를) 검사하고 이상 시 안전 상태로 전환한다 (가짜)`],
    ['Requirement Supported', 'Yes'],
    ['Variants', 'All'],
    ['Requirement Reuse', 'No'],
    ['Requirement Priority', 'High'],
    ['Requirement Verification', 'Test'],
    ['Functional Safety Related', fsr],
    ['ASIL', asil],
    [alt ? 'FRTI' : 'FTTI', '100ms'],
    ['Safety State', 'SS001'],
    [alt ? 'higher-level requirements' : 'Higher-Level Requirement', `SYS-REQ-${pad(k)}`]
  ])
}

function requirements() {
  const list = []
  let k = 0
  const add = (fsr, asil) => {
    k++
    list.push({ k, id: `FS_SSR-${100000 + k}`, fsr, asil })
  }
  // FORMATS §7.2 값 변형과 특이 사례
  add('Yes (TSR-017, TSR-037)') // TSR-017: 약식(후보 1개), TSR-037: 없는 ID
  add('Yes(TSR-017, TSR-018)') // 괄호 붙여 씀
  add('Yes') // Yes인데 TSR 없음 → 확인 필요
  add('No', 'B') // ASIL B인데 TSR 없음 → 역방향 확인
  add('Yes (TSR-012)') // 약식이 TSC의 중복 ID를 가리킴 → 확인 필요
  add('Yes (TSR-005)') // 끝 번호 후보 2개 (SG001-005, SG002-005) → 확인 필요
  add('Yes (CUST_CTL_TSR_018)') // <고객>_<제품>_TSR_018 → 약식(후보 1개)
  add('Yes (TSR-CTL-SG002-003)') // 그대로 일치
  add('', 'QM') // 빈칸 → 안전 무관
  add('-', 'QM')
  // S/W 할당 TSR마다 SSR (016, 025는 일부러 빠뜨림 → SSR 없음)
  for (let i = 1; i <= 30; i++) {
    if ([20, 21, 22, 24, 16, 25].includes(i)) continue
    // TSC 가짜 문서의 할당 규칙: i % 5 → S/W, SW, H/W, HW, SW+H/W (005~007은 S/W 변형)
    const sw = [0, 1, 4].includes(i % 5) || [5, 6, 7].includes(i)
    if (sw) add(`Yes (TSR-CTL-SG001-${pad(i)})`)
  }
  for (const j of [1, 4, 5, 6, 9, 10]) add(`Yes (TSR-CTL-SG002-${pad(j)})`, 'A')
  add('Yes (TSR-CTL-GEN-001)', 'QM')
  add('Yes(TSR-CTL-GEN-002)', 'QM')
  add('Yes (TSR-CTL-DOOR-026)')
  // 채우기 (안전 무관)
  while (k < 52) add('No', 'QM')
  return list
}

export function makeSrs() {
  const body = [para('Software Requirements Specification (가짜)', 'Heading1')]
  body.push(table([['Document Name (or CodeBeamer Tracker Name)', 'Version'], ['SYS Requirements (가짜)', '1.0']])) // 참조 문서 표 (무시)
  body.push(para('3. Software Safety Requirements', 'Heading1'))
  body.push(para('Element 3 [MCU SW]', 'Heading2'))
  for (const r of requirements()) {
    body.push(para(`${r.id} 가짜 SW 안전 요구 ${r.k}`, 'Heading3'))
    body.push(reqTable(r.k, r))
  }
  // 요구사항이 아닌 표 (개발 제약)
  body.push(para('4. Development Constraints', 'Heading1'))
  body.push(reqTable(90, { id: 'No separate identifier assigned', fsr: 'No', asil: 'QM' }))
  body.push(reqTable(91, { id: 'No separate identifier assigned', fsr: 'No', asil: 'QM' }))
  body.push(reqTable(92, { id: '', fsr: 'No', asil: 'QM' }))
  return docx(body)
}

export async function makeSrsFiles(out) {
  writeFileSync(join(out, `${P}_SRS_v1.5.docx`), makeSrs())
}
