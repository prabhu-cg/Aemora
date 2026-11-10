import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

/**
 * A modal question with two answers, for actions that cannot be undone. Cancel has the focus when it opens,
 * so Enter never deletes by accident. Escape or a click outside cancels. Tab stays inside, and focus goes back
 * to where it was when the dialog closes.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel }: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelRef = useRef(onCancel)
  useEffect(() => { cancelRef.current = onCancel })

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); return cancelRef.current() }
      if (e.key !== 'Tab') return
      const list = [...(ref.current?.querySelectorAll<HTMLElement>('button') ?? [])].filter((el) => !el.matches(':disabled'))
      if (!list.length) return e.preventDefault()
      const first = list[0], last = list[list.length - 1], active = document.activeElement
      if (!ref.current?.contains(active)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.() }
  }, [open])

  if (!open) return null
  // Portal to <body>, so no animated ancestor can trap the fixed backdrop.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-strong/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div ref={ref} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body" className="w-full max-w-md rounded-xl border border-hairline-strong bg-surface p-6 shadow-[0_18px_40px_-14px_#10101466]">
        <h2 id="confirm-title" className="text-lg">{title}</h2>
        <div id="confirm-body" className="mt-2 text-[14px] text-ink">{children}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" data-autofocus onClick={onCancel}>{cancelLabel}</Button>
          <Button className="!border-danger !bg-danger !text-surface hover:!opacity-90" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
