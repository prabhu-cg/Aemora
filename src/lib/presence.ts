import { useEffect, useState } from 'react'

/**
 * Keeps an element mounted while it animates out. `state` flips to "open" one frame
 * after mounting, so a CSS transition has a closed starting point to run from.
 * Reopening mid-exit just reverses the transition from where it is.
 */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; state: 'open' | 'closed' } {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      let inner = 0
      const outer = requestAnimationFrame(() => {
        setMounted(true)
        inner = requestAnimationFrame(() => setShown(true))
      })
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner) }
    }
    // Reopening before this fires cancels it, and the transition simply reverses.
    const t = setTimeout(() => { setMounted(false); setShown(false) }, exitMs)
    return () => clearTimeout(t)
  }, [open, exitMs])

  return { mounted: open || mounted, state: open && shown ? 'open' : 'closed' }
}

export const PANEL_EXIT_MS = 260 // a little longer than the 220ms slide, so the panel is fully off-screen before it unmounts
