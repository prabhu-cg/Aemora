import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Non-modal right-hand panel for contextual configuration. The page behind stays usable
 * (you can pick another row, reorder, scroll). Escape closes it from inside.
 */
export function SidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input,textarea,select')?.focus({ preventScroll: true })
    // Lets the page make room for the panel instead of sitting under it (see index.css).
    document.body.setAttribute('data-side-panel', 'open')
    return () => document.body.removeAttribute('data-side-panel')
  }, [])
  // Portal to <body>: an animated ancestor would otherwise become the containing block for `fixed`.
  return createPortal(
    <aside
      ref={ref}
      role="complementary"
      aria-label={title}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[26rem] flex-col border-l border-hairline-strong bg-surface shadow-[0_18px_40px_-14px_#10101433]"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <h2 className="text-base">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-lg p-1.5 text-ink hover:bg-sand cursor-pointer">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </aside>,
    document.body,
  )
}
