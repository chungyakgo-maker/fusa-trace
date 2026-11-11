/**
 * 검사 리포트 엑셀 (SPEC 검사 리포트, 핵심 출력): 시트 1 "요약", 시트 2 "지적 목록". 메인 프로세스에서 실행 (ExcelJS)
 * 파일명: <프로젝트>_검사리포트_YYYYMMDD_HHMM.xlsx
 */
import ExcelJS from 'exceljs'
import type { Project } from './model'
import { DOC_KIND_LABEL } from './model'
import { RULES, runChecks, SEVERITIES, type Finding, type Severity } from './check'
import { autoWidth, paint, styleHeader } from './xlsxStyle'

export const SHEET_SUMMARY = '요약'
export const SHEET_FINDINGS = '지적 목록'

/** 심각도 색 (글자도 함께 씀): 오류 주황, 경고 노랑, 참고 회색 */
export const SEVERITY_COLOR: Record<Severity, { fill: string; font: string }> = {
  오류: { fill: 'FFFDEEE3', font: 'FFB4480C' },
  경고: { fill: 'FFFFF4D6', font: 'FF8A6100' },
  참고: { fill: 'FFEEF0F3', font: 'FF3A4150' }
}

const LANDSCAPE = { pageSetup: { orientation: 'landscape' as const, paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } }

export const FINDING_HEADERS = ['No', '심각도', '규칙 ID', '규칙 이름', '고칠 문서', '항목 ID', '관련 항목', '내용', '위치', '근거 조항', '조치'] as const

export function checkReportFileName(projectName: string, at: Date): string {
  const safe = projectName.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim() || '프로젝트'
  const p2 = (n: number): string => String(n).padStart(2, '0')
  return `${safe}_검사리포트_${at.getFullYear()}${p2(at.getMonth() + 1)}${p2(at.getDate())}_${p2(at.getHours())}${p2(at.getMinutes())}.xlsx`
}

/** 지적 목록 시트 (검사 리포트 시트 2, 산출물 작성 리스트 시트 3 공용). 조치 칸은 작성자가 채움 */
export function writeFindingsSheet(ws: ExcelJS.Worksheet, findings: Finding[]): void {
  styleHeader(ws.addRow([...FINDING_HEADERS]))
  findings.forEach((f, i) => {
    const where = [f.fixFile, f.location].filter(Boolean).join(' · ')
    const row = ws.addRow([i + 1, f.severity, f.ruleId, f.ruleName, f.fixDoc, f.itemId || '(문서 전체)', f.related.join(', '), f.message, where, f.clause, ''])
    paint(row.getCell(2), SEVERITY_COLOR[f.severity])
    for (const c of [7, 8, 9]) row.getCell(c).alignment = { wrapText: true, vertical: 'top' }
  })
  if (findings.length === 0) ws.addRow(['', '', '', '', '', '', '', '지적이 없습니다', '', '', ''])
  ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, ws.rowCount), column: FINDING_HEADERS.length } }
  autoWidth(ws, 1, 6, 50)
  ws.getColumn(8).width = 60
  ws.getColumn(9).width = 45
  ws.getColumn(11).width = 24
}

export async function buildCheckReport(p: Project, at: Date, appVersion: string): Promise<ExcelJS.Workbook> {
  const r = runChecks(p)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FuSa Trace'
  wb.created = at

  // ── 시트 1: 요약
  const ss = wb.addWorksheet(SHEET_SUMMARY, LANDSCAPE)
  ss.addRow(['검사 리포트']).font = { bold: true, size: 14 }
  const p2 = (n: number): string => String(n).padStart(2, '0')
  const when = `${at.getFullYear()}-${p2(at.getMonth() + 1)}-${p2(at.getDate())} ${p2(at.getHours())}:${p2(at.getMinutes())}`
  for (const [k, v] of [
    ['프로젝트', p.name],
    ['검사 일시', when],
    ['앱 버전', `v${appVersion}`],
    ['결과', `오류 ${r.counts.오류} · 경고 ${r.counts.경고} · 참고 ${r.counts.참고}`]
  ]) {
    const row = ss.addRow([k, v])
    row.getCell(1).font = { bold: true }
  }
  ss.addRow([])
  ss.addRow(['검사에 쓴 문서']).font = { bold: true }
  styleHeader(ss.addRow(['종류', '파일명', '버전', '등록일']))
  for (const d of r.docs) ss.addRow([DOC_KIND_LABEL[d.kind], d.fileName, d.version || '버전 없음', d.importedAt.slice(0, 10)])
  if (r.docs.length === 0) ss.addRow(['', '등록된 문서가 없습니다'])
  ss.addRow([])
  ss.addRow(['심각도별']).font = { bold: true }
  styleHeader(ss.addRow(['심각도', '건수']))
  for (const s of SEVERITIES) paint(ss.addRow([s, r.counts[s]]).getCell(1), SEVERITY_COLOR[s])
  ss.addRow([])
  ss.addRow(['규칙별']).font = { bold: true }
  styleHeader(ss.addRow(['규칙 ID', '규칙 이름', '심각도', '건수', '근거 조항']))
  for (const rule of RULES) {
    const list = r.findings.filter((f) => f.ruleId === rule.id && f.itemId)
    const skipped = r.findings.some((f) => f.ruleId === rule.id && !f.itemId)
    ss.addRow([rule.id, rule.name, rule.severity, skipped && list.length === 0 ? '검사 생략 (참고)' : list.length, rule.clause])
  }
  ss.addRow([])
  ss.addRow(['문서별 (고칠 문서)']).font = { bold: true }
  styleHeader(ss.addRow(['고칠 문서', '오류', '경고', '참고', '합계']))
  const byDoc = new Map<string, Record<Severity, number>>()
  for (const f of r.findings) {
    const m = byDoc.get(f.fixDoc) ?? { 오류: 0, 경고: 0, 참고: 0 }
    m[f.severity]++
    byDoc.set(f.fixDoc, m)
  }
  for (const [doc, m] of [...byDoc].sort((a, b) => b[1].오류 - a[1].오류 || b[1].경고 - a[1].경고)) ss.addRow([doc, m.오류, m.경고, m.참고, m.오류 + m.경고 + m.참고])
  ss.getColumn(1).width = 18
  ss.getColumn(2).width = 48
  ss.getColumn(3).width = 14
  ss.getColumn(4).width = 16
  ss.getColumn(5).width = 32

  // ── 시트 2: 지적 목록 (정렬: 심각도 → 고칠 문서 → 항목 ID)
  writeFindingsSheet(wb.addWorksheet(SHEET_FINDINGS, LANDSCAPE), r.findings)
  return wb
}

export async function buildCheckReportXlsx(p: Project, at: Date, appVersion: string): Promise<Uint8Array> {
  const wb = await buildCheckReport(p, at, appVersion)
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer)
}
