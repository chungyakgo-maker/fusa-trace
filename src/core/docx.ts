/**
 * 워드(.docx) 읽기 → 제목과 표만. 작업 스레드에서만 쓴다.
 * - zip 안의 `word/document.xml`을 처음부터 끝까지 한 번 훑으며(스트리밍) 읽음 → 20MB도 DOM 없이 처리
 * - 그림·OLE·글상자(drawing, pict, object, mc:Fallback)는 건너뜀
 * - 표: 가로 병합(gridSpan)은 한 칸, 세로 병합(vMerge)은 위 칸 값을 이어받음 (FORMATS §3.2)
 * - 제목: `word/styles.xml`의 스타일 이름이 `heading N` 또는 `제목 N` (목차 `toc N`은 무시)
 */
import { strFromU8, unzipSync } from 'fflate'
import { SaxesParser, type SaxesTagPlain } from 'saxes'

export interface DocxHeading {
  type: 'heading'
  level: number
  text: string
}

export interface DocxTable {
  type: 'table'
  /** 문서 안 표 순번 (1부터) */
  index: number
  rows: string[][]
}

export type DocxBlock = DocxHeading | DocxTable

export interface DocxDocument {
  blocks: DocxBlock[]
  tableCount: number
}

/** 이 태그 안은 통째로 건너뜀 */
const SKIP_TAGS = new Set(['w:drawing', 'w:pict', 'w:object', 'mc:Fallback', 'w:instrText', 'w:delText', 'w:fldData', 'v:shape'])

export function isDocx(bytes: Uint8Array): boolean {
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
    return 'word/document.xml' in files
  } catch {
    return false
  }
}

export function readDocx(bytes: Uint8Array): DocxDocument {
  const files = unzipSync(bytes, {
    filter: (f) => f.name === 'word/document.xml' || f.name === 'word/styles.xml'
  })
  const docXml = files['word/document.xml']
  if (!docXml) throw new Error('워드 본문(word/document.xml)이 없습니다')
  const styles = files['word/styles.xml'] ? readStyleNames(strFromU8(files['word/styles.xml'])) : new Map<string, string>()
  return parseDocumentXml(strFromU8(docXml), styles)
}

/** 스타일 ID → 이름 (소문자) */
export function readStyleNames(xml: string): Map<string, string> {
  const map = new Map<string, string>()
  const parser = new SaxesParser()
  let currentId: string | undefined
  parser.on('opentag', (node: SaxesTagPlain) => {
    if (node.name === 'w:style') currentId = String(node.attributes['w:styleId'] ?? '')
    else if (node.name === 'w:name' && currentId) map.set(currentId, String(node.attributes['w:val'] ?? '').toLowerCase())
  })
  parser.on('closetag', (node) => {
    if (node.name === 'w:style') currentId = undefined
  })
  parser.write(xml).close()
  return map
}

function headingLevel(styleName: string | undefined): number | undefined {
  if (!styleName) return undefined
  const m = /^(?:heading|제목)\s*(\d)$/.exec(styleName.trim())
  return m ? Number(m[1]) : undefined
}

interface CellBuild {
  paragraphs: string[]
  current: string
  span: number
  vMerge?: 'restart' | 'continue'
}

interface RowBuild {
  cells: { text: string; gridCol: number; span: number; vMerge?: 'restart' | 'continue' }[]
  gridCol: number
}

interface TableBuild {
  rows: string[][]
  /** 세로 병합용: 바로 위 행의 그리드 열 → 글자 */
  prevByGrid: Map<number, string>
  row?: RowBuild
  cell?: CellBuild
}

export function parseDocumentXml(xml: string, styles: Map<string, string>): DocxDocument {
  const parser = new SaxesParser()
  const blocks: DocxBlock[] = []
  const tables: TableBuild[] = []
  let tableCount = 0
  let skipDepth = 0
  // 표 밖 문단 (제목 판단용)
  let paraStyle: string | undefined
  let paraText = ''
  let inPara = false
  let inText = false

  const appendText = (t: string): void => {
    const table = tables[tables.length - 1]
    if (table?.cell) table.cell.current += t
    else if (inPara) paraText += t
  }

  parser.on('opentag', (node: SaxesTagPlain) => {
    const name = node.name
    if (skipDepth > 0) {
      skipDepth++
      return
    }
    if (SKIP_TAGS.has(name)) {
      skipDepth = 1
      return
    }
    const table = tables[tables.length - 1]
    switch (name) {
      case 'w:tbl':
        // 표 안의 표도 따로 모았다가, 닫힐 때 바깥 칸의 글자로 이어 붙인다
        tables.push({ rows: [], prevByGrid: new Map() })
        break
      case 'w:tr':
        if (table) table.row = { cells: [], gridCol: 0 }
        break
      case 'w:tc':
        if (table) table.cell = { paragraphs: [], current: '', span: 1 }
        break
      case 'w:gridSpan':
        if (table?.cell) table.cell.span = Math.max(1, Number(node.attributes['w:val'] ?? 1) || 1)
        break
      case 'w:vMerge':
        if (table?.cell) table.cell.vMerge = node.attributes['w:val'] === 'restart' ? 'restart' : 'continue'
        break
      case 'w:p':
        if (!table) {
          inPara = true
          paraText = ''
          paraStyle = undefined
        }
        break
      case 'w:pStyle':
        if (!table && inPara) paraStyle = String(node.attributes['w:val'] ?? '')
        break
      case 'w:t':
        inText = true
        break
      case 'w:tab':
        appendText(' ')
        break
      case 'w:br':
      case 'w:cr':
        appendText('\n')
        break
      default:
        break
    }
  })

  parser.on('text', (text: string) => {
    if (skipDepth === 0 && inText) appendText(text)
  })

  parser.on('closetag', (node) => {
    const name = node.name
    if (skipDepth > 0) {
      skipDepth--
      return
    }
    const table = tables[tables.length - 1]
    switch (name) {
      case 'w:t':
        inText = false
        break
      case 'w:p':
        if (table?.cell) {
          table.cell.paragraphs.push(table.cell.current)
          table.cell.current = ''
        } else if (!table && inPara) {
          inPara = false
          const level = headingLevel(paraStyle ? styles.get(paraStyle) ?? paraStyle.toLowerCase() : undefined)
          const text = paraText.trim()
          if (level !== undefined && text) blocks.push({ type: 'heading', level, text })
        }
        break
      case 'w:tc':
        if (table?.cell && table.row) {
          const cell = table.cell
          if (cell.current) cell.paragraphs.push(cell.current)
          const text = cell.paragraphs.join('\n').replace(/\n+$/, '').trim()
          table.row.cells.push({ text, gridCol: table.row.gridCol, span: cell.span, vMerge: cell.vMerge })
          table.row.gridCol += cell.span
          table.cell = undefined
        }
        break
      case 'w:tr':
        if (table?.row) {
          const out: string[] = []
          const nextPrev = new Map<number, string>()
          for (const c of table.row.cells) {
            const text = c.vMerge === 'continue' ? table.prevByGrid.get(c.gridCol) ?? '' : c.text
            out.push(text)
            nextPrev.set(c.gridCol, text)
          }
          table.prevByGrid = nextPrev
          table.rows.push(out)
          table.row = undefined
        }
        break
      case 'w:tbl': {
        const done = tables.pop()
        if (!done) break
        const outer = tables[tables.length - 1]
        if (outer?.cell) {
          // 안쪽 표의 글자를 바깥 칸에 붙임
          const flat = done.rows.map((r) => r.filter(Boolean).join(' ')).filter(Boolean).join('\n')
          if (flat) outer.cell.current += (outer.cell.current ? '\n' : '') + flat
        } else {
          tableCount++
          blocks.push({ type: 'table', index: tableCount, rows: done.rows })
        }
        break
      }
      default:
        break
    }
  })

  parser.write(xml).close()
  return { blocks, tableCount }
}
