import type { ReactElement } from 'react'
import type { Project } from '../../core/model'
import { EmptyState } from './ui'

export function TracePage(_props: { project: Project; onImport: () => void; onGoIdMap: () => void }): ReactElement {
  return <EmptyState title="추적성 화면은 M2에서 만들어집니다">FSR → TSR 연결, 누락·확인 필요 항목을 보여 줍니다.</EmptyState>
}
