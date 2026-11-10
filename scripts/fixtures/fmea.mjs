// 가짜 FMEA 엑셀 (AIAG-VDA 양식, FORMATS §10, §9 FMEA) — 형태만 같은 가짜 데이터
import ExcelJS from 'exceljs'
import { join } from 'node:path'

const P = '[기능안전]_데모'
const pad = (n) => String(n).padStart(3, '0')
const ELEMENTS = ['Power Control (Element 1)\n전원 제어부', 'Signal Input (Element 2)\n입력부', 'MCU (Element 3)\n연산부']

/** 그룹 줄(2행) + 영문 줄(3행) + 한글 줄(4행). withTsr=false면 TSR ID·ASIL 칸 없는 옛 양식 */
function headers(ws, withTsr) {
  const groups = [
    ['A2:C2', 'STRUCTURE ANALYSIS (STEP2)'],
    ['D2:F2', 'FUNCTION ANALYSIS (STEP 3)'],
    ['G2:I2', 'FAILURE ANALYSIS (STEP 4)'],
    ['J2:M2', 'RISK ANALYSIS (STEP 5)'],
    ['N2:N2', 'OPTIMIZATION (STEP 6)']
  ]
  for (const [range, text] of groups) {
    ws.getCell(range.split(':')[0]).value = text
    if (range.split(':')[0] !== range.split(':')[1]) ws.mergeCells(range)
  }
  const en = [
    '1. Next Higher Level', '2. Focus Element', '3. Next Lower Level or Characteristic Type',
    '1. Next Higher Level Function and Requirement', '2. Focus Element Function and Requirement', '3. Next Lower Level Function and Requirement',
    '1. Failure Effects (FE)', '2. Failure Mode(FM) of the Focus Element', '3. Failure Cause(FC) of the Next Lower Element or Characteristic',
    'Severity (S)', 'Occurrence (O)', 'Detection (D)', 'System FMEA AP', 'Optimization'
  ]
  en.forEach((v, i) => (ws.getRow(3).getCell(i + 1).value = v))
  const ko = ['다음 단계', '초점 요소', '하위 요소', '상위 기능', '초점 기능', '하위 기능', '고장 영향', '고장 모드', '고장 원인 (FC)', '심각도', '발생도', '검출도', 'AP', '개선']
  ko.forEach((v, i) => (ws.getRow(4).getCell(i + 1).value = v))
  if (withTsr) {
    ws.getCell('O3').value = 'Remark' // 영문 줄: Remark 그룹만 (TSR ID·ASIL은 한글 줄에만)
    ws.mergeCells('O3:Q3')
    ws.getCell('O4').value = 'TSR  ID' // 공백 2개
    ws.getCell('P4').value = 'ASIL'
    ws.getCell('Q4').value = '비고'
  } else {
    ws.getCell('O3').value = 'Remark'
    ws.getCell('O4').value = '비고'
  }
}

/** 고장원인 행: [요소, 고장모드, 고장원인, TSR ID, ASIL, AP] */
function causeRowsSg1() {
  const rows = []
  const list = [...Array.from({ length: 19 }, (_, k) => k + 1), 23, 25, 26, 27, 28]
  for (const i of list) {
    const id = `TSR-CTL-SG001-${pad(i)}`
    let ref = [id, id.replace(/-/g, '_'), `CUST_CTL_SG001_TSR_${pad(i)}`, id][i % 4]
    if (i === 17) ref = 'CUST_CTL_TSR_017' // 약식 (SG 없음, 후보 1개)
    if (i === 4) ref = '\nTSR-CTL-SG001-004\nTSR-CTL-SG001-005' // 줄바꿈으로 시작
    rows.push([ELEMENTS[i % 3], `고장 모드 ${i} (가짜)`, `하위 요소 고장 원인 ${i} (가짜)`, ref, i % 5 === 0 ? 'B(D)' : 'B', i % 2 ? 'H' : 'M'])
  }
  return rows
}

function causeRowsSg2() {
  const rows = []
  for (let j = 1; j <= 9; j++) {
    let ref = j % 2 ? `TSR-CTL-SG002-${pad(j)}` : `CUST_CTL_SG002_TSR_${pad(j)}` // SG 번호가 있는 약식
    if (j === 9) ref = 'CUST_CTL_TSR_009' // SG 없는 약식 → SG001-009, SG002-009 후보 2개 → 확인 필요
    rows.push([ELEMENTS[j % 3], `SG2 고장 모드 ${j}`, `SG2 고장 원인 ${j} (가짜)`, ref, 'A', 'M'])
  }
  return rows
}

function fmeaSheet(wb, name, rows, withTsr) {
  const ws = wb.addWorksheet(name)
  ws.getCell('A1').value = `${name} — 가짜 FMEA`
  headers(ws, withTsr)
  let r = 5
  let prevElement = ''
  let groupStart = r
  rows.forEach((row, idx) => {
    const [element, fm, fc, ref, asil, ap] = row
    ws.getCell(r, 1).value = idx === 0 ? 'CTL 시스템' : '↑' // ↑ = 위 값과 같음
    // 초점 요소: 같은 요소끼리 세로 병합
    if (element !== prevElement) {
      if (r - 1 > groupStart) ws.mergeCells(groupStart, 2, r - 1, 2)
      groupStart = r
      ws.getCell(r, 2).value = `초점 요소 ${element.split(' (')[0]}`
    }
    ws.getCell(r, 3).value = element === prevElement ? '↑' : element
    prevElement = element
    ws.getCell(r, 4).value = '상위 기능 (가짜)'
    ws.getCell(r, 5).value = '초점 기능 (가짜)'
    ws.getCell(r, 6).value = '하위 기능 (가짜)'
    ws.getCell(r, 7).value = '차량 수준 영향 (가짜)'
    ws.getCell(r, 8).value = fm
    ws.getCell(r, 9).value = fc
    ws.getCell(r, 10).value = 8
    ws.getCell(r, 11).value = 3
    ws.getCell(r, 12).value = 4
    ws.getCell(r, 13).value = ap
    if (withTsr) {
      ws.getCell(r, 15).value = ref
      ws.getCell(r, 16).value = asil
    }
    r++
  })
  if (r - 1 > groupStart) ws.mergeCells(groupStart, 2, r - 1, 2)
  // N/A 고장원인 → 건너뜀
  ws.getCell(r, 1).value = '↑'
  ws.getCell(r, 8).value = '해당 없음 모드'
  ws.getCell(r, 9).value = 'N/A'
  r++
  if (withTsr) {
    // ASIL B인데 TSR ID 없는 행 → 역방향 확인
    ws.getCell(r, 1).value = '↑'
    ws.getCell(r, 3).value = 'MCU (Element 3)'
    ws.getCell(r, 8).value = '연결 누락 모드 (가짜)'
    ws.getCell(r, 9).value = 'TSR 연결이 빠진 고장 원인 (가짜)'
    ws.getCell(r, 16).value = 'B'
    r++
  }
  return ws
}

async function makeFmea(withTsr) {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Revision History').getCell('A1').value = '이력 (가짜)'
  wb.addWorksheet('Architecture').getCell('A1').value = '구조 (가짜)'
  wb.addWorksheet('AP risk matrix').getCell('A1').value = 'AP 표 (가짜)'
  fmeaSheet(wb, 'FMEA_SG001', causeRowsSg1(), withTsr)
  fmeaSheet(wb, 'FMEA_SG002', causeRowsSg2(), withTsr)
  // 작성 예제 시트 (헤더가 같아도 읽으면 안 됨)
  fmeaSheet(wb, '작성 예제', [['Example (Element 9)', '예제 모드', '예제 원인', 'TSR-EX-001', 'B', 'H']], withTsr)
  return wb
}

export async function makeFmeaFiles(out) {
  await (await makeFmea(true)).xlsx.writeFile(join(out, `${P}_시스템 FMEA_R1.xlsx`))
  await (await makeFmea(false)).xlsx.writeFile(join(out, `${P}_시스템 FMEA_구양식_R0.xlsx`))
}
