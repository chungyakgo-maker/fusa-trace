/**
 * 문서 읽기 작업 스레드. 앱 본체와 분리해서 읽고, 파일 1개마다 새로 띄웠다가 닫는다.
 * → 큰 문서를 읽는 동안 화면이 멈추지 않고, 엑셀 라이브러리의 알려진 약점이 앱 본체에 영향을 주지 못함
 */
import { parentPort, workerData } from 'node:worker_threads'
import type { DocKind } from '../core/model'
import { readDocument } from '../core/importer'

interface Job {
  fileName: string
  bytes: Uint8Array
  kind?: DocKind
}

const job = workerData as Job
try {
  const result = readDocument(job.fileName, job.bytes, job.kind)
  parentPort?.postMessage({ ok: true, result })
} catch (error) {
  parentPort?.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
}
