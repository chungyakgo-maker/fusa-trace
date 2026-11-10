/// <reference types="vite/client" />

/** package.json의 version (빌드할 때 electron.vite.config.ts에서 넣음) */
declare const __APP_VERSION__: string

/** src/preload/index.ts에서 넘겨 주는 기능 */
interface FusaApi {
  platform: string
  versions: { electron: string; chrome: string }
}

interface Window {
  fusa: FusaApi
}
