// 가짜 TSC 워드 (FORMATS §5, §9 TSC) — 실제 문서가 아닌 형태만 같은 가짜 데이터
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { docx, fakeDrawing, para, table } from './docx.mjs'

const P = '[기능안전]_데모'
const pad = (n) => String(n).padStart(3, '0')

const STATUS = ['평가 완료', 'Complete', '설계 진행중', 'Design in progress']
const ALLOC = ['S/W', 'SW', 'H/W', 'HW', 'SW, H/W']
const CLASS = ['입력', '제어', '출력', '통신']

/** TSR 하나: { ref, id, text, cls, asil, alloc, attrs: [[키, 값, vMerge?]] } */
function tsr(spec) {
  return spec
}

/** TSR 표의 행들 */
function tsrRows(t) {
  const rows = [
    ['Ref ID', 'TSR ID', 'Technical Safety Requirements', '분류', 'ASIL', 'Allocation'],
    [t.ref, t.id, t.text, t.cls, t.asil, t.alloc]
  ]
  for (const [k, v, vm] of t.attrs) {
    rows.push([vm ? { text: vm === 'continue' ? '' : k, vMerge: vm } : k, { text: v, span: 5 }])
  }
  return rows
}

function attrsFor(i, opts = {}) {
  const alt = i % 3 === 0
  const a = []
  if (!opts.noElement) a.push([alt ? 'Name of Functional Block' : 'Element', i % 2 ? 'MCU [ELE-009]' : 'General'])
  a.push(['Operating Mode', 'Normal'])
  a.push(['Safe State', opts.safeState ?? 'SS001'])
  if (opts.smMerge) {
    a.push(['Safety Mechanism', 'SM-01', 'restart'])
    a.push(['Safety Mechanism', 'SM-02', 'continue'])
  } else {
    a.push([alt ? 'SM' : 'Safety Mechanism', `SM-${pad(i % 7)}`])
  }
  a.push([alt ? 'FTTI / FTHI' : 'FTTI', '100 ms'])
  a.push([alt ? 'Acceptance criteria' : 'Acceptance criteria', '고장 시 안전 상태 진입 (가짜)'])
  a.push(['Status', opts.status ?? STATUS[i % STATUS.length]])
  return a
}

/** 일반 TSC (R1/R2): TSR 표 40개 이상, 특이점 전부 */
function normalTsrs(revision) {
  const list = []
  // SG001: 001~030 (024 없음)
  for (let i = 1; i <= 30; i++) {
    if (i === 24) continue // 번호 건너뜀
    let ref = `FSR.001.${pad(((i - 1) % 10) + 1)}`
    if (i === 2) ref = 'FSR.001.002, \nFSR.001.006, \nFSR.001.009'
    if (i === 3) ref = 'FSR.001.003 / FSR.001.010'
    if (i === 4) ref = 'FSR.001.004\nFSR.001.005'
    if (i === 29) ref = 'FSR.001.099' // 없는 FSR
    if (i === 30) ref = 'FSR.001.012'
    let alloc = ALLOC[i % ALLOC.length]
    if (i === 5) alloc = 'S/W (CUST)'
    if (i === 6) alloc = 'S/W (CUST))' // 괄호 오타
    if (i === 7) alloc = 'S/W (협력사A)'
    let status
    if (i === 20) status = '미적용'
    if (i === 21) status = '미해당'
    if (i === 22) status = 'N/A'
    const base = {
      ref,
      id: `TSR-CTL-SG001-${pad(i)}`,
      text: `SG1 가짜 기술안전 요구 ${i}: 입력 신호 이상을 감지하면 출력을 차단한다`,
      cls: CLASS[i % CLASS.length],
      asil: i % 5 === 0 ? 'B(D)' : 'B',
      alloc,
      attrs: attrsFor(i, { status, noElement: i % 7 === 0, smMerge: i === 13, safeState: i === 10 ? 'Normal Mode' : i === 11 ? 'S N/A' : undefined })
    }
    list.push(base)
    if (i === 12) list.push({ ...base, text: 'SG1 가짜 요구 12 (내용이 다른 중복)', attrs: attrsFor(i) })
    if (i === 15) {
      list.push({ ...base, text: 'SG1 가짜 요구 15 (중복 2)', attrs: attrsFor(i) })
      list.push({ ...base, text: 'SG1 가짜 요구 15 (중복 3)', attrs: attrsFor(i) })
    }
  }
  // SG002
  const sg2Last = revision >= 2 ? 11 : 10
  for (let j = 1; j <= sg2Last; j++) {
    if (revision >= 2 && j === 10) continue // R2에서 삭제
    let ref = `FSR.002.${pad(Math.min(j, 8))}`
    if (j === 9) ref = 'FSR.006.051'
    if (j === 10) ref = 'FSR.006.052'
    list.push({
      ref,
      id: `TSR-CTL-SG002-${pad(j)}`,
      text: revision >= 2 && j === 1 ? 'SG2 가짜 요구 1 (R2에서 바뀐 문장)' : `SG2 가짜 기술안전 요구 ${j}`,
      cls: CLASS[j % CLASS.length],
      asil: 'A',
      alloc: ALLOC[j % ALLOC.length],
      attrs: attrsFor(j + 100),
      heading: 'ELE-009 (MCU)'
    })
  }
  // 일반 요구
  ;['일반', '공통', '일반'].forEach((cls, k) =>
    list.push({ ref: 'FSR.001.001', id: `TSR-CTL-GEN-${pad(k + 1)}`, text: `일반 가짜 요구 ${k + 1}`, cls, asil: 'QM', alloc: 'SW', attrs: attrsFor(k + 200), heading: 'ELE-009 (MCU)' })
  )
  list.push({ ref: 'FSR.001.001', id: 'TSR-CTL-DOOR-026', text: '도어 기능 가짜 요구', cls: '제어', asil: 'B', alloc: 'SW', attrs: attrsFor(300), heading: 'ELE-009 (MCU)' })
  return list
}

function changeHistory(revision) {
  const rows = [
    ['Date', 'Ver.', 'Editor', 'Chap.', 'Description', 'CR#'],
    ['2026-03-01', 'R0', '홍길동', '전체', '제정', '-'],
    ['2026-04-20', 'R1', '홍길동', '4', '개정', 'CR-001']
  ]
  if (revision >= 2) rows.push(['2026-05-20', 'R2', '홍길동', '4', '개정', 'CR-002'])
  rows.push(['', '', '', '', '', ''])
  return table(rows)
}

function buildNormal(revision) {
  const list = normalTsrs(revision)
  const body = []
  body.push(para('기술안전개념서 (가짜)', 'Heading1'))
  body.push(para('Document Change History'))
  body.push(changeHistory(revision))
  body.push(para('목차', 'Heading1'))
  for (const t of list.slice(0, 10)) body.push(para(`${t.id} ${t.text} ........ 12`, 'TOC2')) // 목차 (무시)
  body.push(para('3. 기능안전 요구사항 (사본)', 'Heading1'))
  body.push(table([['FSR ID', 'Type', 'Allocation', 'FSR', 'SG_ID'], ['FSR.001.001', '자체', 'CTL', '사본 (읽지 않음)', 'SG001']]))
  body.push(para('4. 기술안전 요구사항', 'Heading1'))
  body.push(para('Element 21 [Main MCU]', 'Heading2'))

  let heading = 'Element 21 [Main MCU]'
  for (let k = 0; k < list.length; k++) {
    const t = list[k]
    if (t.heading && t.heading !== heading) {
      heading = t.heading
      body.push(para(t.heading, 'a3')) // '제목 2' 스타일 (한글 이름)
    }
    // 제목 3: 표 문장과 조금 다름 (앞 번호, 오타)
    body.push(para(`4.${k + 1} ${t.id} ${t.text.replace('요구', '요구사항')}`, 'Heading3'))
    if (t.id === 'TSR-CTL-SG001-007') {
      // 한 표에 TSR 2개 (사이 빈 행)
      const next = list[k + 1]
      body.push(table([...tsrRows(t), ['', ''], ...tsrRows(next)]))
      k++
      continue
    }
    const rows = tsrRows(t)
    // 표 마지막 칸에 그림 (글자를 읽으면 안 됨)
    body.push(table(rows).replace('</w:tc></w:tr></w:tbl>', `${fakeDrawing(1)}</w:tc></w:tr></w:tbl>`))
  }
  // TSR ID가 빈 표 → 건너뜀 + 이유
  body.push(table(tsrRows({ ref: 'FSR.001.001', id: '', text: 'ID가 빠진 요구 (가짜)', cls: '제어', asil: 'B', alloc: 'SW', attrs: attrsFor(1) })))
  body.push(para('5. Safety Mechanism', 'Heading1'))
  body.push(table([['SM ID', 'Description', '관련 TSR'], ['SM-01', '가짜 안전 메커니즘', 'TSR-CTL-SG001-001']]))
  body.push(fakeDrawing(2))
  return docx(body)
}

/** 대용량: TSR 표 320개, 본문 XML 약 20MB (그림 자리 포함) */
function buildLarge() {
  const body = [para('기술안전개념서 대용량 (가짜)', 'Heading1'), changeHistory(1), para('Element 1 [MCU]', 'Heading2')]
  const blob = `<w:p><w:r><w:drawing><pic:blip>${'Q'.repeat(60_000)}</pic:blip></w:drawing></w:r></w:p>`
  for (let i = 1; i <= 320; i++) {
    const t = {
      ref: `FSR.001.${pad(((i - 1) % 12) + 1)}`,
      id: `TSR-CTL-SG001-${pad(i)}`,
      text: `대용량 가짜 기술안전 요구 ${i}: ${'입력 신호 범위를 확인하고 이상 시 안전 상태로 전환한다. '.repeat(8)}`,
      cls: CLASS[i % CLASS.length],
      asil: 'B',
      alloc: ALLOC[i % ALLOC.length],
      attrs: attrsFor(i)
    }
    body.push(para(`${t.id}`, 'Heading3'))
    body.push(table(tsrRows(t)))
    body.push(blob)
  }
  return docx(body)
}

export async function makeTscFiles(out) {
  writeFileSync(join(out, `${P}_기술안전개념서(TSC)_R1.docx`), buildNormal(1))
  writeFileSync(join(out, `${P}_기술안전개념서(TSC)_R2.docx`), buildNormal(2))
  writeFileSync(join(out, `${P}_기술안전개념서_대용량(TSC)_R1.docx`), buildLarge())
}
