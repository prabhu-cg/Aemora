import { NavLink, Outlet } from 'react-router-dom'
import { Boxes, FolderKanban, Settings, Wand2, type LucideIcon } from 'lucide-react'
import { Logo } from '../components/ui/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'

const nav: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/app', label: 'Projects', icon: FolderKanban, end: true },
  { to: '/app/generator', label: 'Dialog Generator', icon: Wand2 },
  { to: '/app/components', label: 'Components', icon: Boxes },
  { to: '/app/settings', label: 'Settings', icon: Settings },
]

export function AppShell() {
  return (
    <div className="grid h-dvh grid-cols-[56px_1fr] grid-rows-[48px_1fr] lg:grid-cols-[224px_1fr]">
      <header className="col-span-2 flex items-center justify-between border-b border-hairline bg-bg px-4">
        <NavLink to="/" aria-label="Aemora home"><Logo /></NavLink>
        <div className="flex items-center gap-1">
          <span className="mr-2 hidden text-[12px] font-bold text-ink-muted sm:inline">
            AEM Cloud Service · Touch UI dialogs
          </span>
          <ThemeToggle />
        </div>
      </header>
      <nav aria-label="Primary" className="border-r border-hairline bg-sand p-2">
        <ul className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                title={label}
                className={({ isActive }) =>
                  `flex h-9 items-center gap-3 rounded-lg px-2.5 text-[14px] font-semibold transition-colors lg:px-3 ${
                    isActive ? 'bg-accent-tint text-accent-text' : 'text-ink hover:bg-hairline/60'
                  }`
                }
              >
                <Icon size={18} aria-hidden="true" className="shrink-0" />
                <span className="hidden lg:inline">{label}</span>
                <span className="sr-only lg:hidden">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="overflow-auto bg-bg">
        <Outlet />
      </main>
    </div>
  )
}
