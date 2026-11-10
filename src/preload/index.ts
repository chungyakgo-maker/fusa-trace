import { contextBridge } from 'electron'

// 화면(renderer)에 넘겨 주는 기능. M0에서는 실행 환경 정보만 넘긴다.
// 파일 열기·저장 같은 기능은 M1부터 여기에 추가한다.
const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? ''
  }
}

export type FusaApi = typeof api

contextBridge.exposeInMainWorld('fusa', api)
