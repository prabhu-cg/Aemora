import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark'
const KEY = 'aemora.theme'

/** Light is the default. An older stored "system" choice is carried over once, as whatever the device prefers. */
export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
    if (v === 'system' && typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch { /* storage unavailable */ }
  return 'light'
}

export function applyTheme(pref: ThemePref) {
  document.documentElement.classList.toggle('dark', pref === 'dark')
}

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  useEffect(() => { applyTheme(pref) }, [pref])
  const setPref = useCallback((p: ThemePref) => {
    try { localStorage.setItem(KEY, p) } catch { /* ignore */ }
    setPrefState(p)
  }, [])
  return { pref, setPref }
}
