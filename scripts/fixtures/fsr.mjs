// 가짜 FSR 엑셀 (FORMATS §4, §9 FSR) — 실제 문서가 아닌 형태만 같은 가짜 데이터
import ExcelJS from 'exceljs'
import { join } from 'node:path'

const P = '[기능안전]_데모'

/** SG별 FSR: [ID, 내용, Safe State, ASIL, FTTI, 허용 기준, Allocation] */
function sgFsrs(sg) {
  const n = sg === 1 ? 12 : 8
  const rows = []
  for (let i = 1; i <= n; i++) {
    const id = `FSR.00${sg}.${String(i).padStart(3, '0')}`
    const ss = i === 3 ? '-' : i === 4 ? 'SS001\n(필요 시 SS002)' : i === 5 ? 'T.B.D.' : `SS00${sg}`
    const alloc = i === 1 ? 'General' : i % 3 === 0 ? 'ECU-X\n(타 제어기)' : 'CTL\n(도어 제어)'
    rows.push([id, `SG${sg} 가짜 기능안전 요구 ${i}: 고장을 감지하면 안전 상태로 전환한다`, ss, i % 4 === 0 ? 'A' : 'B', i === 6 ? 'T.B.D.' : '200', '고장 감지 후 안전 상태 유지', alloc])
  }
  return rows
}

export function header(ws, r, c0) {
  const h = ['ID_FSR', '내용', null, 'ID_SafeState', 'ASIL', 'FTTI/EOTI\n[ms]', 'Acceptance\nCriteria', 'Allocation']
  h.forEach((v, i) => {
    if (v !== null) ws.getCell(r, c0 + i).value = v
  })
  ws.mergeCells(r, c0 + 1, r, c0 + 2) // 내용 칸 가로 병합
}

export function writeRows(ws, r, c0, rows) {
  for (const row of rows) {
    const [id, text, ss, asil, ftti, acc, alloc] = row
    ws.getCell(r, c0).value = id
    ws.getCell(r, c0 + 1).value = text
    ws.mergeCells(r, c0 + 1, r, c0 + 2) // 병합 셀 (내용)
    ws.getCell(r, c0 + 3).value = ss
    ws.getCell(r, c0 + 4).value = asil
    ws.getCell(r, c0 + 5).value = ftti
    ws.getCell(r, c0 + 6).value = acc
    ws.getCell(r, c0 + 7).value = alloc
    r++
  }
  return r
}

function sgSheet(wb, sg) {
  const ws = wb.addWorksheet(`3.${sg}. 기능안전 요구사항 (SG00${sg})`)
  const c0 = 3 // A~B열은 팀이 덧붙인 열 (읽으면 안 됨)
  ws.getCell('C1').value = `SG00${sg} 의도하지 않은 동작 방지 ${sg} (가짜)`
  ws.getCell('A4').value = 'TSR 매핑(팀)'
  ws.getCell('B4').value = '라벨'

  let r = 3
  ws.getCell(r, c0).value = `3.${sg}.2 기능안전 요구사항 상세`
  r++
  header(ws, r, c0)
  r++
  const own = sgFsrs(sg)
  own.forEach((row, i) => {
    ws.getCell(r + i, 1).value = `TSR-CTL-SG00${sg}-${String(i + 1).padStart(3, '0')}` // 팀 매핑 (무시)
    ws.getCell(r + i, 2).value = '확인중'
    ws.getCell(r + i, c0 + 9).value = i === 0 ? '메모: 고객 확인 필요 (읽지 않음)' : null // 오른쪽 메모 열
  })
  r = writeRows(ws, r, c0, own)
  r++ // 빈 행
  ws.getCell(r, c0 + 1).value = '※ 비고: 표 아래 떨어진 메모 (읽지 않음)'
  r += 2

  ws.getCell(r, c0).value = `3.${sg}.3 External requirements to other ECUs`
  r++
  header(ws, r, c0)
  r++
  if (sg === 2) r = writeRows(ws, r, c0, [['FSR.002.090', '타 제어기(ECU-X)에 요구: 경고등 점등 (가짜)', '-', 'B', '500', '경고등 점등', 'ECU-X']])
  r += 2

  ws.getCell(r, c0).value = `3.${sg}.4 External requirements from other ECUs`
  r++
  header(ws, r, c0)
  r++
  r = writeRows(ws, r, c0, [[`FSR.006.05${sg}`, `다른 시스템(SG006)에서 받은 요구 ${sg} (가짜)`, 'SS001', 'B', '100', '요구 신호 처리', 'CTL']])
  // ID 없이 내용만 있는 행 → 건너뜀 + 이유
  ws.getCell(r, c0 + 1).value = 'ID가 빠진 요구 (가짜)'
  ws.mergeCells(r, c0 + 1, r, c0 + 2)
}

export async function makeFsrMain(revision = 0) {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('표지').getCell('A1').value = '기능안전 요구사양서 (가짜)'
  wb.addWorksheet('목차').getCell('A1').value = '목차'
  const hist = wb.addWorksheet('제정 및 개정이력')
  hist.addRow([])
  hist.addRow(['', '버전', '일자', '내용'])
  hist.addRow(['', 'R00', '2026-02-01', '제정'])
  if (revision >= 1) hist.addRow(['', 'R01', '2026-03-01', '개정'])
  hist.addRow(['', '', '', ''])

  wb.addWorksheet('1. 개요').getCell('A1').value = '개요 (가짜)'

  const sgWs = wb.addWorksheet('2. 안전 목표')
  sgWs.getCell('A1').value = '2. 안전 목표'
  const rowsAt = (r, rows) => rows.forEach((row, i) => row.forEach((v, c) => (sgWs.getCell(r + i, c + 1).value = v)))
  rowsAt(3, [
    ['ID_SafetyGoal', '안전 목표 (Safety Goal)', 'ASIL', '재난요인 (Hazard)'],
    ['SG001', '의도하지 않은 동작 방지 1 (가짜)', 'B', '주행 중 오동작'],
    ['SG002', '의도하지 않은 동작 방지 2 (가짜)', 'A', '정차 중 오동작']
  ])
  rowsAt(8, [
    ['ID_SafetyGoal', 'FTTI [ms]'],
    ['SG001', '200'],
    ['SG002', '500']
  ])
  rowsAt(12, [
    ['ID_SafetyGoal', 'ASIL', 'ID_SafeState', 'FTTI/EOTI\n[ms]', 'Acceptance\nCriteria'],
    ['SG001', 'B', 'SS001', '200', '오동작 없음'],
    ['SG002', 'A', 'SS002', '500', '오동작 없음']
  ])
  rowsAt(17, [
    ['ID_SafeState', '안전 상태 (Safe State)', '상세 내용'],
    ['SS001', '현재 상태 유지', '출력을 바꾸지 않음 (가짜)'],
    ['SS002', '경고 표시', '경고등 점등 (가짜)']
  ])
  rowsAt(22, [
    ['상태', '천이 조건', '비고'],
    ['정상', '고장 없음', '무관한 표'],
    ['고장', '고장 감지', '무관한 표']
  ])

  sgSheet(wb, 1)
  sgSheet(wb, 2)

  // 작업용 시트 (무시해야 함)
  const junk = wb.addWorksheet('Sheet1')
  junk.addRow(['ID_FSR', '내용'])
  junk.addRow(['FSR.999.999', '작업용 임시 데이터 (읽으면 안 됨)'])
  return wb
}

/** 다른 제어기 양식 변형: FSR ID/Type/SG_ID 헤더, <차종코드><제어기>SR 형식 ID */
export async function makeFsrVariant() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('FSR')
  ws.addRow(['기능안전 요구사항 (다른 양식, 가짜)'])
  ws.addRow([])
  ws.addRow(['FSR ID', 'Type', 'Allocation', 'FSR', '감지/응답시간', '허용기준', 'SG_ID', 'ASIL', 'SS_ID'])
  ws.addRow(['XXXCTLSR110', '자체', 'CTL', '가짜 요구 110', '100ms', '안전 상태 유지', 'SG_01', 'B', 'SS_01'])
  ws.addRow(['XXXCTLSR210', '자체', 'CTL', '가짜 요구 210', '100ms', '안전 상태 유지', 'SG_02', 'B', 'SS_01'])
  ws.addRow(['YYYCTLSR810', '외부', 'ECU-Y', '가짜 요구 810', '200ms', '경고', 'SG_01', 'A', '-'])
  return wb
}

export async function makeFsrFiles(out) {
  await (await makeFsrMain(1)).xlsx.writeFile(join(out, `${P}_FSR_R01.xlsx`))
  await (await makeFsrVariant()).xlsx.writeFile(join(out, `${P}_FSR_양식B_R00.xlsx`))
}
