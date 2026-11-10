/** 파일 읽기: 바이트·해시는 앱 본체에서, 내용 해석은 작업 스레드에서 */
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import createImportWorker from './importWorker?nodeWorker'
import type { ParsedDocument, ReadOptions } from '../core/model'
import type { PreviewData } from '../core/rules'
import { emptyReport } from '../core/model'
import type { ReadRequest } from '../shared/ipc'
import { log } from './log'

const TIMEOUT_MS = 120_000
const MAX_SIZE = 300 * 1024 * 1024

type WorkerReply<T> = { ok: true; result: T } | { ok: false; error: string }
type ReadReply = WorkerReply<Omit<ParsedDocument, 'path' | 'hash' | 'size' | 'elapsedMs'>>

function runWorker<T>(job: { mode: 'read' | 'preview'; fileName: string; bytes: Uint8Array; kind?: ReadRequest['kind']; options?: ReadOptions }): Promise<WorkerReply<T>> {
  return new Promise((resolve) => {
    const worker = createImportWorker({ workerData: job })
    const timer = setTimeout(() => {
      void worker.terminate()
      resolve({ ok: false, error: `읽는 데 ${TIMEOUT_MS / 1000}초가 넘게 걸려 멈췄습니다` })
    }, TIMEOUT_MS)
    worker.once('message', (msg: WorkerReply<T>) => {
      clearTimeout(timer)
      void worker.terminate()
      resolve(msg)
    })
    worker.once('error', (err: Error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: err.message })
    })
  })
}

export async function previewFile(path: string): Promise<PreviewData | { error: string }> {
  try {
    const buf = await readFile(path)
    const reply = await runWorker<PreviewData | { error: string }>({ mode: 'preview', fileName: basename(path), bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) })
    return reply.ok ? reply.result : { error: reply.error }
  } catch (error) {
    return { error: `파일을 열 수 없습니다: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function readDocuments(requests: ReadRequest[], options: ReadOptions = {}): Promise<ParsedDocument[]> {
  const out: ParsedDocument[] = []
  for (const req of requests) {
    const fileName = basename(req.path)
    const started = Date.now()
    const base: ParsedDocument = { path: req.path, fileName, size: 0, hash: '', ok: false, detectedKinds: [], version: '', report: emptyReport(), elapsedMs: 0 }
    try {
      const info = await stat(req.path)
      if (info.size > MAX_SIZE) {
        out.push({ ...base, size: info.size, errorKind: 'FAILED', error: '파일이 너무 큽니다 (300MB 초과)' })
        continue
      }
      const buf = await readFile(req.path)
      const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      const hash = createHash('sha256').update(bytes).digest('hex')
      const reply: ReadReply = await runWorker({ mode: 'read', fileName, bytes, kind: req.kind, options })
      const elapsedMs = Date.now() - started
      if (reply.ok) {
        out.push({ ...reply.result, path: req.path, size: info.size, hash, elapsedMs })
        log('info', `read kind=${reply.result.kind ?? '?'} ok=${reply.result.ok} size=${info.size} ms=${elapsedMs} counts=${JSON.stringify(reply.result.report.counts)} warnings=${reply.result.report.warnings.length}`)
      } else {
        out.push({ ...base, size: info.size, hash, errorKind: 'FAILED', error: `읽는 중 오류: ${reply.error}`, elapsedMs })
        log('error', `read failed size=${info.size} ms=${elapsedMs}`)
      }
    } catch (error) {
      out.push({ ...base, errorKind: 'FAILED', error: `파일을 열 수 없습니다: ${error instanceof Error ? error.message : String(error)}` })
      log('error', 'read failed: cannot open file')
    }
  }
  return out
}
