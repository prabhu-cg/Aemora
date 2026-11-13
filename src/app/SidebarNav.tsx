import { NavLink } from 'react-router-dom'
import { Boxes, FolderKanban, Settings, Wand2, type LucideIcon } from 'lucide-react'

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }
const groups: { label: string; items: Item[] }[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/app', label: 'Projects', icon: FolderKanban, end: true },
      { to: '/app/generator', label: 'Dialog Generator', icon: Wand2 },
      { to: '/app/components', label: 'Components', icon: Boxes },
    ],
  },
  { label: 'Preferences', items: [{ to: '/app/settings', label: 'Settings', icon: Settings }] },
]

const item = 'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors'

/**
 * The current page is shown by a quiet wash and weight, never an accent tint:
 * the screen already carries the accent on its primary button.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-2 text-xs font-semibold text-ink-muted">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) => `${item} ${isActive ? 'bg-accent-tint font-semibold text-ink-strong' : 'text-ink-muted hover:bg-sand hover:text-ink-strong'}`}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
