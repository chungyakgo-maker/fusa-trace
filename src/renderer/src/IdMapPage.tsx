import type { ReactElement } from 'react'
import type { Project } from '../../core/model'
import { EmptyState } from './ui'

export function IdMapPage(_props: { project: Project; onChange: (p: Project) => void }): ReactElement {
  return <EmptyState title="ID 대응표는 M2에서 만들어집니다">애매한 연결을 한 번 고르면 다음 버전 문서부터 기억합니다.</EmptyState>
}
