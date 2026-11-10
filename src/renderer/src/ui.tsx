/** 공통 화면 부품: 대화상자, 알림, 상태 표시, 접었다 펴기 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type { ScheduleStatus } from '../../core/schedule'
import { AlertIcon, CheckIcon, ChevronIcon, CircleIcon, HelpIcon, MinusCircleIcon, PlayIcon, XIcon } from './icons'

// ───────── 대화상자 (Esc로 닫힘, 포커스 가둠: 브라우저 기본 <dialog>)
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): ReactElement {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => d?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <header className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>
          <XIcon />
        </button>
      </header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </dialog>
  )
}

// ───────── 알림 (화면 아래쪽)
export interface Toast {
  id: number
  kind: 'ok' | 'error' | 'info'
  text: string
  action?: { label: string; run: () => void }
}

interface ToastApi {
  show(kind: Toast['kind'], text: string, action?: Toast['action']): void
}

const ToastContext = createContext<ToastApi>({ show: () => undefined })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((kind: Toast['kind'], text: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, text, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 12_000 : 6_000)
  }, [])
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'error' ? <AlertIcon /> : <CheckIcon />}
            <span>{t.text}</span>
            {t.action && (
              <button type="button" className="link-btn" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ───────── 상태 표시 (색 + 아이콘 + 글자)
const SCHEDULE_ICON: Record<ScheduleStatus, ReactElement> = {
  완료: <CheckIcon />,
  진행: <PlayIcon />,
  지연: <AlertIcon />,
  미착수: <CircleIcon />
}
const SCHEDULE_CLASS: Record<ScheduleStatus, string> = { 완료: 'done', 진행: 'progress', 지연: 'delayed', 미착수: 'todo' }

export function ScheduleBadge({ status }: { status: ScheduleStatus }): ReactElement {
  return (
    <span className={`badge badge-${SCHEDULE_CLASS[status]}`}>
      {SCHEDULE_ICON[status]}
      {status}
    </span>
  )
}

export type TraceStatusName = '연결됨' | '확인 필요' | '누락' | '대상 아님' | '문서 대기'
const TRACE_ICON: Record<TraceStatusName, ReactElement> = {
  연결됨: <CheckIcon />,
  '확인 필요': <HelpIcon />,
  누락: <AlertIcon />,
  '대상 아님': <MinusCircleIcon />,
  '문서 대기': <CircleIcon />
}
const TRACE_CLASS: Record<TraceStatusName, string> = { 연결됨: 'done', '확인 필요': 'check', 누락: 'delayed', '대상 아님': 'muted', '문서 대기': 'todo' }

export function TraceBadge({ status, text }: { status: TraceStatusName; text?: string }): ReactElement {
  return (
    <span className={`badge badge-${TRACE_CLASS[status]}`}>
      {TRACE_ICON[status]}
      {text ?? status}
    </span>
  )
}

// ───────── 접었다 펴기
export function Disclosure({ summary, children, defaultOpen = false, tone }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean; tone?: 'warn' }): ReactElement {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`disclosure${tone ? ` disclosure-${tone}` : ''}`}>
      <button type="button" className="disclosure-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronIcon open={open} />
        {summary}
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }): ReactElement {
  return (
    <section className="placeholder" aria-label={title}>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </section>
  )
}

export function formatDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : '-'
}
