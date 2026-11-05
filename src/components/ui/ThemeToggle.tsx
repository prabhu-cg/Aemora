import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme, type ThemePref } from '../../lib/theme'

const order: ThemePref[] = ['system', 'light', 'dark']
const icons = { system: Monitor, light: Sun, dark: Moon }

export function ThemeToggle() {
  const { pref, setPref } = useTheme()
  const next = order[(order.indexOf(pref) + 1) % order.length]
  const Icon = icons[pref]
  return (
    <button
      type="button"
      onClick={() => setPref(next)}
      aria-label={`Theme: ${pref}. Switch to ${next}.`}
      title={`Theme: ${pref}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink hover:bg-sand cursor-pointer"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  )
}
