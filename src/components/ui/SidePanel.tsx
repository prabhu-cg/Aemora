import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { PANEL_EXIT_MS, usePresence } from '../../lib/presence'

/**
 * Non-modal right-hand panel for contextual configuration. It slides in from the right and
 * out again; the page behind stays usable (pick another row, reorder, scroll). Escape closes it.
 * Keep it mounted and toggle `open` so the exit can play.
 */
export function SidePanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { mounted, state } = usePresence(open, PANEL_EXIT_MS)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    // Lets the page make room for the panel instead of sitting under it (see index.css).
    // Tied to the panel's own open state so the page and the panel start moving on the same frame.
    if (state === 'open') document.body.setAttribute('data-side-panel', 'open')
    return () => document.body.removeAttribute('data-side-panel')
  }, [state])

  // When the panel closes, put keyboard focus back on whatever opened it (a row), if focus was in the panel or lost.
  // The opener is noted in a layout effect, before the form inside moves focus into the panel. It is restored in a
  // normal effect, after React has finished its own update: React puts focus back on the previously focused field
  // at the end of an update, which would undo a focus change made earlier.
  const opener = useRef<Element | null>(null)
  useLayoutEffect(() => { if (open) opener.current = document.activeElement }, [open])
  useEffect(() => {
    if (open) return
    const o = opener.current
    opener.current = null
    const a = document.activeElement
    if (o instanceof HTMLElement && o.isConnected && (a === document.body || ref.current?.contains(a))) o.focus({ preventScroll: true })
  }, [open])

  if (!mounted) return null
  // Portal to <body>: an animated ancestor would otherwise become the containing block for `fixed`.
  return createPortal(
    <aside
      ref={ref}
      role="complementary"
      aria-label={title}
      data-state={state}
      inert={!open}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      className="slide-panel fixed inset-y-0 right-0 z-30 flex w-full max-w-[26rem] flex-col border-l border-hairline-strong bg-surface shadow-[0_18px_40px_-14px_#10101433]"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <h2 className="text-base">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-full p-1.5 text-ink hover:bg-sand cursor-pointer">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </aside>,
    document.body,
  )
}
