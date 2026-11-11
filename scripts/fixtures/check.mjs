// 검사 규칙용 가짜 문서 (SPEC 검사 규칙, FORMATS §9 검사 규칙용) — 규칙마다 "걸릴 것"과 "제외될 것"
// 기존 데모 가짜 문서와 따로 둔다 (데모 문서의 건수를 확인하는 테스트가 많아서). ID 접두어: CHK
import ExcelJS from 'exceljs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { docx, para, table } from './docx.mjs'
import { attrsFor, tsrRows } from './tsc.mjs'
import { header, writeRows } from './fsr.mjs'
import { fmeaSheet } from './fmea.mjs'
import { reqTable } from './srs.mjs'

export const CP = '[기능안전]_검사'

// ── FSR: [ID, 내용, Safe State, ASIL, FTTI, 허용 기준, Allocation]
async function makeCheckFsr() {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('표지').getCell('A1').value = '기능안전 요구사양서 — 검사용 (가짜)'
  const ws = wb.addWorksheet('3.1. 기능안전 요구사항 (SG001)')
  const c0 = 3
  ws.getCell('C1').value = 'SG001 검사용 안전목표 (가짜)'
  let r = 3
  ws.getCell(r, c0).value = '3.1.2 기능안전 요구사항 상세'
  r++
  header(ws, r, c0)
  r++
  const fsr = (id, text) => [id, text, 'SS001', 'B', '200', '안전 상태 유지', 'CTL']
  r = writeRows(ws, r, c0, [
    fsr('FSR.001.001', '검사 FSR 1: TSR이 있음'),
    fsr('FSR.001.002', '검사 FSR 2: TSR이 없음 → C-04'),
    fsr('FSR.001.003', '검사 FSR 3: 같은 ID, 내용 A → C-01'),
    fsr('FSR.001.003', '검사 FSR 3: 같은 ID, 내용 B (다름) → C-01'),
    fsr('FSR.001.004', '검사 FSR 4: 같은 ID, 같은 내용 → 지적 안 함'),
    fsr('FSR.001.004', '검사 FSR 4: 같은 ID, 같은 내용 → 지적 안 함')
  ])
  r += 2
  ws.getCell(r, c0).value = '3.1.3 External requirements to other ECUs'
  r++
  header(ws, r, c0)
  r++
  r = writeRows(ws, r, c0, [['FSR.001.090', '타 ECU에 요구: TSR이 없어도 제외', '-', 'B', '500', '경고', 'ECU-X']])
  r += 2
  ws.getCell(r, c0).value = '3.1.4 External requirements from other ECUs'
  r++
  header(ws, r, c0)
  r++
  writeRows(ws, r, c0, [['FSR.006.051', '타 ECU로부터 받은 요구: TSR이 없음 → C-04', 'SS001', 'B', '100', '처리', 'CTL']])
  return wb
}

// ── TSC: TSR 표 (Ref ID | TSR ID | 내용 | 분류 | ASIL | Allocation) + 속성
function makeCheckTsc() {
  const t = (ref, id, text, alloc, opts = {}) => ({ ref, id, text, cls: opts.cls ?? '제어', asil: opts.asil ?? 'B', alloc, attrs: attrsFor(1, { status: opts.status ?? '평가 완료' }) })
  const list = [
    t('FSR.001.001', 'TSR-CHK-SG001-001', '검사 TSR 1: SSR·FMEA 근거 있음', 'S/W'),
    t('FSR.001.003', 'TSR-CHK-SG001-002', '검사 TSR 2: S/W인데 SSR 없음 → C-05, FMEA 근거 없음 → C-06', 'SW'),
    t('FSR.001.004', 'TSR-CHK-SG001-003', '검사 TSR 3: H/W (HSR 미등록 → 참고), FMEA 근거 없음 → C-06', 'H/W'),
    t('FSR.001.099', 'TSR-CHK-SG001-004', '검사 TSR 4: 없는 FSR 참조 → C-02', 'SW'),
    t('FSR.001.001', 'TSR-CHK-SG001-005', '검사 TSR 5: 끝 번호 005 (SG001)', 'SW'),
    t('FSR.001.001', 'TSR-CHK-SG002-005', '검사 TSR 5: 끝 번호 005 (SG002)', 'SW'),
    t('FSR.001.098', 'TSR-CHK-SG001-006', '검사 TSR 6: 없는 FSR 참조지만 미적용 → 제외', 'SW', { status: '미적용' }),
    t('FSR.001.001', 'TSR-CHK-SG001-007', '검사 TSR 7: Allocation 빈칸 → K-04 오류', ''),
    t('FSR.001.001', 'TSR-CHK-SG001-008', '검사 TSR 8: Allocation 해석 불가 → K-04 오류', '???'),
    t('FSR.001.001', 'TSR-CHK-GEN-001', '검사 TSR 일반: FMEA 근거 없어도 제외', 'General', { cls: '일반' })
  ]
  const body = [para('기술안전개념서 — 검사용 (가짜)', 'Heading1'), para('4. 기술안전 요구사항', 'Heading1'), para('Element 1 [검사 MCU]', 'Heading2')]
  list.forEach((x, k) => {
    body.push(para(`4.${k + 1} ${x.id}`, 'Heading3'))
    body.push(table(tsrRows(x)))
  })
  return docx(body)
}

// ── FMEA: 고장원인 행 [요소, 고장모드, 고장원인, TSR ID, ASIL, AP] (+ 자동: N/A 행, ASIL B인데 TSR 없는 행 → C-08)
async function makeCheckFmea(withTsr) {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Revision History').getCell('A1').value = '이력 (가짜)'
  const E = 'MCU (Element 3)\n연산부'
  fmeaSheet(
    wb,
    'FMEA_SG001',
    [
      [E, '검사 모드 1', '검사 원인 1: TSR 1 근거', 'TSR-CHK-SG001-001', 'B', 'H'],
      [E, '검사 모드 2', '검사 원인 2: 없는 TSR → C-02', 'TSR-CHK-SG001-099', 'B', 'M'],
      [E, '검사 모드 3', '검사 원인 3: QM이라 TSR 없어도 제외', '', 'QM', 'L']
    ],
    withTsr
  )
  return wb
}

// ── SRS: 요구사항 표 (Functional Safety Related, ASIL)
function makeCheckSrs() {
  const reqs = [
    { id: 'FS_SSR-900001', fsr: 'Yes (TSR-CHK-SG001-001)', asil: 'B' }, // 연결됨
    { id: 'FS_SSR-900002', fsr: 'No', asil: 'B' }, // ASIL B인데 TSR 없음 → C-07
    { id: 'FS_SSR-900003', fsr: 'Yes', asil: 'B' }, // Yes인데 TSR 없음 → C-09 (C-07은 안 냄)
    { id: 'FS_SSR-900004', fsr: 'No', asil: 'QM' }, // 안전 무관 → 제외
    { id: 'FS_SSR-900005', fsr: 'Yes (TSR-005)', asil: 'B' }, // 끝 번호 후보 2개 → C-03
    { id: 'FS_SSR-900006', fsr: 'Yes (TSR-CHK-SG001-077)', asil: 'B' }, // 없는 TSR → C-02
    { id: 'FS_SSR-900007', fsr: 'Yes (TSR-CHK-SG001-005)', asil: 'B' } // TSR 5(SG001) 연결
  ]
  const body = [para('Software Requirements Specification — 검사용 (가짜)', 'Heading1'), para('3. Software Safety Requirements', 'Heading1'), para('Element 3 [검사 SW]', 'Heading2')]
  reqs.forEach((r, k) => {
    body.push(para(`${r.id} 검사 SSR ${k + 1}`, 'Heading3'))
    body.push(reqTable(k + 1, r))
  })
  return docx(body)
}

export async function makeCheckFiles(out) {
  await (await makeCheckFsr()).xlsx.writeFile(join(out, `${CP}_FSR_R1.xlsx`))
  writeFileSync(join(out, `${CP}_기술안전개념서(TSC)_R1.docx`), makeCheckTsc())
  await (await makeCheckFmea(true)).xlsx.writeFile(join(out, `${CP}_시스템 FMEA_R1.xlsx`))
  await (await makeCheckFmea(false)).xlsx.writeFile(join(out, `${CP}_시스템 FMEA_구양식_R0.xlsx`))
  writeFileSync(join(out, `${CP}_SRS_v1.0.docx`), makeCheckSrs())
}
