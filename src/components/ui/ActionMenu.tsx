import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { EllipsisVertical } from 'lucide-react'

export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }

/**
 * A vertical "more actions" button with a menu. The list is fixed to the viewport (so a row never clips it)
 * but stays in place in the DOM, inside the page's landmark. Arrow keys move, Home/End jump, Escape closes and returns focus to the button.
 */
export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = (returnFocus = true) => { setOpen(false); if (returnFocus) trigger.current?.focus({ preventScroll: true }) }
  const enabled = () => [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])]

  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const right = Math.max(8, window.innerWidth - r.right)
    // Open upward when there is not room below for roughly a four-item menu.
    setPos(window.innerHeight - r.bottom < 220 && r.top > 220 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right })
  }, [open])

  useEffect(() => {
    if (!open || !pos) return
    enabled()[0]?.focus({ preventScroll: true })
    const away = (e: Event) => { if (!list.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false) }
    const dismiss = () => setOpen(false)
    document.addEventListener('pointerdown', away)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true) }
  }, [open, pos])

  const onKey = (e: KeyboardEvent) => {
    const els = enabled()
    const i = els.indexOf(document.activeElement as HTMLElement)
    const go = (j: number) => { e.preventDefault(); els[(j + els.length) % els.length]?.focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(els.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') close(false)
  }

  return (
    <>
      <button
        ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-muted hover:bg-sand hover:text-ink-strong aria-expanded:bg-sand aria-expanded:text-ink-strong"
      >
        <EllipsisVertical size={18} aria-hidden="true" />
      </button>
      {open && pos && (
        <div
          ref={list} id={id} role="menu" aria-label={label} onKeyDown={onKey}
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="menu-pop z-50 min-w-48 rounded-xl border border-hairline-strong bg-surface p-1 shadow-[0_14px_32px_-12px_#10101440]"
        >
          {items.map((it) => (
            <button
              key={it.label} type="button" role="menuitem" tabIndex={-1} disabled={it.disabled}
              onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); it.onSelect() }}
              className={`flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-full px-3 text-left text-[14px] font-semibold focus:outline-none focus-visible:bg-sand disabled:cursor-not-allowed disabled:opacity-50 ${it.danger ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft' : 'text-ink-strong hover:bg-sand'}`}
            >
              <span className="shrink-0 text-ink-muted" aria-hidden="true">{it.icon}</span>{it.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
