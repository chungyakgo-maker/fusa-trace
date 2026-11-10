import { describe, expect, it } from 'vitest'
import { docTokens, fileNameTokens, jaccard, labelTokens, normalizeFileName, versionFromFileName } from '../src/core/filename'

describe('파일명 정규화 (FORMATS §8)', () => {
  it('개정본은 같은 문서', () => {
    expect(normalizeFileName('[기능안전]_<프로젝트>_시스템 FMEA_R1.xlsx')).toBe(normalizeFileName('[기능안전]_<프로젝트>_시스템 FMEA_R2.xlsx'))
  })

  it.each([
    ['Doc_r00.docx'],
    ['Doc_R2.0.docx'],
    ['Doc_v1.5.docx'],
    ['Doc_V1.1.docx'],
    ['Doc_rev00.docx'],
    ['Doc_260424.docx'],
    ['Doc_20260504.docx'],
    ['Doc_0421.docx'],
    ['Doc_eng.docx'],
    ['Doc_KOR.docx'],
    ['Doc_draft.docx'],
    ['Doc_final.docx'],
    ['Doc (1).docx'],
    ['C:\\work\\Doc.docx'],
    ['/home/me/Doc.xlsx']
  ])('버전·날짜·언어·복사본·경로·확장자 무시: %s', (name) => {
    expect(fileNameTokens(name)).toEqual(['doc'])
  })

  it('괄호 안 글자는 토큰으로 남김', () => {
    expect(fileNameTokens('[기능안전]_데모_(TSC) Verification Report_R1.xls')).toEqual(['기능안전', '데모', 'tsc', 'verification', 'report'])
  })

  it('비슷한 이름은 자카드 0.8 이상', () => {
    const a = fileNameTokens('[기능안전]_데모_Safety Plan_R1.docx')
    const b = fileNameTokens('[기능안전]_데모_Safety Plan 초안_R2.docx')
    expect(jaccard(a, b)).toBeGreaterThanOrEqual(0.8)
    expect(normalizeFileName('[기능안전]_데모_Safety Plan_R1.docx')).not.toBe(normalizeFileName('[기능안전]_데모_Safety Plan 초안_R2.docx'))
  })

  it('문서 토큰: 괄호·알려진 토큰·VR', () => {
    expect(docTokens('[기능안전]_데모_(TSC) Verification Report_R1.xls')).toEqual(['TSC', 'VR'])
    expect(docTokens('[기능안전]_데모_시스템 FMEA_R1.xlsx')).toEqual(['FMEA'])
    expect(docTokens('[기능안전]_데모_기술안전개념서(TSC)_R1.docx')).toEqual(['TSC'])
    expect(docTokens('System Requirement Specification Verification Report_R1.xlsx')).toEqual(['VR'])
  })

  it('날짜 줄 라벨 토큰 (공백 변형)', () => {
    expect(labelTokens('TSC VR ')).toEqual(['TSC', 'VR'])
    expect(labelTokens('FTA ')).toEqual(['FTA'])
  })

  it('파일명의 버전 표기', () => {
    expect(versionFromFileName('[기능안전]_데모_DIA_R1.xlsx')).toBe('R1')
    expect(versionFromFileName('SRS_v1.5.docx')).toBe('V1.5')
    expect(versionFromFileName('문서.docx')).toBe('')
  })
})
