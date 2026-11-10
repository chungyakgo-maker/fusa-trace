import { describe, expect, it } from 'vitest'
import { P, readFixture } from './helpers'
import { sniffFile } from '../src/core/sniff'

describe('파일 판별 (FORMATS §1, §2)', () => {
  it('DRM 파일 → 읽지 않고 안내', () => {
    const r = readFixture('보안문서_DIA.xlsx')
    expect(r).toMatchObject({ ok: false, errorKind: 'DRM' })
    expect(r.error).toBe('보안(DRM)이 걸린 파일입니다. 보안 해제 후 다시 넣어 주세요.')
  })

  it('zip도 OLE도 아님 → 읽을 수 없는 파일', () => {
    expect(readFixture('메모.txt')).toMatchObject({ ok: false, errorKind: 'UNREADABLE' })
  })

  it('.doc → 미지원 안내', () => {
    const r = readFixture('옛날양식.doc')
    expect(r).toMatchObject({ ok: false, errorKind: 'UNSUPPORTED' })
    expect(r.error).toContain('.docx로 저장')
  })

  it('Verification Report(.xls)는 파일명으로 VR, 내용은 열지 않음', () => {
    const r = readFixture(`${P}_(TSC) Verification Report_R1.xls`)
    expect(r).toMatchObject({ ok: true, kind: 'VR', version: 'R1' })
    expect(r.dia).toBeUndefined()
    expect(r.report.notes.join()).toContain('내용을 열지 않고')
  })

  it('판별 실패 → 사람이 종류를 고름, 고르면 파일 등록', () => {
    const r = readFixture(`${P}_Safety Plan 초안_R2.docx`)
    expect(r).toMatchObject({ ok: true, detectedKinds: [] })
    expect(r.kind).toBeUndefined()
    expect(r.report.notes.join()).toContain('골라 주세요')
    expect(readFixture(`${P}_Safety Plan 초안_R2.docx`, 'OTHER')).toMatchObject({ ok: true, kind: 'OTHER' })
  })

  it('형식 머리 바이트', () => {
    expect(sniffFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('ZIP')
    expect(sniffFile(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('OLE')
    expect(sniffFile(new TextEncoder().encode('xx DocuRay yy'))).toBe('DRM')
    expect(sniffFile(new Uint8Array([1, 2, 3]))).toBe('UNKNOWN')
  })

  it('DIA를 워드로 지정하면 오류 안내', () => {
    expect(readFixture(`${P}_Safety Plan 초안_R2.docx`, 'DIA')).toMatchObject({ ok: false, errorKind: 'FAILED' })
  })
})
