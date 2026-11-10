/** 추적성 화면용 계산 */
import type { Project } from '../../core/model'
import { computeSystemTrace, pendingCount } from '../../core/trace'
import { computeSoftwareTrace } from '../../core/software'

/** ID 대응표의 사람이 골라야 하는 건수 (메뉴 옆 숫자): TSC·FMEA·SRS 참조 모두 */
export function pendingReviewCount(p: Project): number {
  return pendingCount([...computeSystemTrace(p).links, ...computeSoftwareTrace(p).links])
}
