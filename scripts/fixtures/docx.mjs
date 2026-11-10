// 가짜 워드(.docx) 만들기 도우미 — 표·제목·병합 셀·목차 스타일을 직접 XML로 쓴다
import { strToU8, zipSync } from 'fflate'

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function runs(text) {
  return String(text)
    .split('\n')
    .map((line, i) => `${i > 0 ? '<w:r><w:br/></w:r>' : ''}<w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r>`)
    .join('')
}

/** 문단. style: 스타일 ID */
export function para(text, style) {
  const ppr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
  return `<w:p>${ppr}${runs(text)}</w:p>`
}

/**
 * 표. rows: 행 배열, 칸: 글자 또는 { text, span, vMerge: 'restart' | 'continue' }
 * 칸 글자의 줄바꿈은 문단 여러 개로 쓴다 (실제 워드처럼)
 */
export function table(rows) {
  const trs = rows
    .map((row) => {
      const tcs = row
        .map((cell) => {
          const c = typeof cell === 'string' ? { text: cell } : cell
          const pr = []
          if (c.span && c.span > 1) pr.push(`<w:gridSpan w:val="${c.span}"/>`)
          if (c.vMerge === 'restart') pr.push('<w:vMerge w:val="restart"/>')
          if (c.vMerge === 'continue') pr.push('<w:vMerge/>')
          const tcPr = pr.length ? `<w:tcPr>${pr.join('')}</w:tcPr>` : ''
          const paras = String(c.text ?? '')
            .split('\n')
            .map((t) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`)
            .join('')
          return `<w:tc>${tcPr}${paras || '<w:p/>'}</w:tc>`
        })
        .join('')
      return `<w:tr>${tcs}</w:tr>`
    })
    .join('')
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>${trs}</w:tbl>`
}

/** 그림 자리 (읽으면 안 되는 글상자 글자 포함) */
export function fakeDrawing(n = 1) {
  const blob = 'A'.repeat(64)
  return `<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><w:txbxContent><w:p><w:r><w:t>그림 안 글자 ${n} TSR-CTL-SG001-999</w:t></w:r></w:p></w:txbxContent><pic:blip>${blob}</pic:blip></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

const DEFAULT_STYLES = [
  { id: 'Heading1', name: 'heading 1' },
  { id: 'Heading2', name: 'heading 2' },
  { id: 'Heading3', name: 'heading 3' },
  { id: 'a3', name: '제목 2' },
  { id: 'TOC1', name: 'toc 1' },
  { id: 'TOC2', name: 'toc 2' },
  { id: 'TableGrid', name: 'Table Grid' }
]

/** body: XML 조각 배열 → .docx 바이트 */
export function docx(body, styles = DEFAULT_STYLES) {
  const ns =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body.join('')}<w:sectPr/></w:body></w:document>`
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${styles
    .map((s) => `<w:style w:type="paragraph" w:styleId="${s.id}"><w:name w:val="${esc(s.name)}"/></w:style>`)
    .join('')}</w:styles>`
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rels),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(stylesXml),
    'word/_rels/document.xml.rels': strToU8(docRels)
  })
}
