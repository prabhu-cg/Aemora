import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { Logo } from '../components/ui/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { Drawer } from '../components/ui/Drawer'
import { Frame } from '../components/ui/Frame'
import { SidebarNav } from './SidebarNav'
import { maybeAutoSnapshot } from '../features/backup/service'

export function AppShell() {
  const [menu, setMenu] = useState(false)
  // A quiet automatic restore point, at most every few hours and only when something changed.
  useEffect(() => { void maybeAutoSnapshot().catch(() => undefined) }, [])
  return (
    <div className="min-h-dvh bg-bg">
      <a href="#main-content" className="sr-only z-50 rounded-full bg-bg px-4 py-2 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:outline-2 focus:outline-accent-text">
        Skip to main content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link to="/" aria-label="Aemora home" className="rounded-lg"><Logo tagline /></Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4"><SidebarNav /></div>
        <div className="flex items-center justify-between gap-1 border-t border-sidebar-border p-3">
          <span className="px-2 text-xs text-ink-muted">Stored in this browser</span>
          <ThemeToggle />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-bg/92 px-4 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setMenu(true)} aria-label="Open navigation" className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-sand">
          <Menu size={18} aria-hidden="true" />
        </button>
        <Link to="/" aria-label="Aemora home" className="rounded-lg"><Logo markClassName="size-7" /></Link>
        <ThemeToggle />
      </header>
      <Drawer open={menu} title="Navigation" side="left" onClose={() => setMenu(false)}>
        <SidebarNav onNavigate={() => setMenu(false)} />
      </Drawer>

      <main id="main-content" tabIndex={-1} className="outline-none lg:pl-72">
        <Frame className="pb-16">
          <Outlet />
        </Frame>
      </main>
    </div>
  )
}
