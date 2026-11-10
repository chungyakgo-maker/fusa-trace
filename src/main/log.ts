/**
 * 앱 로그: 내 PC의 파일에만 (SPEC §11). 문서 내용·파일명은 쓰지 않는다 (종류·개수·시간만).
 * 위치: %APPDATA%/FuSaTrace/logs/app.log (1MB 넘으면 app.old.log로 바꿈)
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

let logFile = ''

export function initLog(dataDir: string): string {
  const dir = join(dataDir, 'logs')
  mkdirSync(dir, { recursive: true })
  logFile = join(dir, 'app.log')
  return logFile
}

export function log(level: 'info' | 'warn' | 'error', message: string): void {
  if (!logFile) return
  try {
    if (existsSync(logFile) && statSync(logFile).size > 1_000_000) renameSync(logFile, logFile.replace(/app\.log$/, 'app.old.log'))
    appendFileSync(logFile, `${new Date().toISOString()} [${level}] ${message}\n`, 'utf-8')
  } catch {
    // 로그 실패로 앱이 멈추면 안 됨
  }
}
