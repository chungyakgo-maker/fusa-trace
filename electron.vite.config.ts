import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as { version: string }

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    resolve: {
      alias: {
        // 앱에 포함하는 글꼴 (styles.css 의 @font-face)
        '@fonts': resolve(__dirname, 'node_modules/pretendard/dist/web/variable/woff2')
      }
    },
    plugins: [react()]
  }
})
