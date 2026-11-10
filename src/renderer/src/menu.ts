/** 왼쪽 메뉴 (SPEC §9 공통 레이아웃 순서) */

export type PageId = 'trace' | 'schedule' | 'idmap' | 'documents' | 'settings'

export interface MenuItem {
  id: PageId
  label: string
  /** 이 화면에서 무엇을 하게 될지 (준비 중 안내에 표시) */
  summary: string
  /** 이 화면이 만들어지는 마일스톤 (SPEC §13) */
  milestone: string
}

export const MENU: readonly MenuItem[] = [
  {
    id: 'trace',
    label: '추적성',
    summary: 'FSR → TSR → FMEA 근거 → SSR·HSR → 시험까지, 문서에 적힌 연결이 끊긴 곳을 보여 줍니다.',
    milestone: 'M2'
  },
  {
    id: 'schedule',
    label: '산출물 일정',
    summary: 'DIA 기준으로 산출물별 담당, 계획·실적 일정, 작성 여부를 보여 줍니다.',
    milestone: 'M1'
  },
  {
    id: 'idmap',
    label: 'ID 대응표',
    summary: '애매한 연결을 사람이 한 번 고르면, 다음 버전 문서부터 기억해서 자동으로 연결합니다.',
    milestone: 'M2'
  },
  {
    id: 'documents',
    label: '문서 관리',
    summary: '넣은 문서의 목록, 버전 이력, 가져오기 결과를 봅니다.',
    milestone: 'M1'
  },
  {
    id: 'settings',
    label: '설정',
    summary: '마일스톤과 오늘 기준일, 칸 이름 동의어, 처음 보는 양식의 칸 지정을 다룹니다.',
    milestone: 'M1~M5'
  }
]
