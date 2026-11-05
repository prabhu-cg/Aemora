import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'aemora.theme'

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* storage unavailable */ }
  return 'system'
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): 'light' | 'dark' {
  return pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref
}

export function applyTheme(pref: ThemePref) {
  const prefersDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', resolveTheme(pref, prefersDark) === 'dark')
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  useEffect(() => { applyTheme(pref) }, [pref])
  useEffect(() => {
    if (pref !== 'system' || typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [pref])
  const setPref = useCallback((p: ThemePref) => {
    try { localStorage.setItem(KEY, p) } catch { /* ignore */ }
    setPrefState(p)
  }, [])
  return { pref, setPref }
}
