// 테스트용 가짜 문서 생성기 — 실제 회사 문서는 쓰지 않는다.
// FORMATS.md §9 체크리스트의 특이점을 재현한다. 결과는 tests/fixtures/generated/ (커밋하지 않음)
//
// 사용: node scripts/make-fixtures.mjs   (npm test 전에 자동 실행)
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeFsrFiles } from './fixtures/fsr.mjs'
import { makeTscFiles } from './fixtures/tsc.mjs'
import { docx, para, table } from './fixtures/docx.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
export const OUT = join(root, 'tests', 'fixtures', 'generated')

const P = '[기능안전]_데모' // 가짜 프로젝트 이름 접두어
const d = (s) => {
  const [y, m, dd] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd))
}

// ───────────────────────── DIA ─────────────────────────
/** DIA 행 정의. dates: [계획 시작, 계획 종료, 실적 시작, 실적 종료] — Date 또는 글자 */
function diaRows(revision) {
  const rows = [
    { part: '2-5', no: 1, wp: 'Safety plan', name: `${P}_Safety Plan_R1.docx`, dates: [d('2026-03-02'), d('2026-03-31'), d('2026-03-03'), d('2026-03-30')], team: '기능안전팀\n홍길동 책임' },
    { part: '2-5', no: 2, wp: 'Safety case', name: '', dates: [d('2026-09-01'), d('2026-10-31'), '', ''], team: '기능안전팀\n홍길동 책임, 김철수 선임' },
    { part: '2-6', no: 3, wp: 'Confirmation measure report', name: `${P}_Confirmation Review_R0.docx`, dates: [d('2026-04-01'), d('2026-04-30'), '', ''], team: 'N/A' },
    { part: '3-6', no: 4, wp: 'Item definition', name: `${P}_Item Definition_R1.docx`, dates: ['2026-6-05', revision === 2 ? '2026.07.10' : '2026.06.30', '', ''], team: 'CUST 개발팀' },
    {
      part: '4-6', no: 5, wp: 'Technical safety concept',
      name: `${P}_기술안전개념서(TSC)_R1.docx\n${P}_(TSC) Verification Report_R1.xls\nFMEDA 대체\n※ 파일명은 정확히 기재 할 것`,
      dates: ['TSC: 2026-04-01\nTSC VR : 2026-05-01', 'TSC: 2026-04-27\nTSC VR: 2026-05-15', 'TSC: 2026-04-02', ''],
      team: '시스템팀\n이영희 책임\n박민수 선임'
    },
    {
      part: '4-7', no: 6, wp: 'System safety analysis',
      name: `${P}_시스템 FMEA_R1.xlsx\n${P}_DFA_R1.xlsx\n${P}_FTA_R1.xlsx\n${P}_(FMEA) Verification Report_R1.xls\n${P}_(DFA) Verification Report_R1.xls`,
      dates: [
        'FMEA: 2026-04-10\nDFA:2026-04-20\nFTA / DFA 제외\nFMEA VR: 2026-05-25\nDFA VR: 2026-06-01',
        'FMEA: 2026-05-10\nDFA : 2026-05-20\nFTA : 2026-05-25\nFMEA VR: 2026-06-01\nDFA VR: 2026-06-05',
        'FMEA: 2026-04-12', ''
      ],
      team: '시스템팀\n이영희 책임'
    },
    {
      part: '4-7', no: 7, wp: 'Hardware-software interface',
      name: `${P}_HSI_R1.xlsx\n${P}_(HSI) Verification Report_R1.xls`,
      dates: ['2026-05-01', 'HSI: 2026-06-\nHSI VR: 2026-06-20', '', ''],
      team: '시스템팀\n박민수 선임'
    },
    { part: '5-6', no: 8, wp: 'Hardware safety requirements', name: `${P}_HSR_R1.xlsx`, dates: [d('2026-05-10'), d('2026-05-01'), '', ''], team: '' },
    {
      part: '5-7', no: 9, wp: 'Hardware design', name: `${P}_HSD_R1.docx\n${P}_(HSD) Verification Report_R1.xls`,
      dates: [d('2026-06-01'), d('2026-06-30'), '', ''], team: 'HW팀\n정수진 책임'
    },
    {
      part: '5-8', no: 10, wp: 'Hardware metrics (FMEDA)', name: `${P}_FMEDA_R1.xlsx\n${P}_(FMEDA) Verification Report_R1.xls`,
      dates: ['YYYY.MM.DD', 'YYYY.MM.DD', '', ''], team: 'HW팀\n정수진 책임'
    },
    { part: '6-5', no: 11, wp: 'Software safety requirements', name: `${P}_SRS_v1.5.docx`, dates: ['2026-04-01', '2026-04-30', '2026-04-03', ''], team: 'SW팀\n최지훈 책임' },
    { part: '6-C', no: 12, wp: 'Software requirements test specification', name: '', dates: [d('2026-07-01'), d('2026-07-31'), '', ''], team: 'SW팀\n최지훈 책임' },
    {
      part: '8-9', no: 13, wp: 'Verification of work products',
      name: `${P}_System Requirement Specification Verification Report_R1.xlsx`,
      dates: [d('2026-05-01'), d('2026-05-31'), '', ''], team: '품질팀\n윤서연 책임'
    },
    { part: '9-5', no: 15, wp: 'Other analysis', name: `${P}_Other Analysis_R1.docx`, dates: ['N/A', 'N/A', '', ''], team: '기능안전팀' }
  ]
  if (revision === 1) rows.splice(13, 0, { part: '2-7', no: 14, wp: 'Safety management report', name: `${P}_Safety Report_R0.docx`, dates: [d('2026-01-15'), d('2026-02-15'), '', ''], team: '기능안전팀\n홍길동 책임' })
  if (revision === 2) rows.push({ part: '2-7', no: 16, wp: 'Field monitoring plan', name: `${P}_Field Monitoring_R0.docx`, dates: [d('2026-08-01'), d('2026-08-31'), '', ''], team: '기능안전팀\n홍길동 책임' })
  return rows
}

async function makeDia(revision) {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Cover').getCell('A1').value = 'Development Interface Agreement (가짜 데이터)'
  const hist = wb.addWorksheet('Revision History')
  hist.addRow(['Rev', 'Date', 'Description'])
  hist.addRow([`R${revision}`, d('2026-04-01'), '가짜 개정 이력'])
  const ws = wb.addWorksheet('Detailed Agreement')
  ws.getCell('A1').value = 'DIA — 데모 차종 · CTL (가짜 데이터)'

  // 헤더 3줄 (4~6행) + R/S/A 기호 행 (7행)
  const h4 = ['Part-clause No.', 'Clause title', 'No.', 'Work products (to be exchanged)', 'Details of content to be exchanged', 'CUST', '당사', 'Delivery type']
  h4.forEach((v, i) => (ws.getRow(4).getCell(i + 1).value = v))
  for (let c = 1; c <= 5; c++) ws.mergeCells(4, c, 6, c) // 세로 병합 헤더
  ws.getCell('F4').value = 'Responsibility'
  ws.mergeCells('F4:H4')
  ws.getCell('F5').value = 'CUST'
  ws.getCell('G5').value = '당사'
  ws.getCell('K5').value = 'PLAN'
  ws.mergeCells('K5:L5')
  ws.getCell('M5').value = 'Real'
  ws.mergeCells('M5:N5')
  const h6 = { I: 'Actual work product name \n/ Identifier / Version', J: 'Work product link', K: 'Start', L: 'End', M: 'Start', N: 'End', O: 'In charge of Team', P: 'Status', Q: 'commnet' }
  for (const [col, v] of Object.entries(h6)) ws.getCell(`${col}6`).value = v
  ws.getCell('F7').value = 'R'
  ws.getCell('G7').value = 'A'
  ws.getCell('H7').value = 'S'

  let r = 8
  let partStart = r
  let lastPart = ''
  const flushPart = (end) => {
    if (end > partStart) ws.mergeCells(partStart, 1, end, 1) // Part-clause 병합 (그룹 첫 행에만 값)
  }
  for (const row of diaRows(revision)) {
    if (row.part !== lastPart) {
      if (lastPart) flushPart(r - 1)
      partStart = r
      lastPart = row.part
      ws.getCell(r, 1).value = row.part
    }
    ws.getCell(r, 2).value = `Clause ${row.part}`
    ws.getCell(r, 3).value = row.no
    ws.getCell(r, 4).value = row.wp
    ws.getCell(r, 5).value = '교환 내용 (가짜)'
    ws.getCell(r, 6).value = 'R'
    ws.getCell(r, 7).value = 'S'
    ws.getCell(r, 9).value = row.name || null
    row.dates.forEach((v, i) => {
      const cell = ws.getCell(r, 11 + i)
      if (v instanceof Date) {
        cell.value = v
        cell.numFmt = 'yyyy-mm-dd'
      } else if (v) {
        cell.value = v
      }
    })
    ws.getCell(r, 15).value = row.team || null
    ws.getCell(r, 16).value = '진행중' // Status: 읽지 않는 칸
    ws.getCell(r, 17).value = '코멘트 (읽지 않음)'
    r++
  }
  flushPart(r - 1)
  // 표 바로 아래 메모 행 (No. 없음, Work products 칸에 글) → 건너뜀 + 이유 기록
  ws.getCell(r, 4).value = '※ 일정은 협의에 따라 변경될 수 있음'
  // 떨어진 안내 행 (읽는 칸이 아님) → 무시
  ws.getCell(r + 3, 2).value = '작성 안내: 날짜는 YYYY-MM-DD 형식으로'
  // 빈 행 20줄 넘게 지난 뒤의 행 → 읽으면 안 됨
  ws.getCell(r + 60, 3).value = 99
  ws.getCell(r + 60, 4).value = 'Ghost deliverable (읽으면 안 됨)'
  // 사용 범위를 100만 행 근처까지
  ws.getCell('A1048000').value = ' '

  // 다른 시트 (읽지 않음)
  wb.addWorksheet('Review Plan').getCell('A1').value = 'Work products'
  return wb
}

// ───────────────────────── 그 밖의 파일 ─────────────────────────
function makeXlsVr(fileName) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Verification Report (가짜, 내용은 읽지 않음)']]), 'Sheet1')
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' })
  writeFileSync(join(OUT, fileName), buf)
}

function makeDrm(fileName) {
  const head = Buffer.from('#DRM DocuRay v4 fake header....', 'ascii')
  const body = Buffer.alloc(4096)
  for (let i = 0; i < body.length; i++) body[i] = (i * 31 + 7) % 256
  writeFileSync(join(OUT, fileName), Buffer.concat([head, body]))
}

function makeFakeDoc(fileName) {
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  writeFileSync(join(OUT, fileName), Buffer.concat([ole, Buffer.alloc(2048)]))
}

export async function makeAll() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const started = Date.now()

  await (await makeDia(1)).xlsx.writeFile(join(OUT, `${P}_DIA_R1.xlsx`))
  await (await makeDia(2)).xlsx.writeFile(join(OUT, `${P}_DIA_R2.xlsx`))
  makeXlsVr(`${P}_(TSC) Verification Report_R1.xls`)
  makeXlsVr(`${P}_(FMEA) Verification Report_R1.xls`)
  makeDrm('보안문서_DIA.xlsx')
  makeFakeDoc('옛날양식.doc')
  writeFileSync(join(OUT, '메모.txt'), '그냥 메모 (가짜)')
  // 비슷하지만 다른 이름 (자동 연결 안 되고 후보로 떠야 함), 종류 판별도 안 됨 (기타)
  writeFileSync(join(OUT, `${P}_Safety Plan 초안_R2.docx`), docx([para('Safety Plan 초안 (가짜)', 'Heading1'), table([['항목', '내용'], ['목적', '가짜']])]))

  await makeFsrFiles(OUT)
  await makeTscFiles(OUT)

  console.log(`가짜 문서 생성 완료: ${OUT} (${Date.now() - started}ms)`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await makeAll()
}
