import { PageFrame } from './PageFrame'
import { useTheme, type ThemePref } from '../../lib/theme'
import { BackupSection } from '../../features/backup/ui/BackupSection'

const options: { value: ThemePref; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function SettingsPage() {
  const { pref, setPref } = useTheme()
  return (
    <PageFrame title="Settings" lede="Preferences are stored in this browser only. Figma tokens are never stored.">
      <fieldset className="rounded-xl border border-hairline p-5">
        <legend className="px-1 text-[13px] font-bold text-ink-strong">Appearance</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="Theme">
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex h-9 cursor-pointer items-center rounded-full border px-4 font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-text ${
                pref === o.value ? 'border-accent bg-accent-tint text-accent-text' : 'border-hairline-strong text-ink hover:bg-sand'
              }`}
            >
              <input type="radio" name="theme" className="sr-only" checked={pref === o.value} onChange={() => setPref(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <BackupSection />
    </PageFrame>
  )
}
