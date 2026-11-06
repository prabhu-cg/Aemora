import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { PANEL_EXIT_MS, usePresence } from '../../lib/presence'

/**
 * Modal drawer for focused tasks (new project, mobile navigation). Slides in from its edge over a
 * fading backdrop. Escape closes; focus moves in and is restored on close.
 */
export function Drawer({ open, title, onClose, children, side = 'right', size = 'md' }: { open: boolean; title: string; onClose: () => void; children: ReactNode; side?: 'left' | 'right'; /** wide suits a drawer that holds a whole workflow, such as bringing in a design. */ size?: 'md' | 'wide' }) {
  const { mounted, state } = usePresence(open, PANEL_EXIT_MS)
  const ref = useRef<HTMLDivElement>(null)
  // Keep the latest onClose without re-running the focus effect on every parent render.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const root = ref.current
    ;(root?.querySelector<HTMLElement>('input,textarea,select') ?? root?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true })
    const focusables = () => [...(ref.current?.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]') ?? [])].filter((el) => !el.matches(':disabled') && el.tabIndex >= 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeRef.current()
      if (e.key !== 'Tab') return
      // Keep Tab inside the dialog while it is open: first and last controls wrap around.
      const list = focusables()
      if (!list.length) return e.preventDefault()
      const first = list[0], last = list[list.length - 1]
      const active = document.activeElement
      if (!ref.current?.contains(active)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open, mounted])

  if (!mounted) return null
  // Portal to <body>: an animated ancestor would otherwise become the containing block for `fixed`.
  return createPortal(
    <div
      data-state={state}
      inert={!open}
      className={`slide-backdrop fixed inset-0 z-40 flex bg-ink-strong/30 ${side === 'left' ? 'justify-start' : 'justify-end'}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-state={state}
        data-side={side}
        className={`slide-panel h-full w-full overflow-auto bg-surface p-6 shadow-[0_18px_40px_-14px_#10101433] ${side === 'left' ? 'max-w-72 border-r border-hairline-strong' : `${size === 'wide' ? 'max-w-2xl' : 'max-w-md'} border-l border-hairline-strong`}`}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink hover:bg-sand cursor-pointer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
