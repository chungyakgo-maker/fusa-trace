import { describe, expect, it } from 'vitest'
import { asilLevel, extractFsrRefs, extractTsrRefs, normalizeAllocation, normalizeId, normalizeStatus, sgNumber } from '../src/core/ids'

describe('ID 정규화 (FORMATS §7.1)', () => {
  it.each([
    ['ABC_XYZ_TSR_009', 'ABC-XYZ-TSR-009'],
    [' tsr-ctl-sg001-017 ', 'TSR-CTL-SG001-017'],
    ['TSR  017', 'TSR-017'],
    ['TSR--017,', 'TSR-017'],
    ['ＴＳＲ－０１７', 'TSR-017'],
    ['FSR.001.009.', 'FSR.001.009'],
    ['FSR.001.009)', 'FSR.001.009']
  ])('%s → %s', (raw, norm) => expect(normalizeId(raw)).toBe(norm))
})

describe('참조 문자열에서 ID 뽑기 (FORMATS §7.2)', () => {
  it.each([
    ['FSR.001.009 / FSR.001.010', ['FSR.001.009', 'FSR.001.010']],
    ['FSR.001.002, \nFSR.001.006, \nFSR.001.029', ['FSR.001.002', 'FSR.001.006', 'FSR.001.029']],
    ['XXXCTLSR110\nXXXCTLSR210\nYYYCTLSR810', ['XXXCTLSR110', 'XXXCTLSR210', 'YYYCTLSR810']],
    ['', []]
  ])('FSR: %j', (cell, ids) => expect(extractFsrRefs(cell)).toEqual(ids))

  it.each([
    ['Yes (TSR-017, TSR-037)', ['TSR-017', 'TSR-037']],
    ['Yes(TSR-017, TSR-018)', ['TSR-017', 'TSR-018']],
    ['Yes', []],
    ['No', []],
    ['-', []],
    ['\nABC_XYZ_TSR_009\nABC_XYZ_TSR_010', ['ABC_XYZ_TSR_009', 'ABC_XYZ_TSR_010']],
    ['TSR 017', ['TSR-017']],
    ['TSR_017', ['TSR_017']],
    ['TSR-CTL-SG001-017', ['TSR-CTL-SG001-017']]
  ])('TSR: %j', (cell, ids) => expect(extractTsrRefs(cell)).toEqual(ids))
})

describe('할당·상태·ASIL 정리 (FORMATS §5.2)', () => {
  it.each([
    ['H/W', 'HW', ''],
    ['HW', 'HW', ''],
    ['S/W', 'SW', ''],
    ['SW', 'SW', ''],
    ['SW, H/W', 'BOTH', ''],
    ['S/W (CUST)', 'SW', 'CUST'],
    ['S/W (CUST))', 'SW', 'CUST'],
    ['S/W (협력사A)', 'SW', '협력사A'],
    ['General', 'GENERAL', ''],
    ['ECU-X', 'OTHER', ''],
    ['', 'UNKNOWN', '']
  ])('할당 %j → %s', (raw, allocation, note) => expect(normalizeAllocation(raw)).toEqual({ allocation, note }))

  it.each([
    ['평가 완료', 'done'],
    ['Complete', 'done'],
    ['설계 진행중', 'inProgress'],
    ['Design in progress', 'inProgress'],
    ['미적용', 'notApplicable'],
    ['미해당', 'notApplicable'],
    ['N/A', 'notApplicable'],
    ['', 'unknown'],
    ['검토중?', 'unknown']
  ])('상태 %j → %s', (raw, s) => expect(normalizeStatus(raw)).toBe(s))

  it('ASIL 앞 글자, SG 번호', () => {
    expect(asilLevel('B(D)')).toBe('B')
    expect(asilLevel('QM')).toBe('QM')
    expect(asilLevel('')).toBe('')
    expect(sgNumber('SG001')).toBe(1)
    expect(sgNumber('SG_01')).toBe(1)
    expect(sgNumber('TSR-CTL-SG002-017')).toBe(2)
    expect(sgNumber('TSR-017')).toBeUndefined()
  })
})
