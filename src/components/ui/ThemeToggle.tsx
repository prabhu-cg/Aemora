import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/theme'

export function ThemeToggle() {
  const { pref, setPref } = useTheme()
  const next = pref === 'dark' ? 'light' : 'dark'
  const Icon = pref === 'dark' ? Moon : Sun
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      aria-label={`Theme: ${pref}. Switch to ${next}.`}
      title={`Theme: ${pref}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-sand cursor-pointer"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}
