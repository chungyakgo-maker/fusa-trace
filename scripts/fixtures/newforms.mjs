// 처음 보는 양식의 가짜 문서 (FORMATS §13 칸 지정 확인용) — 형태만 지어낸 가짜 데이터
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { docx, para, table } from './docx.mjs'

const P = '[기능안전]_데모'

/** HSR 엑셀 (행 목록형): 머리글 3행 */
async function hsrXlsx(rows) {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Cover').getCell('A1').value = 'HW Safety Requirements (가짜)'
  const ws = wb.addWorksheet('HW Requirements')
  ws.getCell('A1').value = '하드웨어 안전 요구사항 (가짜 양식)'
  ws.addRow([])
  ws.addRow(['HW Req No.', 'Parent TSR', 'Requirement', 'ASIL', 'Allocation', 'Status', 'Note'])
  for (const r of rows) ws.addRow(r)
  return wb
}

const HSR_MAIN = [
  ['HSR-001', 'TSR-CTL-SG001-002', '가짜 HW 요구 1: 전원 감시', 'B', 'H/W', 'Complete', ''],
  ['HSR-002', 'TSR-CTL-SG001-003\nTSR-CTL-SG001-004', '가짜 HW 요구 2: 입력 회로 이중화', 'B', 'H/W', 'Design in progress', '여러 TSR'],
  ['HSR-003', 'TSR-CTL-SG001-008', '가짜 HW 요구 3', 'B', 'H/W', 'Complete', ''],
  ['HSR-004', 'TSR-CTL-SG001-009', '가짜 HW 요구 4', 'B', 'H/W', 'Complete', ''],
  ['HSR-005', 'TSR-CTL-SG001-012', '가짜 HW 요구 5 (TSC 중복 ID를 가리킴)', 'B', 'H/W', 'Complete', ''],
  ['HSR-006', 'TSR-013', '가짜 HW 요구 6 (약식 표기)', 'B', 'H/W', 'Complete', ''],
  ['HSR-007', 'TSR-CTL-SG001-014', '가짜 HW 요구 7', 'B', 'H/W', 'Complete', ''],
  ['HSR-008', 'TSR-CTL-SG001-017', '가짜 HW 요구 8', 'B', 'H/W', 'Complete', ''],
  ['HSR-009', 'TSR-CTL-SG001-019', '가짜 HW 요구 9', 'B', 'H/W', 'Complete', ''],
  ['HSR-010', 'TSR-CTL-SG001-027', '가짜 HW 요구 10', 'B', 'H/W', 'Complete', ''],
  ['HSR-011', 'TSR-CTL-SG001-028', '가짜 HW 요구 11', 'B', 'H/W', 'Complete', ''],
  ['HSR-012', 'TSR-CTL-SG001-029', '가짜 HW 요구 12', 'B', 'H/W', 'Complete', ''],
  ['HSR-013', 'TSR-CTL-SG001-099', '가짜 HW 요구 13 (없는 TSR)', 'B', 'H/W', 'Complete', ''],
  ['HSR-014', '', '가짜 HW 요구 14 (TSR 없음)', 'B', 'H/W', 'Complete', ''],
  ['HSR-015', 'TSR-003', '가짜 HW 요구 15 (약식, 후보 여러 개)', 'A', 'H/W', 'Complete', ''],
  ['', '', '', '', '', '', '작성 메모 (ID 없음, 읽지 않음)']
]

const HSR_SUB = [
  ['HSR-B-001', 'TSR-CTL-SG002-002', 'SG2 가짜 HW 요구 1', 'A', 'H/W', 'Complete', ''],
  ['HSR-B-002', 'TSR-CTL-SG002-003', 'SG2 가짜 HW 요구 2', 'A', 'H/W', 'Complete', ''],
  ['HSR-B-003', 'TSR-CTL-SG002-004', 'SG2 가짜 HW 요구 3', 'A', 'H/W', 'Complete', ''],
  ['HSR-B-004', 'TSR-CTL-SG002-007', 'SG2 가짜 HW 요구 4', 'A', 'H/W', 'Complete', ''],
  ['HSR-B-005', 'TSR-CTL-SG002-008', 'SG2 가짜 HW 요구 5', 'A', 'H/W', 'Complete', '']
]

/** HSR 워드 (키-값형): 표 하나 = 요구사항 하나 */
function hsrKeyValue() {
  const body = [para('HW Safety Requirements (가짜, 키-값 양식)', 'Heading1')]
  const reqs = [
    ['HSR-K-001', 'TSR-CTL-SG001-002', '키-값 가짜 HW 요구 1', 'B'],
    ['HSR-K-002', 'TSR-CTL-SG001-008', '키-값 가짜 HW 요구 2', 'B'],
    ['HSR-K-003', 'TSR-CTL-SG002-004', '키-값 가짜 HW 요구 3', 'A']
  ]
  for (const [id, parent, desc, asil] of reqs) {
    body.push(table([
      ['HW Requirement ID', id],
      ['Parent', parent],
      ['Description', desc],
      ['ASIL', asil]
    ]))
  }
  return docx(body)
}

/** SW 요구사항 시험 명세 (워드, 행 목록형) */
function swTestSpec() {
  const ssr = (k) => `FS_SSR-${100000 + k}`
  const rows = [['Test Case ID', 'Verified Requirement', 'Test Title', 'Test Method']]
  let n = 0
  const add = (ref, title) => rows.push([`TC-${String(++n).padStart(3, '0')}`, ref, title, 'Requirement-based test'])
  for (const k of [1, 2, 3, 4, 5, 6, 7, 8]) add(ssr(k), `가짜 시험 ${k}`)
  for (let k = 13; k <= 33; k++) {
    if (k === 14) continue // 아래에서 여러 SSR 한 번에
    if (k === 16) add('SSR-100016', '약식 표기 시험') // 끝 번호 → FS_SSR-100016
    else add(ssr(k), `가짜 시험 ${k}`)
  }
  add(`${ssr(13)}, ${ssr(14)}`, '여러 SSR을 한 번에 검증')
  add('FS_SSR-199999', '없는 SSR을 가리키는 시험')
  add('', '검증 대상이 비어 있는 시험')
  add(ssr(40), '안전 무관 SSR 시험')
  // 11, 12번 SSR은 시험 없음 → "SW 시험 없음"
  return docx([para('SW Requirements Test Specification (가짜)', 'Heading1'), table([['Document', 'Version'], ['가짜 SRS', 'v1.5']]), table(rows)])
}

/** 동의어 확인용 FSR 양식C: 머리글이 기본 동의어에 없음 ('FSR 번호', '요구사항') */
async function fsrVariantC() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('기능안전요구')
  ws.addRow(['FSR 번호', 'Type', 'Allocation', '요구사항', 'SG_ID', 'ASIL'])
  ws.addRow(['ZZZCTLSR001', '자체', 'CTL', '양식C 가짜 요구 1', 'SG_01', 'B'])
  ws.addRow(['ZZZCTLSR002', '자체', 'CTL', '양식C 가짜 요구 2', 'SG_01', 'B'])
  return wb
}

export async function makeNewFormFiles(out) {
  await (await hsrXlsx(HSR_MAIN)).xlsx.writeFile(join(out, `${P}_HSR_R1.xlsx`))
  await (await hsrXlsx(HSR_SUB)).xlsx.writeFile(join(out, `${P}_HSR 보조_R0.xlsx`))
  writeFileSync(join(out, `${P}_HSR 키값_R0.docx`), hsrKeyValue())
  writeFileSync(join(out, `${P}_SW 시험 명세_R0.docx`), swTestSpec())
  await (await fsrVariantC()).xlsx.writeFile(join(out, `${P}_FSR_양식C_R00.xlsx`))
}
